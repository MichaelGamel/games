import { memo } from 'react'
import { m, useReducedMotion, type Transition } from 'motion/react'
import { cn } from '../../../lib/cn'

export type LudoMoveKind = 'step' | 'release' | 'home'

interface LudoTokenProps {
  /** This token's index within its seat (0..3); passed back to `onSelect`. */
  tokenId: number
  /** Player name — its initial is shown on the pawn. */
  name: string
  color: string
  /** Center position as board percentages (0–100). */
  x: number
  y: number
  /** How the token is currently moving (drives the transition + flourish). */
  kind: LudoMoveKind | null
  /** This token is the one currently animating. */
  isMoving: boolean
  /** It is this seat's turn (subtle glow). */
  isCurrent: boolean
  /** The player may tap this token to move it (selection pause). */
  selectable: boolean
  onSelect: (tokenId: number) => void
  /** Stacking order so the active / selectable token rides on top. */
  z: number
  /** Pawn diameter as a board percentage. */
  size: number
}

/**
 * A Ludo pawn. The outer `m.div` owns *position* (animated to the target
 * cell); the inner owns *flourish* (hop lift, base-pop, home sparkle, or the
 * idle bounce while selectable) so transforms never fight the centering
 * translate. A selectable token is a real focusable button.
 *
 * Memoized: all props are primitives or stable, so while one pawn animates the
 * other fifteen skip re-rendering entirely.
 */
export const LudoToken = memo(function LudoToken({
  tokenId,
  name,
  color,
  x,
  y,
  kind,
  isMoving,
  isCurrent,
  selectable,
  onSelect,
  z,
  size,
}: LudoTokenProps) {
  const reduced = useReducedMotion()

  const positionTransition: Transition =
    kind === 'release'
      ? { duration: reduced ? 0.12 : 0.36, ease: [0.34, 1.56, 0.64, 1] }
      : kind === 'home'
        ? { duration: reduced ? 0.12 : 0.4, ease: [0.4, 0, 0.2, 1] }
        : { type: 'spring', stiffness: 700, damping: 30, mass: 0.7 }

  const inner =
    isMoving && !reduced
      ? kind === 'release'
        ? { scale: [0.5, 1.2, 1], rotate: 0, y: '0%' }
        : kind === 'home'
          ? { scale: [1, 1.35, 1], rotate: [0, 12, -8, 0], y: '0%' }
          : { scale: 1.16, rotate: 0, y: '0%' }
      : selectable && !reduced
        ? { scale: [1, 1.08, 1], rotate: 0, y: ['0%', '-14%', '0%'] }
        : { scale: 1, rotate: 0, y: '0%' }

  const innerTransition: Transition = isMoving
    ? { duration: kind === 'step' ? 0.18 : 0.4 }
    : selectable
      ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' }
      : { duration: 0.2 }

  const discClass = cn(
    'relative grid h-full w-full place-items-center rounded-full',
    'shadow-[0_3px_6px_rgba(0,0,0,0.45)] ring-2 ring-white/70',
    selectable &&
      'animate-pulse-ring cursor-pointer ring-4 ring-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
  )
  const discStyle = {
    background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.9), rgba(255,255,255,0) 44%), ${color}`,
  }
  const initial = (
    <span className="text-[1.4vmin] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)] sm:text-[0.72rem]">
      {name.charAt(0).toUpperCase()}
    </span>
  )

  return (
    <m.div
      className="absolute"
      style={{
        x: '-50%',
        y: '-50%',
        width: `${size}%`,
        height: `${size}%`,
        zIndex: z,
        pointerEvents: selectable ? 'auto' : 'none',
      }}
      initial={false}
      animate={{ left: `${x}%`, top: `${y}%` }}
      transition={positionTransition}
    >
      <m.div className="relative h-full w-full" animate={inner} transition={innerTransition}>
        {isCurrent && (
          <span
            className="absolute inset-[-24%] rounded-full opacity-70 blur-[2px]"
            style={{ background: color }}
            aria-hidden="true"
          />
        )}
        {selectable ? (
          <button
            type="button"
            onClick={() => onSelect(tokenId)}
            aria-label={`Move ${name}'s token`}
            className={discClass}
            style={discStyle}
          >
            {initial}
          </button>
        ) : (
          <div className={discClass} style={discStyle}>
            {initial}
          </div>
        )}
      </m.div>
    </m.div>
  )
})
