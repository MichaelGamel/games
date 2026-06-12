import { AnimatePresence } from 'motion/react'
import { useConnectFour } from '../../hooks/useConnectFour'
import { useFourBotAutoPlay } from '../../hooks/useFourBotAutoPlay'
import { useUnloadGuard } from '../../hooks/useUnloadGuard'
import { useRecordMatch } from '../../hooks/useRecordMatch'
import { FourSetupScreen } from './FourSetupScreen'
import { FourGameScreen } from './FourGameScreen'
import { WinnerOverlay } from '../WinnerOverlay'
import { DrawOverlay } from './DrawOverlay'

/** Local "pass & play" Connect Four: two players (or a bot) on one screen. */
export function FourLocalGame({ onExit }: { onExit: () => void }) {
  const game = useConnectFour({ controlsPlayer: 'all' })
  useFourBotAutoPlay(game)
  useUnloadGuard(game.phase !== 'setup' && game.phase !== 'won')
  // Hall-of-Fame bookkeeping: one entry per finished match (draws don't count).
  useRecordMatch('four', game.phase, game.players, game.winnerId)

  const playAgain = () =>
    game.startGame(game.players.map((p) => ({ name: p.name, color: p.color, isBot: p.isBot })))

  return (
    <>
      <AnimatePresence mode="wait">
        {game.phase === 'setup' ? (
          <FourSetupScreen key="setup" onStart={game.startGame} onBack={onExit} />
        ) : (
          <FourGameScreen key="game" game={game} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {game.phase === 'won' && game.draw && (
          <DrawOverlay key="draw" onPlayAgain={playAgain} onSecondary={game.reset} />
        )}
        {game.phase === 'won' && !game.draw && game.standings.length > 0 && (
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
