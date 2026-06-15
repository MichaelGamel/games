import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { useBackgammon } from '../../hooks/useBackgammon'
import { useBackgammonBotAutoPlay } from '../../hooks/useBackgammonBotAutoPlay'
import { useUnloadGuard } from '../../hooks/useUnloadGuard'
import { useRecordMatch } from '../../hooks/useRecordMatch'
import { BackgammonSetupScreen } from './BackgammonSetupScreen'
import { BackgammonGameScreen } from './BackgammonGameScreen'
import { BackgammonReplay } from './BackgammonReplay'
import { WinnerOverlay } from '../WinnerOverlay'
import { RecapPanel } from '../RecapPanel'
import { backgammonRecapRows } from '../recapRows'

/** Local "pass & play" Backgammon: two players (or a bot) on one screen. */
export function BackgammonLocalGame({ onExit }: { onExit: () => void }) {
  const { t } = useTranslation(['backgammon', 'common'])
  const game = useBackgammon({ controlsPlayer: 'all' })
  useBackgammonBotAutoPlay(game)
  useUnloadGuard(game.phase !== 'setup' && game.phase !== 'won')
  // Hall-of-Fame bookkeeping: one entry per finished match.
  useRecordMatch('backgammon', game.phase, game.players, game.winnerId)
  const [replayLog, setReplayLog] = useState<typeof game.matchLog>(null)

  const playAgain = () =>
    game.startGame(
      game.players.map((p) => ({ name: p.name, color: p.color, isBot: p.isBot, botLevel: p.botLevel })),
    )

  return (
    <>
      <AnimatePresence mode="wait">
        {game.phase === 'setup' ? (
          <BackgammonSetupScreen key="setup" onStart={game.startGame} onBack={onExit} />
        ) : (
          <BackgammonGameScreen key="game" game={game} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {game.phase === 'won' && game.standings.length > 0 && (
          <WinnerOverlay
            key="winner"
            standings={game.standings}
            recap={
              game.matchLog ? (
                <RecapPanel title={t('common:overlay.matchRecap')} rows={backgammonRecapRows(game.matchLog)} />
              ) : undefined
            }
            onReplay={
              game.matchLog && game.matchLog.events.length > 0 ? () => setReplayLog(game.matchLog) : undefined
            }
            onPlayAgain={playAgain}
            onSecondary={game.reset}
          />
        )}
      </AnimatePresence>

      {replayLog && <BackgammonReplay log={replayLog} onClose={() => setReplayLog(null)} />}
    </>
  )
}
