import { useEffect } from 'react'
import { motion } from 'motion/react'
import type { GameController } from '../hooks/useSnakesAndLadders'
import { Board } from './board/Board'
import { PlayerPanel } from './PlayerPanel'
import { Controls } from './Controls'
import { cn } from '../lib/cn'

export interface OnlineMeta {
  roomCode: string
  /** True when every player from the started lineup is still connected. */
  everyonePresent: boolean
  testMode: boolean
  onLeave: () => void
}

interface GameScreenProps {
  game: GameController
  online?: OnlineMeta
}

export function GameScreen({ game, online }: GameScreenProps) {
  const myId = game.controlsPlayer === 'all' ? null : game.controlsPlayer

  // You can't act if it's not your turn, or (online) a player has dropped.
  const canRoll = game.canRoll && (!online || online.everyonePresent)

  // Keyboard roll (Space / Enter) when allowed, unless focus is on a control.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return
      if (e.repeat) return
      const target = e.target as HTMLElement | null
      if (target?.closest('button, input, textarea, a, [role="button"]')) return
      if (!game.canRoll) return
      e.preventDefault()
      game.roll()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [game])

  const accentColor = game.currentPlayer?.color ?? '#8b5cf6'

  return (
    <motion.div
      key="game"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center justify-center gap-6 px-4 py-8 lg:flex-row lg:gap-10"
    >
      <div className="w-full max-w-[560px] pb-[7%] lg:flex-1">
        <Board
          players={game.players}
          activeMove={game.activeMove}
          currentPlayerId={game.currentPlayerIndex}
          phase={game.phase}
        />
      </div>

      <aside className="flex w-full max-w-sm flex-col gap-4">
        <header className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white drop-shadow sm:text-3xl">
            <span aria-hidden="true">🐍</span> Snakes &amp; Ladders{' '}
            <span aria-hidden="true">🪜</span>
          </h1>
          {online && <RoomBadge meta={online} />}
        </header>

        <PlayerPanel
          players={game.players}
          currentPlayerId={game.currentPlayerIndex}
          phase={game.phase}
          winnerId={game.winnerId}
          myId={myId}
        />

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

        <p
          className="min-h-[1.25rem] text-center text-sm text-white/65"
          role="status"
          aria-live="polite"
        >
          {statusText(game, online)}
        </p>
      </aside>
    </motion.div>
  )
}

function RoomBadge({ meta }: { meta: OnlineMeta }) {
  return (
    <div className="mt-2 flex items-center justify-center gap-2 text-xs">
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
  if (game.phase === 'won') return 'Game Over'
  if (online && !online.everyonePresent) return 'Waiting…'
  if (online && !game.isMyTurn) return `${game.currentPlayer?.name ?? 'Opponent'}'s turn`
  return 'Roll Dice'
}

function statusText(game: GameController, online?: OnlineMeta): string {
  if (game.phase === 'won' && game.winner) return `${game.winner.name} wins the game!`
  if (online && !online.everyonePresent) return 'Waiting for a player to reconnect…'

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
