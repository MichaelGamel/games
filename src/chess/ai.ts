/**
 * The computer opponent — a self-contained negamax search with alpha-beta
 * pruning, MVV-LVA move ordering, and piece-square tables. Pure and stateless:
 * given a FEN and a difficulty it builds its own throwaway `Chess` to search,
 * so it never disturbs the live engine.
 *
 * Difficulty maps to search depth ({@link AI_DEPTH}); easier levels also widen
 * the "good enough" margin and pick randomly within it, so they feel beatable
 * and never play the same game twice. Promotions are searched as queen-only,
 * which keeps the tree small with no practical loss of strength.
 */
import { Chess, type Move } from 'chess.js'
import { AI_DEPTH, PIECE_VALUE } from './config'
import type { Difficulty, MoveIntent } from './types'

const MATE = 100_000

// Piece-square tables, oriented row 0 = rank 8 (matching `chess.board()`), read
// directly for white pieces and vertically mirrored for black.
// prettier-ignore
const PST: Record<string, number[]> = {
  p: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  n: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  b: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  r: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0,
  ],
  q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  k: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20,
  ],
}

/** Static evaluation in centipawns, positive favouring White. */
function evaluate(chess: Chess): number {
  let score = 0
  const board = chess.board()
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const cell = board[r][f]
      if (!cell) continue
      if (cell.color === 'w') score += PIECE_VALUE[cell.type] + PST[cell.type][r * 8 + f]
      else score -= PIECE_VALUE[cell.type] + PST[cell.type][(7 - r) * 8 + f]
    }
  }
  return score
}

/** Evaluation from the perspective of the side to move (negamax convention). */
function evaluateForSideToMove(chess: Chess): number {
  return chess.turn() === 'w' ? evaluate(chess) : -evaluate(chess)
}

/** Captures and promotions first (MVV-LVA), with queen-only promotions. */
function orderedMoves(chess: Chess): Move[] {
  const moves = (chess.moves({ verbose: true }) as Move[]).filter(
    (m) => !m.promotion || m.promotion === 'q',
  )
  const rank = (m: Move) =>
    (m.captured ? 10 * PIECE_VALUE[m.captured] - PIECE_VALUE[m.piece] : 0) +
    (m.promotion ? 800 : 0)
  return moves.sort((a, b) => rank(b) - rank(a))
}

function apply(chess: Chess, m: Move): void {
  chess.move(m.promotion ? { from: m.from, to: m.to, promotion: m.promotion } : { from: m.from, to: m.to })
}

function negamax(chess: Chess, depth: number, alpha: number, beta: number, ply: number): number {
  if (chess.isGameOver()) {
    if (chess.isCheckmate()) return -(MATE - ply) // prefer faster mates
    return 0 // stalemate / draw
  }
  if (depth === 0) return evaluateForSideToMove(chess)

  let best = -Infinity
  for (const m of orderedMoves(chess)) {
    apply(chess, m)
    const score = -negamax(chess, depth - 1, -beta, -alpha, ply + 1)
    chess.undo()
    if (score > best) best = score
    if (best > alpha) alpha = best
    if (alpha >= beta) break // cutoff
  }
  return best
}

/** Margin (centipawns) within which a move counts as "good enough" to pick. */
const PICK_MARGIN: Record<Difficulty, number> = { easy: 90, medium: 35, hard: 0 }

/**
 * Choose the computer's move from a position. Returns `null` only if the side to
 * move has no legal moves (i.e. the game is already over — callers guard this).
 */
export function chooseMove(fen: string, difficulty: Difficulty): MoveIntent | null {
  const chess = new Chess(fen)
  const moves = orderedMoves(chess)
  if (moves.length === 0) return null

  const depth = AI_DEPTH[difficulty]
  const scored = moves.map((m) => {
    apply(chess, m)
    const score = -negamax(chess, depth - 1, -Infinity, Infinity, 1)
    chess.undo()
    return { move: m, score }
  })

  const best = Math.max(...scored.map((s) => s.score))
  const pool = scored.filter((s) => s.score >= best - PICK_MARGIN[difficulty])
  const pick = pool[Math.floor(Math.random() * pool.length)].move
  return { from: pick.from, to: pick.to, promotion: pick.promotion }
}
