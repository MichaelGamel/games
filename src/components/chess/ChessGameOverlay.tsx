/**
 * The end-of-game overlay. Locally it reads the engine `outcome`; online it
 * derives the result from the player's seat (win / loss / draw / forfeit) and
 * swaps "Play Again" for the room's rematch + Leave. Confetti rains only when
 * there's a winner worth celebrating from this client's point of view.
 */
import { AnimatePresence, m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { Confetti } from '../Confetti'
import type { ChessController } from '../../hooks/useChessGame'
import type { ChessOnlineContext } from './ChessBoardView'

interface ChessGameOverlayProps {
  c: ChessController
  online?: ChessOnlineContext
  onExit: () => void
}

export function ChessGameOverlay({ c, online, onExit }: ChessGameOverlayProps) {
  const { t } = useTranslation(['chess', 'common'])
  const visible = online ? c.phase === 'won' : c.outcome != null

  const winnerId = c.winnerId
  const isDraw = c.draw
  const winnerName = winnerId != null ? (c.players[winnerId]?.name ?? '') : ''

  const drawBody =
    c.outcome?.kind === 'draw'
      ? c.outcome.reason === 'insufficient'
        ? t('chess:over.drawInsufficient')
        : c.outcome.reason === 'threefold'
          ? t('chess:over.drawThreefold')
          : t('chess:over.drawFifty')
      : t('chess:over.stalemateBody')

  let title = ''
  let body = ''
  let emoji = '🤝'
  if (isDraw) {
    title = c.outcome?.kind === 'stalemate' ? t('chess:over.stalemate') : t('chess:over.draw')
    body = drawBody
  } else if (winnerId != null) {
    emoji = '♚'
    if (online) {
      if (c.winReason === 'forfeit') {
        title = t('chess:over.matchOver')
        body =
          online.mySeat === winnerId
            ? t('chess:over.forfeitWin')
            : t('chess:over.playerWins', { name: winnerName })
      } else {
        title = t('chess:over.checkmate')
        body = online.spectator
          ? t('chess:over.playerWins', { name: winnerName })
          : online.mySeat === winnerId
            ? t('chess:over.youWin')
            : t('chess:over.youLost')
      }
    } else {
      title = t('chess:over.checkmate')
      body =
        c.mode === 'solo'
          ? winnerId === 0
            ? t('chess:over.youWin')
            : t('chess:over.youLose')
          : winnerId === 0
            ? t('chess:over.whiteWins')
            : t('chess:over.blackWins')
    }
  }

  const celebrate =
    !isDraw &&
    winnerId != null &&
    (online ? online.mySeat === winnerId : c.mode === 'pass' || winnerId === 0)

  const onPlayAgain = online ? online.onPlayAgain : c.newGame
  const onSecondary = online ? online.onLeave : onExit
  const secondaryLabel = online ? t('common:actions.leave') : t('chess:over.menu')

  return (
    <AnimatePresence>
      {visible && (
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
              {emoji}
            </m.div>
            <h2 className="mt-3 text-3xl font-bold text-white">{title}</h2>
            <p className="mt-2 text-white/70">{body}</p>
            <div className="mt-7 flex flex-col gap-3">
              {onPlayAgain && (
                <m.button
                  type="button"
                  onClick={onPlayAgain}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="rounded-full bg-grape px-6 py-3 font-semibold text-white shadow-lg ring-1 ring-white/20 transition hover:bg-grape-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {t('chess:over.again')}
                </m.button>
              )}
              <button
                type="button"
                onClick={onSecondary}
                className="rounded-full bg-white/5 px-6 py-2.5 text-sm font-medium text-white/70 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {secondaryLabel}
              </button>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
