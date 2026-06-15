import { memo, useMemo, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { BackgammonController } from '../../hooks/useBackgammon'
import { BackgammonBoard } from './board/BackgammonBoard'
import { Dice3D } from '../dice/Dice3D'
import { RoomBadge, type OnlineMeta } from '../online/RoomBadge'
import { LanguageSwitcher } from '../LanguageSwitcher'
import { cn } from '../../lib/cn'

interface BackgammonGameScreenProps {
  game: BackgammonController
  online?: OnlineMeta
}

/**
 * The in-match Backgammon screen: header, the two player chips (with live pip
 * counts), the board, the dice + action bar. Mirrors the layout language of the
 * other game screens.
 */
export function BackgammonGameScreen({ game, online }: BackgammonGameScreenProps) {
  const { t } = useTranslation(['backgammon', 'common', 'online'])
  const myId = game.controlsPlayer === 'all' ? null : game.controlsPlayer
  const currentBot = game.currentPlayer?.isBot ?? false
  const interactive =
    game.phase === 'selecting' && game.isMyTurn && !currentBot && (!online || online.canPlay)

  const [selectedFrom, setSelectedFrom] = useState<number | null>(null)

  const sources = useMemo(() => new Set(game.selectable.map((h) => h.from)), [game.selectable])
  // Honour the selection only while it's a live source this turn — no effect
  // needed to clear a stale pick when the phase or roll changes.
  const effectiveSelectedFrom =
    game.phase === 'selecting' && selectedFrom != null && sources.has(selectedFrom) ? selectedFrom : null
  const destinations = useMemo(() => {
    if (effectiveSelectedFrom == null) return new Set<number>()
    return new Set(game.selectable.filter((h) => h.from === effectiveSelectedFrom).map((h) => h.to))
  }, [game.selectable, effectiveSelectedFrom])

  const onPointClick = (point: number) => {
    if (!interactive) return
    if (effectiveSelectedFrom != null && destinations.has(point)) {
      game.playHop(effectiveSelectedFrom, point)
      setSelectedFrom(null)
      return
    }
    if (sources.has(point)) {
      const dests = game.selectable.filter((h) => h.from === point)
      if (dests.length === 1) {
        game.playHop(point, dests[0].to)
        setSelectedFrom(null)
      } else {
        setSelectedFrom(point)
      }
      return
    }
    setSelectedFrom(null)
  }

  return (
    <m.div
      key="backgammon-game"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative z-10 mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center justify-center gap-3 px-3 py-6"
    >
      <LanguageSwitcher compact className="fixed end-3 top-3 z-30" />

      <header className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-white drop-shadow sm:text-3xl">
          {t('backgammon:title')}
        </h1>
        {online && <RoomBadge meta={online} />}
      </header>

      <PlayerChips game={game} myId={myId} absentIds={online?.absentSeats} />

      <div className="w-full">
        <BackgammonBoard
          board={game.boardView}
          players={game.players}
          seat={game.currentPlayerIndex}
          sources={sources}
          destinations={destinations}
          selectedFrom={effectiveSelectedFrom}
          active={game.activeChecker}
          interactive={interactive}
          onPointClick={onPointClick}
        />
      </div>

      <DiceRow game={game} />

      <div className="flex w-full items-center justify-between gap-2 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10 backdrop-blur">
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

      <ActionBar game={game} interactive={interactive} />
    </m.div>
  )
}

/** Roll / Undo / Confirm — the per-turn controls. */
function ActionBar({ game, interactive }: { game: BackgammonController; interactive: boolean }) {
  const { t } = useTranslation(['backgammon', 'common'])
  const showRoll = game.canRoll && !(game.currentPlayer?.isBot ?? false)
  if (showRoll) {
    return (
      <m.button
        type="button"
        onClick={() => void game.roll()}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.96 }}
        className="rounded-xl bg-linear-to-r from-grape to-grape-light px-10 py-3 text-lg font-bold text-white shadow-xl ring-1 ring-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        🎲 {t('common:actions.rollDice')}
      </m.button>
    )
  }
  if (interactive && game.phase === 'selecting') {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={game.undoHop}
          disabled={!game.canUndoHop}
          className={cn(
            'rounded-xl px-6 py-3 text-sm font-semibold ring-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white',
            game.canUndoHop
              ? 'bg-white/10 text-white ring-white/20 hover:bg-white/15'
              : 'cursor-not-allowed bg-white/5 text-white/30 ring-white/10',
          )}
        >
          ↩︎ {t('common:actions.undo')}
        </button>
        <button
          type="button"
          onClick={game.endTurn}
          disabled={!game.canConfirm}
          className={cn(
            'rounded-xl px-8 py-3 text-base font-bold ring-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white',
            game.canConfirm
              ? 'bg-linear-to-r from-emerald-500 to-emerald-400 text-white ring-white/20 hover:brightness-110'
              : 'cursor-not-allowed bg-white/5 text-white/30 ring-white/10',
          )}
        >
          ✓ {t('backgammon:confirm')}
        </button>
      </div>
    )
  }
  return <div className="h-12" aria-hidden="true" />
}

