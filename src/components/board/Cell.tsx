import { cellToCoords } from '../../game/board'
import { JUMPS, WINNING_CELL } from '../../game/config'
import { cn } from '../../lib/cn'

interface CellProps {
  cell: number
}

/**
 * A single numbered board square. Alternates tint by checkerboard parity and
 * subtly highlights ladder feet (green) and snake heads (rose) so the
 * connectors drawn by SnakesLaddersLayer have an obvious anchor.
 */
export function Cell({ cell }: CellProps) {
  const { row, col } = cellToCoords(cell)
  const isDark = (row + col) % 2 === 0
  const jump = JUMPS[cell]
  const isFinish = cell === WINNING_CELL

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

      {jump?.kind === 'ladder' && (
        <span className="pointer-events-none absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500/70 ring-2 ring-emerald-300/40" />
      )}
      {jump?.kind === 'snake' && (
        <span className="pointer-events-none absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-rose-500/70 ring-2 ring-rose-300/40" />
      )}

      {isFinish && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center text-[2.4vmin] sm:text-base">
          🏁
        </span>
      )}
    </div>
  )
}
