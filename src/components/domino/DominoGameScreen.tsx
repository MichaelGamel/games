import { useMemo } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { DominoController } from '../../hooks/useDomino'
import { RoomBadge, type OnlineMeta } from '../online/RoomBadge'
import { LanguageSwitcher } from '../LanguageSwitcher'
import { DominoPlayerPanel } from './DominoPlayerPanel'
import { DominoIcon } from './DominoIcon'
import { DominoBoard } from './board/DominoBoard'
import { DominoHand } from './board/DominoHand'
import { Boneyard } from './board/Boneyard'
import { cn } from '../../lib/cn'

interface DominoGameScreenProps {
  game: DominoController
  /** Whose hand is shown face-up at the bottom (the device holder / your seat). */
  viewerSeat: number
  secondaryLabel: string
  onSecondary: () => void
  /** Online room metadata — drives the connection badge and the canPlay gate. */
  online?: OnlineMeta
}

/** The in-match Dominoes screen: roster, the line, the boneyard, your hand. */
export function DominoGameScreen({ game, viewerSeat, secondaryLabel, onSecondary, online }: DominoGameScreenProps) {
  const { t } = useTranslation(['domino', 'common'])
  const handCounts = game.hands.map((h) => h.length)
  const canPlayRoom = online?.canPlay ?? true

  const viewerIsBot = game.players[viewerSeat]?.isBot ?? false
  const isViewerTurn = game.currentPlayerIndex === viewerSeat && game.isMyTurn && canPlayRoom
  const canAct = isViewerTurn && !viewerIsBot && game.phase === 'idle'
  const legalIds = useMemo(
    () => new Set(canAct ? [...game.legalEndsById.keys()] : []),
    [canAct, game.legalEndsById],
  )
  const myId = game.controlsPlayer === 'all' ? null : game.controlsPlayer

  return (
    <m.div
      key="domino-game"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-3 px-3 pb-3 pt-3 lg:px-4 lg:py-6"
    >
      <LanguageSwitcher compact className="fixed end-3 top-3 z-30" />

      <header className="shrink-0 text-center">
        <h1 className="flex items-center justify-center gap-2 text-lg font-bold tracking-tight text-white drop-shadow sm:text-2xl">
          <DominoIcon className="h-5 w-5 drop-shadow sm:h-7 sm:w-7" /> {t('domino:title')}
        </h1>
        {online && <RoomBadge meta={online} />}
      </header>

      <div className="shrink-0">
        <DominoPlayerPanel
          players={game.players}
          handCounts={handCounts}
          currentPlayerIndex={game.currentPlayerIndex}
          phase={game.phase}
          myId={myId}
          absentIds={online?.absentSeats}
        />
      </div>

      {/* Central table: the boneyard + the laid line */}
      <div className="flex flex-1 flex-col items-stretch gap-2">
        <div className="flex flex-1 items-stretch gap-3">
          <div className="flex shrink-0 flex-col items-center justify-center gap-2">
            <Boneyard count={game.boneyard.length} canDraw={canAct && game.canDraw} onDraw={game.drawOrPass} />
            <EndChip leftEnd={game.line.leftEnd} rightEnd={game.line.rightEnd} t={t} />
          </div>
          <DominoBoard line={game.line} />
        </div>

        <div className="flex min-h-9 items-center justify-center gap-3" role="status" aria-live="polite">
          <AnimatePresence mode="wait">
            <m.p
              key={`${game.phase}-${game.currentPlayerIndex}-${game.turnCount}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center text-xs text-white/65 sm:text-sm"
            >
              {statusText(game, viewerSeat, t, canPlayRoom)}
            </m.p>
          </AnimatePresence>
          {canAct && game.mustPass && (
            <m.button
              type="button"
              onClick={game.drawOrPass}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.96 }}
              className="rounded-lg bg-linear-to-r from-stone-500 to-amber-500 px-4 py-1.5 text-sm font-bold text-white shadow ring-1 ring-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              {t('pass')}
            </m.button>
          )}
        </div>
      </div>

      {/* The viewer's hand */}
      <div className={cn('shrink-0', !canAct && 'pointer-events-none')}>
        <DominoHand
          tiles={game.hands[viewerSeat] ?? []}
          legalIds={legalIds}
          active={canAct}
          faceDown={viewerIsBot}
          onPlay={(tileId) => void game.play(tileId)}
        />
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3">
        <button
          type="button"
          onClick={game.toggleMute}
          aria-label={game.muted ? t('common:actions.unmuteAria') : t('common:actions.muteAria')}
          className="grid h-10 w-10 place-items-center rounded-xl text-lg ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          {game.muted ? '🔇' : '🔊'}
        </button>
        <button
          type="button"
          onClick={onSecondary}
          className="rounded-xl px-5 py-2.5 font-semibold text-white/80 ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          {secondaryLabel}
        </button>
      </div>
    </m.div>
  )
}

type ScreenT = TFunction<['domino', 'common']>

function EndChip({
  leftEnd,
  rightEnd,
  t,
}: {
  leftEnd: number | null
  rightEnd: number | null
  t: ScreenT
}) {
  if (leftEnd == null || rightEnd == null) return null
  return (
    <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/70 ring-1 ring-white/10 tabular-nums">
      {t('openEnds', { left: leftEnd, right: rightEnd })}
    </span>
  )
}

function statusText(game: DominoController, viewerSeat: number, t: ScreenT, canPlay: boolean): string {
  if (game.phase === 'won') return t('common:game.gameOver')
  if (!canPlay) return t('common:game.waiting')
  const cur = game.currentPlayer
  if (!cur) return ''
  if (game.phase === 'drawing') return t('status.drawing', { name: cur.name })
  if (game.phase === 'placing') return t('status.playing', { name: cur.name })
  if (game.currentPlayerIndex === viewerSeat && game.isMyTurn && !cur.isBot) {
    if (game.canPlay) return t('status.yourTurn')
    if (game.canDraw) return t('status.youDraw')
    if (game.mustPass) return t('status.youPass')
    return t('status.yourTurn')
  }
  return t('status.turn', { name: cur.name })
}
