/**
 * One online chess match — head-to-head over the same game-agnostic machinery
 * (`useOnlineMatch`) as every other game. This shell supplies only the chess
 * specifics: the controller, how the board maps onto the wire (the FEN), and the
 * screens. Rooms are capped at two seats (White is seat 0, Black is seat 1), so
 * there are no late-joiner prompts — extra visitors spectate. The per-move idle
 * timer is off: chess turns take real thought.
 */
import { useEffect, useRef, useState } from 'react'
import { useChessGame } from '../../hooks/useChessGame'
import { useUnloadGuard } from '../../hooks/useUnloadGuard'
import { useLeaveConfirm } from '../../hooks/useLeaveConfirm'
import { useRecordMatch } from '../../hooks/useRecordMatch'
import {
  useOnlineMatch,
  type OnlineMatch,
  type OnlineMatchAdapter,
} from '../../net/useOnlineMatch'
import type { PlayerProfile, Role, RunningSnapshot } from '../../net/types'
import { CHESS_MAX_PLAYERS } from '../../chess/config'
import type { ChessResolution, ChessSeatState, ChessShared } from '../../chess/types'
import { ChessBoardView, type ChessOnlineContext } from './ChessBoardView'
import { ConfirmLeaveDialog } from '../ConfirmLeaveDialog'
import { Notices, WaitingRoom } from '../online/RoomChrome'
import { ReactionBar, ReactionLayer } from '../online/Reactions'

const CHESS_CHANNEL_PREFIX = 'chess-room'

interface ChessOnlineRoomProps {
  code: string
  role: Role
  profile: PlayerProfile
  onLeave: () => void
}

export function ChessOnlineRoom({ code, role, profile, onLeave }: ChessOnlineRoomProps) {
  const { confirming, requestLeave, cancelLeave, confirmLeave } = useLeaveConfirm(onLeave)
  const [seat, setSeat] = useState<number | null>(null)
  const matchRef = useRef<OnlineMatch<ChessResolution> | null>(null)

  const game = useChessGame({
    mode: 'online',
    controlsPlayer: seat ?? -1,
    hooks: {
      onLocalTurn: (resolution, seq) => matchRef.current?.sendTurn(resolution, seq),
      onOutOfSync: () => matchRef.current?.requestSync(),
    },
  })

  // The whole board state lives in the FEN, so every seat carries the same one;
  // the move list, captures and result ride in the snapshot's `shared` blob.
  const adapter: OnlineMatchAdapter<ChessSeatState> = {
    buildSeatStates: (count) => Array.from({ length: count }, () => ({ fen: game.fen })),
    applySnapshot: (snapshot: RunningSnapshot<ChessSeatState>) =>
      game.loadSnapshot({
        players: snapshot.lineup.map((p) => ({ name: p.name, color: p.color })),
        shared: snapshot.shared as ChessShared,
        currentPlayerIndex: snapshot.currentPlayerIndex,
        finishedOrder: [...snapshot.finishedOrder],
        ended: snapshot.ended,
        turnCount: snapshot.turnCount,
      }),
    seatStatesEqual: (positions) => positions.every((s) => s.fen === game.fen),
    buildShared: () => game.buildShared(),
  }

  const match = useOnlineMatch<ChessResolution, ChessSeatState>({
    code,
    role,
    profile,
    channelPrefix: CHESS_CHANNEL_PREFIX,
    game,
    adapter,
    onSeat: setSeat,
    maxPlayers: CHESS_MAX_PLAYERS,
    idleTurnTimer: false,
  })
  useEffect(() => {
    matchRef.current = match
  })

  useUnloadGuard(game.phase !== 'setup' && game.phase !== 'won')
  useRecordMatch('chess', game.phase, game.players, game.winnerId)

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
        maxPlayers={CHESS_MAX_PLAYERS}
        onSpectate={match.requestSpectate}
        spectatePending={match.amSpectator}
        onStart={match.startMatch}
        onLeave={onLeave}
      />
    )
  }

  const oppSeat = seat === 0 ? 1 : 0
  const online: ChessOnlineContext = {
    roomCode: code,
    mySeat: seat,
    spectator: match.amSpectator,
    onLeave: requestLeave,
    onPlayAgain: match.amSpectator || game.winReason === 'forfeit' ? undefined : match.restartMatch,
    opponentName: game.players[oppSeat]?.name ?? '',
    opponentAbsent: seat != null && match.absentSeats.includes(oppSeat),
    canPlay: match.canPlay,
  }

  return (
    <>
      <ChessBoardView c={game} online={online} onExit={onLeave} />
      <ConfirmLeaveDialog open={confirming} onConfirm={confirmLeave} onCancel={cancelLeave} />
      <Notices notices={match.notices} />
      <ReactionLayer reactions={match.reactions} />
      <ReactionBar onReact={match.sendReaction} />
    </>
  )
}
