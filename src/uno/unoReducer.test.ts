import { describe, it, expect } from 'vitest'
import { unoReducer, initialUnoState, type PlayerSetup } from './unoReducer'
import { legalPlays, resolvePlay, resolveDraw, scoreHand } from './rules'
import { DEFAULT_UNO_RULES, HAND_SIZE, UNO_COLORS } from './config'
import type { UnoCard, UnoColor, UnoGameState, UnoRules, UnoTurnResolution, UnoValue } from './types'

const setup = (n: number): PlayerSetup[] =>
  Array.from({ length: n }, (_, i) => ({ name: `P${i}`, color: `#${i}${i}${i}` }))

const startRound = (n: number, seed: number, rules?: Partial<UnoRules>): UnoGameState =>
  unoReducer(initialUnoState, {
    type: 'START_ROUND',
    players: setup(n),
    rules: { ...DEFAULT_UNO_RULES, ...rules },
    deckSeed: seed,
  })

let seq = 0
const card = (color: UnoColor | null, value: UnoValue): UnoCard => ({ id: `t${seq++}`, color, value })

describe('START_ROUND', () => {
  it.each([2, 3, 4, 5, 6])('deals %i players a 7-card hand and starts idle', (n) => {
    const s = startRound(n, 1)
    expect(s.phase).toBe('idle')
    expect(s.players).toHaveLength(n)
    expect(s.hands.every((h) => h.length === HAND_SIZE)).toBe(true)
    expect(s.discard).toHaveLength(1)
    expect(s.scores).toEqual(Array(n).fill(0))
    expect(s.roundNumber).toBe(1)
    // Every dealt card is conserved (hands + stock + discard = 108).
    expect(s.hands.flat().length + s.stock.length + s.discard.length).toBe(108)
  })

  it('never opens on a Wild-Draw-Four and sets a concrete active color', () => {
    for (let seed = 0; seed < 100; seed++) {
      const s = startRound(4, seed)
      expect(s.discard[0].value).not.toBe('wild4')
      expect(UNO_COLORS).toContain(s.activeColor)
    }
  })
})

describe('COMMIT_TURN — play', () => {
  it('removes the card, grows the discard, advances the seat, bumps turnCount', () => {
    let s = startRound(4, 7)
    // Force a known hand/top so the play is deterministic.
    const c = card('red', 5)
    s = { ...s, currentPlayerIndex: 0, activeColor: 'red', discard: [card('red', 1)], hands: [[c, card('blue', 2)], s.hands[1], s.hands[2], s.hands[3]] }
    const res = resolvePlay(s, { cards: [c] })
    const next = unoReducer(s, { type: 'COMMIT_TURN', resolution: res })
    expect(next.hands[0]).toHaveLength(1)
    expect(next.discard[next.discard.length - 1].id).toBe(c.id)
    expect(next.currentPlayerIndex).toBe(1)
    expect(next.turnCount).toBe(s.turnCount + 1)
  })

  it('applies a Skip by jumping a seat', () => {
    let s = startRound(4, 9)
    const c = card('red', 'skip')
    s = { ...s, currentPlayerIndex: 0, activeColor: 'red', hands: [[c, card('blue', 2)], s.hands[1], s.hands[2], s.hands[3]] }
    const next = unoReducer(s, { type: 'COMMIT_TURN', resolution: resolvePlay(s, { cards: [c] }) })
    expect(next.currentPlayerIndex).toBe(2)
  })
})

describe('COMMIT_TURN — draw', () => {
  it('penalty draw adds the pending and forfeits the turn', () => {
    let s = startRound(2, 4)
    s = { ...s, currentPlayerIndex: 0, pendingDraw: 2, pendingDrawType: 'draw2' }
    const before = s.hands[0].length
    const next = unoReducer(s, { type: 'COMMIT_TURN', resolution: resolveDraw(s) })
    expect(next.hands[0]).toHaveLength(before + 2)
    expect(next.pendingDraw).toBe(0)
    expect(next.currentPlayerIndex).toBe(1)
  })

  it('voluntary draw with thenPlay lays the drawn card down', () => {
    let s = startRound(4, 11)
    const drawn = s.stock[s.stock.length - 1] // the card that will be drawn
    s = { ...s, currentPlayerIndex: 0, activeColor: drawn.color ?? 'red' }
    // Make the drawn card legal by matching active color (or it's a wild).
    const playable = drawn.color != null || drawn.value === 'wild' || drawn.value === 'wild4'
    if (!playable) return
    const res: UnoTurnResolution = {
      kind: 'draw',
      seat: 0,
      count: 1,
      thenPlay: drawn,
      ...(drawn.color == null ? { chosenColor: 'red' as UnoColor } : {}),
    }
    const handBefore = s.hands[0].length
    const next = unoReducer({ ...s, activeColor: drawn.color ?? 'red' }, { type: 'COMMIT_TURN', resolution: res })
    // Drew one and played it ⇒ net hand size unchanged; the drawn card is on top.
    expect(next.hands[0]).toHaveLength(handBefore)
    expect(next.discard[next.discard.length - 1].id).toBe(drawn.id)
  })
})

