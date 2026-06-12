import { m } from 'motion/react'

interface DirectionIndicatorProps {
  /** +1 clockwise, -1 counter-clockwise. */
  direction: 1 | -1
  size?: number
}

/** A circular arrow that spins to show (and flip with) the play direction. */
export function DirectionIndicator({ direction, size = 40 }: DirectionIndicatorProps) {
  return (
    <m.div
      aria-hidden="true"
      className="grid place-items-center rounded-full bg-white/5 ring-1 ring-white/15"
      style={{ width: size, height: size }}
      animate={{ rotate: direction === 1 ? 0 : 180 }}
      transition={{ type: 'spring', stiffness: 200, damping: 18 }}
    >
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none">
        <path
          d="M20 12a8 8 0 1 1-2.34-5.66"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          className="text-white/80"
        />
        <path d="M20 4v4h-4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-white/80" />
      </svg>
    </m.div>
  )
}
