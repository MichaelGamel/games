import { memo } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { FourController } from '../../hooks/useConnectFour'
import { FourBoard } from './FourBoard'
import { RoomBadge, type OnlineMeta } from '../online/RoomBadge'
import { cn } from '../../lib/cn'

interface FourGameScreenProps {
  game: FourController
  online?: OnlineMeta
}

/**
 * The in-match Connect Four screen — a compact column: header, the two player
 * chips, the rack, and an action bar. Mirrors the layout language of the other
 * game screens.
 */
export function FourGameScreen({ game, online }: FourGameScreenProps) {
  const { t } = useTranslation(['four', 'common', 'online'])
  const myId = game.controlsPlayer === 'all' ? null : game.controlsPlayer
  const canDrop = game.canDrop && (!online || online.canPlay) && !(game.currentPlayer?.isBot ?? false)

  return (
    <m.div
      key="four-game"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative z-10 mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center gap-4 px-3 py-6"
    >
      <header className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-white drop-shadow sm:text-3xl">
          <span aria-hidden="true">🔴</span> {t('four:title')} <span aria-hidden="true">🟡</span>
        </h1>
        {online && <RoomBadge meta={online} />}
      </header>

      <PlayerChips game={game} myId={myId} absentIds={online?.absentSeats} />

      <div className="w-full max-w-xl">
        <FourBoard
          board={game.board}
          players={game.players}
          activeDrop={game.activeDrop}
          winLine={game.winLine}
          winLitCount={game.winLit}
          canDrop={canDrop}
          onDrop={game.drop}
        />
      </div>

      <div className="flex w-full max-w-xl items-center justify-between gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10 backdrop-blur">
        <button
          type="button"
          onClick={game.toggleMute}
          aria-pressed={game.muted}
          aria-label={game.muted ? t('common:actions.unmuteAria') : t('common:actions.muteAria')}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-white/80 ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          <span aria-hidden="true">{game.muted ? '🔇' : '🔊'}</span>
          {game.muted ? t('common:actions.muted') : t('common:actions.sound')}
        </button>
        <p className="min-w-0 flex-1 truncate text-center text-sm text-white/70" role="status" aria-live="polite">
          {statusText(game, t, online)}
        </p>
        <button
          type="button"
          onClick={online ? online.onLeave : game.reset}
          className="rounded-lg px-3 py-1.5 text-sm text-white/80 ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          {online ? t('common:actions.leave') : t('common:actions.newGame')}
        </button>
      </div>
    </m.div>
  )
}

const PlayerChips = memo(function PlayerChips({
  game,
  myId,
  absentIds,
}: {
  game: FourController
  myId: number | null
  absentIds?: readonly number[]
}) {
  const { t } = useTranslation(['four', 'common'])
  return (
    <ul className="flex w-full max-w-xl gap-2" aria-label={t('common:setup.players')}>
      {game.players.map((p) => {
        const absent = absentIds?.includes(p.id) ?? false
        const active = p.id === game.currentPlayerIndex && game.phase !== 'won' && !absent
        return (
          <li
            key={p.id}
            className={cn(
              'flex flex-1 items-center gap-2 rounded-xl bg-white/5 px-3 py-2 ring-1 backdrop-blur transition',
              active ? 'ring-white/40' : 'ring-white/10 opacity-70',
              absent && 'opacity-40 grayscale',
            )}
            style={active ? { boxShadow: `0 0 0 2px ${p.color}55` } : undefined}
          >
            <span
              className="h-5 w-5 shrink-0 rounded-full ring-2 ring-white/60"
              style={{ background: p.color }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
              {p.name}
              {p.isBot && (
                <span
                  className="ms-1 text-xs"
                  title={t('common:game.botPlayer')}
                  aria-label={t('common:game.botPlayer')}
                >
                  🤖
                </span>
              )}
              {myId === p.id && (
                <span className="ms-1 text-xs font-normal text-white/50">
                  {t('common:game.you')}
                </span>
              )}
            </span>
            {absent && (
              <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/60">
                {t('common:game.away')}
              </span>
            )}
            <AnimatePresence>
              {active && (
                <m.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="shrink-0 text-xs font-semibold uppercase tracking-wide text-white/70"
                >
                  {t('common:game.turn')}
                </m.span>
              )}
            </AnimatePresence>
          </li>
        )
      })}
    </ul>
  )
})

function statusText(
  game: FourController,
  t: TFunction<['four', 'common', 'online']>,
  online?: OnlineMeta,
): string {
  if (game.phase === 'won') {
    if (game.draw) return t('four:status.draw')
    return game.winner ? t('four:status.wins', { name: game.winner.name }) : ''
  }
  if (online && !online.canPlay) return t('online:status.waitingReconnect')
  const cur = game.currentPlayer
  if (!cur) return ''
  if (game.phase === 'dropping') return t('four:status.drops', { name: cur.name })
  if (online) {
    return game.isMyTurn
      ? t('four:status.yourTurn')
      : t('four:status.waitingFor', { name: cur.name })
  }
  return t('four:status.turnPick', { name: cur.name })
}
