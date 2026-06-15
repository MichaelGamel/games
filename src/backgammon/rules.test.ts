import { describe, expect, it } from 'vitest'
import {
  expandDice,
  hasAnyMove,
  legalHops,
  legalSequences,
  resolveBackgammonTurn,
  rollBackgammonDice,
  selectableHops,
} from './rules'
import { initialBackgammonState } from './backgammonReducer'
import { BAR, OFF } from './config'
import type { BackgammonBoard, BackgammonGameState, DieValue } from './types'

const empty = (): BackgammonBoard => ({ points: new Array<number>(24).fill(0), bar: [0, 0], off: [0, 0] })
const stateWith = (board: BackgammonBoard): BackgammonGameState => ({ ...initialBackgammonState, board })
const has = (hops: { from: number; to: number; die: number }[], from: number, to: number, die: number) =>
  hops.some((h) => h.from === from && h.to === to && h.die === die)

describe('dice', () => {
  it('rolls deterministically from an injected RNG', () => {
    const seq = [0, 0.99]
    let i = 0
    const rng = () => seq[i++]
    expect(rollBackgammonDice(rng)).toEqual([1, 6])
  })

  it('expands doubles to four moves', () => {
    expect(expandDice([3, 3] as DieValue[])).toEqual([3, 3, 3, 3])
    expect(expandDice([2, 5] as DieValue[])).toEqual([2, 5])
  })
})

describe('legalHops', () => {
  it('forces entering from the bar before any other move', () => {
    const b = empty()
    b.bar[0] = 1
    b.points[10] = 3 // checkers elsewhere are irrelevant while on the bar
    const hops = legalHops(b, 0, [3, 4] as DieValue[])
    expect(hops.length).toBeGreaterThan(0)
    expect(hops.every((h) => h.from === BAR)).toBe(true)
    expect(has(hops, BAR, 21, 3)).toBe(true) // 24 - 3
    expect(has(hops, BAR, 20, 4)).toBe(true) // 24 - 4
  })

  it('rejects entry onto a blocked point', () => {
    const b = empty()
    b.bar[0] = 1
    b.points[23] = -2 // seat 1 holds the 1-entry point
    const hops = legalHops(b, 0, [1, 2] as DieValue[])
    expect(has(hops, BAR, 23, 1)).toBe(false)
    expect(has(hops, BAR, 22, 2)).toBe(true)
  })

  it('rejects landing on a blocked point and flags hits', () => {
    const b = empty()
    b.points[10] = 1
    b.points[7] = -2 // blocked
    b.points[6] = -1 // blot
    const hops = legalHops(b, 0, [3, 4] as DieValue[])
    expect(has(hops, 10, 7, 3)).toBe(false)
    const hit = hops.find((h) => h.from === 10 && h.to === 6 && h.die === 4)
    expect(hit?.hit).toBe(true)
  })

  it('bears off exactly and by overflow', () => {
    const exact = empty()
    exact.points[5] = 1
    exact.points[2] = 1
    exact.points[0] = 1
    const hops = legalHops(exact, 0, [6, 3] as DieValue[])
    expect(has(hops, 5, OFF, 6)).toBe(true)
    expect(has(hops, 2, OFF, 3)).toBe(true)

    const overflow = empty()
    overflow.points[2] = 2 // highest occupied home point is value 3
    expect(has(legalHops(overflow, 0, [6] as DieValue[]), 2, OFF, 6)).toBe(true)

    const blocked = empty()
    blocked.points[5] = 1 // a checker sits higher, so a 6 must come off there
    blocked.points[2] = 1
    const ho = legalHops(blocked, 0, [6] as DieValue[])
    expect(has(ho, 5, OFF, 6)).toBe(true)
    expect(has(ho, 2, OFF, 6)).toBe(false)
  })
})

describe('legalSequences', () => {
  it('requires using both dice when possible', () => {
    const b = empty()
    b.points[10] = 1
    const seqs = legalSequences(b, 0, [3, 4] as DieValue[])
    expect(seqs.length).toBeGreaterThan(0)
    expect(seqs.every((s) => s.length === 2)).toBe(true)
  })

  it('forces the larger die when only one can be played', () => {
    const b = empty()
    b.points[7] = 1
    b.points[0] = -2 // blocks both continuations after either single die
    const seqs = legalSequences(b, 0, [1, 6] as DieValue[])
    expect(seqs).toHaveLength(1)
    expect(seqs[0]).toHaveLength(1)
    expect(seqs[0][0].die).toBe(6)
  })

  it('reports no legal move when the bar entry is shut out', () => {
    const b = empty()
    b.bar[0] = 1
    for (const p of [18, 19, 20, 21, 22, 23]) b.points[p] = -2
    expect(hasAnyMove(b, 0, [1, 2] as DieValue[])).toBe(false)
    expect(legalSequences(b, 0, [1, 2] as DieValue[])[0]).toHaveLength(0)
  })

  it('selectableHops offers the heads of maximal sequences', () => {
    const b = empty()
    b.points[10] = 1
    const heads = selectableHops(b, 0, [3, 4] as DieValue[])
    expect(has(heads, 10, 7, 3)).toBe(true)
    expect(has(heads, 10, 6, 4)).toBe(true)
  })
})

describe('resolveBackgammonTurn', () => {
  it('flags a no-move turn', () => {
    const r = resolveBackgammonTurn(stateWith(empty()), 0, [1, 2] as DieValue[], [])
    expect(r.noLegalMoves).toBe(true)
    expect(r.isWin).toBe(false)
  })

  it('classifies a single win (loser bore off a checker)', () => {
    const b = empty()
    b.points[0] = 1
    b.off[0] = 14
    b.off[1] = 1
    const r = resolveBackgammonTurn(stateWith(b), 0, [1, 5] as DieValue[], [
      { from: 0, to: OFF, die: 1, hit: false },
    ])
    expect(r.isWin).toBe(true)
    expect(r.winReason).toBe('single')
  })

  it('classifies a gammon (loser bore off nothing, none trapped)', () => {
    const b = empty()
    b.points[0] = 1
    b.off[0] = 14
    b.points[12] = -15 // loser stuck mid-board, not in the winner's home or bar
    const r = resolveBackgammonTurn(stateWith(b), 0, [1, 5] as DieValue[], [
      { from: 0, to: OFF, die: 1, hit: false },
    ])
    expect(r.winReason).toBe('gammon')
  })

  it('classifies a backgammon (loser still in the winner home or on the bar)', () => {
    const b = empty()
    b.points[0] = 1
    b.off[0] = 14
    b.points[3] = -1 // loser checker inside winner (seat 0) home board
    b.points[12] = -14
    const r = resolveBackgammonTurn(stateWith(b), 0, [1, 5] as DieValue[], [
      { from: 0, to: OFF, die: 1, hit: false },
    ])
    expect(r.winReason).toBe('backgammon')
  })
})