function DiceRow({ game }: { game: BackgammonController }) {
  const rolling = game.phase === 'rolling'
  const d0 = game.lastDice[0] ?? null
  const d1 = game.lastDice[1] ?? null
  return (
    <div className="flex items-center gap-4">
      <Dice3D value={d0} rolling={rolling} size={56} />
      <Dice3D value={d1} rolling={rolling} size={56} />
      {game.phase === 'selecting' && game.remainingDice.length > 0 && (
        <div className="flex items-center gap-1.5">
          {game.remainingDice.map((d, i) => (
            <span
              key={i}
              className="grid h-7 w-7 place-items-center rounded-md bg-white/10 text-sm font-bold text-white ring-1 ring-white/20"
            >
              {d}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

const PlayerChips = memo(function PlayerChips({
  game,
  myId,
  absentIds,
}: {
  game: BackgammonController
  myId: number | null
  absentIds?: readonly number[]
}) {
  const { t } = useTranslation(['backgammon', 'common'])
  return (
    <ul className="flex w-full gap-2" aria-label={t('common:setup.players')}>
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
            <span className="h-5 w-5 shrink-0 rounded-full ring-2 ring-white/60" style={{ background: p.color }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
              {p.name}
              {p.isBot && <span className="ms-1 text-xs" aria-label={t('common:game.botPlayer')}>🤖</span>}
              {myId === p.id && <span className="ms-1 text-xs font-normal text-white/50">{t('common:game.you')}</span>}
            </span>
            <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-white/70" title={t('backgammon:pipCount')}>
              {game.pipCounts[p.id]}
            </span>
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
  game: BackgammonController,
  t: TFunction<['backgammon', 'common', 'online']>,
  online?: OnlineMeta,
): string {
  if (game.phase === 'won') {
    if (!game.winner) return ''
    const reason = game.winReason
    if (reason === 'backgammon') return t('backgammon:status.winsBackgammon', { name: game.winner.name })
    if (reason === 'gammon') return t('backgammon:status.winsGammon', { name: game.winner.name })
    return t('backgammon:status.wins', { name: game.winner.name })
  }
  if (online && !online.canPlay) return t('online:status.waitingReconnect')
  const cur = game.currentPlayer
  if (!cur) return ''
  if (game.phase === 'rolling') return t('backgammon:status.rolling', { name: cur.name })
  if (game.phase === 'selecting') {
    if (!game.isMyTurn) return t('backgammon:status.movingFor', { name: cur.name })
    if (game.canConfirm) return t('backgammon:status.confirmHint')
    return t('backgammon:status.movePrompt')
  }
  if (game.phase === 'moving') return t('backgammon:status.movingFor', { name: cur.name })
  // idle
  if (online) {
    return game.isMyTurn ? t('backgammon:status.yourRoll') : t('backgammon:status.waitingFor', { name: cur.name })
  }
  return t('backgammon:status.turnRoll', { name: cur.name })
}
