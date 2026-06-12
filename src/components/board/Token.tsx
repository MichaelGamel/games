import { memo } from 'react'
import { m, useReducedMotion, type Transition } from 'motion/react'
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
  /** Pawn diameter as a board percentage (scales with the board size). */
  sizePct: number
  /** Player holds a shield (specials rule) — shown as a small badge. */
  hasShield: boolean
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
 * A player's pawn. The outer m.div owns *position* (animated to the target
 * cell); the inner m.div owns *flourish* (lift, climb-bob, snake-wiggle)
 * so transforms never fight the centering translate.
 *
 * Memoized: all props are primitives, so while one token walks the board the
 * other (unchanged) pawns skip re-rendering entirely.
 */
export const Token = memo(function Token({
  name,
  color,
  x,
  y,
  sizePct,
  hasShield,
  kind,
  isMoving,
  isCurrent,
  z,
}: TokenProps) {
  const reduced = useReducedMotion()
  const scale = reduced ? 1 : 0.9

  const positionTransition: Transition =
    kind === 'ladder'
      ? { duration: (TIMING.jumpMs / 1000) * scale, ease: [0.4, 0, 0.2, 1] }
      : kind === 'snake'
        ? { duration: (TIMING.jumpMs / 1000) * scale, ease: [0.45, 0, 0.55, 1] }
        : kind === 'teleport'
          ? { duration: (TIMING.specialMs / 1000) * scale, ease: [0.34, 1.3, 0.64, 1] }
          : { type: 'spring', stiffness: 700, damping: 30, mass: 0.7 }

  // Inner flourish per move kind.
  const flourish =
    isMoving && !reduced
      ? kind === 'ladder'
        ? { scale: [1, 1.18, 1.05], y: ['0%', '-12%', '0%'] }
        : kind === 'snake'
          ? { rotate: [0, -14, 12, -8, 0], scaleY: [1, 0.82, 1.05, 1] }
          : kind === 'teleport'
            ? { scale: [1, 0.4, 1.3, 1], rotate: [0, 180, 360] }
            : { scale: 1.16 }
      : { scale: 1, rotate: 0, scaleY: 1, y: '0%' }

  return (
    <m.div
      className="absolute"
      style={{ x: '-50%', y: '-50%', width: `${sizePct}%`, height: `${sizePct}%`, zIndex: z }}
      initial={false}
      animate={{ left: `${x}%`, top: `${y}%` }}
      transition={positionTransition}
    >
      <m.div
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
          {hasShield && (
            <span
              className="absolute -right-1 -top-1 text-[1.6vmin] drop-shadow sm:text-xs"
              title="Shield: blocks the next snake"
              aria-label="holding a shield"
            >
              🛡️
            </span>
          )}
        </div>
      </m.div>
    </m.div>
  )
})
