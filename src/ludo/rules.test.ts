import { describe, expect, it } from 'vitest'
import { legalMoves, resolveLudoMove, rollDie } from './rules'
import { DEFAULT_LUDO_RULES } from './config'
import type { LudoGameState } from './types'

/** Build a minimal idle state from each seat's 4 token progresses. */
function makeState(tokensPerSeat: number[][], partial: Partial<LudoGameState> = {}): LudoGameState {
  return {
    players: tokensPerSeat.map((tokens, id) => ({
      id,
      name: `P${id}`,
      color: '#000',
      tokens: [...tokens],
      hasCaptured: false,
      isBot: false,
    })),
    currentPlayerIndex: 0,
    phase: 'idle',
    rules: { ...DEFAULT_LUDO_RULES },
    lastRoll: null,
    lastDice: [],
    winnerId: null,
    winReason: null,
    finishedOrder: [],
    turnCount: 0,
    consecutiveSixes: 0,
    ...partial,
  }
}

const base = () => [-1, -1, -1, -1]

describe('rollDie', () => {
  it('maps the rng range to 1..6', () => {
    expect(rollDie(() => 0)).toBe(1)
    expect(rollDie(() => 0.99)).toBe(6)
    expect(rollDie(() => 0.5)).toBe(4)
  })

  it('always returns 1..6 for random input', () => {
    for (let i = 0; i < 200; i++) {
      const v = rollDie()
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(6)
    }
  })
})

describe('releasing a token from base', () => {
  it('requires a 6 — nothing leaves base on any other roll', () => {
    const s = makeState([base(), base()])
    expect(legalMoves(s, 0, 5)).toEqual([])
    expect(legalMoves(s, 0, 1)).toEqual([])
  })

  it('pops every base token onto the entry square on a 6', () => {
    const s = makeState([base(), base()])
    const moves = legalMoves(s, 0, 6)
    expect(moves).toHaveLength(4)
    expect(moves.every((m) => m.releasedFromBase && m.to === 0 && m.captures.length === 0)).toBe(
      true,
    )
  })
})

describe('exact roll to finish', () => {
  it('completes a token on the exact roll into the goal', () => {
    const s = makeState([[53, 56, 56, 56], base()])
    const moves = legalMoves(s, 0, 3)
    expect(moves).toHaveLength(1)
    const r = resolveLudoMove(s, 0, 3)
    expect(r.to).toBe(56)
    expect(r.reachedHome).toBe(true)
    expect(r.isWin).toBe(true) // all four now home
    expect(r.extraTurn).toBe(false) // no extra turn once the seat finishes
  })

  it('forbids overshooting the goal', () => {
    const s = makeState([[53, 56, 56, 56], base()])
    expect(legalMoves(s, 0, 4)).toEqual([]) // would overshoot 56 → no move
    expect(resolveLudoMove(s, -1, 4).noMove).toBe(true)
  })
})

describe('capturing opponents', () => {
  it('captures a lone opponent on a non-safe landing and earns an extra turn', () => {
    // seat 0 token from 4 + 3 = abs 7 (non-safe); seat 1 token sits on abs 7.
    const s = makeState([[4, -1, -1, -1], [46, -1, -1, -1]])
    const moves = legalMoves(s, 0, 3)
    expect(moves[0].captures).toEqual([{ seat: 1, tokenId: 0 }])
    const r = resolveLudoMove(s, 0, 3)
    expect(r.captures).toEqual([{ seat: 1, tokenId: 0 }])
    expect(r.extraTurn).toBe(true)
  })

  it('does not capture on a safe square — tokens coexist', () => {
    // seat 0 token from 5 + 3 = abs 8 (a safe star); seat 1 token sits on abs 8.
    const s = makeState([[5, -1, -1, -1], [47, -1, -1, -1]])
    const r = resolveLudoMove(s, 0, 3)
    expect(r.to).toBe(8)
    expect(r.captures).toEqual([])
    expect(r.extraTurn).toBe(false)
  })

  it('maps captures through each seat own offset (seat 2)', () => {
    // seat 2 token from 4 + 3 = abs (26+7)%52 = 33; seat 0 token sits on abs 33.
    const s = makeState([[33, -1, -1, -1], base(), [4, -1, -1, -1]], { currentPlayerIndex: 2 })
    const r = resolveLudoMove(s, 0, 3)
    expect(r.captures).toEqual([{ seat: 0, tokenId: 0 }])
  })
})

describe('blocks', () => {
  it('an opponent block stops a token passing through it', () => {
    // seat 1 holds a block on abs 10; seat 0 would step over it (8 → 12).
    const s = makeState([[8, -1, -1, -1], [49, 49, -1, -1]])
    expect(legalMoves(s, 0, 4)).toEqual([])
  })

  it('an opponent block stops a token landing on it', () => {
    const s = makeState([[6, -1, -1, -1], [49, 49, -1, -1]])
    expect(legalMoves(s, 0, 4)).toEqual([]) // 6 → 10 lands on the block
  })

  it("a player's own block is transparent to their own tokens", () => {
    // seat 0 holds its own block on abs 10; token 2 steps over it (8 → 12).
    const s = makeState([[10, 10, 8, -1], base()])
    const ids = legalMoves(s, 0, 4).map((m) => m.tokenId)
    expect(ids).toContain(2)
  })
})

