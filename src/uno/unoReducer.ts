/**
 * Pure state transitions for UNO. The reducer never touches timers, the DOM, or
 * randomness — it only *applies* already-resolved outcomes (a `UnoTurnResolution`
 * computed by `rules.ts` on the acting client). All async orchestration lives in
 * the `useUno` hook, keeping this fully deterministic and trivial to test.
 * Mirrors `src/ludo/ludoReducer.ts`.
 *
 * The four resolution kinds (`play` / `draw` / `challenge` / `callout`) all commit
 * through `COMMIT_TURN`, each bumping `turnCount` — the online sync sequence. The
 * deck is rebuilt identically on every client from `deckSeed` (+ `reshuffleCount`),
 * so replaying public resolutions keeps every hidden hand in lock-step.
 */
import { DEFAULT_UNO_RULES, HAND_SIZE, UNO_COLORS } from './config'
import { deal, reshuffleDiscard, shuffle } from './deck'
import { resolvePlay, scoreHand, step } from './rules'
import type {
  BotLevel,
  UnoCard,
  UnoColor,
  UnoGameState,
  UnoPlayer,
  UnoRules,
  UnoTurnResolution,
} from './types'

export interface PlayerSetup {
  name: string
  color: string
  isBot?: boolean
  botLevel?: BotLevel
}

/** A seated player in a running-match snapshot (adds the live hand + uno flag). */
export interface PlayerSnapshot extends PlayerSetup {
  hand: UnoCard[]
  saidUno: boolean
  score: number
}

export type UnoAction =
  | { type: 'START_ROUND'; players: PlayerSetup[]; rules?: UnoRules; deckSeed: number }
  | { type: 'ADD_PLAYER'; player: PlayerSetup }
  | {
      type: 'LOAD_SNAPSHOT'
      players: PlayerSnapshot[]
      rules: UnoRules
      currentPlayerIndex: number
      stock: UnoCard[]
      discard: UnoCard[]
      activeColor: UnoColor
      direction: 1 | -1
      pendingDraw: number
      pendingDrawType: 'draw2' | 'wild4' | null
      reshuffleCount: number
      deckSeed: number
      roundNumber: number
      /** True when the snapshot was taken at a round-end host decision. */
      awaitingDecision: boolean
      /** True when the match in the snapshot is already over. */
      ended: boolean
      turnCount: number
    }
  // Local animation beats (mirror Ludo's BEGIN_ROLL/BEGIN_SELECT/BEGIN_MOVE).
  | { type: 'BEGIN_PLAY' }
  | { type: 'BEGIN_DRAW' }
  // Local-only: a wild color / seven target / WD4-challenge prompt is open.
  | { type: 'BEGIN_CHOOSE' }
  // Apply a play / draw / challenge / callout resolution.
  | { type: 'COMMIT_TURN'; resolution: UnoTurnResolution }
  // The current player left the room: hand the turn on (kept seq-aligned).
  | { type: 'SKIP_TURN' }
  // Host's call at a round end (score mode): deal the next round, or stop here.
  | { type: 'CONTINUE_MATCH'; deckSeed: number }
  | { type: 'END_MATCH' }
  | { type: 'FORFEIT_WIN'; winnerId: number }
  // Local pass-and-play undo: replace the whole state with a history entry.
  | { type: 'RESTORE'; state: UnoGameState }
  | { type: 'RESET' }

export const initialUnoState: UnoGameState = {
  phase: 'setup',
  players: [],
  hands: [],
  stock: [],
  discard: [],
  activeColor: 'red',
  direction: 1,
  currentPlayerIndex: 0,
  pendingDraw: 0,
  pendingDrawType: null,
  wild4Challenge: null,
  reshuffleCount: 0,
  deckSeed: 0,
  saidUno: [],
  scores: [],
  roundNumber: 1,
  finishedOrder: [],
  winnerId: null,
  winReason: null,
  turnCount: 0,
  rules: { ...DEFAULT_UNO_RULES },
}

// ---- Round dealing --------------------------------------------------------

