/**
 * Pure state transitions for Ludo. The reducer never touches timers, the DOM,
 * or randomness — it only applies already-resolved outcomes. All async
 * orchestration lives in the useLudo hook, keeping this fully deterministic and
 * trivial to reason about. Mirrors `src/game/gameReducer.ts` for Snakes.
 */
import { PROGRESS_BASE, TOKENS_PER_PLAYER } from './config'
import type { DieValue, LudoGameState, LudoPlayer, LudoTurnResolution } from './types'

export interface PlayerSetup {
  name: string
  color: string
  /** Computer-controlled player (local play only). Defaults to false. */
  isBot?: boolean
}

/** A seated player in a running-match snapshot (adds the 4 token progresses). */
export interface PlayerSnapshot extends PlayerSetup {
  tokens: number[]
}

export type LudoAction =
  | { type: 'START_GAME'; players: PlayerSetup[] }
  | { type: 'ADD_PLAYER'; player: PlayerSetup }
  | {
      type: 'LOAD_SNAPSHOT'
      players: PlayerSnapshot[]
      currentPlayerIndex: number
      lastRoll: DieValue | null
      finishedOrder: number[]
      /** True when the snapshot was taken mid-celebration (awaiting host). */
      awaitingDecision: boolean
      /** True when the match in the snapshot is already over. */
      ended: boolean
      turnCount: number
      consecutiveSixes: number
    }
  | { type: 'BEGIN_ROLL'; roll: DieValue }
  // Local-only: the roll has >1 legal move; wait for the player to tap a token.
  | { type: 'BEGIN_SELECT' }
  | { type: 'BEGIN_MOVE' }
  | { type: 'COMMIT_TURN'; resolution: LudoTurnResolution }
  // The current player left the room: hand the turn to the next active player.
  | { type: 'SKIP_TURN' }
  // Host's call after a mid-game finish: keep playing, or stop here.
  | { type: 'CONTINUE_MATCH' }
  | { type: 'END_MATCH' }
  | { type: 'FORFEIT_WIN'; winnerId: number }
  | { type: 'RESET' }

const freshTokens = (): number[] => Array<number>(TOKENS_PER_PLAYER).fill(PROGRESS_BASE)

export const initialLudoState: LudoGameState = {
  players: [],
  currentPlayerIndex: 0,
  phase: 'setup',
  lastRoll: null,
  winnerId: null,
  winReason: null,
  finishedOrder: [],
  turnCount: 0,
  consecutiveSixes: 0,
}

/** Next seat in turn order that is still racing (skips finished players). */
function nextActiveIndex(state: LudoGameState, from: number): number {
  const finished = new Set(state.finishedOrder)
  const count = state.players.length
  for (let step = 1; step <= count; step++) {
    const i = (from + step) % count
    if (!finished.has(i)) return i
  }
  return from
}

