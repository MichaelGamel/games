/**
 * Same-browser transport using the BroadcastChannel API.
 *
 * Used automatically in development when Supabase keys aren't set, so you can
 * test the full multiplayer flow (up to four tabs) without any backend. It does
 * NOT work across different computers — that's what Supabase is for.
 *
 * Presence is emulated with a small gossip protocol: a new tab announces itself
 * with `hello`; everyone already present replies once with `welcome` so the
 * newcomer learns the full roster. `welcome` is also reused to broadcast an
 * in-game flag change. `bye` removes a tab on close.
 */
import type { RoomMember, RoomMessage, TransportFactory } from './types'

type Wire =
  | { kind: 'msg'; msg: RoomMessage }
  | { kind: 'hello' | 'welcome'; member: RoomMember }
  | { kind: 'bye'; clientId: string }

export const createBroadcastTransport: TransportFactory = ({
  code,
  role,
  clientId,
  joinedAt,
  profile,
  handlers,
}) => {
  const bc = new BroadcastChannel(`sl-room-${code}`)

  // Our own presence; mutated by setInGame and re-gossiped.
  const self: RoomMember = {
    clientId,
    role,
    name: profile.name,
    color: profile.color,
    joinedAt,
    inGame: false,
  }

  // Roster keyed by clientId, seeded with ourselves.
  const members = new Map<string, RoomMember>([[clientId, self]])
  const emit = () => handlers.onRoster([...members.values()])

  bc.onmessage = (e: MessageEvent<Wire>) => {
    const data = e.data
    if (data.kind === 'msg') {
      handlers.onMessage(data.msg)
    } else if (data.kind === 'hello') {
      if (data.member.clientId === clientId) return
      members.set(data.member.clientId, data.member)
      // Reply so the newcomer learns about us (welcome never triggers a reply).
      bc.postMessage({ kind: 'welcome', member: self } satisfies Wire)
      emit()
    } else if (data.kind === 'welcome') {
      if (data.member.clientId === clientId) return
      members.set(data.member.clientId, data.member)
      emit()
    } else if (data.kind === 'bye') {
      if (members.delete(data.clientId)) emit()
    }
  }

  // Announce ourselves shortly after mount (lets other tabs attach first).
  const helloTimer = setTimeout(() => {
    handlers.onStatus('connected')
    emit()
    bc.postMessage({ kind: 'hello', member: self } satisfies Wire)
  }, 60)

  // Mirror real presence: closing the tab counts as leaving the room (the
  // Supabase transport gets this for free when the socket drops).
  const onPageHide = () => bc.postMessage({ kind: 'bye', clientId } satisfies Wire)
  window.addEventListener('pagehide', onPageHide)

  return {
    send: (msg) => bc.postMessage({ kind: 'msg', msg } satisfies Wire),
    setInGame: (inGame) => {
      self.inGame = inGame
      members.set(clientId, self)
      bc.postMessage({ kind: 'welcome', member: self } satisfies Wire)
      emit()
    },
    close: () => {
      clearTimeout(helloTimer)
      window.removeEventListener('pagehide', onPageHide)
      bc.postMessage({ kind: 'bye', clientId } satisfies Wire)
      bc.close()
    },
  }
}
