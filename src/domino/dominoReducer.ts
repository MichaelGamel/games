/**
 * Pure state transitions for Dominoes. The reducer never touches timers, the
 * DOM, or randomness — it only *applies* already-resolved outcomes (a
 * `DominoTurnResolution` computed by `rules.ts` on the acting client). All async
 * orchestration lives in the `useDomino` hook. Mirrors `src/uno/unoReducer.ts`.
 *
 * Both resolution kinds (`play` / `pass`) commit through `COMMIT_TURN`, each
 * bumping `turnCount` — the online sync sequence. The set is rebuilt identically
 * on every client from `deckSeed`, so replaying public resolutions keeps every
 * hidden hand in lock-step.
 */
import { handSizeFor } from './config'
import { deal, shuffle, startingSeat, tileById } from './deck'
import { blockStandings, firstPip, handPips, secondPip } from './rules'
import type {
  DominoBotLevel,
  DominoGameState,
  DominoLine,
  DominoPlayer,
  DominoTile,
  DominoTurnResolution,
  PlacedTile,
} from './types'

export interface PlayerSetup {
  name: string
  color: string
  isBot?: boolean
  botLevel?: DominoBotLevel
}

/** A seated player in a running-match snapshot (adds the live hand). */
export interface PlayerSnapshot extends PlayerSetup {
  hand: DominoTile[]
}

export type DominoAction =
  | { type: 'START_GAME'; players: PlayerSetup[]; deckSeed: number }
  | { type: 'ADD_PLAYER'; player: PlayerSetup }
  | {
      type: 'LOAD_SNAPSHOT'
      players: PlayerSnapshot[]
      currentPlayerIndex: number
      boneyard: DominoTile[]
      line: DominoLine
      deckSeed: number
      ended: boolean
      turnCount: number
    }
  // Local animation beats (mirror UNO's BEGIN_PLAY / BEGIN_DRAW / BEGIN_CHOOSE).
  | { type: 'BEGIN_PLACE' }
  | { type: 'BEGIN_DRAW' }
  | { type: 'BEGIN_CHOOSE' }
  | { type: 'COMMIT_TURN'; resolution: DominoTurnResolution }
  // The current player left the room: hand the turn on (kept seq-aligned).
  | { type: 'SKIP_TURN' }
  | { type: 'FORFEIT_WIN'; winnerId: number }
  | { type: 'RESET' }

const EMPTY_LINE: DominoLine = { tiles: [], leftEnd: null, rightEnd: null }

export const initialDominoState: DominoGameState = {
  phase: 'setup',
  players: [],
  hands: [],
  boneyard: [],
  line: EMPTY_LINE,
  currentPlayerIndex: 0,
  deckSeed: 0,
  pipCounts: [],
  blockedTie: [],
  finishedOrder: [],
  winnerId: null,
  winReason: null,
  turnCount: 0,
}

// ---- Dealing --------------------------------------------------------------

function dealRound(players: DominoPlayer[], deckSeed: number): DominoGameState {
  const { hands, boneyard } = deal(shuffle(deckSeed), players.length, handSizeFor(players.length))
  const start = startingSeat(hands)
  return {
    phase: 'idle',
    players,
    hands,
    boneyard,
    line: EMPTY_LINE,
    currentPlayerIndex: start.seat,
    deckSeed,
    pipCounts: [],
    blockedTie: [],
    finishedOrder: [],
    winnerId: null,
    winReason: null,
    turnCount: 0,
  }
}

/** Pull `n` bones off the top of the boneyard (top = last element). */
function drawFromYard(
  boneyard: readonly DominoTile[],
  n: number,
): { drawn: DominoTile[]; rest: DominoTile[] } {
  const rest = [...boneyard]
  const drawn: DominoTile[] = []
  for (let i = 0; i < n && rest.length > 0; i++) drawn.push(rest.pop()!)
  return { drawn, rest }
}

// ---- Applying resolutions -------------------------------------------------

type PlayResolution = Extract<DominoTurnResolution, { kind: 'play' }>
type PassResolution = Extract<DominoTurnResolution, { kind: 'pass' }>

