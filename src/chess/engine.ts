/**
 * The rules engine — a thin, fully-typed facade over `chess.js`. It owns the one
 * mutable `Chess` instance and translates its results into the pure domain
 * shapes in `types.ts`. Nothing else in the app imports `chess.js` directly, so
 * the rest of the codebase never depends on that library's surface.
 *
 * The key product is {@link ChessEngine.move}: it returns a {@link MoveAnimation}
 * — the *complete* outcome of one move (captures, castling rook slide, en
 * passant square, promotion, check) — which the renderer replays without ever
 * re-deriving a chess rule.
 */
import { Chess, type Move, type Square as CjsSquare } from 'chess.js'
import type {
  GameStatus,
  LegalTarget,
  MoveAnimation,
  PieceColor,
  PiecePlacement,
  PieceType,
  Square,
} from './types'

export class ChessEngine {
  private chess = new Chess()

  reset(): void {
    this.chess.reset()
  }

  fen(): string {
    return this.chess.fen()
  }

  turn(): PieceColor {
    return this.chess.turn()
  }

  /** Every piece currently on the board, in no particular order. */
  placements(): PiecePlacement[] {
    const out: PiecePlacement[] = []
    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (cell) out.push({ square: cell.square, type: cell.type, color: cell.color })
      }
    }
    return out
  }

  pieceAt(square: Square): PiecePlacement | null {
    const cell = this.chess.get(square as CjsSquare)
    return cell ? { square, type: cell.type, color: cell.color } : null
  }

  /** Where the piece on `from` may legally go (promotions collapsed to one entry). */
  legalTargets(from: Square): LegalTarget[] {
    const moves = this.chess.moves({ square: from as CjsSquare, verbose: true }) as Move[]
    const byTo = new Map<Square, LegalTarget>()
    for (const m of moves) {
      if (byTo.has(m.to)) continue
      byTo.set(m.to, {
        to: m.to,
        capture: m.flags.includes('c') || m.flags.includes('e'),
        promotion: m.flags.includes('p'),
      })
    }
    return [...byTo.values()]
  }

  /** Does moving `from`→`to` require the player to pick a promotion piece? */
  isPromotion(from: Square, to: Square): boolean {
    return this.chess
      .moves({ square: from as CjsSquare, verbose: true })
      .some((m) => m.to === to && m.flags.includes('p'))
  }

  /**
   * Apply a move and return its resolved animation, or `null` if illegal.
   * `promotion` is required only when {@link isPromotion} is true.
   */
  move(from: Square, to: Square, promotion?: PieceType): MoveAnimation | null {
    let result: Move
    try {
      result = this.chess.move(
        promotion ? { from, to, promotion } : { from, to },
      )
    } catch {
      return null
    }
    return this.toAnimation(result)
  }

  private toAnimation(m: Move): MoveAnimation {
    const anim: MoveAnimation = {
      from: m.from,
      to: m.to,
      color: m.color,
      type: m.piece,
      san: m.san,
      check: m.san.includes('+') || m.san.includes('#'),
    }
    if (m.captured) {
      anim.capturedType = m.captured
      // En passant removes the pawn beside the mover, not on the landing square.
      anim.captureSquare = m.flags.includes('e') ? `${m.to[0]}${m.from[1]}` : m.to
    }
    if (m.flags.includes('k') || m.flags.includes('q')) {
      const rank = m.from[1]
      anim.rook = m.flags.includes('k')
        ? { from: `h${rank}`, to: `f${rank}` }
        : { from: `a${rank}`, to: `d${rank}` }
    }
    if (m.promotion) anim.promotion = m.promotion
    return anim
  }

  status(): GameStatus {
    const turn = this.chess.turn()
    const inCheck = this.chess.isCheck()
    const status: GameStatus = { turn, inCheck }
    if (inCheck) status.checkSquare = this.kingSquare(turn)

    if (this.chess.isCheckmate()) {
      status.outcome = { kind: 'checkmate', winner: turn === 'w' ? 'b' : 'w' }
    } else if (this.chess.isStalemate()) {
      status.outcome = { kind: 'stalemate' }
    } else if (this.chess.isInsufficientMaterial()) {
      status.outcome = { kind: 'draw', reason: 'insufficient' }
    } else if (this.chess.isThreefoldRepetition()) {
      status.outcome = { kind: 'draw', reason: 'threefold' }
    } else if (this.chess.isDraw()) {
      // `isDraw()` also covers the fifty-move rule once the others are ruled out.
      status.outcome = { kind: 'draw', reason: 'fifty-move' }
    }
    return status
  }

  private kingSquare(color: PieceColor): Square | undefined {
    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (cell && cell.type === 'k' && cell.color === color) return cell.square
      }
    }
    return undefined
  }

  /** SAN move list, e.g. `['e4', 'c5', 'Nf3']`. */
  history(): string[] {
    return this.chess.history()
  }

  /** Take back the last half-move. Returns false if there's nothing to undo. */
  undo(): boolean {
    return this.chess.undo() != null
  }

  isGameOver(): boolean {
    return this.chess.isGameOver()
  }
}
