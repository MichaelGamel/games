/**
 * Pure board geometry for Backgammon. No side effects, no React. Movement
 * direction is derived here from the seat, never stored, so {@link
 * BackgammonBoard} stays absolute and direction-neutral.
 */
import { BAR, CHECKERS_PER_PLAYER, OFF, POINT_COUNT, STARTING_POINTS } from './config'
import type { BackgammonBoard } from './types'

/** A fresh board in the standard starting position. */
export function startingBoard(): BackgammonBoard {
  return { points: [...STARTING_POINTS], bar: [0, 0], off: [0, 0] }
}

/** Deep-clone a board (the reducer/rules apply moves immutably). */
export function cloneBoard(board: BackgammonBoard): BackgammonBoard {
  return { points: [...board.points], bar: [...board.bar] as [number, number], off: [...board.off] as [number, number] }
}

/** Sign of a seat's checkers in `points`: seat 0 = +1, seat 1 = −1. */
export function ownerSign(seat: number): 1 | -1 {
  return seat === 0 ? 1 : -1
}

/** Travel direction along the index axis: seat 0 decreases, seat 1 increases. */
export function direction(seat: number): 1 | -1 {
  return seat === 0 ? -1 : 1
}

/** Count of a seat's own checkers on a point (0 if the point is empty/enemy). */
export function ownCount(board: BackgammonBoard, seat: number, point: number): number {
  const v = board.points[point]
  return seat === 0 ? Math.max(0, v) : Math.max(0, -v)
}

/** Count of the opponent's checkers on a point. */
export function enemyCount(board: BackgammonBoard, seat: number, point: number): number {
  return ownCount(board, 1 - seat, point)
}

/** Destination index for moving a checker on `point` by `die` (may be off-board). */
export function step(seat: number, point: number, die: number): number {
  return point + direction(seat) * die
}

/** The point a checker entering from the bar lands on for a given die. */
export function barEntryPoint(seat: number, die: number): number {
  return seat === 0 ? POINT_COUNT - die : die - 1
}

/** A point is blocked for `seat` when the opponent holds two or more checkers. */
export function isBlocked(board: BackgammonBoard, seat: number, point: number): boolean {
  return enemyCount(board, seat, point) >= 2
}

/** A point is an opponent blot (exactly one checker) — a hit on landing. */
export function isBlot(board: BackgammonBoard, seat: number, point: number): boolean {
  return enemyCount(board, seat, point) === 1
}

/** Pip value of a point for a seat — its distance (in pips) to bearing off. */
export function pipValue(seat: number, point: number): number {
  return seat === 0 ? point + 1 : POINT_COUNT - point
}

/** A seat's total pip count (lower is closer to winning). Bar = 25 pips each. */
export function pipCount(board: BackgammonBoard, seat: number): number {
  let total = board.bar[seat] * 25
  for (let p = 0; p < POINT_COUNT; p++) {
    const n = ownCount(board, seat, p)
    if (n > 0) total += n * pipValue(seat, p)
  }
  return total
}

/** All 15 of a seat's checkers are in its home board or borne off (bear-off gate). */
export function allHome(board: BackgammonBoard, seat: number): boolean {
  if (board.bar[seat] > 0) return false
  const lo = seat === 0 ? 6 : 0
  const hi = seat === 0 ? POINT_COUNT : 18
  for (let p = lo; p < hi; p++) {
    if (ownCount(board, seat, p) > 0) return false
  }
  return true
}

/** The highest occupied pip value in a seat's home board (0 if none). */
export function highestHomePip(board: BackgammonBoard, seat: number): number {
  let max = 0
  for (const p of seat === 0 ? [0, 1, 2, 3, 4, 5] : [18, 19, 20, 21, 22, 23]) {
    if (ownCount(board, seat, p) > 0) max = Math.max(max, pipValue(seat, p))
  }
  return max
}

/** Apply a single hop for `seat` to a board, returning a new board. */
export function applyHop(
  board: BackgammonBoard,
  seat: number,
  hop: { from: number; to: number; hit?: boolean },
): BackgammonBoard {
  const next = cloneBoard(board)
  const sign = ownerSign(seat)

  // Remove the checker from its source.
  if (hop.from === BAR) next.bar[seat] -= 1
  else next.points[hop.from] -= sign

  // Add it to its destination (bearing off, or onto a point — hitting a blot).
  if (hop.to === OFF) {
    next.off[seat] += 1
  } else {
    if (enemyCount(next, seat, hop.to) === 1) {
      next.points[hop.to] = 0
      next.bar[1 - seat] += 1
    }
    next.points[hop.to] += sign
  }
  return next
}

/** A seat has won once it has borne off all of its checkers. */
export function hasWon(board: BackgammonBoard, seat: number): boolean {
  return board.off[seat] >= CHECKERS_PER_PLAYER
}
