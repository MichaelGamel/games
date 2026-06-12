import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { useUno } from '../../hooks/useUno'
import { useUnoBotAutoPlay } from '../../hooks/useUnoBotAutoPlay'
import { useRecordMatch } from '../../hooks/useRecordMatch'
import { useUnloadGuard } from '../../hooks/useUnloadGuard'
import { CelebrationOverlay } from '../CelebrationOverlay'
import { WinnerOverlay } from '../WinnerOverlay'
import { RecapPanel } from '../RecapPanel'
import { unoRecapRows } from '../recapRows'
import { UnoSetupScreen } from './UnoSetupScreen'
import { UnoGameScreen } from './UnoGameScreen'
import { UnoChoiceOverlay } from './UnoChoiceOverlay'
import { PassDeviceScreen } from './PassDeviceScreen'

/** Local "pass & play": all players share one screen and device, with an
 *  optional privacy hand-off between turns so hidden hands stay hidden. */
export function UnoLocalGame({ onExit }: { onExit: () => void }) {
  const { t } = useTranslation(['uno', 'common'])
  const game = useUno({ controlsPlayer: 'all' })
  const [privateHands, setPrivateHands] = useState(true)
  // Which seat has revealed its hand this turn (the privacy hand-off gate). It
  // re-arms whenever the turn passes to a new seat — tracked during render
  // (React's "you might not need an effect"), not in an effect.
  const [revealedSeat, setRevealedSeat] = useState<number | null>(null)
  const [seatShown, setSeatShown] = useState(game.currentPlayerIndex)
  if (seatShown !== game.currentPlayerIndex) {
    setSeatShown(game.currentPlayerIndex)
    setRevealedSeat(null)
  }

  useUnoBotAutoPlay(game)
  useUnloadGuard(game.phase !== 'setup' && game.phase !== 'matchEnd')
  // Hall of Fame: UNO's terminal phase is `matchEnd`; map it to the hook's `won`.
  useRecordMatch('uno', game.phase === 'matchEnd' ? 'won' : game.phase, game.players, game.winnerId)

  const current = game.currentPlayer
  const inPlay = game.phase === 'idle' || game.phase === 'choosing' || game.phase === 'resolving'
  // A human must reveal before acting; bots never need the hand-off.
  const needsPass =
    inPlay &&
    privateHands &&
    current != null &&
    !current.isBot &&
    revealedSeat !== game.currentPlayerIndex
  // A local choice prompt only belongs to a human (bots auto-resolve theirs).
  const showChoice = game.choice != null && current != null && !current.isBot && !needsPass

  const start = (
    players: Parameters<typeof game.startGame>[0],
    rules: Parameters<typeof game.startGame>[1],
    isPrivate: boolean,
  ) => {
    setPrivateHands(isPrivate)
    setRevealedSeat(null)
    game.startGame(players, rules)
  }

  return (
    <>
      <AnimatePresence mode="wait">
        {game.phase === 'setup' ? (
          <UnoSetupScreen key="setup" onStart={start} onBack={onExit} />
        ) : (
          <UnoGameScreen
            key="game"
            game={game}
            viewerSeat={game.currentPlayerIndex}
            secondaryLabel={t('common:actions.newGame')}
            onSecondary={game.reset}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {needsPass && current && (
          <PassDeviceScreen
            key={`pass-${game.currentPlayerIndex}-${game.turnCount}`}
            name={current.name}
            color={current.color}
            onReady={() => setRevealedSeat(game.currentPlayerIndex)}
          />
        )}

        {showChoice && game.choice && (
          <UnoChoiceOverlay key="choice" choice={game.choice} game={game} seat={game.currentPlayerIndex} />
        )}

        {game.phase === 'roundEnd' && game.currentPlayer && (
          <CelebrationOverlay
            key={`round-${game.roundNumber}`}
            player={game.currentPlayer}
            rank={0}
            canDecide
            waitingFor=""
            message={t('uno:wonRound')}
            onContinue={() => game.decide('continue')}
            onEnd={() => game.decide('end')}
          />
        )}

        {game.phase === 'matchEnd' && game.winner && (
          <WinnerOverlay
            key="winner"
            standings={[game.winner]}
            recap={
              game.matchLog ? (
                <RecapPanel title={t('common:overlay.matchRecap')} rows={unoRecapRows(game.matchLog)} />
              ) : undefined
            }
            onPlayAgain={() =>
              game.startGame(
                game.players.map((p) => ({ name: p.name, color: p.color, isBot: p.isBot, botLevel: p.botLevel })),
                game.rules,
              )
            }
            onSecondary={game.reset}
          />
        )}
      </AnimatePresence>
    </>
  )
}
