import { AnimatePresence, m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { LudoController } from '../../hooks/useLudo'
import { useRollHotkey } from '../../hooks/useRollHotkey'
import { placeKey } from '../../lib/place'
import { cn } from '../../lib/cn'
import { LudoBoard } from './board/LudoBoard'
import { LudoPlayerPanel } from './LudoPlayerPanel'
import { LudoControls } from './LudoControls'
import { LudoSelectionHint } from './LudoSelectionHint'
import { RoomBadge, type OnlineMeta } from '../online/RoomBadge'

/** Ludo's historical alias for the shared online-room metadata. */
export type LudoOnlineMeta = OnlineMeta

interface LudoGameScreenProps {
  game: LudoController
  online?: LudoOnlineMeta
}

/** Stable empty list so the memoized board sees an unchanged prop while no
 *  selection is pending. */
const NO_SELECTABLE_TOKENS: number[] = []
const NO_SELECTABLE_MOVES: never[] = []

/**
 * The in-match Ludo screen, mirroring the Snakes `GameScreen`: a non-scrolling
 * mobile column (header, player chips, board, docked dice bar) and a
 * side-by-side board + panel grid on desktop. The board takes the leftover
 * height so rolling and watching never require scrolling.
 */
export function LudoGameScreen({ game, online }: LudoGameScreenProps) {
  const { t } = useTranslation(['ludo', 'common', 'online'])
  const myId = game.controlsPlayer === 'all' ? null : game.controlsPlayer

  // You can't act if it's not your turn, or (online) too few players remain.
  const canRoll = game.canRoll && (!online || online.canPlay)
  // A *human* must pick a token only when it's their turn and a bot isn't the
  // one choosing (local hot-seat has `isMyTurn` true for everyone, including bots).
  const currentIsBot = game.currentPlayer?.isBot ?? false
  const humanChoosing = game.phase === 'selecting' && game.isMyTurn && !currentIsBot

  // Keyboard roll (Space / Enter) when allowed, unless focus is on a control.
  useRollHotkey(canRoll, game.roll)

  const accentColor = game.currentPlayer?.color ?? '#8b5cf6'
  const lucky =
    game.extraTurnFlash != null ? (game.players[game.extraTurnFlash.playerId] ?? null) : null

  return (
    <m.div
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
          <span aria-hidden="true">🎲</span> {t('ludo:title')}
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
              selectableTokens={humanChoosing ? game.selectableTokens : NO_SELECTABLE_TOKENS}
              selectableMoves={humanChoosing ? game.selectableMoves : NO_SELECTABLE_MOVES}
              onSelectToken={game.selectToken}
            />
            <AnimatePresence>
              {lucky && (
                <ExtraTurnBanner
                  key={game.extraTurnFlash!.nonce}
                  name={lucky.name}
                  color={lucky.color}
                  reason={extraTurnReason(game)}
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
          lastDice={game.lastDice}
          diceCount={game.rules.diceCount}
          accentColor={accentColor}
          muted={game.muted}
          canRoll={canRoll}
          canUndo={online ? false : game.canUndo}
          onUndo={game.undo}
          rollLabel={rollLabel(game, t, online)}
          secondaryLabel={online ? t('common:actions.leave') : t('common:actions.newGame')}
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
            <m.p
              key="status"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center text-xs text-white/65 sm:text-sm"
            >
              {statusText(game, t, online)}
            </m.p>
          )}
        </AnimatePresence>
      </div>
    </m.div>
  )
}

/** Why the extra turn happened — six, doubles, or a capture. */
function extraTurnReason(game: LudoController): 'six' | 'doubles' | 'capture' {
  const d = game.lastDice
  if (game.rules.diceCount === 2) return d.length === 2 && d[0] === d[1] ? 'doubles' : 'capture'
  return d[0] === 6 ? 'six' : 'capture'
}

/** Festive "go again!" burst over the board (six, doubles, or a capture). */
function ExtraTurnBanner({
  name,
  color,
  reason,
  isMe,
}: {
  name: string
  color: string
  reason: 'six' | 'doubles' | 'capture'
  isMe: boolean
}) {
  const { t } = useTranslation('ludo')
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/3 z-40 flex justify-center px-4">
      <m.div
        initial={{ scale: 0.2, y: 28, opacity: 0, rotate: -10 }}
        animate={{ scale: [0.2, 1.12, 1], y: 0, opacity: 1, rotate: [-10, 4, 0] }}
        exit={{ scale: 0.6, y: -18, opacity: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 0.84, 0.3, 1] }}
        className="rounded-2xl bg-night-800/95 px-6 py-3.5 text-center shadow-2xl ring-2 ring-amber-300/80 backdrop-blur"
        role="status"
      >
        <p className="text-xl font-bold tracking-wide text-amber-300">
          {reason === 'six'
            ? t('banner.luckySix')
            : reason === 'doubles'
              ? t('banner.doubles')
              : t('banner.capture')}
        </p>
        <p className="mt-0.5 text-sm font-semibold text-white">
          <span style={{ color }}>{name}</span>{' '}
          {isMe ? t('banner.rollAgainMe') : t('banner.rollAgainOther')} 🎉
        </p>
      </m.div>
    </div>
  )
}

type ScreenT = TFunction<['ludo', 'common', 'online']>

function rollLabel(game: LudoController, t: ScreenT, online?: LudoOnlineMeta): string {
  if (game.phase === 'rolling') return t('common:game.rolling')
  if (game.phase === 'selecting') return t('ludo:pickToken')
  if (game.phase === 'moving') return t('common:game.moving')
  if (game.phase === 'celebrating') return t('common:game.celebratingLabel')
  if (game.phase === 'won') return t('common:game.gameOver')
  if (online && !online.canPlay) return t('common:game.waiting')
  if (online && !game.isMyTurn)
    return t('common:game.opponentsTurn', { name: game.currentPlayer?.name ?? '?' })
  return t('common:actions.rollDice')
}

function statusText(game: LudoController, t: ScreenT, online?: LudoOnlineMeta): string {
  if (game.phase === 'celebrating') {
    const lastId = game.finishedOrder[game.finishedOrder.length - 1]
    const finisher = game.players[lastId]
    return finisher
      ? t('ludo:status.allHome', {
          name: finisher.name,
          place: t(placeKey(game.finishedOrder.length - 1)),
        })
      : ''
  }
  if (game.phase === 'won') {
    if (game.standings.length > 1) return t('ludo:status.podiumSet')
    return game.winner ? t('ludo:status.winsGame', { name: game.winner.name }) : ''
  }
  if (online && !online.canPlay) return t('online:status.waitingReconnect')

  const cur = game.currentPlayer
  if (!cur) return ''
  if (game.phase === 'rolling') return t('ludo:status.rolling', { name: cur.name })
  if (game.phase === 'moving') {
    return game.lastDice.length > 1
      ? t('ludo:status.movingRolled', { name: cur.name, dice: game.lastDice.join(' + ') })
      : t('ludo:status.moving', { name: cur.name })
  }
  // idle
  if (online) {
    return game.isMyTurn
      ? t('online:status.yourTurnRoll')
      : t('online:status.waitingForRoll', { name: cur.name })
  }
  return t('ludo:status.turnRoll', { name: cur.name })
}
