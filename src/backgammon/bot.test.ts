import { describe, expect, it } from 'vitest'
import { chooseBotSequence } from './bot'
import { legalSequences } from './rules'
import { initialBackgammonState } from './backgammonReducer'
import type { BackgammonBoard, BackgammonGameState, DieValue } from './types'

const empty = (): BackgammonBoard => ({ points: new Array<number>(24).fill(0), bar: [0, 0], off: [0, 0] })
const stateWith = (board: BackgammonBoard): BackgammonGameState => ({ ...initialBackgammonState, board })

describe('chooseBotSequence', () => {
  it('returns a sequence drawn from the legal set', () => {
    const b = empty()
    b.points[10] = 1
    const seq = chooseBotSequence(stateWith(b), 0, [3, 4] as DieValue[], 'smart')
    const legal = legalSequences(b, 0, [3, 4] as DieValue[])
    const key = (s: typeof seq) => s.map((m) => `${m.from}:${m.to}:${m.die}`).join('|')
    expect(legal.map(key)).toContain(key(seq))
    expect(seq).toHaveLength(2)
  })

  it('prefers a hit over a quiet advance', () => {
    const b = empty()
    b.points[10] = 1 // can hit the blot at 7 with a 3
    b.points[6] = 1 // or quietly advance to 3
    b.points[7] = -1 // opponent blot
    const seq = chooseBotSequence(stateWith(b), 0, [3] as DieValue[], 'smart')
    expect(seq.some((m) => m.hit)).toBe(true)
  })

  it('returns an empty sequence when nothing is playable', () => {
    const b = empty()
    b.bar[0] = 1
    for (const p of [18, 19, 20, 21, 22, 23]) b.points[p] = -2
    expect(chooseBotSequence(stateWith(b), 0, [1, 2] as DieValue[])).toEqual([])
  })
})
