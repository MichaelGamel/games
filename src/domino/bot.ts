/**
 * Computer player for Dominoes (local play only). Pure and deterministic given
 * its `rng`. Two strengths, matching the Ludo/UNO/Backgammon `easy | smart`
 * convention:
 *  - `easy`  — a random legal tile on a random legal end.
 *  - `smart` — dump the heaviest tile (doubles first, they get stuck in hand),
 *              and lay it on the end that keeps the most of the rest of the hand
 *              playable.
 * When no tile is legal it returns `draw`; the hook's `drawAndResolve` then runs
 * the forced draw-until-playable (or pass) sequence.
 */
import { endsForTile, firstPip, legalPlays, orientFor, secondPip, tileMatchesPip } from './rules'
import type { DominoEnd, DominoGameState, DominoLine, DominoTile, Pip } from './types'

export type DominoBotMove = { type: 'play'; tileId: string; end: DominoEnd } | { type: 'draw' }

/** The two open ends that result from laying `tile` on `end`. */
function resultingEnds(tile: DominoTile, end: DominoEnd, line: DominoLine): { left: Pip; right: Pip } {
  if (line.tiles.length === 0 || line.leftEnd == null || line.rightEnd == null) {
    return { left: tile.a, right: tile.b }
  }
  if (end === 'right') {
    const flip = orientFor(tile, 'right', line) ?? false
    return { left: line.leftEnd, right: secondPip(tile, flip) }
  }
  const flip = orientFor(tile, 'left', line) ?? false
  return { left: firstPip(tile, flip), right: line.rightEnd }
}

/** How many of `rest` could be played against the given open ends. */
function flexibility(rest: readonly DominoTile[], left: Pip, right: Pip): number {
  return rest.reduce(
    (n, t) => (tileMatchesPip(t, left) || tileMatchesPip(t, right) ? n + 1 : n),
    0,
  )
}

export function chooseDominoMove(
  state: DominoGameState,
  seat: number,
  rng: () => number = Math.random,
): DominoBotMove {
  const hand = state.hands[seat] ?? []
  const plays = legalPlays(hand, state.line)
  if (plays.length === 0) return { type: 'draw' }

  const level = state.players[seat]?.botLevel ?? 'smart'

  if (level === 'easy') {
    const pick = plays[Math.floor(rng() * plays.length)]
    const end = pick.ends[Math.floor(rng() * pick.ends.length)]
    return { type: 'play', tileId: pick.tile.id, end }
  }

  // Smart: heaviest tile first (doubles edged ahead since they're hard to shed).
  let best = plays[0]
  let bestWeight = -Infinity
  for (const p of plays) {
    const weight = p.tile.a + p.tile.b + (p.tile.a === p.tile.b ? 1 : 0)
    if (weight > bestWeight) {
      bestWeight = weight
      best = p
    }
  }

  // Pick the end that leaves the rest of the hand the most playable.
  const rest = hand.filter((t) => t.id !== best.tile.id)
  let bestEnd = best.ends[0]
  let bestFlex = -Infinity
  for (const end of best.ends) {
    const { left, right } = resultingEnds(best.tile, end, state.line)
    const flex = flexibility(rest, left, right)
    if (flex > bestFlex) {
      bestFlex = flex
      bestEnd = end
    }
  }
  return { type: 'play', tileId: best.tile.id, end: bestEnd }
}

/** Re-exported for the bot tests' convenience. */
export { endsForTile }
