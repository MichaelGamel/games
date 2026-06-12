import { AnimatePresence } from 'motion/react'
import { useLudo } from '../../hooks/useLudo'
import { useLudoBotAutoPlay } from '../../hooks/useLudoBotAutoPlay'
import { useUnloadGuard } from '../../hooks/useUnloadGuard'
import { CelebrationOverlay } from '../CelebrationOverlay'
import { WinnerOverlay } from '../WinnerOverlay'
import { LudoSetupScreen } from './LudoSetupScreen'
import { LudoGameScreen } from './LudoGameScreen'

/** Local "pass & play": all players share one screen and device. */
export function LudoLocalGame({ onExit }: { onExit: () => void }) {
  const game = useLudo({ controlsPlayer: 'all' })
  // Auto-roll / auto-select for any computer players on their turn.
  useLudoBotAutoPlay(game)
  // Warn before closing/refreshing/navigating away while a game is in progress.
  useUnloadGuard(game.phase !== 'setup' && game.phase !== 'won')

  const lastFinisher =
    game.finishedOrder.length > 0
      ? (game.players[game.finishedOrder[game.finishedOrder.length - 1]] ?? null)
      : null

  return (
    <>
      <AnimatePresence mode="wait">
        {game.phase === 'setup' ? (
          <LudoSetupScreen key="setup" onStart={game.startGame} onBack={onExit} />
        ) : (
          <LudoGameScreen key="game" game={game} />
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
            message="brought all four tokens home! 🎉"
            onContinue={() => game.decide('continue')}
            onEnd={() => game.decide('end')}
          />
        )}
        {game.phase === 'won' && game.standings.length > 0 && (
          <WinnerOverlay
            key="winner"
            standings={game.standings}
            onPlayAgain={() =>
              game.startGame(
                game.players.map((p) => ({ name: p.name, color: p.color, isBot: p.isBot })),
              )
            }
            onSecondary={game.reset}
          />
        )}
      </AnimatePresence>
    </>
  )
}
