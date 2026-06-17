import { describe, it, expect } from 'vitest'
import { tileById } from './deck'
import {
  anyoneCanPlay,
  blockStandings,
  endsForTile,
  handPips,
  legalPlays,
  orientFor,
  resolveDrawTurn,
  resolvePass,
  resolvePlay,
  secondPip,
} from './rules'
import type { DominoGameState, DominoLine, DominoPlayer, DominoTile, PlacedTile } from './types'

const T = (id: string): DominoTile => tileById(id)!
const placed = (id: string, flip = false): PlacedTile => {
  const tile = T(id)
  return { tile, flip, isDouble: tile.a === tile.b }
}
const players = (n: number): DominoPlayer[] =>
  Array.from({ length: n }, (_, id) => ({ id, name: `P${id}`, color: '#fff', isBot: false }))

const EMPTY: DominoLine = { tiles: [], leftEnd: null, rightEnd: null }
/** A line whose open ends are 3 (head) … 5 (tail), from a single 3-5 opener. */
const line35: DominoLine = { tiles: [placed('d20')], leftEnd: 3, rightEnd: 5 }

function mkState(p: Partial<DominoGameState>): DominoGameState {
  return {
    phase: 'idle',
    players: players(2),
    hands: [[], []],
    boneyard: [],
    line: EMPTY,
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

describe('endsForTile / legalPlays', () => {
  it('treats every tile as a legal opener on an empty line', () => {
    const hand = [T('d8'), T('d27')]
    const plays = legalPlays(hand, EMPTY)
    expect(plays).toHaveLength(2)
    expect(plays.every((p) => p.ends.length === 1 && p.ends[0] === 'right')).toBe(true)
  })

  it('matches each open end independently', () => {
    expect(endsForTile(T('d19'), line35)).toEqual(['left']) // 3-4 fits the 3 end
    expect(endsForTile(T('d23'), line35)).toEqual(['right']) // 4-5 fits the 5 end
    expect(endsForTile(T('d20'), line35)).toEqual(['left', 'right']) // 3-5 fits both
    expect(endsForTile(T('d8'), line35)).toEqual([]) // 1-2 fits neither
  })

  it('offers a single placement when both ends show the same value', () => {
    const sameEnds: DominoLine = { tiles: [placed('d18')], leftEnd: 3, rightEnd: 3 }
    expect(endsForTile(T('d19'), sameEnds)).toEqual(['right'])
  })
})

describe('orientFor', () => {
  it('orients a tile so its matching pip faces the chain', () => {
    // 3-4 on the left end (3): second pip must be 3.
    const flipLeft = orientFor(T('d19'), 'left', line35)
    expect(flipLeft).toBe(true)
    expect(secondPip(T('d19'), flipLeft!)).toBe(3)
    // 4-5 on the right end (5): first pip must be 5, new tail pip is 4.
    const flipRight = orientFor(T('d23'), 'right', line35)
    expect(flipRight).toBe(true)
    expect(secondPip(T('d23'), flipRight!)).toBe(4)
  })

  it('returns null when the tile cannot attach', () => {
    expect(orientFor(T('d8'), 'left', line35)).toBeNull()
  })
})

describe('resolvePlay', () => {
  it('opens a fresh line with canonical orientation', () => {
    const state = mkState({ hands: [[T('d20')], []], line: EMPTY })
    const res = resolvePlay(state, 'd20', 'right')
    expect(res).toMatchObject({ kind: 'play', seat: 0, tileId: 'd20', flip: false, isWin: true })
  })

  it('computes flip and isWin against an existing line', () => {
    const state = mkState({ hands: [[T('d19'), T('d8')], []], line: line35 })
    const res = resolvePlay(state, 'd19', 'left')!
    expect(res.kind).toBe('play')
    expect(res.flip).toBe(true)
    expect(res.isWin).toBe(false) // two tiles in hand, one played
  })

  it('rejects an illegal end', () => {
    const state = mkState({ hands: [[T('d8')], []], line: line35 })
    expect(resolvePlay(state, 'd8', 'left')).toBeNull()
  })
})

describe('resolveDrawTurn', () => {
  it('draws until a playable tile appears, then lays it', () => {
    // Boneyard top is the LAST element. Top = 1-2 (unplayable on 3..5),
    // next = 3-4 (playable on the 3 end).
    const state = mkState({
      hands: [[T('d27')], []], // 6-6, unplayable
      line: line35,
      boneyard: [T('d19'), T('d8')], // bottom..top → draws d8 then d19
    })
    const res = resolveDrawTurn(state)
    expect(res.kind).toBe('play')
    if (res.kind === 'play') {
      expect(res.drewBefore).toBe(2)
      expect(res.tileId).toBe('d19')
    }
  })

  it('passes when the boneyard is exhausted with no play', () => {
    const state = mkState({
      hands: [[T('d27')], []],
      line: line35,
      boneyard: [T('d8')], // 1-2, still unplayable
    })
    const res = resolveDrawTurn(state)
    expect(res.kind).toBe('pass')
    if (res.kind === 'pass') expect(res.drewBefore).toBe(1)
  })
})

describe('blocked-board detection & scoring', () => {
  it('handPips sums both halves', () => {
    expect(handPips([T('d27'), T('d8')])).toBe(12 + 3)
  })

  it('anyoneCanPlay reflects the live ends', () => {
    const blocked: DominoLine = { tiles: [placed('d27')], leftEnd: 6, rightEnd: 6 }
    expect(anyoneCanPlay([[T('d8')], [T('d0')]], blocked)).toBe(false)
    expect(anyoneCanPlay([[T('d12')], []], blocked)).toBe(true) // 1-6 fits a 6 end
  })

  it('blockStandings finds fewest-pip winner(s), including ties', () => {
    expect(blockStandings([[T('d8')], [T('d27')]])).toMatchObject({ winners: [0] })
    expect(blockStandings([[T('d8')], [T('d8')]]).winners).toEqual([0, 1]) // tie
  })

  it('resolvePass marks the board blocked and carries final standings', () => {
    const blocked: DominoLine = { tiles: [placed('d27')], leftEnd: 6, rightEnd: 6 }
    const state = mkState({
      currentPlayerIndex: 0,
      hands: [[T('d8')], [T('d0')]], // 1-2 vs 0-0, neither has a 6
      line: blocked,
      boneyard: [],
    })
    const res = resolvePass(state)
    expect(res).toMatchObject({ kind: 'pass', blocks: true, blockWinners: [1] })
    expect(res.pipCounts).toEqual([3, 0])
  })
})
