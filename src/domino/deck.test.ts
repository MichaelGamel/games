import { describe, it, expect } from 'vitest'
import { buildSet, deal, shuffle, startingSeat, tileById } from './deck'
import type { DominoTile } from './types'

const ids = (tiles: DominoTile[]) => tiles.map((t) => t.id).join(',')

describe('buildSet', () => {
  const set = buildSet()

  it('has exactly 28 tiles with ids d0..d27', () => {
    expect(set).toHaveLength(28)
    expect(new Set(set.map((t) => t.id)).size).toBe(28)
    expect(set[0].id).toBe('d0')
    expect(set[27].id).toBe('d27')
  })

  it('is canonical (a <= b) and covers every unordered pair exactly once', () => {
    const seen = new Set<string>()
    for (const t of set) {
      expect(t.a).toBeLessThanOrEqual(t.b)
      seen.add(`${t.a}-${t.b}`)
    }
    expect(seen.size).toBe(28)
  })

  it('has 7 doubles and a total pip count of 168', () => {
    expect(set.filter((t) => t.a === t.b)).toHaveLength(7)
    expect(set.reduce((s, t) => s + t.a + t.b, 0)).toBe(168)
  })

  it('tileById resolves stable ids', () => {
    expect(tileById('d0')).toEqual({ id: 'd0', a: 0, b: 0 })
    expect(tileById('d27')).toEqual({ id: 'd27', a: 6, b: 6 })
    expect(tileById('nope')).toBeUndefined()
  })
})

describe('shuffle', () => {
  it('is deterministic for a given seed', () => {
    expect(ids(shuffle(123))).toBe(ids(shuffle(123)))
  })

  it('differs across seeds but stays a permutation of the set', () => {
    const a = shuffle(1)
    const b = shuffle(2)
    expect(ids(a)).not.toBe(ids(b))
    expect(new Set(a.map((t) => t.id))).toEqual(new Set(buildSet().map((t) => t.id)))
  })
})

describe('deal', () => {
  it('gives the right hand size per player count and conserves all 28 tiles', () => {
    for (const [count, hand, yard] of [
      [2, 7, 14],
      [3, 5, 13],
      [4, 5, 8],
    ] as const) {
      const { hands, boneyard } = deal(shuffle(7), count, hand)
      expect(hands).toHaveLength(count)
      hands.forEach((h) => expect(h).toHaveLength(hand))
      expect(boneyard).toHaveLength(yard)
      const all = [...hands.flat(), ...boneyard].map((t) => t.id)
      expect(new Set(all).size).toBe(28)
    }
  })

  it('does not mutate its input', () => {
    const stock = shuffle(9)
    const before = ids(stock)
    deal(stock, 2, 7)
    expect(ids(stock)).toBe(before)
  })
})

describe('startingSeat', () => {
  it('picks the holder of the highest double', () => {
    const hands = [
      [tileById('d0')!, tileById('d8')!], // 0-0, 1-2
      [tileById('d18')!, tileById('d1')!], // 3-3, 0-1
    ]
    expect(startingSeat(hands)).toEqual({ seat: 1, tileId: 'd18' })
  })

  it('falls back to the heaviest tile when no one holds a double', () => {
    const hands = [
      [tileById('d8')!], // 1-2 (weight 3)
      [tileById('d24')!], // 4-6 (weight 10)
    ]
    expect(startingSeat(hands).seat).toBe(1)
    expect(startingSeat(hands).tileId).toBe('d24')
  })

  it('is deterministic', () => {
    const hands = deal(shuffle(42), 2, 7).hands
    expect(startingSeat(hands)).toEqual(startingSeat(hands))
  })
})
