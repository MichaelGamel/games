import { describe, expect, it } from 'vitest'
import {
  allHome,
  applyHop,
  barEntryPoint,
  direction,
  isBlocked,
  isBlot,
  pipCount,
  pipValue,
  startingBoard,
  step,
} from './board'
import { BAR, OFF } from './config'
import type { BackgammonBoard } from './types'

const empty = (): BackgammonBoard => ({ points: new Array<number>(24).fill(0), bar: [0, 0], off: [0, 0] })

describe('starting position', () => {
  it('gives each seat a pip count of 167', () => {
    const b = startingBoard()
    expect(pipCount(b, 0)).toBe(167)
    expect(pipCount(b, 1)).toBe(167)
  })

  it('seats 15 checkers each', () => {
    const b = startingBoard()
    const own = (seat: number) =>
      b.points.reduce((n, v) => n + (seat === 0 ? Math.max(0, v) : Math.max(0, -v)), 0)
    expect(own(0)).toBe(15)
    expect(own(1)).toBe(15)
  })
})

describe('geometry', () => {
  it('moves seat 0 toward 0 and seat 1 toward 23', () => {
    expect(direction(0)).toBe(-1)
    expect(direction(1)).toBe(1)
    expect(step(0, 10, 3)).toBe(7)
    expect(step(1, 10, 3)).toBe(13)
  })

  it('enters from the bar into the far quadrant', () => {
    expect(barEntryPoint(0, 1)).toBe(23)
    expect(barEntryPoint(0, 6)).toBe(18)
    expect(barEntryPoint(1, 1)).toBe(0)
    expect(barEntryPoint(1, 6)).toBe(5)
  })

  it('detects blocks and blots from the opponent', () => {
    const b = empty()
    b.points[7] = -2 // two of seat 1's checkers
    b.points[8] = -1 // a seat 1 blot
    expect(isBlocked(b, 0, 7)).toBe(true)
    expect(isBlocked(b, 0, 8)).toBe(false)
    expect(isBlot(b, 0, 8)).toBe(true)
    expect(isBlot(b, 0, 7)).toBe(false)
  })

  it('knows when all checkers are home', () => {
    const b = empty()
    b.points[5] = 8
    b.points[2] = 7
    expect(allHome(b, 0)).toBe(true)
    b.points[6] = 1 // one checker outside the home board
    expect(allHome(b, 0)).toBe(false)
    b.points[6] = 0
    b.bar[0] = 1
    expect(allHome(b, 0)).toBe(false)
  })

  it('pip value is the distance to bearing off', () => {
    expect(pipValue(0, 0)).toBe(1)
    expect(pipValue(0, 23)).toBe(24)
    expect(pipValue(1, 23)).toBe(1)
    expect(pipValue(1, 0)).toBe(24)
  })
})

describe('applyHop', () => {
  it('moves a checker between points immutably', () => {
    const b = empty()
    b.points[10] = 2
    const next = applyHop(b, 0, { from: 10, to: 7 })
    expect(next.points[10]).toBe(1)
    expect(next.points[7]).toBe(1)
    expect(b.points[10]).toBe(2) // original untouched
  })

  it('sends a hit opponent blot to the bar', () => {
    const b = empty()
    b.points[10] = 1
    b.points[7] = -1
    const next = applyHop(b, 0, { from: 10, to: 7, hit: true })
    expect(next.points[7]).toBe(1)
    expect(next.bar[1]).toBe(1)
  })

  it('enters from the bar', () => {
    const b = empty()
    b.bar[0] = 1
    const next = applyHop(b, 0, { from: BAR, to: 23 })
    expect(next.bar[0]).toBe(0)
    expect(next.points[23]).toBe(1)
  })

  it('bears a checker off', () => {
    const b = empty()
    b.points[0] = 1
    const next = applyHop(b, 0, { from: 0, to: OFF })
    expect(next.points[0]).toBe(0)
    expect(next.off[0]).toBe(1)
  })
})
