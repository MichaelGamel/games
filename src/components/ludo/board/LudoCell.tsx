import { cn } from '../../../lib/cn'

interface LudoCellProps {
  /** Resolved background (CSS color), already accounting for the seat color. */
  background: string
  /** Draw a thin divider — used for the white track so the path reads as squares. */
  bordered: boolean
  /** Mark a safe square with a star. */
  star: boolean
}

/**
 * One of the 225 squares of the static board layer. Purely presentational — its
 * role/color is decided once by {@link LudoBoard} from the pure geometry in
 * `ludo/config`. Tokens live in a separate, un-clipped layer above the grid.
 */
export function LudoCell({ background, bordered, star }: LudoCellProps) {
  return (
    <div
      className={cn('relative', bordered && 'border border-black/10')}
      style={{ background }}
    >
      {star && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center text-[2.1vmin] leading-none text-amber-500/70">
          ★
        </span>
      )}
    </div>
  )
}
