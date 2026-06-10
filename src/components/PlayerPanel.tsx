import { motion } from 'motion/react'
import { TOTAL_CELLS } from '../game/config'
import type { Phase, Player } from '../game/types'
import { cn } from '../lib/cn'

interface PlayerPanelProps {
  players: Player[]
  currentPlayerId: number
  phase: Phase
  winnerId: number | null
  /** In online play, the id of the local player (to mark "you"). */
  myId?: number | null
}

export function PlayerPanel({ players, currentPlayerId, phase, winnerId, myId }: PlayerPanelProps) {
  return (
    <ul className="flex w-full flex-col gap-3" aria-label="Players">
      {players.map((p) => {
        const isActive = p.id === currentPlayerId && phase !== 'won'
        const isWinner = p.id === winnerId
        const progress = Math.round((p.position / TOTAL_CELLS) * 100)

        return (
          <motion.li
            key={p.id}
            animate={{ scale: isActive ? 1.02 : 1, opacity: isActive || phase === 'won' ? 1 : 0.7 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className={cn(
              'flex items-center gap-3 rounded-xl bg-white/5 p-3 ring-1 backdrop-blur',
              isActive ? 'ring-white/40' : 'ring-white/10',
            )}
            style={isActive ? { boxShadow: `0 0 0 2px ${p.color}55` } : undefined}
          >
            <span
              className={cn(
                'grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg font-bold text-white ring-2 ring-white/70',
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
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-semibold text-white">
                  {p.name}
                  {myId === p.id && <span className="ml-1 text-xs font-normal text-white/50">(you)</span>}
                </p>
                {isWinner ? (
                  <span className="shrink-0 text-sm font-bold text-amber-300">🏆 Winner</span>
                ) : isActive ? (
                  <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-white/70">
                    Your turn
                  </span>
                ) : null}
              </div>

              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: p.color }}
                    animate={{ width: `${progress}%` }}
                    transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right text-xs tabular-nums text-white/70">
                  {p.position === 0 ? 'Start' : `${p.position}/${TOTAL_CELLS}`}
                </span>
              </div>
            </div>
          </motion.li>
        )
      })}
    </ul>
  )
}
