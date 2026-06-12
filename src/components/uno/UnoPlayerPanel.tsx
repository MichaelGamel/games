import { memo } from 'react'
import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import type { UnoPhase, UnoPlayer } from '../../uno/types'
import { cn } from '../../lib/cn'

interface UnoPlayerPanelProps {
  players: UnoPlayer[]
  handCounts: number[]
  saidUno: boolean[]
  scores: number[]
  /** Show cumulative scores (score-to-target mode). */
  showScores: boolean
  currentPlayerIndex: number
  phase: UnoPhase
  /** Online: id of the local player (to mark "you"). */
  myId?: number | null
}

/** The roster: each seat's hand count, turn marker, UNO badge and score. */
export const UnoPlayerPanel = memo(function UnoPlayerPanel({
  players,
  handCounts,
  saidUno,
  scores,
  showScores,
  currentPlayerIndex,
  phase,
  myId,
}: UnoPlayerPanelProps) {
  const { t } = useTranslation(['uno', 'common'])
  return (
    <ul className="grid w-full grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-2" aria-label={t('common:setup.players')}>
      {players.map((p) => {
        const count = handCounts[p.id] ?? 0
        const isActive = p.id === currentPlayerIndex && phase !== 'matchEnd'
        const onUno = count === 1 && saidUno[p.id]
        const exposed = count === 1 && !saidUno[p.id]
        return (
          <m.li
            key={p.id}
            animate={{ scale: isActive ? 1.02 : 1, opacity: isActive || phase === 'matchEnd' ? 1 : 0.72 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className={cn(
              'flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5 ring-1 backdrop-blur lg:gap-3 lg:rounded-xl lg:p-3',
              isActive ? 'ring-white/40' : 'ring-white/10',
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
                {onUno && (
                  <span className="shrink-0 rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 ring-1 ring-amber-300/40">
                    UNO!
                  </span>
                )}
                {exposed && (
                  <span className="shrink-0 animate-pulse rounded-full bg-orange-500/25 px-1.5 py-0.5 text-[10px] font-bold text-orange-300">
                    ●1
                  </span>
                )}
              </div>

              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 text-xs text-white/70" aria-label={t('handCount', { n: count })}>
                  <span aria-hidden="true">🃏</span>
                  <span className="tabular-nums">{count}</span>
                </span>
                {showScores && (
                  <span className="text-xs tabular-nums text-white/60">{t('points', { n: scores[p.id] ?? 0 })}</span>
                )}
              </div>
            </div>
          </m.li>
        )
      })}
    </ul>
  )
})
