import { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useLudo } from '../../../hooks/useLudo'
import { useUnloadGuard } from '../../../hooks/useUnloadGuard'
import { useLeaveConfirm } from '../../../hooks/useLeaveConfirm'
import {
  useOnlineMatch,
  type OnlineMatch,
  type OnlineMatchAdapter,
} from '../../../net/useOnlineMatch'
import type { PlayerProfile, Role, RunningSnapshot } from '../../../net/types'
import { TOKENS_PER_PLAYER, PROGRESS_BASE } from '../../../ludo/config'
import type { LudoSeatState, LudoTurnResolution } from '../../../ludo/types'
import { LudoGameScreen } from '../LudoGameScreen'
import { ConfirmLeaveDialog } from '../../ConfirmLeaveDialog'
import { WinnerOverlay } from '../../WinnerOverlay'
import { CelebrationOverlay } from '../../CelebrationOverlay'
import { ReactionBar, ReactionLayer } from '../../online/Reactions'
import { JoinRequests, Notices, WaitingRoom } from '../../online/RoomChrome'

/** Separate channel namespace so Snakes and Ludo never cross-talk on one code. */
const LUDO_CHANNEL_PREFIX = 'lr-room'

const freshTokens = () => Array<number>(TOKENS_PER_PLAYER).fill(PROGRESS_BASE)
const tokensEqual = (a: number[], b: number[] | undefined) =>
  b != null && a.length === b.length && a.every((t, i) => t === b[i])

interface LudoOnlineRoomProps {
  code: string
  role: Role
  profile: PlayerProfile
  onLeave: () => void
}

/**
 * One online Ludo match — the Ludo counterpart of `OnlineRoom`. All of the
 * game-agnostic machinery lives in {@link useOnlineMatch}; this component only
 * supplies the Ludo specifics: the game controller, how a seat's board state
 * maps onto the wire (four token progresses plus the six-chain count), and the
 * screens to render.
 */
export function LudoOnlineRoom({ code, role, profile, onLeave }: LudoOnlineRoomProps) {
  // Mid-match Leave goes through a sad-face confirmation so an accidental tap
  // never abandons a running game.
  const { confirming, requestLeave, cancelLeave, confirmLeave } = useLeaveConfirm(onLeave)
  // This client's seat. Unknown until the match starts.
  const [seat, setSeat] = useState<number | null>(null)
  const matchRef = useRef<OnlineMatch<LudoTurnResolution> | null>(null)

  const game = useLudo({
    controlsPlayer: seat ?? -1,
    hooks: {
      onLocalTurn: (resolution, seq) => matchRef.current?.sendTurn(resolution, seq),
      onLocalDecision: (decision, seq) => matchRef.current?.sendDecision(decision, seq),
      onOutOfSync: () => matchRef.current?.requestSync(),
    },
  })

  // Ludo's per-seat wire payload: the 4 token progresses, plus the six-chain
  // count (only meaningful for the seat about to roll).
  const adapter: OnlineMatchAdapter<LudoSeatState> = {
    buildSeatStates: (count) =>
      Array.from({ length: count }, (_, i) => ({
        tokens: game.players[i] ? [...game.players[i].tokens] : freshTokens(),
        consecutiveSixes: i === game.currentPlayerIndex ? game.consecutiveSixes : 0,
      })),
    applySnapshot: (snapshot: RunningSnapshot<LudoSeatState>) =>
      game.loadSnapshot({
        players: snapshot.lineup.map((p, i) => ({
          name: p.name,
          color: p.color,
          tokens: snapshot.positions[i]?.tokens ?? freshTokens(),
        })),
        currentPlayerIndex: snapshot.currentPlayerIndex,
        lastRoll: snapshot.lastRoll,
        finishedOrder: snapshot.finishedOrder,
        awaitingDecision: snapshot.awaitingDecision,
        ended: snapshot.ended,
        turnCount: snapshot.turnCount,
        // Only the seat about to roll carries a meaningful six-chain count.
        consecutiveSixes: snapshot.positions[snapshot.currentPlayerIndex]?.consecutiveSixes ?? 0,
      }),
    seatStatesEqual: (positions) =>
      positions.every((s, i) => tokensEqual(s.tokens, game.players[i]?.tokens)),
  }

  const match = useOnlineMatch<LudoTurnResolution, LudoSeatState>({
    code,
    role,
    profile,
    channelPrefix: LUDO_CHANNEL_PREFIX,
    game,
    adapter,
    onSeat: setSeat,
  })
  useEffect(() => {
    matchRef.current = match
  })

  useUnloadGuard(game.phase !== 'setup' && game.phase !== 'won')

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
        onStart={match.startMatch}
        onLeave={onLeave}
      />
    )
  }

  const lastFinisher =
    game.finishedOrder.length > 0
      ? (game.players[game.finishedOrder[game.finishedOrder.length - 1]] ?? null)
      : null

  return (
    <>
      <LudoGameScreen
        game={game}
        online={{
          roomCode: code,
          everyonePresent: match.everyonePresent,
          canPlay: match.canPlay,
          testMode: match.testMode,
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
        {game.phase === 'celebrating' && lastFinisher && (
          <CelebrationOverlay
            key={`celebrate-${game.finishedOrder.length}`}
            player={lastFinisher}
            rank={game.finishedOrder.length - 1}
            canDecide={match.amActingHost}
            waitingFor={match.actingHostName}
            message="brought all four tokens home! 🎉"
            onContinue={() => game.decide('continue')}
            onEnd={() => game.decide('end')}
          />
        )}
        {game.phase === 'won' && game.standings.length > 0 && (
          <WinnerOverlay
            key="winner"
            standings={game.standings}
            subtitle={
              game.winReason === 'forfeit' ? 'All other players left the game.' : undefined
            }
            onPlayAgain={game.winReason === 'forfeit' ? undefined : match.restartMatch}
            onSecondary={onLeave}
            secondaryLabel="Leave"
          />
        )}
      </AnimatePresence>
    </>
  )
}
