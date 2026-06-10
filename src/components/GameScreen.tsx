import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { GameController } from '../hooks/useSnakesAndLadders'
import { placeLabel } from '../lib/place'
import { Board } from './board/Board'
import { PlayerPanel } from './PlayerPanel'
import { Controls } from './Controls'
import { cn } from '../lib/cn'

export interface OnlineMeta {
  roomCode: string
  /** True when every player from the started lineup is still connected. */
  everyonePresent: boolean
  /** True while enough active players are connected to keep playing. */
  canPlay: boolean
  testMode: boolean
  onLeave: () => void
}

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
  const myId = game.controlsPlayer === 'all' ? null : game.controlsPlayer

  // You can't act if it's not your turn, or (online) too few players remain.
  const canRoll = game.canRoll && (!online || online.canPlay)

  // Keyboard roll (Space / Enter) when allowed, unless focus is on a control.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return
      if (e.repeat) return
      const target = e.target as HTMLElement | null
      if (target?.closest('button, input, textarea, a, [role="button"]')) return
      if (!canRoll) return
      e.preventDefault()
      game.roll()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [game, canRoll])

  const accentColor = game.currentPlayer?.color ?? '#8b5cf6'
  const luckyPlayer =
    game.extraTurnFlash != null ? (game.players[game.extraTurnFlash.playerId] ?? null) : null

  return (
    <motion.div
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
      <header className="shrink-0 text-center lg:col-start-2">
        <h1 className="text-lg font-bold tracking-tight text-white drop-shadow sm:text-2xl lg:text-3xl">
          <span aria-hidden="true">🐍</span> Snakes &amp; Ladders{' '}
          <span aria-hidden="true">🪜</span>
        </h1>
        {online && <RoomBadge meta={online} />}
      </header>

      <div className="shrink-0 lg:col-start-2">
        <PlayerPanel
          players={game.players}
          currentPlayerId={game.currentPlayerIndex}
          phase={game.phase}
          finishedOrder={game.finishedOrder}
          myId={myId}
        />
      </div>

      <div className="min-h-0 flex-1 lg:col-start-1 lg:row-span-4 lg:row-start-1 lg:self-center">
        <div className="mx-auto flex h-full items-center justify-center lg:block lg:h-auto">
          {/* 100/107: the board square plus the start lane below it. The ratio
              lets the board shrink to whatever height the phone leaves over. */}
          <div className="relative aspect-[100/107] max-h-full w-full max-w-[560px]">
            <Board
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
                  isMe={myId === luckyPlayer.id || game.controlsPlayer === 'all'}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="shrink-0 lg:col-start-2">
        <Controls
          phase={game.phase}
          lastRoll={game.lastRoll}
          accentColor={accentColor}
          muted={game.muted}
          canRoll={canRoll}
          rollLabel={rollLabel(game, online)}
          secondaryLabel={online ? 'Leave' : 'New Game'}
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
        {statusText(game, online)}
      </p>
    </motion.div>
  )
}

/** Festive "rolled a 6 — go again!" burst over the board. */
function LuckySixBanner({ name, color, isMe }: { name: string; color: string; isMe: boolean }) {
  const sparkles = [
    { x: '-50%', y: '-130%', delay: 0.1 },
    { x: '160%', y: '-90%', delay: 0.25 },
    { x: '-120%', y: '40%', delay: 0.35 },
    { x: '170%', y: '70%', delay: 0.45 },
  ]
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/3 z-40 flex justify-center px-4">
      <motion.div
        initial={{ scale: 0.2, y: 28, opacity: 0, rotate: -10 }}
        animate={{ scale: [0.2, 1.12, 1], y: 0, opacity: 1, rotate: [-10, 4, 0] }}
        exit={{ scale: 0.6, y: -18, opacity: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 0.84, 0.3, 1] }}
        className="relative rounded-2xl bg-night-800/95 px-6 py-3.5 text-center shadow-2xl ring-2 ring-amber-300/80 backdrop-blur"
        role="status"
      >
        {sparkles.map((s, i) => (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 text-xl"
            style={{ x: s.x, y: s.y }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.5, 1], opacity: [0, 1, 0.85], rotate: [0, 25] }}
            transition={{ delay: s.delay, duration: 0.5 }}
            aria-hidden="true"
          >
            ✨
          </motion.span>
        ))}
        <motion.span
          className="absolute -top-5 left-1/2 -translate-x-1/2 text-3xl"
          animate={{ y: [0, -8, 0], rotate: [0, -16, 16, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
          aria-hidden="true"
        >
          🎲
        </motion.span>
        <p className="text-xl font-bold tracking-wide text-amber-300">LUCKY 6!</p>
        <p className="mt-0.5 text-sm font-semibold text-white">
          {isMe ? (
            <>
              <span style={{ color }}>{name}</span> — roll again! 🎉
            </>
          ) : (
            <>
              <span style={{ color }}>{name}</span> rolls again! 🎉
            </>
          )}
        </p>
      </motion.div>
    </div>
  )
}

function RoomBadge({ meta }: { meta: OnlineMeta }) {
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
        {meta.everyonePresent ? 'Connected' : 'Player away'}
      </span>
      <span className="rounded-full bg-white/10 px-2.5 py-1 font-mono tracking-widest text-white/80">
        {meta.roomCode}
      </span>
      {meta.testMode && (
        <span className="rounded-full bg-white/10 px-2 py-1 text-white/45">test mode</span>
      )}
    </div>
  )
}

function rollLabel(game: GameController, online?: OnlineMeta): string {
  if (game.phase === 'rolling') return 'Rolling…'
  if (game.phase === 'moving') return 'Moving…'
  if (game.phase === 'celebrating') return 'Celebrating… 🎉'
  if (game.phase === 'won') return 'Game Over'
  if (online && !online.canPlay) return 'Waiting…'
  if (online && !game.isMyTurn) return `${game.currentPlayer?.name ?? 'Opponent'}'s turn`
  return 'Roll Dice'
}

function statusText(game: GameController, online?: OnlineMeta): string {
  if (game.phase === 'celebrating') {
    const lastId = game.finishedOrder[game.finishedOrder.length - 1]
    const finisher = game.players[lastId]
    return finisher ? `${finisher.name} takes ${placeLabel(game.finishedOrder.length - 1)} place!` : ''
  }
  if (game.phase === 'won') {
    if (game.standings.length > 1) return 'Game over — the podium is set!'
    return game.winner ? `${game.winner.name} wins the game!` : ''
  }
  if (online && !online.canPlay) return 'Waiting for a player to reconnect…'

  const cur = game.currentPlayer
  if (!cur) return ''
  if (game.phase === 'rolling') return `${cur.name} is rolling the dice…`
  if (game.phase === 'moving') {
    const base = `${cur.name} rolled ${game.lastRoll}.`
    if (game.activeMove?.kind === 'ladder') return `${base} Climbing a ladder!`
    if (game.activeMove?.kind === 'snake') return `${base} Down a snake!`
    return base
  }
  // idle
  if (online) {
    return game.isMyTurn ? 'Your turn — roll the dice.' : `Waiting for ${cur.name} to roll…`
  }
  return `${cur.name}'s turn — roll the dice.`
}
