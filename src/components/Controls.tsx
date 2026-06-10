import { motion } from 'motion/react'
import type { DieValue, Phase } from '../game/types'
import { Dice3D } from './dice/Dice3D'
import { cn } from '../lib/cn'

interface ControlsProps {
  phase: Phase
  lastRoll: DieValue | null
  accentColor: string
  muted: boolean
  /** Whether the roll button is currently actionable (idle + your turn). */
  canRoll: boolean
  /** Label for the primary button (e.g. "Roll Dice", "Opponent's turn"). */
  rollLabel: string
  /** Secondary button text + handler ("New Game" locally, "Leave" online). */
  secondaryLabel: string
  onRoll: () => void
  onToggleMute: () => void
  onSecondary: () => void
}

export function Controls({
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
}: ControlsProps) {
  return (
    <div className="flex flex-col items-center gap-5 rounded-2xl bg-white/5 p-5 ring-1 ring-white/10 backdrop-blur">
      <Dice3D value={lastRoll} rolling={phase === 'rolling'} />

      <motion.button
        type="button"
        onClick={onRoll}
        disabled={!canRoll}
        whileHover={canRoll ? { scale: 1.04 } : undefined}
        whileTap={canRoll ? { scale: 0.95 } : undefined}
        className={cn(
          'w-full rounded-xl px-6 py-3 text-lg font-bold text-white shadow-lg transition',
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
  )
}
