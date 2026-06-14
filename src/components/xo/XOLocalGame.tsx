import { AnimatePresence } from 'motion/react'
import { useTicTacToe } from '../../hooks/useTicTacToe'
import { useXOBotAutoPlay } from '../../hooks/useXOBotAutoPlay'
import { useUnloadGuard } from '../../hooks/useUnloadGuard'
import { useRecordMatch } from '../../hooks/useRecordMatch'
import { XOSetupScreen } from './XOSetupScreen'
import { XOGameScreen } from './XOGameScreen'
import { WinnerOverlay } from '../WinnerOverlay'
import { XODrawOverlay } from './XODrawOverlay'

/** Local "pass & play" Tic-Tac-Toe: two players (or a bot) on one screen. */
export function XOLocalGame({ onExit }: { onExit: () => void }) {
  const game = useTicTacToe({ controlsPlayer: 'all' })
  useXOBotAutoPlay(game)
  useUnloadGuard(game.phase !== 'setup' && game.phase !== 'won')
  // Hall-of-Fame bookkeeping: one entry per finished match (draws don't count).
  useRecordMatch('xo', game.phase, game.players, game.winnerId)

  const playAgain = () =>
    game.startGame(game.players.map((p) => ({ name: p.name, color: p.color, isBot: p.isBot })))

  return (
    <>
      <AnimatePresence mode="wait">
        {game.phase === 'setup' ? (
          <XOSetupScreen key="setup" onStart={game.startGame} onBack={onExit} />
        ) : (
          <XOGameScreen key="game" game={game} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {game.phase === 'won' && game.draw && (
          <XODrawOverlay key="draw" onPlayAgain={playAgain} onSecondary={game.reset} />
        )}
        {game.phase === 'won' && !game.draw && !game.celebratingWin && game.standings.length > 0 && (
          <WinnerOverlay
            key="winner"
            standings={game.standings}
            onPlayAgain={playAgain}
            onSecondary={game.reset}
          />
        )}
      </AnimatePresence>
    </>
  )
}
