/**
 * The rules engine — pure functions with no side effects and no React.
 * Given a position and a roll it returns a fully-resolved {@link TurnResolution}
 * the UI can replay as animation. This is the testable heart of the game.
 */
import { DIE_FACES, JUMPS, WINNING_CELL } from './config'
import type { DieValue, Jump, TurnResolution } from './types'

/** Injectable random source so tests can be deterministic (DIP). */
export type Rng = () => number

/** Roll a fair die. Pass a custom `rng` to make the result deterministic. */
export function rollDie(rng: Rng = Math.random): DieValue {
  return (Math.floor(rng() * DIE_FACES) + 1) as DieValue
}

/** The snake or ladder entered at `cell`, or `null` if none. */
export function getJump(cell: number): Jump | null {
  return JUMPS[cell] ?? null
}

/**
 * Compute the outcome of moving `roll` cells from `from`.
 *
 * Rules applied:
 * - Overshooting the final cell reflects ("bounces") back — you must land
 *   exactly on {@link WINNING_CELL} to win.
 * - The snake/ladder at the landed cell (if any) is then taken.
 * - Rolling a 6 grants another turn, unless the roll won the game.
 */
export function resolveTurn(from: number, roll: DieValue): TurnResolution {
  const raw = from + roll
  const walkPath: number[] = []
  let landed: number
  let bounced = false

  if (raw <= WINNING_CELL) {
    landed = raw
    for (let c = from + 1; c <= raw; c++) walkPath.push(c)
  } else {
    // Walk up to the final cell, then reflect back by the overshoot amount.
    bounced = true
    landed = WINNING_CELL - (raw - WINNING_CELL)
    for (let c = from + 1; c <= WINNING_CELL; c++) walkPath.push(c)
    for (let c = WINNING_CELL - 1; c >= landed; c--) walkPath.push(c)
  }

  const jump = getJump(landed)
  const finalPos = jump ? jump.to : landed
  const isWin = finalPos === WINNING_CELL
  const extraTurn = roll === DIE_FACES && !isWin

  return { roll, from, walkPath, bounced, landed, jump, finalPos, isWin, extraTurn }
}
