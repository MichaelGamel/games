import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useLudo } from '../../hooks/useLudo'
import type { MatchLog } from '../../lib/matchLog'
import type { LudoRules, LudoTurnResolution } from '../../ludo/types'
import { LudoGameScreen } from './LudoGameScreen'
import { Backdrop } from '../Backdrop'

interface LudoReplayProps {
  log: MatchLog<LudoTurnResolution, LudoRules>
  onClose: () => void
}

/**
 * Re-watch a finished Ludo match — the recorded events are fed through the
 * same remote-event pipeline online play uses, so every turn replays with its
 * full animation. Mirrors `SnakesReplay`.
 */
export function LudoReplay({ log, onClose }: LudoReplayProps) {
  const { t } = useTranslation()
  const replay = useLudo({ controlsPlayer: -1 })

  const startedRef = useRef(false)
  const { applyRemoteStart, applyRemoteTurn, applySkip, applyRemoteDecision } = replay
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    applyRemoteStart(log.players, log.rules)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        <LudoGameScreen game={replay} />
      </Backdrop>
    </div>
  )
}
