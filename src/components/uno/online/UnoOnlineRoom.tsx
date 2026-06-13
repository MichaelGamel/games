import { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { useUno, parseStartPayload } from '../../../hooks/useUno'
import { useUnloadGuard } from '../../../hooks/useUnloadGuard'
import { useLeaveConfirm } from '../../../hooks/useLeaveConfirm'
import { useRecordMatch } from '../../../hooks/useRecordMatch'
import {
  useOnlineMatch,
  type OnlineMatch,
  type OnlineMatchAdapter,
} from '../../../net/useOnlineMatch'
import type { PlayerProfile, Role, RunningSnapshot } from '../../../net/types'
import { DEFAULT_UNO_RULES, UNO_MAX_PLAYERS } from '../../../uno/config'
import type {
  UnoCard,
  UnoColor,
  UnoRules,
  UnoSeatState,
  UnoSharedState,
  UnoTurnResolution,
} from '../../../uno/types'
import { UnoRulesPicker } from '../UnoRulesPicker'
import { UnoGameScreen } from '../UnoGameScreen'
import { UnoChoiceOverlay } from '../UnoChoiceOverlay'
import { ConfirmLeaveDialog } from '../../ConfirmLeaveDialog'
import { WinnerOverlay } from '../../WinnerOverlay'
import { CelebrationOverlay } from '../../CelebrationOverlay'
import { ReactionBar, ReactionLayer } from '../../online/Reactions'
import { JoinRequests, Notices, WaitingRoom } from '../../online/RoomChrome'
import { RecapPanel } from '../../RecapPanel'
import { unoRecapRows } from '../../recapRows'

/** Separate channel namespace so UNO never cross-talks with the other games. */
const UNO_CHANNEL_PREFIX = 'uno-room'

/** A fresh deck seed for a new match (the host picks it; it rides in `rules`). */
const randomSeed = () => Math.floor(Math.random() * 0x7fffffff)

/** Validate a `shared` blob off the wire — a malformed one must never crash. */
function asUnoShared(value: unknown): UnoSharedState | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Partial<UnoSharedState>
  if (!Array.isArray(v.hands) || !Array.isArray(v.stock) || !Array.isArray(v.discard)) return null
  return {
    hands: v.hands as UnoCard[][],
    stock: v.stock as UnoCard[],
    discard: v.discard as UnoCard[],
    activeColor: (v.activeColor ?? 'red') as UnoColor,
    direction: v.direction === -1 ? -1 : 1,
    pendingDraw: typeof v.pendingDraw === 'number' ? v.pendingDraw : 0,
    pendingDrawType: v.pendingDrawType === 'draw2' || v.pendingDrawType === 'wild4' ? v.pendingDrawType : null,
    reshuffleCount: typeof v.reshuffleCount === 'number' ? v.reshuffleCount : 0,
    deckSeed: typeof v.deckSeed === 'number' ? v.deckSeed : 0,
    roundNumber: typeof v.roundNumber === 'number' ? v.roundNumber : 1,
  }
}

interface UnoOnlineRoomProps {
  code: string
  role: Role
  profile: PlayerProfile
  onLeave: () => void
}

/**
 * One online UNO match — the UNO counterpart of `OnlineRoom` / `LudoOnlineRoom`.
 * All of the game-agnostic machinery lives in {@link useOnlineMatch}; this
 * supplies only the UNO specifics: the controller, how a seat maps onto the wire
 * (a cheap hand-count for the heartbeat, with the actual hands in the `shared`
 * blob), and the screens to render.
 */
