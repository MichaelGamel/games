/**
 * The end-of-game overlay: a glass card naming the result (checkmate, stalemate
 * or the specific draw), with a confetti shower when there's a winner worth
 * celebrating. "Play Again" resets the board in place; "Back to Menu" leaves.
 */
import { AnimatePresence, m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { Confetti } from '../Confetti'
import type { ChessController } from '../../hooks/useChessGame'

export function ChessGameOverlay({ c, onExit }: { c: ChessController; onExit: () => void }) {
  const { t } = useTranslation('chess')
  const outcome = c.outcome
  const celebrate =
    !!outcome && outcome.kind === 'checkmate' && (c.mode === 'pass' || outcome.winner === 'w')

  let title = ''
  let body = ''
  if (outcome?.kind === 'checkmate') {
    title = t('over.checkmate')
    body =
      c.mode === 'solo'
        ? outcome.winner === 'w'
          ? t('over.youWin')
          : t('over.youLose')
        : outcome.winner === 'w'
          ? t('over.whiteWins')
          : t('over.blackWins')
  } else if (outcome?.kind === 'stalemate') {
    title = t('over.stalemate')
    body = t('over.stalemateBody')
  } else if (outcome?.kind === 'draw') {
    title = t('over.draw')
    body =
      outcome.reason === 'insufficient'
        ? t('over.drawInsufficient')
        : outcome.reason === 'threefold'
          ? t('over.drawThreefold')
          : t('over.drawFifty')
  }

  return (
    <AnimatePresence>
      {outcome && (
        <m.div
          className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-night-900/55 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {celebrate && <Confetti />}
          <m.div
            initial={{ scale: 0.8, y: 30 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            className="relative z-10 w-full max-w-sm rounded-3xl bg-white/10 p-8 text-center ring-1 ring-white/15 backdrop-blur"
          >
            <m.div
              className="text-6xl"
              aria-hidden="true"
              animate={{ y: [0, -8, 0], rotate: [0, -4, 4, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              {outcome.kind === 'checkmate' ? '♚' : '🤝'}
            </m.div>
            <h2 className="mt-3 text-3xl font-bold text-white">{title}</h2>
            <p className="mt-2 text-white/70">{body}</p>
            <div className="mt-7 flex flex-col gap-3">
              <m.button
                type="button"
                onClick={c.newGame}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="rounded-full bg-grape px-6 py-3 font-semibold text-white shadow-lg ring-1 ring-white/20 transition hover:bg-grape-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {t('over.again')}
              </m.button>
              <button
                type="button"
                onClick={onExit}
                className="rounded-full bg-white/5 px-6 py-2.5 text-sm font-medium text-white/70 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {t('over.menu')}
              </button>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
