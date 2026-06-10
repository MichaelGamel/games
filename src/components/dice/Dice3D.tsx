import { useEffect, useRef } from 'react'
import { motion, useAnimationControls, useReducedMotion } from 'motion/react'
import type { DieValue } from '../../game/types'

/**
 * A real 3D die built from six CSS faces in a `preserve-3d` cube. A roll spins
 * the cube several full turns and settles on the orientation that brings the
 * rolled value to the front (faces are arranged so opposite sides sum to 7,
 * like a real die). A persistent rest tilt keeps three faces visible so it
 * always reads as a cube, not a flat square.
 */

interface Dice3DProps {
  value: DieValue | null
  /** Rising edge of this (set true during the tumble) triggers a new roll. */
  rolling: boolean
  size?: number
}

const SPINS = 4
/** Cube rotation (deg) that brings each value to the front face. */
const FACE_ROTATION: Record<DieValue, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: -90, y: 0 },
  3: { x: 0, y: -90 },
  4: { x: 0, y: 90 },
  5: { x: 90, y: 0 },
  6: { x: 0, y: 180 },
}
/** Keeps the die looking 3D at rest. */
const REST_TILT = { x: -18, y: 16 }

/** Which value lives on each placed face, and how the face is positioned. */
const FACES: { value: DieValue; transform: (h: number) => string }[] = [
  { value: 1, transform: (h) => `translateZ(${h}px)` },
  { value: 6, transform: (h) => `rotateY(180deg) translateZ(${h}px)` },
  { value: 3, transform: (h) => `rotateY(90deg) translateZ(${h}px)` },
  { value: 4, transform: (h) => `rotateY(-90deg) translateZ(${h}px)` },
  { value: 2, transform: (h) => `rotateX(90deg) translateZ(${h}px)` },
  { value: 5, transform: (h) => `rotateX(-90deg) translateZ(${h}px)` },
]

const PIP_GRID: Record<DieValue, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
}

/** Rotate forward by ≥SPINS full turns, landing on an orientation ≡ target. */
function spinTo(current: number, target: number): number {
  const delta = (((target - current) % 360) + 360) % 360
  return current + 360 * SPINS + delta
}

function Pips({ value }: { value: DieValue }) {
  const active = new Set(PIP_GRID[value])
  return (
    <div className="grid h-full w-full grid-cols-3 grid-rows-3 gap-[10%] p-[15%]">
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className={
            active.has(i + 1)
              ? 'rounded-full bg-night-900 shadow-[inset_0_-1px_2px_rgba(0,0,0,0.5)]'
              : ''
          }
        />
      ))}
    </div>
  )
}

export function Dice3D({ value, rolling, size = 84 }: Dice3DProps) {
  const controls = useAnimationControls()
  const rot = useRef({ x: REST_TILT.x, y: REST_TILT.y })
  const reduced = useReducedMotion()
  const shown = value ?? 1

  useEffect(() => {
    if (!rolling) return
    const base = FACE_ROTATION[shown]
    rot.current = {
      x: spinTo(rot.current.x, base.x + REST_TILT.x),
      y: spinTo(rot.current.y, base.y + REST_TILT.y),
    }
    const duration = reduced ? 0.25 : 0.95
    void controls.start({
      rotateX: rot.current.x,
      rotateY: rot.current.y,
      scale: reduced ? 1 : [1, 1.16, 0.92, 1.05, 1],
      transition: {
        duration,
        ease: [0.16, 0.84, 0.3, 1],
        scale: { duration, times: [0, 0.5, 0.74, 0.9, 1] },
      },
    })
  }, [rolling, shown, controls, reduced])

  return (
    <div className="scene-3d grid place-items-center" style={{ width: size, height: size }}>
      <motion.div
        className="relative"
        style={{ width: size, height: size, transformStyle: 'preserve-3d' }}
        initial={{ rotateX: REST_TILT.x, rotateY: REST_TILT.y }}
        animate={controls}
      >
        {FACES.map((face) => (
          <div
            key={face.value}
            className="absolute inset-0 rounded-[16%] border border-black/10 bg-linear-to-br from-white to-slate-200 shadow-inner"
            style={{ transform: face.transform(size / 2), backfaceVisibility: 'hidden' }}
          >
            <Pips value={face.value} />
          </div>
        ))}
      </motion.div>
    </div>
  )
}
