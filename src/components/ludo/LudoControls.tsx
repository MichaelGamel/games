import { motion } from 'motion/react'
import type { DieValue, LudoPhase } from '../../ludo/types'
import { LudoDice } from './dice/LudoDice'
import { cn } from '../../lib/cn'

interface LudoControlsProps {
  phase: LudoPhase
  lastRoll: DieValue | null
  accentColor: string
  muted: boolean
  /** Whether the roll button is actionable (idle + your turn). */
  canRoll: boolean
  /** Label for the primary button (e.g. "Roll Dice", "Pick a token"). */
  rollLabel: string
  /** Secondary button text + handler ("New Game" locally, "Leave" online). */
  secondaryLabel: string
  onRoll: () => void
  onToggleMute: () => void
  onSecondary: () => void
}

/**
 * Dice + actions, mirroring the Snakes `Controls`: a compact horizontal bar on
 * mobile and a stacked card on desktop. The roll button is inert during the
 * `selecting` pause (you tap a token on the board instead).
 */
export function LudoControls({
  phase,
  lastRoll,
  accentColor,
  muted,
  canRoll,
  rollLabel,
  secondaryLabel,
  onRoll,
  onToggleMute,
  onSecondary,
}: LudoControlsProps) {
  return (
    <div className="flex w-full items-center gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10 backdrop-blur lg:flex-col lg:gap-5 lg:p-5">
      <LudoDice value={lastRoll} rolling={phase === 'rolling'} />

      <div className="flex min-w-0 flex-1 flex-col gap-2 lg:w-full lg:flex-none lg:gap-5">
        <motion.button
          type="button"
          onClick={onRoll}
          disabled={!canRoll}
          whileHover={canRoll ? { scale: 1.04 } : undefined}
          whileTap={canRoll ? { scale: 0.95 } : undefined}
          className={cn(
            'w-full truncate rounded-xl px-4 py-2.5 text-base font-bold text-white shadow-lg transition lg:px-6 lg:py-3 lg:text-lg',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
            canRoll ? 'cursor-pointer' : 'cursor-not-allowed opacity-60',
          )}
          style={{
            background: canRoll
              ? `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`
              : 'rgba(255,255,255,0.12)',
          }}
        >
          {rollLabel}
        </motion.button>

        <div className="flex w-full items-center justify-between gap-3 text-sm">
          <button
            type="button"
            onClick={onToggleMute}
            aria-pressed={muted}
            aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-white/80 ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <span aria-hidden="true">{muted ? '🔇' : '🔊'}</span>
            {muted ? 'Muted' : 'Sound'}
          </button>

          <button
            type="button"
            onClick={onSecondary}
            className="rounded-lg px-3 py-1.5 text-white/80 ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            {secondaryLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
