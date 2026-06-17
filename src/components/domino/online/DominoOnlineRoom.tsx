import { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { useDomino } from '../../../hooks/useDomino'
import { useUnloadGuard } from '../../../hooks/useUnloadGuard'
import { useLeaveConfirm } from '../../../hooks/useLeaveConfirm'
import { useRecordMatch } from '../../../hooks/useRecordMatch'
import {
  useOnlineMatch,
  type OnlineMatch,
  type OnlineMatchAdapter,
} from '../../../net/useOnlineMatch'
import type { PlayerProfile, Role, RunningSnapshot } from '../../../net/types'
import { DOMINO_MAX_PLAYERS } from '../../../domino/config'
import { handPips } from '../../../domino/rules'
import type {
  DominoLine,
  DominoSeatState,
  DominoSharedState,
  DominoTile,
  DominoTurnResolution,
} from '../../../domino/types'
import { DominoGameScreen } from '../DominoGameScreen'
import { DominoEndChoiceOverlay } from '../DominoEndChoiceOverlay'
import { dominoWinnerInfo } from '../winnerInfo'
import { ConfirmLeaveDialog } from '../../ConfirmLeaveDialog'
import { WinnerOverlay } from '../../WinnerOverlay'
import { ReactionBar, ReactionLayer } from '../../online/Reactions'
import { JoinRequests, Notices, WaitingRoom } from '../../online/RoomChrome'

/** Separate channel namespace so Dominoes never cross-talks with other games. */
const DOMINO_CHANNEL_PREFIX = 'dm-room'

/** A fresh set seed for a new match (the host picks it; it rides in `rules`). */
const randomSeed = () => Math.floor(Math.random() * 0x7fffffff)

/** Validate a `shared` blob off the wire — a malformed one must never crash. */
function asDominoShared(value: unknown): DominoSharedState | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Partial<DominoSharedState>
  if (!Array.isArray(v.hands) || !Array.isArray(v.boneyard)) return null
  const line = v.line as DominoLine | undefined
  if (!line || !Array.isArray(line.tiles)) return null
  return {
    hands: v.hands as DominoTile[][],
    boneyard: v.boneyard as DominoTile[],
    line,
    deckSeed: typeof v.deckSeed === 'number' ? v.deckSeed : 0,
  }
}

interface DominoOnlineRoomProps {
  code: string
  role: Role
  profile: PlayerProfile
  onLeave: () => void
}

/**
 * One online Dominoes match — the counterpart of `UnoOnlineRoom`. All the
 * game-agnostic machinery lives in {@link useOnlineMatch}; this supplies only the
 * Dominoes specifics: the controller, how a seat maps onto the wire (a cheap
 * tile-count heartbeat, with the actual hands in the `shared` blob), and the
 * screens to render.
 */
export function DominoOnlineRoom({ code, role, profile, onLeave }: DominoOnlineRoomProps) {
  const { t } = useTranslation(['domino', 'common', 'online'])
  const { confirming, requestLeave, cancelLeave, confirmLeave } = useLeaveConfirm(onLeave)
  const [seat, setSeat] = useState<number | null>(null)
  const matchRef = useRef<OnlineMatch<DominoTurnResolution> | null>(null)

  const game = useDomino({
    controlsPlayer: seat ?? -1,
    hooks: {
      onLocalTurn: (resolution, seq) => matchRef.current?.sendTurn(resolution, seq),
      onOutOfSync: () => matchRef.current?.requestSync(),
    },
  })

  // The per-seat wire payload is hand-free (it rides every ping): only the tile
  // count and pip total. The actual hands travel in the `shared` snapshot blob.
  const adapter: OnlineMatchAdapter<DominoSeatState> = {
    buildSeatStates: (count) =>
      Array.from({ length: count }, (_, i) => ({
        tileCount: game.hands[i]?.length ?? 0,
        pipTotal: handPips(game.hands[i] ?? []),
      })),
    buildShared: (): DominoSharedState => ({
      hands: game.hands.map((h) => [...h]),
      boneyard: [...game.boneyard],
      line: game.line,
      deckSeed: game.deckSeed,
    }),
    applySnapshot: (snapshot: RunningSnapshot<DominoSeatState>) => {
      const shared = asDominoShared(snapshot.shared)
      if (!shared) return
      game.loadSnapshot({
        players: snapshot.lineup.map((p, i) => ({
          name: p.name,
          color: p.color,
          hand: shared.hands[i] ?? [],
        })),
        currentPlayerIndex: snapshot.currentPlayerIndex,
        boneyard: shared.boneyard,
        line: shared.line,
        deckSeed: shared.deckSeed,
        ended: snapshot.ended,
        turnCount: snapshot.turnCount,
      })
    },
    // Equal tile counts at an equal turnCount is a strong divergence signal (the
    // net layer also compares currentPlayerIndex + winnerId).
    seatStatesEqual: (positions) =>
      positions.every((s, i) => s.tileCount === (game.hands[i]?.length ?? 0)),
  }

  const match = useOnlineMatch<DominoTurnResolution, DominoSeatState>({
    code,
    role,
    profile,
    channelPrefix: DOMINO_CHANNEL_PREFIX,
    maxPlayers: DOMINO_MAX_PLAYERS,
    game,
    adapter,
    onSeat: setSeat,
    // The set seed rides inside the opaque rules payload (like Snakes' board seed).
    matchRules: () => ({ deckSeed: randomSeed() }),
  })
  useEffect(() => {
    matchRef.current = match
  })

  useUnloadGuard(game.phase !== 'setup' && game.phase !== 'won')
  useRecordMatch('domino', game.phase, game.players, game.winnerId)

  if (game.phase === 'setup') {
    return (
      <WaitingRoom
        code={code}
        role={role}
        status={match.status}
        testMode={match.testMode}
        seats={match.seats}
        myClientId={match.clientId}
        maxPlayers={DOMINO_MAX_PLAYERS}
        rejection={match.myRejection}
        declined={match.declined}
        pendingApproval={match.amPending}
        canStart={match.canStart}
        onSpectate={match.requestSpectate}
        spectatePending={match.amSpectator}
        onStart={match.startMatch}
        onLeave={onLeave}
      />
    )
  }

  const info = game.phase === 'won' ? dominoWinnerInfo(game) : null
  const subtitle =
    game.winReason === 'forfeit'
      ? t('online:subtitleForfeit')
      : info?.isTie
        ? t('tieSubtitle')
        : info && info.winnerPips != null
          ? t('wonBlocked', { pips: info.winnerPips })
          : undefined

  return (
    <>
      <DominoGameScreen
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
      {match.amActingHost && game.phase !== 'won' && match.joinRequests.length > 0 && (
        <JoinRequests
          requests={match.joinRequests}
          canAccept={match.canAdmit}
          onAccept={match.acceptJoiner}
          onReject={match.rejectJoiner}
        />
      )}

      <AnimatePresence>
        {game.choice && !match.amSpectator && (
          <DominoEndChoiceOverlay
            key="choice"
            ends={game.choice.ends}
            leftEnd={game.line.leftEnd}
            rightEnd={game.line.rightEnd}
            onChoose={(end) => void game.chooseEnd(end)}
          />
        )}

        {game.phase === 'won' && info && info.standings.length > 0 && (
          <WinnerOverlay
            key="winner"
            standings={info.standings}
            subtitle={subtitle}
            onPlayAgain={game.winReason === 'forfeit' || match.amSpectator ? undefined : match.restartMatch}
            onSecondary={onLeave}
            secondaryLabel={t('common:actions.leave')}
          />
        )}
      </AnimatePresence>
    </>
  )
}
