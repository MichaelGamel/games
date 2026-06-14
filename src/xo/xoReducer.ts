/**
 * Pure state transitions for Tic-Tac-Toe. The reducer never touches timers,
 * the DOM, or randomness — it only applies already-resolved outcomes. Mirrors
 * `four/fourReducer.ts` and `game/gameReducer.ts`.
 */
import { MARKS, XO_MAX_PLAYERS } from './config'
import { EMPTY, emptyBoard } from './rules'
import type { Cell, XOPlayer, XOResolution, XOState } from './types'

export interface PlayerSetup {
  name: string
  color: string
  /** Computer-controlled player (local play only). Defaults to false. */
  isBot?: boolean
}

/** A seated player in a running-match snapshot (adds their marks). */
export interface PlayerSnapshot extends PlayerSetup {
  cells: Cell[]
}

export type XOAction =
  | { type: 'START_GAME'; players: PlayerSetup[] }
  | {
      type: 'LOAD_SNAPSHOT'
      players: PlayerSnapshot[]
      currentPlayerIndex: number
      finishedOrder: number[]
      ended: boolean
      turnCount: number
    }
  | { type: 'BEGIN_PLACE' }
  | { type: 'COMMIT_TURN'; resolution: XOResolution }
  // The current player left the room: hand the turn to the other player.
  | { type: 'SKIP_TURN' }
  | { type: 'FORFEIT_WIN'; winnerId: number }
  | { type: 'RESET' }

/** Seat → player, stamping each with their mark (seat 0 = ✕, seat 1 = ◯). */
function seatPlayers(players: PlayerSetup[], withBots: boolean): XOPlayer[] {
  return players.slice(0, XO_MAX_PLAYERS).map((p, id) => ({
    id,
    name: p.name,
    color: p.color,
    mark: MARKS[id] ?? MARKS[0],
    isBot: withBots ? (p.isBot ?? false) : false,
  }))
}

export const initialXOState: XOState = {
  players: [],
  currentPlayerIndex: 0,
  phase: 'setup',
  board: emptyBoard(),
  lastCell: null,
  winnerId: null,
  winReason: null,
  winLine: null,
  draw: false,
  finishedOrder: [],
  turnCount: 0,
}

export function xoReducer(state: XOState, action: XOAction): XOState {
  switch (action.type) {
    case 'START_GAME': {
      // Strictly head-to-head: any extra seats are ignored.
      const players = seatPlayers(action.players, true)
      return { ...initialXOState, players, board: emptyBoard(), phase: 'idle' }
    }

    case 'LOAD_SNAPSHOT': {
      const players = seatPlayers(action.players, false)
      const board = emptyBoard()
      action.players.forEach((p, seat) => {
        for (const [row, col] of p.cells) {
          if (board[row]?.[col] === EMPTY) board[row][col] = seat
        }
      })
      return {
        players,
        currentPlayerIndex: action.currentPlayerIndex,
        phase: action.ended ? 'won' : 'idle',
        board,
        lastCell: null,
        winnerId: action.finishedOrder[0] ?? null,
        winReason: action.ended && action.finishedOrder.length > 0 ? 'goal' : null,
        winLine: null,
        // A snapshot of an ended match with no winner was a draw.
        draw: action.ended && action.finishedOrder.length === 0,
        finishedOrder: action.finishedOrder,
        turnCount: action.turnCount,
      }
    }

    case 'BEGIN_PLACE':
      return { ...state, phase: 'placing' }

    case 'COMMIT_TURN': {
      const { resolution } = action
      const board = state.board.map((r) => [...r])
      if (board[resolution.row]?.[resolution.col] === EMPTY) {
        board[resolution.row][resolution.col] = resolution.seat
      }
      const turnCount = state.turnCount + 1
      const lastCell: Cell = [resolution.row, resolution.col]

      if (resolution.isWin) {
        return {
          ...state,
          board,
          phase: 'won',
          lastCell,
          winnerId: resolution.seat,
          winReason: 'goal',
          winLine: resolution.winLine,
          finishedOrder: [resolution.seat],
          turnCount,
        }
      }
      if (resolution.isDraw) {
        return { ...state, board, phase: 'won', lastCell, draw: true, turnCount }
      }
      return {
        ...state,
        board,
        phase: 'idle',
        lastCell,
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
      return { ...initialXOState, board: emptyBoard() }

    default:
      return state
  }
}
