/**
 * Manages a realtime room connection for the lifetime of the component.
 *
 * Picks the transport based on configuration: Supabase when keys are present
 * (cross-computer), otherwise the BroadcastChannel dev fallback (same browser).
 * Exposes a tiny, transport-agnostic API to the game.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { isSupabaseConfigured } from './config'
import { createSupabaseTransport } from './supabaseTransport'
import { createBroadcastTransport } from './broadcastTransport'
import type {
  PlayerProfile,
  RoomMember,
  RoomMessage,
  RoomStatus,
  Role,
  Transport,
  TransportFactory,
} from './types'
import type { TurnResolution } from '../game/types'

interface UseRoomArgs<R = TurnResolution, S = number> {
  code: string
  role: Role
  profile: PlayerProfile
  onMessage: (msg: RoomMessage<R, S>) => void
  /** Channel namespace; defaults to Snakes' `'sl-room'`. A second game passes its
   *  own (e.g. `'lr-room'`) so the two never share a channel on the same code. */
  channelPrefix?: string
}

export interface RoomApi<R = TurnResolution, S = number> {
  status: RoomStatus
  /** Everyone currently connected to the room, including this client. */
  members: RoomMember[]
  /** This client's stable id (its entry in `members`). */
  clientId: string
  /** True when running on the same-browser dev fallback (no Supabase keys). */
  testMode: boolean
  send: (msg: RoomMessage<R, S>) => void
  /** Flip our in-game presence flag (locks the room to late joiners). */
  setInGame: (inGame: boolean) => void
}

// Whether any transport is available is a build-time fact: Supabase keys in
// production, or the BroadcastChannel fallback in dev.
const hasTransport = isSupabaseConfigured || import.meta.env.DEV

const genId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

export function useRoom<R = TurnResolution, S = number>({
  code,
  role,
  profile,
  onMessage,
  channelPrefix,
}: UseRoomArgs<R, S>): RoomApi<R, S> {
  const [status, setStatus] = useState<RoomStatus>(hasTransport ? 'connecting' : 'error')
  const [members, setMembers] = useState<RoomMember[]>([])
  const transportRef = useRef<Transport<R, S> | null>(null)

  // Stable identity for this connection, minted once per mount.
  const [identity] = useState(() => ({ clientId: genId(), joinedAt: Date.now() }))

  // Keep the callback/profile fresh without re-subscribing the channel. Synced
  // after each commit; messages only arrive via transport callbacks, which run
  // long after the effect has.
  const onMessageRef = useRef(onMessage)
  const profileRef = useRef(profile)
  useEffect(() => {
    onMessageRef.current = onMessage
    profileRef.current = profile
  })

  const testMode = !isSupabaseConfigured

  useEffect(() => {
    if (!hasTransport) return
    const factory: TransportFactory<R, S> = isSupabaseConfigured
      ? createSupabaseTransport
      : createBroadcastTransport

    const transport = factory({
      code,
      role,
      clientId: identity.clientId,
      joinedAt: identity.joinedAt,
      profile: profileRef.current,
      channelPrefix,
      handlers: {
        onMessage: (m) => onMessageRef.current(m),
        onStatus: setStatus,
        onRoster: setMembers,
      },
    })
    transportRef.current = transport

    return () => {
      transport.close()
      transportRef.current = null
      setMembers([])
    }
  }, [code, role, channelPrefix, identity])

  const send = useCallback((msg: RoomMessage<R, S>) => transportRef.current?.send(msg), [])
  const setInGame = useCallback((inGame: boolean) => transportRef.current?.setInGame(inGame), [])

  return { status, members, clientId: identity.clientId, testMode, send, setInGame }
}
