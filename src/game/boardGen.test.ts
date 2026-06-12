import { describe, expect, it } from 'vitest'
import { asSnakesRules, generateBoard, layoutForRules, mulberry32 } from './boardGen'
import { CLASSIC_LADDERS, CLASSIC_SNAKES, DEFAULT_SNAKES_RULES } from './config'
import type { BoardLayout } from './types'

/** Every invariant a playable board must satisfy.
 *  `generated` additionally bans cell 1 (the classic board's famous 1→38
 *  ladder is grandfathered in). */
function expectValidBoard(board: BoardLayout, { generated = true } = {}) {
  const final = board.size * board.size
  const endpoints: number[] = []

  for (const [from, to] of Object.entries(board.ladders).map(([f, t]) => [Number(f), t])) {
    expect(to).toBeGreaterThan(from) // ladders climb
    if (generated) expect(from).toBeGreaterThan(1) // nothing on cell 1
    expect(from).toBeLessThan(final)
    expect(to).toBeLessThanOrEqual(final) // tops may touch the finish
    endpoints.push(from, to)
  }
  for (const [head, tail] of Object.entries(board.snakes).map(([h, t]) => [Number(h), t])) {
    expect(tail).toBeLessThan(head) // snakes fall
    expect(tail).toBeGreaterThan(1)
    expect(head).toBeLessThan(final) // a head on the finish would steal wins
    endpoints.push(head, tail)
  }
  // No two connectors share an endpoint cell.
  expect(new Set(endpoints).size).toBe(endpoints.length)

  // Specials sit on connector-free cells, away from start/finish.
  const taken = new Set(endpoints)
  for (const cell of Object.keys(board.specials).map(Number)) {
    expect(taken.has(cell)).toBe(false)
    expect(cell).toBeGreaterThan(1)
    expect(cell).toBeLessThan(final)
  }
}

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(123)
    const b = mulberry32(123)
    for (let i = 0; i < 10; i++) expect(a()).toBe(b())
  })

  it('stays within [0, 1)', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('generateBoard', () => {
  it('is fully deterministic per seed (the basis of online surprise boards)', () => {
    expect(generateBoard(42, 10, true)).toEqual(generateBoard(42, 10, true))
    expect(generateBoard(42, 10, true)).not.toEqual(generateBoard(43, 10, true))
  })

  it.each([1, 42, 1234, 987654, 2 ** 30] as const)('seed %i yields a valid 10×10 board', (seed) => {
    const board = generateBoard(seed, 10, true)
    expect(board.size).toBe(10)
    expect(Object.keys(board.ladders)).toHaveLength(9)
    expect(Object.keys(board.snakes)).toHaveLength(10)
    expect(Object.keys(board.specials)).toHaveLength(3)
    expectValidBoard(board)
  })

  it.each([1, 42, 1234, 987654] as const)('seed %i yields a valid 8×8 board', (seed) => {
    const board = generateBoard(seed, 8, false)
    expect(board.size).toBe(8)
    expect(Object.keys(board.ladders)).toHaveLength(6)
    expect(Object.keys(board.snakes)).toHaveLength(7)
    expect(board.specials).toEqual({})
    expectValidBoard(board)
  })

  it('places one special of each kind', () => {
    const board = generateBoard(5, 10, true)
    expect(Object.values(board.specials).sort()).toEqual(['mystery', 'shield', 'swap'])
  })
})

describe('layoutForRules', () => {
  it('classic rules yield the canonical layout', () => {
    const board = layoutForRules(DEFAULT_SNAKES_RULES)
    expect(board.ladders).toEqual(CLASSIC_LADDERS)
    expect(board.snakes).toEqual(CLASSIC_SNAKES)
    expect(board.specials).toEqual({})
  })

  it('classic + specials sprinkles specials onto free cells', () => {
    const board = layoutForRules({ ...DEFAULT_SNAKES_RULES, specials: true, seed: 9 })
    expect(board.ladders).toEqual(CLASSIC_LADDERS)
    expect(Object.keys(board.specials)).toHaveLength(3)
    expectValidBoard(board, { generated: false })
  })

  it('random rules generate from the seed', () => {
    const board = layoutForRules({ board: 'random', seed: 11, size: 8, diceCount: 1, specials: false })
    expect(board.size).toBe(8)
    expectValidBoard(board)
  })
})

describe('asSnakesRules (wire validation)', () => {
  it('defaults garbage to the classic game', () => {
    expect(asSnakesRules(undefined)).toEqual(DEFAULT_SNAKES_RULES)
    expect(asSnakesRules(null)).toEqual(DEFAULT_SNAKES_RULES)
    expect(asSnakesRules('nonsense')).toEqual(DEFAULT_SNAKES_RULES)
    expect(asSnakesRules({ board: 'weird', diceCount: 7 })).toEqual(DEFAULT_SNAKES_RULES)
  })

  it('passes a valid payload through', () => {
    const rules = { board: 'random', seed: 99, size: 8, diceCount: 2, specials: true } as const
    expect(asSnakesRules(rules)).toEqual(rules)
  })

  it('never pairs a classic board with size 8', () => {
    expect(asSnakesRules({ board: 'classic', size: 8 }).size).toBe(10)
  })
})
