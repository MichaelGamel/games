import { useMemo } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { UnoController } from '../../hooks/useUno'
import { RoomBadge, type OnlineMeta } from '../online/RoomBadge'
import { UnoPlayerPanel } from './UnoPlayerPanel'
import { UnoControls } from './UnoControls'
import { UnoCallButton } from './UnoCallButton'
import { DiscardPile } from './board/DiscardPile'
import { DrawPile } from './board/DrawPile'
import { DirectionIndicator } from './board/DirectionIndicator'
import { ActiveColorChip } from './board/ActiveColorChip'
import { UnoHand } from './board/UnoHand'
import { cn } from '../../lib/cn'

interface UnoGameScreenProps {
  game: UnoController
  /** Whose hand is shown face-up at the bottom (the device holder / your seat). */
  viewerSeat: number
  secondaryLabel: string
  onSecondary: () => void
  /** Online room metadata — drives the connection badge and the canPlay gate. */
  online?: OnlineMeta
}

/** The in-match UNO screen: roster, the central table, your hand, and controls. */
export function UnoGameScreen({ game, viewerSeat, secondaryLabel, onSecondary, online }: UnoGameScreenProps) {
  const { t } = useTranslation(['uno', 'common'])
  const handCounts = game.hands.map((h) => h.length)
  const showScores = game.rules.winMode === 'score'
  const canPlayRoom = online?.canPlay ?? true

  // A bot's hand stays face-down and non-interactive — it plays itself.
  const viewerIsBot = game.players[viewerSeat]?.isBot ?? false
  const isViewerTurn = game.currentPlayerIndex === viewerSeat && game.isMyTurn && canPlayRoom
  const canAct = isViewerTurn && !viewerIsBot && game.phase === 'idle'
  const legalIds = useMemo(
    () => new Set(canAct ? game.legalCards.map((c) => c.id) : []),
    [canAct, game.legalCards],
  )

  // Opponents sitting on one card without declaring — catchable by the viewer.
  const catchable = viewerIsBot
    ? []
    : game.players.filter((p) => p.id !== viewerSeat && handCounts[p.id] === 1 && !game.saidUno[p.id])

  const myId = game.controlsPlayer === 'all' ? null : game.controlsPlayer

  return (
    <m.div
      key="uno-game"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-3 px-3 pb-3 pt-3 lg:px-4 lg:py-6"
    >
      <header className="shrink-0 text-center">
        <h1 className="text-lg font-bold tracking-tight text-white drop-shadow sm:text-2xl">
          <span aria-hidden="true">🃏</span> {t('uno:title')}
          {showScores && <span className="ms-2 text-sm font-normal text-white/50">{t('round', { n: game.roundNumber })}</span>}
        </h1>
        {online && <RoomBadge meta={online} />}
      </header>

      <div className="shrink-0">
        <UnoPlayerPanel
          players={game.players}
          handCounts={handCounts}
          saidUno={game.saidUno}
          scores={game.scores}
          showScores={showScores}
          currentPlayerIndex={game.currentPlayerIndex}
          phase={game.phase}
          myId={myId}
          absentIds={online?.absentSeats}
        />
      </div>

      {/* Central table */}
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <div className="flex items-center justify-center gap-5 sm:gap-8">
          <DrawPile
            count={game.stock.length}
            canDraw={canAct}
            pendingDraw={canAct ? game.pendingDraw : 0}
            onDraw={game.drawCard}
          />
          <div className="flex flex-col items-center gap-3">
            <DirectionIndicator direction={game.direction} />
            <ActiveColorChip color={game.activeColor} />
          </div>
          <DiscardPile top={game.top} />
        </div>

        <div className="flex min-h-7 items-center justify-center" role="status" aria-live="polite">
          <AnimatePresence mode="wait">
            <m.p
              key={statusKey(game)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center text-xs text-white/65 sm:text-sm"
            >
              {statusText(game, viewerSeat, t, canPlayRoom)}
            </m.p>
          </AnimatePresence>
        </div>

        <UnoCallButton catchable={catchable} onCatch={(target) => void game.callOut(target, viewerSeat)} />
      </div>

      {/* The viewer's hand */}
      <div className={cn('shrink-0', !canAct && 'pointer-events-none')}>
        <UnoHand
          cards={game.hands[viewerSeat] ?? []}
          legalIds={legalIds}
          active={canAct}
          faceDown={viewerIsBot}
          onPlay={(card) => void game.play([card])}
        />
      </div>

      <div className="shrink-0">
        <UnoControls
          canChallenge={canAct && game.canChallenge}
          pendingDraw={game.pendingDraw}
          onChallenge={game.challenge}
          onAcceptDraw={game.drawCard}
          muted={game.muted}
          onToggleMute={game.toggleMute}
          secondaryLabel={secondaryLabel}
          onSecondary={onSecondary}
        />
      </div>
    </m.div>
  )
}

type ScreenT = TFunction<['uno', 'common']>

const statusKey = (game: UnoController) =>
  `${game.phase}-${game.currentPlayerIndex}-${game.turnCount}`

function statusText(game: UnoController, viewerSeat: number, t: ScreenT, canPlay: boolean): string {
  if (game.phase === 'matchEnd') return t('common:game.gameOver')
  if (game.phase === 'roundEnd') return t('roundOver')
  if (!canPlay) return t('common:game.waiting')
  const cur = game.currentPlayer
  if (!cur) return ''
  if (game.phase === 'resolving') return t('status.playing', { name: cur.name })
  if (game.currentPlayerIndex === viewerSeat && game.isMyTurn && !cur.isBot) {
    return game.pendingDraw > 0 ? t('status.youPending', { n: game.pendingDraw }) : t('status.yourTurn')
  }
  return t('status.turn', { name: cur.name })
}
