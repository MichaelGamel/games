/**
 * The game-agnostic half of an online room.
 *
 * `OnlineRoom` (Snakes) and `LudoOnlineRoom` (Ludo) used to each own a full
 * copy of the same machinery; everything that does not depend on a specific
 * game now lives here, parameterised over the two wire payloads:
 *
 *   - `R` — the per-turn resolution broadcast on every move.
 *   - `S` — the per-seat board state carried in snapshots and heartbeats.
 *
 * What this hook owns:
 *
 *   - **Self-healing sync.** There is no server and broadcast delivery is
 *     fire-and-forget, so every client gossips its settled state (`sync-ping`),
 *     asks for help when it detects it is behind (`sync-request`), and answers
 *     lagging peers with an authoritative snapshot (`sync-state`). Ties at the
 *     same turn count are broken in the host's favor.
 *   - **Host migration.** The acting host is the lowest-seated player still
 *     connected, so the room never stalls when the original host leaves.
 *   - **Late joiners.** The acting host approves/declines join requests; an
 *     approved joiner rebuilds its whole game from a snapshot.
 *   - **Presence consequences.** An absent current player's turn is skipped
 *     after a grace period (one designated client broadcasts it); the last
 *     active player standing wins by forfeit; join/leave/skip/host-handoff
 *     notices are surfaced.
 *   - **Emoji reactions.** Pure social fluff that never touches game state.
 *
 * The game side stays behind two small seams: a structural view of the game
 * controller ({@link OnlineMatchGame}) and an {@link OnlineMatchAdapter} that
 * maps the game's board state to/from the generic `S` payload.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRoom } from './useRoom'
import { MAX_PLAYERS, MIN_PLAYERS, computeRoster, orderMembers, type RejectReason } from './roster'
import type {
  PlayerProfile,
  Role,
  RoomMember,
  RoomMessage,
  RoomStatus,
  RunningSnapshot,
  StartPlayer,
} from './types'
import type { DieValue, MatchDecision } from '../game/types'
import { soundEngine } from '../audio/soundEngine'

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

/** A transient join/leave/skip announcement. */
export interface Notice {
  id: number
  text: string
}

/** One emoji reaction currently floating up the screen. */
export interface FloatingReaction {
  id: string
  emoji: string
  /** Sender's display name, shown beneath the emoji so you know who reacted. */
  name: string
  /** Sender's token color, for a soft glow behind the emoji and the name chip. */
  color: string
  /** Horizontal position as a percentage across the viewport. */
  left: number
}

/**
 * The slice of a game controller the online machinery needs. Both
 * `GameController` and `LudoController` satisfy it structurally.
 */
export interface OnlineMatchGame<R> {
  phase: string
  players: ReadonlyArray<{ name: string; color: string }>
  currentPlayerIndex: number
  turnCount: number
  winnerId: number | null
  finishedOrder: readonly number[]
  lastRoll: DieValue | null
  skipFlash: { playerId: number; nonce: number } | null
  applyRemoteTurn(resolution: R, seq: number): void
  applySkip(seq: number): void
  applyRemoteDecision(decision: MatchDecision, seq: number): void
  applyRemoteStart(players: { name: string; color: string }[]): void
  applyRemoteReset(): void
  addPlayer(player: { name: string; color: string }): void
  forfeitWin(winnerId: number): void
  syncStatus(): { seq: number; busy: boolean }
}

/** Maps the game's board state to/from the generic per-seat payload `S`. */
export interface OnlineMatchAdapter<S> {
  /** Per-seat payloads, parallel to a lineup of `count` seats. */
  buildSeatStates(count: number): S[]
  /** Replace the local game with an authoritative snapshot's board state. */
  applySnapshot(snapshot: RunningSnapshot<S>): void
  /** Does our settled board state equal the broadcast per-seat payloads? */
  seatStatesEqual(positions: S[]): boolean
}

export interface UseOnlineMatchArgs<R, S> {
  code: string
  role: Role
  profile: PlayerProfile
  /** Channel namespace so two games never share a channel on one room code. */
  channelPrefix: string
  game: OnlineMatchGame<R>
  adapter: OnlineMatchAdapter<S>
  /** Reports this client's seat in the started lineup (null = spectator). */
  onSeat: (seat: number | null) => void
}

