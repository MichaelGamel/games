import { describe, it, expect } from 'vitest'
import { chooseBotPlay, mostCommonColor } from './bot'
import { initialUnoState } from './unoReducer'
import { DEFAULT_UNO_RULES } from './config'
import type { UnoCard, UnoColor, UnoGameState, UnoRules, UnoValue } from './types'

let seq = 0
const card = (color: UnoColor | null, value: UnoValue): UnoCard => ({ id: `b${seq++}`, color, value })

const players = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i, name: `P${i}`, color: '#000', isBot: true }))

function gs(over: Partial<UnoGameState>, rules: Partial<UnoRules> = {}): UnoGameState {
  return {
    ...initialUnoState,
    players: players(over.hands?.length ?? 2),
    rules: { ...DEFAULT_UNO_RULES, ...rules },
    ...over,
  }
}

describe('mostCommonColor', () => {
  it('returns the suit held most (wilds ignored, ties by canonical order)', () => {
    expect(mostCommonColor([card('blue', 1), card('blue', 2), card('red', 3), card(null, 'wild')])).toBe('blue')
    expect(mostCommonColor([card(null, 'wild')])).toBe('red') // no colors → first
  })
})

describe('chooseBotPlay', () => {
  it('draws when nothing is legal', () => {
    const s = gs({ currentPlayerIndex: 0, activeColor: 'red', discard: [card('red', 9)], hands: [[card('blue', 1), card('green', 2)], []] })
    expect(chooseBotPlay(s, 0).type).toBe('draw')
  })

  it('plays the highest-value matching card and saves wilds', () => {
    const s = gs({
      currentPlayerIndex: 0,
      activeColor: 'red',
      discard: [card('red', 3)],
      hands: [[card('red', 2), card('red', 8), card(null, 'wild')], []],
    })
    const move = chooseBotPlay(s, 0)
    expect(move.type).toBe('play')
    if (move.type === 'play') {
      expect(move.cards[0].value).toBe(8) // dump the 8, not the 2 or the wild
    }
  })

  it('picks a color it holds most of when forced to play a wild', () => {
    const s = gs({
      currentPlayerIndex: 0,
      activeColor: 'red',
      discard: [card('red', 3)],
      hands: [[card('blue', 1), card('blue', 7), card(null, 'wild')], []],
    })
    const move = chooseBotPlay(s, 0)
    // No colored card matches red → it must play the wild, choosing blue.
    expect(move.type).toBe('play')
    if (move.type === 'play') {
      expect(move.cards[0].value).toBe('wild')
      expect(move.chosenColor).toBe('blue')
    }
  })

  it('declares UNO when the play leaves one card', () => {
    const s = gs({
      currentPlayerIndex: 0,
      activeColor: 'red',
      discard: [card('red', 3)],
      hands: [[card('red', 5), card('green', 9)], []],
    })
    const move = chooseBotPlay(s, 0)
    expect(move.type).toBe('play')
    if (move.type === 'play') expect(move.declareUno).toBe(true)
  })

  it('challenges a Wild-Draw-Four it can see was a bluff', () => {
    const s = gs(
      {
        currentPlayerIndex: 1,
        activeColor: 'green',
        pendingDraw: 4,
        pendingDrawType: 'wild4',
        wild4Challenge: { by: 0, priorColor: 'red' },
        discard: [card(null, 'wild4')],
        hands: [[card('red', 2)], [card('blue', 1)]], // seat 0 still holds red → bluff
      },
      { challengeWild4: true },
    )
    expect(chooseBotPlay(s, 1).type).toBe('challenge')
  })

  it('does not challenge a legitimate Wild-Draw-Four', () => {
    const s = gs(
      {
        currentPlayerIndex: 1,
        activeColor: 'green',
        pendingDraw: 4,
        pendingDrawType: 'wild4',
        wild4Challenge: { by: 0, priorColor: 'red' },
        discard: [card(null, 'wild4')],
        hands: [[card('blue', 2)], [card('blue', 1)]], // seat 0 has no red → legal
      },
      { challengeWild4: true },
    )
    expect(chooseBotPlay(s, 1).type).toBe('draw')
  })
})
