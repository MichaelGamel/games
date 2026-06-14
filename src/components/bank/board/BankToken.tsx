import { memo } from 'react'
import { m, useReducedMotion } from 'motion/react'

interface BankTokenProps {
  name: string
  color: string
  /** Center position as board percentages (0–100). */
  x: number
  y: number
  /** This token is the one currently animating. */
  isMoving: boolean
  /** It is this seat's turn (subtle glow). */
  isCurrent: boolean
  /** Stacking order so the active token rides on top. */
  z: number
  /** Pawn diameter as a board percentage. */
  size: number
}

/**
 * A Bank El-Hazz pawn. The outer `m.div` owns *position* (animated to the
 * target tile's center); the inner owns the hop flourish so transforms never
 * fight the centering translate. Mirrors the Ludo token, minus selection.
 */
export const BankToken = memo(function BankToken({
  name,
  color,
  x,
  y,
  isMoving,
  isCurrent,
  z,
  size,
}: BankTokenProps) {
  const reduced = useReducedMotion()
  return (
    <m.div
      className="absolute"
      style={{ x: '-50%', y: '-50%', width: `${size}%`, height: `${size}%`, zIndex: z, pointerEvents: 'none' }}
      initial={false}
      animate={{ left: `${x}%`, top: `${y}%` }}
      transition={{ type: 'spring', stiffness: 700, damping: 30, mass: 0.7 }}
    >
      <m.div
        className="relative h-full w-full"
        animate={isMoving && !reduced ? { scale: 1.18 } : { scale: 1 }}
        transition={{ duration: 0.18 }}
      >
        {isCurrent && (
          <span
            className="absolute inset-[-26%] rounded-full opacity-70 blur-[2px]"
            style={{ background: color }}
            aria-hidden="true"
          />
        )}
        <div
          className="relative grid h-full w-full place-items-center rounded-full shadow-[0_3px_6px_rgba(0,0,0,0.45)] ring-2 ring-white/70"
          style={{ background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.9), rgba(255,255,255,0) 44%), ${color}` }}
        >
          <span className="text-[1.3vmin] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)] sm:text-[0.7rem]">
            {name.charAt(0).toUpperCase()}
          </span>
        </div>
      </m.div>
    </m.div>
  )
})
