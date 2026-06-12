import { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { useConnectFour } from '../../hooks/useConnectFour'
import { useUnloadGuard } from '../../hooks/useUnloadGuard'
import { useLeaveConfirm } from '../../hooks/useLeaveConfirm'
import { useRecordMatch } from '../../hooks/useRecordMatch'
import {
  useOnlineMatch,
  type OnlineMatch,
  type OnlineMatchAdapter,
} from '../../net/useOnlineMatch'
import type { PlayerProfile, Role, RunningSnapshot } from '../../net/types'
import { FOUR_MAX_PLAYERS } from '../../four/config'
import type { Cell, FourResolution, FourSeatState } from '../../four/types'
import { FourGameScreen } from './FourGameScreen'
import { ConfirmLeaveDialog } from '../ConfirmLeaveDialog'
import { WinnerOverlay } from '../WinnerOverlay'
import { DrawOverlay } from './DrawOverlay'
import { ReactionBar, ReactionLayer } from '../online/Reactions'
import { Notices, WaitingRoom } from '../online/RoomChrome'

/** Separate channel namespace so games never cross-talk on one room code. */
const FOUR_CHANNEL_PREFIX = 'c4-room'

interface FourOnlineRoomProps {
  code: string
  role: Role
  profile: PlayerProfile
  onLeave: () => void
}

/**
 * One online Connect Four match — head-to-head over the same game-agnostic
 * machinery (`useOnlineMatch`) as Snakes and Ludo. This component only supplies
 * the Connect Four specifics: the controller, how a seat's discs map onto the
 * wire, and the screens. Rooms are capped at two seats, so there are no
 * late-joiner prompts — extra visitors can spectate.
 */
export function FourOnlineRoom({ code, role, profile, onLeave }: FourOnlineRoomProps) {
  const { t } = useTranslation(['four', 'common', 'online'])
  const { confirming, requestLeave, cancelLeave, confirmLeave } = useLeaveConfirm(onLeave)
  const [seat, setSeat] = useState<number | null>(null)
  const matchRef = useRef<OnlineMatch<FourResolution> | null>(null)

  const game = useConnectFour({
    controlsPlayer: seat ?? -1,
    hooks: {
      onLocalTurn: (resolution, seq) => matchRef.current?.sendTurn(resolution, seq),
      onOutOfSync: () => matchRef.current?.requestSync(),
    },
  })

  // Per-seat wire payload: that seat's discs as [row, col] cells.
  const adapter: OnlineMatchAdapter<FourSeatState> = {
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
    applySnapshot: (snapshot: RunningSnapshot<FourSeatState>) =>
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

  const match = useOnlineMatch<FourResolution, FourSeatState>({
    code,
    role,
    profile,
    channelPrefix: FOUR_CHANNEL_PREFIX,
    game,
    adapter,
    onSeat: setSeat,
    maxPlayers: FOUR_MAX_PLAYERS,
  })
  useEffect(() => {
    matchRef.current = match
  })

  useUnloadGuard(game.phase !== 'setup' && game.phase !== 'won')
  // Hall-of-Fame bookkeeping: one entry per finished match (draws don't count).
  useRecordMatch('four', game.phase, game.players, game.winnerId)

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
        maxPlayers={FOUR_MAX_PLAYERS}
        onSpectate={match.requestSpectate}
        spectatePending={match.amSpectator}
        onStart={match.startMatch}
        onLeave={onLeave}
      />
    )
  }

  return (
    <>
      <FourGameScreen
        game={game}
        online={{
          roomCode: code,
          everyonePresent: match.everyonePresent,
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
          <DrawOverlay
            key="draw"
            onPlayAgain={match.amSpectator ? undefined : match.restartMatch}
            onSecondary={onLeave}
            secondaryLabel={t('common:actions.leave')}
          />
        )}
        {game.phase === 'won' && !game.draw && game.standings.length > 0 && (
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
