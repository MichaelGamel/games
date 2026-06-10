import { describe, expect, it } from 'vitest'
import { resolveTurn, rollDie } from './rules'
import { cellToCoords, cellsInRenderOrder } from './board'
import { gameReducer, initialState } from './gameReducer'
import { LADDERS, SNAKES, TOTAL_CELLS } from './config'
import type { DieValue } from './types'

describe('rollDie', () => {
  it('maps the rng range to 1..6', () => {
    expect(rollDie(() => 0)).toBe(1)
    expect(rollDie(() => 0.99)).toBe(6)
    expect(rollDie(() => 0.5)).toBe(4)
  })

  it('always returns a value within 1..6 for random input', () => {
    for (let i = 0; i < 200; i++) {
      const v = rollDie()
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(6)
    }
  })
})

describe('resolveTurn — basic movement', () => {
  it('walks the full path from the start cell', () => {
    const r = resolveTurn(0, 3)
    expect(r.walkPath).toEqual([1, 2, 3])
    expect(r.landed).toBe(3)
    expect(r.finalPos).toBe(3)
    expect(r.jump).toBeNull()
    expect(r.bounced).toBe(false)
  })
})

describe('resolveTurn — ladders & snakes', () => {
  it('climbs a ladder when landing on its foot', () => {
    const r = resolveTurn(0, 1) // lands on 1 → ladder 1→38
    expect(r.landed).toBe(1)
    expect(r.jump).toEqual({ from: 1, to: LADDERS[1], kind: 'ladder' })
    expect(r.finalPos).toBe(38)
  })

  it('slides down a snake when landing on its head', () => {
    const r = resolveTurn(10, 6) // lands on 16 → snake 16→6
    expect(r.landed).toBe(16)
    expect(r.jump).toEqual({ from: 16, to: SNAKES[16], kind: 'snake' })
    expect(r.finalPos).toBe(6)
  })
})

describe('resolveTurn — winning & bounce-back', () => {
  it('wins on an exact landing of 100', () => {
    const r = resolveTurn(99, 1)
    expect(r.finalPos).toBe(TOTAL_CELLS)
    expect(r.isWin).toBe(true)
    expect(r.bounced).toBe(false)
  })

  it('wins by riding the 80→100 ladder', () => {
    const r = resolveTurn(79, 1) // lands 80 → ladder 80→100
    expect(r.jump).toEqual({ from: 80, to: 100, kind: 'ladder' })
    expect(r.isWin).toBe(true)
  })

  it('bounces back on overshoot and does not win', () => {
    const r = resolveTurn(95, 6) // raw 101 → reflect to 99
    expect(r.bounced).toBe(true)
    expect(r.landed).toBe(99)
    expect(r.finalPos).toBe(99)
    expect(r.isWin).toBe(false)
    // forward to 100 then back down to 99
    expect(r.walkPath).toEqual([96, 97, 98, 99, 100, 99])
  })

  it('applies a snake found after a bounce', () => {
    const r = resolveTurn(99, 3) // raw 102 → reflect to 98 → snake 98→78
    expect(r.bounced).toBe(true)
    expect(r.landed).toBe(98)
    expect(r.finalPos).toBe(78)
  })
})

describe('resolveTurn — extra turn on a 6', () => {
  it('grants an extra turn when rolling a 6 without winning', () => {
    const r = resolveTurn(0, 6)
    expect(r.extraTurn).toBe(true)
  })

  it('does not grant an extra turn when a 6 wins the game', () => {
    const r = resolveTurn(94, 6) // exact 100
    expect(r.isWin).toBe(true)
    expect(r.extraTurn).toBe(false)
  })

  it('grants no extra turn on a non-6 roll', () => {
    expect(resolveTurn(0, 4).extraTurn).toBe(false)
  })
})

describe('board mapping (boustrophedon)', () => {
  it('places corner cells correctly', () => {
    expect(cellToCoords(1)).toEqual({ row: 9, col: 0 }) // bottom-left
    expect(cellToCoords(10)).toEqual({ row: 9, col: 9 }) // bottom-right
    expect(cellToCoords(100)).toEqual({ row: 0, col: 0 }) // top-left
  })

  it('reverses direction every row', () => {
    expect(cellToCoords(11)).toEqual({ row: 8, col: 9 }) // directly above 10
    expect(cellToCoords(20)).toEqual({ row: 8, col: 0 })
  })

  it('render order covers all 100 cells starting top-left', () => {
    const order = cellsInRenderOrder()
    expect(order).toHaveLength(100)
    expect(order[0]).toBe(100)
    expect(new Set(order).size).toBe(100)
  })
})

