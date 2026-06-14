import { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { useBankElHazz } from '../../../hooks/useBankElHazz'
import { useUnloadGuard } from '../../../hooks/useUnloadGuard'
import { useLeaveConfirm } from '../../../hooks/useLeaveConfirm'
import { useRecordMatch } from '../../../hooks/useRecordMatch'
import {
  useOnlineMatch,
  type OnlineMatch,
  type OnlineMatchAdapter,
} from '../../../net/useOnlineMatch'
import type { PlayerProfile, Role, RunningSnapshot } from '../../../net/types'
import { asBankRules, DEFAULT_BANK_RULES } from '../../../bank/config'
import type { BankRules, BankSeatState, BankTurnResolution, Ownership } from '../../../bank/types'
import { BankRulesPicker } from '../BankRulesPicker'
import { BankGameScreen } from '../BankGameScreen'
import { ConfirmLeaveDialog } from '../../ConfirmLeaveDialog'
import { WinnerOverlay } from '../../WinnerOverlay'
import { ReactionBar, ReactionLayer } from '../../online/Reactions'
import { JoinRequests, Notices, WaitingRoom } from '../../online/RoomChrome'
import { RecapPanel } from '../../RecapPanel'
import { bankRecapRows } from '../../recapRows'

/** Separate channel namespace so Bank never cross-talks with the other games. */
const BANK_CHANNEL_PREFIX = 'bk-room'
/** How long a stalled buy decision waits before auto-declining (the `deciding`
 *  pause exists only on the actor's client, so the generic turn timer can't see
 *  it — mirrors Ludo's selection timeout). */
const DECIDE_TIMEOUT_MS = 20_000

/** The game-global blob carried in a snapshot's `shared` field (ownership +
 *  the winner) — everything not captured by the per-seat `BankSeatState`. */
interface BankShared {
  ownership: Record<number, Ownership>
  winnerId: number | null
}

const seatOf = (s: BankSeatState | undefined): BankSeatState => ({
  position: s?.position ?? 0,
  cash: s?.cash ?? 0,
  status: s?.status ?? 'active',
  jailTurns: s?.jailTurns ?? 0,
  jailCards: s?.jailCards ?? 0,
  fastBus: s?.fastBus ?? false,
})

interface BankOnlineRoomProps {
  code: string
  role: Role
  profile: PlayerProfile
  onLeave: () => void
}

/**
 * One online Bank El-Hazz match — the Bank counterpart of `LudoOnlineRoom`. All
 * of the game-agnostic machinery lives in {@link useOnlineMatch}; this component
 * only supplies the Bank specifics: the game controller, how a seat's board
 * state maps onto the wire (`BankSeatState` per seat + ownership/winner in the
 * shared blob), and the screens to render. Because luck/court cards are baked
 * into each resolution and the buy decision is a normal seq-stamped `turn`, the
 * online layer needs no Bank logic changes.
 */
export function BankOnlineRoom({ code, role, profile, onLeave }: BankOnlineRoomProps) {
  const { t } = useTranslation(['bank', 'common', 'online'])
  // Mid-match Leave goes through a sad-face confirmation so an accidental tap
  // never abandons a running game.
  const { confirming, requestLeave, cancelLeave, confirmLeave } = useLeaveConfirm(onLeave)
  // This client's seat. Unknown until the match starts.
  const [seat, setSeat] = useState<number | null>(null)
  // Host's rule selection for the next match.
  const [rules, setRules] = useState<BankRules>({ ...DEFAULT_BANK_RULES })
  const matchRef = useRef<OnlineMatch<BankTurnResolution> | null>(null)

  const game = useBankElHazz({
    controlsPlayer: seat ?? -1,
    hooks: {
      onLocalTurn: (resolution, seq) => matchRef.current?.sendTurn(resolution, seq),
      onOutOfSync: () => matchRef.current?.requestSync(),
    },
  })

  // Bank's per-seat wire payload + the ownership/winner shared blob.
  const adapter: OnlineMatchAdapter<BankSeatState> = {
    buildSeatStates: (count) =>
      Array.from({ length: count }, (_, i) => {
        const p = game.players[i]
        return seatOf(p && { position: p.position, cash: p.cash, status: p.status, jailTurns: p.jailTurns, jailCards: p.jailCards, fastBus: p.fastBus })
      }),
    buildShared: (): BankShared => ({ ownership: game.ownership, winnerId: game.winnerId }),
    applySnapshot: (snapshot: RunningSnapshot<BankSeatState>) => {
      const shared = (snapshot.shared ?? {}) as Partial<BankShared>
      game.loadSnapshot({
        players: snapshot.lineup.map((p, i) => {
          const s = seatOf(snapshot.positions[i])
          return { name: p.name, color: p.color, ...s }
        }),
        ownership: shared.ownership ?? {},
        rules: asBankRules(snapshot.rules),
        currentPlayerIndex: snapshot.currentPlayerIndex,
        bankruptedOrder: snapshot.finishedOrder,
        ended: snapshot.ended,
        winnerId: shared.winnerId ?? null,
        turnCount: snapshot.turnCount,
      })
    },
    seatStatesEqual: (positions) =>
      positions.every((s, i) => {
        const p = game.players[i]
        return p != null && s.position === p.position && s.cash === p.cash && s.status === p.status
      }),
  }

  const match = useOnlineMatch<BankTurnResolution, BankSeatState>({
    code,
    role,
    profile,
    channelPrefix: BANK_CHANNEL_PREFIX,
    game,
    adapter,
    onSeat: setSeat,
    matchRules: () => rules,
  })
  useEffect(() => {
    matchRef.current = match
  })

  useUnloadGuard(game.phase !== 'setup' && game.phase !== 'won')
  // Hall-of-Fame bookkeeping: one entry per finished match.
  useRecordMatch('bank', game.phase, game.players, game.winnerId)

  // Decision-stall guard: if it's our buy choice and we never tap, auto-decline
  // so the room is never wedged on our indecision (the generic turn timer can't
  // see the `deciding` pause — it only runs on idle turns).
  const { phase, canDecide, turnCount, decideDecline } = game
  useEffect(() => {
    if (phase !== 'deciding' || !canDecide) return
    const timer = setTimeout(() => void decideDecline(), DECIDE_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [phase, canDecide, turnCount, decideDecline])

  if (game.phase === 'setup') {
    return (
      <WaitingRoom
        code={code}
        role={role}
        status={match.status}
        testMode={match.testMode}
        seats={match.seats}
        myClientId={match.clientId}
        rejection={match.myRejection}
        declined={match.declined}
        pendingApproval={match.amPending}
        canStart={match.canStart}
        settings={
          role === 'host' ? <BankRulesPicker value={rules} onChange={setRules} compact /> : undefined
        }
        onSpectate={match.requestSpectate}
        spectatePending={match.amSpectator}
        onStart={match.startMatch}
        onLeave={onLeave}
      />
    )
  }

  return (
    <>
      <BankGameScreen
        game={game}
        online={{
          roomCode: code,
          everyonePresent: match.everyonePresent,
          absentSeats: match.absentSeats,
          canPlay: match.canPlay,
          testMode: match.testMode,
          turnSecondsLeft: match.turnSecondsLeft,
          spectator: match.amSpectator,
          onLeave: requestLeave,
        }}
      />
      <ConfirmLeaveDialog open={confirming} onConfirm={confirmLeave} onCancel={cancelLeave} />
      <Notices notices={match.notices} />
      <ReactionLayer reactions={match.reactions} />
      <ReactionBar onReact={match.sendReaction} />
      {match.amActingHost && game.phase !== 'won' && match.joinRequests.length > 0 && (
        <JoinRequests
          requests={match.joinRequests}
          canAccept={match.canAdmit}
          onAccept={match.acceptJoiner}
          onReject={match.rejectJoiner}
        />
      )}
      <AnimatePresence>
        {game.phase === 'won' && game.standings.length > 0 && (
          <WinnerOverlay
            key="winner"
            standings={game.standings}
            recap={
              game.matchLog ? (
                <RecapPanel title={t('common:overlay.matchRecap')} rows={bankRecapRows(game.matchLog)} />
              ) : undefined
            }
            subtitle={game.winReason === 'forfeit' ? t('online:subtitleForfeit') : undefined}
            onPlayAgain={
              game.winReason === 'forfeit' || match.amSpectator ? undefined : match.restartMatch
            }
            onSecondary={onLeave}
            secondaryLabel={t('common:actions.leave')}
          />
        )}
      </AnimatePresence>
    </>
  )
}
