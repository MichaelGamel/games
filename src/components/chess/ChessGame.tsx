/**
 * Local chess (vs computer or two-player hot-seat). Builds the controller —
 * which auto-seats the two local players on mount — and renders the shared
 * {@link ChessBoardView}. Online play has its own room shell.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRecordMatch } from '../../hooks/useRecordMatch'
import { useChessGame, type ChessPlayerSetup } from '../../hooks/useChessGame'
import { PALETTE } from '../../chess/config'
import type { ChessMode, Difficulty } from '../../chess/types'
import { ChessBoardView } from './ChessBoardView'

interface ChessGameProps {
  mode: Extract<ChessMode, 'solo' | 'pass'>
  difficulty: Difficulty
  onExit: () => void
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`

export function ChessGame({ mode, difficulty, onExit }: ChessGameProps) {
  const { t } = useTranslation('chess')

  // The two local seats (White first). Computed once — names don't change mid-match.
  const [localPlayers] = useState<ChessPlayerSetup[]>(() =>
    mode === 'solo'
      ? [
          { name: t('side.you'), color: hex(PALETTE.whitePiece) },
          { name: t('side.computer'), color: hex(PALETTE.blackEmissive), isBot: true },
        ]
      : [
          { name: t('side.white'), color: hex(PALETTE.whitePiece) },
          { name: t('side.black'), color: hex(PALETTE.blackEmissive) },
        ],
  )

  const c = useChessGame({ mode, difficulty, localPlayers })
  useRecordMatch('chess', c.phase, c.players, c.winnerId)

  return <ChessBoardView c={c} onExit={onExit} />
}
