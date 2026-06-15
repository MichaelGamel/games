import { useEffect, useRef } from 'react'
import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { DECKS } from '../../bank/config'
import type { CardDeck, CardId, CourtCardId, LuckCardId } from '../../bank/types'

interface BankCardModalProps {
  deck: CardDeck
  cardId: CardId
  /** Pass-start reward, to fill in the "go to Start" card text. */
  passReward: number
  /** The drawer's balance before the card's direct cash effect. */
  balanceBefore: number
  /** The signed cash change the card applied (0 for non-money cards). */
  delta: number
  /** The drawer's balance after the card resolved. */
  balanceAfter: number
  /** Dismiss the popup and resume the paused turn. */
  onConfirm: () => void
}

/** The drawn card's description, with its amount/reward interpolated. */
function useCardText(deck: CardDeck, cardId: CardId, passReward: number): string {
  const { t } = useTranslation('bank')
  const e = DECKS[deck].find((c) => c.id === cardId)?.effect
  const opts =
    e?.kind === 'cash'
      ? { amount: Math.abs(e.amount) }
      : e?.kind === 'collectEach' || e?.kind === 'payEach'
        ? { amount: e.amount }
        : e?.kind === 'maintenance'
          ? { amount: e.perProperty }
          : e?.kind === 'moveToStart'
            ? { reward: passReward }
            : {}
  // Narrow by deck so the dynamic `cards.<deck>.<id>` key stays type-checked.
  return deck === 'luck'
    ? t(`cards.luck.${cardId as LuckCardId}`, opts)
    : t(`cards.court.${cardId as CourtCardId}`, opts)
}

const DECK_STYLE: Record<CardDeck, { icon: string; gradient: string }> = {
  luck: { icon: '🎲', gradient: 'from-violet-600 to-indigo-700' },
  court: { icon: '⚖️', gradient: 'from-amber-600 to-orange-700' },
}

/**
 * The drawn card (حظك Luck or محاكمة Court), shown mid-turn while `cardReveal` is
 * set during `executeTurn`. The turn is **paused** until the player taps Confirm
 * (no auto-dismiss) — even for a bot's draw. When the card moves money it shows
 * the running calculation (before · ± · after). Purely presentational; the card
 * was already drawn and baked into the resolution.
 */
export function BankCardModal({
  deck,
  cardId,
  passReward,
  balanceBefore,
  delta,
  balanceAfter,
  onConfirm,
}: BankCardModalProps) {
  const { t } = useTranslation('bank')
  const text = useCardText(deck, cardId, passReward)
  const style = DECK_STYLE[deck]
  const title = deck === 'luck' ? t('cards.luckTitle') : t('cards.courtTitle')
  const money = (n: number) => t('money', { n })

  // Auto-focus Confirm so Space/Enter activate it; Enter/Escape also confirm
  // from anywhere. `onConfirm` (acknowledgeCard) is idempotent, so a focused
  // button firing alongside the key listener is harmless.
  const confirmRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault()
        onConfirm()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onConfirm])

  return (
    <m.div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <m.div
        className={`w-full max-w-xs rounded-3xl bg-linear-to-br ${style.gradient} p-6 text-center shadow-2xl ring-1 ring-white/25`}
        initial={{ scale: 0.6, rotateY: -90, opacity: 0 }}
        animate={{ scale: 1, rotateY: 0, opacity: 1 }}
        exit={{ scale: 0.7, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 20 }}
      >
        <m.div
          className="text-5xl"
          animate={{ y: [0, -8, 0], rotate: [0, -6, 6, 0] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          aria-hidden="true"
        >
          {style.icon}
        </m.div>
        <h2 className="mt-3 text-xs font-bold uppercase tracking-[0.2em] text-white/70">{title}</h2>
        <p className="mt-2 text-lg font-semibold leading-snug text-white">{text}</p>

        {delta !== 0 && (
          <div className="mt-4 rounded-2xl bg-black/25 px-4 py-3 text-white" dir="ltr">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/70">{t('cards.before')}</span>
              <span className="font-semibold tabular-nums">{money(balanceBefore)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span aria-hidden="true" className="text-white/70">
                {delta > 0 ? '➕' : '➖'}
              </span>
              <span
                className={`font-bold tabular-nums ${delta > 0 ? 'text-emerald-300' : 'text-red-300'}`}
              >
                {delta > 0 ? '+' : '−'}
                {money(Math.abs(delta))}
              </span>
            </div>
            <div className="my-2 h-px bg-white/25" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/70">{t('cards.after')}</span>
              <span className="text-lg font-extrabold tabular-nums">{money(balanceAfter)}</span>
            </div>
          </div>
        )}

        <button
          ref={confirmRef}
          type="button"
          onClick={onConfirm}
          className="mt-5 w-full rounded-2xl bg-white px-5 py-2.5 text-base font-bold text-night-900 shadow-lg ring-1 ring-black/10 transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {t('cards.confirm')}
        </button>
      </m.div>
    </m.div>
  )
}
