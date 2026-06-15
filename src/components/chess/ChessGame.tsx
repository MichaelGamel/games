/**
 * The in-match screen: a full-bleed 3D canvas with the glass HUD, promotion
 * picker and game-over overlay floating on top. The `containerRef` div is where
 * {@link useChessGame} mounts the Three.js renderer; everything else is React
 * chrome that lets pointer taps fall through to the board.
 */
import { useCallback } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { BackToHubLink } from '../BackToHubLink'
import { LanguageSwitcher } from '../LanguageSwitcher'
import { useChessGame } from '../../hooks/useChessGame'
import type { ChessMode, Difficulty } from '../../chess/types'
import { ChessHud } from './ChessHud'
import { ChessPromotionOverlay } from './ChessPromotionOverlay'
import { ChessGameOverlay } from './ChessGameOverlay'

interface ChessGameProps {
  mode: ChessMode
  difficulty: Difficulty
  onExit: () => void
}

export function ChessGame({ mode, difficulty, onExit }: ChessGameProps) {
  const { t } = useTranslation('chess')
  const c = useChessGame({ mode, difficulty })
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
        aria-label={t('a11y.board')}
      />

      <BackToHubLink />
      <LanguageSwitcher className="absolute end-4 top-4 z-20" />

      <ChessHud c={c} />

      <AnimatePresence>
        {c.history.length === 0 && !c.outcome && (
          <m.p
            key="hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/5 px-4 py-1.5 text-xs text-white/55 ring-1 ring-white/10 backdrop-blur"
          >
            {t('controls.rotateHint')}
          </m.p>
        )}
      </AnimatePresence>

      <ChessPromotionOverlay c={c} />
      <ChessGameOverlay c={c} onExit={onExit} />
    </m.div>
  )
}
