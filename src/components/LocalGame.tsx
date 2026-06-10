import { AnimatePresence } from 'motion/react'
import { useSnakesAndLadders } from '../hooks/useSnakesAndLadders'
import { SetupScreen } from './SetupScreen'
import { GameScreen } from './GameScreen'
import { WinnerOverlay } from './WinnerOverlay'

/** Local "pass & play": both players share one screen and device. */
export function LocalGame({ onExit }: { onExit: () => void }) {
  const game = useSnakesAndLadders({ controlsPlayer: 'all' })

  return (
    <>
      <AnimatePresence mode="wait">
        {game.phase === 'setup' ? (
          <SetupScreen key="setup" onStart={game.startGame} onBack={onExit} />
        ) : (
          <GameScreen key="game" game={game} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {game.phase === 'won' && game.winner && (
          <WinnerOverlay
            key="winner"
            winner={game.winner}
            onPlayAgain={() =>
              game.startGame(game.players.map((p) => ({ name: p.name, color: p.color })))
            }
            onSecondary={game.reset}
          />
        )}
      </AnimatePresence>
    </>
  )
}
