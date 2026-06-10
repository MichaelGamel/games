import { cellToPercent } from '../../game/board'
import { LADDERS, SNAKES } from '../../game/config'
import { Snake } from './Snake'

/**
 * An SVG overlay that draws every ladder and snake between its two cell
 * centers. Uses a 0–100 viewBox so coordinates are simply board percentages
 * (matching cellToPercent), and scales with the responsive board.
 *
 * Ladders are simple rail-and-rung shapes; snakes are delegated to the d3-based
 * {@link Snake} component, which gives each a distinct color, marking, and
 * tapering body. Geometry only — no game state — so it never re-renders mid-play.
 */

interface Point {
  x: number
  y: number
}

function Ladder({ from, to, id }: { from: Point; to: Point; id: number }) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy)
  // Unit direction and perpendicular (normal) for the two rails.
  const ux = dx / len
  const uy = dy / len
  const nx = -uy
  const ny = ux
  const halfWidth = 2.4

  const railA = {
    x1: from.x + nx * halfWidth,
    y1: from.y + ny * halfWidth,
    x2: to.x + nx * halfWidth,
    y2: to.y + ny * halfWidth,
  }
  const railB = {
    x1: from.x - nx * halfWidth,
    y1: from.y - ny * halfWidth,
    x2: to.x - nx * halfWidth,
    y2: to.y - ny * halfWidth,
  }

  const rungCount = Math.max(2, Math.round(len / 4.5))
  const rungs = Array.from({ length: rungCount + 1 }, (_, i) => {
    const t = i / rungCount
    const cx = from.x + dx * t
    const cy = from.y + dy * t
    return {
      x1: cx + nx * halfWidth,
      y1: cy + ny * halfWidth,
      x2: cx - nx * halfWidth,
      y2: cy - ny * halfWidth,
    }
  })

  return (
    <g stroke={`url(#ladder-grad-${id})`} strokeLinecap="round" filter="url(#sl-shadow)">
      <line {...railA} strokeWidth={1.1} />
      <line {...railB} strokeWidth={1.1} />
      {rungs.map((r, i) => (
        <line key={i} {...r} strokeWidth={0.9} />
      ))}
    </g>
  )
}

export function SnakesLaddersLayer() {
  const ladders = Object.entries(LADDERS).map(([from, to]) => ({
    from: cellToPercent(Number(from)),
    to: cellToPercent(to),
  }))
  const snakes = Object.entries(SNAKES).map(([from, to]) => ({
    head: Number(from),
    tail: to,
  }))

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <filter id="sl-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0.6" stdDeviation="0.6" floodColor="#000" floodOpacity="0.35" />
        </filter>
        {/*
          userSpaceOnUse (not the default objectBoundingBox): a vertical/
          horizontal ladder's <line>s have a zero-area bounding box, which makes
          an objectBoundingBox gradient degenerate and the line paint as
          transparent. Anchoring the gradient to the ladder's actual endpoints
          fixes the otherwise-invisible vertical ladders (e.g. 71→91, 80→100).
        */}
        {ladders.map((l, i) => (
          <linearGradient
            key={i}
            id={`ladder-grad-${i}`}
            gradientUnits="userSpaceOnUse"
            x1={l.from.x}
            y1={l.from.y}
            x2={l.to.x}
            y2={l.to.y}
          >
            <stop offset="0%" stopColor="#e2a44f" />
            <stop offset="100%" stopColor="#b5651d" />
          </linearGradient>
        ))}
      </defs>

      {/* Ladders first, snakes on top so heads read clearly. */}
      {ladders.map((l, i) => (
        <Ladder key={`l-${i}`} id={i} from={l.from} to={l.to} />
      ))}
      {snakes.map((s, i) => (
        <Snake key={`s-${i}`} index={i} head={s.head} tail={s.tail} />
      ))}
    </svg>
  )
}
