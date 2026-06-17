/**
 * Pure chain-layout for the domino line. Walks the ordered, oriented line and
 * lays it out as a **serpentine**: rows alternate direction (left-to-right, then
 * right-to-left) so the chain snakes down the board and the whole line stays
 * compact. The board renders these positions with GPU transforms and auto-scales
 * the bounding box to fit, so an arbitrarily long line is always fully visible.
 *
 * Framework-free and deterministic — the one genuinely new algorithm in the
 * game, so it is unit-tested (`layout.test.ts`). All coordinates are in abstract
 * tile-units; the board multiplies by a single pixel scale.
 */
import { firstPip, secondPip } from './rules'
import type { DominoLine, Pip } from './types'

export interface TileLayout {
  id: string
  /** Center, in tile-units. */
  cx: number
  cy: number
  /** Pip shown on the screen-left half / screen-right half. */
  leftPip: Pip
  rightPip: Pip
  isDouble: boolean
}

/** An open end of the line (the head or the tail), for the "play here" hint. */
export interface EndMarker {
  cx: number
  cy: number
  /** Which screen side of the end tile is open. */
  side: 'left' | 'right'
}

export interface LayoutResult {
  tiles: TileLayout[]
  /** Bounding box, in tile-units (origin at 0,0). */
  width: number
  height: number
  /** The open head end (matches `line.leftEnd`), or null on an empty line. */
  head: EndMarker | null
  /** The open tail end (matches `line.rightEnd`), or null on an empty line. */
  tail: EndMarker | null
}

export interface LayoutOptions {
  perRow: number
  tileLong: number
  tileShort: number
  gap: number
  rowGap: number
}

export function computeLayout(line: DominoLine, opts: LayoutOptions): LayoutResult {
  const { perRow, tileLong, tileShort, gap, rowGap } = opts
  const tileStep = tileLong + gap
  const rowStep = tileShort + rowGap

  const tiles: TileLayout[] = []
  let width = 0
  let height = 0

  line.tiles.forEach((p, i) => {
    // Reading along the chain: `incoming` touches the previous tile / head end,
    // `outgoing` is the open/forward pip.
    const incoming: Pip = firstPip(p.tile, p.flip)
    const outgoing: Pip = secondPip(p.tile, p.flip)

    const row = Math.floor(i / perRow)
    const local = i % perRow
    const dir = row % 2 === 0 ? 1 : -1
    // Even rows run left→right; odd rows right→left, so consecutive rows connect
    // vertically at the wrap.
    const screenCol = dir === 1 ? local : perRow - 1 - local
    const cx = screenCol * tileStep + tileLong / 2
    const cy = row * rowStep + tileShort / 2

    const leftPip = dir === 1 ? incoming : outgoing
    const rightPip = dir === 1 ? outgoing : incoming

    tiles.push({ id: p.tile.id, cx, cy, leftPip, rightPip, isDouble: p.isDouble })
    width = Math.max(width, cx + tileLong / 2)
    height = Math.max(height, cy + tileShort / 2)
  })

  let head: EndMarker | null = null
  let tail: EndMarker | null = null
  if (tiles.length > 0) {
    const first = tiles[0]
    head = { cx: first.cx, cy: first.cy, side: 'left' }
    const last = tiles[tiles.length - 1]
    const lastRow = Math.floor((line.tiles.length - 1) / perRow)
    const lastDir = lastRow % 2 === 0 ? 1 : -1
    tail = { cx: last.cx, cy: last.cy, side: lastDir === 1 ? 'right' : 'left' }
  }

  return { tiles, width, height, head, tail }
}
