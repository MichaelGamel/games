import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'

interface DrawOverlayProps {
  onPlayAgain?: () => void
  onSecondary: () => void
  secondaryLabel?: string
}

/** Connect Four's "board full, nobody won" ending. */
export function DrawOverlay({ onPlayAgain, onSecondary, secondaryLabel }: DrawOverlayProps) {
  const { t } = useTranslation(['common'])
  return (
    <m.div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label={t('overlay.drawAria')}
    >
      <m.div
        className="relative z-10 w-full max-w-sm rounded-3xl bg-night-800 p-8 text-center shadow-2xl ring-1 ring-white/15"
        initial={{ scale: 0.7, y: 30, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      >
        <m.div
          className="text-7xl"
          animate={{ rotate: [0, -8, 8, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          aria-hidden="true"
        >
          🤝
        </m.div>
        <h2 className="mt-4 text-3xl font-bold text-white">{t('overlay.drawTitle')}</h2>
        <p className="mt-2 text-white/60">{t('overlay.drawBody')}</p>

        <div className="mt-7 flex flex-col gap-3">
          {onPlayAgain && (
            <m.button
              type="button"
              onClick={onPlayAgain}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className="rounded-xl bg-linear-to-r from-grape to-grape-light px-6 py-3 text-lg font-bold text-white shadow-lg ring-1 ring-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {t('actions.playAgain')}
            </m.button>
          )}
          <button
            type="button"
            onClick={onSecondary}
            className="rounded-xl px-6 py-2.5 font-semibold text-white/80 ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            {secondaryLabel ?? t('overlay.newPlayers')}
          </button>
        </div>
      </m.div>
    </m.div>
  )
}