function applyPlay(state: DominoGameState, res: PlayResolution): DominoGameState {
  const seat = res.seat
  const n = state.players.length
  const { drawn, rest } = drawFromYard(state.boneyard, res.drewBefore)
  const tile = tileById(res.tileId)
  if (!tile) return state // defensive: unknown tile id never happens in practice

  const hands = state.hands.map((h) => [...h])
  hands[seat] = [...hands[seat], ...drawn].filter((t) => t.id !== res.tileId)

  let line: DominoLine
  if (state.line.tiles.length === 0) {
    const placed: PlacedTile = { tile, flip: false, isDouble: tile.a === tile.b }
    line = { tiles: [placed], leftEnd: tile.a, rightEnd: tile.b }
  } else {
    const placed: PlacedTile = { tile, flip: res.flip, isDouble: tile.a === tile.b }
    line =
      res.end === 'right'
        ? {
            tiles: [...state.line.tiles, placed],
            leftEnd: state.line.leftEnd,
            rightEnd: secondPip(tile, res.flip),
          }
        : {
            tiles: [placed, ...state.line.tiles],
            leftEnd: firstPip(tile, res.flip),
            rightEnd: state.line.rightEnd,
          }
  }

  if (res.isWin) {
    return {
      ...state,
      hands,
      boneyard: rest,
      line,
      phase: 'won',
      winnerId: seat,
      winReason: 'empty',
      finishedOrder: [seat],
      pipCounts: hands.map(handPips),
      blockedTie: [],
    }
  }
  return {
    ...state,
    hands,
    boneyard: rest,
    line,
    phase: 'idle',
    currentPlayerIndex: (seat + 1) % n,
  }
}

function applyPass(state: DominoGameState, res: PassResolution): DominoGameState {
  const seat = res.seat
  const n = state.players.length
  const { drawn, rest } = drawFromYard(state.boneyard, res.drewBefore)
  const hands = state.hands.map((h, i) => (i === seat ? [...h, ...drawn] : h))

  if (res.blocks) {
    const pipCounts = res.pipCounts ?? hands.map(handPips)
    const winners = res.blockWinners ?? blockStandings(hands).winners
    const single = winners.length === 1
    return {
      ...state,
      hands,
      boneyard: rest,
      phase: 'won',
      winnerId: single ? winners[0] : null,
      winReason: 'blocked',
      finishedOrder: single ? [winners[0]] : [],
      blockedTie: single ? [] : winners,
      pipCounts,
    }
  }
  return {
    ...state,
    hands,
    boneyard: rest,
    phase: 'idle',
    currentPlayerIndex: (seat + 1) % n,
  }
}

// ---- Reducer --------------------------------------------------------------

export function dominoReducer(state: DominoGameState, action: DominoAction): DominoGameState {
  switch (action.type) {
    case 'START_GAME': {
      const players: DominoPlayer[] = action.players.map((p, id) => ({
        id,
        name: p.name,
        color: p.color,
        isBot: p.isBot ?? false,
        botLevel: p.botLevel,
      }))
      return dealRound(players, action.deckSeed)
    }

    case 'ADD_PLAYER': {
      // A late joiner: appended at the end of the order, dealt a hand from the
      // shared boneyard (identical on every client, so no tile identity travels).
      const want = handSizeFor(state.players.length + 1)
      const { drawn, rest } = drawFromYard(state.boneyard, want)
      const player: DominoPlayer = {
        id: state.players.length,
        name: action.player.name,
        color: action.player.color,
        isBot: false,
      }
      return {
        ...state,
        players: [...state.players, player],
        hands: [...state.hands, drawn],
        boneyard: rest,
      }
    }

    case 'LOAD_SNAPSHOT': {
      const players: DominoPlayer[] = action.players.map((p, id) => ({
        id,
        name: p.name,
        color: p.color,
        isBot: false,
      }))
      return {
        phase: action.ended ? 'won' : 'idle',
        players,
        hands: action.players.map((p) => [...p.hand]),
        boneyard: [...action.boneyard],
        line: action.line,
        currentPlayerIndex: action.currentPlayerIndex,
        deckSeed: action.deckSeed,
        pipCounts: [],
        blockedTie: [],
        finishedOrder: [],
        winnerId: action.ended ? action.currentPlayerIndex : null,
        winReason: action.ended ? 'empty' : null,
        turnCount: action.turnCount,
      }
    }

    case 'BEGIN_PLACE':
      return { ...state, phase: 'placing' }
    case 'BEGIN_DRAW':
      return { ...state, phase: 'drawing' }
    case 'BEGIN_CHOOSE':
      return { ...state, phase: 'choosing' }

    case 'COMMIT_TURN': {
      const res = action.resolution
      const turnCount = state.turnCount + 1
      switch (res.kind) {
        case 'play':
          return { ...applyPlay(state, res), turnCount }
        case 'pass':
          return { ...applyPass(state, res), turnCount }
        default:
          return state
      }
    }

    case 'SKIP_TURN': {
      if (state.phase !== 'idle') return state
      return {
        ...state,
        currentPlayerIndex: (state.currentPlayerIndex + 1) % state.players.length,
        turnCount: state.turnCount + 1,
      }
    }

    case 'FORFEIT_WIN': {
      if (state.phase === 'setup' || state.phase === 'won') return state
      if (!state.players.some((p) => p.id === action.winnerId)) return state
      return { ...state, phase: 'won', winnerId: action.winnerId, winReason: 'forfeit', finishedOrder: [action.winnerId] }
    }

    case 'RESET':
      return { ...initialDominoState }

    default:
      return state
  }
}
