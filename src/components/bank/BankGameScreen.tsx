import { useMemo, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { BackToHubLink } from '../BackToHubLink'
import { RoomBadge, type OnlineMeta } from '../online/RoomBadge'
import { useRollHotkey } from '../../hooks/useRollHotkey'
import type { BankController } from '../../hooks/useBankElHazz'
import { BankBoard } from './board/BankBoard'
import { BankControls } from './BankControls'
import { BankPlayerPanel } from './BankPlayerPanel'
import { BankGameLog } from './BankGameLog'
import { BankPropertyModal } from './BankPropertyModal'
import { BankTradeModal } from './BankTradeModal'
import { BankBuyModal } from './BankBuyModal'
import { BankCardModal } from './BankCardModal'

interface BankGameScreenProps {
  game: BankController
  /** Resets the match ("New Game") — local play only. */
  onNewGame?: () => void
  /** Online room metadata; absent for local pass-and-play. */
  online?: OnlineMeta
}

/** Board + player panels + controls + log — the in-play layout (local + online). */
export function BankGameScreen({ game, onNewGame, online }: BankGameScreenProps) {
  const { t } = useTranslation(['bank', 'common', 'online'])

  // You can't act if it's not your turn, or (online) too few players remain.
  const canRoll = game.canRoll && (!online || online.canPlay)
  useRollHotkey(canRoll, game.roll)

  // A tapped property opens its details / management modal; the Trade button
  // opens the trade builder. Both are in-play overlays over the board.
  const [selectedTile, setSelectedTile] = useState<number | null>(null)
  const [tradeOpen, setTradeOpen] = useState(false)

  const propertyCounts = useMemo(() => {
    const counts = game.players.map(() => 0)
    for (const entry of Object.values(game.ownership)) counts[entry.owner] = (counts[entry.owner] ?? 0) + 1
    return counts
  }, [game.players, game.ownership])

  const current = game.currentPlayer
  const decidingName = game.pendingBuy != null ? game.players[game.pendingBuy.seat]?.name : undefined

  const statusText = computeStatus(game, t, online, decidingName)

  const rollLabel = computeRollLabel(game, t, online)

  const accent = current?.color ?? '#f59e0b'
  const pending = game.pendingBuy

  return (
    <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 px-3 py-14 lg:py-6">
      <BackToHubLink />

      {online && (
        <header className="shrink-0 text-center">
          <h1 className="text-lg font-bold tracking-tight text-white drop-shadow sm:text-2xl">
            <span aria-hidden="true">🏦</span> {t('bank:title')}
          </h1>
          <RoomBadge meta={online} />
        </header>
      )}

      <div className="grid flex-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="relative mx-auto w-full max-w-[min(92vw,560px)] lg:mx-0 lg:max-w-none lg:self-center">
          <BankBoard
            players={game.players}
            ownership={game.ownership}
            activeMove={game.activeMove}
            currentPlayerIndex={game.currentPlayerIndex}
            phase={game.phase}
            lastDice={game.lastDice}
            statusText={statusText}
            onSelectTile={setSelectedTile}
          />
          <AnimatePresence>
            {game.rollFlash && (
              <RollBanner
                key={game.rollFlash.nonce}
                reason={game.rollFlash.payload.reason}
                name={game.players[game.rollFlash.playerId]?.name ?? '?'}
              />
            )}
          </AnimatePresence>
        </div>

        <div className="flex min-h-0 flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            {game.players.map((p) => (
              <BankPlayerPanel
                key={p.id}
                player={p}
                isCurrent={p.id === game.currentPlayerIndex && game.phase !== 'won'}
                isYou={online != null && game.controlsPlayer === p.id}
                absent={online?.absentSeats?.includes(p.id) ?? false}
                propertyCount={propertyCounts[p.id] ?? 0}
                flash={
                  game.cashFlash && game.cashFlash.playerId === p.id
                    ? { delta: game.cashFlash.payload.delta, nonce: game.cashFlash.nonce }
                    : null
                }
              />
            ))}
          </div>

          <BankControls
            accentColor={accent}
            muted={game.muted}
            canRoll={canRoll}
            rollLabel={rollLabel}
            canUndo={online ? false : game.canUndo}
            onRoll={game.roll}
            onUndo={game.undo}
            onToggleMute={game.toggleMute}
            onSecondary={online ? online.onLeave : (onNewGame ?? (() => {}))}
            secondaryLabel={online ? t('common:actions.leave') : t('common:actions.newGame')}
            inJail={game.inJail && (!online || online.canPlay)}
            jailFine={game.jailFine}
            jailAttempts={current?.jailTurns ?? 0}
            canPayFine={game.canPayJailFine}
            canUseCard={game.canUseJailCard}
            onPayFine={game.payJailFine}
            onUseCard={game.useJailCard}
            canTrade={game.canOpenTrade && !online}
            onTrade={() => setTradeOpen(true)}
          />

          <BankGameLog log={game.matchLog} passReward={game.rules.passStartReward} />
        </div>
      </div>

      <AnimatePresence>
        {game.canDecide && pending && (
          <BankBuyModal
            key="buy"
            tile={pending.tile}
            price={pending.price}
            cashAfter={(game.players[pending.seat]?.cash ?? 0) - pending.price}
            accentColor={game.players[pending.seat]?.color ?? '#f59e0b'}
            onBuy={game.decideBuy}
            onSkip={game.decideDecline}
          />
        )}

        {game.cardReveal && (
          <BankCardModal
            key={`card-${game.turnCount}-${game.cardReveal.cardId}`}
            deck={game.cardReveal.deck}
            cardId={game.cardReveal.cardId}
            passReward={game.rules.passStartReward}
          />
        )}

        {selectedTile != null && (
          <BankPropertyModal
            key={`prop-${selectedTile}`}
            tile={selectedTile}
            game={game}
            onClose={() => setSelectedTile(null)}
          />
        )}
        {tradeOpen && <BankTradeModal key="trade" game={game} onClose={() => setTradeOpen(false)} />}
      </AnimatePresence>
    </div>
  )
}

