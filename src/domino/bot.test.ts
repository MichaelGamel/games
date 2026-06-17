import { describe, it, expect } from 'vitest'
import { chooseDominoMove } from './bot'
import { endsForTile, legalPlays } from './rules'
import { tileById } from './deck'
import { mulberry32 } from '../game/boardGen'
import type { DominoGameState, DominoLine, DominoPlayer, DominoTile } from './types'

const T = (id: string): DominoTile => tileById(id)!
const players = (levels: Array<'easy' | 'smart'>): DominoPlayer[] =>
  levels.map((botLevel, id) => ({ id, name: `P${id}`, color: '#fff', isBot: true, botLevel }))

const line35: DominoLine = {
  tiles: [{ tile: T('d20'), flip: false, isDouble: false }],
  leftEnd: 3,
  rightEnd: 5,
}

function mkState(p: Partial<DominoGameState>): DominoGameState {
  return {
    phase: 'idle',
    players: players(['smart', 'smart']),
    hands: [[], []],
    boneyard: [],
    line: line35,
    currentPlayerIndex: 0,
    deckSeed: 0,
    pipCounts: [],
    blockedTie: [],
    finishedOrder: [],
    winnerId: null,
    winReason: null,
    turnCount: 0,
    ...p,
  }
}

describe('chooseDominoMove', () => {
  it('returns draw when the hand has no legal play', () => {
    const s = mkState({ hands: [[T('d8')], []] }) // 1-2 fits neither 3 nor 5
    expect(chooseDominoMove(s, 0)).toEqual({ type: 'draw' })
  })

  it('always returns a legal play when one exists (both levels)', () => {
    const hand = [T('d8'), T('d19'), T('d23')] // 1-2(no), 3-4(left), 4-5(right)
    for (const level of ['easy', 'smart'] as const) {
      const s = mkState({ players: players([level, level]), hands: [hand, []] })
      const move = chooseDominoMove(s, 0, mulberry32(5))
      expect(move.type).toBe('play')
      if (move.type === 'play') {
        const tile = T(move.tileId)
        expect(endsForTile(tile, s.line)).toContain(move.end)
      }
    }
  })

  it('smart play is deterministic and dumps the heaviest legal tile', () => {
    const hand = [T('d19'), T('d23')] // 3-4 (w 7) vs 4-5 (w 9)
    const s = mkState({ hands: [hand, []] })
    const a = chooseDominoMove(s, 0)
    const b = chooseDominoMove(s, 0)
    expect(a).toEqual(b)
    expect(a).toMatchObject({ type: 'play', tileId: 'd23' })
  })

  it('never proposes an illegal move across many random hands', () => {
    for (let seed = 0; seed < 30; seed++) {
      const rng = mulberry32(seed)
      const hand = [T('d0'), T('d12'), T('d20'), T('d27')]
      const s = mkState({ players: players(['easy', 'easy']), hands: [hand, []] })
      const move = chooseDominoMove(s, 0, rng)
      if (move.type === 'play') {
        const legal = legalPlays(hand, s.line).map((p) => p.tile.id)
        expect(legal).toContain(move.tileId)
      }
    }
  })
})