/** The start card's effect on the very first turn (official handling). */
function applyStartCard(
  startCard: UnoCard,
  playerCount: number,
  deckSeed: number,
): {
  activeColor: UnoColor
  direction: 1 | -1
  currentPlayerIndex: number
  pendingDraw: number
  pendingDrawType: 'draw2' | 'wild4' | null
} {
  // A plain Wild start: official rules let the first player choose; we pick a
  // seed-derived color deterministically so no pre-game prompt is needed and
  // every client agrees. (A Wild-Draw-Four can never start — `deal` buries it.)
  const baseColor: UnoColor = startCard.color ?? UNO_COLORS[Math.abs(deckSeed) % UNO_COLORS.length]
  let direction: 1 | -1 = 1
  let currentPlayerIndex = 0
  let pendingDraw = 0
  let pendingDrawType: 'draw2' | 'wild4' | null = null

  switch (startCard.value) {
    case 'skip':
      currentPlayerIndex = step(0, 1, playerCount, 1)
      break
    case 'reverse':
      direction = -1
      currentPlayerIndex = step(0, -1, playerCount, 1)
      break
    case 'draw2':
      // The first player faces the penalty (draws, or stacks if allowed).
      pendingDraw = 2
      pendingDrawType = 'draw2'
      break
  }
  return { activeColor: baseColor, direction, currentPlayerIndex, pendingDraw, pendingDrawType }
}

/** Build a fresh round from a seed, preserving cumulative scores. */
function dealRound(
  players: UnoPlayer[],
  rules: UnoRules,
  deckSeed: number,
  scores: number[],
  roundNumber: number,
): UnoGameState {
  const { hands, stock, startCard } = deal(shuffle(deckSeed), players.length)
  const start = applyStartCard(startCard, players.length, deckSeed)
  return {
    phase: 'idle',
    players,
    hands,
    stock,
    discard: [startCard],
    activeColor: start.activeColor,
    direction: start.direction,
    currentPlayerIndex: start.currentPlayerIndex,
    pendingDraw: start.pendingDraw,
    pendingDrawType: start.pendingDrawType,
    wild4Challenge: null,
    reshuffleCount: 0,
    deckSeed,
    saidUno: players.map(() => false),
    scores,
    roundNumber,
    finishedOrder: [],
    winnerId: null,
    winReason: null,
    turnCount: 0,
    rules,
  }
}

// ---- Drawing (with deterministic reshuffle) -------------------------------

/** Pull `n` cards off the stock, reshuffling the discard into it when empty. */
function drawCards(
  stock: readonly UnoCard[],
  discard: readonly UnoCard[],
  reshuffleCount: number,
  n: number,
): { drawn: UnoCard[]; stock: UnoCard[]; discard: UnoCard[]; reshuffleCount: number } {
  let s = [...stock]
  let d = [...discard]
  let rc = reshuffleCount
  const drawn: UnoCard[] = []
  for (let i = 0; i < n; i++) {
    if (s.length === 0) {
      const rebuilt = reshuffleDiscard(d, rc + 1)
      s = rebuilt.stock
      d = rebuilt.discard
      rc += 1
      if (s.length === 0) break // degenerate: nothing left anywhere
    }
    drawn.push(s.pop()!)
  }
  return { drawn, stock: s, discard: d, reshuffleCount: rc }
}

// ---- Applying resolutions -------------------------------------------------

type PlayResolution = Extract<UnoTurnResolution, { kind: 'play' }>

/** Apply a `play` resolution, returning the next state (turnCount unchanged). */
function applyPlay(state: UnoGameState, res: PlayResolution): UnoGameState {
  const seat = res.seat
  const n = state.players.length
  const card = res.cards[0]
  const priorColor = state.activeColor

  const hands = state.hands.map((h) => [...h])
  // Remove the played cards (by id) from the acting seat.
  const playedIds = new Set(res.cards.map((c) => c.id))
  hands[seat] = hands[seat].filter((c) => !playedIds.has(c.id))
  const discard = [...state.discard, ...res.cards]

  const activeColor: UnoColor = card.color == null ? (res.chosenColor ?? priorColor) : card.color
  const direction: 1 | -1 = res.effect.reversed ? ((state.direction * -1) as 1 | -1) : state.direction

  let pendingDraw = 0
  let pendingDrawType: 'draw2' | 'wild4' | null = null
  if (res.effect.penaltyDraw) {
    pendingDraw = res.effect.penaltyDraw.count
    pendingDrawType = card.value === 'draw2' ? 'draw2' : 'wild4'
  }
  const wild4Challenge = card.value === 'wild4' ? { by: seat, priorColor } : null

  // Seven-Zero hand permutations (post-removal).
  if (res.effect.sevenSwapTarget != null) {
    const t = res.effect.sevenSwapTarget
    const tmp = hands[seat]
    hands[seat] = hands[t]
    hands[t] = tmp
  }
  if (res.effect.zeroRotate) {
    const against = (direction * -1) as 1 | -1
    const snapshot = hands.map((h) => h)
    for (let j = 0; j < n; j++) hands[j] = snapshot[step(j, against, n, 1)]
  }

  // UNO declarations: clear for any seat not on exactly one card; the acting
  // seat's flag follows its declaration; seats whose hand changed via a
  // swap/rotate can be caught (they didn't declare for their new hand).
  const saidUno = state.saidUno.map((v, j) => (hands[j].length === 1 ? v : false))
  if (res.effect.sevenSwapTarget != null) saidUno[res.effect.sevenSwapTarget] = false
  if (res.effect.zeroRotate) for (let j = 0; j < n; j++) if (j !== seat) saidUno[j] = false
  saidUno[seat] = hands[seat].length === 1 ? res.declaredUno === true : false

  if (res.effect.isRoundWin) {
    const points = hands.reduce((sum, h, j) => (j === seat ? sum : sum + scoreHand(h)), 0)
    const scores = state.scores.map((v, j) => (j === seat ? v + points : v))
    const reachedTarget = state.rules.winMode === 'score' && scores[seat] >= state.rules.targetScore
    const matchOver = state.rules.winMode === 'single' || reachedTarget
    return {
      ...state,
      hands,
      discard,
      activeColor,
      direction,
      pendingDraw: 0,
      pendingDrawType: null,
      wild4Challenge: null,
      saidUno,
      scores,
      phase: matchOver ? 'matchEnd' : 'roundEnd',
      currentPlayerIndex: seat,
      winnerId: matchOver ? seat : null,
      winReason: matchOver ? 'empty' : null,
    }
  }

  return {
    ...state,
    hands,
    discard,
    activeColor,
    direction,
    pendingDraw,
    pendingDrawType,
    wild4Challenge,
    saidUno,
    phase: 'idle',
    currentPlayerIndex: res.effect.nextIndex,
  }
}

