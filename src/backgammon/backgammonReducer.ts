/**
 * Pure state transitions for Backgammon. The reducer never touches timers, the
 * DOM, or randomness — it only applies already-resolved outcomes. Mirrors
 * `four/fourReducer.ts` (a two-player machine with no mid-game decision flow).
 *
 * The transient, in-progress move sequence (the partially-built turn during the
 * `selecting` pause) lives in the orchestration hook, NOT here. The reducer sees
 * only the finished {@link BackgammonTurnResolution} on `COMMIT_TURN`.
 */
import { BACKGAMMON_MAX_PLAYERS, DEFAULT_BACKGAMMON_RULES } from './config'
import { applyHop, startingBoard } from './board'
import type {
  BackgammonBoard,
  BackgammonGameState,
  BackgammonPlayer,
  BackgammonRules,
  BackgammonTurnResolution,
  BackgammonWinReason,
  BotLevel,
  DieValue,
} from './types'

export interface PlayerSetup {
  name: string
  color: string
  isBot?: boolean
  botLevel?: BotLevel
}

/** A seated player in a running-match snapshot (the board rides `shared`). */
export interface PlayerSnapshot {
  name: string
  color: string
}

export type BackgammonAction =
  | { type: 'START_GAME'; players: PlayerSetup[]; rules?: BackgammonRules }
  | {
      type: 'LOAD_SNAPSHOT'
      players: PlayerSnapshot[]
      rules: BackgammonRules
      board: BackgammonBoard
      currentPlayerIndex: number
      lastDice: DieValue[]
      finishedOrder: number[]
      ended: boolean
      winReason: BackgammonWinReason | null
      turnCount: number
    }
  | { type: 'BEGIN_ROLL'; dice: DieValue[] }
  | { type: 'BEGIN_SELECT' }
  | { type: 'BEGIN_MOVE' }
  | { type: 'COMMIT_TURN'; resolution: BackgammonTurnResolution }
  // The current player left the room: hand the turn to the other player.
  | { type: 'SKIP_TURN' }
  | { type: 'FORFEIT_WIN'; winnerId: number }
  | { type: 'RESET' }

export const initialBackgammonState: BackgammonGameState = {
  players: [],
  currentPlayerIndex: 0,
  phase: 'setup',
  rules: { ...DEFAULT_BACKGAMMON_RULES },
  board: startingBoard(),
  lastDice: [],
  lastRoll: null,
  winnerId: null,
  winReason: null,
  finishedOrder: [],
  turnCount: 0,
}

const sum = (dice: DieValue[]) => dice.reduce((a, b) => a + b, 0)

export function backgammonReducer(
  state: BackgammonGameState,
  action: BackgammonAction,
): BackgammonGameState {
  switch (action.type) {
    case 'START_GAME': {
      const players: BackgammonPlayer[] = action.players
        .slice(0, BACKGAMMON_MAX_PLAYERS)
        .map((p, id) => ({
          id,
          name: p.name,
          color: p.color,
          isBot: p.isBot ?? false,
          botLevel: p.botLevel,
        }))
      return {
        ...initialBackgammonState,
        players,
        rules: action.rules ?? { ...DEFAULT_BACKGAMMON_RULES },
        board: startingBoard(),
        phase: 'idle',
      }
    }

    case 'LOAD_SNAPSHOT': {
      const players: BackgammonPlayer[] = action.players
        .slice(0, BACKGAMMON_MAX_PLAYERS)
        .map((p, id) => ({ id, name: p.name, color: p.color, isBot: false }))
      return {
        players,
        currentPlayerIndex: action.currentPlayerIndex,
        phase: action.ended ? 'won' : 'idle',
        rules: action.rules,
        board: {
          points: [...action.board.points],
          bar: [...action.board.bar] as [number, number],
          off: [...action.board.off] as [number, number],
        },
        lastDice: [...action.lastDice],
        lastRoll: action.lastDice.length > 0 ? sum(action.lastDice) : null,
        winnerId: action.finishedOrder[0] ?? null,
        winReason: action.winReason,
        finishedOrder: action.finishedOrder,
        turnCount: action.turnCount,
      }
    }

    case 'BEGIN_ROLL':
      return {
        ...state,
        phase: 'rolling',
        lastDice: action.dice,
        lastRoll: sum(action.dice),
      }

    case 'BEGIN_SELECT':
      return { ...state, phase: 'selecting' }

    case 'BEGIN_MOVE':
      return { ...state, phase: 'moving' }

    case 'COMMIT_TURN': {
      const { resolution } = action
      let board = state.board
      for (const move of resolution.moves) board = applyHop(board, resolution.seat, move)
      const turnCount = state.turnCount + 1

      if (resolution.isWin) {
        return {
          ...state,
          board,
          phase: 'won',
          lastDice: resolution.dice,
          lastRoll: sum(resolution.dice),
          winnerId: resolution.seat,
          winReason: resolution.winReason,
          finishedOrder: [resolution.seat],
          turnCount,
        }
      }
      return {
        ...state,
        board,
        phase: 'idle',
        lastDice: resolution.dice,
        lastRoll: sum(resolution.dice),
        currentPlayerIndex: (resolution.seat + 1) % state.players.length,
        turnCount,
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
      return {
        ...state,
        phase: 'won',
        winnerId: action.winnerId,
        winReason: 'forfeit',
        finishedOrder: [action.winnerId],
      }
    }

    case 'RESET':
      return { ...initialBackgammonState, board: startingBoard() }

    default:
      return state
  }
}
