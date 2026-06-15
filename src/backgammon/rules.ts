/**
 * The Backgammon rules engine — pure functions, no side effects, no React.
 *
 * The crux is {@link legalSequences}: it enumerates every *maximal* legal move
 * sequence for a roll, which simultaneously encodes backgammon's two awkward
 * legality rules — "you must use both dice if you can" (keep only the longest
 * sequences) and "if only one die can be played, play the larger" (a tie-break
 * when the longest sequence is a single hop). The interactive builder, the bot,
 * and the no-legal-move check all read from it, so the rules live in one place.
 */
import { BAR, OFF } from './config'
import {
  allHome,
  applyHop,
  barEntryPoint,
  direction,
  highestHomePip,
  isBlocked,
  isBlot,
  ownCount,
  pipValue,
  startingBoard,
} from './board'
import type { BackgammonBoard, BackgammonGameState, BackgammonTurnResolution, DieValue, SubMove } from './types'

export type Rng = () => number

/** Roll two dice (1..6). The RNG is injectable so tests are deterministic. */
export function rollBackgammonDice(rng: Rng = Math.random): DieValue[] {
  const die = () => (Math.floor(rng() * 6) + 1) as DieValue
  return [die(), die()]
}

/** Expand a roll into the multiset actually played: doubles give four moves. */
export function expandDice(dice: DieValue[]): DieValue[] {
  if (dice.length === 2 && dice[0] === dice[1]) return [dice[0], dice[0], dice[0], dice[0]]
  return [...dice]
}

/** One legal single hop from the current board (consumes one die). */
export interface LegalHop {
  from: number
  to: number
  die: DieValue
  hit: boolean
}

/** Distinct die values available in a remaining-dice multiset. */
function distinctDice(dice: DieValue[]): DieValue[] {
  return [...new Set(dice)]
}

/**
 * Every legal single hop for `seat` given the remaining dice multiset. Enforces:
 * must enter from the bar first, can't land on a blocked point, and bear-off
 * only when all checkers are home (exact die, or the overflow rule for a larger
 * die when nothing sits higher).
 */
export function legalHops(board: BackgammonBoard, seat: number, dice: DieValue[]): LegalHop[] {
  const hops: LegalHop[] = []
  const dir = direction(seat)

  // While any checker is on the bar, the only legal hops are bar entries.
  if (board.bar[seat] > 0) {
    for (const die of distinctDice(dice)) {
      const to = barEntryPoint(seat, die)
      if (!isBlocked(board, seat, to)) hops.push({ from: BAR, to, die, hit: isBlot(board, seat, to) })
    }
    return hops
  }

  const home = allHome(board, seat)
  const topPip = home ? highestHomePip(board, seat) : 0

  for (let from = 0; from < 24; from++) {
    if (ownCount(board, seat, from) === 0) continue
    for (const die of distinctDice(dice)) {
      const to = from + dir * die
      if (to >= 0 && to < 24) {
        if (!isBlocked(board, seat, to)) hops.push({ from, to, die, hit: isBlot(board, seat, to) })
        continue
      }
      // Off the board → a bear-off candidate (only when all checkers are home).
      if (!home) continue
      const v = pipValue(seat, from)
      if (die === v || (die > v && v === topPip)) {
        hops.push({ from, to: OFF, die, hit: false })
      }
    }
  }
  return hops
}

const hopKey = (h: { from: number; to: number; die: number }) => `${h.from}:${h.to}:${h.die}`
const seqKey = (seq: SubMove[]) => seq.map(hopKey).join('|')

/**
 * Enumerate the maximal legal move sequences for a roll. Returns `[[]]` (a
 * single empty sequence) when nothing is playable, so callers can treat
 * `seqs[0].length === 0` as "no legal move".
 */
