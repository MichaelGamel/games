import { motion } from 'motion/react'
import { PROGRESS_BASE, PROGRESS_GOAL, TOKENS_PER_PLAYER } from '../../ludo/config'
import type { LudoPhase, LudoPlayer } from '../../ludo/types'
import { placeLabel, placeMedal } from '../../lib/place'
import { cn } from '../../lib/cn'

interface LudoPlayerPanelProps {
  players: LudoPlayer[]
  currentPlayerIndex: number
  phase: LudoPhase
  /** Seat ids in podium order (finished players wear their medal). */
  finishedOrder: number[]
  /** In online play, the id of the local player (to mark "you"). */
  myId?: number | null
}

/**
 * The roster, mirroring the Snakes `PlayerPanel`: stacked cards on desktop, a
 * compact two-column chip grid on mobile. Each player shows four token pips
 * (base / on-board / home) and a "home n/4" progress bar.
 */
export function LudoPlayerPanel({
  players,
  currentPlayerIndex,
  phase,
  finishedOrder,
  myId,
}: LudoPlayerPanelProps) {
  return (
    <ul className="grid w-full grid-cols-2 gap-1.5 lg:flex lg:flex-col lg:gap-3" aria-label="Players">
      {players.map((p) => {
        const rank = finishedOrder.indexOf(p.id)
        const finished = rank >= 0
        const isActive = p.id === currentPlayerIndex && phase !== 'won' && !finished
        const home = p.tokens.filter((t) => t === PROGRESS_GOAL).length
        const progress = Math.round((home / TOKENS_PER_PLAYER) * 100)

        return (
          <motion.li
            key={p.id}
            animate={{
              scale: isActive ? 1.02 : 1,
              opacity: isActive || phase === 'won' || finished ? 1 : 0.7,
            }}
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
                {/* Mobile: medal when finished, else home count. */}
                <span className="shrink-0 text-xs tabular-nums text-white/70 lg:hidden">
                  {finished ? placeMedal(rank) : `${home}/${TOKENS_PER_PLAYER}`}
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

              {/* Token pips: base (hollow) · on-board (filled) · home (gold). */}
              <div className="mt-1 flex items-center gap-1.5">
                {p.tokens.map((t, i) => {
                  const atHome = t === PROGRESS_GOAL
                  const inBase = t === PROGRESS_BASE
                  return (
                    <span
                      key={i}
                      className={cn(
                        'h-2 w-2 rounded-full ring-1 lg:h-2.5 lg:w-2.5',
                        atHome ? 'ring-amber-300' : 'ring-white/40',
                      )}
                      style={{
                        background: atHome ? '#fbbf24' : inBase ? 'transparent' : p.color,
                      }}
                      aria-hidden="true"
                    />
                  )
                })}
                <span className="ml-auto hidden text-xs tabular-nums text-white/60 lg:inline">
                  {finished ? 'Home!' : `${home}/${TOKENS_PER_PLAYER} home`}
                </span>
              </div>

              <div className="mt-1.5 hidden h-1.5 overflow-hidden rounded-full bg-white/10 lg:block">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: p.color }}
                  animate={{ width: `${progress}%` }}
                  transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                />
              </div>
            </div>
          </motion.li>
        )
      })}
    </ul>
  )
}
