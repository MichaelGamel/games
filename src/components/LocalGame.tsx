import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { useSnakesAndLadders } from '../hooks/useSnakesAndLadders'
import { useBotAutoPlay } from '../hooks/useBotAutoPlay'
import { useRecordMatch } from '../hooks/useRecordMatch'
import { useUnloadGuard } from '../hooks/useUnloadGuard'
import { SetupScreen } from './SetupScreen'
import { GameScreen } from './GameScreen'
import { WinnerOverlay } from './WinnerOverlay'
import { CelebrationOverlay } from './CelebrationOverlay'
import { RecapPanel } from './RecapPanel'
import { snakesRecapRows } from './recapRows'
import { SnakesReplay } from './SnakesReplay'

/** Local "pass & play": all players share one screen and device. */
export function LocalGame({ onExit }: { onExit: () => void }) {
  const { t } = useTranslation(['snakes', 'common'])
  const game = useSnakesAndLadders({ controlsPlayer: 'all' })
  const [replayLog, setReplayLog] = useState<typeof game.matchLog>(null)
  // Auto-roll for any computer players when it's their turn.
  useBotAutoPlay(game)
  // Warn before closing/refreshing/navigating away while a game is in progress.
  useUnloadGuard(game.phase !== 'setup' && game.phase !== 'won')
  // Hall-of-Fame bookkeeping: one entry per finished match.
  useRecordMatch('snakes', game.phase, game.players, game.winnerId)

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
            message={t('snakes:celebrationMessage')}
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
                <RecapPanel title={t('common:overlay.matchRecap')} rows={snakesRecapRows(game.matchLog)} />
              ) : undefined
            }
            onReplay={
              game.matchLog && game.matchLog.events.length > 0
                ? () => setReplayLog(game.matchLog)
                : undefined
            }
            onPlayAgain={() =>
              // Replay with the same lineup and rules (same surprise board too —
              // a rematch is fairest on the board everyone just learned).
              game.startGame(
                game.players.map((p) => ({ name: p.name, color: p.color, isBot: p.isBot })),
                game.rules,
              )
            }
            onSecondary={game.reset}
          />
        )}
      </AnimatePresence>

      {replayLog && <SnakesReplay log={replayLog} onClose={() => setReplayLog(null)} />}
    </>
  )
}
