import { describe, expect, it } from 'vitest'
import { ChessEngine } from './engine'
import { chooseMove } from './ai'

describe('ChessEngine', () => {
  it('starts with 32 pieces and White to move', () => {
    const e = new ChessEngine()
    expect(e.placements()).toHaveLength(32)
    expect(e.turn()).toBe('w')
  })

  it('lists legal pawn targets', () => {
    const e = new ChessEngine()
    const tos = e.legalTargets('e2').map((t) => t.to).sort()
    expect(tos).toEqual(['e3', 'e4'])
  })

  it('resolves a plain pawn move', () => {
    const e = new ChessEngine()
    const anim = e.move('e2', 'e4')
    expect(anim).not.toBeNull()
    expect(anim!.san).toBe('e4')
    expect(anim!.captureSquare).toBeUndefined()
    expect(e.turn()).toBe('b')
  })

  it('reports a capture with the captured square and type', () => {
    const e = new ChessEngine()
    e.move('e2', 'e4')
    e.move('d7', 'd5')
    const anim = e.move('e4', 'd5')
    expect(anim!.capturedType).toBe('p')
    expect(anim!.captureSquare).toBe('d5')
  })

  it('marks en passant on the pawn beside the mover', () => {
    const e = new ChessEngine()
    e.move('e2', 'e4')
    e.move('a7', 'a6')
    e.move('e4', 'e5')
    e.move('d7', 'd5') // sets up en passant on d6
    const anim = e.move('e5', 'd6')
    expect(anim!.capturedType).toBe('p')
    expect(anim!.captureSquare).toBe('d5') // pawn removed beside, not on d6
  })

  it('resolves kingside castling with the rook slide', () => {
    const e = new ChessEngine()
    for (const [from, to] of [
      ['e2', 'e4'], ['e7', 'e5'],
      ['g1', 'f3'], ['g8', 'f6'],
      ['f1', 'c4'], ['f8', 'c5'],
    ] as const) {
      e.move(from, to)
    }
    const anim = e.move('e1', 'g1')
    expect(anim!.san).toBe('O-O')
    expect(anim!.rook).toEqual({ from: 'h1', to: 'f1' })
  })

  it('detects promotion and applies a chosen piece', () => {
    const e = new ChessEngine()
    // march a white pawn to the seventh rank
    e.move('a2', 'a4'); e.move('b7', 'b5')
    e.move('a4', 'b5'); e.move('a7', 'a6')
    e.move('b5', 'b6'); e.move('a6', 'a5')
    e.move('b6', 'b7'); e.move('a5', 'a4')
    expect(e.isPromotion('b7', 'a8') || e.isPromotion('b7', 'b8')).toBe(true)
    const target = e.isPromotion('b7', 'b8') ? 'b8' : 'a8'
    const anim = e.move('b7', target, 'q')
    expect(anim!.promotion).toBe('q')
  })

  it('detects checkmate (fool’s mate) and names the winner', () => {
    const e = new ChessEngine()
    e.move('f2', 'f3'); e.move('e7', 'e5')
    e.move('g2', 'g4'); e.move('d8', 'h4')
    const status = e.status()
    expect(status.outcome).toEqual({ kind: 'checkmate', winner: 'b' })
  })
})

describe('chooseMove (AI)', () => {
  it('returns a legal move from the opening position', () => {
    const e = new ChessEngine()
    const intent = chooseMove(e.fen(), 'medium')
    expect(intent).not.toBeNull()
    const legal = e.legalTargets(intent!.from).some((t) => t.to === intent!.to)
    expect(legal).toBe(true)
  })

  it('grabs a genuinely free hanging rook', () => {
    // White to move: Qd3 can take the undefended black rook on d5.
    const fen = '4k3/8/8/3r4/8/3Q4/8/4K3 w - - 0 1'
    const intent = chooseMove(fen, 'hard')
    expect(intent).not.toBeNull()
    expect(intent!.from).toBe('d3')
    expect(intent!.to).toBe('d5')
  })
})
