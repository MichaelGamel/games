import { describe, expect, it } from 'vitest'
import {
  PERIMETER,
  buildPerimeter,
  cellsInRenderOrder,
  forwardSteps,
  landingTile,
  passesStart,
  tileCoords,
  tileRole,
  type RC,
} from './board'
import { BOARD, BANK_GRID, BOARD_TILES, PROPERTY_GROUPS } from './config'

/**
 * An independent, hand-authored oracle for the 40 perimeter coordinates: Start
 * bottom-left, walking clockwise (up the left edge, right across the top, down
 * the right edge, left along the bottom). Generated coords must match exactly.
 */
const ORACLE: RC[] = (() => {
  const max = BANK_GRID - 1 // 10
  const cells: RC[] = []
  for (let row = max; row >= 0; row--) cells.push([row, 0]) // 0..10  (left, bottom→top)
  for (let col = 1; col <= max; col++) cells.push([0, col]) // 11..20 (top, left→right)
  for (let row = 1; row <= max; row++) cells.push([row, max]) // 21..30 (right, top→bottom)
  for (let col = max - 1; col >= 1; col--) cells.push([max, col]) // 31..39 (bottom, right→left)
  return cells
})()

const chebyshev = (a: RC, b: RC) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]))

describe('bank board geometry', () => {
  it('has exactly 40 perimeter tiles', () => {
    expect(PERIMETER).toHaveLength(BOARD_TILES)
    expect(buildPerimeter()).toEqual(ORACLE)
  })

  it('keeps every coordinate in-bounds and unique', () => {
    const seen = new Set<string>()
    for (const [row, col] of PERIMETER) {
      expect(row).toBeGreaterThanOrEqual(0)
      expect(row).toBeLessThan(BANK_GRID)
      expect(col).toBeGreaterThanOrEqual(0)
      expect(col).toBeLessThan(BANK_GRID)
      seen.add(`${row},${col}`)
    }
    expect(seen.size).toBe(BOARD_TILES)
  })

  it('is strictly edge-adjacent around the whole ring, including the 39→0 wrap', () => {
    for (let i = 0; i < BOARD_TILES; i++) {
      const next = (i + 1) % BOARD_TILES
      expect(chebyshev(PERIMETER[i], PERIMETER[next])).toBe(1)
    }
  })

  it('places corners at indices 0 / 10 / 20 / 30 (Start bottom-left)', () => {
    expect(tileCoords(0)).toEqual([10, 0]) // Start, bottom-left
    expect(tileCoords(10)).toEqual([0, 0]) // top-left
    expect(tileCoords(20)).toEqual([0, 10]) // top-right
    expect(tileCoords(30)).toEqual([10, 10]) // bottom-right
  })

  it('gives the corners their board kinds (Lucky Club + Fast Bus, no Go-To-Jail)', () => {
    expect(tileRole(0)).toBe('start')
    expect(tileRole(10)).toBe('luckyClub')
    expect(tileRole(20)).toBe('fastbus')
    expect(tileRole(30)).toBe('jail')
  })

  it('has the expected tile-kind totals (4 corners, 4 luck, 4 court, 2 tax, 26 property)', () => {
    const counts = BOARD.reduce<Record<string, number>>((acc, tile) => {
      acc[tile.kind] = (acc[tile.kind] ?? 0) + 1
      return acc
    }, {})
    expect(counts).toEqual({
      start: 1,
      jail: 1,
      luckyClub: 1,
      fastbus: 1,
      luck: 4,
      court: 4,
      tax: 2,
      property: 26,
    })
  })
})

describe('bank movement math', () => {
  it('walks forward cell-by-cell, wrapping past 39', () => {
    expect(forwardSteps(0, 3)).toEqual([1, 2, 3])
    expect(forwardSteps(38, 4)).toEqual([39, 0, 1, 2])
    expect(forwardSteps(10, 0)).toEqual([])
  })

  it('lands on the right tile, wrapping past 39', () => {
    expect(landingTile(0, 7)).toBe(7)
    expect(landingTile(39, 3)).toBe(2)
    expect(landingTile(36, 4)).toBe(0)
  })

  it('passes Start exactly when from + n reaches 40', () => {
    expect(passesStart(0, 5)).toBe(false)
    expect(passesStart(38, 2)).toBe(true) // lands exactly on 0
    expect(passesStart(39, 1)).toBe(true)
    expect(passesStart(35, 4)).toBe(false) // lands on 39, no pass
    expect(passesStart(36, 5)).toBe(true)
  })
})

describe('bank property groups', () => {
  it('places every property in a valid group with at least 2 tiles', () => {
    for (const tile of BOARD) {
      if (tile.kind !== 'property') continue
      expect(tile.group).toBeTruthy()
      expect(typeof tile.price).toBe('number')
      expect(typeof tile.rent).toBe('number')
      expect(PROPERTY_GROUPS[tile.group!]).toContain(tile.id)
    }
    for (const ids of Object.values(PROPERTY_GROUPS)) {
      expect(ids.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('accounts for all 26 property tiles across the groups', () => {
    const total = Object.values(PROPERTY_GROUPS).reduce((sum, ids) => sum + ids.length, 0)
    expect(total).toBe(26)
  })
})

describe('bank property upgrades (P3)', () => {
  it('gives every city property a 5-level rent table (rising) and a house cost', () => {
    for (const tile of BOARD) {
      if (tile.kind !== 'property' || tile.group === 'U') continue
      expect(tile.rentByLevel).toHaveLength(5)
      expect(tile.rentByLevel![0]).toBe(tile.rent)
      for (let lvl = 1; lvl < 5; lvl++) {
        expect(tile.rentByLevel![lvl]).toBeGreaterThan(tile.rentByLevel![lvl - 1])
      }
      expect(tile.houseCost).toBeGreaterThan(0)
    }
  })

  it('leaves utilities unimprovable (no rent table, no house cost)', () => {
    for (const tile of BOARD) {
      if (tile.group !== 'U') continue
      expect(tile.rentByLevel).toBeUndefined()
      expect(tile.houseCost).toBeUndefined()
    }
  })
})

describe('bank render order', () => {
  it('returns all 121 grid cells with 40 carrying a tile', () => {
    const cells = cellsInRenderOrder()
    expect(cells).toHaveLength(BANK_GRID * BANK_GRID)
    expect(cells.filter((c) => c.tileId !== null)).toHaveLength(BOARD_TILES)
  })
})
