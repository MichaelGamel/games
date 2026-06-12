import { describe, expect, it } from 'vitest'
import { resolveTurn, rollDie, rollDice, type TurnContext } from './rules'
import { cellToCoords, cellsInRenderOrder } from './board'
import { gameReducer, initialState } from './gameReducer'
import { CLASSIC_LADDERS, CLASSIC_SNAKES, DEFAULT_SNAKES_RULES } from './config'
import { layoutForRules } from './boardGen'
import type { BoardLayout, DieValue } from './types'

const CLASSIC = layoutForRules(DEFAULT_SNAKES_RULES)

/** A classic-board turn for a lone player — mirrors the pre-variants API. */
function turn(from: number, roll: DieValue, overrides: Partial<TurnContext> = {}) {
  return resolveTurn({
    board: CLASSIC,
    positions: [from],
    playerIndex: 0,
    hasShield: false,
    dice: [roll],
    ...overrides,
  })
}

describe('rollDie / rollDice', () => {
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

  it('rolls the requested number of dice', () => {
    expect(rollDice(1, () => 0)).toEqual([1])
    expect(rollDice(2, () => 0.99)).toEqual([6, 6])
  })
})

describe('resolveTurn — basic movement', () => {
  it('walks the full path from the start cell', () => {
    const r = turn(0, 3)
    expect(r.walkPath).toEqual([1, 2, 3])
    expect(r.landed).toBe(3)
    expect(r.finalPos).toBe(3)
    expect(r.jump).toBeNull()
    expect(r.bounced).toBe(false)
    expect(r.roll).toBe(3)
    expect(r.dice).toEqual([3])
  })
})

describe('resolveTurn — ladders & snakes', () => {
  it('climbs a ladder when landing on its foot', () => {
    const r = turn(0, 1) // lands on 1 → ladder 1→38
    expect(r.landed).toBe(1)
    expect(r.jump).toEqual({ from: 1, to: CLASSIC_LADDERS[1], kind: 'ladder' })
    expect(r.finalPos).toBe(38)
  })

  it('slides down a snake when landing on its head', () => {
    const r = turn(10, 6) // lands on 16 → snake 16→6
    expect(r.landed).toBe(16)
    expect(r.jump).toEqual({ from: 16, to: CLASSIC_SNAKES[16], kind: 'snake' })
    expect(r.finalPos).toBe(6)
  })
})

describe('resolveTurn — winning & bounce-back', () => {
  it('wins on an exact landing of 100', () => {
    const r = turn(99, 1)
    expect(r.finalPos).toBe(100)
    expect(r.isWin).toBe(true)
    expect(r.bounced).toBe(false)
  })

  it('wins by riding the 80→100 ladder', () => {
    const r = turn(79, 1) // lands 80 → ladder 80→100
    expect(r.jump).toEqual({ from: 80, to: 100, kind: 'ladder' })
    expect(r.isWin).toBe(true)
  })

  it('bounces back on overshoot and does not win', () => {
    const r = turn(95, 6) // raw 101 → reflect to 99
    expect(r.bounced).toBe(true)
    expect(r.landed).toBe(99)
    expect(r.finalPos).toBe(99)
    expect(r.isWin).toBe(false)
    // forward to 100 then back down to 99
    expect(r.walkPath).toEqual([96, 97, 98, 99, 100, 99])
  })

  it('applies a snake found after a bounce', () => {
    const r = turn(99, 3) // raw 102 → reflect to 98 → snake 98→78
    expect(r.bounced).toBe(true)
    expect(r.landed).toBe(98)
    expect(r.finalPos).toBe(78)
  })
})

