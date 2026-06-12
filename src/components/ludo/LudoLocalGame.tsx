import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { useLudo } from '../../hooks/useLudo'
import { useLudoBotAutoPlay } from '../../hooks/useLudoBotAutoPlay'
import { useRecordMatch } from '../../hooks/useRecordMatch'
import { useUnloadGuard } from '../../hooks/useUnloadGuard'
import { CelebrationOverlay } from '../CelebrationOverlay'
import { WinnerOverlay } from '../WinnerOverlay'
import { RecapPanel } from '../RecapPanel'
import { ludoRecapRows } from '../recapRows'
import { LudoReplay } from './LudoReplay'
import { LudoSetupScreen } from './LudoSetupScreen'
import { LudoGameScreen } from './LudoGameScreen'

/** Local "pass & play": all players share one screen and device. */
export function LudoLocalGame({ onExit }: { onExit: () => void }) {
  const { t } = useTranslation(['ludo', 'common'])
  const game = useLudo({ controlsPlayer: 'all' })
  const [replayLog, setReplayLog] = useState<typeof game.matchLog>(null)
  // Auto-roll / auto-select for any computer players on their turn.
  useLudoBotAutoPlay(game)
  // Warn before closing/refreshing/navigating away while a game is in progress.
  useUnloadGuard(game.phase !== 'setup' && game.phase !== 'won')
  // Hall-of-Fame bookkeeping: one entry per finished match.
  useRecordMatch('ludo', game.phase, game.players, game.winnerId)

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
            message={t('ludo:celebrationMessage')}
            onContinue={() => game.decide('continue')}
            onEnd={() => game.decide('end')}
          />
        )}
        {game.phase === 'won' && game.standings.length > 0 && (
          <WinnerOverlay
            key="winner"
            standings={game.standings}
            recap={
              game.matchLog ? (
                <RecapPanel title={t('common:overlay.matchRecap')} rows={ludoRecapRows(game.matchLog)} />
              ) : undefined
            }
            onReplay={
              game.matchLog && game.matchLog.events.length > 0
                ? () => setReplayLog(game.matchLog)
                : undefined
            }
            onPlayAgain={() =>
              game.startGame(
                game.players.map((p) => ({
                  name: p.name,
                  color: p.color,
                  isBot: p.isBot,
                  botLevel: p.botLevel,
                })),
                game.rules,
              )
            }
            onSecondary={game.reset}
          />
        )}
      </AnimatePresence>

      {replayLog && <LudoReplay log={replayLog} onClose={() => setReplayLog(null)} />}
    </>
  )
}
