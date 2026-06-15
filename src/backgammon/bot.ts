/**
 * The Backgammon computer player — pure and deterministic. It enumerates every
 * maximal legal move sequence for the roll, simulates each, scores the resulting
 * position, and picks the best (ties broken by enumeration order). Mirrors the
 * "enumerate then score" shape of `ludo/bot.ts`.
 */
import { applyHop, enemyCount, ownCount, pipCount } from './board'
import { legalSequences } from './rules'
import type { BackgammonBoard, BackgammonGameState, BotLevel, DieValue, SubMove } from './types'

/** Made points (2+ checkers) — they block the opponent and can't be hit. */
function madePoints(board: BackgammonBoard, seat: number): number {
  let n = 0
  for (let p = 0; p < 24; p++) if (ownCount(board, seat, p) >= 2) n++
  return n
}

/** Own blots that sit within a direct (1..6) shot of an opponent checker. */
function exposedBlots(board: BackgammonBoard, seat: number): number {
  const dir = seat === 0 ? -1 : 1 // opponent moves the opposite way
  let exposed = 0
  for (let p = 0; p < 24; p++) {
    if (ownCount(board, seat, p) !== 1) continue
    // An opponent checker hits our blot at p by moving toward us; a direct shot
    // is 1..6 pips away on the opponent's travel axis (opponent dir = -dir).
    for (let d = 1; d <= 6; d++) {
      const shooter = p + dir * d
      if (shooter >= 0 && shooter < 24 && enemyCount(board, seat, shooter) > 0) {
        exposed++
        break
      }
    }
  }
  return exposed
}

/** Position value from `seat`'s perspective (higher is better). */
function evaluate(board: BackgammonBoard, seat: number, level: BotLevel): number {
  const opp = 1 - seat
  const race = pipCount(board, opp) - pipCount(board, seat)
  const bearOff = board.off[seat] * 15
  const oppBar = board.bar[opp] * 10
  if (level === 'easy') return race + bearOff + oppBar
  return (
    race +
    bearOff +
    oppBar +
    madePoints(board, seat) * 3 -
    exposedBlots(board, seat) * 6
  )
}

/**
 * Pick the bot's full move sequence for a roll. Returns `[]` when nothing is
 * playable (the caller commits a no-move turn).
 */
export function chooseBotSequence(
  state: BackgammonGameState,
  seat: number,
  dice: DieValue[],
  level: BotLevel = 'smart',
): SubMove[] {
  const seqs = legalSequences(state.board, seat, dice).filter((s) => s.length > 0)
  if (seqs.length === 0) return []

  let best = seqs[0]
  let bestScore = -Infinity
  for (const seq of seqs) {
    let board = state.board
    for (const move of seq) board = applyHop(board, seat, move)
    const score = evaluate(board, seat, level)
    if (score > bestScore) {
      bestScore = score
      best = seq
    }
  }
  return best
}
