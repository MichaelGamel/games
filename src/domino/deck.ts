/**
 * The domino set — built, shuffled, and dealt **deterministically**.
 *
 * This is the whole secrecy mechanism: there is no server and no hidden state on
 * the wire. The host broadcasts a single `deckSeed`; every client calls
 * `shuffle(seed)` to produce the byte-identical 28-tile boneyard, deals
 * identically, and thereafter stays in sync by replaying only the public tile
 * laid. Unlike UNO there is no reshuffle — the boneyard is finite and drawing it
 * dry is exactly the trigger for a forced pass.
 *
 * Pure and framework-free; the only randomness is `mulberry32` over an explicit
 * seed. Unit-tested in `deck.test.ts`.
 */
import { mulberry32 } from '../game/boardGen'
import type { DominoTile, Pip } from './types'

/** The only thing that travels in the `start` message for Dominoes. */
export interface DominoStartConfig {
  deckSeed: number
}

/**
 * Build the canonical, unshuffled 28-tile double-six set in a fixed order: every
 * unordered pair `{a,b}` with `0 <= a <= b <= 6`. Ids are assigned in build
 * order (`d0`..`d27`) and are therefore identical on every client.
 */
export function buildSet(): DominoTile[] {
  const tiles: DominoTile[] = []
  for (let a = 0; a <= 6; a++) {
    for (let b = a; b <= 6; b++) {
      tiles.push({ id: `d${tiles.length}`, a: a as Pip, b: b as Pip })
    }
  }
  return tiles
}

/** The canonical set, built once — a stable id → tile lookup. */
export const TILES: readonly DominoTile[] = buildSet()
const TILE_BY_ID = new Map(TILES.map((t) => [t.id, t]))

/** Look up a tile by its stable id (every client agrees). */
export function tileById(id: string): DominoTile | undefined {
  return TILE_BY_ID.get(id)
}

/**
 * The full shuffled boneyard for one round. Fisher–Yates driven by `mulberry32`,
 * so a given seed yields the identical order on every client. The returned
 * array's **last element is the top of the pile** (drawn first).
 */
export function shuffle(seed: number): DominoTile[] {
  const set = buildSet()
  const rng = mulberry32(seed)
  for (let i = set.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = set[i]
    set[i] = set[j]
    set[j] = tmp
  }
  return set
}

/** The result of dealing a fresh round. */
export interface DealResult {
  /** Each seat's hand, parallel to seats `0..playerCount-1`. */
  hands: DominoTile[][]
  /** The remaining draw pile (top = last element). */
  boneyard: DominoTile[]
}

/**
 * Deal `handSize` tiles to each of `playerCount` seats (round-robin from the top
 * of `stock`); the remainder is the boneyard. The input `stock` is not mutated.
 */
export function deal(
  stock: readonly DominoTile[],
  playerCount: number,
  handSize: number,
): DealResult {
  const pile = [...stock]
  const hands: DominoTile[][] = Array.from({ length: playerCount }, () => [])
  for (let k = 0; k < handSize; k++) {
    for (let seat = 0; seat < playerCount; seat++) {
      hands[seat].push(pile.pop()!)
    }
  }
  return { hands, boneyard: pile }
}

/** "Weight" of a tile for the highest-tile opener fallback. */
function tileWeight(t: DominoTile): number {
  // Pip sum dominates; a higher single pip breaks ties (e.g. 6-1 over 5-2).
  return (t.a + t.b) * 10 + Math.max(t.a, t.b)
}

/**
 * The seat that opens the round, determined deterministically from the deal (so
 * every client agrees with no negotiation): the holder of the **highest double**
 * leads; if no one holds a double, the holder of the **heaviest tile** leads.
 * Returns that seat and the qualifying tile (the natural opener). The opener may
 * play any tile — the line is empty, so legality is unrestricted on turn one.
 */
export function startingSeat(hands: readonly DominoTile[][]): { seat: number; tileId: string } {
  let bestDoubleSeat = -1
  let bestDoublePip = -1
  let bestDoubleId = ''
  let bestTileSeat = 0
  let bestTileWeight = -1
  let bestTileId = hands[0]?.[0]?.id ?? 'd0'

  hands.forEach((hand, seat) => {
    for (const t of hand) {
      if (t.a === t.b && t.a > bestDoublePip) {
        bestDoublePip = t.a
        bestDoubleSeat = seat
        bestDoubleId = t.id
      }
      const w = tileWeight(t)
      if (w > bestTileWeight) {
        bestTileWeight = w
        bestTileSeat = seat
        bestTileId = t.id
      }
    }
  })

  return bestDoubleSeat >= 0
    ? { seat: bestDoubleSeat, tileId: bestDoubleId }
    : { seat: bestTileSeat, tileId: bestTileId }
}
