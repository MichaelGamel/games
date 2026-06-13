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
import i18n from '../i18n'
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
import type { MatchDecision } from '../game/types'
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
/** How long the current player may sit on an idle turn before it is skipped.
 *  Their own client broadcasts the skip first; a present peer covers for them
 *  a few seconds later (see TURN_TIMER_BACKUP_MS). */
const TURN_TIMER_MS = 30_000
/** Grace after TURN_TIMER_MS before a present peer skips a stalled current
 *  player on their behalf. The actor's own client gets first crack at the
 *  skip; this backstops the (common, on mobile) case where their tab is
 *  frozen in the background and its timer never fires — without it the whole
 *  room hangs on one idle player forever. */
const TURN_TIMER_BACKUP_MS = 4000
/** How often a watching spectator re-asks for the match state until adopted. */
const SPECTATE_RETRY_MS = 2000

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
  lastRoll: number | null
  skipFlash: { playerId: number; nonce: number } | null
  applyRemoteTurn(resolution: R, seq: number): void
  applySkip(seq: number): void
  applyRemoteDecision(decision: MatchDecision, seq: number): void
  applyRemoteStart(players: { name: string; color: string }[], rules?: unknown): void
  applyRemoteReset(): void
  addPlayer(player: { name: string; color: string }): void
  forfeitWin(winnerId: number): void
  syncStatus(): { seq: number; busy: boolean }
}

/** Maps the game's board state to/from the generic per-seat payload `S`. */
export interface OnlineMatchAdapter<S> {
  /** Per-seat payloads, parallel to a lineup of `count` seats. */
  buildSeatStates(count: number): S[]
  /** Replace the local game with an authoritative snapshot's board state
   *  (and, for games that use it, the snapshot's `shared` global blob). */
  applySnapshot(snapshot: RunningSnapshot<S>): void
  /** Does our settled board state equal the broadcast per-seat payloads? */
  seatStatesEqual(positions: S[]): boolean
  /** Game-global state for the snapshot's `shared` blob — opaque to the net
   *  layer. Games whose state is fully per-seat omit it (so `shared` stays
   *  undefined); UNO supplies it so a late joiner / resync rebuilds the full
   *  deterministic state. */
  buildShared?(): unknown
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
  /** Host only: the rule variant to stamp on the next `start` broadcast. */
  matchRules?: () => unknown
  /** Seats this game supports (default 4; Connect Four passes 2). */
  maxPlayers?: number
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
  /** Seat indices whose player has left the room (for greying their card). */
  absentSeats: readonly number[]
  /** True while enough active players are connected to keep playing. */
  canPlay: boolean
  notices: Notice[]
  reactions: FloatingReaction[]
  sendReaction: (emoji: string) => void
  /** Seconds left on the current idle turn (online matches only), or null. */
  turnSecondsLeft: number | null
  /** True when this client is watching the match without a seat. */
  amSpectator: boolean
  /** Ask the room for the live state and watch the match without a seat. */
  requestSpectate: () => void
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
  matchRules,
  maxPlayers = MAX_PLAYERS,
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
  // The active match's rule variant (opaque here): echoed on snapshots and on
  // Play Again so every client — and every late joiner — plays the same rules.
  const rulesRef = useRef<unknown>(undefined)
  // Watching without a seat (room was full, or just curious).
  const [spectating, setSpectating] = useState(false)
  const spectatingRef = useRef(false)

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
  const matchRulesRef = useRef(matchRules)
  useEffect(() => {
    gameRef.current = game
    adapterRef.current = adapter
    onSeatRef.current = onSeat
    statusRef.current = room.status
    matchRulesRef.current = matchRules
    spectatingRef.current = spectating
  })

  // Lock in a started match: find our seat, remember the lineup, flag presence.
  const applyStart = (players: StartPlayer[], matchId: number, rules: unknown) => {
    matchIdRef.current = matchId
    startedRef.current = players
    setStartedPlayers(players)
    rulesRef.current = rules
    const mySeat = players.findIndex((p) => p.clientId === myClientId)
    onSeatRef.current(mySeat >= 0 ? mySeat : null)
    if (mySeat >= 0) {
      setSpectating(false)
      spectatingRef.current = false
    }
    // Spectators stay out of the seated roster.
    if (!spectatingRef.current) setInGame(true)
    gameRef.current.applyRemoteStart(players.map(({ name, color }) => ({ name, color })), rules)
  }

