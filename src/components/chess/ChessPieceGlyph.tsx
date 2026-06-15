/**
 * A single chess piece rendered as a Unicode glyph — used in the 2D HUD (the
 * captured trays and the promotion picker), never on the 3D board. `tone`
 * decides the colour so both armies stay legible on the dark glass chrome.
 */
import { cn } from '../../lib/cn'
import type { PieceType } from '../../chess/types'

const GLYPH: Record<PieceType, string> = {
  p: '♟',
  n: '♞',
  b: '♝',
  r: '♜',
  q: '♛',
  k: '♚',
}

interface ChessPieceGlyphProps {
  type: PieceType
  /** `light` = the pale army, `dark` = the obsidian army. */
  tone: 'light' | 'dark'
  className?: string
}

export function ChessPieceGlyph({ type, tone, className }: ChessPieceGlyphProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'leading-none',
        tone === 'light'
          ? 'text-amber-50 [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]'
          : 'text-violet-300 [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]',
        className,
      )}
    >
      {GLYPH[type]}
    </span>
  )
}
