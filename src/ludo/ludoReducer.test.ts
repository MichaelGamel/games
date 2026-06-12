import { describe, expect, it } from 'vitest'
import { initialLudoState, ludoReducer } from './ludoReducer'
import { legalMoves, resolveLudoMove } from './rules'
import type { DieValue, LudoGameState } from './types'

const start = (n: number) =>
  ludoReducer(initialLudoState, {
    type: 'START_GAME',
    players: Array.from({ length: n }, (_, i) => ({ name: `P${i}`, color: '#000' })),
  })

/** Overwrite one seat's token progresses (test scaffolding). */
const withTokens = (s: LudoGameState, seat: number, tokens: number[]): LudoGameState => ({
  ...s,
  players: s.players.map((p) => (p.id === seat ? { ...p, tokens: [...tokens] } : p)),
})

const commit = (s: LudoGameState, resolution: ReturnType<typeof resolveLudoMove>) =>
  ludoReducer(s, { type: 'COMMIT_TURN', resolution })

describe('START_GAME', () => {
  it('seats every player with four tokens in base', () => {
    const s = start(3)
    expect(s.phase).toBe('idle')
    expect(s.players).toHaveLength(3)
    expect(s.players.every((p) => p.tokens.length === 4 && p.tokens.every((t) => t === -1))).toBe(
      true,
    )
    expect(s.consecutiveSixes).toBe(0)
  })

  it('threads isBot through and defaults it to false', () => {
    const s = ludoReducer(initialLudoState, {
      type: 'START_GAME',
      players: [
        { name: 'Human', color: '#f00' },
        { name: 'Bot', color: '#00f', isBot: true },
      ],
    })
    expect(s.players[0].isBot).toBe(false)
    expect(s.players[1].isBot).toBe(true)
  })
})

describe('the phase machine', () => {
  it('walks roll → select → move', () => {
    let s = ludoReducer(start(2), { type: 'BEGIN_ROLL', roll: 6 })
    expect(s.phase).toBe('rolling')
    expect(s.lastRoll).toBe(6)
    s = ludoReducer(s, { type: 'BEGIN_SELECT' })
    expect(s.phase).toBe('selecting')
    s = ludoReducer(s, { type: 'BEGIN_MOVE' })
    expect(s.phase).toBe('moving')
  })
})

describe('COMMIT_TURN', () => {
  it('releases a token on a 6 and keeps the turn (extra roll)', () => {
    const s = start(2)
    const next = commit(s, resolveLudoMove(s, 0, 6))
    expect(next.players[0].tokens[0]).toBe(0)
    expect(next.currentPlayerIndex).toBe(0)
    expect(next.consecutiveSixes).toBe(1)
    expect(next.turnCount).toBe(1)
  })

  it('advances to the next player after a non-6 move', () => {
    const s = withTokens(start(2), 0, [5, -1, -1, -1])
    const next = commit(s, resolveLudoMove(s, 0, 3))
    expect(next.players[0].tokens[0]).toBe(8)
    expect(next.currentPlayerIndex).toBe(1)
    expect(next.consecutiveSixes).toBe(0)
  })

  it('sends a captured token home and keeps the turn', () => {
    let s = withTokens(start(2), 0, [4, -1, -1, -1])
    s = withTokens(s, 1, [46, -1, -1, -1]) // seat 1 token on abs 7
    const next = commit(s, resolveLudoMove(s, 0, 3)) // 4 → abs 7, capture
    expect(next.players[0].tokens[0]).toBe(7)
    expect(next.players[1].tokens[0]).toBe(-1)
    expect(next.currentPlayerIndex).toBe(0)
  })

  it('a third six ends the turn but keeps the first two moves', () => {
    let s = withTokens(start(2), 0, [6, -1, -1, -1])
    s = { ...s, consecutiveSixes: 2 }
    const r = resolveLudoMove(s, 0, 6)
    expect(r.noMove).toBe(true)
    const next = commit(s, r)
    expect(next.players[0].tokens[0]).toBe(6) // earlier move stands
    expect(next.currentPlayerIndex).toBe(1) // turn passes
    expect(next.consecutiveSixes).toBe(0)
    expect(next.turnCount).toBe(1)
  })

  it('counts every committed event (the online sync sequence number)', () => {
    let s = start(2)
    expect(s.turnCount).toBe(0)
    s = commit(s, resolveLudoMove(s, 0, 6)) // release, extra turn
    expect(s.turnCount).toBe(1)
    s = commit(s, resolveLudoMove(s, 0, 6)) // 0 → 6, extra turn (2nd six)
    expect(s.turnCount).toBe(2)
    s = ludoReducer(s, { type: 'SKIP_TURN' })
    expect(s.turnCount).toBe(3)
    expect(ludoReducer(s, { type: 'RESET' }).turnCount).toBe(0)
  })
})

