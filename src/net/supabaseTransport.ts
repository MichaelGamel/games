/**
 * Supabase Realtime transport — the production path for cross-computer play.
 *
 * Uses a single channel per room: Broadcast carries game messages, Presence
 * tells us who is connected (and their name/color/seat). No database tables are
 * involved. Presence is keyed by a unique per-connection clientId so up to four
 * players coexist without overwriting each other.
 */
import type { RoomMember, RoomMessage, Transport, TransportArgs } from './types'
import { DEFAULT_CHANNEL_PREFIX } from './types'
import { supabase } from './supabaseClient'

interface PresenceMeta {
  clientId: string
  role: 'host' | 'guest'
  name: string
  color: string
  joinedAt: number
  inGame: boolean
}

export const createSupabaseTransport = <R, S>({
  code,
  role,
  clientId,
  joinedAt,
  profile,
  handlers,
  channelPrefix,
}: TransportArgs<R, S>): Transport<R, S> => {
  const client = supabase
  if (!client) {
    handlers.onStatus('error')
    return { send: () => {}, setInGame: () => {}, close: () => {} }
  }

  // The presence meta we publish; mutated by setInGame and re-tracked.
  const meta: PresenceMeta = {
    clientId,
    role,
    name: profile.name,
    color: profile.color,
    joinedAt,
    inGame: false,
  }

  const channel = client.channel(`${channelPrefix ?? DEFAULT_CHANNEL_PREFIX}-${code}`, {
    config: { broadcast: { self: false }, presence: { key: clientId } },
  })

  const resolveRoster = () => {
    const state = channel.presenceState<PresenceMeta>()
    const members: RoomMember[] = []
    for (const metas of Object.values(state)) {
      const m = metas[0]
      if (!m) continue
      members.push({
        clientId: m.clientId,
        role: m.role,
        name: m.name,
        color: m.color,
        joinedAt: m.joinedAt,
        inGame: m.inGame,
      })
    }
    handlers.onRoster(members)
  }

  channel
    .on('broadcast', { event: 'msg' }, ({ payload }) =>
      handlers.onMessage(payload as RoomMessage<R, S>),
    )
    .on('presence', { event: 'sync' }, resolveRoster)
    .on('presence', { event: 'join' }, resolveRoster)
    .on('presence', { event: 'leave' }, resolveRoster)
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        handlers.onStatus('connected')
        await channel.track(meta)
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        handlers.onStatus('error')
      }
    })

  return {
    send: (msg) => {
      void channel.send({ type: 'broadcast', event: 'msg', payload: msg })
    },
    setInGame: (inGame) => {
      meta.inGame = inGame
      void channel.track(meta)
    },
    close: () => {
      void channel.unsubscribe()
      client.removeChannel(channel)
    },
  }
}
