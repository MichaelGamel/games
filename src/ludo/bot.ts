/**
 * Computer-player move selection — pure and deterministic (ties break by the
 * order `legalMoves` returns), so it is unit-testable and every client would
 * agree if it ever ran remotely.
 *
 * Two levels:
 * - `easy`  — the friendly classic: capture > release > advance the leader.
 * - `smart` — scores each move: captures and home arrivals first, then safety
 *   (reach safe cells, escape rivals breathing down your neck, avoid stopping
 *   in front of them), then raw progress.
 */
import { isSafe, mainTrackCell } from './board'
import { DIE_FACES, RING_LENGTH } from './config'
import type { BotLevel, LudoGameState, TokenMoveOption } from './types'

/** Pick a bot's move from the legal options (must be non-empty). */
export function chooseBotMove(
  moves: TokenMoveOption[],
  ctx?: { state: LudoGameState; seat: number; level: BotLevel },
): TokenMoveOption {
  if (ctx?.level === 'smart') return chooseSmart(moves, ctx.state, ctx.seat)
  return chooseEasy(moves)
}

function chooseEasy(moves: TokenMoveOption[]): TokenMoveOption {
  const captures = moves.filter((m) => m.captures.length > 0)
  if (captures.length > 0) {
    return captures.reduce((best, m) => (m.captures.length > best.captures.length ? m : best))
  }
  const release = moves.find((m) => m.releasedFromBase)
  if (release) return release
  return moves.reduce((best, m) => (m.to > best.to ? m : best))
}

function chooseSmart(
  moves: TokenMoveOption[],
  state: LudoGameState,
  seat: number,
): TokenMoveOption {
  let best = moves[0]
  let bestScore = -Infinity
  for (const move of moves) {
    const score = scoreMove(move, state, seat)
    if (score > bestScore) {
      best = move
      bestScore = score
    }
  }
  return best
}

/** Is a rival within striking range (1..6 cells behind) of this ring cell? */
function threatened(state: LudoGameState, seat: number, absCell: number): boolean {
  for (const p of state.players) {
    if (p.id === seat) continue
    if (state.rules.teams && p.id % 2 === seat % 2) continue
    for (const progress of p.tokens) {
      const abs = mainTrackCell(p.id, progress)
      if (abs == null) continue
      const gap = (absCell - abs + RING_LENGTH) % RING_LENGTH
      if (gap >= 1 && gap <= DIE_FACES) return true
    }
  }
  return false
}

function scoreMove(move: TokenMoveOption, state: LudoGameState, seat: number): number {
  let score = move.to * 0.3 // mild preference for advancing the furthest token

  if (move.captures.length > 0) score += 50 + move.captures.length * 5
  if (move.reachedHome) score += 40
  if (move.releasedFromBase) score += 22

  const fromAbs = mainTrackCell(seat, move.from)
  const toAbs = mainTrackCell(seat, move.to)

  // Safety: where the token ends up.
  if (toAbs != null) {
    if (isSafe(toAbs)) score += 12
    else if (threatened(state, seat, toAbs)) score -= 15
  } else if (move.to > 0 && !move.releasedFromBase) {
    score += 8 // the private home column is the safest place there is
  }

  // Urgency: get out from under a rival about to strike.
  if (fromAbs != null && !isSafe(fromAbs) && threatened(state, seat, fromAbs)) score += 10

  return score
}
