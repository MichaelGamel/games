import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSnakesAndLadders } from '../hooks/useSnakesAndLadders'
import type { MatchLog } from '../lib/matchLog'
import type { SnakesRules, TurnResolution } from '../game/types'
import { GameScreen } from './GameScreen'
import { Backdrop } from './Backdrop'

interface SnakesReplayProps {
  log: MatchLog<TurnResolution, SnakesRules>
  onClose: () => void
}

/**
 * Re-watch a finished match. A fresh (spectator) game controller is started
 * with the recorded lineup, then every recorded event is fed through the same
 * remote-event pipeline online play uses — the sequencer queues them and plays
 * each one with full animation, exactly as it originally happened.
 */
export function SnakesReplay({ log, onClose }: SnakesReplayProps) {
  const { t } = useTranslation()
  const replay = useSnakesAndLadders({ controlsPlayer: -1 })

  // 1) Start the match once.
  const startedRef = useRef(false)
  const { applyRemoteStart, applyRemoteTurn, applySkip, applyRemoteDecision } = replay
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    applyRemoteStart(log.players, log.rules)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 2) Feed every event once the start has committed (players visible). The
  //    sequencer's queue paces them one animated turn at a time.
  const fedRef = useRef(false)
  useEffect(() => {
    if (fedRef.current || replay.phase !== 'idle' || replay.players.length === 0) return
    fedRef.current = true
    log.events.forEach((event, i) => {
      const seq = i + 1
      if (event.kind === 'turn') applyRemoteTurn(event.resolution, seq)
      else if (event.kind === 'skip') applySkip(seq)
      else applyRemoteDecision(event.decision, seq)
    })
  }, [replay.phase, replay.players.length, log.events, applyRemoteTurn, applySkip, applyRemoteDecision])

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-night-900">
      <Backdrop>
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex items-center justify-between px-4 py-3">
          <span className="rounded-full bg-night-800/90 px-3 py-1.5 text-sm font-bold text-amber-300 ring-1 ring-white/15">
            {t('actions.watchReplay')}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="pointer-events-auto rounded-lg bg-night-800/90 px-4 py-1.5 text-sm font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            ✕ {t('actions.close')}
          </button>
        </div>
        <GameScreen game={replay} />
      </Backdrop>
    </div>
  )
}
