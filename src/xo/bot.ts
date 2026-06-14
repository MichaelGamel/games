/**
 * The Tic-Tac-Toe computer player — pure, deterministic, and unbeatable.
 * Full minimax over the (tiny) 3×3 game tree: it always takes the fastest win
 * and the slowest loss, so against perfect play every game is a draw. Ties in
 * score are broken by a natural, human-looking square order (centre, corners,
 * edges).
 */
import { SIZE } from './config'
import { EMPTY, findWinLine, legalCells } from './rules'
import type { Cell } from './types'

/** Centre first, then corners, then edges — a stable, natural tie-break order. */
const PREFERENCE: readonly Cell[] = (() => {
  const mid = (SIZE - 1) / 2
  const all: Cell[] = []
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) all.push([r, c])
  const rank = ([r, c]: Cell) => {
    const edgeR = r === 0 || r === SIZE - 1
    const edgeC = c === 0 || c === SIZE - 1
    if (r === mid && c === mid) return 0 // centre
    if (edgeR && edgeC) return 1 // corner
    return 2 // edge
  }
  return all.sort((a, b) => rank(a) - rank(b) || a[0] - b[0] || a[1] - b[1])
})()

/** The seat occupying a completed line anywhere on the board, or null. */
function boardWinner(board: number[][]): number | null {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const seat = board[r][c]
      if (seat !== EMPTY && findWinLine(board, r, c, seat)) return seat
    }
  }
  return null
}

/**
 * Minimax score from `me`'s perspective. A win is worth more the sooner it
 * lands (and a loss less the later it lands), so the bot resolves games instead
 * of dawdling. Mutates `board` in place and restores it (cheap on 3×3).
 */
function minimax(board: number[][], toMove: number, me: number, opp: number, depth: number): number {
  const winner = boardWinner(board)
  if (winner === me) return 10 - depth
  if (winner === opp) return depth - 10
  const moves = legalCells(board)
  if (moves.length === 0) return 0 // full board, no winner → draw

  let best = toMove === me ? -Infinity : Infinity
  for (const [r, c] of moves) {
    board[r][c] = toMove
    const score = minimax(board, toMove === me ? opp : me, me, opp, depth + 1)
    board[r][c] = EMPTY
    best = toMove === me ? Math.max(best, score) : Math.min(best, score)
  }
  return best
}

/** Pick the bot's square. `board` must have at least one legal square. */
export function chooseXOMove(board: number[][], seat: number, opponent: number): Cell {
  const legal = legalCells(board)
  const ordered = PREFERENCE.filter(([r, c]) => board[r][c] === EMPTY)
  const pool = ordered.length === legal.length ? ordered : legal

  let best: Cell = pool[0]
  let bestScore = -Infinity
  const probe = board.map((r) => [...r])
  for (const [r, c] of pool) {
    probe[r][c] = seat
    const score = minimax(probe, opponent, seat, opponent, 1)
    probe[r][c] = EMPTY
    if (score > bestScore) {
      bestScore = score
      best = [r, c]
    }
  }
  return best
}
