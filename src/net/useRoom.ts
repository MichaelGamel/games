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
  const [status, setStatus] = useState<RoomStatus>('connecting')
  const [members, setMembers] = useState<RoomMember[]>([])
  const transportRef = useRef<Transport<R, S> | null>(null)

  // Stable identity for this connection, created once.
  const idRef = useRef<string>('')
  if (!idRef.current) idRef.current = genId()
  const joinedAtRef = useRef<number>(0)
  if (!joinedAtRef.current) joinedAtRef.current = Date.now()

  // Keep callbacks/profile fresh without re-subscribing the channel.
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage
  const profileRef = useRef(profile)
  profileRef.current = profile

  const testMode = !isSupabaseConfigured

  useEffect(() => {
    const factory: TransportFactory<R, S> | null = isSupabaseConfigured
      ? createSupabaseTransport
      : import.meta.env.DEV
        ? createBroadcastTransport
        : null

    if (!factory) {
      setStatus('error')
      return
    }

    const transport = factory({
      code,
      role,
      clientId: idRef.current,
      joinedAt: joinedAtRef.current,
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
  }, [code, role, channelPrefix])

  const send = useCallback((msg: RoomMessage<R, S>) => transportRef.current?.send(msg), [])
  const setInGame = useCallback((inGame: boolean) => transportRef.current?.setInGame(inGame), [])

  return { status, members, clientId: idRef.current, testMode, send, setInGame }
}
