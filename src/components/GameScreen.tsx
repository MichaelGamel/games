import { AnimatePresence, m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { GameController, SpecialFlashKind } from '../hooks/useSnakesAndLadders'
import { useRollHotkey } from '../hooks/useRollHotkey'
import { placeKey } from '../lib/place'
import { Board } from './board/Board'
import { PlayerPanel } from './PlayerPanel'
import { Controls } from './Controls'
import { RoomBadge, type OnlineMeta } from './online/RoomBadge'
import { LanguageSwitcher } from './LanguageSwitcher'
import { cn } from '../lib/cn'

export type { OnlineMeta }

interface GameScreenProps {
  game: GameController
  online?: OnlineMeta
}

/**
 * The in-match screen.
 *
 * Mobile (< lg) is a single non-scrolling column — compact header, player
 * chips, a board that shrinks to the leftover height, and a docked dice bar —
 * so rolling and watching the board never requires scrolling. Desktop keeps
 * the side-by-side board + panel layout via a two-column grid.
 */
export function GameScreen({ game, online }: GameScreenProps) {
  const { t } = useTranslation(['snakes', 'common', 'online'])
  const myId = game.controlsPlayer === 'all' ? null : game.controlsPlayer

  // You can't act if it's not your turn, or (online) too few players remain.
  const canRoll = game.canRoll && (!online || online.canPlay)

  // Keyboard roll (Space / Enter) when allowed, unless focus is on a control.
  useRollHotkey(canRoll, game.roll)

  const accentColor = game.currentPlayer?.color ?? '#8b5cf6'
  const luckyPlayer =
    game.extraTurnFlash != null ? (game.players[game.extraTurnFlash.playerId] ?? null) : null
  const specialPlayer =
    game.specialFlash != null ? (game.players[game.specialFlash.playerId] ?? null) : null

  return (
    <m.div
      key="game"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn(
        // Mobile: a fixed-height column that always fits the viewport.
        'relative z-10 mx-auto flex h-dvh w-full max-w-6xl flex-col gap-2 px-3 pb-2 pt-3',
        // Desktop: board on the left, stacked panel on the right, centered.
        'lg:grid lg:h-auto lg:min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:content-center lg:items-center lg:gap-x-10 lg:gap-y-4 lg:px-4 lg:py-8',
      )}
    >
      <LanguageSwitcher compact className="fixed end-3 top-3 z-30" />

      <header className="shrink-0 text-center lg:col-start-2">
        <h1 className="text-lg font-bold tracking-tight text-white drop-shadow sm:text-2xl lg:text-3xl">
          <span aria-hidden="true">🐍</span> {t('snakes:title')} <span aria-hidden="true">🪜</span>
        </h1>
        {online && <RoomBadge meta={online} />}
      </header>

      <div className="shrink-0 lg:col-start-2">
        <PlayerPanel
          players={game.players}
          currentPlayerId={game.currentPlayerIndex}
          phase={game.phase}
          finishedOrder={game.finishedOrder}
          finishCell={game.board.size * game.board.size}
          myId={myId}
          absentIds={online?.absentSeats}
        />
      </div>

      <div className="min-h-0 flex-1 lg:col-start-1 lg:row-span-4 lg:row-start-1 lg:self-center">
        <div className="mx-auto flex h-full items-center justify-center lg:block lg:h-auto">
          {/* The board square plus the start lane below it (one extra
              half-cell-ish strip). The ratio lets the board shrink to whatever
              height the phone leaves over. */}
          <div
            className="relative max-h-full w-full max-w-[560px]"
            style={{ aspectRatio: `100 / ${100 + 70 / game.board.size}` }}
          >
            <Board
              board={game.board}
              players={game.players}
              activeMove={game.activeMove}
              currentPlayerId={game.currentPlayerIndex}
              phase={game.phase}
            />
            <AnimatePresence>
              {luckyPlayer && (
                <LuckySixBanner
                  key={game.extraTurnFlash!.nonce}
                  name={luckyPlayer.name}
                  color={luckyPlayer.color}
                  doubles={game.rules.diceCount === 2}
                  isMe={myId === luckyPlayer.id || game.controlsPlayer === 'all'}
                />
              )}
            </AnimatePresence>
            <AnimatePresence>
              {specialPlayer && game.specialFlash && (
                <SpecialBanner
                  key={`special-${game.specialFlash.nonce}`}
                  kind={game.specialFlash.payload}
                  name={specialPlayer.name}
                  color={specialPlayer.color}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="shrink-0 lg:col-start-2">
        <Controls
          phase={game.phase}
          lastDice={game.lastDice}
          diceCount={game.rules.diceCount}
          accentColor={accentColor}
          muted={game.muted}
          canRoll={canRoll}
          rollLabel={rollLabel(game, t, online)}
          secondaryLabel={online ? t('common:actions.leave') : t('common:actions.newGame')}
          onRoll={game.roll}
          onToggleMute={game.toggleMute}
          onSecondary={online ? online.onLeave : game.reset}
        />
      </div>

      <p
        className="min-h-4 shrink-0 text-center text-xs text-white/65 sm:text-sm lg:col-start-2 lg:min-h-[1.25rem]"
        role="status"
        aria-live="polite"
      >
        {statusText(game, t, online)}
      </p>
    </m.div>
  )
}

/** Festive "rolled a 6 (or doubles) — go again!" burst over the board. */
function LuckySixBanner({
  name,
  color,
  doubles,
  isMe,
}: {
  name: string
  color: string
  doubles: boolean
  isMe: boolean
}) {
  const { t } = useTranslation('snakes')
  const sparkles = [
    { x: '-50%', y: '-130%', delay: 0.1 },
    { x: '160%', y: '-90%', delay: 0.25 },
    { x: '-120%', y: '40%', delay: 0.35 },
    { x: '170%', y: '70%', delay: 0.45 },
  ]
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/3 z-40 flex justify-center px-4">
      <m.div
        initial={{ scale: 0.2, y: 28, opacity: 0, rotate: -10 }}
        animate={{ scale: [0.2, 1.12, 1], y: 0, opacity: 1, rotate: [-10, 4, 0] }}
        exit={{ scale: 0.6, y: -18, opacity: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 0.84, 0.3, 1] }}
        className="relative rounded-2xl bg-night-800/95 px-6 py-3.5 text-center shadow-2xl ring-2 ring-amber-300/80 backdrop-blur"
        role="status"
      >
        {sparkles.map((s, i) => (
          <m.span
            key={i}
            className="absolute left-1/2 top-1/2 text-xl"
            style={{ x: s.x, y: s.y }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.5, 1], opacity: [0, 1, 0.85], rotate: [0, 25] }}
            transition={{ delay: s.delay, duration: 0.5 }}
            aria-hidden="true"
          >
            ✨
          </m.span>
        ))}
        <m.span
          className="absolute -top-5 left-1/2 -translate-x-1/2 text-3xl"
          animate={{ y: [0, -8, 0], rotate: [0, -16, 16, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
          aria-hidden="true"
        >
          🎲
        </m.span>
        <p className="text-xl font-bold tracking-wide text-amber-300">
          {doubles ? t('banner.doubles') : t('banner.luckySix')}
        </p>
        <p className="mt-0.5 text-sm font-semibold text-white">
          <span style={{ color }}>{name}</span>{' '}
          {isMe ? t('banner.rollAgainMe') : t('banner.rollAgainOther')}
        </p>
      </m.div>
    </div>
  )
}

type ScreenT = TFunction<['snakes', 'common', 'online']>

function rollLabel(game: GameController, t: ScreenT, online?: OnlineMeta): string {
  if (game.phase === 'rolling') return t('common:game.rolling')
  if (game.phase === 'moving') return t('common:game.moving')
  if (game.phase === 'celebrating') return t('common:game.celebratingLabel')
  if (game.phase === 'won') return t('common:game.gameOver')
  if (online && !online.canPlay) return t('common:game.waiting')
  if (online && !game.isMyTurn)
    return t('common:game.opponentsTurn', { name: game.currentPlayer?.name ?? '?' })
  return t('common:actions.rollDice')
}

function statusText(game: GameController, t: ScreenT, online?: OnlineMeta): string {
  if (game.phase === 'celebrating') {
    const lastId = game.finishedOrder[game.finishedOrder.length - 1]
    const finisher = game.players[lastId]
    return finisher
      ? t('snakes:status.takesPlace', {
          name: finisher.name,
          place: t(placeKey(game.finishedOrder.length - 1)),
        })
      : ''
  }
  if (game.phase === 'won') {
    if (game.standings.length > 1) return t('snakes:status.podiumSet')
    return game.winner ? t('snakes:status.winsGame', { name: game.winner.name }) : ''
  }
  if (online && !online.canPlay) return t('online:status.waitingReconnect')

  const cur = game.currentPlayer
  if (!cur) return ''
  if (game.phase === 'rolling') return t('snakes:status.rolling', { name: cur.name })
  if (game.phase === 'moving') {
    const dice =
      game.lastDice.length > 1 ? `${game.lastRoll} (${game.lastDice.join(' + ')})` : `${game.lastRoll}`
    const base = t('snakes:status.rolled', { name: cur.name, dice })
    if (game.activeMove?.kind === 'ladder') return `${base} ${t('snakes:status.climbing')}`
    if (game.activeMove?.kind === 'snake') return `${base} ${t('snakes:status.downSnake')}`
    if (game.activeMove?.kind === 'teleport') return `${base} ${t('snakes:status.teleported')}`
    return base
  }
  // idle
  if (online) {
    return game.isMyTurn
      ? t('online:status.yourTurnRoll')
      : t('online:status.waitingForRoll', { name: cur.name })
  }
  return t('snakes:status.turnRoll', { name: cur.name })
}

/** Translation keys for each special-cell banner. */
const SPECIAL_KEYS = {
  shield: { title: 'banner.shield', line: 'banner.shieldLine' },
  'shield-used': { title: 'banner.shieldUsed', line: 'banner.shieldUsedLine' },
  swap: { title: 'banner.swap', line: 'banner.swapLine' },
  mystery: { title: 'banner.teleport', line: 'banner.teleportLine' },
} as const

/** Burst over the board when a special cell fires. */
function SpecialBanner({
  kind,
  name,
  color,
}: {
  kind: SpecialFlashKind
  name: string
  color: string
}) {
  const { t } = useTranslation('snakes')
  const copy = SPECIAL_KEYS[kind]
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/2 z-40 flex justify-center px-4">
      <m.div
        initial={{ scale: 0.3, y: 20, opacity: 0 }}
        animate={{ scale: [0.3, 1.1, 1], y: 0, opacity: 1 }}
        exit={{ scale: 0.6, y: -14, opacity: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 0.84, 0.3, 1] }}
        className="rounded-2xl bg-night-800/95 px-6 py-3 text-center shadow-2xl ring-2 ring-sky-300/70 backdrop-blur"
        role="status"
      >
        <p className="text-lg font-bold tracking-wide text-sky-300">{t(copy.title)}</p>
        <p className="mt-0.5 text-sm font-semibold text-white">
          <span style={{ color }}>{name}</span> {t(copy.line)}
        </p>
      </m.div>
    </div>
  )
}
