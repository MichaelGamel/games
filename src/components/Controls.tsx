import { memo } from 'react'
import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import type { DieValue, Phase } from '../game/types'
import { Dice3D } from './dice/Dice3D'
import { cn } from '../lib/cn'

interface ControlsProps {
  phase: Phase
  /** The last roll's individual dice (empty before the first roll). */
  lastDice: DieValue[]
  /** Dice per roll for this match (sizes the cubes). */
  diceCount: 1 | 2
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

/**
 * Dice + actions. A compact horizontal bar on mobile (dice beside the
 * buttons, so everything fits under the board without scrolling); the
 * familiar stacked card on desktop.
 */
export const Controls = memo(function Controls({
  phase,
  lastDice,
  diceCount,
  accentColor,
  muted,
  canRoll,
  rollLabel,
  secondaryLabel,
  onRoll,
  onToggleMute,
  onSecondary,
}: ControlsProps) {
  const { t } = useTranslation()
  return (
    <div className="flex w-full items-center gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10 backdrop-blur lg:flex-col lg:gap-5 lg:p-5">
      <div className="flex shrink-0 items-center gap-2">
        {Array.from({ length: diceCount }, (_, i) => (
          <Dice3D
            key={i}
            value={lastDice[i] ?? null}
            rolling={phase === 'rolling'}
            size={diceCount === 2 ? 60 : 84}
          />
        ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 lg:w-full lg:flex-none lg:gap-5">
        <m.button
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
        </m.button>

        <div className="flex w-full items-center justify-between gap-3 text-sm">
          <button
            type="button"
            onClick={onToggleMute}
            aria-pressed={muted}
            aria-label={muted ? t('actions.unmuteAria') : t('actions.muteAria')}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-white/80 ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <span aria-hidden="true">{muted ? '🔇' : '🔊'}</span>
            {muted ? t('actions.muted') : t('actions.sound')}
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
})
