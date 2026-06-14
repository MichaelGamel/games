import { memo } from 'react'
import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { SIZE } from '../../xo/config'
import type { Mark } from '../../xo/config'
import { EMPTY } from '../../xo/rules'
import type { Cell, XOPlayer } from '../../xo/types'
import type { ActivePlace } from '../../hooks/useTicTacToe'
import { cn } from '../../lib/cn'

interface XOBoardProps {
  board: number[][]
  players: XOPlayer[]
  /** The square mid-placement (drawn before its turn commits). */
  activePlace: ActivePlace | null
  winLine: Cell[] | null
  /** How many of the winning squares are lit, for the one-by-one victory walk. */
  winLitCount: number
  /** This client may pick a square right now. */
  canPlace: boolean
  /** Seat to move — supplies the faint hover-preview mark on empty squares. */
  currentSeat: number
  onPlace: (row: number, col: number) => void
}

const lineFractions = Array.from({ length: SIZE - 1 }, (_, i) => ((i + 1) * 100) / SIZE)

/**
 * The classic noughts-and-crosses grid: a `#` of glowing bars with a 3×3 layer
 * of square buttons on top. Each mark is an SVG that draws itself in (✕ as two
 * strokes, ◯ as a circle), tinted with its player's color. Winning squares
 * light up one at a time during the victory walk.
 */
export const XOBoard = memo(function XOBoard({
  board,
  players,
  activePlace,
  winLine,
  winLitCount,
  canPlace,
  currentSeat,
  onPlace,
}: XOBoardProps) {
  const { t } = useTranslation('xo')
  const colorOf = (seat: number) => players[seat]?.color ?? '#94a3b8'
  const markOf = (seat: number): Mark => players[seat]?.mark ?? 'X'

  // Merge the committed board with the square being marked, so the mark appears
  // instantly on click and stays mounted (no flash) when the turn commits.
  const display = board.map((row) => [...row])
  if (activePlace) display[activePlace.row][activePlace.col] = activePlace.seat

  // Winning squares revealed so far in the victory walk (key = row*SIZE+col).
  const lit = new Set((winLine ?? []).slice(0, winLitCount).map(([r, c]) => r * SIZE + c))

  return (
    <div className="relative w-full" style={{ aspectRatio: '1 / 1' }}>
      {/* the # grid lines, behind the squares */}
      <div className="pointer-events-none absolute inset-0">
        {lineFractions.map((pct) => (
          <span
            key={`v-${pct}`}
            className="absolute bottom-[6%] top-[6%] w-[3px] -translate-x-1/2 rounded-full bg-white/25 shadow-[0_0_8px_rgba(255,255,255,0.15)]"
            style={{ left: `${pct}%` }}
          />
        ))}
        {lineFractions.map((pct) => (
          <span
            key={`h-${pct}`}
            className="absolute inset-x-[6%] h-[3px] -translate-y-1/2 rounded-full bg-white/25 shadow-[0_0_8px_rgba(255,255,255,0.15)]"
            style={{ top: `${pct}%` }}
          />
        ))}
      </div>

      <div
        className="absolute inset-0 grid"
        style={{
          gridTemplateColumns: `repeat(${SIZE}, 1fr)`,
          gridTemplateRows: `repeat(${SIZE}, 1fr)`,
        }}
      >
        {display.flatMap((rowCells, row) =>
          rowCells.map((seat, col) => {
            const key = row * SIZE + col
            const occupied = seat !== EMPTY
            const isLit = lit.has(key)
            const playable = canPlace && !occupied && activePlace == null
            return (
              <button
                key={key}
                type="button"
                onClick={() => onPlace(row, col)}
                disabled={!playable}
                aria-label={t('cellAria', { row: row + 1, col: col + 1 })}
                className={cn(
                  'group relative grid place-items-center rounded-2xl transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white',
                  playable ? 'cursor-pointer hover:bg-white/5' : 'cursor-default',
                )}
              >
                {isLit && <WinGlow color={colorOf(seat)} />}
                {occupied && (
                  <span className="absolute inset-[18%]">
                    <MarkGlyph mark={markOf(seat)} color={colorOf(seat)} animate />
                  </span>
                )}
                {playable && (
                  <span className="absolute inset-[18%] opacity-0 transition-opacity duration-150 group-hover:opacity-25">
                    <MarkGlyph mark={markOf(currentSeat)} color={colorOf(currentSeat)} />
                  </span>
                )}
              </button>
            )
          }),
        )}
      </div>
    </div>
  )
})

interface MarkGlyphProps {
  mark: Mark
  color: string
  /** Draw the strokes in (committed marks); ghosts render static. */
  animate?: boolean
}

/** One ✕ or ◯ as a stroked SVG, optionally drawing itself in on mount. */
function MarkGlyph({ mark, color, animate = false }: MarkGlyphProps) {
  const draw = (delay: number, duration: number) =>
    animate
      ? {
          initial: { pathLength: 0, opacity: 0 },
          animate: { pathLength: 1, opacity: 1 },
          transition: {
            pathLength: { duration, ease: 'easeOut' as const, delay },
            opacity: { duration: 0.05, delay },
          },
        }
      : {}
  return (
    <svg
      viewBox="0 0 100 100"
      className="h-full w-full"
      fill="none"
      stroke={color}
      strokeWidth={15}
      strokeLinecap="round"
      style={{ filter: `drop-shadow(0 0 6px ${color}55)` }}
      aria-hidden="true"
    >
      {mark === 'X' ? (
        <>
          <m.path d="M24 24 L76 76" {...draw(0, 0.22)} />
          <m.path d="M76 24 L24 76" {...draw(0.16, 0.22)} />
        </>
      ) : (
        <m.circle cx="50" cy="50" r="29" {...draw(0, 0.34)} />
      )}
    </svg>
  )
}

/**
 * A winning square joining the line: a soft color wash with a springing,
 * pulsing white ring. Mounted per cell as `winLitCount` ramps, so each lights
 * up in turn with its own entrance.
 */
function WinGlow({ color }: { color: string }) {
  return (
    <m.span
      className="absolute inset-[8%] rounded-2xl"
      style={{ background: `radial-gradient(circle at 50% 45%, ${color}55, ${color}14 70%, transparent)` }}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{
        scale: [0.8, 1.12, 1],
        opacity: 1,
        boxShadow: [
          '0 0 0 0 rgba(255,255,255,0)',
          `0 0 0 4px rgba(255,255,255,0.9), 0 0 28px 10px ${color}`,
          `0 0 0 2px rgba(255,255,255,0.8), 0 0 18px 6px ${color}`,
        ],
      }}
      transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-2xl ring-2 ring-white/80 animate-pulse-ring"
      />
    </m.span>
  )
}
