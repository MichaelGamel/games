import { describe, expect, it } from 'vitest'
import { EMPTY, emptyBoard, findWinLine, legalCells, resolvePlace } from './rules'
import { xoReducer, initialXOState, type XOAction } from './xoReducer'
import type { XOState } from './types'

/** Build a board from a 3-row ASCII sketch: `.` empty, `X` seat 0, `O` seat 1. */
function board(rows: [string, string, string]): number[][] {
  return rows.map((row) =>
    [...row].map((ch) => (ch === 'X' ? 0 : ch === 'O' ? 1 : EMPTY)),
  )
}

/** A minimal idle state sitting on `b`, with `current` to move. */
function stateOn(b: number[][], current = 0): XOState {
  let s = xoReducer(initialXOState, { type: 'START_GAME', players: [
    { name: 'X', color: '#f43f5e' },
    { name: 'O', color: '#38bdf8' },
  ] } satisfies XOAction)
  s = { ...s, board: b, currentPlayerIndex: current }
  return s
}

describe('emptyBoard / legalCells', () => {
  it('starts empty with nine legal squares', () => {
    expect(legalCells(emptyBoard())).toHaveLength(9)
  })

  it('drops a square once it is taken', () => {
    const b = board(['X..', '...', '...'])
    expect(legalCells(b)).toHaveLength(8)
    expect(legalCells(b)).not.toContainEqual([0, 0])
  })
})

describe('findWinLine', () => {
  it('detects a row', () => {
    const b = board(['XXX', '...', '...'])
    expect(findWinLine(b, 0, 1, 0)).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
    ])
  })

  it('detects a column', () => {
    const b = board(['O..', 'O..', 'O..'])
    expect(findWinLine(b, 1, 0, 1)).toHaveLength(3)
  })

  it('detects both diagonals', () => {
    expect(findWinLine(board(['X..', '.X.', '..X']), 1, 1, 0)).toHaveLength(3)
    expect(findWinLine(board(['..X', '.X.', 'X..']), 1, 1, 0)).toHaveLength(3)
  })

  it('returns null without three in a row', () => {
    expect(findWinLine(board(['XX.', '...', '...']), 0, 0, 0)).toBeNull()
  })
})

describe('resolvePlace', () => {
  it('marks an empty square and reports the win', () => {
    const s = stateOn(board(['XX.', '...', '...']), 0)
    const r = resolvePlace(s, 0, 2)
    expect(r).not.toBeNull()
    expect(r!.isWin).toBe(true)
    expect(r!.winLine).toHaveLength(3)
    expect(r!.isDraw).toBe(false)
  })

  it('rejects a taken or out-of-range square', () => {
    const s = stateOn(board(['X..', '...', '...']), 1)
    expect(resolvePlace(s, 0, 0)).toBeNull()
    expect(resolvePlace(s, 3, 0)).toBeNull()
    expect(resolvePlace(s, -1, 0)).toBeNull()
  })

  it('reports a draw when the last square fills with no winner', () => {
    // X O X / X X O / O X . — X plays the centre-bottom, board full, no line.
    const s = stateOn(board(['XOX', 'XXO', 'OX.']), 1)
    const r = resolvePlace(s, 2, 2)
    expect(r!.isWin).toBe(false)
    expect(r!.isDraw).toBe(true)
  })
})

describe('xoReducer', () => {
  it('stamps marks and starts idle on X', () => {
    const s = xoReducer(initialXOState, {
      type: 'START_GAME',
      players: [
        { name: 'A', color: '#f43f5e' },
        { name: 'B', color: '#38bdf8' },
      ],
    })
    expect(s.phase).toBe('idle')
    expect(s.players.map((p) => p.mark)).toEqual(['X', 'O'])
    expect(s.currentPlayerIndex).toBe(0)
  })

  it('commits a turn and hands over', () => {
    let s = stateOn(emptyBoard(), 0)
    const r = resolvePlace(s, 1, 1)!
    s = xoReducer(s, { type: 'COMMIT_TURN', resolution: r })
    expect(s.board[1][1]).toBe(0)
    expect(s.currentPlayerIndex).toBe(1)
    expect(s.turnCount).toBe(1)
    expect(s.phase).toBe('idle')
  })

  it('ends the match on a winning commit', () => {
    let s = stateOn(board(['XX.', '...', '...']), 0)
    const r = resolvePlace(s, 0, 2)!
    s = xoReducer(s, { type: 'COMMIT_TURN', resolution: r })
    expect(s.phase).toBe('won')
    expect(s.winnerId).toBe(0)
    expect(s.winLine).toHaveLength(3)
    expect(s.finishedOrder).toEqual([0])
  })
})