  // Replace our whole view of the match with an authoritative snapshot. Used by
  // an approved late joiner (it never saw `start`) and by any client recovering
  // from a missed message.
  const adoptSnapshot = (snapshot: RunningSnapshot<S>) => {
    matchIdRef.current = snapshot.matchId
    startedRef.current = snapshot.lineup
    setStartedPlayers(snapshot.lineup)
    rulesRef.current = snapshot.rules
    const mySeat = snapshot.lineup.findIndex((p) => p.clientId === myClientId)
    onSeatRef.current(mySeat >= 0 ? mySeat : null)
    if (mySeat >= 0) {
      // A spectator the host admitted is now a player.
      setSpectating(false)
      spectatingRef.current = false
    }
    // Spectators stay out of the seated roster (their presence must not flip
    // `inGame`, which is what locks rooms and orders seats).
    if (!spectatingRef.current) setInGame(true)
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
      rules: rulesRef.current,
      // Undefined for the per-seat games (key dropped on the JSON wire); UNO's
      // adapter fills it with the stock/discard/etc. so a resync is complete.
      shared: adapterRef.current.buildShared?.(),
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

  // Answer a lagging client with our settled state. Only seated players (and
  // explicit spectators) get answers — a pending late joiner must wait for the
  // host's approval.
  const sendStateTo = (toClientId: string, forSpectator = false) => {
    const g = gameRef.current
    const lineup = startedRef.current
    if (!lineup) return
    if (!forSpectator && !lineup.some((p) => p.clientId === toClientId)) return
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
    if (msg.event === 'start') applyStart(msg.players, msg.matchId, msg.rules)
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
    else if (msg.event === 'sync-request' && msg.clientId !== myClientId)
      sendStateTo(msg.clientId, msg.spectate === true)
    else if (msg.event === 'sync-state') handleSyncState(msg)
    else if (msg.event === 'reaction') {
      const sender = room.members.find((m) => m.clientId === msg.clientId)
      addFloating(msg.emoji, sender?.name ?? i18n.t('online:reactions.someone'), sender?.color ?? '#a855f7')
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
    if (spectatingRef.current) return // watchers have no authoritative state
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
  const { seats, pending, rejected } = useMemo(
    () => computeRoster(room.members, maxPlayers),
    [room.members, maxPlayers],
  )
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
    const openSeats = maxPlayers - game.players.length
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
  }, [amActingHost, game.phase, game.players, startedPlayers, room.members, declinedIds, myClientId, maxPlayers])

  // Host: broadcast the authoritative lineup, then everyone applies it.
  const startMatch = () => {
    const players: StartPlayer[] = seats.map((m) => ({
      clientId: m.clientId,
      name: m.name,
      color: m.color,
    }))
    const matchId = matchIdRef.current + 1
    const rules = matchRulesRef.current?.()
    applyStart(players, matchId, rules)
    send({ event: 'start', players, matchId, rules })
  }

  // Play Again: replay the same lineup and rules (idempotent — any seated
  // player may trigger it; spectators may not).
  const restartMatch = () => {
    const players = startedRef.current
    if (!players || spectatingRef.current) return
    const matchId = matchIdRef.current + 1
    const rules = rulesRef.current
    applyStart(players, matchId, rules)
    send({ event: 'start', players, matchId, rules })
  }

  // Host: admit a late joiner into the live match. Only between turns (so the
  // newcomer can't miss an in-flight roll) and only while a seat is open.
  const canAdmit = game.phase === 'idle' && game.players.length < maxPlayers
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

  // Host: turn a connected member away (they see the "declined" card). Remember
  // them so the running-match prompt / auto-reject sweep ignores them after.
  const rejectMember = useCallback(
    (clientId: string) => {
      setDeclinedIds((prev) => (prev.has(clientId) ? prev : new Set(prev).add(clientId)))
      send({ event: 'reject-join', clientId })
    },
    [send],
  )

  // Host: turn a late joiner away (they return to the lobby).
  const rejectJoiner = (member: RoomMember) => rejectMember(member.clientId)

  // Reserve every seated identity for the life of the match — including players
  // who left (their greyed card keeps the seat). A newcomer who picks a name or
  // color already in the lineup is turned away so they go back and choose a
  // fresh one, rather than impersonating someone who just walked away. The
  // joiner can't see departed players via presence, so only the host (which
  // holds the authoritative lineup) can enforce this. We track who we've already
  // bounced in a ref (not state): it only suppresses duplicate broadcasts and
  // these members are kept out of `joinRequests` by the same clash filter, so
  // no re-render is needed — and broadcasting (not setState) is the only effect.
  const autoRejectedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!amActingHost || game.phase === 'setup') return
    const lineupIds = new Set((startedPlayers ?? []).map((p) => p.clientId))
    const names = new Set(game.players.map((p) => p.name.trim().toLowerCase()))
    const colors = new Set(game.players.map((p) => p.color))
    for (const m of room.members) {
      if (m.clientId === myClientId || lineupIds.has(m.clientId)) continue
      if (declinedIds.has(m.clientId) || autoRejectedRef.current.has(m.clientId)) continue
      if (names.has(m.name.trim().toLowerCase()) || colors.has(m.color)) {
        autoRejectedRef.current.add(m.clientId)
        send({ event: 'reject-join', clientId: m.clientId })
      }
    }
  }, [amActingHost, game.phase, game.players, startedPlayers, room.members, declinedIds, myClientId, send])

  const canStart = role === 'host' && game.phase === 'setup' && seats.length >= MIN_PLAYERS

  // ---- Presence: who is still here, and can the match keep going? --------

  const rosterIds = useMemo(() => new Set(room.members.map((m) => m.clientId)), [room.members])
  const present = (clientId: string) => clientId === myClientId || rosterIds.has(clientId)

  const lineup = startedPlayers ?? []
  const everyonePresent = startedPlayers ? lineup.every((p) => present(p.clientId)) : false

  // Seats whose player has left the room (presence dropped). Their card stays
  // in the roster, greyed out, rather than vanishing — and their name/color
  // stays reserved (see the auto-reject effect below). Memoised so the
  // memoised player panels only re-render when presence actually changes.
  const absentSeats = useMemo(
    () =>
      (startedPlayers ?? []).reduce<number[]>((acc, p, i) => {
        if (!(p.clientId === myClientId || rosterIds.has(p.clientId))) acc.push(i)
        return acc
      }, []),
    [startedPlayers, rosterIds, myClientId],
  )

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

  // ---- Spectating ----------------------------------------------------------

  const requestSpectate = useCallback(() => {
    setSpectating(true)
    spectatingRef.current = true
    send({ event: 'sync-request', clientId: myClientId, spectate: true })
  }, [send, myClientId])

  // Keep asking until someone answers with the match state (seated clients
  // only reply when settled, so the first request can easily go unanswered).
  useEffect(() => {
    if (!spectating || startedPlayers) return
    const interval = setInterval(() => {
      send({ event: 'sync-request', clientId: myClientId, spectate: true })
    }, SPECTATE_RETRY_MS)
    return () => clearInterval(interval)
  }, [spectating, startedPlayers, send, myClientId])

  // ---- Turn timer: don't let one player stall the room ---------------------

  // The deadline for the current idle turn. Tracked with a ref (set after
  // commit) + a ticking countdown state for display.
  const turnDeadlineRef = useRef<number | null>(null)
  const [turnSecondsLeft, setTurnSecondsLeft] = useState<number | null>(null)
  const timedTurnActive =
    startedPlayers != null && game.phase === 'idle' && canPlay && room.status === 'connected'

  useEffect(() => {
    if (!timedTurnActive) {
      turnDeadlineRef.current = null
      return
    }
    turnDeadlineRef.current = Date.now() + TURN_TIMER_MS
    // Re-arms whenever the turn changes hands (or a skip/decision commits).
  }, [timedTurnActive, game.currentPlayerIndex, game.turnCount])

  // Tick the visible countdown (async callback, so setState there is fine).
  // While no clock runs, the stale state is simply not shown (see the return).
  useEffect(() => {
    if (!timedTurnActive) return
    const tick = () => {
      const deadline = turnDeadlineRef.current
      setTurnSecondsLeft(deadline == null ? null : Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
    }
    const interval = setInterval(tick, 250)
    return () => clearInterval(interval)
  }, [timedTurnActive])

  // Skip the current player's idle turn once the deadline passes. (An *absent*
  // current player is handled by the presence grace above; this is the present-
  // but-idle case.) `expectClientId` pins which player we meant to skip, so a
  // timer that fires just after the turn already moved on becomes a no-op
  // rather than skipping the wrong seat. Guards re-run on fire (state is read
  // fresh) and duplicate skips dedupe by sequence number.
  const skipCurrentRef = useRef<(expectClientId: string) => void>(() => {})
  const skipCurrent = (expectClientId: string) => {
    const g = gameRef.current
    if (g.phase !== 'idle') return
    const cur = startedRef.current?.[g.currentPlayerIndex]
    if (!cur || cur.clientId !== expectClientId) return
    const { seq, busy } = g.syncStatus()
    if (busy) return
    send({ event: 'skip-turn', seq: seq + 1, matchId: matchIdRef.current })
    g.applySkip(seq + 1)
  }
  useEffect(() => {
    skipCurrentRef.current = skipCurrent
  })

  // Our own idle turn: skip ourselves at the deadline.
  const myTurnTimed = timedTurnActive && mySeat >= 0 && game.currentPlayerIndex === mySeat
  useEffect(() => {
    if (!myTurnTimed) return
    const timer = setTimeout(() => skipCurrentRef.current(myClientId), TURN_TIMER_MS)
    return () => clearTimeout(timer)
    // Re-arm per turn, mirroring the deadline effect above.
  }, [myTurnTimed, game.currentPlayerIndex, game.turnCount, myClientId])

  // Backstop another player's stalled idle turn. The actor's own client should
  // skip first (above); we cover for it a beat later in case its tab is frozen.
  // Only the single designated responder (the first present seat after the
  // current one) arms this, so the skip isn't broadcast by the whole room.
  const backupTimed =
    timedTurnActive &&
    mySeat >= 0 &&
    game.currentPlayerIndex !== mySeat &&
    currentClientId != null &&
    present(currentClientId) &&
    skipResponderSeat === mySeat
  useEffect(() => {
    if (!backupTimed || currentClientId == null) return
    const timer = setTimeout(
      () => skipCurrentRef.current(currentClientId),
      TURN_TIMER_MS + TURN_TIMER_BACKUP_MS,
    )
    return () => clearTimeout(timer)
    // Re-arm per turn so each stalled player is covered in sequence.
  }, [backupTimed, currentClientId, game.currentPlayerIndex, game.turnCount])

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
      if (was && !is) pushNotice(i18n.t('online:notices.left', { name: p.name }))
      else if (!was && is) pushNotice(i18n.t('online:notices.back', { name: p.name }))
    }
  }, [rosterIds, startedPlayers, myClientId, game.phase, pushNotice])

  // Surface each applied skip (local or remote) as a notice.
  const lastSkipNonceRef = useRef(0)
  useEffect(() => {
    const f = game.skipFlash
    if (!f || f.nonce === lastSkipNonceRef.current) return
    lastSkipNonceRef.current = f.nonce
    const name = game.players[f.playerId]?.name ?? '?'
    pushNotice(i18n.t('online:notices.skipped', { name }))
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
    const name = startedPlayers.find((p) => p.clientId === actingHostClientId)?.name ?? '?'
    pushNotice(i18n.t('online:notices.newHost', { name }))
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
    absentSeats,
    canPlay,
    notices,
    reactions,
    sendReaction,
    turnSecondsLeft: timedTurnActive ? turnSecondsLeft : null,
    amSpectator: spectating,
    requestSpectate,
    sendTurn,
    sendDecision,
    requestSync,
  }
}
