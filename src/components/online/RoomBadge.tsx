import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'

/** What a game screen needs to know about the online room it is part of. */
export interface OnlineMeta {
  roomCode: string
  /** True when every player from the started lineup is still connected. */
  everyonePresent: boolean
  /** True while enough active players are connected to keep playing. */
  canPlay: boolean
  /** Seat indices whose player has left the room (greyed in the roster). */
  absentSeats?: readonly number[]
  testMode: boolean
  /** Seconds left on the current turn's clock, or null when no clock runs. */
  turnSecondsLeft?: number | null
  /** True when this client is watching without a seat. */
  spectator?: boolean
  onLeave: () => void
}

/** Show the turn clock only once it gets urgent — a permanent timer is noise. */
const TIMER_VISIBLE_FROM_S = 15

/** Connection dot + room code, shown under a game screen's title. */
export function RoomBadge({ meta }: { meta: OnlineMeta }) {
  const { t } = useTranslation('online')
  const seconds = meta.turnSecondsLeft ?? null
  const showTimer = seconds != null && seconds <= TIMER_VISIBLE_FROM_S
  return (
    <div className="mt-1.5 flex items-center justify-center gap-2 text-xs lg:mt-2">
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold',
          meta.everyonePresent ? 'bg-emerald-500/20 text-emerald-200' : 'bg-amber-500/20 text-amber-200',
        )}
      >
        <span
          className={cn('h-2 w-2 rounded-full', meta.everyonePresent ? 'bg-emerald-400' : 'bg-amber-400')}
          aria-hidden="true"
        />
        {meta.everyonePresent ? t('badge.connected') : t('badge.playerAway')}
      </span>
      <span className="rounded-full bg-white/10 px-2.5 py-1 font-mono tracking-widest text-white/80">
        {meta.roomCode}
      </span>
      {meta.spectator && (
        <span className="rounded-full bg-sky-500/20 px-2.5 py-1 font-semibold text-sky-200">
          {t('spectate.watching')}
        </span>
      )}
      {showTimer && (
        <span
          className={cn(
            'rounded-full px-2.5 py-1 font-semibold tabular-nums',
            seconds <= 5 ? 'animate-pulse bg-rose-500/25 text-rose-200' : 'bg-white/10 text-white/70',
          )}
          role="timer"
          aria-label={t('badge.timerAria', { count: seconds })}
        >
          ⏱ {seconds}s
        </span>
      )}
    </div>
  )
}
