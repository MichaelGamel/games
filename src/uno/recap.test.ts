import { describe, it, expect } from 'vitest'
import { summarizeUno } from './recap'
import { DEFAULT_UNO_RULES } from './config'
import type { MatchLog } from '../lib/matchLog'
import type { UnoCard, UnoColor, UnoRules, UnoTurnResolution, UnoValue } from './types'

let seq = 0
const card = (color: UnoColor | null, value: UnoValue): UnoCard => ({ id: `r${seq++}`, color, value })
const turn = (seat: number, resolution: UnoTurnResolution) => ({ kind: 'turn' as const, seat, resolution })

const log = (events: ReturnType<typeof turn>[]): MatchLog<UnoTurnResolution, UnoRules> => ({
  players: [
    { name: 'A', color: '#a00' },
    { name: 'B', color: '#0a0' },
  ],
  rules: { ...DEFAULT_UNO_RULES },
  events,
})

describe('summarizeUno', () => {
  it('counts plays, actions, wilds, draws, UNO calls and penalties', () => {
    const recap = summarizeUno(
      log([
        turn(0, {
          kind: 'play',
          seat: 0,
          cards: [card('red', 5)],
          declaredUno: false,
          effect: { reversed: false, skipped: false, nextIndex: 1, isRoundWin: false },
        }),
        turn(0, {
          kind: 'play',
          seat: 0,
          cards: [card('red', 'skip')],
          declaredUno: false,
          effect: { reversed: false, skipped: true, nextIndex: 1, isRoundWin: false },
        }),
        turn(0, {
          kind: 'play',
          seat: 0,
          cards: [card(null, 'wild4')],
          chosenColor: 'blue',
          declaredUno: true,
          effect: { reversed: false, skipped: false, penaltyDraw: { seat: 1, count: 4 }, nextIndex: 1, isRoundWin: false },
        }),
        turn(1, { kind: 'draw', seat: 1, count: 4, thenPlay: null }),
        turn(0, { kind: 'callout', seat: 0, target: 1, penalty: { seat: 1, count: 2 } }),
      ]),
    )

    expect(recap.totalTurns).toBe(5)
    const a = recap.players[0]
    expect(a.cardsPlayed).toBe(3)
    expect(a.actionsPlayed).toBe(1)
    expect(a.wildsPlayed).toBe(1)
    expect(a.unoCalls).toBe(1)

    const b = recap.players[1]
    expect(b.cardsDrawn).toBe(6) // 4 penalty + 2 callout
    expect(b.penalties).toBe(1)
  })

  it('ignores non-turn events', () => {
    const recap = summarizeUno({
      ...log([]),
      events: [{ kind: 'skip', seat: 0 }],
    })
    expect(recap.totalTurns).toBe(0)
  })
})
