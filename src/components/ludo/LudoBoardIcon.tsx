import { useId } from 'react'
import { LUDO_COLORS } from '../../ludo/config'

/**
 * A miniature Ludo board, used as the game's logo wherever a single recognisable
 * mark is needed (the hub card, the menu header). It mirrors the real board's
 * layout — four colored home quadrants in classic seating order, a white cross
 * track with colored home lanes, and the four-triangle centre — so the logo and
 * the board it links to never drift apart. Colors come from the same single
 * source of truth as the game (`LUDO_COLORS`).
 */
const [RED, GREEN, YELLOW, BLUE] = LUDO_COLORS.map((c) => c.value)

/** Home quadrants in board order: TL red, TR green, BR yellow, BL blue. */
const CORNERS = [
  { x: 0, y: 0, color: RED },
  { x: 60, y: 0, color: GREEN },
  { x: 60, y: 60, color: YELLOW },
  { x: 0, y: 60, color: BLUE },
] as const

/** Four resting dots inside each home quadrant's white nest. */
const DOT_OFFSETS = [
  [14, 14],
  [26, 14],
  [14, 26],
  [26, 26],
] as const

/** Each seat's colored home lane, running up the middle of its cross arm. */
const LANES = [
  { x: 46.667, y: 0, w: 6.667, h: 40, color: GREEN }, // top arm
  { x: 60, y: 46.667, w: 40, h: 6.667, color: YELLOW }, // right arm
  { x: 46.667, y: 60, w: 6.667, h: 40, color: BLUE }, // bottom arm
  { x: 0, y: 46.667, w: 40, h: 6.667, color: RED }, // left arm
] as const

/** The four centre triangles, each pointing back toward its seat's arm. */
const TRIANGLES = [
  { points: '40,40 60,40 50,50', color: GREEN }, // top
  { points: '60,40 60,60 50,50', color: YELLOW }, // right
  { points: '60,60 40,60 50,50', color: BLUE }, // bottom
  { points: '40,60 40,40 50,50', color: RED }, // left
] as const

interface LudoBoardIconProps {
  className?: string
  /** Accessible label; omit when the icon is purely decorative beside a text label. */
  title?: string
}

export function LudoBoardIcon({ className, title }: LudoBoardIconProps) {
  const clipId = useId()
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={title ?? 'Ludo board'}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width="100" height="100" rx="14" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {/* white cross / track fills the whole board behind everything */}
        <rect width="100" height="100" fill="#ffffff" />

        {CORNERS.map((c) => (
          <g key={`corner-${c.x}-${c.y}`}>
            <rect x={c.x} y={c.y} width="40" height="40" fill={c.color} />
            <rect x={c.x + 7} y={c.y + 7} width="26" height="26" rx="6" fill="#ffffff" />
            {DOT_OFFSETS.map(([ox, oy]) => (
              <circle key={`dot-${ox}-${oy}`} cx={c.x + ox} cy={c.y + oy} r="3.2" fill={c.color} />
            ))}
          </g>
        ))}

        {LANES.map((l) => (
          <rect key={`lane-${l.x}-${l.y}`} x={l.x} y={l.y} width={l.w} height={l.h} fill={l.color} />
        ))}

        {TRIANGLES.map((t) => (
          <polygon key={`tri-${t.points}`} points={t.points} fill={t.color} />
        ))}
      </g>
      <rect
        x="0.5"
        y="0.5"
        width="99"
        height="99"
        rx="14"
        fill="none"
        stroke="rgba(0,0,0,0.12)"
      />
    </svg>
  )
}
