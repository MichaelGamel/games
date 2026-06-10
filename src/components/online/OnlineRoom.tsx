import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useSnakesAndLadders } from '../../hooks/useSnakesAndLadders'
import { useRoom } from '../../net/useRoom'
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  computeRoster,
  orderMembers,
  reasonText,
  type RejectReason,
} from '../../net/roster'
import type {
  PlayerProfile,
  RoomMember,
  RoomMessage,
  RoomStatus,
  Role,
  RunningSnapshot,
  StartPlayer,
} from '../../net/types'
import { GameScreen } from '../GameScreen'
import { WinnerOverlay } from '../WinnerOverlay'
import { CelebrationOverlay } from '../CelebrationOverlay'
import { cn } from '../../lib/cn'

interface OnlineRoomProps {
  code: string
  role: Role
  profile: PlayerProfile
  onLeave: () => void
}

/** How often each settled client gossips its game state (see `sync-ping`). */
const SYNC_PING_MS = 4000
/** Minimum spacing between our own `sync-request` broadcasts. */
const SYNC_REQUEST_THROTTLE_MS = 1500
/** How long every other active player must stay gone before the last one wins.
 *  Absorbs brief presence flickers while someone's connection re-establishes. */
const FORFEIT_GRACE_MS = 5000
/** How long the current player must stay gone before their turn is skipped. */
const SKIP_GRACE_MS = 4000
/** How long a join/leave/skip notice stays on screen. */
const NOTICE_MS = 4000

type SyncPing = Extract<RoomMessage, { event: 'sync-ping' }>
type SyncState = Extract<RoomMessage, { event: 'sync-state' }>

/**
 * One online match. Owns both the game controller and the room connection and
 * wires them together: local rolls/starts are broadcast; incoming messages are
 * applied as remote turns/starts. The host chooses when to start (so players can
 * keep joining up to {@link MAX_PLAYERS}); every client locates its own seat in
 * the authoritative start payload by clientId.
 */
