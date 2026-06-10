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

export type GameAction =
  | { type: 'START_GAME'; players: PlayerSetup[] }
  | { type: 'BEGIN_ROLL'; roll: DieValue }
  | { type: 'BEGIN_MOVE' }
  | { type: 'COMMIT_TURN'; resolution: TurnResolution }
  | { type: 'RESET' }

export const initialState: GameState = {
  players: [],
  currentPlayerIndex: 0,
  phase: 'setup',
  lastRoll: null,
  winnerId: null,
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

    case 'BEGIN_ROLL':
      return { ...state, phase: 'rolling', lastRoll: action.roll }

    case 'BEGIN_MOVE':
      return { ...state, phase: 'moving' }

    case 'COMMIT_TURN': {
      const { resolution } = action
      const players = state.players.map((p) =>
        p.id === state.currentPlayerIndex ? { ...p, position: resolution.finalPos } : p,
      )

      if (resolution.isWin) {
        return { ...state, players, phase: 'won', winnerId: state.currentPlayerIndex }
      }

      const nextIndex = resolution.extraTurn
        ? state.currentPlayerIndex
        : (state.currentPlayerIndex + 1) % state.players.length

      return { ...state, players, phase: 'idle', currentPlayerIndex: nextIndex }
    }

    case 'RESET':
      return { ...initialState }

    default:
      return state
  }
}
