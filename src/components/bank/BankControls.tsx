import { memo } from 'react'
import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'

interface BankControlsProps {
  accentColor: string
  muted: boolean
  /** Whether the roll button is actionable (idle + your turn). */
  canRoll: boolean
  /** Label for the primary button (Roll / Roll again / Roll for doubles). */
  rollLabel: string
  canUndo: boolean
  onRoll: () => void
  onUndo: () => void
  onToggleMute: () => void
  /** The secondary action (New Game locally, Leave online). */
  onSecondary: () => void
  secondaryLabel: string
  // P2 jail: when the current player is locked up, extra escape options appear.
  inJail: boolean
  jailFine: number
  jailAttempts: number
  canPayFine: boolean
  canUseCard: boolean
  onPayFine: () => void
  onUseCard: () => void
  // P4 trading: open the trade builder on your own idle turn.
  canTrade: boolean
  onTrade: () => void
}

/**
 * The action bar: the big Roll button (the dice themselves live in the board's
 * center hub), plus undo / mute / new-game. Mirrors `LudoControls` minus the
 * dice cubes.
 */
export const BankControls = memo(function BankControls({
  accentColor,
  muted,
  canRoll,
  rollLabel,
  canUndo,
  onRoll,
  onUndo,
  onToggleMute,
  onSecondary,
  secondaryLabel,
  inJail,
  jailFine,
  jailAttempts,
  canPayFine,
  canUseCard,
  onPayFine,
  onUseCard,
  canTrade,
  onTrade,
}: BankControlsProps) {
  const { t } = useTranslation(['bank', 'common'])
  return (
    <div className="flex w-full flex-col gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10 backdrop-blur">
      <m.button
        type="button"
        onClick={onRoll}
        disabled={!canRoll}
        whileHover={canRoll ? { scale: 1.04 } : undefined}
        whileTap={canRoll ? { scale: 0.95 } : undefined}
        className={cn(
          'w-full truncate rounded-xl px-6 py-3 text-lg font-bold text-white shadow-lg transition',
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

      {inJail && (
        <div className="flex flex-col gap-1.5">
          <p className="text-center text-xs text-rose-300">
            {t('jail.title')} · {t('jail.attempts', { n: jailAttempts })}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onPayFine}
              disabled={!canPayFine}
              className={cn(
                'flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 ring-white/15 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white',
                canPayFine ? 'text-white/85 hover:bg-white/10' : 'cursor-not-allowed text-white/30',
              )}
            >
              {t('jail.payFine', { amount: jailFine })}
            </button>
            <button
              type="button"
              onClick={onUseCard}
              disabled={!canUseCard}
              className={cn(
                'flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 ring-white/15 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white',
                canUseCard ? 'text-white/85 hover:bg-white/10' : 'cursor-not-allowed text-white/30',
              )}
            >
              {t('jail.useCard')}
            </button>
          </div>
        </div>
      )}

      {canTrade && (
        <button
          type="button"
          onClick={onTrade}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white/85 ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          <span aria-hidden="true">🤝</span> {t('bank:trade.open')}
        </button>
      )}

      <div className="flex w-full items-center justify-between gap-2 text-sm">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label={t('common:actions.undoAria')}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 ring-1 ring-white/15 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white',
            canUndo ? 'text-white/80 hover:bg-white/10' : 'cursor-not-allowed text-white/30',
          )}
        >
          <span aria-hidden="true">↩️</span> {t('common:actions.undo')}
        </button>

        <button
          type="button"
          onClick={onToggleMute}
          aria-pressed={muted}
          aria-label={muted ? t('common:actions.unmuteAria') : t('common:actions.muteAria')}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-white/80 ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          <span aria-hidden="true">{muted ? '🔇' : '🔊'}</span>
          {muted ? t('common:actions.muted') : t('common:actions.sound')}
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
})
