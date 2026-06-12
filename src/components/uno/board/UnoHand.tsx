import { m } from 'motion/react'
import { UnoCard } from './UnoCard'
import type { UnoCard as UnoCardType } from '../../../uno/types'
import { cn } from '../../../lib/cn'

interface UnoHandProps {
  cards: UnoCardType[]
  /** Ids of the cards that may be played right now (highlighted + clickable). */
  legalIds: ReadonlySet<string>
  /** Whether this hand may act at all (its owner's turn, on this device). */
  active: boolean
  /** Hide every face (the privacy hand-off / a bot's hand). */
  faceDown?: boolean
  onPlay: (card: UnoCardType) => void
  cardWidth?: number
}

/**
 * The acting player's fanned hand: cards overlap and scroll horizontally, legal
 * cards lift and glow and are clickable, the rest are dimmed. Synthesized cards
 * only — no assets. Mirrors the "tap a token" affordance of the board games.
 */
export function UnoHand({ cards, legalIds, active, faceDown, onPlay, cardWidth = 68 }: UnoHandProps) {
  // Overlap more as the hand grows, so a big hand still fits the row.
  const overlap = cards.length > 7 ? cardWidth * 0.46 : cardWidth * 0.34

  return (
    <div className="flex w-full justify-center overflow-x-auto overflow-y-visible px-3 pb-2 pt-6">
      <ul className="flex items-end" style={{ paddingInlineEnd: overlap }}>
        {cards.map((card, i) => {
          const playable = active && !faceDown && legalIds.has(card.id)
          return (
            <m.li
              key={card.id}
              layout
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: playable ? -14 : 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              style={{ marginInlineStart: i === 0 ? 0 : -overlap, zIndex: i }}
              whileHover={playable ? { y: -26, zIndex: 99 } : undefined}
            >
              <button
                type="button"
                disabled={!playable}
                onClick={() => onPlay(card)}
                aria-label={faceDown ? undefined : `${card.color ?? 'wild'} ${card.value}`}
                className={cn(
                  'block rounded-[10px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
                  playable
                    ? 'cursor-pointer ring-2 ring-white drop-shadow-[0_0_10px_rgba(255,255,255,0.55)]'
                    : 'cursor-default',
                  active && !faceDown && !playable && 'opacity-55',
                )}
              >
                <UnoCard card={card} faceDown={faceDown} width={cardWidth} />
              </button>
            </m.li>
          )
        })}
      </ul>
    </div>
  )
}
