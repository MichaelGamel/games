/**
 * The Tic-Tac-Toe rules engine — pure functions, no side effects, no React.
 * `resolvePlace` returns the complete outcome of one move so the UI can animate
 * it and online clients can replay it identically.
 */
import { SIZE, WIN_LENGTH } from './config'
import type { Cell, XOResolution, XOState } from './types'

export const EMPTY = -1

/** A fresh SIZE×SIZE grid of empties. */
export function emptyBoard(): number[][] {
  return Array.from({ length: SIZE }, () => Array<number>(SIZE).fill(EMPTY))
}

/** Squares that are still empty. */
export function legalCells(board: number[][]): Cell[] {
  const cells: Cell[] = []
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === EMPTY) cells.push([r, c])
    }
  }
  return cells
}

const DIRECTIONS: ReadonlyArray<[number, number]> = [
  [0, 1], // horizontal
  [1, 0], // vertical
  [1, 1], // diagonal ↘
  [1, -1], // diagonal ↙
]

/**
 * The winning line through (row, col) for `seat`, or null. Returns every
 * connected cell in that direction (WIN_LENGTH+, for the highlight).
 */
export function findWinLine(
  board: number[][],
  row: number,
  col: number,
  seat: number,
): Cell[] | null {
  for (const [dr, dc] of DIRECTIONS) {
    const line: Cell[] = [[row, col]]
    for (const sign of [1, -1]) {
      let r = row + dr * sign
      let c = col + dc * sign
      while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r][c] === seat) {
        if (sign === 1) line.push([r, c])
        else line.unshift([r, c])
        r += dr * sign
        c += dc * sign
      }
    }
    if (line.length >= WIN_LENGTH) return line
  }
  return null
}

/**
 * Compute the complete outcome of marking (row, col) for the current player,
 * or null when the square is taken / out of range (callers should have
 * validated already; null keeps a malformed remote message from crashing).
 */
export function resolvePlace(state: XOState, row: number, col: number): XOResolution | null {
  if (row < 0 || row >= SIZE || col < 0 || col >= SIZE) return null
  if (state.board[row][col] !== EMPTY) return null
  const seat = state.currentPlayerIndex

  // Probe the win/draw on a copy — the reducer applies the real mutation.
  const probe = state.board.map((r) => [...r])
  probe[row][col] = seat
  const winLine = findWinLine(probe, row, col, seat)
  const isDraw = winLine == null && legalCells(probe).length === 0

  return { seat, row, col, isWin: winLine != null, winLine, isDraw }
}
