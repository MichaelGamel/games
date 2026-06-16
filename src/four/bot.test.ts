import { describe, expect, it } from 'vitest'
import { dropRow, emptyBoard, findWinLine, legalColumns } from './rules'
import { chooseFourMove } from './bot'
import { COLS, ROWS } from './config'
import type { FourBotLevel } from './types'

/** Build a board from bottom-up column stacks, e.g. {3: [0, 1]} = seat 0 then 1. */
function boardFrom(stacks: Record<number, number[]>): number[][] {
  const board = emptyBoard()
  for (const [col, seats] of Object.entries(stacks)) {
    seats.forEach((seat, i) => {
      board[ROWS - 1 - i][Number(col)] = seat
    })
  }
  return board
}

/** A tiny deterministic RNG (mulberry32) so the `easy` level is reproducible. */
function rngFrom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Self-play one full game between two bot levels; returns the winning seat or null (draw). */
function playGame(level0: FourBotLevel, level1: FourBotLevel, rng: () => number): number | null {
  const board = emptyBoard()
  let toMove = 0
  for (let move = 0; move < ROWS * COLS; move++) {
    const legal = legalColumns(board)
    if (legal.length === 0) return null
    const level = toMove === 0 ? level0 : level1
    const col = chooseFourMove(board, toMove, (toMove + 1) % 2, level, rng)
    const row = dropRow(board, col)
    expect(row).not.toBeNull()
    board[row!][col] = toMove
    if (findWinLine(board, row!, col, toMove)) return toMove
    toMove = (toMove + 1) % 2
  }
  return null
}

describe('bot — easy', () => {
  it('takes a free win when one is on offer', () => {
    const board = boardFrom({ 1: [0], 2: [0], 3: [0] })
    expect([0, 4]).toContain(chooseFourMove(board, 0, 1, 'easy', rngFrom(1)))
  })

  it('blocks when the dice fall that way, but not always', () => {
    const board = boardFrom({ 1: [1], 2: [1], 3: [1] })
    // rng() < 0.5 path → blocks at 0 or 4.
    expect([0, 4]).toContain(chooseFourMove(board, 0, 1, 'easy', () => 0))
    // rng() ≥ 0.5 path → skips the block and plays a random legal column.
    const col = chooseFourMove(board, 0, 1, 'easy', () => 0.9)
    expect(legalColumns(board)).toContain(col)
  })
})

describe('bot — medium', () => {
  it('takes an immediate win', () => {
    const board = boardFrom({ 1: [0], 2: [0], 3: [0] })
    expect([0, 4]).toContain(chooseFourMove(board, 0, 1, 'medium'))
  })

  it('blocks the opponent’s immediate win', () => {
    const board = boardFrom({ 1: [1], 2: [1], 3: [1] })
    expect([0, 4]).toContain(chooseFourMove(board, 0, 1, 'medium'))
  })
})

describe('bot — hard', () => {
  it('opens in the center', () => {
    expect(chooseFourMove(emptyBoard(), 0, 1, 'hard')).toBe(3)
  })

  it('takes an immediate win', () => {
    const board = boardFrom({ 1: [0], 2: [0], 3: [0] })
    expect([0, 4]).toContain(chooseFourMove(board, 0, 1, 'hard'))
  })

  it('blocks the opponent’s immediate win', () => {
    const board = boardFrom({ 1: [1], 2: [1], 3: [1] })
    expect([0, 4]).toContain(chooseFourMove(board, 0, 1, 'hard'))
  })

  it('never plays an illegal column mid-game', () => {
    const board = boardFrom({ 3: [0, 1, 0], 2: [1, 0], 4: [1] })
    const col = chooseFourMove(board, 0, 1, 'hard')
    expect(legalColumns(board)).toContain(col)
  })

  it('moving first, beats the easy bot', () => {
    expect(playGame('hard', 'easy', rngFrom(7))).toBe(0)
  })

  it('moving second, does not lose to the medium bot', () => {
    // 0 = medium (first), 1 = hard (second). Hard must not be beaten.
    expect(playGame('medium', 'hard', rngFrom(3))).not.toBe(0)
  })
})
