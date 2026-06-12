import { rcToPercent } from '../../../ludo/board'
import type { RC } from '../../../ludo/config'

interface LudoBaseNestProps {
  color: string
  /** This seat's four base-slot coordinates (from `BASE_NEST_COORDS`). */
  nest: readonly RC[]
}

/**
 * The decorative "home base" panel in a seat's corner: a colored rounded square
 * with a pale inner well. The seat's idle tokens render on top (in the token
 * layer) at the four slot positions, so this is purely chrome.
 */
export function LudoBaseNest({ color, nest }: LudoBaseNestProps) {
  const pts = nest.map(([row, col]) => rcToPercent({ row, col }))
  const minX = Math.min(...pts.map((p) => p.x))
  const maxX = Math.max(...pts.map((p) => p.x))
  const minY = Math.min(...pts.map((p) => p.y))
  const maxY = Math.max(...pts.map((p) => p.y))
  const pad = 9 // percent — fills the surrounding corner quadrant

  return (
    <div
      className="absolute rounded-2xl shadow-[inset_0_0_0_2px_rgba(255,255,255,0.35)]"
      style={{
        left: `${minX - pad}%`,
        top: `${minY - pad}%`,
        width: `${maxX - minX + pad * 2}%`,
        height: `${maxY - minY + pad * 2}%`,
        background: color,
      }}
    >
      <div className="absolute inset-[14%] rounded-xl bg-white/85 shadow-inner" />
    </div>
  )
}