export function OnlineRoom({ code, role, profile, onLeave }: OnlineRoomProps) {
  // This client's seat (player index). Unknown until the match starts.
  const [seat, setSeat] = useState<number | null>(null)
  const [startedPlayers, setStartedPlayers] = useState<StartPlayer[] | null>(null)
  const startedRef = useRef<StartPlayer[] | null>(null)
  const sendRef = useRef<((m: RoomMessage) => void) | null>(null)
  const handleMessageRef = useRef<(m: RoomMessage) => void>(() => {})
  // Host-only: late joiners we have already turned down, so they drop out of the
  // request prompt even though they stay connected.
  const [declinedIds, setDeclinedIds] = useState<ReadonlySet<string>>(() => new Set())
  // Late joiner: the host declined our request to join the running match.
  const [declined, setDeclined] = useState(false)
  // Which start/restart generation we are on; stamped on turns so a stale or
  // missed `start` is detectable.
  const matchIdRef = useRef(0)
  const lastSyncRequestAtRef = useRef(0)
  const requestSyncRef = useRef<() => void>(() => {})

  const game = useSnakesAndLadders({
    controlsPlayer: seat ?? -1,
    hooks: {
      onLocalTurn: (resolution, seq) =>
        sendRef.current?.({ event: 'turn', resolution, seq, matchId: matchIdRef.current }),
      onLocalDecision: (decision, seq) =>
        sendRef.current?.({ event: 'decide', decision, seq, matchId: matchIdRef.current }),
      onOutOfSync: () => requestSyncRef.current(),
    },
  })

  const room = useRoom({
    code,
    role,
    profile,
    onMessage: (msg) => handleMessageRef.current(msg),
  })
  sendRef.current = room.send
  const myClientId = room.clientId

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

  // Replace our whole view of the match with an authoritative snapshot. Used by
  // an approved late joiner (it never saw `start`) and by any client recovering
  // from a missed message.
  const adoptSnapshot = (snapshot: RunningSnapshot) => {
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
        position: snapshot.positions[i] ?? 0,
      })),
      currentPlayerIndex: snapshot.currentPlayerIndex,
      lastRoll: snapshot.lastRoll,
      finishedOrder: snapshot.finishedOrder,
      awaitingDecision: snapshot.awaitingDecision,
      ended: snapshot.ended,
      turnCount: snapshot.turnCount,
    })
  }

  /** Capture this client's settled game as an authoritative snapshot. */
  const buildSnapshot = (lineup: StartPlayer[]): RunningSnapshot => ({
    lineup,
    positions: lineup.map((_, i) => game.players[i]?.position ?? 0),
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

  // Apply a host-approved late joiner. The approved client itself rebuilds the
  // whole match from the snapshot; everyone else simply appends the newcomer to
  // their lineup. Idempotent against duplicate delivery.
  const applyAddPlayer = (newPlayer: StartPlayer, snapshot: RunningSnapshot) => {
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

  // Answer a lagging client with our settled state. Only seated players get
  // answers — a pending late joiner must wait for the host's approval.
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
    msg.positions.every((pos, i) => pos === game.players[i].position)

  const handleSyncPing = (msg: SyncPing) => {
    if (msg.clientId === myClientId) return
    if (!startedRef.current) {
      // A match is running that we have no state for — we most likely missed
      // `start`. If we're actually seated, someone will answer; pending late
      // joiners are filtered out by sendStateTo's lineup check.
      requestSync()
      return
    }
    if (msg.matchId > matchIdRef.current) return requestSync()
    if (msg.matchId < matchIdRef.current) return sendStateTo(msg.clientId)

    const { seq, busy } = game.syncStatus()
    if (msg.seq > seq) return requestSync()
    if (busy) return // compare settled states only; the next ping catches up
    if (msg.seq < seq) return sendStateTo(msg.clientId)

    // Same match, same turn count, both settled — states must agree. If they
    // diverged anyway (e.g. a late-join applied mid-animation), the host wins.
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
    // Host tie-break: same turn count but our states diverged.
    const hostFix =
      msg.fromHost &&
      role !== 'host' &&
      !busy &&
      snapshot.matchId === matchIdRef.current &&
      snapshot.turnCount === seq &&
      (snapshot.currentPlayerIndex !== game.currentPlayerIndex ||
        snapshot.finishedOrder.join() !== game.finishedOrder.join() ||
        snapshot.positions.length !== game.players.length ||
        snapshot.positions.some((pos, i) => pos !== game.players[i]?.position))
    if (ahead || hostFix) adoptSnapshot(snapshot)
  }

  handleMessageRef.current = (msg: RoomMessage) => {
    if (msg.event === 'start') applyStart(msg.players, msg.matchId)
    else if (msg.event === 'turn') {
      if (msg.matchId === matchIdRef.current) game.applyRemoteTurn(msg.resolution, msg.seq)
      else if (msg.matchId > matchIdRef.current) requestSync()
      // Turns from an older match are stale: drop them.
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
  }

  // Heartbeat: gossip our settled state so dropped messages are detected and
  // repaired within seconds. Also fires when the tab becomes visible again —
  // background tabs are exactly where broadcasts get lost.
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
      positions: game.players.map((p) => p.position),
      winnerId: game.winnerId,
    })
  }

  // Keep the async entry points (interval ticks, net hook callbacks) pointed
  // at this render's closures.
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

  // The joiner's own status (pending / full / name-or-color clash) is derived
  // from presence: a late joiner reliably sees the seated players' `inGame`
  // flag, so computeRoster tells them whether they fit, collide, or must wait.
  const { seats, pending, rejected } = useMemo(() => computeRoster(room.members), [room.members])
  const myReason: RejectReason | null = rejected.get(myClientId) ?? null
  const amPending = pending.some((p) => p.clientId === myClientId)

  // Host: which late joiners to prompt about. We derive this from the host's own
  // authoritative game state (game.players / startedPlayers) rather than the
  // aggregated `inGame` presence flag — a client doesn't reliably read its own
  // `inGame` back, so presence alone would hide the running match from the host.
  // A request is anyone connected who isn't seated, isn't declined, and doesn't
  // clash with a seated name/color; we surface only as many as there are seats.
  const joinRequests = useMemo<RoomMember[]>(() => {
    if (role !== 'host' || game.phase === 'setup') return []
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
  }, [role, game.phase, game.players, startedPlayers, room.members, declinedIds, myClientId])

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

  // Play Again: replay the same lineup (idempotent — any player may trigger it).
  const restartMatch = () => {
    const players = startedRef.current
    if (!players) return
    const matchId = matchIdRef.current + 1
    applyStart(players, matchId)
    room.send({ event: 'start', players, matchId })
  }

  // Host: admit a late joiner into the live match. Only between turns (so the
  // newcomer can't miss an in-flight roll) and only while a seat is open.
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

  // Host: turn a late joiner away (they return to the lobby).
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

  // Seats still racing (finished players keep their seats but leave the
  // rotation, and their presence no longer gates the match).
  const activeSeatIdxs = lineup
    .map((_, i) => i)
    .filter((i) => !game.finishedOrder.includes(i))
  const presentActiveCount = activeSeatIdxs.filter((i) => present(lineup[i].clientId)).length
  // With two connected active players the game can always go on — absent
  // players' turns get skipped and they resync when they come back.
  const canPlay = presentActiveCount >= 2

  // Skip the current player's turn when they have left the room. To avoid a
  // thundering herd, only the first connected seat after theirs broadcasts the
  // skip (duplicates are dropped by the sequence number anyway).
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
    // Re-validate against fresh state when the grace timer fires.
    if (game.phase !== 'idle') return
    const cur = startedRef.current?.[game.currentPlayerIndex]
    if (!cur || present(cur.clientId)) return
    const { seq, busy } = game.syncStatus()
    if (busy) return
    room.send({ event: 'skip-turn', seq: seq + 1, matchId: matchIdRef.current })
    game.applySkip(seq + 1)
  }
  // The grace timer must run this render's closure when it eventually fires.
  useEffect(() => {
    trySkipRef.current = trySkip
  })

  useEffect(() => {
    if (!shouldInitiateSkip) return
    const timer = setTimeout(() => trySkipRef.current(), SKIP_GRACE_MS)
    return () => clearTimeout(timer)
    // Re-arm per turn so chained skips (several absent players in a row) work.
  }, [shouldInitiateSkip, game.currentPlayerIndex, game.turnCount])

  // Last racer standing: every other ACTIVE player has left (and stays gone
  // for the grace period) — the remaining active player takes the last podium
  // spot and the match ends. Every connected client applies this locally, so
  // finished players who are still watching see the same ending.
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

  // Announce seated players leaving/returning while the match is live. Only
  // players present in the *previous* roster snapshot are compared, so a
  // freshly admitted late joiner doesn't trigger a bogus "is back".
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

  // Surface each applied skip (local or remote) as a notice.
  const lastSkipNonceRef = useRef(0)
  useEffect(() => {
    const f = game.skipFlash
    if (!f || f.nonce === lastSkipNonceRef.current) return
    lastSkipNonceRef.current = f.nonce
    const name = game.players[f.playerId]?.name ?? 'Player'
    pushNotice(`⏭️ ${name} is away — turn skipped`)
  }, [game.skipFlash, game.players, pushNotice])

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
  const hostPresent = room.members.some((m) => m.role === 'host')
  const hostName = game.players[0]?.name ?? 'the host'

  return (
    <>
      <GameScreen
        game={game}
        online={{
          roomCode: code,
          everyonePresent,
          canPlay,
          testMode: room.testMode,
          onLeave,
        }}
      />
      <Notices notices={notices} />
      {role === 'host' && game.phase !== 'won' && joinRequests.length > 0 && (
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
            // The host decides whether to play on — unless they left, in which
            // case anyone may (duplicate decisions dedupe by sequence number).
            canDecide={role === 'host' || !hostPresent}
            waitingFor={hostName}
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
            onPlayAgain={game.winReason === 'forfeit' ? undefined : restartMatch}
            onSecondary={onLeave}
            secondaryLabel="Leave"
          />
        )}
      </AnimatePresence>
    </>
  )
}

