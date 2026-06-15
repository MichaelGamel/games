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
import { BOARD, BANK_COLS, BANK_ROWS, BOARD_TILES, PROPERTY_GROUPS } from './config'

/**
 * An independent, hand-authored oracle for the 34 perimeter coordinates of the
 * 11-wide × 8-tall board: Start bottom-left, walking clockwise (up the left
 * edge, right across the top, down the right edge, left along the bottom).
 * Generated coords must match exactly.
 */
const ORACLE: RC[] = (() => {
  const maxRow = BANK_ROWS - 1 // 7
  const maxCol = BANK_COLS - 1 // 10
  const cells: RC[] = []
  for (let row = maxRow; row >= 0; row--) cells.push([row, 0]) // 0..7   (left, bottom→top)
  for (let col = 1; col <= maxCol; col++) cells.push([0, col]) // 8..17  (top, left→right)
  for (let row = 1; row <= maxRow; row++) cells.push([row, maxCol]) // 18..24 (right, top→bottom)
  for (let col = maxCol - 1; col >= 1; col--) cells.push([maxRow, col]) // 25..33 (bottom, right→left)
  return cells
})()

const chebyshev = (a: RC, b: RC) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]))

describe('bank board geometry', () => {
  it('has exactly 34 perimeter tiles', () => {
    expect(PERIMETER).toHaveLength(BOARD_TILES)
    expect(buildPerimeter()).toEqual(ORACLE)
  })

  it('keeps every coordinate in-bounds and unique', () => {
    const seen = new Set<string>()
    for (const [row, col] of PERIMETER) {
      expect(row).toBeGreaterThanOrEqual(0)
      expect(row).toBeLessThan(BANK_ROWS)
      expect(col).toBeGreaterThanOrEqual(0)
      expect(col).toBeLessThan(BANK_COLS)
      seen.add(`${row},${col}`)
    }
    expect(seen.size).toBe(BOARD_TILES)
  })

  it('is strictly edge-adjacent around the whole ring, including the 33→0 wrap', () => {
    for (let i = 0; i < BOARD_TILES; i++) {
      const next = (i + 1) % BOARD_TILES
      expect(chebyshev(PERIMETER[i], PERIMETER[next])).toBe(1)
    }
  })

  it('places corners at indices 0 / 7 / 17 / 24 (Start bottom-left)', () => {
    expect(tileCoords(0)).toEqual([7, 0]) // Start, bottom-left
    expect(tileCoords(7)).toEqual([0, 0]) // top-left, Lucky Club
    expect(tileCoords(17)).toEqual([0, 10]) // top-right, Fast Bus
    expect(tileCoords(24)).toEqual([7, 10]) // bottom-right, Jail
  })

  it('gives the corners their board kinds (Lucky Club + Fast Bus, no Go-To-Jail)', () => {
    expect(tileRole(0)).toBe('start')
    expect(tileRole(7)).toBe('luckyClub')
    expect(tileRole(17)).toBe('fastbus')
    expect(tileRole(24)).toBe('jail')
  })

  it('has the expected tile-kind totals (4 corners, 3 luck, 3 court, 24 property, no tax)', () => {
    const counts = BOARD.reduce<Record<string, number>>((acc, tile) => {
      acc[tile.kind] = (acc[tile.kind] ?? 0) + 1
      return acc
    }, {})
    expect(counts).toEqual({
      start: 1,
      jail: 1,
      luckyClub: 1,
      fastbus: 1,
      luck: 3,
      court: 3,
      property: 24,
    })
  })
})

describe('bank movement math', () => {
  it('walks forward cell-by-cell, wrapping past 33', () => {
    expect(forwardSteps(0, 3)).toEqual([1, 2, 3])
    expect(forwardSteps(32, 4)).toEqual([33, 0, 1, 2])
    expect(forwardSteps(7, 0)).toEqual([])
  })

  it('lands on the right tile, wrapping past 33', () => {
    expect(landingTile(0, 7)).toBe(7)
    expect(landingTile(33, 3)).toBe(2)
    expect(landingTile(30, 4)).toBe(0)
  })

  it('passes Start exactly when from + n reaches 34', () => {
    expect(passesStart(0, 5)).toBe(false)
    expect(passesStart(32, 2)).toBe(true) // lands exactly on 0
    expect(passesStart(33, 1)).toBe(true)
    expect(passesStart(30, 3)).toBe(false) // lands on 33, no pass
    expect(passesStart(30, 5)).toBe(true)
  })
})

describe('bank property groups', () => {
  it('places every property in a valid group; color groups hold ≥ 2 tiles', () => {
    for (const tile of BOARD) {
      if (tile.kind !== 'property') continue
      expect(tile.group).toBeTruthy()
      expect(typeof tile.price).toBe('number')
      expect(typeof tile.rent).toBe('number')
      expect(PROPERTY_GROUPS[tile.group!]).toContain(tile.id)
    }
    // Every color band has ≥ 2 tiles; `U` is the single petrol utility.
    for (const [group, ids] of Object.entries(PROPERTY_GROUPS)) {
      if (group === 'U') continue
      expect(ids.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('accounts for all 24 property tiles across the groups', () => {
    const total = Object.values(PROPERTY_GROUPS).reduce((sum, ids) => sum + ids.length, 0)
    expect(total).toBe(24)
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
  it('returns all 88 grid cells (11×8) with 34 carrying a tile', () => {
    const cells = cellsInRenderOrder()
    expect(cells).toHaveLength(BANK_COLS * BANK_ROWS)
    expect(cells.filter((c) => c.tileId !== null)).toHaveLength(BOARD_TILES)
  })
})