/** Apply a `draw` resolution (penalty or voluntary, with optional `thenPlay`). */
function applyDraw(state: UnoGameState, res: Extract<UnoTurnResolution, { kind: 'draw' }>): UnoGameState {
  const seat = res.seat
  const n = state.players.length
  const pulled = drawCards(state.stock, state.discard, state.reshuffleCount, res.count)
  const hands = state.hands.map((h) => [...h])
  hands[seat] = [...hands[seat], ...pulled.drawn]
  const saidUno = state.saidUno.map((v, j) => (hands[j].length === 1 ? v : false))
  saidUno[seat] = false // a hand that just grew is never "on UNO"

  const base: UnoGameState = {
    ...state,
    hands,
    stock: pulled.stock,
    discard: pulled.discard,
    reshuffleCount: pulled.reshuffleCount,
    saidUno,
    wild4Challenge: null,
  }

  if (state.pendingDraw > 0) {
    // Forced penalty: draw the stack and forfeit the turn.
    return {
      ...base,
      pendingDraw: 0,
      pendingDrawType: null,
      phase: 'idle',
      currentPlayerIndex: step(seat, state.direction, n, 1),
    }
  }

  // Voluntary single draw — optionally play the drawn card straight away.
  if (res.thenPlay) {
    const playRes = resolvePlay(base, { cards: [res.thenPlay], chosenColor: res.chosenColor })
    return applyPlay(base, playRes)
  }
  return { ...base, phase: 'idle', currentPlayerIndex: step(seat, state.direction, n, 1) }
}

/** Apply a challenge or callout resolution (both only add penalty draws). */
function applyPenaltyEvent(
  state: UnoGameState,
  res: Extract<UnoTurnResolution, { kind: 'challenge' | 'callout' }>,
): UnoGameState {
  const pulled = drawCards(state.stock, state.discard, state.reshuffleCount, res.penalty.count)
  const hands = state.hands.map((h) => [...h])
  hands[res.penalty.seat] = [...hands[res.penalty.seat], ...pulled.drawn]
  const saidUno = state.saidUno.map((v, j) => (hands[j].length === 1 ? v : false))
  saidUno[res.penalty.seat] = false

  const base: UnoGameState = {
    ...state,
    hands,
    stock: pulled.stock,
    discard: pulled.discard,
    reshuffleCount: pulled.reshuffleCount,
    saidUno,
  }
  if (res.kind === 'challenge') {
    // The challenge resolves the WD4 window and advances the turn.
    return {
      ...base,
      pendingDraw: 0,
      pendingDrawType: null,
      wild4Challenge: null,
      phase: 'idle',
      currentPlayerIndex: res.nextIndex,
    }
  }
  // A callout is an interjection: turn order is unchanged and play resumes
  // (idle), regardless of any transient animation phase the hook set.
  return { ...base, phase: 'idle' }
}

// ---- Turn advance for left/absent players ---------------------------------