/** Transient join/leave/skip announcements, stacked top-center. */
function Notices({ notices }: { notices: { id: number; text: string }[] }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-40 flex flex-col items-center gap-1.5 px-4">
      <AnimatePresence>
        {notices.map((n) => (
          <motion.p
            key={n.id}
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="rounded-full bg-night-800/95 px-4 py-2 text-sm font-semibold text-white shadow-lg ring-1 ring-white/15 backdrop-blur"
            role="status"
          >
            {n.text}
          </motion.p>
        ))}
      </AnimatePresence>
    </div>
  )
}

interface JoinRequestsProps {
  requests: RoomMember[]
  canAccept: boolean
  onAccept: (m: RoomMember) => void
  onReject: (m: RoomMember) => void
}

/** Host-only prompt: incoming requests to join the live match. */
function JoinRequests({ requests, canAccept, onAccept, onReject }: JoinRequestsProps) {
  return (
    <div className="fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {requests.map((m) => (
          <motion.div
            key={m.clientId}
            initial={{ opacity: 0, y: -24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -24, scale: 0.96 }}
            className="w-full max-w-sm rounded-2xl bg-night-800/95 p-4 shadow-xl ring-1 ring-white/15 backdrop-blur"
            role="alert"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-white/45">
              Wants to join
            </p>
            <div className="mt-2 flex items-center gap-3">
              <span
                className="h-7 w-7 shrink-0 rounded-full ring-2 ring-white/40"
                style={{ background: m.color }}
                aria-hidden="true"
              />
              <span className="flex-1 truncate text-base font-semibold text-white">{m.name}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => onAccept(m)}
                disabled={!canAccept}
                className={cn(
                  'flex-1 rounded-lg bg-linear-to-r from-emerald-500 to-emerald-400 px-4 py-2 text-sm font-bold text-white shadow ring-1 ring-white/20 transition',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
                  canAccept ? 'hover:brightness-110' : 'cursor-not-allowed opacity-50',
                )}
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => onReject(m)}
                className="flex-1 rounded-lg bg-white/10 px-4 py-2 text-sm font-bold text-white/80 ring-1 ring-white/15 transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Reject
              </button>
            </div>
            {!canAccept && (
              <p className="mt-2 text-center text-xs text-white/45">
                You can let players in between turns.
              </p>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

interface WaitingRoomProps {
  code: string
  role: Role
  status: RoomStatus
  testMode: boolean
  seats: RoomMember[]
  myClientId: string
  rejection: RejectReason | null
  /** Host declined our request to join the running match. */
  declined: boolean
  /** A match is already running and we are waiting for the host to let us in. */
  pendingApproval: boolean
  canStart: boolean
  onStart: () => void
  onLeave: () => void
}

function WaitingRoom({
  code,
  role,
  status,
  testMode,
  seats,
  myClientId,
  rejection,
  declined,
  pendingApproval,
  canStart,
  onStart,
  onLeave,
}: WaitingRoomProps) {
  const copyCode = () => {
    navigator.clipboard?.writeText(code).catch(() => {})
  }

  return (
    <motion.div
      key="waiting"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10"
    >
      <button
        type="button"
        onClick={onLeave}
        className="absolute left-4 top-4 rounded-lg px-3 py-1.5 text-sm text-white/70 ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        ← Leave
      </button>

      <div className="w-full max-w-md rounded-2xl bg-white/5 p-8 text-center ring-1 ring-white/10 backdrop-blur">
        {status === 'error' ? (
          <>
            <p className="text-2xl">⚠️</p>
            <h2 className="mt-3 text-xl font-bold text-white">Couldn't connect</h2>
            <p className="mt-2 text-sm text-white/60">
              Online play isn't configured. Add your Supabase keys and redeploy, or run locally in
              dev test mode.
            </p>
          </>
        ) : declined ? (
          <DeclinedCard onBack={onLeave} />
        ) : rejection ? (
          <RejectionCard reason={rejection} onBack={onLeave} />
        ) : pendingApproval ? (
          <PendingCard onCancel={onLeave} />
        ) : (
          <>
            {role === 'host' ? (
              <>
                <h2 className="text-xl font-bold text-white">Share this code</h2>
                <p className="mt-1 text-sm text-white/60">
                  Friends enter it on the “Join room” screen.
                </p>
                <button
                  type="button"
                  onClick={copyCode}
                  className="mx-auto mt-4 flex items-center gap-3 rounded-xl bg-night-900/60 px-6 py-3 font-mono text-4xl tracking-[0.3em] text-white ring-1 ring-white/15 transition hover:bg-night-900/80"
                  aria-label={`Room code ${code}, click to copy`}
                >
                  {code}
                  <span className="text-base" aria-hidden="true">
                    📋
                  </span>
                </button>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold text-white">Joined room</h2>
                <p className="mt-2 font-mono text-3xl tracking-[0.3em] text-white">{code}</p>
              </>
            )}

            <Roster seats={seats} myClientId={myClientId} />

            {role === 'host' ? (
              <motion.button
                type="button"
                onClick={onStart}
                disabled={!canStart}
                whileHover={canStart ? { scale: 1.03 } : undefined}
                whileTap={canStart ? { scale: 0.97 } : undefined}
                className={cn(
                  'mt-5 w-full rounded-xl bg-linear-to-r from-grape to-grape-light px-6 py-3 text-lg font-bold text-white shadow-lg ring-1 ring-white/20 transition',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
                  !canStart && 'cursor-not-allowed opacity-50',
                )}
              >
                {canStart ? 'Start Game ▶' : `Waiting for players… (need ${MIN_PLAYERS}+)`}
              </motion.button>
            ) : (
              <p className="mt-5 text-sm text-white/70">Waiting for the host to start…</p>
            )}

            {testMode && (
              <p className="mt-4 rounded-lg bg-white/5 px-3 py-2 text-xs text-white/45">
                Test mode: works across tabs in this browser only. Add Supabase keys for real
                cross-computer play.
              </p>
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}

function Roster({ seats, myClientId }: { seats: RoomMember[]; myClientId: string }) {
  return (
    <div className="mt-6">
      <p className="mb-2 text-xs uppercase tracking-wide text-white/45">
        Players {seats.length}/{MAX_PLAYERS}
      </p>
      <ul className="flex flex-col gap-2" aria-label="Players in room">
        {seats.map((m) => (
          <li
            key={m.clientId}
            className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10"
          >
            <span
              className="h-5 w-5 shrink-0 rounded-full ring-2 ring-white/40"
              style={{ background: m.color }}
              aria-hidden="true"
            />
            <span className="truncate text-sm font-semibold text-white">
              {m.name}
              {m.clientId === myClientId && (
                <span className="ml-1 text-xs font-normal text-white/50">(you)</span>
              )}
              {m.role === 'host' && (
                <span className="ml-1 text-xs font-normal text-amber-300/80">host</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function RejectionCard({ reason, onBack }: { reason: RejectReason; onBack: () => void }) {
  const { title, detail } = reasonText(reason)
  return (
    <>
      <p className="text-2xl">🚫</p>
      <h2 className="mt-3 text-xl font-bold text-white">{title}</h2>
      <p className="mt-2 text-sm text-white/60">{detail}</p>
      <button
        type="button"
        onClick={onBack}
        className="mx-auto mt-5 rounded-xl bg-linear-to-r from-grape to-grape-light px-6 py-2.5 font-bold text-white shadow-lg ring-1 ring-white/20 transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        ← Back to change
      </button>
    </>
  )
}

/** Late joiner: a match is running and the host has been asked to let us in. */
function PendingCard({ onCancel }: { onCancel: () => void }) {
  return (
    <>
      <motion.p
        className="text-2xl"
        animate={{ rotate: [0, 12, -12, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden="true"
      >
        ✋
      </motion.p>
      <h2 className="mt-3 text-xl font-bold text-white">Asking the host…</h2>
      <p className="mt-2 text-sm text-white/60">
        This match is already in progress. The host has been asked to let you in — hang tight.
      </p>
      <button
        type="button"
        onClick={onCancel}
        className="mx-auto mt-5 rounded-xl bg-white/10 px-6 py-2.5 font-bold text-white/80 ring-1 ring-white/15 transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        Cancel
      </button>
    </>
  )
}

/** Late joiner: the host declined our request. */
function DeclinedCard({ onBack }: { onBack: () => void }) {
  return (
    <>
      <p className="text-2xl">🚫</p>
      <h2 className="mt-3 text-xl font-bold text-white">Not this time</h2>
      <p className="mt-2 text-sm text-white/60">
        The host declined your request to join. You can try a different room.
      </p>
      <button
        type="button"
        onClick={onBack}
        className="mx-auto mt-5 rounded-xl bg-linear-to-r from-grape to-grape-light px-6 py-2.5 font-bold text-white shadow-lg ring-1 ring-white/20 transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        ← Back to lobby
      </button>
    </>
  )
}