describe('finishing & ranking', () => {
  const finishSeat = (s: LudoGameState, seat: number) => {
    const positioned = withTokens(s, seat, [56, 56, 56, 53])
    return commit({ ...positioned, currentPlayerIndex: seat }, resolveLudoMove(
      { ...positioned, currentPlayerIndex: seat },
      3,
      3,
    ))
  }

  it('ends a 2-player match when one seat brings all four home', () => {
    const next = finishSeat(start(2), 0)
    expect(next.phase).toBe('won')
    expect(next.winnerId).toBe(0)
    expect(next.winReason).toBe('goal')
    expect(next.finishedOrder).toEqual([0])
  })

  it('pauses for celebration when others still race', () => {
    const next = finishSeat(start(3), 0)
    expect(next.phase).toBe('celebrating')
    expect(next.finishedOrder).toEqual([0])
    expect(next.winnerId).toBe(0)
  })

  it('CONTINUE_MATCH resumes with the next active player', () => {
    const cont = ludoReducer(finishSeat(start(3), 0), { type: 'CONTINUE_MATCH' })
    expect(cont.phase).toBe('idle')
    expect(cont.currentPlayerIndex).toBe(1)
  })

  it('END_MATCH stops with the standings so far', () => {
    const ended = ludoReducer(finishSeat(start(3), 0), { type: 'END_MATCH' })
    expect(ended.phase).toBe('won')
    expect(ended.finishedOrder).toEqual([0])
  })

  it('turn order skips a finished seat', () => {
    let s = ludoReducer(finishSeat(start(3), 0), { type: 'CONTINUE_MATCH' }) // seat 1
    s = withTokens(s, 1, [5, -1, -1, -1])
    s = commit(s, resolveLudoMove(s, 0, 3)) // seat 1 moves → seat 2
    expect(s.currentPlayerIndex).toBe(2)
    s = withTokens(s, 2, [5, -1, -1, -1])
    s = commit(s, resolveLudoMove(s, 0, 3)) // seat 2 moves → back to 1, skipping finished 0
    expect(s.currentPlayerIndex).toBe(1)
  })

  it('ignores continue/end outside the celebration pause', () => {
    const s = start(3)
    expect(ludoReducer(s, { type: 'CONTINUE_MATCH' })).toBe(s)
    expect(ludoReducer(s, { type: 'END_MATCH' })).toBe(s)
  })
})

describe('SKIP_TURN', () => {
  it('hands the turn to the next player and counts as a commit', () => {
    const s = ludoReducer(start(3), { type: 'SKIP_TURN' })
    expect(s.currentPlayerIndex).toBe(1)
    expect(s.turnCount).toBe(1)
    expect(s.consecutiveSixes).toBe(0)
  })

  it('is ignored unless the game is waiting for a roll', () => {
    const rolling = ludoReducer(start(2), { type: 'BEGIN_ROLL', roll: 3 })
    expect(ludoReducer(rolling, { type: 'SKIP_TURN' })).toBe(rolling)
  })
})

describe('FORFEIT_WIN', () => {
  it('grants the win to the remaining player', () => {
    const next = ludoReducer(start(2), { type: 'FORFEIT_WIN', winnerId: 1 })
    expect(next.phase).toBe('won')
    expect(next.winnerId).toBe(1)
    expect(next.winReason).toBe('forfeit')
  })

  it('is ignored before the match starts', () => {
    expect(ludoReducer(initialLudoState, { type: 'FORFEIT_WIN', winnerId: 0 })).toBe(
      initialLudoState,
    )
  })

  it('never overrides a match that is already won', () => {
    let s = withTokens(start(2), 0, [56, 56, 56, 53])
    s = commit(s, resolveLudoMove(s, 3, 3)) // seat 0 wins by goal
    const next = ludoReducer(s, { type: 'FORFEIT_WIN', winnerId: 1 })
    expect(next.winnerId).toBe(0)
    expect(next.winReason).toBe('goal')
  })
})

describe('LOAD_SNAPSHOT', () => {
  it('restores a running snapshot (tokens, six count, phase)', () => {
    const s = ludoReducer(initialLudoState, {
      type: 'LOAD_SNAPSHOT',
      players: [
        { name: 'A', color: '#f00', tokens: [56, 10, -1, -1] },
        { name: 'B', color: '#00f', tokens: [3, -1, -1, -1] },
      ],
      currentPlayerIndex: 1,
      lastRoll: 2,
      finishedOrder: [],
      awaitingDecision: false,
      ended: false,
      turnCount: 9,
      consecutiveSixes: 1,
    })
    expect(s.phase).toBe('idle')
    expect(s.turnCount).toBe(9)
    expect(s.consecutiveSixes).toBe(1)
    expect(s.players[0].tokens).toEqual([56, 10, -1, -1])
  })

  it('restores a mid-celebration snapshot', () => {
    const s = ludoReducer(initialLudoState, {
      type: 'LOAD_SNAPSHOT',
      players: [
        { name: 'A', color: '#f00', tokens: [56, 56, 56, 56] },
        { name: 'B', color: '#00f', tokens: [4, -1, -1, -1] },
        { name: 'C', color: '#0f0', tokens: [9, -1, -1, -1] },
      ],
      currentPlayerIndex: 0,
      lastRoll: 2,
      finishedOrder: [0],
      awaitingDecision: true,
      ended: false,
      turnCount: 20,
      consecutiveSixes: 0,
    })
    expect(s.phase).toBe('celebrating')
    expect(s.winnerId).toBe(0)
  })
})

describe('online sync determinism', () => {
  it('two states stay identical when fed the same rolls (six-chains included)', () => {
    const rolls: DieValue[] = [6, 6, 6, 4, 6, 2, 6, 6, 1, 3, 6, 5, 6, 6, 2, 4, 6, 3]
    let a = start(2)
    let b = start(2)
    for (const roll of rolls) {
      if (a.phase !== 'idle') break
      const pick = (st: LudoGameState) =>
        legalMoves(st, st.currentPlayerIndex, roll)[0]?.tokenId ?? -1
      const ra = resolveLudoMove(a, pick(a), roll)
      const rb = resolveLudoMove(b, pick(b), roll)
      expect(ra).toEqual(rb)
      a = ludoReducer(a, { type: 'COMMIT_TURN', resolution: ra })
      b = ludoReducer(b, { type: 'COMMIT_TURN', resolution: rb })
    }
    expect(a).toEqual(b)
  })
})
