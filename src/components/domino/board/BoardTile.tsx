import { memo } from 'react'
import { m } from 'motion/react'
import { DominoTile } from './DominoTile'
import type { Pip } from '../../../domino/types'

interface BoardTileProps {
  cx: number
  cy: number
  leftPip: Pip
  rightPip: Pip
  isDouble: boolean
  glow: boolean
  /** Pixels per layout-unit. */
  unitPx: number
  tileLong: number
  tileShort: number
}

/**
 * One bone positioned on the serpentine line. Absolutely placed by transform (so
 * the whole board can be a single GPU-scaled layer) and `memo`'d on primitive
 * props — when a new tile lands, the existing tiles skip re-render entirely.
 */
export const BoardTile = memo(function BoardTile({
  cx,
  cy,
  leftPip,
  rightPip,
  isDouble,
  glow,
  unitPx,
  tileLong,
  tileShort,
}: BoardTileProps) {
  const left = (cx - tileLong / 2) * unitPx
  const top = (cy - tileShort / 2) * unitPx
  return (
    <m.div
      className="absolute"
      style={{ left, top }}
      initial={{ scale: 0.55, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 360, damping: 24 }}
    >
      <DominoTile
        pipA={leftPip}
        pipB={rightPip}
        orientation="h"
        size={tileShort * unitPx}
        glow={glow}
        className={isDouble ? 'ring-amber-300/40' : undefined}
      />
    </m.div>
  )
})
