import { describe, expect, it } from 'vitest'
import { computeRoster, orderMembers, MAX_PLAYERS } from './roster'
import type { RoomMember } from './types'

let seq = 0
function member(partial: Partial<RoomMember> & { name: string; color: string }): RoomMember {
  seq += 1
  return {
    clientId: partial.clientId ?? `c${seq}`,
    role: partial.role ?? 'guest',
    name: partial.name,
    color: partial.color,
    joinedAt: partial.joinedAt ?? seq,
    inGame: partial.inGame ?? false,
  }
}

const host = (over: Partial<RoomMember> = {}) =>
  member({ name: 'Host', color: '#ef4444', role: 'host', joinedAt: 100, ...over })

describe('orderMembers', () => {
  it('always seats the host first, then guests by join time', () => {
    const g1 = member({ name: 'A', color: '#3b82f6', joinedAt: 5 })
    const g2 = member({ name: 'B', color: '#10b981', joinedAt: 1 })
    const h = host({ joinedAt: 999 }) // host joined "last" by clock, still seat 0

    const ordered = orderMembers([g1, g2, h])
    expect(ordered.map((m) => m.name)).toEqual(['Host', 'B', 'A'])
  })

  it('breaks ties by clientId so all clients agree', () => {
    const a = member({ clientId: 'b', name: 'A', color: '#3b82f6', joinedAt: 1 })
    const b = member({ clientId: 'a', name: 'B', color: '#10b981', joinedAt: 1 })
    expect(orderMembers([a, b]).map((m) => m.clientId)).toEqual(['a', 'b'])
  })
})

describe('computeRoster', () => {
  it('seats everyone when names and colors are unique', () => {
    const members = [
      host(),
      member({ name: 'A', color: '#3b82f6' }),
      member({ name: 'B', color: '#10b981' }),
      member({ name: 'C', color: '#f59e0b' }),
    ]
    const { seats, rejected } = computeRoster(members)
    expect(seats).toHaveLength(4)
    expect(rejected.size).toBe(0)
  })

  it('rejects the player beyond the capacity as full', () => {
    const fifth = member({ clientId: 'fifth', name: 'E', color: '#ec4899', joinedAt: 5 })
    const members = [
      host({ joinedAt: 0 }),
      member({ name: 'A', color: '#3b82f6', joinedAt: 1 }),
      member({ name: 'B', color: '#10b981', joinedAt: 2 }),
      member({ name: 'C', color: '#f59e0b', joinedAt: 3 }),
      fifth,
    ]
    const { seats, rejected } = computeRoster(members)
    expect(seats).toHaveLength(MAX_PLAYERS)
    expect(rejected.get('fifth')).toBe('full')
  })

  it('rejects a duplicate name (case-insensitive, trimmed)', () => {
    const dup = member({ clientId: 'dup', name: '  hOsT ', color: '#3b82f6', joinedAt: 5 })
    const { seats, rejected } = computeRoster([host({ joinedAt: 0 }), dup])
    expect(seats).toHaveLength(1)
    expect(rejected.get('dup')).toBe('name-taken')
  })

  it('rejects a duplicate color', () => {
    const dup = member({ clientId: 'dup', name: 'A', color: '#ef4444', joinedAt: 5 })
    const { rejected } = computeRoster([host({ joinedAt: 0, color: '#ef4444' }), dup])
    expect(rejected.get('dup')).toBe('color-taken')
  })

  it('rejects newcomers once the match is in progress', () => {
    const playing = host({ joinedAt: 0, inGame: true })
    const playing2 = member({ name: 'A', color: '#3b82f6', joinedAt: 1, inGame: true })
    const late = member({ clientId: 'late', name: 'Z', color: '#8b5cf6', joinedAt: 9 })
    const { seats, rejected } = computeRoster([playing, playing2, late])
    expect(seats.map((s) => s.name)).toEqual(['Host', 'A'])
    expect(rejected.get('late')).toBe('in-progress')
  })

  it('does not let a rejected member block a later valid one', () => {
    const members = [
      host({ joinedAt: 0, color: '#ef4444' }),
      member({ clientId: 'dup', name: 'A', color: '#ef4444', joinedAt: 1 }), // color clash → rejected
      member({ clientId: 'ok', name: 'B', color: '#10b981', joinedAt: 2 }), // distinct → seated
    ]
    const { seats, rejected } = computeRoster(members)
    expect(rejected.get('dup')).toBe('color-taken')
    expect(seats.some((s) => s.clientId === 'ok')).toBe(true)
    expect(seats.some((s) => s.clientId === 'dup')).toBe(false)
  })
})