describe('three consecutive sixes', () => {
  it('the third six is a forced no-move (the prior moves stand)', () => {
    const s = makeState([[5, -1, -1, -1], base()], { consecutiveSixes: 2 })
    expect(legalMoves(s, 0, 6)).toEqual([])
    const r = resolveLudoMove(s, 0, 6)
    expect(r.noMove).toBe(true)
    expect(r.sixCount).toBe(3)
    expect(r.extraTurn).toBe(false)
  })

  it('the first and second six still move and grant another roll', () => {
    const s = makeState([[5, -1, -1, -1], base()], { consecutiveSixes: 1 })
    expect(legalMoves(s, 0, 6).length).toBeGreaterThan(0)
    const r = resolveLudoMove(s, 0, 6)
    expect(r.noMove).toBe(false)
    expect(r.sixCount).toBe(2)
    expect(r.extraTurn).toBe(true)
  })
})

describe('no legal move ends the turn', () => {
  it('returns an empty list and a no-move resolution', () => {
    const s = makeState([base(), base()])
    expect(legalMoves(s, 0, 5)).toEqual([])
    const r = resolveLudoMove(s, -1, 5)
    expect(r.noMove).toBe(true)
    expect(r.extraTurn).toBe(false)
    expect(r.sixCount).toBe(0)
  })
})

describe('extra turn on a non-final six', () => {
  it('grants another roll and records the six count', () => {
    const s = makeState([[5, -1, -1, -1], base()])
    const r = resolveLudoMove(s, 0, 6)
    expect(r.extraTurn).toBe(true)
    expect(r.sixCount).toBe(1)
    expect(r.to).toBe(11)
  })
})

describe('rule variants', () => {
  const rules = (over: Partial<LudoGameState['rules']>) => ({
    diceCount: 1 as const,
    startWithOneOut: false,
    blockades: true,
    captureToEnterHome: false,
    teams: false,
    ...over,
  })

  describe('two dice', () => {
    it('moves a board token by the sum of both dice', () => {
      const s = makeState([[5, -1, -1, -1], base()], { rules: rules({ diceCount: 2 }) })
      const r = resolveLudoMove(s, 0, [3, 4])
      expect(r.roll).toBe(7)
      expect(r.to).toBe(12)
      expect(r.dice).toEqual([3, 4])
    })

    it('releases on a 6 on either die', () => {
      const s = makeState([base(), base()], { rules: rules({ diceCount: 2 }) })
      expect(legalMoves(s, 0, [6, 2]).every((m) => m.releasedFromBase)).toBe(true)
      expect(legalMoves(s, 0, [2, 5])).toEqual([])
    })

    it('doubles (not sixes) chain the extra turn', () => {
      const s = makeState([[5, -1, -1, -1], base()], { rules: rules({ diceCount: 2 }) })
      expect(resolveLudoMove(s, 0, [4, 4]).extraTurn).toBe(true)
      expect(resolveLudoMove(s, 0, [6, 2]).extraTurn).toBe(false)
    })

    it('a third consecutive doubles is a forced no-move', () => {
      const s = makeState([[5, -1, -1, -1], base()], {
        rules: rules({ diceCount: 2 }),
        consecutiveSixes: 2,
      })
      expect(legalMoves(s, 0, [4, 4])).toEqual([])
      const r = resolveLudoMove(s, 0, [4, 4])
      expect(r.noMove).toBe(true)
      expect(r.sixCount).toBe(3)
    })
  })

  describe('blockades off', () => {
    it('lets tokens pass straight through opponent pairs', () => {
      const s = makeState([[8, -1, -1, -1], [49, 49, -1, -1]], {
        rules: rules({ blockades: false }),
      })
      expect(legalMoves(s, 0, 4)).toHaveLength(1) // blocked when blockades are on
    })
  })

  describe('capture gate', () => {
    it('closes the home column until the seat captures', () => {
      const s = makeState([[50, 56, 56, 56], base()], {
        rules: rules({ captureToEnterHome: true }),
      })
      expect(legalMoves(s, 0, 3)).toEqual([]) // 50 → 53 enters the home column
    })

    it('opens it after a capture', () => {
      const s = makeState([[50, 56, 56, 56], base()], {
        rules: rules({ captureToEnterHome: true }),
      })
      s.players[0].hasCaptured = true
      expect(legalMoves(s, 0, 3)).toHaveLength(1)
    })
  })

  describe('teams (2v2)', () => {
    const teamState = () =>
      makeState(
        [
          [4, -1, -1, -1], // seat 0 — team A
          [46, -1, -1, -1], // seat 1 — team B (on abs 7 from seat 0's view? no: 46+13=59%52=7) ✔
          [33, -1, -1, -1], // seat 2 — team A (abs (26+33)%52 = 7)
          base(), // seat 3 — team B
        ],
        { rules: rules({ teams: true }) },
      )

    it('never captures a teammate', () => {
      // Seat 0 moves 4 → 7 (abs 7). Seat 2 (teammate) sits on abs 7 too:
      // (26 + 33) % 52 = 7. Only the rival seat 1 token is captured.
      const s = teamState()
      const r = resolveLudoMove(s, 0, 3)
      expect(r.captures).toEqual([{ seat: 1, tokenId: 0 }])
    })

    it('teammate blockades are transparent', () => {
      const s = makeState(
        [
          [8, -1, -1, -1], // seat 0
          base(),
          [35, 35, -1, -1], // seat 2 — teammate pair on abs (26+35)%52 = 9
          base(),
        ],
        { rules: rules({ teams: true }) },
      )
      // 8 → 12 passes abs 9..12; the teammate pair on abs 9 must not block.
      expect(legalMoves(s, 0, 4)).toHaveLength(1)
    })
  })
})
