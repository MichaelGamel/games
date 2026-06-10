/**
 * Transport-agnostic networking types.
 *
 * The game talks to a {@link Transport} interface, never to Supabase directly
 * (Dependency Inversion). That lets us swap the cross-computer Supabase
 * transport for a same-browser BroadcastChannel transport in development with
 * zero changes to the game code.
 */
import type { TurnResolution } from '../game/types'

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

/** Messages broadcast between the clients in a room. */
export type RoomMessage =
  | { event: 'start'; players: StartPlayer[] }
  | { event: 'turn'; resolution: TurnResolution }
  | { event: 'reset' }

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
