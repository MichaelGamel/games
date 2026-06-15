import { describe, expect, it } from 'vitest'
import { backgammonReducer, initialBackgammonState } from './backgammonReducer'
import { startingBoard } from './board'
import { OFF } from './config'
import type { BackgammonTurnResolution, DieValue } from './types'

const start = () =>
  backgammonReducer(initialBackgammonState, {
    type: 'START_GAME',
    players: [
      { name: 'A', color: '#fff' },
      { name: 'B', color: '#000' },
    ],
  })

const turn = (over: Partial<BackgammonTurnResolution>): BackgammonTurnResolution => ({
  seat: 0,
  dice: [3, 4] as DieValue[],
  moves: [],
  noLegalMoves: false,
  isWin: false,
  winReason: null,
  ...over,
})

describe('START_GAME', () => {
  it('seats two players on the standard board and waits to roll', () => {
    const s = start()
    expect(s.players).toHaveLength(2)
    expect(s.phase).toBe('idle')
    expect(s.board.points).toEqual(startingBoard().points)
    expect(s.turnCount).toBe(0)
  })
})

describe('COMMIT_TURN', () => {
  it('applies the moves, advances the count, and flips the seat', () => {
    const s = start()
    const moves = [
      { from: 23, to: 20, die: 3 as DieValue, hit: false },
      { from: 23, to: 19, die: 4 as DieValue, hit: false },
    ]
    const next = backgammonReducer(s, { type: 'COMMIT_TURN', resolution: turn({ moves }) })
    expect(next.board.points[23]).toBe(0)
    expect(next.board.points[20]).toBe(1)
    expect(next.board.points[19]).toBe(1)
    expect(next.currentPlayerIndex).toBe(1)
    expect(next.turnCount).toBe(1)
    expect(next.phase).toBe('idle')
  })

  it('a no-move turn just passes to the other player', () => {
    const s = start()
    const next = backgammonReducer(s, {
      type: 'COMMIT_TURN',
      resolution: turn({ moves: [], noLegalMoves: true }),
    })
    expect(next.board.points).toEqual(s.board.points)
    expect(next.currentPlayerIndex).toBe(1)
    expect(next.turnCount).toBe(1)
  })

  it('ends the match on a winning turn', () => {
    let s = start()
    s = { ...s, board: { points: new Array<number>(24).fill(0), bar: [0, 0], off: [14, 0] } }
    s.board.points[0] = 1
    const next = backgammonReducer(s, {
      type: 'COMMIT_TURN',
      resolution: turn({ moves: [{ from: 0, to: OFF, die: 1 as DieValue, hit: false }], isWin: true, winReason: 'single' }),
    })
    expect(next.phase).toBe('won')
    expect(next.winnerId).toBe(0)
    expect(next.winReason).toBe('single')
    expect(next.board.off[0]).toBe(15)
  })
})

describe('snapshot + lifecycle', () => {
  it('rebuilds from a snapshot board', () => {
    const board = startingBoard()
    const next = backgammonReducer(initialBackgammonState, {
      type: 'LOAD_SNAPSHOT',
      players: [
        { name: 'A', color: '#fff' },
        { name: 'B', color: '#000' },
      ],
      rules: initialBackgammonState.rules,
      board,
      currentPlayerIndex: 1,
      lastDice: [2, 5] as DieValue[],
      finishedOrder: [],
      ended: false,
      winReason: null,
      turnCount: 7,
    })
    expect(next.phase).toBe('idle')
    expect(next.currentPlayerIndex).toBe(1)
    expect(next.turnCount).toBe(7)
    expect(next.lastRoll).toBe(7)
  })

  it('SKIP_TURN hands off, FORFEIT_WIN ends, RESET clears', () => {
    const s = start()
    expect(backgammonReducer(s, { type: 'SKIP_TURN' }).currentPlayerIndex).toBe(1)
    const f = backgammonReducer(s, { type: 'FORFEIT_WIN', winnerId: 1 })
    expect(f.phase).toBe('won')
    expect(f.winReason).toBe('forfeit')
    expect(backgammonReducer(f, { type: 'RESET' }).phase).toBe('setup')
  })
})