export function ludoReducer(state: LudoGameState, action: LudoAction): LudoGameState {
  switch (action.type) {
    case 'START_GAME': {
      // Seat 0 leads. A random first player is achieved by shuffling the lineup
      // before START_GAME, so the reducer stays deterministic for online sync.
      const players: LudoPlayer[] = action.players.map((p, id) => ({
        id,
        name: p.name,
        color: p.color,
        tokens: freshTokens(),
        isBot: p.isBot ?? false,
      }))
      return { ...initialLudoState, players, phase: 'idle' }
    }

    case 'ADD_PLAYER': {
      // A late joiner the host approved — appended at the end of the turn order
      // with all four tokens in base; the in-flight match keeps running.
      const player: LudoPlayer = {
        id: state.players.length,
        name: action.player.name,
        color: action.player.color,
        tokens: freshTokens(),
        isBot: false,
      }
      return { ...state, players: [...state.players, player] }
    }

    case 'LOAD_SNAPSHOT': {
      // A late joiner (or a resyncing client) builds its whole game from a host
      // snapshot of the running match.
      const players: LudoPlayer[] = action.players.map((p, id) => ({
        id,
        name: p.name,
        color: p.color,
        tokens: [...p.tokens],
        isBot: false,
      }))
      return {
        players,
        currentPlayerIndex: action.currentPlayerIndex,
        phase: action.ended ? 'won' : action.awaitingDecision ? 'celebrating' : 'idle',
        lastRoll: action.lastRoll,
        winnerId: action.finishedOrder[0] ?? null,
        winReason: action.ended ? 'goal' : null,
        finishedOrder: action.finishedOrder,
        turnCount: action.turnCount,
        consecutiveSixes: action.consecutiveSixes,
      }
    }

    case 'BEGIN_ROLL':
      return { ...state, phase: 'rolling', lastRoll: action.roll }

    case 'BEGIN_SELECT':
      return { ...state, phase: 'selecting' }

    case 'BEGIN_MOVE':
      return { ...state, phase: 'moving' }

    case 'COMMIT_TURN': {
      const { resolution } = action
      const turnCount = state.turnCount + 1

      // Apply the move and any captures onto a fresh players array.
      const players = state.players.map((p) => ({ ...p, tokens: [...p.tokens] }))
      if (!resolution.noMove && resolution.tokenId >= 0) {
        players[resolution.seat].tokens[resolution.tokenId] = resolution.to
        for (const cap of resolution.captures) {
          players[cap.seat].tokens[cap.tokenId] = PROGRESS_BASE
        }
      }

      // A six-chain survives only while the same player rolls again on a six.
      const consecutiveSixes =
        resolution.roll === 6 && resolution.extraTurn ? resolution.sixCount : 0

      if (resolution.isWin) {
        const finishedOrder = [...state.finishedOrder, resolution.seat]
        const racing = players.length - finishedOrder.length
        // At most one active player left ⇒ nothing to race for, the match is
        // over (the last player is never ranked). Otherwise pause to celebrate.
        return {
          ...state,
          players,
          phase: racing <= 1 ? 'won' : 'celebrating',
          winnerId: finishedOrder[0],
          winReason: 'goal',
          finishedOrder,
          turnCount,
          consecutiveSixes: 0,
        }
      }

      const nextIndex = resolution.extraTurn
        ? resolution.seat
        : nextActiveIndex(state, resolution.seat)

      return {
        ...state,
        players,
        phase: 'idle',
        currentPlayerIndex: nextIndex,
        turnCount,
        consecutiveSixes,
      }
    }

    case 'SKIP_TURN': {
      // The player whose turn it is left the room. Counted like a committed turn
      // so online clients stay sequence-aligned.
      if (state.phase !== 'idle') return state
      return {
        ...state,
        currentPlayerIndex: nextActiveIndex(state, state.currentPlayerIndex),
        turnCount: state.turnCount + 1,
        consecutiveSixes: 0,
      }
    }

    case 'CONTINUE_MATCH': {
      if (state.phase !== 'celebrating') return state
      return {
        ...state,
        phase: 'idle',
        currentPlayerIndex: nextActiveIndex(state, state.currentPlayerIndex),
        turnCount: state.turnCount + 1,
        consecutiveSixes: 0,
      }
    }

    case 'END_MATCH': {
      if (state.phase !== 'celebrating') return state
      return { ...state, phase: 'won', turnCount: state.turnCount + 1 }
    }

    case 'FORFEIT_WIN': {
      // Every other active player left the room: the last one standing wins what
      // is left of the race. Ignored before the match starts or once decided.
      if (state.phase === 'setup' || state.phase === 'won') return state
      if (!state.players.some((p) => p.id === action.winnerId)) return state
      if (state.finishedOrder.includes(action.winnerId)) return state
      const finishedOrder = [...state.finishedOrder, action.winnerId]
      return {
        ...state,
        phase: 'won',
        winnerId: finishedOrder[0],
        winReason: 'forfeit',
        finishedOrder,
      }
    }

    case 'RESET':
      return { ...initialLudoState }

    default:
      return state
  }
}
