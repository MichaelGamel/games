/**
 * Pure Dominoes rules — legality, tile orientation, and the deterministic
 * outcome of each move. No React, no DOM, no randomness: given a state and a
 * chosen move, these compute the exact `DominoTurnResolution` that is broadcast
 * and replayed identically on every client. Unit-tested in `rules.test.ts`.
 */
import { tileById } from './deck'
import type {
  DominoEnd,
  DominoGameState,
  DominoLine,
  DominoTile,
  DominoTurnResolution,
  Pip,
} from './types'

type PlayResolution = Extract<DominoTurnResolution, { kind: 'play' }>
type PassResolution = Extract<DominoTurnResolution, { kind: 'pass' }>

// ---- Orientation helpers --------------------------------------------------

/** The pip that touches the previous tile / the head end. */
export function firstPip(tile: DominoTile, flip: boolean): Pip {
  return flip ? tile.b : tile.a
}

/** The pip that touches the next tile / the tail end. */
export function secondPip(tile: DominoTile, flip: boolean): Pip {
  return flip ? tile.a : tile.b
}

/** Does either half of `tile` show `value`? */
export function tileMatchesPip(tile: DominoTile, value: Pip): boolean {
  return tile.a === value || tile.b === value
}

/**
 * Orientation (`flip`) for laying `tile` on `end`, or `null` if it cannot
 * attach there. For the right end the matching pip becomes the tile's first
 * (inward) pip; for the left end it becomes the tile's second (inward) pip.
 */
export function orientFor(tile: DominoTile, end: DominoEnd, line: DominoLine): boolean | null {
  if (end === 'right') {
    const r = line.rightEnd
    if (r == null) return null
    if (tile.a === r) return false
    if (tile.b === r) return true
    return null
  }
  const l = line.leftEnd
  if (l == null) return null
  if (tile.b === l) return false
  if (tile.a === l) return true
  return null
}

// ---- Legality -------------------------------------------------------------

/** The open ends `tile` can legally attach to, given the current line. */
export function endsForTile(tile: DominoTile, line: DominoLine): DominoEnd[] {
  if (line.tiles.length === 0) return ['right'] // the opener: a single free placement
  const { leftEnd, rightEnd } = line
  if (leftEnd == null || rightEnd == null) return ['right']
  const ends: DominoEnd[] = []
  // When both ends show the same value, a matching tile has only one meaningful
  // placement — offer the right end and skip the choose prompt.
  if (leftEnd === rightEnd) {
    if (tileMatchesPip(tile, rightEnd)) ends.push('right')
    return ends
  }
  if (tileMatchesPip(tile, leftEnd)) ends.push('left')
  if (tileMatchesPip(tile, rightEnd)) ends.push('right')
  return ends
}

/** The tiles in `hand` that may legally be played right now, with their ends. */
export function legalPlays(
  hand: readonly DominoTile[],
  line: DominoLine,
): Array<{ tile: DominoTile; ends: DominoEnd[] }> {
  if (line.tiles.length === 0) {
    // The opener may lay any tile; one canonical placement (no choose prompt).
    return hand.map((tile) => ({ tile, ends: ['right'] as DominoEnd[] }))
  }
  const result: Array<{ tile: DominoTile; ends: DominoEnd[] }> = []
  for (const tile of hand) {
    const ends = endsForTile(tile, line)
    if (ends.length > 0) result.push({ tile, ends })
  }
  return result
}

/** Can any seat play a tile on the current line? (Drives block detection.) */
export function anyoneCanPlay(hands: readonly DominoTile[][], line: DominoLine): boolean {
  if (line.tiles.length === 0) return true
  return hands.some((hand) => hand.some((tile) => endsForTile(tile, line).length > 0))
}

// ---- Pip counting (blocked-board scoring) ---------------------------------

/** Pip total of a hand (a seat's penalty on a blocked board). */
export function handPips(hand: readonly DominoTile[]): number {
  return hand.reduce((sum, t) => sum + t.a + t.b, 0)
}

/** Fewest-pips winner(s) on a blocked board (length > 1 = a tie). */
export function blockStandings(hands: readonly DominoTile[][]): {
  pipCounts: number[]
  winners: number[]
} {
  const pipCounts = hands.map(handPips)
  const fewest = Math.min(...pipCounts)
  const winners = pipCounts.flatMap((p, seat) => (p === fewest ? [seat] : []))
  return { pipCounts, winners }
}

// ---- Resolving a play -----------------------------------------------------

/**
 * Compute the resolution for the current player laying `tileId` on `end` after
 * drawing `drewBefore` bones. Assumes legality is validated upstream; returns
 * `null` only if the tile id is unknown or it cannot attach to `end`.
 */
export function resolvePlay(
  state: DominoGameState,
  tileId: string,
  end: DominoEnd,
  drewBefore = 0,
): PlayResolution | null {
  const tile = tileById(tileId)
  if (!tile) return null
  const seat = state.currentPlayerIndex
  // Hand length after absorbing any forced draws, before laying this tile.
  const handAfterDraw = state.hands[seat].length + drewBefore
  const isWin = handAfterDraw - 1 === 0

  if (state.line.tiles.length === 0) {
    // The opener sets both ends; orientation is canonical (flip = false).
    return { kind: 'play', seat, drewBefore, tileId, end: 'right', flip: false, isWin }
  }
  const flip = orientFor(tile, end, state.line)
  if (flip == null) return null
  return { kind: 'play', seat, drewBefore, tileId, end, flip, isWin }
}

// ---- Resolving a draw / pass ----------------------------------------------

/**
 * Resolve a stuck player's turn: draw bones off the top of the boneyard one at
 * a time until one is playable (then lay it — a `play` with `drewBefore > 0`),
 * or the boneyard empties (then `pass`). Drawing is forced and non-interactive
 * — it is exactly the Draw rule — so the chosen tile/end are picked
 * deterministically (the first legal tile, its first legal end). Callers only
 * invoke this when the seat has no legal play in hand.
 */
export function resolveDrawTurn(state: DominoGameState): PlayResolution | PassResolution {
  const seat = state.currentPlayerIndex
  const yard = [...state.boneyard]
  let drew = 0
  while (yard.length > 0) {
    const tile = yard.pop()!
    drew++
    const ends = endsForTile(tile, state.line)
    if (ends.length > 0) {
      const end = ends[0]
      const flip = orientFor(tile, end, state.line) ?? false
      return {
        kind: 'play',
        seat,
        drewBefore: drew,
        tileId: tile.id,
        end,
        flip,
        isWin: state.hands[seat].length + drew - 1 === 0,
      }
    }
  }
  return resolvePass(state)
}

/**
 * Resolve a forced pass: the current seat has absorbed the whole remaining
 * boneyard and still cannot play. Detects whether the board is now blocked
 * (nobody can play) and, if so, computes the final pip standings once so every
 * client renders identical results without peeking at hidden hands.
 */
export function resolvePass(state: DominoGameState): PassResolution {
  const seat = state.currentPlayerIndex
  const drewBefore = state.boneyard.length
  // The passing seat absorbs the remaining boneyard before we test the block.
  const hands = state.hands.map((h, i) => (i === seat ? [...h, ...state.boneyard] : h))
  const blocked = !anyoneCanPlay(hands, state.line)
  if (!blocked) return { kind: 'pass', seat, drewBefore, blocks: false }
  const { pipCounts, winners } = blockStandings(hands)
  return { kind: 'pass', seat, drewBefore, blocks: true, pipCounts, blockWinners: winners }
}
