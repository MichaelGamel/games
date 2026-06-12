/**
 * The Ludo rules engine — pure functions, no side effects, no React.
 *
 * Two entry points the orchestration layer uses:
 *  - `legalMoves(state, seat, dice)` — which tokens may move (for highlighting
 *    and for deciding auto-select vs. a selection pause vs. a no-move turn).
 *  - `resolveLudoMove(state, tokenId, dice)` — the full {@link LudoTurnResolution}
 *    for the chosen token, computed once on the acting client and replayed
 *    identically everywhere (the explicit `tokenId` is the crux of online sync).
 *
 * Both accept a single die or a dice pair; the match's {@link LudoRules} (on
 * the state) decide how dice behave, whether blockades exist, whether a
 * capture is required before entering home, and who counts as an opponent
 * (2v2 teams never capture or block each other).
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
  LAST_RING_PROGRESS,
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

/** Roll the match's dice (one or two, per the rules). */
export function rollLudoDice(count: 1 | 2, rng: Rng = Math.random): DieValue[] {
  return Array.from({ length: count }, () => rollDie(rng))
}

/** Single die or a pair — normalised everywhere via {@link toDice}. */
export type DiceInput = DieValue | DieValue[]
const toDice = (dice: DiceInput): DieValue[] => (Array.isArray(dice) ? dice : [dice])

/** Are these seats rivals? In 2v2 team play, same-parity seats are partners. */
function isRival(state: LudoGameState, seat: number, other: number): boolean {
  if (seat === other) return false
  if (state.rules.teams) return seat % 2 !== other % 2
  return true
}

/** Every rival token currently sitting on the given absolute ring cell. */
function rivalsAt(state: LudoGameState, seat: number, absCell: number): Capture[] {
  const out: Capture[] = []
  for (const p of state.players) {
    if (!isRival(state, seat, p.id)) continue
    p.tokens.forEach((progress, tokenId) => {
      if (mainTrackCell(p.id, progress) === absCell) out.push({ seat: p.id, tokenId })
    })
  }
  return out
}

/** Does a rival hold a blockade (two+ of their tokens) on this ring cell? */
function rivalBlockAt(state: LudoGameState, seat: number, absCell: number): boolean {
  if (!state.rules.blockades) return false
  for (const p of state.players) {
    if (!isRival(state, seat, p.id)) continue
    let count = 0
    for (const progress of p.tokens) if (mainTrackCell(p.id, progress) === absCell) count++
    if (count >= 2) return true
  }
  return false
}

/** Does this roll allow a release? One die: a 6. Two dice: a 6 on either. */
function canRelease(dice: DieValue[]): boolean {
  return dice.some((d) => d === DIE_FACES)
}

/** Does this roll chain the extra turn? One die: a 6. Two dice: doubles. */
function chainsTurn(dice: DieValue[]): boolean {
  return dice.length === 1 ? dice[0] === DIE_FACES : dice[0] === dice[1]
}

/**
 * The legal move for one token, or `null` if it can't move this roll.
 *
 * - Completed tokens never move.
 * - A token in base may only leave on a 6 — any die, in two-dice play —
 *   (landing on its safe entry square); the release consumes the whole turn.
 * - A board token moves exactly the dice total; overshooting the goal is illegal.
 * - With the capture gate on, the home column is closed until the seat captures.
 * - The path may not pass through or land on a rival blockade (own/teammate
 *   blocks are transparent). Captures happen only on a non-safe ring landing.
 */
function moveForToken(
  state: LudoGameState,
  seat: number,
  tokenId: number,
  dice: DieValue[],
): TokenMoveOption | null {
  const from = state.players[seat].tokens[tokenId]

  if (from === PROGRESS_GOAL) return null

  if (from === PROGRESS_BASE) {
    if (!canRelease(dice)) return null
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

  const amount = dice.reduce((sum, d) => sum + d, 0)
  const to = from + amount
  if (to > PROGRESS_GOAL) return null // exact roll required to finish

  // Capture gate: the home column stays closed until this seat captures.
  if (
    state.rules.captureToEnterHome &&
    !state.players[seat].hasCaptured &&
    to > LAST_RING_PROGRESS
  ) {
    return null
  }

  const stepPath: number[] = []
  for (let p = from + 1; p <= to; p++) stepPath.push(p)

  // A rival blockade anywhere on the shared-ring portion of the path (including
  // the landing cell) makes the whole move illegal.
  for (const p of stepPath) {
    const abs = mainTrackCell(seat, p)
    if (abs != null && rivalBlockAt(state, seat, abs)) return null
  }

  const landingAbs = mainTrackCell(seat, to)
  const captures =
    landingAbs != null && !isSafe(landingAbs) ? rivalsAt(state, seat, landingAbs) : []

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

/** True when this roll would be the player's third chained 6/doubles (turn ends). */
function isThirdChain(state: LudoGameState, dice: DieValue[]): boolean {
  return chainsTurn(dice) && state.consecutiveSixes >= 2
}

/**
 * All tokens the seat may legally move with this roll. Empty means a no-move
 * turn — either nothing can move, or this is the third chained 6/doubles.
 */
export function legalMoves(
  state: LudoGameState,
  seat: number,
  dice: DiceInput,
): TokenMoveOption[] {
  const d = toDice(dice)
  if (isThirdChain(state, d)) return []
  const moves: TokenMoveOption[] = []
  for (let tokenId = 0; tokenId < TOKENS_PER_PLAYER; tokenId++) {
    const move = moveForToken(state, seat, tokenId, d)
    if (move) moves.push(move)
  }
  return moves
}

/** Build the no-move resolution (no legal move, or a third 6/doubles). */
function noMoveResolution(seat: number, dice: DieValue[], sixCount: number): LudoTurnResolution {
  return {
    seat,
    dice,
    roll: dice.reduce((sum, d) => sum + d, 0),
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
 * Deterministic in `(state, tokenId, dice)` so every client replays it identically.
 *
 * Extra turn: a non-final 6 (doubles, with two dice) until the third in a row,
 * or a capture — never after the move finishes the seat. The acting client must
 * have already resolved any selection; an illegal/`-1` token collapses to a
 * no-move turn.
 */
export function resolveLudoMove(
  state: LudoGameState,
  tokenId: number,
  dice: DiceInput,
): LudoTurnResolution {
  const d = toDice(dice)
  const seat = state.currentPlayerIndex
  const sixCount = chainsTurn(d) ? state.consecutiveSixes + 1 : 0

  const move =
    isThirdChain(state, d) || tokenId < 0 ? null : moveForToken(state, seat, tokenId, d)
  if (!move) return noMoveResolution(seat, d, sixCount)

  const tokensAfter = state.players[seat].tokens.slice()
  tokensAfter[tokenId] = move.to
  const isWin = tokensAfter.every((t) => t === PROGRESS_GOAL)
  const extraTurn =
    (chainsTurn(d) && sixCount < 3 && !isWin) || (move.captures.length > 0 && !isWin)

  return {
    seat,
    dice: d,
    roll: d.reduce((sum, die) => sum + die, 0),
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
