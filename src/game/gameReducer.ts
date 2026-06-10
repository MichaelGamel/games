/**
 * Pure state transitions for the game. The reducer never touches timers, the
 * DOM, or randomness — it only applies already-resolved outcomes. All async
 * orchestration lives in the useSnakesAndLadders hook, keeping this fully
 * deterministic and trivial to reason about.
 */
import type { DieValue, GameState, Player, TurnResolution } from './types'

export interface PlayerSetup {
  name: string
  color: string
}

/** A seated player as captured in a running-match snapshot (adds board position). */
export interface PlayerSnapshot extends PlayerSetup {
  position: number
}

export type GameAction =
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
    }
  | { type: 'BEGIN_ROLL'; roll: DieValue }
  | { type: 'BEGIN_MOVE' }
  | { type: 'COMMIT_TURN'; resolution: TurnResolution }
  // The current player left the room: hand the turn to the next active player.
  | { type: 'SKIP_TURN' }
  // Host's call after a mid-game finish: keep playing, or stop here.
  | { type: 'CONTINUE_MATCH' }
  | { type: 'END_MATCH' }
  | { type: 'FORFEIT_WIN'; winnerId: number }
  | { type: 'RESET' }

export const initialState: GameState = {
  players: [],
  currentPlayerIndex: 0,
  phase: 'setup',
  lastRoll: null,
  winnerId: null,
  winReason: null,
  finishedOrder: [],
  turnCount: 0,
}

/** Next seat in turn order that is still racing (skips finished players). */
function nextActiveIndex(state: GameState, from: number): number {
  const finished = new Set(state.finishedOrder)
  const count = state.players.length
  for (let step = 1; step <= count; step++) {
    const i = (from + step) % count
    if (!finished.has(i)) return i
  }
  return from
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_GAME': {
      const players: Player[] = action.players.map((p, id) => ({
        id,
        name: p.name,
        color: p.color,
        position: 0,
      }))
      return { ...initialState, players, phase: 'idle' }
    }

    case 'ADD_PLAYER': {
      // A late joiner the host approved. Appended at the end of the turn order
      // on the start cell; existing ids, positions, and the current turn are
      // left untouched, so an in-flight match keeps running uninterrupted.
      const player: Player = {
        id: state.players.length,
        name: action.player.name,
        color: action.player.color,
        position: 0,
      }
      return { ...state, players: [...state.players, player] }
    }

    case 'LOAD_SNAPSHOT': {
      // A late joiner builds its whole game from the host's snapshot of the
      // running match — it never received the original START_GAME broadcast.
      const players: Player[] = action.players.map((p, id) => ({
        id,
        name: p.name,
        color: p.color,
        position: p.position,
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
      }
    }

    case 'BEGIN_ROLL':
      return { ...state, phase: 'rolling', lastRoll: action.roll }

    case 'BEGIN_MOVE':
      return { ...state, phase: 'moving' }

    case 'COMMIT_TURN': {
      const { resolution } = action
      const players = state.players.map((p) =>
        p.id === state.currentPlayerIndex ? { ...p, position: resolution.finalPos } : p,
      )
      const turnCount = state.turnCount + 1

      if (resolution.isWin) {
        const finishedOrder = [...state.finishedOrder, state.currentPlayerIndex]
        const racing = players.length - finishedOrder.length
        // With at most one active player left there is nothing to race for —
        // the match is over (the last player is never ranked). Otherwise pause
        // for the celebration and let the host decide whether to play on.
        return {
          ...state,
          players,
          phase: racing <= 1 ? 'won' : 'celebrating',
          winnerId: finishedOrder[0],
          winReason: 'goal',
          finishedOrder,
          turnCount,
        }
      }

      const nextIndex = resolution.extraTurn
        ? state.currentPlayerIndex
        : nextActiveIndex(state, state.currentPlayerIndex)

      return { ...state, players, phase: 'idle', currentPlayerIndex: nextIndex, turnCount }
    }

    case 'SKIP_TURN': {
      // The player whose turn it is left the room. Counted like a committed
      // turn so online clients stay sequence-aligned.
      if (state.phase !== 'idle') return state
      return {
        ...state,
        currentPlayerIndex: nextActiveIndex(state, state.currentPlayerIndex),
        turnCount: state.turnCount + 1,
      }
    }

    case 'CONTINUE_MATCH': {
      if (state.phase !== 'celebrating') return state
      return {
        ...state,
        phase: 'idle',
        currentPlayerIndex: nextActiveIndex(state, state.currentPlayerIndex),
        turnCount: state.turnCount + 1,
      }
    }

    case 'END_MATCH': {
      if (state.phase !== 'celebrating') return state
      return { ...state, phase: 'won', turnCount: state.turnCount + 1 }
    }

    case 'FORFEIT_WIN': {
      // Every other active player left the room: the last one standing wins
      // what is left of the race. Ignored before the match starts or once it
      // is already decided.
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
      return { ...initialState }

    default:
      return state
  }
}
