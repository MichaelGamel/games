/**
 * Pure room-roster rules: capacity and name/color uniqueness for a session.
 *
 * Kept free of React, Supabase, and timers so it can be unit-tested in isolation
 * and shared by every transport. Because each client publishes the *same*
 * per-member `joinedAt` via presence, all clients fold the roster with identical
 * rules and reach the same seats/rejections — consistent even across machines
 * with skewed clocks (the numbers are arbitrary, but everyone sees the same set).
 */
import { MAX_PLAYERS, MIN_PLAYERS } from '../game/config'
import type { RoomMember } from './types'

// Re-exported so room code keeps one import site for roster rules.
export { MAX_PLAYERS, MIN_PLAYERS }

export type RejectReason = 'full' | 'name-taken' | 'color-taken'

/** Host always seats first; guests follow in join order, tie-broken by id. */
export function orderMembers(members: readonly RoomMember[]): RoomMember[] {
  return [...members].sort((a, b) => {
    if (a.role !== b.role) return a.role === 'host' ? -1 : 1
    if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt
    return a.clientId < b.clientId ? -1 : 1
  })
}

const normalizeName = (name: string) => name.trim().toLowerCase()

export interface RosterResult {
  /** Accepted players, in turn order (the seated / active lineup). */
  seats: RoomMember[]
  /** Late joiners awaiting the host's approval — a match is running and a seat
   *  is open for them. Empty before the match starts. */
  pending: RoomMember[]
  /** Why each non-seated, non-pending member was turned away. */
  rejected: Map<string, RejectReason>
}

/**
 * Fold the ordered members into seats, pending joiners, and rejections.
 *
 * Before the match starts, newcomers fill seats directly (the host then starts).
 * Once it is running, players already in it keep their seats and any newcomer
 * waits in `pending` for the host to approve them — unless the room is at
 * capacity ({@link MAX_PLAYERS}), in which case they are rejected as `full`
 * (and never surfaced to the host). Name/color collisions are always rejected so
 * a joiner goes back and picks again. Pending joiners reserve the open seats in
 * join order, so a fifth arrival is turned away rather than queued.
 */
export function computeRoster(members: readonly RoomMember[]): RosterResult {
  const ordered = orderMembers(members)
  const seats: RoomMember[] = ordered.filter((m) => m.inGame)
  const pending: RoomMember[] = []
  const rejected = new Map<string, RejectReason>()
  const running = seats.length > 0

  const clash = (m: RoomMember): RejectReason | null => {
    const taken = [...seats, ...pending]
    if (taken.some((s) => normalizeName(s.name) === normalizeName(m.name))) return 'name-taken'
    if (taken.some((s) => s.color === m.color)) return 'color-taken'
    return null
  }

  for (const member of ordered) {
    if (member.inGame) continue // already seated above

    // Open seats are shared by current seats and already-reserved pending ones.
    if (seats.length + pending.length >= MAX_PLAYERS) {
      rejected.set(member.clientId, 'full')
      continue
    }
    const reason = clash(member)
    if (reason) {
      rejected.set(member.clientId, reason)
      continue
    }
    if (running) pending.push(member)
    else seats.push(member)
  }

  return { seats, pending, rejected }
}

/** User-facing copy for a rejection. */
export function reasonText(reason: RejectReason): { title: string; detail: string } {
  switch (reason) {
    case 'full':
      return {
        title: 'Room is full',
        detail: `This room already has the maximum of ${MAX_PLAYERS} players. Ask for another room code.`,
      }
    case 'name-taken':
      return {
        title: 'That name is taken',
        detail: 'Someone in this room is already using that name. Go back and pick another.',
      }
    case 'color-taken':
      return {
        title: 'That color is taken',
        detail: 'Someone in this room already has that token color. Go back and choose a different one.',
      }
  }
}
