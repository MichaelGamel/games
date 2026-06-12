/**
 * The Ludo rules engine — pure functions, no side effects, no React.
 *
 * Two entry points the orchestration layer uses:
 *  - `legalMoves(state, seat, roll)` — which tokens may move (for highlighting
 *    and for deciding auto-select vs. a selection pause vs. a no-move turn).
 *  - `resolveLudoMove(state, tokenId, roll)` — the full {@link LudoTurnResolution}
 *    for the chosen token, computed once on the acting client and replayed
 *    identically everywhere (the explicit `tokenId` is the crux of online sync).
 *
 * Captures and blocks consult only the shared ring (`mainTrackCell`); home
 * columns and completed tokens are private and untouchable.
 */
import { isSafe, mainTrackCell } from './board'
import {
  DIE_FACES,
  PROGRESS_BASE,
  PROGRESS_ENTRY,
  PROGRESS_GOAL,
  TOKENS_PER_PLAYER,
} from './config'
import type {
  Capture,
  DieValue,
  LudoGameState,
  LudoTurnResolution,
  TokenMoveOption,
} from './types'

/** Injectable random source so tests can be deterministic (DIP). */
export type Rng = () => number

/** Roll a fair die. Pass a custom `rng` to make the result deterministic. */
export function rollDie(rng: Rng = Math.random): DieValue {
  return (Math.floor(rng() * DIE_FACES) + 1) as DieValue
}

/** Every opponent token currently sitting on the given absolute ring cell. */
function opponentsAt(state: LudoGameState, seat: number, absCell: number): Capture[] {
  const out: Capture[] = []
  for (const p of state.players) {
    if (p.id === seat) continue
    p.tokens.forEach((progress, tokenId) => {
      if (mainTrackCell(p.id, progress) === absCell) out.push({ seat: p.id, tokenId })
    })
  }
  return out
}

/** Does an opponent hold a block (two+ of their tokens) on this ring cell? */
function opponentBlockAt(state: LudoGameState, seat: number, absCell: number): boolean {
  for (const p of state.players) {
    if (p.id === seat) continue
    let count = 0
    for (const progress of p.tokens) if (mainTrackCell(p.id, progress) === absCell) count++
    if (count >= 2) return true
  }
  return false
}

/**
 * The legal move for one token, or `null` if it can't move this roll.
 *
 * - Completed tokens never move.
 * - A token in base may only leave on a 6 (landing on its safe entry square).
 * - A board token moves exactly `roll`; overshooting the goal (`>56`) is illegal.
 * - The path may not pass through or land on an opponent block (own block is
 *   transparent to its owner). Captures happen only on a non-safe ring landing.
 */
function moveForToken(
  state: LudoGameState,
  seat: number,
  tokenId: number,
  roll: DieValue,
): TokenMoveOption | null {
  const from = state.players[seat].tokens[tokenId]

  if (from === PROGRESS_GOAL) return null

  if (from === PROGRESS_BASE) {
    if (roll !== DIE_FACES) return null
    // Pop onto the (safe) entry square. No capture: start squares are safe.
    return {
      tokenId,
      from,
      to: PROGRESS_ENTRY,
      releasedFromBase: true,
      stepPath: [],
      captures: [],
      reachedHome: false,
    }
  }

  const to = from + roll
  if (to > PROGRESS_GOAL) return null // exact roll required to finish

  const stepPath: number[] = []
  for (let p = from + 1; p <= to; p++) stepPath.push(p)

  // An opponent block anywhere on the shared-ring portion of the path (including
  // the landing cell) makes the whole move illegal.
  for (const p of stepPath) {
    const abs = mainTrackCell(seat, p)
    if (abs != null && opponentBlockAt(state, seat, abs)) return null
  }

  const landingAbs = mainTrackCell(seat, to)
  const captures =
    landingAbs != null && !isSafe(landingAbs) ? opponentsAt(state, seat, landingAbs) : []

  return {
    tokenId,
    from,
    to,
    releasedFromBase: false,
    stepPath,
    captures,
    reachedHome: to === PROGRESS_GOAL,
  }
}

/** True when this roll would be the player's third consecutive six (turn ends). */
function isThirdSix(state: LudoGameState, roll: DieValue): boolean {
  return roll === DIE_FACES && state.consecutiveSixes >= 2
}

/**
 * All tokens the seat may legally move with this roll. Empty means a no-move
 * turn — either nothing can move, or this is the third consecutive six.
 */
export function legalMoves(
  state: LudoGameState,
  seat: number,
  roll: DieValue,
): TokenMoveOption[] {
  if (isThirdSix(state, roll)) return []
  const moves: TokenMoveOption[] = []
  for (let tokenId = 0; tokenId < TOKENS_PER_PLAYER; tokenId++) {
    const move = moveForToken(state, seat, tokenId, roll)
    if (move) moves.push(move)
  }
  return moves
}

/** Build the no-move resolution (no legal move, or a third six). */
function noMoveResolution(seat: number, roll: DieValue, sixCount: number): LudoTurnResolution {
  return {
    seat,
    roll,
    tokenId: -1,
    from: -1,
    to: -1,
    releasedFromBase: false,
    stepPath: [],
    captures: [],
    reachedHome: false,
    isWin: false,
    extraTurn: false,
    sixCount,
    noMove: true,
  }
}

/**
 * The complete outcome of one roll for `tokenId` (use `-1` for a forced no-move).
 * Deterministic in `(state, tokenId, roll)` so every client replays it identically.
 *
 * Extra turn: a non-final six (until the third), or a capture — never after the
 * move finishes the seat. The acting client must have already resolved any
 * selection; an illegal/`-1` token collapses to a no-move turn.
 */
export function resolveLudoMove(
  state: LudoGameState,
  tokenId: number,
  roll: DieValue,
): LudoTurnResolution {
  const seat = state.currentPlayerIndex
  const sixCount = roll === DIE_FACES ? state.consecutiveSixes + 1 : 0

  const move =
    isThirdSix(state, roll) || tokenId < 0 ? null : moveForToken(state, seat, tokenId, roll)
  if (!move) return noMoveResolution(seat, roll, sixCount)

  const tokensAfter = state.players[seat].tokens.slice()
  tokensAfter[tokenId] = move.to
  const isWin = tokensAfter.every((t) => t === PROGRESS_GOAL)
  const extraTurn =
    (roll === DIE_FACES && sixCount < 3 && !isWin) || (move.captures.length > 0 && !isWin)

  return {
    seat,
    roll,
    tokenId,
    from: move.from,
    to: move.to,
    releasedFromBase: move.releasedFromBase,
    stepPath: move.stepPath,
    captures: move.captures,
    reachedHome: move.reachedHome,
    isWin,
    extraTurn,
    sixCount,
    noMove: false,
  }
}