export interface OnlineMatch<R> {
  status: RoomStatus
  testMode: boolean
  clientId: string
  /** Pre-match seats, in turn order (drives the waiting room). */
  seats: RoomMember[]
  /** Why this client was turned away from the room, if it was. */
  myRejection: RejectReason | null
  /** A match is running and we are waiting for the host to admit us. */
  amPending: boolean
  /** The host declined our request to join the running match. */
  declined: boolean
  canStart: boolean
  startMatch: () => void
  /** Play Again: replay the same lineup (idempotent across clients). */
  restartMatch: () => void
  amActingHost: boolean
  actingHostName: string
  joinRequests: RoomMember[]
  canAdmit: boolean
  acceptJoiner: (member: RoomMember) => void
  rejectJoiner: (member: RoomMember) => void
  /** True when every player from the started lineup is still connected. */
  everyonePresent: boolean
  /** True while enough active players are connected to keep playing. */
  canPlay: boolean
  notices: Notice[]
  reactions: FloatingReaction[]
  sendReaction: (emoji: string) => void
  /** Wire these three into the game hook's net hooks. */
  sendTurn: (resolution: R, seq: number) => void
  sendDecision: (decision: MatchDecision, seq: number) => void
  requestSync: () => void
}

export function useOnlineMatch<R, S>({
  code,
  role,
  profile,
  channelPrefix,
  game,
  adapter,
  onSeat,
}: UseOnlineMatchArgs<R, S>): OnlineMatch<R> {
  const [startedPlayers, setStartedPlayers] = useState<StartPlayer[] | null>(null)
  const startedRef = useRef<StartPlayer[] | null>(null)
  // Host-only: late joiners we have already turned down, so they drop out of
  // the request prompt even though they stay connected.
  const [declinedIds, setDeclinedIds] = useState<ReadonlySet<string>>(() => new Set())
  // Late joiner: the host declined our request to join the running match.
  const [declined, setDeclined] = useState(false)
  // Which start/restart generation we are on; stamped on turns so a stale or
  // missed `start` is detectable.
  const matchIdRef = useRef(0)
  const lastSyncRequestAtRef = useRef(0)

  // Latest-value refs for async paths (heartbeats, message handling, grace
  // timers), synced after each commit. Async callbacks only run after the
  // effect has, so they always observe the freshest values.
  const gameRef = useRef(game)
  const adapterRef = useRef(adapter)
  const onSeatRef = useRef(onSeat)

  type Msg = RoomMessage<R, S>
  type SyncPing = Extract<Msg, { event: 'sync-ping' }>
  type SyncState = Extract<Msg, { event: 'sync-state' }>

  const room = useRoom<R, S>({
    code,
    role,
    profile,
    channelPrefix,
    onMessage: (msg) => handleMessage(msg),
  })
  const myClientId = room.clientId
  const { send, setInGame } = room

  const statusRef = useRef(room.status)
  useEffect(() => {
    gameRef.current = game
    adapterRef.current = adapter
    onSeatRef.current = onSeat
    statusRef.current = room.status
  })

  // Lock in a started match: find our seat, remember the lineup, flag presence.
  const applyStart = (players: StartPlayer[], matchId: number) => {
    matchIdRef.current = matchId
    startedRef.current = players
    setStartedPlayers(players)
    const mySeat = players.findIndex((p) => p.clientId === myClientId)
    onSeatRef.current(mySeat >= 0 ? mySeat : null)
    setInGame(true)
    gameRef.current.applyRemoteStart(players.map(({ name, color }) => ({ name, color })))
  }

  // Replace our whole view of the match with an authoritative snapshot. Used by
  // an approved late joiner (it never saw `start`) and by any client recovering
  // from a missed message.
  const adoptSnapshot = (snapshot: RunningSnapshot<S>) => {
    matchIdRef.current = snapshot.matchId
    startedRef.current = snapshot.lineup
    setStartedPlayers(snapshot.lineup)
    const mySeat = snapshot.lineup.findIndex((p) => p.clientId === myClientId)
    onSeatRef.current(mySeat >= 0 ? mySeat : null)
    setInGame(true)
    adapterRef.current.applySnapshot(snapshot)
  }

  /** Capture this client's settled game as an authoritative snapshot. */
  const buildSnapshot = (lineup: StartPlayer[]): RunningSnapshot<S> => {
    const g = gameRef.current
    return {
      lineup,
      positions: adapterRef.current.buildSeatStates(lineup.length),
      currentPlayerIndex: g.currentPlayerIndex,
      lastRoll: g.lastRoll,
      finishedOrder: [...g.finishedOrder],
      awaitingDecision: g.phase === 'celebrating',
      ended: g.phase === 'won',
      turnCount: g.turnCount,
      matchId: matchIdRef.current,
    }
  }

  /** Settled phases: nothing is animating or queued, the state is final. */
  const isSettled = (phase: string) =>
    phase === 'idle' || phase === 'celebrating' || phase === 'won'

  // Apply a host-approved late joiner. The approved client itself rebuilds the
  // whole match from the snapshot; everyone else simply appends the newcomer to
  // their lineup. Idempotent against duplicate delivery.
  const applyAddPlayer = (newPlayer: StartPlayer, snapshot: RunningSnapshot<S>) => {
    if (newPlayer.clientId === myClientId) {
      adoptSnapshot(snapshot)
      return
    }
    const current = startedRef.current
    if (!current || current.some((p) => p.clientId === newPlayer.clientId)) return
    const next = [...current, newPlayer]
    startedRef.current = next
    setStartedPlayers(next)
    gameRef.current.addPlayer({ name: newPlayer.name, color: newPlayer.color })
  }

  // ---- Self-healing sync (no server, fire-and-forget broadcasts) ----------

  const requestSync = useCallback(() => {
    const now = Date.now()
    if (now - lastSyncRequestAtRef.current < SYNC_REQUEST_THROTTLE_MS) return
    lastSyncRequestAtRef.current = now
    send({ event: 'sync-request', clientId: myClientId })
  }, [send, myClientId])

  // Answer a lagging client with our settled state. Only seated players get
  // answers — a pending late joiner must wait for the host's approval.
  const sendStateTo = (toClientId: string) => {
    const g = gameRef.current
    const lineup = startedRef.current
    if (!lineup?.some((p) => p.clientId === toClientId)) return
    if (!isSettled(g.phase)) return
    if (g.syncStatus().busy) return
    send({
      event: 'sync-state',
      toClientId,
      fromHost: role === 'host',
      snapshot: buildSnapshot(lineup),
    })
  }

  const pingMatchesLocal = (msg: SyncPing) => {
    const g = gameRef.current
    return (
      msg.currentPlayerIndex === g.currentPlayerIndex &&
      msg.winnerId === g.winnerId &&
      msg.positions.length === g.players.length &&
      adapterRef.current.seatStatesEqual(msg.positions)
    )
  }

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

    const { seq, busy } = gameRef.current.syncStatus()
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
    const g = gameRef.current
    const { snapshot } = msg
    const { seq, busy } = g.syncStatus()
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
      (snapshot.currentPlayerIndex !== g.currentPlayerIndex ||
        snapshot.finishedOrder.join() !== g.finishedOrder.join() ||
        snapshot.positions.length !== g.players.length ||
        !adapterRef.current.seatStatesEqual(snapshot.positions))
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
      send({ event: 'reaction', clientId: myClientId, emoji })
      addFloating(emoji, profile.name, profile.color)
    },
    [send, addFloating, myClientId, profile.name, profile.color],
  )

  // ---- The wire ------------------------------------------------------------

  const handleMessage = (msg: Msg) => {
    const g = gameRef.current
    if (msg.event === 'start') applyStart(msg.players, msg.matchId)
    else if (msg.event === 'turn') {
      if (msg.matchId === matchIdRef.current) g.applyRemoteTurn(msg.resolution, msg.seq)
      else if (msg.matchId > matchIdRef.current) requestSync()
      // Turns from an older match are stale: drop them.
    } else if (msg.event === 'skip-turn') {
      if (msg.matchId === matchIdRef.current) g.applySkip(msg.seq)
      else if (msg.matchId > matchIdRef.current) requestSync()
    } else if (msg.event === 'decide') {
      if (msg.matchId === matchIdRef.current) g.applyRemoteDecision(msg.decision, msg.seq)
      else if (msg.matchId > matchIdRef.current) requestSync()
    } else if (msg.event === 'reset') g.applyRemoteReset()
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

  const sendTurn = useCallback(
    (resolution: R, seq: number) => {
      send({ event: 'turn', resolution, seq, matchId: matchIdRef.current })
    },
    [send],
  )

  const sendDecision = useCallback(
    (decision: MatchDecision, seq: number) => {
      send({ event: 'decide', decision, seq, matchId: matchIdRef.current })
    },
    [send],
  )

  // Heartbeat: gossip our settled state so dropped messages are detected and
  // repaired within seconds. Also fires when the tab becomes visible again —
  // background tabs are exactly where broadcasts get lost.
  const ping = useCallback(() => {
    const g = gameRef.current
    if (statusRef.current !== 'connected' || !startedRef.current) return
    if (!isSettled(g.phase)) return
    const { seq, busy } = g.syncStatus()
    if (busy) return
    send({
      event: 'sync-ping',
      clientId: myClientId,
      role,
      matchId: matchIdRef.current,
      seq,
      currentPlayerIndex: g.currentPlayerIndex,
      positions: adapterRef.current.buildSeatStates(g.players.length),
      winnerId: g.winnerId,
    })
  }, [send, myClientId, role])

  useEffect(() => {
    const interval = setInterval(ping, SYNC_PING_MS)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') ping()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [ping])

  // ---- Roster, host migration, late joiners --------------------------------

  // The joiner's own status (pending / full / name-or-color clash) is derived
  // from presence: a late joiner reliably sees the seated players' `inGame`
  // flag, so computeRoster tells them whether they fit, collide, or must wait.
  const { seats, pending, rejected } = useMemo(() => computeRoster(room.members), [room.members])
  const myRejection: RejectReason | null = rejected.get(myClientId) ?? null
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
  const actingHostName =
    (startedPlayers ?? []).find((p) => p.clientId === actingHostClientId)?.name ??
    game.players[0]?.name ??
    'the host'

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
    send({ event: 'start', players, matchId })
  }

  // Play Again: replay the same lineup (idempotent — any player may trigger it).
  const restartMatch = () => {
    const players = startedRef.current
    if (!players) return
    const matchId = matchIdRef.current + 1
    applyStart(players, matchId)
    send({ event: 'start', players, matchId })
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
    send({ event: 'add-player', player: newPlayer, snapshot })
  }

  // Host: turn a late joiner away (they return to the lobby).
  const rejectJoiner = (member: RoomMember) => {
    setDeclinedIds((prev) => new Set(prev).add(member.clientId))
    send({ event: 'reject-join', clientId: member.clientId })
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
  const mySeat = startedPlayers?.findIndex((p) => p.clientId === myClientId) ?? -1
  const shouldInitiateSkip =
    game.phase === 'idle' &&
    room.status === 'connected' &&
    currentPlayerAbsent &&
    canPlay &&
    mySeat >= 0 &&
    skipResponderSeat === mySeat

  const rosterIdsRef = useRef(rosterIds)
  const trySkipRef = useRef<() => void>(() => {})
  const trySkip = () => {
    // Re-validate against fresh state when the grace timer fires.
    const g = gameRef.current
    if (g.phase !== 'idle') return
    const cur = startedRef.current?.[g.currentPlayerIndex]
    if (!cur || cur.clientId === myClientId) return
    if (rosterIdsRef.current.has(cur.clientId)) return
    const { seq, busy } = g.syncStatus()
    if (busy) return
    send({ event: 'skip-turn', seq: seq + 1, matchId: matchIdRef.current })
    g.applySkip(seq + 1)
  }
  // The grace timer must run this render's closure when it eventually fires.
  useEffect(() => {
    trySkipRef.current = trySkip
    rosterIdsRef.current = rosterIds
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

  useEffect(() => {
    if (soleActiveSeat == null) return
    const timer = setTimeout(() => gameRef.current.forfeitWin(soleActiveSeat), FORFEIT_GRACE_MS)
    return () => clearTimeout(timer)
  }, [soleActiveSeat])

  // ---- Lightweight notices ("X left", "X is back", "turn skipped") --------

  const [notices, setNotices] = useState<Notice[]>([])
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

  return {
    status: room.status,
    testMode: room.testMode,
    clientId: myClientId,
    seats,
    myRejection,
    amPending,
    declined,
    canStart,
    startMatch,
    restartMatch,
    amActingHost,
    actingHostName,
    joinRequests,
    canAdmit,
    acceptJoiner,
    rejectJoiner,
    everyonePresent,
    canPlay,
    notices,
    reactions,
    sendReaction,
    sendTurn,
    sendDecision,
    requestSync,
  }
}
