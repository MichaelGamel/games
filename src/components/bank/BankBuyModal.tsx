import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { BOARD, GROUP_COLORS } from '../../bank/config'
import { rentFor } from '../../bank/rules'

interface BankBuyModalProps {
  /** Tile id of the property on offer. */
  tile: number
  price: number
  /** The deciding player's cash if they buy. */
  cashAfter: number
  /** Accent color (the buyer's token). */
  accentColor: string
  onBuy: () => void
  onSkip: () => void
}

/**
 * The buy / skip prompt, shown while `phase === 'deciding'` for the controllable
 * seat. The choice commits as a separate seq-stamped event, so it stays
 * replay-safe online.
 */
export function BankBuyModal({ tile, price, cashAfter, accentColor, onBuy, onSkip }: BankBuyModalProps) {
  const { t } = useTranslation('bank')
  const data = BOARD[tile]
  const name = t(`tiles.${data.nameKey}`)
  const groupColor = data.group ? GROUP_COLORS[data.group] : '#888'
  const rent = rentFor(data, { owner: -1, level: 0, mortgaged: false })

  return (
    <m.div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label={t('buy.title', { name })}
    >
      <m.div
        className="w-full max-w-xs overflow-hidden rounded-3xl bg-night-800 text-center shadow-2xl ring-1 ring-white/15"
        initial={{ scale: 0.8, y: 24, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 22 }}
      >
        <div className="h-3 w-full" style={{ background: groupColor }} aria-hidden="true" />
        <div className="p-6">
          <h2 className="text-xl font-bold text-white">{t('buy.title', { name })}</h2>
          {data.group && (
            <p className="mt-1 text-xs uppercase tracking-widest text-white/45">
              {t('buy.group', { group: data.group })}
            </p>
          )}

          <dl className="mt-4 flex justify-center gap-6 text-sm">
            <div>
              <dt className="text-white/50">{t('buy.price')}</dt>
              <dd className="text-lg font-bold tabular-nums text-amber-200">{t('money', { n: price })}</dd>
            </div>
            <div>
              <dt className="text-white/50">{t('buy.rent')}</dt>
              <dd className="text-lg font-bold tabular-nums text-emerald-200">{t('money', { n: rent })}</dd>
            </div>
          </dl>

          <p className="mt-3 text-xs text-white/50">{t('buy.cashAfter', { n: cashAfter })}</p>

          <div className="mt-6 flex flex-col gap-2.5">
            <m.button
              type="button"
              onClick={onBuy}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className="rounded-xl px-6 py-3 text-lg font-bold text-white shadow-lg ring-1 ring-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)` }}
            >
              {t('buy.buy', { n: price })}
            </m.button>
            <button
              type="button"
              onClick={onSkip}
              className="rounded-xl px-6 py-2.5 font-semibold text-white/80 ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              {t('buy.skip')}
            </button>
          </div>
        </div>
      </m.div>
    </m.div>
  )
}
