import { AnimatePresence } from 'motion/react'
import { useSnakesAndLadders } from '../hooks/useSnakesAndLadders'
import { SetupScreen } from './SetupScreen'
import { GameScreen } from './GameScreen'
import { WinnerOverlay } from './WinnerOverlay'
import { CelebrationOverlay } from './CelebrationOverlay'

/** Local "pass & play": all players share one screen and device. */
export function LocalGame({ onExit }: { onExit: () => void }) {
  const game = useSnakesAndLadders({ controlsPlayer: 'all' })

  const lastFinisher =
    game.finishedOrder.length > 0
      ? (game.players[game.finishedOrder[game.finishedOrder.length - 1]] ?? null)
      : null

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
        {game.phase === 'celebrating' && lastFinisher && (
          <CelebrationOverlay
            key={`celebrate-${game.finishedOrder.length}`}
            player={lastFinisher}
            rank={game.finishedOrder.length - 1}
            // Hot-seat: the shared device decides together.
            canDecide
            waitingFor=""
            onContinue={() => game.decide('continue')}
            onEnd={() => game.decide('end')}
          />
        )}
        {game.phase === 'won' && game.standings.length > 0 && (
          <WinnerOverlay
            key="winner"
            standings={game.standings}
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
