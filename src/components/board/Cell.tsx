import { cellToCoords } from '../../game/board'
import type { BoardLayout } from '../../game/types'
import { cn } from '../../lib/cn'

interface CellProps {
  cell: number
  board: BoardLayout
}

/** The badge drawn on a special-effect cell. */
const SPECIAL_BADGE: Record<string, string> = {
  shield: '🛡️',
  swap: '🔀',
  mystery: '✨',
}

/**
 * A single numbered board square. Alternates tint by checkerboard parity,
 * subtly highlights ladder feet (green) and snake heads (rose) so the
 * connectors drawn by SnakesLaddersLayer have an obvious anchor, and badges
 * special-effect cells.
 */
export function Cell({ cell, board }: CellProps) {
  const { row, col } = cellToCoords(cell, board.size)
  const isDark = (row + col) % 2 === 0
  const isLadderFoot = board.ladders[cell] != null
  const isSnakeHead = board.snakes[cell] != null
  const special = board.specials[cell]
  const isFinish = cell === board.size * board.size

  return (
    <div
      className={cn(
        'relative flex items-start justify-start',
        isDark ? 'bg-board-dark' : 'bg-board-light',
      )}
    >
      <span
        className={cn(
          'select-none px-1 pt-0.5 text-[1.6vmin] font-semibold leading-none sm:text-xs',
          isFinish ? 'text-amber-700' : 'text-board-line',
        )}
      >
        {cell}
      </span>

      {isLadderFoot && (
        <span className="pointer-events-none absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500/70 ring-2 ring-emerald-300/40" />
      )}
      {isSnakeHead && (
        <span className="pointer-events-none absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-rose-500/70 ring-2 ring-rose-300/40" />
      )}

      {special && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center text-[2.2vmin] opacity-90 sm:text-sm">
          {SPECIAL_BADGE[special]}
        </span>
      )}

      {isFinish && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center text-[2.4vmin] sm:text-base">
          🏁
        </span>
      )}
    </div>
  )
}