export function UnoOnlineRoom({ code, role, profile, onLeave }: UnoOnlineRoomProps) {
  const { t } = useTranslation(['uno', 'common', 'online'])
  const { confirming, requestLeave, cancelLeave, confirmLeave } = useLeaveConfirm(onLeave)
  const [seat, setSeat] = useState<number | null>(null)
  const [rules, setRules] = useState<UnoRules>({ ...DEFAULT_UNO_RULES })
  const matchRef = useRef<OnlineMatch<UnoTurnResolution> | null>(null)

  const game = useUno({
    controlsPlayer: seat ?? -1,
    hooks: {
      onLocalTurn: (resolution, seq) => matchRef.current?.sendTurn(resolution, seq),
      onLocalDecision: (decision, seq) => matchRef.current?.sendDecision(decision, seq),
      onOutOfSync: () => matchRef.current?.requestSync(),
    },
  })

  // The per-seat wire payload is deliberately hand-free (it rides every ping):
  // only the count, the UNO flag, and the score. The actual hands travel in the
  // `shared` blob, which is sent only on snapshots.
  const adapter: OnlineMatchAdapter<UnoSeatState> = {
    buildSeatStates: (count) =>
      Array.from({ length: count }, (_, i) => ({
        handCount: game.hands[i]?.length ?? 0,
        saidUno: game.saidUno[i] ?? false,
        score: game.scores[i] ?? 0,
      })),
    buildShared: (): UnoSharedState => ({
      hands: game.hands.map((h) => [...h]),
      stock: [...game.stock],
      discard: [...game.discard],
      activeColor: game.activeColor,
      direction: game.direction,
      pendingDraw: game.pendingDraw,
      pendingDrawType: game.pendingDrawType,
      reshuffleCount: game.reshuffleCount,
      deckSeed: game.deckSeed,
      roundNumber: game.roundNumber,
    }),
    applySnapshot: (snapshot: RunningSnapshot<UnoSeatState>) => {
      const shared = asUnoShared(snapshot.shared)
      if (!shared) return
      game.loadSnapshot({
        players: snapshot.lineup.map((p, i) => ({
          name: p.name,
          color: p.color,
          hand: shared.hands[i] ?? [],
          saidUno: snapshot.positions[i]?.saidUno ?? false,
          score: snapshot.positions[i]?.score ?? 0,
        })),
        rules: parseStartPayload(snapshot.rules).rules,
        currentPlayerIndex: snapshot.currentPlayerIndex,
        stock: shared.stock,
        discard: shared.discard,
        activeColor: shared.activeColor,
        direction: shared.direction,
        pendingDraw: shared.pendingDraw,
        pendingDrawType: shared.pendingDrawType,
        reshuffleCount: shared.reshuffleCount,
        deckSeed: shared.deckSeed,
        roundNumber: shared.roundNumber,
        awaitingDecision: snapshot.awaitingDecision,
        ended: snapshot.ended,
        turnCount: snapshot.turnCount,
      })
    },
    // Equal hand counts at an equal turnCount is a strong divergence signal (the
    // net layer also compares currentPlayerIndex + winnerId).
    seatStatesEqual: (positions) =>
      positions.every((s, i) => s.handCount === (game.hands[i]?.length ?? 0)),
  }

  const match = useOnlineMatch<UnoTurnResolution, UnoSeatState>({
    code,
    role,
    profile,
    channelPrefix: UNO_CHANNEL_PREFIX,
    maxPlayers: UNO_MAX_PLAYERS,
    game,
    adapter,
    onSeat: setSeat,
    // The deck seed rides inside the opaque rules payload (like Snakes' board seed).
    matchRules: () => ({ rules, deckSeed: randomSeed() }),
  })
  useEffect(() => {
    matchRef.current = match
  })

  useUnloadGuard(game.phase !== 'setup' && game.phase !== 'matchEnd')
  useRecordMatch('uno', game.phase === 'matchEnd' ? 'won' : game.phase, game.players, game.winnerId)

  if (game.phase === 'setup') {
    return (
      <WaitingRoom
        code={code}
        role={role}
        status={match.status}
        testMode={match.testMode}
        seats={match.seats}
        myClientId={match.clientId}
        maxPlayers={UNO_MAX_PLAYERS}
        rejection={match.myRejection}
        declined={match.declined}
        pendingApproval={match.amPending}
        canStart={match.canStart}
        settings={role === 'host' ? <UnoRulesPicker value={rules} onChange={setRules} compact /> : undefined}
        onSpectate={match.requestSpectate}
        spectatePending={match.amSpectator}
        onStart={match.startMatch}
        onLeave={onLeave}
      />
    )
  }

  return (
    <>
      <UnoGameScreen
        game={game}
        viewerSeat={seat ?? -1}
        secondaryLabel={t('common:actions.leave')}
        onSecondary={requestLeave}
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
      {match.amActingHost && game.phase !== 'matchEnd' && match.joinRequests.length > 0 && (
        <JoinRequests
          requests={match.joinRequests}
          canAccept={match.canAdmit}
          onAccept={match.acceptJoiner}
          onReject={match.rejectJoiner}
        />
      )}

      <AnimatePresence>
        {game.choice && (
          <UnoChoiceOverlay key="choice" choice={game.choice} game={game} seat={game.currentPlayerIndex} />
        )}

        {game.phase === 'roundEnd' && game.currentPlayer && (
          <CelebrationOverlay
            key={`round-${game.roundNumber}`}
            player={game.currentPlayer}
            rank={0}
            canDecide={match.amActingHost}
            waitingFor={match.actingHostName}
            message={t('uno:wonRound')}
            onContinue={() => game.decide('continue')}
            onEnd={() => game.decide('end')}
          />
        )}

        {game.phase === 'matchEnd' && game.winner && (
          <WinnerOverlay
            key="winner"
            standings={[game.winner]}
            recap={
              game.matchLog ? (
                <RecapPanel title={t('common:overlay.matchRecap')} rows={unoRecapRows(game.matchLog)} />
              ) : undefined
            }
            subtitle={game.winReason === 'forfeit' ? t('online:subtitleForfeit') : undefined}
            onPlayAgain={game.winReason === 'forfeit' || match.amSpectator ? undefined : match.restartMatch}
            onSecondary={onLeave}
            secondaryLabel={t('common:actions.leave')}
          />
        )}
      </AnimatePresence>
    </>
  )
}
