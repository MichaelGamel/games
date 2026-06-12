import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { LudoController } from '../../hooks/useLudo'
import { placeLabel } from '../../lib/place'
import { cn } from '../../lib/cn'
import { LudoBoard } from './board/LudoBoard'
import { LudoPlayerPanel } from './LudoPlayerPanel'
import { LudoControls } from './LudoControls'
import { LudoSelectionHint } from './LudoSelectionHint'

export interface LudoOnlineMeta {
  roomCode: string
  /** True when every player from the started lineup is still connected. */
  everyonePresent: boolean
  /** True while enough active players are connected to keep playing. */
  canPlay: boolean
  testMode: boolean
  onLeave: () => void
}

interface LudoGameScreenProps {
  game: LudoController
  online?: LudoOnlineMeta
}

/**
 * The in-match Ludo screen, mirroring the Snakes `GameScreen`: a non-scrolling
 * mobile column (header, player chips, board, docked dice bar) and a
 * side-by-side board + panel grid on desktop. The board takes the leftover
 * height so rolling and watching never require scrolling.
 */
export function LudoGameScreen({ game, online }: LudoGameScreenProps) {
  const myId = game.controlsPlayer === 'all' ? null : game.controlsPlayer

  // You can't act if it's not your turn, or (online) too few players remain.
  const canRoll = game.canRoll && (!online || online.canPlay)
  // A *human* must pick a token only when it's their turn and a bot isn't the
  // one choosing (local hot-seat has `isMyTurn` true for everyone, including bots).
  const currentIsBot = game.currentPlayer?.isBot ?? false
  const humanChoosing = game.phase === 'selecting' && game.isMyTurn && !currentIsBot

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
  const lucky =
    game.extraTurnFlash != null ? (game.players[game.extraTurnFlash.playerId] ?? null) : null

  return (
    <motion.div
      key="ludo-game"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn(
        'relative z-10 mx-auto flex h-dvh w-full max-w-6xl flex-col gap-2 px-3 pb-2 pt-3',
        'lg:grid lg:h-auto lg:min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:content-center lg:items-center lg:gap-x-10 lg:gap-y-4 lg:px-4 lg:py-8',
      )}
    >
      <header className="shrink-0 text-center lg:col-start-2">
        <h1 className="text-lg font-bold tracking-tight text-white drop-shadow sm:text-2xl lg:text-3xl">
          <span aria-hidden="true">🎲</span> Ludo
        </h1>
        {online && <RoomBadge meta={online} />}
      </header>

      <div className="shrink-0 lg:col-start-2">
        <LudoPlayerPanel
          players={game.players}
          currentPlayerIndex={game.currentPlayerIndex}
          phase={game.phase}
          finishedOrder={game.finishedOrder}
          myId={myId}
        />
      </div>

      <div className="min-h-0 flex-1 lg:col-start-1 lg:row-span-4 lg:row-start-1 lg:self-center">
        <div className="mx-auto flex h-full items-center justify-center lg:block lg:h-auto">
          <div className="relative aspect-square max-h-full w-full max-w-[560px]">
            <LudoBoard
              players={game.players}
              activeMove={game.activeMove}
              currentPlayerIndex={game.currentPlayerIndex}
              phase={game.phase}
              selectableTokens={humanChoosing ? game.selectableTokens : []}
              onSelectToken={game.selectToken}
            />
            <AnimatePresence>
              {lucky && (
                <ExtraTurnBanner
                  key={game.extraTurnFlash!.nonce}
                  name={lucky.name}
                  color={lucky.color}
                  six={game.lastRoll === 6}
                  isMe={myId === lucky.id || game.controlsPlayer === 'all'}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="shrink-0 lg:col-start-2">
        <LudoControls
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

      <div
        className="flex min-h-7 shrink-0 items-center justify-center lg:col-start-2 lg:min-h-[1.75rem]"
        role="status"
        aria-live="polite"
      >
        <AnimatePresence mode="wait">
          {humanChoosing ? (
            <LudoSelectionHint key="hint" />
          ) : (
            <motion.p
              key="status"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center text-xs text-white/65 sm:text-sm"
            >
              {statusText(game, online)}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

/** Festive "go again!" burst over the board (lucky six or a capture). */
function ExtraTurnBanner({
  name,
  color,
  six,
  isMe,
}: {
  name: string
  color: string
  six: boolean
  isMe: boolean
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/3 z-40 flex justify-center px-4">
      <motion.div
        initial={{ scale: 0.2, y: 28, opacity: 0, rotate: -10 }}
        animate={{ scale: [0.2, 1.12, 1], y: 0, opacity: 1, rotate: [-10, 4, 0] }}
        exit={{ scale: 0.6, y: -18, opacity: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 0.84, 0.3, 1] }}
        className="rounded-2xl bg-night-800/95 px-6 py-3.5 text-center shadow-2xl ring-2 ring-amber-300/80 backdrop-blur"
        role="status"
      >
        <p className="text-xl font-bold tracking-wide text-amber-300">
          {six ? 'LUCKY 6! 🎲' : 'CAPTURE! ⚔️'}
        </p>
        <p className="mt-0.5 text-sm font-semibold text-white">
          <span style={{ color }}>{name}</span> {isMe ? '— roll again!' : 'rolls again!'} 🎉
        </p>
      </motion.div>
    </div>
  )
}

function RoomBadge({ meta }: { meta: LudoOnlineMeta }) {
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

function rollLabel(game: LudoController, online?: LudoOnlineMeta): string {
  if (game.phase === 'rolling') return 'Rolling…'
  if (game.phase === 'selecting') return 'Pick a token'
  if (game.phase === 'moving') return 'Moving…'
  if (game.phase === 'celebrating') return 'Celebrating… 🎉'
  if (game.phase === 'won') return 'Game Over'
  if (online && !online.canPlay) return 'Waiting…'
  if (online && !game.isMyTurn) return `${game.currentPlayer?.name ?? 'Opponent'}'s turn`
  return 'Roll Dice'
}

function statusText(game: LudoController, online?: LudoOnlineMeta): string {
  if (game.phase === 'celebrating') {
    const lastId = game.finishedOrder[game.finishedOrder.length - 1]
    const finisher = game.players[lastId]
    return finisher
      ? `${finisher.name} is all home — ${placeLabel(game.finishedOrder.length - 1)} place!`
      : ''
  }
  if (game.phase === 'won') {
    if (game.standings.length > 1) return 'Game over — the podium is set!'
    return game.winner ? `${game.winner.name} wins the game!` : ''
  }
  if (online && !online.canPlay) return 'Waiting for a player to reconnect…'

  const cur = game.currentPlayer
  if (!cur) return ''
  if (game.phase === 'rolling') return `${cur.name} is rolling the dice…`
  if (game.phase === 'moving') return `${cur.name} is on the move…`
  // idle
  if (online) {
    return game.isMyTurn ? 'Your turn — roll the dice.' : `Waiting for ${cur.name} to roll…`
  }
  return `${cur.name}'s turn — roll the dice.`
}