/** A short celebration over the board for doubles / Fast Bus moments. */
function RollBanner({ reason, name }: { reason: 'doubles' | 'fastBus' | 'usedFastBus'; name: string }) {
  const { t } = useTranslation('bank')
  const titleKey =
    reason === 'doubles' ? 'banner.doublesTitle' : reason === 'fastBus' ? 'banner.fastBusTitle' : 'banner.turboTitle'
  const subKey =
    reason === 'doubles' ? 'banner.doublesSub' : reason === 'fastBus' ? 'banner.fastBusSub' : 'banner.turboSub'
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
        <p className="text-xl font-bold tracking-wide text-amber-300">{t(titleKey)}</p>
        <p className="mt-0.5 text-sm font-semibold text-white">{t(subKey, { name })}</p>
      </m.div>
    </div>
  )
}

type ScreenT = ReturnType<typeof useTranslation<['bank', 'common', 'online']>>['t']

/** The board-center status line, online-aware. */
function computeStatus(
  game: BankController,
  t: ScreenT,
  online: OnlineMeta | undefined,
  decidingName: string | undefined,
): string {
  if (online && !online.canPlay) return t('online:status.waitingReconnect')
  const current = game.currentPlayer
  if (game.phase === 'rolling') return t('bank:turn.rolling', { name: current?.name ?? '' })
  if (game.phase === 'deciding') return t('bank:turn.deciding', { name: decidingName ?? '' })
  if (!current) return ''
  if (online) {
    return game.isMyTurn
      ? t('online:status.yourTurnRoll')
      : t('online:status.waitingForRoll', { name: current.name })
  }
  return t('bank:turn.player', { name: current.name })
}

/** The roll button label, online-aware. */
function computeRollLabel(game: BankController, t: ScreenT, online: OnlineMeta | undefined): string {
  if (online && !online.canPlay) return t('common:game.waiting')
  if (online && !game.isMyTurn)
    return t('common:game.opponentsTurn', { name: game.currentPlayer?.name ?? '?' })
  if (game.inJail) return t('bank:controls.rollDoubles')
  if (game.consecutiveDoubles > 0) return t('bank:controls.rollAgain')
  return t('bank:controls.roll')
}
