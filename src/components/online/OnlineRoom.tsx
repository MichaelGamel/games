import { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useSnakesAndLadders } from '../../hooks/useSnakesAndLadders'
import { useUnloadGuard } from '../../hooks/useUnloadGuard'
import { useLeaveConfirm } from '../../hooks/useLeaveConfirm'
import {
  useOnlineMatch,
  type OnlineMatch,
  type OnlineMatchAdapter,
} from '../../net/useOnlineMatch'
import { DEFAULT_CHANNEL_PREFIX } from '../../net/types'
import type { PlayerProfile, Role, RunningSnapshot } from '../../net/types'
import type { TurnResolution } from '../../game/types'
import { GameScreen } from '../GameScreen'
import { ConfirmLeaveDialog } from '../ConfirmLeaveDialog'
import { WinnerOverlay } from '../WinnerOverlay'
import { CelebrationOverlay } from '../CelebrationOverlay'
import { ReactionBar, ReactionLayer } from './Reactions'
import { JoinRequests, Notices, WaitingRoom } from './RoomChrome'

interface OnlineRoomProps {
  code: string
  role: Role
  profile: PlayerProfile
  onLeave: () => void
}

/**
 * One online Snakes & Ladders match. All of the game-agnostic machinery —
 * self-healing sync, host migration, late joiners, presence skips/forfeits,
 * notices, reactions — lives in {@link useOnlineMatch}; this component only
 * supplies the Snakes specifics: the game controller, how a seat's board state
 * maps onto the wire (a single cell index), and the screens to render.
 */
export function OnlineRoom({ code, role, profile, onLeave }: OnlineRoomProps) {
  // Mid-match Leave goes through a sad-face confirmation so an accidental tap
  // never abandons a running game.
  const { confirming, requestLeave, cancelLeave, confirmLeave } = useLeaveConfirm(onLeave)
  // This client's seat (player index). Unknown until the match starts.
  const [seat, setSeat] = useState<number | null>(null)
  const matchRef = useRef<OnlineMatch<TurnResolution> | null>(null)

  const game = useSnakesAndLadders({
    controlsPlayer: seat ?? -1,
    hooks: {
      onLocalTurn: (resolution, seq) => matchRef.current?.sendTurn(resolution, seq),
      onLocalDecision: (decision, seq) => matchRef.current?.sendDecision(decision, seq),
      onOutOfSync: () => matchRef.current?.requestSync(),
    },
  })

  // Snakes' per-seat wire payload is simply the token's cell index.
  const adapter: OnlineMatchAdapter<number> = {
    buildSeatStates: (count) =>
      Array.from({ length: count }, (_, i) => game.players[i]?.position ?? 0),
    applySnapshot: (snapshot: RunningSnapshot<number>) =>
      game.loadSnapshot({
        players: snapshot.lineup.map((p, i) => ({
          name: p.name,
          color: p.color,
          position: snapshot.positions[i] ?? 0,
        })),
        currentPlayerIndex: snapshot.currentPlayerIndex,
        lastRoll: snapshot.lastRoll,
        finishedOrder: snapshot.finishedOrder,
        awaitingDecision: snapshot.awaitingDecision,
        ended: snapshot.ended,
        turnCount: snapshot.turnCount,
      }),
    seatStatesEqual: (positions) =>
      positions.every((pos, i) => pos === game.players[i]?.position),
  }

  const match = useOnlineMatch<TurnResolution, number>({
    code,
    role,
    profile,
    channelPrefix: DEFAULT_CHANNEL_PREFIX,
    game,
    adapter,
    onSeat: setSeat,
  })
  useEffect(() => {
    matchRef.current = match
  })

  // Warn before closing/refreshing/navigating away while a match is live, so a
  // player doesn't drop their friends mid-game by accident.
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
      <GameScreen
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
            // Only the acting host decides whether to play on. If the original
            // host left, the next player inherits the call (and duplicate
            // decisions dedupe by sequence number anyway).
            canDecide={match.amActingHost}
            waitingFor={match.actingHostName}
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
            // No opponents left to play again with after a forfeit win.
            onPlayAgain={game.winReason === 'forfeit' ? undefined : match.restartMatch}
            onSecondary={onLeave}
            secondaryLabel="Leave"
          />
        )}
      </AnimatePresence>
    </>
  )
}
