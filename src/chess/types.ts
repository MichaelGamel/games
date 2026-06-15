/**
 * Core domain types for the 3D chess game. Pure data shapes — no React, no DOM,
 * no Three.js. The render layer (`src/chess/three/`) and the orchestration hook
 * both speak in these terms so the rules stay decoupled from the visuals.
 */

export type PieceColor = 'w' | 'b'
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'

/** Algebraic square name, e.g. `'a1'` … `'h8'`. */
export type Square = string

/** A single piece sitting on a square — the unit the board renders. */
export interface PiecePlacement {
  square: Square
  type: PieceType
  color: PieceColor
}

/** One square a selected piece may legally move to (drives the glow markers). */
export interface LegalTarget {
  to: Square
  capture: boolean
  promotion: boolean
}

/**
 * A fully-resolved move, computed once by the engine and handed to the scene to
 * animate. Everything the renderer needs to play the move beautifully lives
 * here, so the visual layer never re-derives chess rules.
 */
export interface MoveAnimation {
  from: Square
  to: Square
  color: PieceColor
  type: PieceType
  /** Square a captured piece is removed from (differs from `to` on en passant). */
  captureSquare?: Square
  capturedType?: PieceType
  /** The rook's slide, when this move is a castle. */
  rook?: { from: Square; to: Square }
  /** The piece a promoting pawn becomes. */
  promotion?: PieceType
  /** Standard algebraic notation, for the move list. */
  san: string
  /** True if the move gives check (drives the check pulse + sound). */
  check: boolean
}

export type GameOutcome =
  | { kind: 'checkmate'; winner: PieceColor }
  | { kind: 'stalemate' }
  | { kind: 'draw'; reason: 'insufficient' | 'threefold' | 'fifty-move' | 'agreement' }

export interface GameStatus {
  turn: PieceColor
  inCheck: boolean
  /** The square of the king in check, if any. */
  checkSquare?: Square
  outcome?: GameOutcome
}

export type Difficulty = 'easy' | 'medium' | 'hard'

/** `solo` = play the computer; `pass` = two humans sharing one screen. */
export type ChessMode = 'solo' | 'pass'

/** A move request the AI returns, ready to feed back into the engine. */
export interface MoveIntent {
  from: Square
  to: Square
  promotion?: PieceType
}
