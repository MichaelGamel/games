/**
 * Pure geometry + theming for snakes. No React here.
 *
 * Each snake is built as a *tapering ribbon*: we sample a gently-waving spine
 * from head to tail, compute per-sample normals and a width that tapers from a
 * plump head to a fine tail, then offset the spine to both sides to form a
 * closed outline. d3-shape's Catmull-Rom curve turns that outline into a smooth
 * filled body (and rounds the head/tail caps).
 *
 * The wave (bends, amplitude, phase) is derived deterministically from the
 * snake's head cell, so a given board always draws the same snakes — and
 * different snakes look different.
 */
import { line, curveCatmullRomClosed } from 'd3-shape'

export interface Pt {
  x: number
  y: number
}

export interface SnakeTheme {
  id: string
  light: string
  dark: string
  gloss: string
  pattern: string
  outline: string
  patternStyle: 'spots' | 'bands' | 'diamonds'
}

/** Distinct colors + markings so no two neighboring snakes look alike. */
export const SNAKE_THEMES: SnakeTheme[] = [
  { id: 'emerald', light: '#5ad07e', dark: '#1f9d4d', gloss: '#eafff0', pattern: '#0c5a32', outline: '#0c5a32', patternStyle: 'spots' },
  { id: 'crimson', light: '#ff7a6b', dark: '#cf3a2c', gloss: '#ffe9e4', pattern: '#7d1d15', outline: '#7d1d15', patternStyle: 'bands' },
  { id: 'azure', light: '#69b4ff', dark: '#2f6fd6', gloss: '#e6f1ff', pattern: '#16356f', outline: '#16356f', patternStyle: 'diamonds' },
  { id: 'amber', light: '#ffcf66', dark: '#e08a1e', gloss: '#fff4da', pattern: '#7a4a10', outline: '#7a4a10', patternStyle: 'spots' },
  { id: 'violet', light: '#bd8cff', dark: '#7c3aed', gloss: '#f1e8ff', pattern: '#3f1f72', outline: '#3f1f72', patternStyle: 'bands' },
  { id: 'teal', light: '#4fd6cd', dark: '#149a93', gloss: '#e0fffb', pattern: '#0c5651', outline: '#0c5651', patternStyle: 'diamonds' },
]

export function themeFor(index: number): SnakeTheme {
  return SNAKE_THEMES[index % SNAKE_THEMES.length]
}

export interface SnakeGeometry {
  bodyPath: string
  glossPath: string
  centers: Pt[]
  normals: Pt[]
  widths: number[]
  head: { pos: Pt; angle: number; width: number; front: Pt; normal: Pt; tip: Pt }
}

const SAMPLES = 44
const HEAD_W = 5.6
const TAIL_W = 0.9

/** Deterministic pseudo-random in [0,1) from a seed + salt. */
function hash01(seed: number, salt: number): number {
  const x = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

function norm(v: Pt): Pt {
  const l = Math.hypot(v.x, v.y) || 1
  return { x: v.x / l, y: v.y / l }
}

/** Plump just behind the head, tapering to a fine tail. */
function widthAt(t: number): number {
  return Math.max(TAIL_W, HEAD_W * Math.pow(1 - t, 0.7))
}

export function buildSnakeGeometry(head: Pt, tail: Pt, seed: number): SnakeGeometry {
  const dx = tail.x - head.x
  const dy = tail.y - head.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len

  const bends = 1 + (Math.floor(seed) % 3) // 1..3 gentle S-bends
  const amp = Math.min(3 + hash01(seed, 1) * 5, len * 0.42)
  const phase = hash01(seed, 2) * Math.PI * 2

  // Spine: a sine wave whose amplitude fades to 0 at both ends so the body
  // connects the head and tail cells exactly.
  const centers: Pt[] = []
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES
    const env = Math.sin(Math.PI * t)
    const off = Math.sin(phase + t * Math.PI * (bends + 1)) * amp * env
    centers.push({ x: head.x + dx * t + nx * off, y: head.y + dy * t + ny * off })
  }

  // Per-sample normals from the local tangent.
  const normals: Pt[] = centers.map((_, i) => {
    const a = centers[Math.max(0, i - 1)]
    const b = centers[Math.min(SAMPLES, i + 1)]
    const t = norm({ x: b.x - a.x, y: b.y - a.y })
    return { x: -t.y, y: t.x }
  })

  const widths = centers.map((_, i) => widthAt(i / SAMPLES))

  const left: [number, number][] = []
  const right: [number, number][] = []
  const glossL: [number, number][] = []
  const glossR: [number, number][] = []
  for (let i = 0; i <= SAMPLES; i++) {
    const w = widths[i] / 2
    const n = normals[i]
    const c = centers[i]
    left.push([c.x + n.x * w, c.y + n.y * w])
    right.push([c.x - n.x * w, c.y - n.y * w])
    const gw = w * 0.42
    glossL.push([c.x + n.x * gw, c.y + n.y * gw])
    glossR.push([c.x - n.x * gw, c.y - n.y * gw])
  }

  const toPath = line().curve(curveCatmullRomClosed)
  const bodyPath = toPath([...left, ...right.reverse()]) ?? ''
  const glossPath = toPath([...glossL, ...glossR.reverse()]) ?? ''

  const headTan = norm({ x: centers[1].x - centers[0].x, y: centers[1].y - centers[0].y })
  const front = { x: -headTan.x, y: -headTan.y }

  return {
    bodyPath,
    glossPath,
    centers,
    normals,
    widths,
    head: {
      pos: centers[1],
      angle: (Math.atan2(headTan.y, headTan.x) * 180) / Math.PI,
      width: widths[0],
      front,
      normal: normals[0],
      tip: centers[0],
    },
  }
}