describe('resolveTurn — extra turn', () => {
  it('grants an extra turn when rolling a 6 without winning', () => {
    expect(turn(0, 6).extraTurn).toBe(true)
  })

  it('does not grant an extra turn when a 6 wins the game', () => {
    const r = turn(94, 6) // exact 100
    expect(r.isWin).toBe(true)
    expect(r.extraTurn).toBe(false)
  })

  it('grants no extra turn on a non-6 roll', () => {
    expect(turn(0, 4).extraTurn).toBe(false)
  })

  it('two dice: doubles (not sixes) grant the extra turn', () => {
    const doubles = turn(0, 1, { dice: [3, 3] })
    expect(doubles.roll).toBe(6)
    expect(doubles.extraTurn).toBe(true)

    const withSix = turn(10, 1, { dice: [6, 2] })
    expect(withSix.roll).toBe(8)
    expect(withSix.extraTurn).toBe(false)
  })

  it('two dice: moves the sum of both', () => {
    const r = turn(0, 1, { dice: [4, 5] })
    expect(r.roll).toBe(9)
    expect(r.landed).toBe(9) // → ladder 9→31
    expect(r.finalPos).toBe(31)
  })
})

describe('resolveTurn — special cells', () => {
  /** A bare 10×10 board with hand-placed connectors/specials. */
  const board = (over: Partial<BoardLayout>): BoardLayout => ({
    size: 10,
    ladders: {},
    snakes: {},
    specials: {},
    ...over,
  })

  it('shield cell arms a shield', () => {
    const b = board({ specials: { 5: 'shield' } })
    const r = resolveTurn({ board: b, positions: [2], playerIndex: 0, hasShield: false, dice: [3] })
    expect(r.special).toBe('shield')
    expect(r.shieldGained).toBe(true)
    expect(r.finalPos).toBe(5)
  })

  it('a held shield blocks a snake and is spent', () => {
    const b = board({ snakes: { 20: 3 } })
    const r = resolveTurn({ board: b, positions: [16], playerIndex: 0, hasShield: true, dice: [4] })
    expect(r.shieldUsed).toBe(true)
    expect(r.jump).toBeNull()
    expect(r.finalPos).toBe(20) // stayed put instead of sliding to 3
  })

  it('without a shield the same snake bites', () => {
    const b = board({ snakes: { 20: 3 } })
    const r = resolveTurn({ board: b, positions: [16], playerIndex: 0, hasShield: false, dice: [4] })
    expect(r.shieldUsed).toBe(false)
    expect(r.finalPos).toBe(3)
  })

  it('swap trades places with the furthest-ahead opponent', () => {
    const b = board({ specials: { 10: 'swap' } })
    const r = resolveTurn({
      board: b,
      positions: [7, 50, 80, 100],
      playerIndex: 0,
      hasShield: false,
      dice: [3],
    })
    expect(r.special).toBe('swap')
    expect(r.swapWith).toBe(2) // player at 80 leads (100 already finished)
    expect(r.finalPos).toBe(80)
    expect(r.swapPartnerPos).toBe(10)
  })

  it('swap is a no-op when nobody is ahead', () => {
    const b = board({ specials: { 10: 'swap' } })
    const r = resolveTurn({
      board: b,
      positions: [7, 4],
      playerIndex: 0,
      hasShield: false,
      dice: [3],
    })
    expect(r.swapWith).toBeNull()
    expect(r.finalPos).toBe(10)
  })

  it('mystery teleports to the rng-chosen cell, carried in the resolution', () => {
    const b = board({ specials: { 10: 'mystery' } })
    const r = resolveTurn({
      board: b,
      positions: [7],
      playerIndex: 0,
      hasShield: false,
      dice: [3],
      rng: () => 0.5, // → cell 2 + floor(0.5 * 97) = 50
    })
    expect(r.special).toBe('mystery')
    expect(r.teleportTo).toBe(50)
    expect(r.finalPos).toBe(50)
  })
})

