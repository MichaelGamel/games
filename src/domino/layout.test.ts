import { describe, it, expect } from 'vitest'
import { computeLayout } from './layout'
import { tileById } from './deck'
import type { DominoLine, PlacedTile } from './types'

const placed = (id: string, flip = false): PlacedTile => {
  const tile = tileById(id)!
  return { tile, flip, isDouble: tile.a === tile.b }
}
const mkLine = (ids: string[]): DominoLine => ({
  tiles: ids.map((id) => placed(id)),
  leftEnd: 0,
  rightEnd: 0,
})

const opts = { perRow: 3, tileLong: 2, tileShort: 1, gap: 0, rowGap: 1 }

describe('computeLayout', () => {
  it('returns nothing for an empty line', () => {
    const r = computeLayout({ tiles: [], leftEnd: null, rightEnd: null }, opts)
    expect(r.tiles).toHaveLength(0)
    expect(r.head).toBeNull()
    expect(r.tail).toBeNull()
  })

  it('packs a short line left-to-right on one row', () => {
    const r = computeLayout(mkLine(['d0', 'd1', 'd2']), opts)
    expect(r.tiles.map((t) => t.cx)).toEqual([1, 3, 5])
    expect(r.tiles.every((t) => t.cy === 0.5)).toBe(true)
    expect(r.head).toMatchObject({ side: 'left', cx: 1 })
    expect(r.tail).toMatchObject({ side: 'right', cx: 5 })
    expect(r.width).toBe(6)
    expect(r.height).toBe(1)
  })

  it('wraps the serpentine to a reversed second row', () => {
    const r = computeLayout(mkLine(['d0', 'd1', 'd2', 'd3']), opts)
    const fourth = r.tiles[3]
    expect(fourth.cy).toBe(2.5) // dropped to the next row
    expect(fourth.cx).toBe(5) // directly below the third tile
    expect(r.tail).toMatchObject({ side: 'left' }) // odd row runs right-to-left
    expect(r.height).toBe(3)
  })

  it('flips the displayed pip order on right-to-left rows', () => {
    // d8 = 1-2, flip false → incoming 1, outgoing 2.
    const r = computeLayout(mkLine(['d0', 'd0', 'd0', 'd8']), opts)
    const wrapTile = r.tiles[3]
    // On the reversed row, outgoing sits screen-left, incoming screen-right.
    expect(wrapTile.leftPip).toBe(2)
    expect(wrapTile.rightPip).toBe(1)
  })
})
