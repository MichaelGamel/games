import { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { useBackgammon } from '../../../hooks/useBackgammon'
import { chooseBotSequence } from '../../../backgammon/bot'
import { useUnloadGuard } from '../../../hooks/useUnloadGuard'
import { useLeaveConfirm } from '../../../hooks/useLeaveConfirm'
import { useRecordMatch } from '../../../hooks/useRecordMatch'
import { useOnlineMatch, type OnlineMatch, type OnlineMatchAdapter } from '../../../net/useOnlineMatch'
import type { PlayerProfile, Role, RunningSnapshot } from '../../../net/types'
import { asBackgammonRules, BACKGAMMON_MAX_PLAYERS } from '../../../backgammon/config'
import { pipCount, startingBoard } from '../../../backgammon/board'
import type {
  BackgammonSeatState,
  BackgammonShared,
  BackgammonTurnResolution,
} from '../../../backgammon/types'
import { BackgammonGameScreen } from '../BackgammonGameScreen'
import { BackgammonReplay } from '../BackgammonReplay'
import { ConfirmLeaveDialog } from '../../ConfirmLeaveDialog'
import { WinnerOverlay } from '../../WinnerOverlay'
import { RecapPanel } from '../../RecapPanel'
import { backgammonRecapRows } from '../../recapRows'
import { ReactionBar, ReactionLayer } from '../../online/Reactions'
import { Notices, WaitingRoom } from '../../online/RoomChrome'

/** Separate channel namespace so games never cross-talk on one room code. */
const BG_CHANNEL_PREFIX = 'bg-room'
/** How long the roller may dither over their move before one is auto-played
 *  (the `selecting` pause exists only on the actor's client, so the generic
 *  turn timer can't see it). */
const SELECT_TIMEOUT_MS = 25_000

interface BackgammonOnlineRoomProps {
  code: string
  role: Role
  profile: PlayerProfile
  onLeave: () => void
}

/**
 * One online Backgammon match — head-to-head over the same game-agnostic
 * machinery (`useOnlineMatch`) as every other game. Backgammon's board is shared
 * (not per-seat), so the full position rides the snapshot's `shared` blob (the
 * Chess pattern); the per-seat payload is just a cheap parity fingerprint.
 */
export function BackgammonOnlineRoom({ code, role, profile, onLeave }: BackgammonOnlineRoomProps) {
  const { t } = useTranslation(['backgammon', 'common', 'online'])
  const { confirming, requestLeave, cancelLeave, confirmLeave } = useLeaveConfirm(onLeave)
  const [seat, setSeat] = useState<number | null>(null)
  const [replayLog, setReplayLog] = useState<ReturnType<typeof useBackgammon>['matchLog']>(null)
  const matchRef = useRef<OnlineMatch<BackgammonTurnResolution> | null>(null)

  const game = useBackgammon({
    controlsPlayer: seat ?? -1,
    hooks: {
      onLocalTurn: (resolution, seq) => matchRef.current?.sendTurn(resolution, seq),
      onOutOfSync: () => matchRef.current?.requestSync(),
    },
  })

  const adapter: OnlineMatchAdapter<BackgammonSeatState> = {
    // A cheap, board-sensitive fingerprint per seat; the real board rides `shared`.
    buildSeatStates: (count) =>
      Array.from({ length: count }, (_, i) => ({
        onBoard: pipCount(game.board, i),
        off: game.board.off[i],
      })),
    buildShared: (): BackgammonShared => ({
      board: game.board,
      lastDice: game.lastDice,
      winnerId: game.winnerId,
      winReason: game.winReason,
    }),
    applySnapshot: (snapshot: RunningSnapshot<BackgammonSeatState>) => {
      const shared = snapshot.shared as BackgammonShared | undefined
      game.loadSnapshot({
        players: snapshot.lineup.map((p) => ({ name: p.name, color: p.color })),
        rules: asBackgammonRules(snapshot.rules),
        board: shared?.board ?? startingBoard(),
        lastDice: shared?.lastDice ?? [],
        currentPlayerIndex: snapshot.currentPlayerIndex,
        finishedOrder: snapshot.finishedOrder,
        ended: snapshot.ended,
        winReason: shared?.winReason ?? null,
        turnCount: snapshot.turnCount,
      })
    },
    seatStatesEqual: (positions) =>
      positions.every((s, i) => s.onBoard === pipCount(game.board, i) && s.off === game.board.off[i]),
  }

  const match = useOnlineMatch<BackgammonTurnResolution, BackgammonSeatState>({
    code,
    role,
    profile,
    channelPrefix: BG_CHANNEL_PREFIX,
    game,
    adapter,
    onSeat: setSeat,
    maxPlayers: BACKGAMMON_MAX_PLAYERS,
  })
  useEffect(() => {
    matchRef.current = match
  })

  useUnloadGuard(game.phase !== 'setup' && game.phase !== 'won')
  useRecordMatch('backgammon', game.phase, game.players, game.winnerId)

  // Selection-stall guard: if we roll and never finish our move, auto-play a
  // sensible sequence so the room is never wedged on our indecision. Re-armed on
  // each hop we play (pendingMoves length changes) and on each new turn.
  const { phase, isMyTurn, currentPlayerIndex, lastDice, pendingMoves, botPlay, turnCount } = game
  useEffect(() => {
    if (phase !== 'selecting' || !isMyTurn) return
    const timer = setTimeout(() => {
      const moves = chooseBotSequence(game, currentPlayerIndex, lastDice, 'smart')
      void botPlay(moves)
    }, SELECT_TIMEOUT_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-arm on turn/phase/own moves
  }, [phase, isMyTurn, currentPlayerIndex, turnCount, pendingMoves.length, lastDice, botPlay])

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
        maxPlayers={BACKGAMMON_MAX_PLAYERS}
        onSpectate={match.requestSpectate}
        spectatePending={match.amSpectator}
        onStart={match.startMatch}
        onLeave={onLeave}
      />
    )
  }

  return (
    <>
      <BackgammonGameScreen
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
      <AnimatePresence>
        {game.phase === 'won' && game.standings.length > 0 && (
          <WinnerOverlay
            key="winner"
            standings={game.standings}
            recap={
              game.matchLog ? (
                <RecapPanel title={t('common:overlay.matchRecap')} rows={backgammonRecapRows(game.matchLog)} />
              ) : undefined
            }
            onReplay={
              game.matchLog && game.matchLog.events.length > 0 ? () => setReplayLog(game.matchLog) : undefined
            }
            subtitle={game.winReason === 'forfeit' ? t('online:subtitleForfeitDuo') : undefined}
            onPlayAgain={game.winReason === 'forfeit' || match.amSpectator ? undefined : match.restartMatch}
            onSecondary={onLeave}
            secondaryLabel={t('common:actions.leave')}
          />
        )}
      </AnimatePresence>
      {replayLog && <BackgammonReplay log={replayLog} onClose={() => setReplayLog(null)} />}
    </>
  )
}