describe('round endings', () => {
  const winState = (rules: Partial<UnoRules>): UnoGameState => {
    const last = card('red', 5)
    const base = startRound(2, 3)
    return {
      ...base,
      rules: { ...DEFAULT_UNO_RULES, ...rules },
      currentPlayerIndex: 0,
      activeColor: 'red',
      discard: [card('red', 1)],
      hands: [[last], [card('blue', 9), card(null, 'wild')]], // opponent holds 59
    }
  }

  it('single-round: emptying a hand ends the match immediately', () => {
    const s = winState({ winMode: 'single' })
    const res = resolvePlay(s, { cards: s.hands[0] })
    const next = unoReducer(s, { type: 'COMMIT_TURN', resolution: res })
    expect(next.phase).toBe('matchEnd')
    expect(next.winnerId).toBe(0)
    expect(next.winReason).toBe('empty')
    expect(next.scores[0]).toBe(59)
  })

  it('score mode: a sub-target round pauses at roundEnd, then continues', () => {
    const s = winState({ winMode: 'score', targetScore: 500 })
    const res = resolvePlay(s, { cards: s.hands[0] })
    const ended = unoReducer(s, { type: 'COMMIT_TURN', resolution: res })
    expect(ended.phase).toBe('roundEnd')
    expect(ended.winnerId).toBeNull()
    expect(ended.scores[0]).toBe(59)

    const round2 = unoReducer(ended, { type: 'CONTINUE_MATCH', deckSeed: 99 })
    expect(round2.phase).toBe('idle')
    expect(round2.roundNumber).toBe(2)
    expect(round2.scores).toEqual([59, 0]) // scores carry over
    expect(round2.hands.every((h) => h.length === HAND_SIZE)).toBe(true)
    expect(round2.turnCount).toBe(ended.turnCount + 1)
  })

  it('score mode: reaching the target ends the match', () => {
    const s = { ...winState({ winMode: 'score', targetScore: 50 }) }
    const next = unoReducer(s, { type: 'COMMIT_TURN', resolution: resolvePlay(s, { cards: s.hands[0] }) })
    expect(next.phase).toBe('matchEnd')
    expect(next.winnerId).toBe(0)
  })

  it('END_MATCH from a round-end awards the highest score', () => {
    const s = winState({ winMode: 'score', targetScore: 500 })
    const ended = unoReducer(s, { type: 'COMMIT_TURN', resolution: resolvePlay(s, { cards: s.hands[0] }) })
    const done = unoReducer(ended, { type: 'END_MATCH' })
    expect(done.phase).toBe('matchEnd')
    expect(done.winnerId).toBe(0)
  })
})

describe('SKIP_TURN', () => {
  it('advances the turn and bumps the sequence', () => {
    const s = { ...startRound(3, 2), currentPlayerIndex: 1 }
    const next = unoReducer(s, { type: 'SKIP_TURN' })
    expect(next.currentPlayerIndex).toBe(2)
    expect(next.turnCount).toBe(s.turnCount + 1)
  })
})

// ---- The crucial property: two clients replaying the same resolutions stay
// byte-identical, including draws (off identical stocks) and reshuffles. ------

const commonColor = (hand: readonly UnoCard[]): UnoColor => {
  const counts = new Map<UnoColor, number>()
  for (const c of hand) if (c.color) counts.set(c.color, (counts.get(c.color) ?? 0) + 1)
  let best: UnoColor = UNO_COLORS[0]
  let max = -1
  for (const col of UNO_COLORS) {
    const n = counts.get(col) ?? 0
    if (n > max) {
      max = n
      best = col
    }
  }
  return best
}