export function legalSequences(board: BackgammonBoard, seat: number, dice: DieValue[]): SubMove[][] {
  const results: SubMove[][] = []

  const recurse = (b: BackgammonBoard, remaining: DieValue[], acc: SubMove[]) => {
    const hops = remaining.length > 0 ? legalHops(b, seat, remaining) : []
    if (hops.length === 0) {
      results.push(acc)
      return
    }
    // Dedup hops by (from,to,die) so identical doubles don't branch redundantly.
    const seen = new Set<string>()
    for (const hop of hops) {
      const key = hopKey(hop)
      if (seen.has(key)) continue
      seen.add(key)
      const move: SubMove = { from: hop.from, to: hop.to, die: hop.die, hit: hop.hit }
      const idx = remaining.indexOf(hop.die)
      const rest = [...remaining.slice(0, idx), ...remaining.slice(idx + 1)]
      recurse(applyHop(b, seat, move), rest, [...acc, move])
    }
  }
  recurse(board, expandDice(dice), [])

  // Keep only the longest sequences ("use as many dice as possible").
  const maxLen = results.reduce((m, r) => Math.max(m, r.length), 0)
  let best = results.filter((r) => r.length === maxLen)

  // "If only one die can be played, you must play the larger one."
  if (maxLen === 1 && dice.length === 2 && dice[0] !== dice[1]) {
    const larger = Math.max(dice[0], dice[1])
    const withLarger = best.filter((r) => r[0].die === larger)
    if (withLarger.length > 0) best = withLarger
  }

  // Dedup full sequences (different orders that reach the same hops collapse).
  const uniq = new Map<string, SubMove[]>()
  for (const seq of best) uniq.set(seqKey(seq), seq)
  return [...uniq.values()]
}

/** Can the seat make any move at all with this roll? */
export function hasAnyMove(board: BackgammonBoard, seat: number, dice: DieValue[]): boolean {
  return legalSequences(board, seat, dice).some((s) => s.length > 0)
}

/**
 * The distinct first hops the player may tap right now — the heads of all
 * maximal sequences from the working board with the remaining dice. Empty once
 * the turn is forced complete (no die can be legally played).
 */
export function selectableHops(board: BackgammonBoard, seat: number, remaining: DieValue[]): LegalHop[] {
  if (remaining.length === 0) return []
  const seqs = legalSequences(board, seat, remaining)
  const out: LegalHop[] = []
  const seen = new Set<string>()
  for (const seq of seqs) {
    if (seq.length === 0) continue
    const h = seq[0]
    const key = hopKey(h)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ from: h.from, to: h.to, die: h.die, hit: h.hit })
  }
  return out
}

/** True once `seat` has borne off all 15 checkers on the given board. */
function won(board: BackgammonBoard, seat: number): boolean {
  return board.off[seat] >= 15
}

/** Classify a completed win as single / gammon / backgammon for the loser. */
function classifyWin(board: BackgammonBoard, winner: number): BackgammonTurnResolution['winReason'] {
  const loser = 1 - winner
  if (board.off[loser] > 0) return 'single'
  // Loser bore off nothing. Backgammon if a loser checker is still on the bar or
  // in the winner's home board; otherwise a gammon.
  if (board.bar[loser] > 0) return 'backgammon'
  const winnerHome = winner === 0 ? [0, 1, 2, 3, 4, 5] : [18, 19, 20, 21, 22, 23]
  for (const p of winnerHome) {
    if (ownCount(board, loser, p) > 0) return 'backgammon'
  }
  return 'gammon'
}

/**
 * Build the over-the-wire resolution from a committed, ordered move list. Pure
 * and deterministic in (board, seat, dice, moves), so every client reproduces
 * the same outcome. The reducer re-applies `moves`; this only classifies the
 * result (win + magnitude).
 */
export function resolveBackgammonTurn(
  state: BackgammonGameState,
  seat: number,
  dice: DieValue[],
  moves: SubMove[],
): BackgammonTurnResolution {
  let board = state.board
  for (const move of moves) board = applyHop(board, seat, move)
  const isWin = won(board, seat)
  return {
    seat,
    dice,
    moves,
    noLegalMoves: moves.length === 0,
    isWin,
    winReason: isWin ? classifyWin(board, seat) : null,
  }
}

/** Re-export so callers don't reach into `board.ts` for the fresh position. */
export { startingBoard }