export function unoReducer(state: UnoGameState, action: UnoAction): UnoGameState {
  switch (action.type) {
    case 'START_ROUND': {
      const rules = action.rules ?? { ...DEFAULT_UNO_RULES }
      const players: UnoPlayer[] = action.players.map((p, id) => ({
        id,
        name: p.name,
        color: p.color,
        isBot: p.isBot ?? false,
        botLevel: p.botLevel,
      }))
      return dealRound(players, rules, action.deckSeed, players.map(() => 0), 1)
    }

    case 'CONTINUE_MATCH': {
      // Score mode: the host deals the next round (new seed, scores carried).
      if (state.phase !== 'roundEnd') return state
      const next = dealRound(
        state.players,
        state.rules,
        action.deckSeed,
        [...state.scores],
        state.roundNumber + 1,
      )
      return { ...next, turnCount: state.turnCount + 1 }
    }

    case 'END_MATCH': {
      if (state.phase !== 'roundEnd') return state
      // Highest cumulative score takes the match.
      let winnerId = 0
      for (let j = 1; j < state.scores.length; j++) {
        if (state.scores[j] > state.scores[winnerId]) winnerId = j
      }
      return { ...state, phase: 'matchEnd', winnerId, winReason: 'empty', turnCount: state.turnCount + 1 }
    }

    case 'ADD_PLAYER': {
      // A late joiner: appended at the end of the order, dealt a fresh hand from
      // the shared stock (identical on every client, so no card identity travels).
      const pulled = drawCards(state.stock, state.discard, state.reshuffleCount, HAND_SIZE)
      const player: UnoPlayer = {
        id: state.players.length,
        name: action.player.name,
        color: action.player.color,
        isBot: false,
      }
      return {
        ...state,
        players: [...state.players, player],
        hands: [...state.hands, pulled.drawn],
        stock: pulled.stock,
        discard: pulled.discard,
        reshuffleCount: pulled.reshuffleCount,
        saidUno: [...state.saidUno, false],
        scores: [...state.scores, 0],
      }
    }

    case 'LOAD_SNAPSHOT': {
      const players: UnoPlayer[] = action.players.map((p, id) => ({
        id,
        name: p.name,
        color: p.color,
        isBot: false,
      }))
      return {
        phase: action.ended ? 'matchEnd' : action.awaitingDecision ? 'roundEnd' : 'idle',
        players,
        hands: action.players.map((p) => [...p.hand]),
        stock: [...action.stock],
        discard: [...action.discard],
        activeColor: action.activeColor,
        direction: action.direction,
        currentPlayerIndex: action.currentPlayerIndex,
        pendingDraw: action.pendingDraw,
        pendingDrawType: action.pendingDrawType,
        wild4Challenge: null,
        reshuffleCount: action.reshuffleCount,
        deckSeed: action.deckSeed,
        saidUno: action.players.map((p) => p.saidUno),
        scores: action.players.map((p) => p.score),
        roundNumber: action.roundNumber,
        finishedOrder: [],
        winnerId: action.ended ? action.currentPlayerIndex : null,
        winReason: action.ended ? 'empty' : null,
        turnCount: action.turnCount,
        rules: action.rules,
      }
    }

    case 'BEGIN_PLAY':
    case 'BEGIN_DRAW':
      return { ...state, phase: 'resolving' }

    case 'BEGIN_CHOOSE':
      return { ...state, phase: 'choosing' }

    case 'COMMIT_TURN': {
      const res = action.resolution
      const turnCount = state.turnCount + 1
      switch (res.kind) {
        case 'play':
          return { ...applyPlay(state, res), turnCount }
        case 'draw':
          return { ...applyDraw(state, res), turnCount }
        case 'challenge':
        case 'callout':
          return { ...applyPenaltyEvent(state, res), turnCount }
        default:
          return state
      }
    }

    case 'SKIP_TURN': {
      if (state.phase !== 'idle') return state
      return {
        ...state,
        currentPlayerIndex: step(state.currentPlayerIndex, state.direction, state.players.length, 1),
        pendingDraw: 0,
        pendingDrawType: null,
        wild4Challenge: null,
        turnCount: state.turnCount + 1,
      }
    }

    case 'FORFEIT_WIN': {
      if (state.phase === 'setup' || state.phase === 'matchEnd') return state
      if (!state.players.some((p) => p.id === action.winnerId)) return state
      return { ...state, phase: 'matchEnd', winnerId: action.winnerId, winReason: 'forfeit' }
    }

    case 'RESTORE':
      return action.state

    case 'RESET':
      return { ...initialUnoState }

    default:
      return state
  }
}