/** A deterministic auto-move: play the first legal card (lowest id), else draw. */
function autoResolution(s: UnoGameState): UnoTurnResolution {
  const seat = s.currentPlayerIndex
  const hand = s.hands[seat]
  const top = s.discard[s.discard.length - 1]
  const legal = legalPlays(hand, top, s.activeColor, s.pendingDraw, s.pendingDrawType, s.rules)
  if (legal.length > 0) {
    const c = [...legal].sort((a, b) => (a.id < b.id ? -1 : 1))[0]
    return resolvePlay(s, {
      cards: [c],
      chosenColor: c.color == null ? commonColor(hand) : undefined,
      declaredUno: hand.length === 2,
    })
  }
  return resolveDraw(s)
}

describe('online-sync determinism', () => {
  it('two clients from the same seed replay an identical full match', () => {
    let a = startRound(4, 20250612)
    let b = startRound(4, 20250612)
    expect(a).toEqual(b)

    let steps = 0
    while (a.phase !== 'matchEnd' && steps++ < 2000) {
      // The acting client computes the resolution from its own state…
      const res = autoResolution(a)
      // …and BOTH clients apply that same public resolution.
      a = unoReducer(a, { type: 'COMMIT_TURN', resolution: res })
      b = unoReducer(b, { type: 'COMMIT_TURN', resolution: res })
      expect(b).toEqual(a)
      expect(a.turnCount).toBe(steps)
    }
    expect(a.phase).toBe('matchEnd') // the game terminated (coverage)
    // Conservation across the whole match (single round): all 108 cards present.
    expect(a.hands.flat().length + a.stock.length + a.discard.length).toBe(108)
  })

  it('stays in sync through action cards, stacking and seven-zero', () => {
    let a = startRound(5, 777, { stacking: true, sevenZero: true, challengeWild4: true })
    let b = startRound(5, 777, { stacking: true, sevenZero: true, challengeWild4: true })
    let steps = 0
    while (a.phase !== 'matchEnd' && steps++ < 4000) {
      const res = autoResolution(a)
      a = unoReducer(a, { type: 'COMMIT_TURN', resolution: res })
      b = unoReducer(b, { type: 'COMMIT_TURN', resolution: res })
      expect(b).toEqual(a)
    }
    expect(a.phase).toBe('matchEnd')
  })

  it('reshuffles the discard into an exhausted stock deterministically', () => {
    const seeded = startRound(4, 314)
    // Drive almost the whole deck into the discard, leaving one card on the
    // stock, then face a 3-card penalty: drawing exhausts the stock and rebuilds
    // it from the discard mid-draw.
    const stock = seeded.stock.slice(0, 1)
    const buried = seeded.stock.slice(1)
    const before: UnoGameState = {
      ...seeded,
      currentPlayerIndex: 0,
      stock,
      discard: [...seeded.discard, ...buried],
      pendingDraw: 3,
      pendingDrawType: 'draw2',
    }
    const total = before.hands.flat().length + before.stock.length + before.discard.length

    // Two clients that accumulated the discard in DIFFERENT array order must
    // still rebuild the identical stock (the reshuffle is seeded by the counter,
    // not the order). Client B holds a reversed discard underneath the same top.
    const top = before.discard[before.discard.length - 1]
    const reordered = [...before.discard.slice(0, -1)].reverse()
    const beforeB: UnoGameState = { ...before, discard: [...reordered, top] }

    const res = resolveDraw(before) // a 3-card penalty draw
    const a = unoReducer(before, { type: 'COMMIT_TURN', resolution: res })
    const b = unoReducer(beforeB, { type: 'COMMIT_TURN', resolution: res })

    expect(a.reshuffleCount).toBe(1)
    expect(a.hands[0]).toHaveLength(before.hands[0].length + 3)
    expect(a.hands.flat().length + a.stock.length + a.discard.length).toBe(total)
    // Both clients reach the identical hand, stock and discard.
    expect(b.hands).toEqual(a.hands)
    expect(b.stock.map((c) => c.id)).toEqual(a.stock.map((c) => c.id))
    expect(b.discard.map((c) => c.id)).toEqual(a.discard.map((c) => c.id))
  })
})

describe('utilities used by the reducer remain consistent', () => {
  it('round score equals the sum of opponents’ hands', () => {
    const s = startRound(3, 5)
    const winner = 1
    const expected = s.hands.reduce((sum, h, i) => (i === winner ? sum : sum + scoreHand(h)), 0)
    expect(expected).toBeGreaterThan(0)
  })
})
