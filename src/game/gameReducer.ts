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
      winnerId: number | null
      turnCount: number
    }
  | { type: 'BEGIN_ROLL'; roll: DieValue }
  | { type: 'BEGIN_MOVE' }
  | { type: 'COMMIT_TURN'; resolution: TurnResolution }
  | { type: 'FORFEIT_WIN'; winnerId: number }
  | { type: 'RESET' }

export const initialState: GameState = {
  players: [],
  currentPlayerIndex: 0,
  phase: 'setup',
  lastRoll: null,
  winnerId: null,
  winReason: null,
  turnCount: 0,
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
        phase: action.winnerId != null ? 'won' : 'idle',
        lastRoll: action.lastRoll,
        winnerId: action.winnerId,
        winReason: action.winnerId != null ? 'goal' : null,
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
        return {
          ...state,
          players,
          phase: 'won',
          winnerId: state.currentPlayerIndex,
          winReason: 'goal',
          turnCount,
        }
      }

      const nextIndex = resolution.extraTurn
        ? state.currentPlayerIndex
        : (state.currentPlayerIndex + 1) % state.players.length

      return { ...state, players, phase: 'idle', currentPlayerIndex: nextIndex, turnCount }
    }

    case 'FORFEIT_WIN': {
      // Every other player left the room: the last one standing wins. Ignored
      // before the match starts or once it is already decided.
      if (state.phase === 'setup' || state.phase === 'won') return state
      if (!state.players.some((p) => p.id === action.winnerId)) return state
      return { ...state, phase: 'won', winnerId: action.winnerId, winReason: 'forfeit' }
    }

    case 'RESET':
      return { ...initialState }

    default:
      return state
  }
}
