/**
 * Seeded board generation — pure and fully deterministic, so the host can
 * broadcast just a seed and every client builds the identical "surprise"
 * board. Also resolves a {@link SnakesRules} value to its concrete
 * {@link BoardLayout} (classic or generated, with optional special cells).
 */
import { CLASSIC_LADDERS, CLASSIC_SNAKES, DEFAULT_SNAKES_RULES } from './config'
import type { BoardLayout, SnakesRules, SpecialKind } from './types'

/** Deterministic PRNG (mulberry32): same seed ⇒ same sequence on every client. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Connector counts tuned per board size (mirrors the classic 9/10 density). */
const COUNTS: Record<number, { ladders: number; snakes: number }> = {
  10: { ladders: 9, snakes: 10 },
  8: { ladders: 6, snakes: 7 },
}

const SPECIAL_KINDS: readonly SpecialKind[] = ['shield', 'swap', 'mystery']

/**
 * Generate a playable board from a seed.
 *
 * Invariants (asserted by `boardGen.test.ts`):
 * - ladders always climb, snakes always fall, each by at least half a row;
 * - no two connectors share an endpoint cell;
 * - nothing sits on cell 1; only ladder *tops* may touch the finish;
 * - specials (one of each kind, when enabled) sit on connector-free cells.
 */
export function generateBoard(seed: number, size: 8 | 10, withSpecials: boolean): BoardLayout {
  const rng = mulberry32(seed)
  const final = size * size
  const minRise = Math.ceil(size / 2)
  const { ladders: ladderCount, snakes: snakeCount } = COUNTS[size]

  const used = new Set<number>([1]) // endpoints already taken (never cell 1)
  const randCell = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1))

  const ladders: Record<number, number> = {}
  let guard = 0
  while (Object.keys(ladders).length < ladderCount && guard++ < 1000) {
    const from = randCell(2, final - minRise - 1)
    const to = randCell(from + minRise, final)
    if (used.has(from) || used.has(to) || from === to) continue
    ladders[from] = to
    used.add(from)
    used.add(to)
  }

  const snakes: Record<number, number> = {}
  guard = 0
  while (Object.keys(snakes).length < snakeCount && guard++ < 1000) {
    const head = randCell(minRise + 2, final - 1) // a head on the finish would steal wins
    const tail = randCell(2, head - minRise)
    if (used.has(head) || used.has(tail) || head === tail) continue
    snakes[head] = tail
    used.add(head)
    used.add(tail)
  }

  return {
    size,
    ladders,
    snakes,
    specials: withSpecials ? placeSpecials(rng, final, used) : {},
  }
}

/** One special of each kind, on free cells away from the start/finish runs. */
function placeSpecials(
  rng: () => number,
  final: number,
  used: ReadonlySet<number>,
): Record<number, SpecialKind> {
  const specials: Record<number, SpecialKind> = {}
  const taken = new Set(used)
  let guard = 0
  for (const kind of SPECIAL_KINDS) {
    while (guard++ < 500) {
      const cell = 5 + Math.floor(rng() * (final - 9)) // 5 .. final-5
      if (taken.has(cell)) continue
      specials[cell] = kind
      taken.add(cell)
      break
    }
  }
  return specials
}

/** The concrete board a rules value plays on. */
export function layoutForRules(rules: SnakesRules): BoardLayout {
  if (rules.board === 'classic') {
    return {
      size: 10,
      ladders: { ...CLASSIC_LADDERS },
      snakes: { ...CLASSIC_SNAKES },
      // Specials work on the classic board too — placed by seed on free cells.
      specials: rules.specials
        ? placeSpecials(
            mulberry32(rules.seed),
            100,
            new Set([
              1,
              ...Object.keys(CLASSIC_LADDERS).map(Number),
              ...Object.values(CLASSIC_LADDERS),
              ...Object.keys(CLASSIC_SNAKES).map(Number),
              ...Object.values(CLASSIC_SNAKES),
            ]),
          )
        : {},
    }
  }
  return generateBoard(rules.seed, rules.size, rules.specials)
}

/**
 * Validate a rules payload that arrived over the wire (or default it).
 * Online clients run the same build, but a malformed/missing payload must
 * never crash the reducer — fall back to the classic game.
 */
export function asSnakesRules(value: unknown): SnakesRules {
  if (typeof value !== 'object' || value == null) return { ...DEFAULT_SNAKES_RULES }
  const v = value as Partial<SnakesRules>
  const size = v.size === 8 ? 8 : 10
  return {
    board: v.board === 'random' ? 'random' : 'classic',
    seed: typeof v.seed === 'number' && Number.isFinite(v.seed) ? v.seed : 1,
    // An 8×8 board is always generated; never pair `classic` with size 8.
    size: v.board === 'random' ? size : 10,
    diceCount: v.diceCount === 2 ? 2 : 1,
    specials: v.specials === true,
  }
}
