/**
 * Pure room-roster rules: capacity and name/color uniqueness for a session.
 *
 * Kept free of React, Supabase, and timers so it can be unit-tested in isolation
 * and shared by every transport. Because each client publishes the *same*
 * per-member `joinedAt` via presence, all clients fold the roster with identical
 * rules and reach the same seats/rejections — consistent even across machines
 * with skewed clocks (the numbers are arbitrary, but everyone sees the same set).
 */
import type { RoomMember } from './types'

/** Hard ceiling on players per game session. */
export const MAX_PLAYERS = 4

/** Minimum players the host needs before the match can start. */
export const MIN_PLAYERS = 2

export type RejectReason = 'full' | 'name-taken' | 'color-taken' | 'in-progress'

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
  /** Accepted players, in turn order. */
  seats: RoomMember[]
  /** Why each non-seated member was turned away. */
  rejected: Map<string, RejectReason>
}

/**
 * Fold the ordered members into the seated players and the rejected joiners.
 * A member is rejected when the game already started before they arrived, the
 * room is full, or their name/color collides with an already-seated player.
 */
export function computeRoster(members: readonly RoomMember[]): RosterResult {
  const seats: RoomMember[] = []
  const rejected = new Map<string, RejectReason>()

  for (const member of orderMembers(members)) {
    // Members already in the running game keep their seat regardless.
    if (member.inGame) {
      seats.push(member)
      continue
    }
    // Once anyone has started, the room is locked to newcomers.
    if (seats.some((s) => s.inGame)) {
      rejected.set(member.clientId, 'in-progress')
      continue
    }
    if (seats.length >= MAX_PLAYERS) {
      rejected.set(member.clientId, 'full')
      continue
    }
    if (seats.some((s) => normalizeName(s.name) === normalizeName(member.name))) {
      rejected.set(member.clientId, 'name-taken')
      continue
    }
    if (seats.some((s) => s.color === member.color)) {
      rejected.set(member.clientId, 'color-taken')
      continue
    }
    seats.push(member)
  }

  return { seats, rejected }
}

/** User-facing copy for a rejection. */
export function reasonText(reason: RejectReason): { title: string; detail: string } {
  switch (reason) {
    case 'full':
      return {
        title: 'Room is full',
        detail: `This game already has ${MAX_PLAYERS} players. Ask for another room code.`,
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
    case 'in-progress':
      return {
        title: 'Game already in progress',
        detail: 'This match has already started. Ask the host to start a new room.',
      }
  }
}
