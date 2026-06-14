import { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { useTicTacToe } from '../../hooks/useTicTacToe'
import { useUnloadGuard } from '../../hooks/useUnloadGuard'
import { useLeaveConfirm } from '../../hooks/useLeaveConfirm'
import { useRecordMatch } from '../../hooks/useRecordMatch'
import {
  useOnlineMatch,
  type OnlineMatch,
  type OnlineMatchAdapter,
} from '../../net/useOnlineMatch'
import type { PlayerProfile, Role, RunningSnapshot } from '../../net/types'
import { XO_MAX_PLAYERS } from '../../xo/config'
import type { Cell, XOResolution, XOSeatState } from '../../xo/types'
import { XOGameScreen } from './XOGameScreen'
import { ConfirmLeaveDialog } from '../ConfirmLeaveDialog'
import { WinnerOverlay } from '../WinnerOverlay'
import { XODrawOverlay } from './XODrawOverlay'
import { ReactionBar, ReactionLayer } from '../online/Reactions'
import { Notices, WaitingRoom } from '../online/RoomChrome'

/** Separate channel namespace so games never cross-talk on one room code. */
const XO_CHANNEL_PREFIX = 'xo-room'

interface XOOnlineRoomProps {
  code: string
  role: Role
  profile: PlayerProfile
  onLeave: () => void
}

/**
 * One online Tic-Tac-Toe match — head-to-head over the same game-agnostic
 * machinery (`useOnlineMatch`) as Snakes, Ludo, and Connect Four. This
 * component only supplies the Tic-Tac-Toe specifics: the controller, how a
 * seat's marks map onto the wire, and the screens. Rooms are capped at two
 * seats, so there are no late-joiner prompts — extra visitors can spectate.
 */
export function XOOnlineRoom({ code, role, profile, onLeave }: XOOnlineRoomProps) {
  const { t } = useTranslation(['xo', 'common', 'online'])
  const { confirming, requestLeave, cancelLeave, confirmLeave } = useLeaveConfirm(onLeave)
  const [seat, setSeat] = useState<number | null>(null)
  const matchRef = useRef<OnlineMatch<XOResolution> | null>(null)

  const game = useTicTacToe({
    controlsPlayer: seat ?? -1,
    hooks: {
      onLocalTurn: (resolution, seq) => matchRef.current?.sendTurn(resolution, seq),
      onOutOfSync: () => matchRef.current?.requestSync(),
    },
  })

  // Per-seat wire payload: that seat's marks as [row, col] cells.
  const adapter: OnlineMatchAdapter<XOSeatState> = {
    buildSeatStates: (count) =>
      Array.from({ length: count }, (_, seatIdx) => {
        const cells: Cell[] = []
        game.board.forEach((rowCells, row) =>
          rowCells.forEach((owner, col) => {
            if (owner === seatIdx) cells.push([row, col])
          }),
        )
        return { cells }
      }),
    applySnapshot: (snapshot: RunningSnapshot<XOSeatState>) =>
      game.loadSnapshot({
        players: snapshot.lineup.map((p, i) => ({
          name: p.name,
          color: p.color,
          cells: snapshot.positions[i]?.cells ?? [],
        })),
        currentPlayerIndex: snapshot.currentPlayerIndex,
        finishedOrder: snapshot.finishedOrder,
        ended: snapshot.ended,
        turnCount: snapshot.turnCount,
      }),
    seatStatesEqual: (positions) =>
      positions.every((s, seatIdx) => {
        let count = 0
        for (const [row, col] of s.cells) {
          if (game.board[row]?.[col] !== seatIdx) return false
          count++
        }
        const mine = game.board.flat().filter((owner) => owner === seatIdx).length
        return count === mine
      }),
  }

  const match = useOnlineMatch<XOResolution, XOSeatState>({
    code,
    role,
    profile,
    channelPrefix: XO_CHANNEL_PREFIX,
    game,
    adapter,
    onSeat: setSeat,
    maxPlayers: XO_MAX_PLAYERS,
  })
  useEffect(() => {
    matchRef.current = match
  })

  useUnloadGuard(game.phase !== 'setup' && game.phase !== 'won')
  // Hall-of-Fame bookkeeping: one entry per finished match (draws don't count).
  useRecordMatch('xo', game.phase, game.players, game.winnerId)

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
        maxPlayers={XO_MAX_PLAYERS}
        onSpectate={match.requestSpectate}
        spectatePending={match.amSpectator}
        onStart={match.startMatch}
        onLeave={onLeave}
      />
    )
  }

  return (
    <>
      <XOGameScreen
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
        {game.phase === 'won' && game.draw && (
          <XODrawOverlay
            key="draw"
            onPlayAgain={match.amSpectator ? undefined : match.restartMatch}
            onSecondary={onLeave}
            secondaryLabel={t('common:actions.leave')}
          />
        )}
        {game.phase === 'won' && !game.draw && !game.celebratingWin && game.standings.length > 0 && (
          <WinnerOverlay
            key="winner"
            standings={game.standings}
            subtitle={game.winReason === 'forfeit' ? t('online:subtitleForfeitDuo') : undefined}
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
