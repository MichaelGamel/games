/**
 * The shared in-match screen: a full-bleed 3D canvas with the glass HUD,
 * promotion picker and game-over overlay on top. Used by both local play
 * ({@link ChessGame}) and online play ({@link ChessOnlineRoom}); the optional
 * `online` context switches the chrome (a Leave button instead of the hub link,
 * an online-aware turn banner and result overlay).
 */
import { useCallback } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { BackToHubLink } from '../BackToHubLink'
import { LanguageSwitcher } from '../LanguageSwitcher'
import type { ChessController } from '../../hooks/useChessGame'
import { ChessHud } from './ChessHud'
import { ChessPromotionOverlay } from './ChessPromotionOverlay'
import { ChessGameOverlay } from './ChessGameOverlay'

/** Online room context threaded into the board view's chrome. */
export interface ChessOnlineContext {
  roomCode: string
  /** 0 = White, 1 = Black, null = spectator. */
  mySeat: number | null
  spectator: boolean
  onLeave: () => void
  /** Replay the same lineup (undefined for spectators / forfeit wins). */
  onPlayAgain?: () => void
  opponentName: string
  opponentAbsent: boolean
  canPlay: boolean
}

interface ChessBoardViewProps {
  c: ChessController
  online?: ChessOnlineContext
  onExit: () => void
}

export function ChessBoardView({ c, online, onExit }: ChessBoardViewProps) {
  const { t } = useTranslation(['chess', 'common'])
  const { attachScene } = c
  const boardRef = useCallback((node: HTMLDivElement | null) => attachScene(node), [attachScene])

  return (
    <m.div
      key="game"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative z-10 h-dvh w-full"
    >
      <div
        ref={boardRef}
        className="absolute inset-0"
        role="application"
        aria-label={t('chess:a11y.board')}
      />

      {online ? (
        <button
          type="button"
          onClick={online.onLeave}
          className="absolute start-4 top-4 z-20 inline-flex items-center gap-1.5 rounded-full bg-white/5 px-4 py-2 text-sm font-medium text-white/70 ring-1 ring-white/10 backdrop-blur transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <span aria-hidden="true" className="rtl:-scale-x-100">
            ←
          </span>{' '}
          {t('common:actions.leave')}
        </button>
      ) : (
        <BackToHubLink />
      )}
      <LanguageSwitcher className="absolute end-4 top-4 z-20" />

      <ChessHud c={c} online={online} />

      <AnimatePresence>
        {c.phase !== 'setup' && c.history.length === 0 && c.phase !== 'won' && (
          <m.p
            key="hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/5 px-4 py-1.5 text-xs text-white/55 ring-1 ring-white/10 backdrop-blur"
          >
            {t('chess:controls.rotateHint')}
          </m.p>
        )}
      </AnimatePresence>

      <ChessPromotionOverlay c={c} />
      <ChessGameOverlay c={c} online={online} onExit={onExit} />
    </m.div>
  )
}
