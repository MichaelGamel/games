import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useLudo } from '../../../hooks/useLudo'
import { useUnloadGuard } from '../../../hooks/useUnloadGuard'
import { useLeaveConfirm } from '../../../hooks/useLeaveConfirm'
import { useRoom } from '../../../net/useRoom'
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  computeRoster,
  orderMembers,
  type RejectReason,
} from '../../../net/roster'
import type {
  PlayerProfile,
  RoomMember,
  RoomMessage,
  Role,
  RunningSnapshot,
  StartPlayer,
} from '../../../net/types'
import { TOKENS_PER_PLAYER, PROGRESS_BASE } from '../../../ludo/config'
import type { LudoSeatState, LudoTurnResolution } from '../../../ludo/types'
import { LudoGameScreen } from '../LudoGameScreen'
import { ConfirmLeaveDialog } from '../../ConfirmLeaveDialog'
import { WinnerOverlay } from '../../WinnerOverlay'
import { CelebrationOverlay } from '../../CelebrationOverlay'
import { ReactionBar, ReactionLayer, type FloatingReaction } from '../../online/Reactions'
import { JoinRequests, Notices, WaitingRoom } from '../../online/RoomChrome'
import { soundEngine } from '../../../audio/soundEngine'

/** Ludo's transport payloads — the generic net layer is parameterised over these. */
type Msg = RoomMessage<LudoTurnResolution, LudoSeatState>
type Snapshot = RunningSnapshot<LudoSeatState>

interface LudoOnlineRoomProps {
  code: string
  role: Role
  profile: PlayerProfile
  onLeave: () => void
}

/** How often each settled client gossips its game state (see `sync-ping`). */
const SYNC_PING_MS = 4000
/** Minimum spacing between our own `sync-request` broadcasts. */
const SYNC_REQUEST_THROTTLE_MS = 1500
/** How long every other active player must stay gone before the last one wins. */
const FORFEIT_GRACE_MS = 5000
/** How long the current player must stay gone before their turn is skipped. */
const SKIP_GRACE_MS = 4000
/** How long a join/leave/skip notice stays on screen. */
const NOTICE_MS = 4000
/** How long a floating emoji reaction stays on screen. */
const REACTION_MS = 2600
/** Minimum spacing between our own reaction sends (anti-spam). */
const REACTION_THROTTLE_MS = 350
/** Separate channel namespace so Snakes and Ludo never cross-talk on one code. */
const LUDO_CHANNEL_PREFIX = 'lr-room'

const freshTokens = () => Array<number>(TOKENS_PER_PLAYER).fill(PROGRESS_BASE)
const tokensEqual = (a: number[], b: number[] | undefined) =>
  b != null && a.length === b.length && a.every((t, i) => t === b[i])

type SyncPing = Extract<Msg, { event: 'sync-ping' }>
type SyncState = Extract<Msg, { event: 'sync-state' }>

/**
 * One online Ludo match — the Ludo counterpart of `OnlineRoom`. Owns the game
 * controller and the room connection and wires them together: local rolls (after
 * any selection), skips, and decisions are broadcast; incoming messages replay
 * as remote events. The entire self-healing sync, host migration, late-joiner
 * approval, presence skip/forfeit, and lobby chrome are identical to Snakes;
 * only the per-turn resolution and per-seat snapshot payloads differ.
 */
