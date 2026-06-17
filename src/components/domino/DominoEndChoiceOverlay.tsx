import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import type { DominoEnd, Pip } from '../../domino/types'

interface DominoEndChoiceOverlayProps {
  ends: DominoEnd[]
  leftEnd: Pip | null
  rightEnd: Pip | null
  onChoose: (end: DominoEnd) => void
}

/**
 * The local `choosing` pause: the tapped tile matches both open ends, so the
 * player picks which to extend. The chosen end is baked into the broadcast
 * resolution — UNO's wild-color picker, for Dominoes.
 */
export function DominoEndChoiceOverlay({ ends, leftEnd, rightEnd, onChoose }: DominoEndChoiceOverlayProps) {
  const { t } = useTranslation('domino')
  const value = (end: DominoEnd) => (end === 'left' ? leftEnd : rightEnd)
  return (
    <m.div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
    >
      <m.div
        className="w-full max-w-sm rounded-3xl bg-night-800 p-7 text-center shadow-2xl ring-1 ring-white/15"
        initial={{ scale: 0.8, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      >
        <h2 className="text-xl font-bold text-white">{t('chooseEnd')}</h2>
        <div className="mt-5 flex gap-3">
          {ends.map((end) => (
            <m.button
              key={end}
              type="button"
              onClick={() => onChoose(end)}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className="flex-1 rounded-2xl bg-white/5 px-4 py-5 ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <span className="block text-xs uppercase tracking-wide text-white/50">
                {end === 'left' ? t('leftEnd') : t('rightEnd')}
              </span>
              <span className="mt-1 block text-3xl font-bold text-white tabular-nums">{value(end)}</span>
            </m.button>
          ))}
        </div>
      </m.div>
    </m.div>
  )
}
