/**
 * Local chess (vs computer or two-player hot-seat). Builds the controller —
 * which auto-seats the two local players (with their chosen piece colours) on
 * mount — and renders the shared {@link ChessBoardView}.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRecordMatch } from '../../hooks/useRecordMatch'
import { useChessGame, type ChessPlayerSetup } from '../../hooks/useChessGame'
import { DEFAULT_PIECE_COLORS } from '../../chess/config'
import type { ChessMode, Difficulty } from '../../chess/types'
import { ChessBoardView } from './ChessBoardView'

interface ChessGameProps {
  mode: Extract<ChessMode, 'solo' | 'pass'>
  difficulty: Difficulty
  /** Piece colour for the side that moves first (White) and the second (Black). */
  whiteColor?: string
  blackColor?: string
  onExit: () => void
}

export function ChessGame({
  mode,
  difficulty,
  whiteColor = DEFAULT_PIECE_COLORS.white,
  blackColor = DEFAULT_PIECE_COLORS.black,
  onExit,
}: ChessGameProps) {
  const { t } = useTranslation('chess')

  // The two local seats (White first). Computed once — names don't change mid-match.
  const [localPlayers] = useState<ChessPlayerSetup[]>(() =>
    mode === 'solo'
      ? [
          { name: t('side.you'), color: whiteColor },
          { name: t('side.computer'), color: blackColor, isBot: true },
        ]
      : [
          { name: t('side.white'), color: whiteColor },
          { name: t('side.black'), color: blackColor },
        ],
  )

  const c = useChessGame({ mode, difficulty, localPlayers })
  useRecordMatch('chess', c.phase, c.players, c.winnerId)

  return <ChessBoardView c={c} onExit={onExit} />
}