export function LudoOnlineRoom({ code, role, profile, onLeave }: LudoOnlineRoomProps) {
  // Mid-match Leave goes through a sad-face confirmation so an accidental tap
  // never abandons a running game.
  const { confirming, requestLeave, cancelLeave, confirmLeave } = useLeaveConfirm(onLeave)
  const [seat, setSeat] = useState<number | null>(null)
  const [startedPlayers, setStartedPlayers] = useState<StartPlayer[] | null>(null)
  const startedRef = useRef<StartPlayer[] | null>(null)
  const sendRef = useRef<((m: Msg) => void) | null>(null)
  const handleMessageRef = useRef<(m: Msg) => void>(() => {})
  const [declinedIds, setDeclinedIds] = useState<ReadonlySet<string>>(() => new Set())
  const [declined, setDeclined] = useState(false)
  const matchIdRef = useRef(0)
  const lastSyncRequestAtRef = useRef(0)
  const requestSyncRef = useRef<() => void>(() => {})

  const game = useLudo({
    controlsPlayer: seat ?? -1,
    hooks: {
      onLocalTurn: (resolution, seq) =>
        sendRef.current?.({ event: 'turn', resolution, seq, matchId: matchIdRef.current }),
      onLocalDecision: (decision, seq) =>
        sendRef.current?.({ event: 'decide', decision, seq, matchId: matchIdRef.current }),
      onOutOfSync: () => requestSyncRef.current(),
    },
  })

  const room = useRoom<LudoTurnResolution, LudoSeatState>({
    code,
    role,
    profile,
    channelPrefix: LUDO_CHANNEL_PREFIX,
    onMessage: (msg) => handleMessageRef.current(msg),
  })
  sendRef.current = room.send
  const myClientId = room.clientId

  useUnloadGuard(game.phase !== 'setup' && game.phase !== 'won')

  // Lock in a started match: find our seat, remember the lineup, flag presence.
  const applyStart = (players: StartPlayer[], matchId: number) => {
    matchIdRef.current = matchId
    startedRef.current = players
    setStartedPlayers(players)
    const mySeat = players.findIndex((p) => p.clientId === myClientId)
    setSeat(mySeat >= 0 ? mySeat : null)
    room.setInGame(true)
    game.applyRemoteStart(players.map(({ name, color }) => ({ name, color })))
  }

  // Replace our whole view of the match with an authoritative snapshot.
  const adoptSnapshot = (snapshot: Snapshot) => {
    matchIdRef.current = snapshot.matchId
    startedRef.current = snapshot.lineup
    setStartedPlayers(snapshot.lineup)
    const mySeat = snapshot.lineup.findIndex((p) => p.clientId === myClientId)
    setSeat(mySeat >= 0 ? mySeat : null)
    room.setInGame(true)
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
    })
  }

  /** Capture this client's settled game as an authoritative snapshot. */
  const buildSnapshot = (lineup: StartPlayer[]): Snapshot => ({
    lineup,
    positions: lineup.map((_, i) => ({
      tokens: game.players[i] ? [...game.players[i].tokens] : freshTokens(),
      consecutiveSixes: i === game.currentPlayerIndex ? game.consecutiveSixes : 0,
    })),
    currentPlayerIndex: game.currentPlayerIndex,
    lastRoll: game.lastRoll,
    finishedOrder: game.finishedOrder,
    awaitingDecision: game.phase === 'celebrating',
    ended: game.phase === 'won',
    turnCount: game.turnCount,
    matchId: matchIdRef.current,
  })

  /** Settled phases: nothing is animating or queued, the state is final. */
  const isSettledPhase =
    game.phase === 'idle' || game.phase === 'celebrating' || game.phase === 'won'

  const applyAddPlayer = (newPlayer: StartPlayer, snapshot: Snapshot) => {
    if (newPlayer.clientId === myClientId) {
      adoptSnapshot(snapshot)
      return
    }
    const current = startedRef.current
    if (!current || current.some((p) => p.clientId === newPlayer.clientId)) return
    const next = [...current, newPlayer]
    startedRef.current = next
    setStartedPlayers(next)
    game.addPlayer({ name: newPlayer.name, color: newPlayer.color })
  }

  // ---- Self-healing sync (no server, fire-and-forget broadcasts) ----------

  const requestSync = () => {
    const now = Date.now()
    if (now - lastSyncRequestAtRef.current < SYNC_REQUEST_THROTTLE_MS) return
    lastSyncRequestAtRef.current = now
    sendRef.current?.({ event: 'sync-request', clientId: myClientId })
  }

  const sendStateTo = (toClientId: string) => {
    const lineup = startedRef.current
    if (!lineup?.some((p) => p.clientId === toClientId)) return
    if (!isSettledPhase) return
    if (game.syncStatus().busy) return
    room.send({
      event: 'sync-state',
      toClientId,
      fromHost: role === 'host',
      snapshot: buildSnapshot(lineup),
    })
  }

  const pingMatchesLocal = (msg: SyncPing) =>
    msg.currentPlayerIndex === game.currentPlayerIndex &&
    msg.winnerId === game.winnerId &&
    msg.positions.length === game.players.length &&
    msg.positions.every((s, i) => tokensEqual(s.tokens, game.players[i].tokens))

  const handleSyncPing = (msg: SyncPing) => {
    if (msg.clientId === myClientId) return
    if (!startedRef.current) {
      requestSync()
      return
    }
    if (msg.matchId > matchIdRef.current) return requestSync()
    if (msg.matchId < matchIdRef.current) return sendStateTo(msg.clientId)

    const { seq, busy } = game.syncStatus()
    if (msg.seq > seq) return requestSync()
    if (busy) return
    if (msg.seq < seq) return sendStateTo(msg.clientId)

    if (pingMatchesLocal(msg)) return
    if (msg.role === 'host' && role !== 'host') requestSync()
    else if (role === 'host') sendStateTo(msg.clientId)
  }

  const handleSyncState = (msg: SyncState) => {
    if (msg.toClientId !== myClientId) return
    const { snapshot } = msg
    const { seq, busy } = game.syncStatus()
    const ahead =
      snapshot.matchId > matchIdRef.current ||
      (snapshot.matchId === matchIdRef.current && snapshot.turnCount > seq)
    const hostFix =
      msg.fromHost &&
      role !== 'host' &&
      !busy &&
      snapshot.matchId === matchIdRef.current &&
      snapshot.turnCount === seq &&
      (snapshot.currentPlayerIndex !== game.currentPlayerIndex ||
        snapshot.finishedOrder.join() !== game.finishedOrder.join() ||
        snapshot.positions.length !== game.players.length ||
        snapshot.positions.some((s, i) => !tokensEqual(s.tokens, game.players[i]?.tokens)))
    if (ahead || hostFix) adoptSnapshot(snapshot)
  }

  // ---- Emoji reactions (cosmetic; never touch game state or the seq) -------

  const [reactions, setReactions] = useState<FloatingReaction[]>([])
  const reactionIdRef = useRef(0)
  const lastReactionAtRef = useRef(0)

  const addFloating = useCallback((emoji: string, name: string, color: string) => {
    const id = `react-${++reactionIdRef.current}`
    const left = 12 + Math.random() * 76
    setReactions((prev) => [...prev, { id, emoji, name, color, left }])
    soundEngine.playReaction()
    setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), REACTION_MS)
  }, [])

  const sendReaction = useCallback(
    (emoji: string) => {
      const now = Date.now()
      if (now - lastReactionAtRef.current < REACTION_THROTTLE_MS) return
      lastReactionAtRef.current = now
      sendRef.current?.({ event: 'reaction', clientId: myClientId, emoji })
      addFloating(emoji, profile.name, profile.color)
    },
    [addFloating, myClientId, profile.name, profile.color],
  )

  handleMessageRef.current = (msg: Msg) => {
    if (msg.event === 'start') applyStart(msg.players, msg.matchId)
    else if (msg.event === 'turn') {
      if (msg.matchId === matchIdRef.current) game.applyRemoteTurn(msg.resolution, msg.seq)
      else if (msg.matchId > matchIdRef.current) requestSync()
    } else if (msg.event === 'skip-turn') {
      if (msg.matchId === matchIdRef.current) game.applySkip(msg.seq)
      else if (msg.matchId > matchIdRef.current) requestSync()
    } else if (msg.event === 'decide') {
      if (msg.matchId === matchIdRef.current) game.applyRemoteDecision(msg.decision, msg.seq)
      else if (msg.matchId > matchIdRef.current) requestSync()
    } else if (msg.event === 'reset') game.applyRemoteReset()
    else if (msg.event === 'add-player') applyAddPlayer(msg.player, msg.snapshot)
    else if (msg.event === 'reject-join' && msg.clientId === myClientId) setDeclined(true)
    else if (msg.event === 'sync-ping') handleSyncPing(msg)
    else if (msg.event === 'sync-request' && msg.clientId !== myClientId) sendStateTo(msg.clientId)
    else if (msg.event === 'sync-state') handleSyncState(msg)
    else if (msg.event === 'reaction') {
      const sender = room.members.find((m) => m.clientId === msg.clientId)
      addFloating(msg.emoji, sender?.name ?? 'Someone', sender?.color ?? '#a855f7')
    }
  }

  // Heartbeat: gossip our settled state so dropped messages self-repair.
  const pingRef = useRef<() => void>(() => {})
  const ping = () => {
    if (room.status !== 'connected' || !startedRef.current) return
    if (!isSettledPhase) return
    const { seq, busy } = game.syncStatus()
    if (busy) return
    room.send({
      event: 'sync-ping',
      clientId: myClientId,
      role,
      matchId: matchIdRef.current,
      seq,
      currentPlayerIndex: game.currentPlayerIndex,
      positions: game.players.map((p, i) => ({
        tokens: [...p.tokens],
        consecutiveSixes: i === game.currentPlayerIndex ? game.consecutiveSixes : 0,
      })),
      winnerId: game.winnerId,
    })
  }

  useEffect(() => {
    requestSyncRef.current = requestSync
    pingRef.current = ping
  })

  useEffect(() => {
    const tick = () => pingRef.current()
    const interval = setInterval(tick, SYNC_PING_MS)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const { seats, pending, rejected } = useMemo(() => computeRoster(room.members), [room.members])
  const myReason: RejectReason | null = rejected.get(myClientId) ?? null
  const amPending = pending.some((p) => p.clientId === myClientId)

  // Acting host: the lowest-seated player still connected (host keeps seat 0 while
  // present), so the room never stalls if the host leaves mid-match.
  const actingHostClientId = useMemo(() => {
    if (!startedPlayers) return null
    const here = new Set(room.members.map((m) => m.clientId))
    here.add(myClientId)
    return startedPlayers.find((p) => here.has(p.clientId))?.clientId ?? null
  }, [startedPlayers, room.members, myClientId])
  const amActingHost = actingHostClientId === myClientId

  const joinRequests = useMemo<RoomMember[]>(() => {
    if (!amActingHost || game.phase === 'setup') return []
    const openSeats = MAX_PLAYERS - game.players.length
    if (openSeats <= 0) return []
    const lineupIds = new Set((startedPlayers ?? []).map((p) => p.clientId))
    const lineupNames = new Set(game.players.map((p) => p.name.trim().toLowerCase()))
    const lineupColors = new Set(game.players.map((p) => p.color))
    return orderMembers(room.members)
      .filter(
        (m) =>
          m.clientId !== myClientId &&
          !lineupIds.has(m.clientId) &&
          !declinedIds.has(m.clientId) &&
          !lineupNames.has(m.name.trim().toLowerCase()) &&
          !lineupColors.has(m.color),
      )
      .slice(0, openSeats)
  }, [amActingHost, game.phase, game.players, startedPlayers, room.members, declinedIds, myClientId])

  // Host: broadcast the authoritative lineup, then everyone applies it.
  const startMatch = () => {
    const players: StartPlayer[] = seats.map((m) => ({
      clientId: m.clientId,
      name: m.name,
      color: m.color,
    }))
    const matchId = matchIdRef.current + 1
    applyStart(players, matchId)
    room.send({ event: 'start', players, matchId })
  }

  const restartMatch = () => {
    const players = startedRef.current
    if (!players) return
    const matchId = matchIdRef.current + 1
    applyStart(players, matchId)
    room.send({ event: 'start', players, matchId })
  }

  const canAdmit = game.phase === 'idle' && game.players.length < MAX_PLAYERS
  const acceptJoiner = (member: RoomMember) => {
    const current = startedRef.current
    if (!current || !canAdmit) return
    if (current.some((p) => p.clientId === member.clientId)) return
    const newPlayer: StartPlayer = {
      clientId: member.clientId,
      name: member.name,
      color: member.color,
    }
    const snapshot = buildSnapshot([...current, newPlayer])
    applyAddPlayer(newPlayer, snapshot)
    room.send({ event: 'add-player', player: newPlayer, snapshot })
  }

  const rejectJoiner = (member: RoomMember) => {
    setDeclinedIds((prev) => new Set(prev).add(member.clientId))
    room.send({ event: 'reject-join', clientId: member.clientId })
  }

  const canStart = role === 'host' && game.phase === 'setup' && seats.length >= MIN_PLAYERS

  // ---- Presence: who is still here, and can the match keep going? --------

  const rosterIds = useMemo(() => new Set(room.members.map((m) => m.clientId)), [room.members])
  const present = (clientId: string) => clientId === myClientId || rosterIds.has(clientId)

  const lineup = startedPlayers ?? []
  const everyonePresent = startedPlayers ? lineup.every((p) => present(p.clientId)) : false

  const activeSeatIdxs = lineup.map((_, i) => i).filter((i) => !game.finishedOrder.includes(i))
  const presentActiveCount = activeSeatIdxs.filter((i) => present(lineup[i].clientId)).length
  const canPlay = presentActiveCount >= 2

  const currentClientId = lineup[game.currentPlayerIndex]?.clientId
  const currentPlayerAbsent = currentClientId != null && !present(currentClientId)
  const skipResponderSeat = (() => {
    for (let step = 1; step <= lineup.length; step++) {
      const i = (game.currentPlayerIndex + step) % lineup.length
      if (present(lineup[i].clientId)) return i
    }
    return null
  })()
  const shouldInitiateSkip =
    game.phase === 'idle' &&
    room.status === 'connected' &&
    currentPlayerAbsent &&
    canPlay &&
    seat != null &&
    skipResponderSeat === seat

  const trySkipRef = useRef<() => void>(() => {})
  const trySkip = () => {
    if (game.phase !== 'idle') return
    const cur = startedRef.current?.[game.currentPlayerIndex]
    if (!cur || present(cur.clientId)) return
    const { seq, busy } = game.syncStatus()
    if (busy) return
    room.send({ event: 'skip-turn', seq: seq + 1, matchId: matchIdRef.current })
    game.applySkip(seq + 1)
  }
  useEffect(() => {
    trySkipRef.current = trySkip
  })

  useEffect(() => {
    if (!shouldInitiateSkip) return
    const timer = setTimeout(() => trySkipRef.current(), SKIP_GRACE_MS)
    return () => clearTimeout(timer)
  }, [shouldInitiateSkip, game.currentPlayerIndex, game.turnCount])

  const soleActiveSeat =
    game.phase !== 'setup' &&
    game.phase !== 'won' &&
    room.status === 'connected' &&
    startedPlayers != null &&
    activeSeatIdxs.length > 1 &&
    presentActiveCount === 1
      ? (activeSeatIdxs.find((i) => present(lineup[i].clientId)) ?? null)
      : null

  const { forfeitWin } = game
  useEffect(() => {
    if (soleActiveSeat == null) return
    const timer = setTimeout(() => forfeitWin(soleActiveSeat), FORFEIT_GRACE_MS)
    return () => clearTimeout(timer)
  }, [soleActiveSeat, forfeitWin])

  // ---- Lightweight notices ("X left", "X is back", "turn skipped") --------

  const [notices, setNotices] = useState<{ id: number; text: string }[]>([])
  const noticeIdRef = useRef(0)
  const pushNotice = useCallback((text: string) => {
    const id = ++noticeIdRef.current
    setNotices((prev) => [...prev, { id, text }])
    setTimeout(() => setNotices((prev) => prev.filter((n) => n.id !== id)), NOTICE_MS)
  }, [])

  const prevPresentRef = useRef<Map<string, boolean> | null>(null)
  useEffect(() => {
    if (!startedPlayers || game.phase === 'setup' || game.phase === 'won') {
      prevPresentRef.current = null
      return
    }
    const now = new Map(
      startedPlayers.map((p) => [p.clientId, p.clientId === myClientId || rosterIds.has(p.clientId)]),
    )
    const prev = prevPresentRef.current
    prevPresentRef.current = now
    if (!prev) return
    for (const p of startedPlayers) {
      if (p.clientId === myClientId || !prev.has(p.clientId)) continue
      const was = prev.get(p.clientId)!
      const is = now.get(p.clientId)!
      if (was && !is) pushNotice(`🚪 ${p.name} left the game`)
      else if (!was && is) pushNotice(`👋 ${p.name} is back`)
    }
  }, [rosterIds, startedPlayers, myClientId, game.phase, pushNotice])

  const lastSkipNonceRef = useRef(0)
  useEffect(() => {
    const f = game.skipFlash
    if (!f || f.nonce === lastSkipNonceRef.current) return
    lastSkipNonceRef.current = f.nonce
    const name = game.players[f.playerId]?.name ?? 'Player'
    pushNotice(`⏭️ ${name} is away — turn skipped`)
  }, [game.skipFlash, game.players, pushNotice])

  // Host hand-off announcement (skipped when only one active player is left —
  // that is a forfeit win, not a hand-off).
  const prevActingHostRef = useRef<string | null>(null)
  useEffect(() => {
    const prev = prevActingHostRef.current
    prevActingHostRef.current = actingHostClientId
    if (!startedPlayers || game.phase === 'setup' || game.phase === 'won') return
    if (prev == null || actingHostClientId == null || prev === actingHostClientId) return
    if (presentActiveCount < 2) return
    const name = startedPlayers.find((p) => p.clientId === actingHostClientId)?.name ?? 'A player'
    pushNotice(`👑 ${name} is now the host`)
  }, [actingHostClientId, startedPlayers, game.phase, presentActiveCount, pushNotice])

  if (game.phase === 'setup') {
    return (
      <WaitingRoom
        code={code}
        role={role}
        status={room.status}
        testMode={room.testMode}
        seats={seats}
        myClientId={myClientId}
        rejection={myReason}
        declined={declined}
        pendingApproval={amPending}
        canStart={canStart}
        onStart={startMatch}
        onLeave={onLeave}
      />
    )
  }

  const lastFinisher =
    game.finishedOrder.length > 0
      ? (game.players[game.finishedOrder[game.finishedOrder.length - 1]] ?? null)
      : null
  const actingHostName =
    lineup.find((p) => p.clientId === actingHostClientId)?.name ??
    game.players[0]?.name ??
    'the host'

  return (
    <>
      <LudoGameScreen
        game={game}
        online={{
          roomCode: code,
          everyonePresent,
          canPlay,
          testMode: room.testMode,
          onLeave: requestLeave,
        }}
      />
      <ConfirmLeaveDialog open={confirming} onConfirm={confirmLeave} onCancel={cancelLeave} />
      <Notices notices={notices} />
      <ReactionLayer reactions={reactions} />
      <ReactionBar onReact={sendReaction} />
      {amActingHost && game.phase !== 'won' && joinRequests.length > 0 && (
        <JoinRequests
          requests={joinRequests}
          canAccept={canAdmit}
          onAccept={acceptJoiner}
          onReject={rejectJoiner}
        />
      )}
      <AnimatePresence>
        {game.phase === 'celebrating' && lastFinisher && (
          <CelebrationOverlay
            key={`celebrate-${game.finishedOrder.length}`}
            player={lastFinisher}
            rank={game.finishedOrder.length - 1}
            canDecide={amActingHost}
            waitingFor={actingHostName}
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
            onPlayAgain={game.winReason === 'forfeit' ? undefined : restartMatch}
            onSecondary={onLeave}
            secondaryLabel="Leave"
          />
        )}
      </AnimatePresence>
    </>
  )
}
