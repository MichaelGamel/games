import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'

interface UnoControlsProps {
  /** A Wild-Draw-Four is challengeable by this client right now. */
  canChallenge: boolean
  /** Cards the pending penalty would force (labels the accept button). */
  pendingDraw: number
  onChallenge: () => void
  onAcceptDraw: () => void
  muted: boolean
  onToggleMute: () => void
  secondaryLabel: string
  onSecondary: () => void
}

/** Actions bar: the Wild-Draw-Four challenge prompt, sound, and leave/new game. */
export function UnoControls({
  canChallenge,
  pendingDraw,
  onChallenge,
  onAcceptDraw,
  muted,
  onToggleMute,
  secondaryLabel,
  onSecondary,
}: UnoControlsProps) {
  const { t } = useTranslation(['uno', 'common'])
  return (
    <div className="flex w-full flex-col gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10 backdrop-blur lg:p-4">
      {canChallenge && (
        <div className="flex flex-col gap-2 rounded-xl bg-night-900/60 p-3 ring-1 ring-amber-300/30">
          <p className="text-center text-xs font-semibold text-amber-200">{t('challengePrompt')}</p>
          <div className="flex gap-2">
            <m.button
              type="button"
              onClick={onChallenge}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              className="flex-1 rounded-lg bg-linear-to-r from-rose-500 to-orange-500 px-3 py-2 text-sm font-bold text-white shadow ring-1 ring-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              {t('challenge')}
            </m.button>
            <button
              type="button"
              onClick={onAcceptDraw}
              className="flex-1 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white/90 ring-1 ring-white/15 transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              {t('acceptDraw', { n: pendingDraw })}
            </button>
          </div>
        </div>
      )}

      <div className="flex w-full items-center justify-between gap-3 text-sm">
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
          className={cn(
            'rounded-lg px-3 py-1.5 text-white/80 ring-1 ring-white/15 transition hover:bg-white/10',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-white',
          )}
        >
          {secondaryLabel}
        </button>
      </div>
    </div>
  )
}
