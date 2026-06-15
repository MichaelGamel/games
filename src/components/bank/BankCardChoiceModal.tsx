import { useEffect, useRef } from 'react'
import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import type { CardDeck } from '../../bank/types'

interface BankCardChoiceModalProps {
  /** Accent color for the prompt (the choosing player's token). */
  accentColor: string
  /** Pick a deck to draw from. */
  onChoose: (deck: CardDeck) => void
}

const DECK_STYLE: Record<CardDeck, { icon: string; gradient: string }> = {
  luck: { icon: '🎲', gradient: 'from-violet-600 to-indigo-700' },
  court: { icon: '⚖️', gradient: 'from-amber-600 to-orange-700' },
}

/**
 * The "Luck or Court" prompt shown when a player lands on a `choice` cell. The
 * turn is paused (`phase === 'deciding'`, `pendingChoice` set) until a deck is
 * picked; the pick commits as a `cardDraw`, whose drawn card then shows in the
 * usual {@link BankCardModal} popup. Luck is auto-focused (Enter/Space picks it).
 */
export function BankCardChoiceModal({ accentColor, onChoose }: BankCardChoiceModalProps) {
  const { t } = useTranslation('bank')
  const luckRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    luckRef.current?.focus()
  }, [])

  const decks: CardDeck[] = ['luck', 'court']

  return (
    <m.div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label={t('cards.chooseTitle')}
    >
      <m.div
        className="w-full max-w-sm rounded-3xl bg-[#fdf6e3] p-6 text-center shadow-2xl ring-1 ring-amber-900/20"
        initial={{ scale: 0.7, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 22 }}
      >
        <h2 className="font-serif text-xl font-black text-red-700">{t('cards.chooseTitle')}</h2>
        <p className="mt-1 text-sm font-semibold" style={{ color: accentColor }}>
          {t('cards.choosePrompt')}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          {decks.map((deck, i) => {
            const style = DECK_STYLE[deck]
            return (
              <button
                key={deck}
                ref={deck === 'luck' ? luckRef : undefined}
                type="button"
                onClick={() => onChoose(deck)}
                className={`flex flex-col items-center gap-2 rounded-2xl bg-linear-to-br ${style.gradient} px-4 py-5 text-white shadow-lg ring-1 ring-white/25 transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white`}
                autoFocus={i === 0}
              >
                <span className="text-4xl" aria-hidden="true">
                  {style.icon}
                </span>
                <span className="text-base font-extrabold uppercase tracking-wide">
                  {t(`decks.${deck}`)}
                </span>
              </button>
            )
          })}
        </div>
      </m.div>
    </m.div>
  )
}
