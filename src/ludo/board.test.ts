import { describe, expect, it } from 'vitest'
import {
  cellsInRenderOrder,
  isSafe,
  mainTrackCell,
  tokenCoords,
} from './board'
import {
  BASE_NEST_COORDS,
  HOME_COLUMN_COORDS,
  HOME_GOAL_COORDS,
  LAST_RING_PROGRESS,
  LUDO_BOARD_SIZE,
  PROGRESS_GOAL,
  RING_COORDS,
  RING_LENGTH,
  START_OFFSETS,
  type RC,
} from './config'

const key = (r: number, c: number) => `${r},${c}`
const chebyshev = (a: RC, b: RC) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]))

describe('ring geometry', () => {
  it('has 52 unique cells, all in bounds', () => {
    expect(RING_COORDS).toHaveLength(RING_LENGTH)
    const seen = new Set(RING_COORDS.map(([r, c]) => key(r, c)))
    expect(seen.size).toBe(RING_LENGTH)
    for (const [r, c] of RING_COORDS) {
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThan(LUDO_BOARD_SIZE)
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThan(LUDO_BOARD_SIZE)
    }
  })

  it('is a closed loop of board-adjacent cells (king steps at the 4 turns)', () => {
    for (let i = 0; i < RING_LENGTH; i++) {
      const a = RING_COORDS[i]
      const b = RING_COORDS[(i + 1) % RING_LENGTH]
      expect(chebyshev(a, b)).toBe(1)
    }
  })
})

describe('per-seat start mapping', () => {
  it('each seat enters at an offset 13 cells apart', () => {
    expect(START_OFFSETS).toEqual([0, 13, 26, 39])
    for (let seat = 0; seat < 4; seat++) {
      expect(mainTrackCell(seat, 0)).toBe(START_OFFSETS[seat])
      expect(tokenCoords(seat, 0, 0)).toEqual({
        row: RING_COORDS[START_OFFSETS[seat]][0],
        col: RING_COORDS[START_OFFSETS[seat]][1],
      })
    }
  })

  it('seat 0 and seat 2 sit half a board apart', () => {
    expect(mainTrackCell(0, 0)).toBe(0)
    expect(mainTrackCell(2, 0)).toBe(26)
  })

  it('the last ring cell sits next to the first home-column cell', () => {
    for (let seat = 0; seat < 4; seat++) {
      const ring = tokenCoords(seat, 0, LAST_RING_PROGRESS)
      const home = tokenCoords(seat, 0, LAST_RING_PROGRESS + 1)
      const d = Math.max(Math.abs(ring.row - home.row), Math.abs(ring.col - home.col))
      expect(d).toBe(1)
    }
  })
})

describe('mainTrackCell — only the shared ring is public', () => {
  it('returns null off the ring (base, home column, goal)', () => {
    expect(mainTrackCell(0, -1)).toBeNull() // base
    expect(mainTrackCell(0, LAST_RING_PROGRESS + 1)).toBeNull() // home column
    expect(mainTrackCell(0, PROGRESS_GOAL)).toBeNull() // completed
  })

  it('wraps around the ring for every seat', () => {
    expect(mainTrackCell(1, 50)).toBe((13 + 50) % 52) // 11
    expect(mainTrackCell(3, 20)).toBe((39 + 20) % 52) // 7
  })
})

describe('no overlap between cell roles', () => {
  it('ring, home columns, goals, and base nests are mutually disjoint', () => {
    const buckets: RC[][] = [
      [...RING_COORDS],
      HOME_COLUMN_COORDS.flat(),
      [...HOME_GOAL_COORDS],
      BASE_NEST_COORDS.flat(),
    ]
    const all = buckets.flat()
    const seen = new Set(all.map(([r, c]) => key(r, c)))
    expect(seen.size).toBe(all.length)
  })

  it('every home column has 5 cells and every base nest has 4', () => {
    for (let seat = 0; seat < 4; seat++) {
      expect(HOME_COLUMN_COORDS[seat]).toHaveLength(5)
      expect(BASE_NEST_COORDS[seat]).toHaveLength(4)
    }
  })
})

describe('safe cells', () => {
  it('marks the 4 entries and 4 stars as safe', () => {
    for (const c of [0, 13, 26, 39, 8, 21, 34, 47]) expect(isSafe(c)).toBe(true)
  })

  it('treats ordinary cells as unsafe', () => {
    for (const c of [1, 5, 12, 20, 30, 45, 51]) expect(isSafe(c)).toBe(false)
  })
})

describe('cellsInRenderOrder', () => {
  it('lists all 225 cells, top-left first, bottom-right last', () => {
    const cells = cellsInRenderOrder()
    expect(cells).toHaveLength(LUDO_BOARD_SIZE * LUDO_BOARD_SIZE)
    expect(cells[0]).toEqual({ row: 0, col: 0 })
    expect(cells[cells.length - 1]).toEqual({ row: 14, col: 14 })
  })
})