describe('gameReducer', () => {
  const started = gameReducer(initialState, {
    type: 'START_GAME',
    players: [
      { name: 'A', color: '#f00' },
      { name: 'B', color: '#00f' },
    ],
  })

  it('initialises two players at the start cell', () => {
    expect(started.phase).toBe('idle')
    expect(started.players).toHaveLength(2)
    expect(started.players.every((p) => p.position === 0)).toBe(true)
  })

  it('advances to the next player after a normal turn', () => {
    const next = gameReducer(started, {
      type: 'COMMIT_TURN',
      resolution: resolveTurn(0, 3),
    })
    expect(next.players[0].position).toBe(3)
    expect(next.currentPlayerIndex).toBe(1)
    expect(next.phase).toBe('idle')
  })

  it('keeps the same player on an extra turn', () => {
    const next = gameReducer(started, {
      type: 'COMMIT_TURN',
      resolution: resolveTurn(0, 6),
    })
    expect(next.currentPlayerIndex).toBe(0)
  })

  it('declares a winner on reaching the final cell', () => {
    const next = gameReducer(started, {
      type: 'COMMIT_TURN',
      resolution: resolveTurn(99, 1),
    })
    expect(next.phase).toBe('won')
    expect(next.winnerId).toBe(0)
    expect(next.winReason).toBe('goal')
  })

  it('counts every committed turn (the online sync sequence number)', () => {
    let s = started
    expect(s.turnCount).toBe(0)
    s = gameReducer(s, { type: 'COMMIT_TURN', resolution: resolveTurn(0, 3) })
    expect(s.turnCount).toBe(1)
    s = gameReducer(s, { type: 'COMMIT_TURN', resolution: resolveTurn(0, 6) })
    expect(s.turnCount).toBe(2) // extra turns count too — one commit per roll
    expect(gameReducer(s, { type: 'RESET' }).turnCount).toBe(0)
  })

  it('restores turnCount from a snapshot', () => {
    const s = gameReducer(initialState, {
      type: 'LOAD_SNAPSHOT',
      players: [
        { name: 'A', color: '#f00', position: 10 },
        { name: 'B', color: '#00f', position: 4 },
      ],
      currentPlayerIndex: 1,
      lastRoll: 4,
      winnerId: null,
      turnCount: 7,
    })
    expect(s.turnCount).toBe(7)
    expect(s.phase).toBe('idle')
  })
})

describe('gameReducer — forfeit win (last player standing)', () => {
  const started = gameReducer(initialState, {
    type: 'START_GAME',
    players: [
      { name: 'A', color: '#f00' },
      { name: 'B', color: '#00f' },
    ],
  })

  it('grants the win to the remaining player', () => {
    const next = gameReducer(started, { type: 'FORFEIT_WIN', winnerId: 1 })
    expect(next.phase).toBe('won')
    expect(next.winnerId).toBe(1)
    expect(next.winReason).toBe('forfeit')
  })

  it('is ignored before the match starts', () => {
    expect(gameReducer(initialState, { type: 'FORFEIT_WIN', winnerId: 0 })).toBe(initialState)
  })

  it('never overrides a match that is already won', () => {
    const won = gameReducer(started, {
      type: 'COMMIT_TURN',
      resolution: resolveTurn(99, 1),
    })
    const next = gameReducer(won, { type: 'FORFEIT_WIN', winnerId: 1 })
    expect(next.winnerId).toBe(0)
    expect(next.winReason).toBe('goal')
  })

  it('is ignored for an unknown player id', () => {
    expect(gameReducer(started, { type: 'FORFEIT_WIN', winnerId: 5 })).toBe(started)
  })
})

describe('online sync determinism', () => {
  // The basis of realtime sync: two clients that apply the SAME resolved turns
  // (broadcast over the network) must end in byte-identical game state.
  const start = () =>
    gameReducer(initialState, {
      type: 'START_GAME',
      players: [
        { name: 'A', color: '#f00' },
        { name: 'B', color: '#00f' },
      ],
    })

  it('two independent states stay identical when fed the same rolls', () => {
    const rolls: DieValue[] = [6, 3, 1, 5, 2, 6, 4, 3, 5, 1, 2, 4, 6, 6, 3]
    let a = start()
    let b = start()
    for (const roll of rolls) {
      if (a.phase === 'won') break
      // each "client" resolves from its own (identical) current state
      const resolution = resolveTurn(a.players[a.currentPlayerIndex].position, roll)
      a = gameReducer(a, { type: 'COMMIT_TURN', resolution })
      b = gameReducer(b, { type: 'COMMIT_TURN', resolution })
    }
    expect(a).toEqual(b)
  })
})
