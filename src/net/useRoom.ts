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
import type { PlayerProfile, RoomMember, RoomMessage, RoomStatus, Role, Transport } from './types'

interface UseRoomArgs {
  code: string
  role: Role
  profile: PlayerProfile
  onMessage: (msg: RoomMessage) => void
}

export interface RoomApi {
  status: RoomStatus
  /** Everyone currently connected to the room, including this client. */
  members: RoomMember[]
  /** This client's stable id (its entry in `members`). */
  clientId: string
  /** True when running on the same-browser dev fallback (no Supabase keys). */
  testMode: boolean
  send: (msg: RoomMessage) => void
  /** Flip our in-game presence flag (locks the room to late joiners). */
  setInGame: (inGame: boolean) => void
}

const genId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

export function useRoom({ code, role, profile, onMessage }: UseRoomArgs): RoomApi {
  const [status, setStatus] = useState<RoomStatus>('connecting')
  const [members, setMembers] = useState<RoomMember[]>([])
  const transportRef = useRef<Transport | null>(null)

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
    const factory = isSupabaseConfigured
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
  }, [code, role])

  const send = useCallback((msg: RoomMessage) => transportRef.current?.send(msg), [])
  const setInGame = useCallback((inGame: boolean) => transportRef.current?.setInGame(inGame), [])

  return { status, members, clientId: idRef.current, testMode, send, setInGame }
}
