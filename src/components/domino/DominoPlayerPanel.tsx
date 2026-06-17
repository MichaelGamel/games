import { memo } from 'react'
import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import type { DominoPhase, DominoPlayer } from '../../domino/types'
import { cn } from '../../lib/cn'
import { DominoIcon } from './DominoIcon'

interface DominoPlayerPanelProps {
  players: DominoPlayer[]
  /** Tiles left in each seat's hand, parallel to players. */
  handCounts: number[]
  currentPlayerIndex: number
  phase: DominoPhase
  /** Online: id of the local player (to mark "you"). */
  myId?: number | null
  /** Online: seat ids whose player has left the room (greyed, not removed). */
  absentIds?: readonly number[]
}

/** The roster: each seat's tile count, turn marker, bot/you badges. */
export const DominoPlayerPanel = memo(function DominoPlayerPanel({
  players,
  handCounts,
  currentPlayerIndex,
  phase,
  myId,
  absentIds,
}: DominoPlayerPanelProps) {
  const { t } = useTranslation(['domino', 'common'])
  return (
    <ul className="grid w-full grid-cols-2 gap-1.5 sm:grid-cols-4" aria-label={t('common:setup.players')}>
      {players.map((p) => {
        const count = handCounts[p.id] ?? 0
        const absent = absentIds?.includes(p.id) ?? false
        const isActive = p.id === currentPlayerIndex && phase !== 'won' && !absent
        const onLast = count === 1
        return (
          <m.li
            key={p.id}
            animate={{
              scale: isActive ? 1.02 : 1,
              opacity: absent ? 0.45 : isActive || phase === 'won' ? 1 : 0.72,
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className={cn(
              'flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5 ring-1 backdrop-blur transition-[filter] lg:gap-3 lg:rounded-xl lg:p-3',
              isActive ? 'ring-white/40' : 'ring-white/10',
              absent && 'grayscale',
            )}
            style={isActive ? { boxShadow: `0 0 0 2px ${p.color}55` } : undefined}
          >
            <span
              className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white ring-2 ring-white/70 lg:h-9 lg:w-9 lg:text-base',
                isActive && 'animate-pulse-ring',
              )}
              style={{
                background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.85), rgba(255,255,255,0) 45%), ${p.color}`,
              }}
              aria-hidden="true"
            >
              {p.name.charAt(0).toUpperCase()}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1.5">
                <p className="truncate text-sm font-semibold text-white">
                  {p.name}
                  {p.isBot && (
                    <span className="ms-1 text-xs" title={t('common:game.botPlayer')} aria-label={t('common:game.botPlayer')}>
                      🤖
                    </span>
                  )}
                  {myId === p.id && <span className="ms-1 text-xs font-normal text-white/50">{t('common:game.you')}</span>}
                </p>
                {absent && (
                  <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/60">
                    {t('common:game.away')}
                  </span>
                )}
                {!absent && onLast && (
                  <span className="shrink-0 rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 ring-1 ring-amber-300/40">
                    {t('lastTile')}
                  </span>
                )}
              </div>

              <div className="mt-1 flex items-center gap-1 text-xs text-white/70" aria-label={t('tileCount', { n: count })}>
                <DominoIcon className="h-3.5 w-3.5" />
                <span className="tabular-nums">{count}</span>
              </div>
            </div>
          </m.li>
        )
      })}
    </ul>
  )
})
