import { describe, it, expect } from 'vitest'
import { dominoReducer, initialDominoState } from './dominoReducer'
import { legalPlays, resolveDrawTurn, resolvePlay } from './rules'
import { tileById } from './deck'
import type { DominoGameState, DominoTile } from './types'

const T = (id: string): DominoTile => tileById(id)!
const allTiles = (s: DominoGameState): string[] =>
  [...s.hands.flat(), ...s.boneyard, ...s.line.tiles.map((p) => p.tile)].map((t) => t.id)
const conserves = (s: DominoGameState) => new Set(allTiles(s)).size === 28 && allTiles(s).length === 28

const start = (deckSeed = 1, count = 2): DominoGameState =>
  dominoReducer(initialDominoState, {
    type: 'START_GAME',
    players: Array.from({ length: count }, (_, i) => ({ name: `P${i}`, color: '#fff' })),
    deckSeed,
  })

describe('START_GAME', () => {
  it('deals deterministically, conserves the set, and opens idle', () => {
    const s = start(1)
    expect(s.phase).toBe('idle')
    expect(s.hands).toHaveLength(2)
    s.hands.forEach((h) => expect(h).toHaveLength(7))
    expect(s.boneyard).toHaveLength(14)
    expect(s.turnCount).toBe(0)
    expect(conserves(s)).toBe(true)
    expect(s.currentPlayerIndex).toBeGreaterThanOrEqual(0)
  })
})

describe('COMMIT_TURN (play)', () => {
  it('lays the opener, removes it from hand, and advances the turn', () => {
    const s0 = start(1)
    const seat = s0.currentPlayerIndex
    const tile = s0.hands[seat][0]
    const res = resolvePlay(s0, tile.id, 'right')!
    const s1 = dominoReducer(s0, { type: 'COMMIT_TURN', resolution: res })
    expect(s1.line.tiles).toHaveLength(1)
    expect(s1.line.leftEnd).toBe(tile.a)
    expect(s1.line.rightEnd).toBe(tile.b)
    expect(s1.hands[seat].some((t) => t.id === tile.id)).toBe(false)
    expect(s1.currentPlayerIndex).toBe((seat + 1) % 2)
    expect(s1.turnCount).toBe(1)
    expect(conserves(s1)).toBe(true)
  })

  it('declares a win when the last tile is laid', () => {
    const base = start(1)
    const s0: DominoGameState = { ...base, currentPlayerIndex: 0, hands: [[T('d20')], base.hands[1]], line: { tiles: [], leftEnd: null, rightEnd: null }, boneyard: [] }
    const res = resolvePlay(s0, 'd20', 'right')!
    expect(res.isWin).toBe(true)
    const s1 = dominoReducer(s0, { type: 'COMMIT_TURN', resolution: res })
    expect(s1.phase).toBe('won')
    expect(s1.winnerId).toBe(0)
    expect(s1.winReason).toBe('empty')
    expect(s1.finishedOrder).toEqual([0])
  })
})

describe('COMMIT_TURN (pass / block)', () => {
  const blockedBase = (hands: DominoTile[][]): DominoGameState => ({
    ...initialDominoState,
    phase: 'idle',
    players: hands.map((_, id) => ({ id, name: `P${id}`, color: '#fff', isBot: false })),
    hands,
    line: { tiles: [{ tile: T('d27'), flip: false, isDouble: true }], leftEnd: 6, rightEnd: 6 },
    boneyard: [],
    currentPlayerIndex: 0,
  })

  it('ends the round on a blocked board with a single fewest-pip winner', () => {
    const s0 = blockedBase([[T('d8')], [T('d0')]]) // 1-2 (3) vs 0-0 (0)
    const res = resolveDrawTurn(s0)
    const s1 = dominoReducer(s0, { type: 'COMMIT_TURN', resolution: res })
    expect(s1.phase).toBe('won')
    expect(s1.winReason).toBe('blocked')
    expect(s1.winnerId).toBe(1)
    expect(s1.blockedTie).toEqual([])
  })

  it('records a tie when fewest pips are level', () => {
    const s0 = blockedBase([[T('d8')], [T('d8')]])
    const res = resolveDrawTurn(s0)
    const s1 = dominoReducer(s0, { type: 'COMMIT_TURN', resolution: res })
    expect(s1.winnerId).toBeNull()
    expect(s1.blockedTie).toEqual([0, 1])
  })
})

describe('housekeeping actions', () => {
  it('SKIP_TURN advances the seat and bumps the sequence', () => {
    const s = dominoReducer(start(1), { type: 'SKIP_TURN' })
    expect(s.turnCount).toBe(1)
  })

  it('FORFEIT_WIN ends the match for a valid seat', () => {
    const s = dominoReducer(start(1), { type: 'FORFEIT_WIN', winnerId: 1 })
    expect(s.phase).toBe('won')
    expect(s.winnerId).toBe(1)
    expect(s.winReason).toBe('forfeit')
  })

  it('ADD_PLAYER deals a late joiner from the boneyard', () => {
    const s0 = start(1)
    const s1 = dominoReducer(s0, { type: 'ADD_PLAYER', player: { name: 'Late', color: '#0ff' } })
    expect(s1.players).toHaveLength(3)
    expect(s1.hands[2].length).toBeGreaterThan(0)
    expect(conserves(s1)).toBe(true)
  })

  it('LOAD_SNAPSHOT rebuilds a running match', () => {
    const src = start(1)
    const s = dominoReducer(initialDominoState, {
      type: 'LOAD_SNAPSHOT',
      players: src.players.map((p, i) => ({ name: p.name, color: p.color, hand: src.hands[i] })),
      currentPlayerIndex: src.currentPlayerIndex,
      boneyard: src.boneyard,
      line: src.line,
      deckSeed: src.deckSeed,
      ended: false,
      turnCount: 4,
    })
    expect(s.phase).toBe('idle')
    expect(s.turnCount).toBe(4)
    expect(conserves(s)).toBe(true)
  })

  it('RESET returns to the initial state', () => {
    expect(dominoReducer(start(1), { type: 'RESET' })).toEqual(initialDominoState)
  })
})

describe('full-round simulation', () => {
  it('always terminates and conserves all 28 tiles every step', () => {
    for (const seed of [1, 7, 13, 99, 2024]) {
      let s = start(seed, 2)
      let steps = 0
      while (s.phase === 'idle' && steps < 200) {
        const seat = s.currentPlayerIndex
        const plays = legalPlays(s.hands[seat], s.line)
        const res = plays.length
          ? resolvePlay(s, plays[0].tile.id, plays[0].ends[0])!
          : resolveDrawTurn(s)
        s = dominoReducer(s, { type: 'COMMIT_TURN', resolution: res })
        expect(conserves(s)).toBe(true)
        steps++
      }
      expect(s.phase).toBe('won')
      expect(['empty', 'blocked']).toContain(s.winReason)
    }
  })
})
