import { useState } from 'react'
import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { clearBankHistory, loadBankHistory, type BankHistoryEntry } from '../../bank/history'

/** A look-back over recent finished local matches (Phase 8). Reads from the
 *  persisted history; offers a Clear action. Presentational + localStorage only. */
export function BankHistoryModal({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation('bank')
  const [entries, setEntries] = useState<BankHistoryEntry[]>(() => loadBankHistory())
  const fmt = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <m.div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4 py-8 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label={t('history.title')}
      onClick={onClose}
    >
      <m.div
        className="flex max-h-full w-full max-w-md flex-col rounded-3xl bg-night-800/95 p-5 shadow-2xl ring-1 ring-white/15"
        initial={{ scale: 0.9, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-white">
          <span aria-hidden="true">📜</span> {t('history.title')}
        </h2>

        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-white/55">{t('history.empty')}</p>
        ) : (
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pe-1">
            {entries.map((e, i) => (
              <li key={i} className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
                <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-white/60">
                  <span className="font-semibold text-amber-200">
                    {e.winnerName ? t('history.winner', { name: e.winnerName }) : t('history.noWinner')}
                  </span>
                  <span className="tabular-nums">{t('history.turns', { n: e.totalTurns })}</span>
                </div>
                <p className="mb-2 text-[11px] text-white/40">{fmt.format(new Date(e.playedAt))}</p>
                <div className="flex flex-wrap gap-1.5">
                  {e.players.map((p, j) => (
                    <span
                      key={j}
                      className="inline-flex items-center gap-1 rounded-full bg-night-900/60 px-2 py-1 text-[11px] text-white/80 ring-1 ring-white/10"
                      style={{ boxShadow: `inset 2px 0 0 ${p.color}` }}
                    >
                      <span className="font-semibold">{p.name}</span>
                      <span className="tabular-nums text-amber-200">
                        {p.bankrupt ? '💀' : t('history.cash', { n: p.finalCash })}
                      </span>
                      {p.propertiesBought > 0 && (
                        <span className="tabular-nums text-white/55">{t('history.props', { n: p.propertiesBought })}</span>
                      )}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          {entries.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                clearBankHistory()
                setEntries([])
              }}
              className="rounded-lg px-3 py-1.5 text-sm text-rose-300/80 ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              {t('history.clear')}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-1.5 text-sm font-semibold text-white/85 ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            {t('history.close')}
          </button>
        </div>
      </m.div>
    </m.div>
  )
}
