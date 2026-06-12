import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useSnakesAndLadders } from '../../hooks/useSnakesAndLadders'
import { useUnloadGuard } from '../../hooks/useUnloadGuard'
import { useLeaveConfirm } from '../../hooks/useLeaveConfirm'
import { useRoom } from '../../net/useRoom'
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  computeRoster,
  orderMembers,
  type RejectReason,
} from '../../net/roster'
import type {
  PlayerProfile,
  RoomMember,
  RoomMessage,
  Role,
  RunningSnapshot,
  StartPlayer,
} from '../../net/types'
import { GameScreen } from '../GameScreen'
import { ConfirmLeaveDialog } from '../ConfirmLeaveDialog'
import { WinnerOverlay } from '../WinnerOverlay'
import { CelebrationOverlay } from '../CelebrationOverlay'
import { ReactionBar, ReactionLayer, type FloatingReaction } from './Reactions'
import { JoinRequests, Notices, WaitingRoom } from './RoomChrome'
import { soundEngine } from '../../audio/soundEngine'

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
/** How long a floating emoji reaction stays on screen. */
const REACTION_MS = 2600
/** Minimum spacing between our own reaction sends (anti-spam). */
const REACTION_THROTTLE_MS = 350

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
  // Mid-match Leave goes through a sad-face confirmation so an accidental tap
  // never abandons a running game.
  const { confirming, requestLeave, cancelLeave, confirmLeave } = useLeaveConfirm(onLeave)
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

  // Warn before closing/refreshing/navigating away while a match is live, so a
  // player doesn't drop their friends mid-game by accident.
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
      // Broadcasts don't echo back to the sender, so render our own locally.
      sendRef.current?.({ event: 'reaction', clientId: myClientId, emoji })
      addFloating(emoji, profile.name, profile.color)
    },
    [addFloating, myClientId, profile.name, profile.color],
  )

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
    else if (msg.event === 'reaction') {
      const sender = room.members.find((m) => m.clientId === msg.clientId)
      addFloating(msg.emoji, sender?.name ?? 'Someone', sender?.color ?? '#a855f7')
    }
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

  // Who is acting host right now? Only the host admits late joiners and makes
  // the continue/end call, so if they leave mid-match the room would stall.
  // Instead every client deterministically promotes the next player: the
  // lowest-seated one still connected. The original host is seat 0, so they
  // keep it whenever present; otherwise it hands down the lineup. With no
  // server, all clients fold the same lineup + presence and agree on who it is.
  const actingHostClientId = useMemo(() => {
    if (!startedPlayers) return null
    const here = new Set(room.members.map((m) => m.clientId))
    here.add(myClientId)
    return startedPlayers.find((p) => here.has(p.clientId))?.clientId ?? null
  }, [startedPlayers, room.members, myClientId])
  const amActingHost = actingHostClientId === myClientId

  // Host: which late joiners to prompt about. We derive this from the host's own
  // authoritative game state (game.players / startedPlayers) rather than the
  // aggregated `inGame` presence flag — a client doesn't reliably read its own
  // `inGame` back, so presence alone would hide the running match from the host.
  // A request is anyone connected who isn't seated, isn't declined, and doesn't
  // clash with a seated name/color; we surface only as many as there are seats.
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

  // Announce host hand-offs: when the host leaves a 3+ player match, the next
  // player takes over and everyone is told who it is. Skipped when only one
  // active player is left — that is a forfeit win, not a hand-off (the lone
  // survivor wins rather than "becoming the host").
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
      <GameScreen
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
            // Only the acting host decides whether to play on. If the original
            // host left, the next player inherits the call (and duplicate
            // decisions dedupe by sequence number anyway).
            canDecide={amActingHost}
            waitingFor={actingHostName}
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
