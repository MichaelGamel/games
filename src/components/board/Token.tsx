import { motion, useReducedMotion, type Transition } from 'motion/react'
import type { ActiveMove } from '../../game/types'
import { TIMING } from '../../game/config'
import { cn } from '../../lib/cn'

type MoveKind = ActiveMove['kind'] | null

interface TokenProps {
  name: string
  color: string
  /** Center position as board percentages (0–100). */
  x: number
  y: number
  /** How the token is currently moving (drives the transition + flourish). */
  kind: MoveKind
  /** This token is the one currently animating. */
  isMoving: boolean
  /** It is this player's turn (and the board is idle). */
  isCurrent: boolean
  /** Stacking order so the active token rides on top. */
  z: number
}

/**
 * A player's pawn. The outer motion.div owns *position* (animated to the target
 * cell); the inner motion.div owns *flourish* (lift, climb-bob, snake-wiggle)
 * so transforms never fight the centering translate.
 */
export function Token({ name, color, x, y, kind, isMoving, isCurrent, z }: TokenProps) {
  const reduced = useReducedMotion()
  const scale = reduced ? 1 : 0.9

  const positionTransition: Transition =
    kind === 'ladder'
      ? { duration: (TIMING.jumpMs / 1000) * scale, ease: [0.4, 0, 0.2, 1] }
      : kind === 'snake'
        ? { duration: (TIMING.jumpMs / 1000) * scale, ease: [0.45, 0, 0.55, 1] }
        : { type: 'spring', stiffness: 700, damping: 30, mass: 0.7 }

  // Inner flourish per move kind.
  const flourish =
    isMoving && !reduced
      ? kind === 'ladder'
        ? { scale: [1, 1.18, 1.05], y: ['0%', '-12%', '0%'] }
        : kind === 'snake'
          ? { rotate: [0, -14, 12, -8, 0], scaleY: [1, 0.82, 1.05, 1] }
          : { scale: 1.16 }
      : { scale: 1, rotate: 0, scaleY: 1, y: '0%' }

  return (
    <motion.div
      className="absolute"
      style={{ x: '-50%', y: '-50%', width: '8.6%', height: '8.6%', zIndex: z }}
      initial={false}
      animate={{ left: `${x}%`, top: `${y}%` }}
      transition={positionTransition}
    >
      <motion.div
        className="relative h-full w-full"
        animate={flourish}
        transition={{ duration: kind === 'walk' ? 0.18 : TIMING.jumpMs / 1000 }}
      >
        {/* glow ring on the active player */}
        {isCurrent && (
          <span
            className="absolute inset-[-22%] rounded-full opacity-70 blur-[2px]"
            style={{ background: color }}
          />
        )}
        {/* the pawn disc */}
        <div
          className={cn(
            'relative grid h-full w-full place-items-center rounded-full',
            'shadow-[0_3px_6px_rgba(0,0,0,0.45)] ring-2 ring-white/70',
          )}
          style={{
            background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.85), rgba(255,255,255,0) 42%), ${color}`,
          }}
        >
          <span className="text-[1.7vmin] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)] sm:text-[0.8rem]">
            {name.charAt(0).toUpperCase()}
          </span>
        </div>
      </motion.div>
    </motion.div>
  )
}
