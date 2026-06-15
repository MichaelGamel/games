/**
 * The promotion picker — shown when a human pawn reaches the last rank. Four big
 * glyph buttons in the promoting side's colour; tapping one resolves the move,
 * tapping the backdrop cancels it. (The computer always auto-queens, so it never
 * sees this.)
 */
import { AnimatePresence, m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import type { ChessController } from '../../hooks/useChessGame'
import type { PieceType } from '../../chess/types'
import { ChessPieceGlyph } from './ChessPieceGlyph'

const CHOICES: PieceType[] = ['q', 'r', 'b', 'n']

export function ChessPromotionOverlay({ c }: { c: ChessController }) {
  const { t } = useTranslation('chess')
  const tone = c.turn === 'w' ? 'light' : 'dark'

  return (
    <AnimatePresence>
      {c.promotion && (
        <m.div
          className="absolute inset-0 z-30 grid place-items-center bg-night-900/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={c.cancelPromotion}
        >
          <m.div
            initial={{ scale: 0.85, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.85, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            className="rounded-3xl bg-white/8 p-6 text-center ring-1 ring-white/15 backdrop-blur"
          >
            <h2 className="mb-4 text-lg font-bold text-white">{t('promotion.title')}</h2>
            <div className="flex gap-3">
              {CHOICES.map((type) => (
                <m.button
                  key={type}
                  type="button"
                  onClick={() => c.choosePromotion(type)}
                  whileHover={{ scale: 1.08, y: -4 }}
                  whileTap={{ scale: 0.95 }}
                  className="grid h-16 w-16 place-items-center rounded-2xl bg-white/5 text-5xl ring-1 ring-white/15 transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <ChessPieceGlyph type={type} tone={tone} />
                </m.button>
              ))}
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
