/**
 * Transport-agnostic networking types.
 *
 * The game talks to a {@link Transport} interface, never to Supabase directly
 * (Dependency Inversion). That lets us swap the cross-computer Supabase
 * transport for a same-browser BroadcastChannel transport in development with
 * zero changes to the game code.
 */
import type { DieValue, MatchDecision, TurnResolution } from '../game/types'

/** The host creates the room (seat 0 + the one who starts); guests join it. */
export type Role = 'host' | 'guest'

export interface PlayerProfile {
  name: string
  color: string
}

/**
 * One connected participant, as published via presence. Every client sees the
 * same set of members (including itself) and derives seats/rejections from it.
 */
export interface RoomMember {
  /** Stable per-connection id; also the presence key. */
  clientId: string
  role: Role
  name: string
  color: string
  /** Self-reported join time; used only to order guests (see roster.ts). */
  joinedAt: number
  /** True once this member is part of a started match (locks out late joiners). */
  inGame: boolean
}

/** A seated player in the authoritative start payload — carries the clientId so
 *  each client can locate its own seat index in the ordered list. */
export interface StartPlayer {
  clientId: string
  name: string
  color: string
}

/**
 * A snapshot of a running match — handed to a late joiner the host has
 * approved, and to any client that detected it missed a message (resync).
 * Carries every seated player (with `clientId`, so the receiver can locate its
 * own seat) plus the live board state.
 */
export interface RunningSnapshot {
  /** Seated players in turn order, including the newly added one (at position 0). */
  lineup: StartPlayer[]
  /** Board cell per seat, parallel to `lineup`. */
  positions: number[]
  currentPlayerIndex: number
  lastRoll: DieValue | null
  /** Seats that already finished, in podium order. */
  finishedOrder: number[]
  /** True when paused on a mid-game finish, awaiting the host's decision. */
  awaitingDecision: boolean
  /** True when the match is over. */
  ended: boolean
  /** Committed turns so far — the sync sequence number. */
  turnCount: number
  /** Which match (start/restart generation) this snapshot belongs to. */
  matchId: number
}

/**
 * Messages broadcast between the clients in a room.
 *
 * There is no server, and broadcast delivery is fire-and-forget, so the
 * protocol must self-heal: every `turn` carries a sequence number (`seq`) and a
 * match generation (`matchId`); clients periodically gossip their settled state
 * via `sync-ping`. Any client that detects it is behind (a gap in `seq`, a
 * newer `matchId`, or a ping it can't reconcile) sends `sync-request`, and any
 * settled, up-to-date client answers with an authoritative `sync-state`
 * snapshot. This is what un-sticks a game after a dropped message (e.g. a
 * backgrounded tab whose connection silently lapsed).
 */
export type RoomMessage =
  | { event: 'start'; players: StartPlayer[]; matchId: number }
  | { event: 'turn'; resolution: TurnResolution; seq: number; matchId: number }
  // The current player left the room: commit number `seq` hands the turn to
  // the next active player on every client.
  | { event: 'skip-turn'; seq: number; matchId: number }
  // Host's continue/end call after a mid-game finish, committed as `seq`.
  | { event: 'decide'; decision: MatchDecision; seq: number; matchId: number }
  | { event: 'reset' }
  // Host approved a late joiner: existing clients append `player`; the joiner
  // named in `player` initializes its whole game from `snapshot`.
  | { event: 'add-player'; player: StartPlayer; snapshot: RunningSnapshot }
  // Host declined a late joiner's request (addressed by clientId).
  | { event: 'reject-join'; clientId: string }
  // Periodic heartbeat of this client's settled game state.
  | {
      event: 'sync-ping'
      clientId: string
      role: Role
      matchId: number
      seq: number
      currentPlayerIndex: number
      positions: number[]
      winnerId: number | null
    }
  // "I'm behind — somebody send me the current state."
  | { event: 'sync-request'; clientId: string }
  // Authoritative state for one lagging client (addressed by clientId).
  | { event: 'sync-state'; toClientId: string; fromHost: boolean; snapshot: RunningSnapshot }
  // A quick emoji reaction. Purely cosmetic and ephemeral: it never touches
  // game state, so it bypasses the seq/turnCount sync machinery entirely.
  | { event: 'reaction'; clientId: string; emoji: string }

export type RoomStatus = 'connecting' | 'connected' | 'error'

export interface TransportHandlers {
  onMessage: (msg: RoomMessage) => void
  onStatus: (status: RoomStatus) => void
  /** The full roster (including this client) whenever presence changes. */
  onRoster: (members: RoomMember[]) => void
}

export interface Transport {
  send: (msg: RoomMessage) => void
  /** Re-publish presence with the in-game flag (so late joiners learn the match
   *  has started). */
  setInGame: (inGame: boolean) => void
  close: () => void
}

export interface TransportArgs {
  code: string
  role: Role
  clientId: string
  joinedAt: number
  profile: PlayerProfile
  handlers: TransportHandlers
}

export type TransportFactory = (args: TransportArgs) => Transport
