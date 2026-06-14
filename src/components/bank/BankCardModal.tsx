import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { DECKS } from '../../bank/config'
import type { CardDeck, CardId, CourtCardId, LuckCardId } from '../../bank/types'

interface BankCardModalProps {
  deck: CardDeck
  cardId: CardId
  /** Pass-start reward, to fill in the "go to Start" card text. */
  passReward: number
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
 * The drawn card (حظك Luck or محاكمة Court), revealed transiently mid-turn while
 * `cardReveal` is set during `executeTurn` — "off the top of the board". Purely
 * presentational; the card was already drawn and baked into the resolution.
 */
export function BankCardModal({ deck, cardId, passReward }: BankCardModalProps) {
  const { t } = useTranslation('bank')
  const text = useCardText(deck, cardId, passReward)
  const style = DECK_STYLE[deck]
  const title = deck === 'luck' ? t('cards.luckTitle') : t('cards.courtTitle')

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
      </m.div>
    </m.div>
  )
}