describe('board mapping (boustrophedon)', () => {
  it('places corner cells correctly', () => {
    expect(cellToCoords(1, 10)).toEqual({ row: 9, col: 0 }) // bottom-left
    expect(cellToCoords(10, 10)).toEqual({ row: 9, col: 9 }) // bottom-right
    expect(cellToCoords(100, 10)).toEqual({ row: 0, col: 0 }) // top-left
  })

  it('reverses direction every row', () => {
    expect(cellToCoords(11, 10)).toEqual({ row: 8, col: 9 }) // directly above 10
    expect(cellToCoords(20, 10)).toEqual({ row: 8, col: 0 })
  })

  it('render order covers all cells starting top-left', () => {
    const order = cellsInRenderOrder(10)
    expect(order).toHaveLength(100)
    expect(order[0]).toBe(100)
    expect(new Set(order).size).toBe(100)
  })

  it('handles the quick 8×8 board too', () => {
    expect(cellToCoords(1, 8)).toEqual({ row: 7, col: 0 })
    expect(cellToCoords(64, 8)).toEqual({ row: 0, col: 0 })
    const order = cellsInRenderOrder(8)
    expect(order).toHaveLength(64)
    expect(order[0]).toBe(64)
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

  it('initialises two players at the start cell with classic rules', () => {
    expect(started.phase).toBe('idle')
    expect(started.players).toHaveLength(2)
    expect(started.players.every((p) => p.position === 0 && !p.shield)).toBe(true)
    expect(started.rules).toEqual(DEFAULT_SNAKES_RULES)
    expect(started.board.size).toBe(10)
  })

  it('threads isBot through START_GAME and defaults it to false', () => {
    const mixed = gameReducer(initialState, {
      type: 'START_GAME',
      players: [
        { name: 'Human', color: '#f00' },
        { name: 'Bot', color: '#00f', isBot: true },
      ],
    })
    expect(mixed.players[0].isBot).toBe(false)
    expect(mixed.players[1].isBot).toBe(true)
  })

  it('builds the board from the supplied rules', () => {
    const s = gameReducer(initialState, {
      type: 'START_GAME',
      players: [
        { name: 'A', color: '#f00' },
        { name: 'B', color: '#00f' },
      ],
      rules: { board: 'random', seed: 42, size: 8, diceCount: 2, specials: true },
    })
    expect(s.board.size).toBe(8)
    expect(Object.keys(s.board.ladders).length).toBeGreaterThan(0)
    expect(Object.keys(s.board.specials).length).toBeGreaterThan(0)
  })

  it('advances to the next player after a normal turn', () => {
    const next = gameReducer(started, {
      type: 'COMMIT_TURN',
      resolution: turn(0, 3),
    })
    expect(next.players[0].position).toBe(3)
    expect(next.currentPlayerIndex).toBe(1)
    expect(next.phase).toBe('idle')
  })

  it('keeps the same player on an extra turn', () => {
    const next = gameReducer(started, {
      type: 'COMMIT_TURN',
      resolution: turn(0, 6),
    })
    expect(next.currentPlayerIndex).toBe(0)
  })

  it('declares a winner on reaching the final cell', () => {
    const next = gameReducer(started, {
      type: 'COMMIT_TURN',
      resolution: turn(99, 1),
    })
    expect(next.phase).toBe('won')
    expect(next.winnerId).toBe(0)
    expect(next.winReason).toBe('goal')
  })

  it('applies shield pickup and spending across commits', () => {
    const armed = gameReducer(started, {
      type: 'COMMIT_TURN',
      resolution: { ...turn(0, 3), shieldGained: true },
    })
    expect(armed.players[0].shield).toBe(true)

    const backToA = gameReducer(armed, { type: 'SKIP_TURN' })
    const spent = gameReducer(backToA, {
      type: 'COMMIT_TURN',
      resolution: { ...turn(3, 2), shieldUsed: true },
    })
    expect(spent.players[0].shield).toBe(false)
  })

  it('applies a swap to both players', () => {
    const swapped = gameReducer(started, {
      type: 'COMMIT_TURN',
      resolution: { ...turn(0, 3), finalPos: 50, swapWith: 1, swapPartnerPos: 3 },
    })
    expect(swapped.players[0].position).toBe(50)
    expect(swapped.players[1].position).toBe(3)
  })

  it('counts every committed turn (the online sync sequence number)', () => {
    let s = started
    expect(s.turnCount).toBe(0)
    s = gameReducer(s, { type: 'COMMIT_TURN', resolution: turn(0, 3) })
    expect(s.turnCount).toBe(1)
    s = gameReducer(s, { type: 'COMMIT_TURN', resolution: turn(0, 6) })
    expect(s.turnCount).toBe(2) // extra turns count too — one commit per roll
    expect(gameReducer(s, { type: 'RESET' }).turnCount).toBe(0)
  })

  it('restores turnCount from a snapshot', () => {
    const s = gameReducer(initialState, {
      type: 'LOAD_SNAPSHOT',
      players: [
        { name: 'A', color: '#f00', position: 10, shield: false },
        { name: 'B', color: '#00f', position: 4, shield: true },
      ],
      rules: { ...DEFAULT_SNAKES_RULES },
      currentPlayerIndex: 1,
      lastRoll: 4,
      finishedOrder: [],
      awaitingDecision: false,
      ended: false,
      turnCount: 7,
    })
    expect(s.turnCount).toBe(7)
    expect(s.phase).toBe('idle')
    expect(s.players[1].shield).toBe(true)
  })

  it('restores a mid-celebration snapshot', () => {
    const s = gameReducer(initialState, {
      type: 'LOAD_SNAPSHOT',
      players: [
        { name: 'A', color: '#f00', position: 100, shield: false },
        { name: 'B', color: '#00f', position: 4, shield: false },
        { name: 'C', color: '#0f0', position: 9, shield: false },
      ],
      rules: { ...DEFAULT_SNAKES_RULES },
      currentPlayerIndex: 0,
      lastRoll: 2,
      finishedOrder: [0],
      awaitingDecision: true,
      ended: false,
      turnCount: 9,
    })
    expect(s.phase).toBe('celebrating')
    expect(s.finishedOrder).toEqual([0])
    expect(s.winnerId).toBe(0)
  })
})

describe('gameReducer — multi-player ranked finish', () => {
  const start3 = () =>
    gameReducer(initialState, {
      type: 'START_GAME',
      players: [
        { name: 'A', color: '#f00' },
        { name: 'B', color: '#00f' },
        { name: 'C', color: '#0f0' },
      ],
    })

  const finishCurrent = (s: ReturnType<typeof start3>) => {
    // Put the current player on 99 and roll a 1 for an exact finish.
    const positioned = {
      ...s,
      players: s.players.map((p) => (p.id === s.currentPlayerIndex ? { ...p, position: 99 } : p)),
    }
    return gameReducer(positioned, { type: 'COMMIT_TURN', resolution: turn(99, 1) })
  }

  it('pauses for celebration when others are still racing', () => {
    const s = finishCurrent(start3())
    expect(s.phase).toBe('celebrating')
    expect(s.finishedOrder).toEqual([0])
    expect(s.winnerId).toBe(0)
    expect(s.winReason).toBe('goal')
  })

  it('CONTINUE_MATCH resumes with the next active player', () => {
    const s = gameReducer(finishCurrent(start3()), { type: 'CONTINUE_MATCH' })
    expect(s.phase).toBe('idle')
    expect(s.currentPlayerIndex).toBe(1)
  })

  it('END_MATCH stops with the standings so far', () => {
    const s = gameReducer(finishCurrent(start3()), { type: 'END_MATCH' })
    expect(s.phase).toBe('won')
    expect(s.finishedOrder).toEqual([0])
  })

  it('ends the match when only one active player remains', () => {
    let s = gameReducer(finishCurrent(start3()), { type: 'CONTINUE_MATCH' })
    s = finishCurrent(s) // B finishes 2nd — only C is left
    expect(s.phase).toBe('won')
    expect(s.finishedOrder).toEqual([0, 1])
    expect(s.winnerId).toBe(0) // first place keeps the crown
  })

  it('turn order skips players who already finished', () => {
    let s = gameReducer(finishCurrent(start3()), { type: 'CONTINUE_MATCH' }) // B's turn
    s = gameReducer(s, { type: 'COMMIT_TURN', resolution: turn(10, 2) })
    expect(s.currentPlayerIndex).toBe(2) // C
    s = gameReducer(s, { type: 'COMMIT_TURN', resolution: turn(10, 2) })
    expect(s.currentPlayerIndex).toBe(1) // back to B, skipping finished A
  })

  it('decisions are ignored outside the celebration pause', () => {
    const s = start3()
    expect(gameReducer(s, { type: 'CONTINUE_MATCH' })).toBe(s)
    expect(gameReducer(s, { type: 'END_MATCH' })).toBe(s)
  })
})

describe('gameReducer — skipping an absent player', () => {
  const start3 = () =>
    gameReducer(initialState, {
      type: 'START_GAME',
      players: [
        { name: 'A', color: '#f00' },
        { name: 'B', color: '#00f' },
        { name: 'C', color: '#0f0' },
      ],
    })

  it('hands the turn to the next player and counts as a commit', () => {
    const s = gameReducer(start3(), { type: 'SKIP_TURN' })
    expect(s.currentPlayerIndex).toBe(1)
    expect(s.turnCount).toBe(1)
    expect(s.phase).toBe('idle')
  })

  it('skips over finished players too', () => {
    let s = start3()
    // A finishes 1st, host continues — B's turn.
    s = {
      ...s,
      players: s.players.map((p) => (p.id === 0 ? { ...p, position: 99 } : p)),
    }
    s = gameReducer(s, { type: 'COMMIT_TURN', resolution: turn(99, 1) })
    s = gameReducer(s, { type: 'CONTINUE_MATCH' })
    s = gameReducer(s, { type: 'SKIP_TURN' }) // B is away → C's turn
    expect(s.currentPlayerIndex).toBe(2)
    s = gameReducer(s, { type: 'SKIP_TURN' }) // C away too → back to B (not A)
    expect(s.currentPlayerIndex).toBe(1)
  })

  it('is ignored unless the game is waiting for a roll', () => {
    const rolling = gameReducer(start3(), { type: 'BEGIN_ROLL', dice: [3] })
    expect(gameReducer(rolling, { type: 'SKIP_TURN' })).toBe(rolling)
  })
})

describe('gameReducer — two-dice rolls', () => {
  it('records the dice and their total', () => {
    const started = gameReducer(initialState, {
      type: 'START_GAME',
      players: [
        { name: 'A', color: '#f00' },
        { name: 'B', color: '#00f' },
      ],
    })
    const rolling = gameReducer(started, { type: 'BEGIN_ROLL', dice: [4, 5] })
    expect(rolling.lastDice).toEqual([4, 5])
    expect(rolling.lastRoll).toBe(9)
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
      resolution: turn(99, 1),
    })
    const next = gameReducer(won, { type: 'FORFEIT_WIN', winnerId: 1 })
    expect(next.winnerId).toBe(0)
    expect(next.winReason).toBe('goal')
  })

  it('is ignored for an unknown player id', () => {
    expect(gameReducer(started, { type: 'FORFEIT_WIN', winnerId: 5 })).toBe(started)
  })

  it('appends the survivor after earlier finishers (first place keeps the crown)', () => {
    let s = gameReducer(initialState, {
      type: 'START_GAME',
      players: [
        { name: 'A', color: '#f00' },
        { name: 'B', color: '#00f' },
        { name: 'C', color: '#0f0' },
      ],
    })
    // A finishes 1st, play continues, then everyone but C leaves.
    s = { ...s, players: s.players.map((p) => (p.id === 0 ? { ...p, position: 99 } : p)) }
    s = gameReducer(s, { type: 'COMMIT_TURN', resolution: turn(99, 1) })
    s = gameReducer(s, { type: 'CONTINUE_MATCH' })
    s = gameReducer(s, { type: 'FORFEIT_WIN', winnerId: 2 })
    expect(s.phase).toBe('won')
    expect(s.finishedOrder).toEqual([0, 2])
    expect(s.winnerId).toBe(0)
    expect(s.winReason).toBe('forfeit')
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
      rules: { board: 'random', seed: 7, size: 10, diceCount: 1, specials: true },
    })

  it('two independent states stay identical when fed the same rolls', () => {
    const rolls: DieValue[] = [6, 3, 1, 5, 2, 6, 4, 3, 5, 1, 2, 4, 6, 6, 3]
    let a = start()
    let b = start()
    for (const roll of rolls) {
      if (a.phase === 'won') break
      // each "client" resolves from its own (identical) current state
      const resolution = resolveTurn({
        board: a.board,
        positions: a.players.map((p) => p.position),
        playerIndex: a.currentPlayerIndex,
        hasShield: a.players[a.currentPlayerIndex].shield,
        dice: [roll],
        rng: () => 0.42, // mystery teleports resolve once, on the acting client
      })
      a = gameReducer(a, { type: 'COMMIT_TURN', resolution })
      b = gameReducer(b, { type: 'COMMIT_TURN', resolution })
    }
    expect(a).toEqual(b)
  })
})
