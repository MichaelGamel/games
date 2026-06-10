import { useMemo, type ReactNode } from 'react'
import { cellToPercent } from '../../game/board'
import { buildSnakeGeometry, themeFor } from './snakeStyles'

interface SnakeProps {
  /** Head cell (the higher number) and tail cell (the lower number). */
  head: number
  tail: number
  index: number
  /**
   * Which visual layer to emit. SVG has no z-index — only document order — so
   * the parent draws every snake's `'body'` first, then every snake's `'head'`
   * in a second pass. That guarantees no snake's body is ever painted over
   * another snake's face. `'body'` also owns the shared `<defs>` (gradient +
   * clip path) that the head layer references by id.
   */
  layer: 'body' | 'head'
}

/** A single snake: tapering d3 body, themed markings, a defined head + eyes. */
export function Snake({ head, tail, index, layer }: SnakeProps) {
  const theme = themeFor(index)
  const geom = useMemo(
    () => buildSnakeGeometry(cellToPercent(head), cellToPercent(tail), head),
    [head, tail],
  )

  const gradId = `snake-grad-${index}`
  const clipId = `snake-clip-${index}`
  const { centers, normals, widths, head: hd } = geom

  // Markings, sampled along the body and clipped to it.
  const markings: ReactNode[] = []
  for (let i = 5; i < centers.length - 3; i += 3) {
    const c = centers[i]
    const n = normals[i]
    const w = widths[i]
    if (theme.patternStyle === 'spots') {
      const side = i % 6 === 5 ? 1 : -1
      markings.push(
        <circle
          key={i}
          cx={c.x + n.x * w * 0.16 * side}
          cy={c.y + n.y * w * 0.16 * side}
          r={Math.max(0.5, w * 0.2)}
          fill={theme.pattern}
          opacity={0.85}
        />,
      )
    } else if (theme.patternStyle === 'bands') {
      markings.push(
        <line
          key={i}
          x1={c.x + n.x * w * 0.5}
          y1={c.y + n.y * w * 0.5}
          x2={c.x - n.x * w * 0.5}
          y2={c.y - n.y * w * 0.5}
          stroke={theme.pattern}
          strokeWidth={Math.max(0.6, w * 0.32)}
          strokeLinecap="round"
          opacity={0.8}
        />,
      )
    } else {
      const s = Math.max(0.6, w * 0.32)
      markings.push(
        <rect
          key={i}
          x={c.x - s}
          y={c.y - s}
          width={s * 2}
          height={s * 2}
          fill={theme.pattern}
          opacity={0.8}
          transform={`rotate(45 ${c.x} ${c.y})`}
        />,
      )
    }
  }

  // Eyes sit on the head, just forward of its center.
  const eyeCenter = { x: hd.pos.x + hd.front.x * hd.width * 0.12, y: hd.pos.y + hd.front.y * hd.width * 0.12 }
  const eyeOffset = hd.width * 0.3
  const eye = (s: number) => ({
    x: eyeCenter.x + hd.normal.x * eyeOffset * s,
    y: eyeCenter.y + hd.normal.y * eyeOffset * s,
  })
  const e1 = eye(1)
  const e2 = eye(-1)
  const eyeR = hd.width * 0.2
  const pupilR = hd.width * 0.1

  // Forked tongue flicking out past the head tip.
  const tForkStart = { x: hd.tip.x + hd.front.x * hd.width * 0.4, y: hd.tip.y + hd.front.y * hd.width * 0.4 }
  const tForkEnd = { x: hd.tip.x + hd.front.x * hd.width * 0.95, y: hd.tip.y + hd.front.y * hd.width * 0.95 }
  const tForkN = { x: hd.normal.x * hd.width * 0.22, y: hd.normal.y * hd.width * 0.22 }

  // Body layer: also declares the shared <defs> (gradient + clip path) that the
  // head layer references by id.
  if (layer === 'body') {
    return (
      <g filter="url(#sl-shadow)">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={theme.light} />
            <stop offset="100%" stopColor={theme.dark} />
          </linearGradient>
          <clipPath id={clipId}>
            <path d={geom.bodyPath} />
          </clipPath>
        </defs>

        {/* body + markings */}
        <path d={geom.bodyPath} fill={`url(#${gradId})`} stroke={theme.outline} strokeWidth={0.7} />
        <g clipPath={`url(#${clipId})`}>
          <path d={geom.glossPath} fill={theme.gloss} opacity={0.35} />
          {markings}
        </g>
      </g>
    )
  }

  // Head layer: the face (tongue + head + eyes), drawn after every body so it
  // is never covered by another snake.
  return (
    <g filter="url(#sl-shadow)">
      {/* tongue (drawn under the head) */}
      <g stroke="#e11d48" strokeWidth={Math.max(0.4, hd.width * 0.12)} strokeLinecap="round" fill="none">
        <line x1={hd.tip.x} y1={hd.tip.y} x2={tForkStart.x} y2={tForkStart.y} />
        <line x1={tForkStart.x} y1={tForkStart.y} x2={tForkEnd.x + tForkN.x} y2={tForkEnd.y + tForkN.y} />
        <line x1={tForkStart.x} y1={tForkStart.y} x2={tForkEnd.x - tForkN.x} y2={tForkEnd.y - tForkN.y} />
      </g>

      {/* head */}
      <g transform={`rotate(${hd.angle} ${hd.pos.x} ${hd.pos.y})`}>
        <ellipse
          cx={hd.pos.x}
          cy={hd.pos.y}
          rx={hd.width * 0.72}
          ry={hd.width * 0.6}
          fill={`url(#${gradId})`}
          stroke={theme.outline}
          strokeWidth={0.7}
        />
      </g>

      {/* eyes */}
      <circle cx={e1.x} cy={e1.y} r={eyeR} fill="#fff" stroke={theme.outline} strokeWidth={0.3} />
      <circle cx={e2.x} cy={e2.y} r={eyeR} fill="#fff" stroke={theme.outline} strokeWidth={0.3} />
      <circle cx={e1.x} cy={e1.y} r={pupilR} fill="#0b0b0b" />
      <circle cx={e2.x} cy={e2.y} r={pupilR} fill="#0b0b0b" />
    </g>
  )
}
