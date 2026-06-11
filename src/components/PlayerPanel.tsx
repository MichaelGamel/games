import { motion } from 'motion/react'
import { TOTAL_CELLS } from '../game/config'
import type { Phase, Player } from '../game/types'
import { placeLabel, placeMedal } from '../lib/place'
import { cn } from '../lib/cn'

interface PlayerPanelProps {
  players: Player[]
  currentPlayerId: number
  phase: Phase
  /** Player ids in podium order (finished players wear their medal). */
  finishedOrder: number[]
  /** In online play, the id of the local player (to mark "you"). */
  myId?: number | null
}

/**
 * The roster. Stacked detail cards on desktop; a compact two-column chip grid
 * on mobile so the board and the roll button fit on one screen together.
 */
export function PlayerPanel({
  players,
  currentPlayerId,
  phase,
  finishedOrder,
  myId,
}: PlayerPanelProps) {
  return (
    <ul className="grid w-full grid-cols-2 gap-1.5 lg:flex lg:flex-col lg:gap-3" aria-label="Players">
      {players.map((p) => {
        const rank = finishedOrder.indexOf(p.id)
        const finished = rank >= 0
        const isActive = p.id === currentPlayerId && phase !== 'won' && !finished
        const progress = Math.round((p.position / TOTAL_CELLS) * 100)

        return (
          <motion.li
            key={p.id}
            animate={{ scale: isActive ? 1.02 : 1, opacity: isActive || phase === 'won' || finished ? 1 : 0.7 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className={cn(
              'flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5 ring-1 backdrop-blur lg:gap-3 lg:rounded-xl lg:p-3',
              isActive ? 'ring-white/40' : 'ring-white/10',
            )}
            style={isActive ? { boxShadow: `0 0 0 2px ${p.color}55` } : undefined}
          >
            <span
              className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white ring-2 ring-white/70 lg:h-10 lg:w-10 lg:text-lg',
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
                <p className="truncate text-sm font-semibold text-white lg:text-base">
                  {p.name}
                  {p.isBot && (
                    <span className="ml-1 text-xs" title="Computer player" aria-label="computer player">
                      🤖
                    </span>
                  )}
                  {myId === p.id && <span className="ml-1 text-xs font-normal text-white/50">(you)</span>}
                </p>
                {/* Mobile: tiny right slot — medal when finished, cell number otherwise. */}
                <span className="shrink-0 text-xs tabular-nums text-white/70 lg:hidden">
                  {finished ? placeMedal(rank) : p.position === 0 ? '–' : p.position}
                </span>
                {/* Desktop: medal + place, or turn marker. */}
                {finished ? (
                  <span className="hidden shrink-0 text-sm font-bold text-amber-300 lg:inline">
                    {placeMedal(rank)} {placeLabel(rank)}
                  </span>
                ) : isActive ? (
                  <span className="hidden shrink-0 text-xs font-semibold uppercase tracking-wide text-white/70 lg:inline">
                    Your turn
                  </span>
                ) : null}
              </div>

              <div className="mt-1 hidden items-center gap-2 lg:flex">
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
