import { memo } from 'react'
import type { Pip } from '../../../domino/types'
import { cn } from '../../../lib/cn'

/** Pip positions on a 3×3 grid (index 0..8, row-major) per face value. */
const PIP_CELLS: Record<Pip, number[]> = {
  0: [],
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

/** One half of a bone: a 3×3 grid of pips filling a square of side `size`. */
function PipFace({ value, size }: { value: Pip; size: number }) {
  const cells = PIP_CELLS[value]
  const dot = Math.max(2, Math.round(size * 0.15))
  return (
    <div
      className="grid"
      style={{
        width: size,
        height: size,
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'repeat(3, 1fr)',
        padding: size * 0.14,
      }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className="grid place-items-center">
          {cells.includes(i) && (
            <span
              className="rounded-full bg-night-900"
              style={{ width: dot, height: dot, boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.25)' }}
            />
          )}
        </span>
      ))}
    </div>
  )
}

interface DominoTileProps {
  /** First half (screen-left when horizontal, top when vertical). */
  pipA: Pip
  /** Second half (screen-right when horizontal, bottom when vertical). */
  pipB: Pip
  orientation?: 'h' | 'v'
  /** The SHORT side, in px. The long side is `2 × size`. */
  size: number
  faceDown?: boolean
  /** Soft glow — used for the open ends of the line / a playable hand tile. */
  glow?: boolean
  className?: string
}

/**
 * One domino bone, fully synthesized in CSS (no asset files): an ivory tile with
 * a centre groove and two 3×3 pip faces. `memo`'d on primitive props so an
 * unchanged tile never re-renders while a new one animates in.
 */
export const DominoTile = memo(function DominoTile({
  pipA,
  pipB,
  orientation = 'h',
  size,
  faceDown,
  glow,
  className,
}: DominoTileProps) {
  const horizontal = orientation === 'h'
  const w = horizontal ? size * 2 : size
  const h = horizontal ? size : size * 2
  const radius = Math.max(4, size * 0.16)

  if (faceDown) {
    return (
      <div
        className={cn('shrink-0 ring-1 ring-black/40 shadow-md', className)}
        style={{
          width: w,
          height: h,
          borderRadius: radius,
          background: 'linear-gradient(150deg, #20253c, #0c1020)',
        }}
        aria-hidden="true"
      />
    )
  }

  return (
    <div
      className={cn('relative shrink-0 ring-1 ring-black/25 shadow-md', className)}
      style={{
        width: w,
        height: h,
        borderRadius: radius,
        background: 'linear-gradient(150deg, #faf7ee, #e9e2cf)',
        boxShadow: glow
          ? '0 0 0 2px rgba(255,255,255,0.85), 0 0 14px 2px rgba(255,255,255,0.45)'
          : undefined,
      }}
      role="img"
      aria-label={`${pipA}-${pipB}`}
    >
      <div className={cn('flex h-full w-full', horizontal ? 'flex-row' : 'flex-col')}>
        <div className="grid flex-1 place-items-center">
          <PipFace value={pipA} size={size} />
        </div>
        <span
          className={cn('bg-night-900/15', horizontal ? 'w-px self-stretch' : 'h-px self-stretch')}
          aria-hidden="true"
        />
        <div className="grid flex-1 place-items-center">
          <PipFace value={pipB} size={size} />
        </div>
      </div>
    </div>
  )
})
