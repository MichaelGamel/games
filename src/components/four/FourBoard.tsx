import { memo } from 'react'
import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { COLS, ROWS } from '../../four/config'
import { EMPTY, dropRow } from '../../four/rules'
import type { ActiveDrop } from '../../hooks/useConnectFour'
import type { Cell, FourPlayer } from '../../four/types'
import { cn } from '../../lib/cn'

interface FourBoardProps {
  board: number[][]
  players: FourPlayer[]
  activeDrop: ActiveDrop | null
  winLine: Cell[] | null
  /** How many of the winning discs are lit, for the one-by-one victory walk. */
  winLitCount: number
  /** This client may pick a column right now. */
  canDrop: boolean
  onDrop: (column: number) => void
}

const cellKey = (row: number, col: number) => `${row}-${col}`

/**
 * The blue rack. Discs are absolutely-positioned circles behind a punched-hole
 * front layer, so a falling disc (the springing `activeDrop`) slides *behind*
 * the holes like the real toy. Columns are full-height buttons when playable.
 */
export const FourBoard = memo(function FourBoard({
  board,
  players,
  activeDrop,
  winLine,
  winLitCount,
  canDrop,
  onDrop,
}: FourBoardProps) {
  const { t } = useTranslation('four')
  const colorOf = (seat: number) => players[seat]?.color ?? '#94a3b8'
  // Only the discs revealed so far in the victory walk glow (winLitCount ramps
  // 0 → winLine.length as each one lights up).
  const winSet = new Set((winLine ?? []).slice(0, winLitCount).map(([r, c]) => cellKey(r, c)))
  const unitX = 100 / COLS
  const unitY = 100 / ROWS

  return (
    <div className="relative w-full" style={{ aspectRatio: `${COLS} / ${ROWS}` }}>
      {/* committed discs + the one falling disc */}
      <div className="absolute inset-0">
        {board.map((rowCells, row) =>
          rowCells.map((seat, col) =>
            seat === EMPTY ? null : (
              <Disc
                key={cellKey(row, col)}
                row={row}
                col={col}
                color={colorOf(seat)}
                highlight={winSet.has(cellKey(row, col))}
              />
            ),
          ),
        )}
        {activeDrop && (
          <m.div
            key={`drop-${activeDrop.column}-${activeDrop.row}`}
            className="absolute rounded-full shadow-lg"
            style={{
              width: `${unitX * 0.82}%`,
              height: `${unitY * 0.82}%`,
              left: `${activeDrop.column * unitX + unitX * 0.09}%`,
              background: colorOf(activeDrop.seat),
            }}
            initial={{ top: `-${unitY}%` }}
            animate={{ top: `${activeDrop.row * unitY + unitY * 0.09}%` }}
            transition={{ type: 'spring', stiffness: 320, damping: 22, mass: 0.9 }}
          />
        )}
      </div>

      {/* the rack with punched holes (in front of the discs): each cell paints
          its own blue square with a transparent circular center, so discs
          behind it show through like the real toy */}
      <div
        className="pointer-events-none absolute inset-0 grid overflow-hidden rounded-2xl border-4 border-sky-900/70 shadow-2xl ring-1 ring-black/20"
        style={{
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridTemplateRows: `repeat(${ROWS}, 1fr)`,
        }}
      >
        {Array.from({ length: ROWS * COLS }, (_, i) => (
          <div
            key={i}
            style={{
              background:
                'radial-gradient(circle at 50% 50%, transparent 41%, rgba(0,0,0,0.25) 43%, #1e40af 46%, #1d4ed8 100%)',
            }}
          />
        ))}
      </div>

      {/* full-height column buttons */}
      <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
        {Array.from({ length: COLS }, (_, col) => {
          const playable = canDrop && dropRow(board, col) != null
          return (
            <button
              key={col}
              type="button"
              onClick={() => onDrop(col)}
              disabled={!playable}
              aria-label={t('dropAria', { n: col + 1 })}
              className={cn(
                'group relative focus-visible:outline focus-visible:outline-2 focus-visible:outline-white',
                playable ? 'cursor-pointer' : 'cursor-default',
              )}
            >
              {playable && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-1 top-0 h-full rounded-xl bg-white/0 transition group-hover:bg-white/10"
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
})

function Disc({
  row,
  col,
  color,
  highlight,
}: {
  row: number
  col: number
  color: string
  highlight: boolean
}) {
  const unitX = 100 / COLS
  const unitY = 100 / ROWS
  return (
    <m.div
      className="absolute rounded-full"
      style={{
        width: `${unitX * 0.82}%`,
        height: `${unitY * 0.82}%`,
        left: `${col * unitX + unitX * 0.09}%`,
        top: `${row * unitY + unitY * 0.09}%`,
        background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.55), rgba(255,255,255,0) 45%), ${color}`,
      }}
      animate={
        highlight
          ? {
              // A spring-y pop the instant the disc joins the line, settling
              // into a steady glow + pulsing white ring.
              scale: [1, 1.32, 1.12],
              boxShadow: [
                'inset 0 -2px 4px rgba(0,0,0,0.35)',
                `inset 0 -2px 4px rgba(0,0,0,0.35), 0 0 0 4px rgba(255,255,255,0.95), 0 0 26px 10px ${color}`,
                `inset 0 -2px 4px rgba(0,0,0,0.35), 0 0 0 3px rgba(255,255,255,0.85), 0 0 18px 6px ${color}`,
              ],
            }
          : { scale: 1, boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.35)' }
      }
      transition={{ duration: highlight ? 0.55 : 0.2, ease: [0.34, 1.56, 0.64, 1] }}
    >
      {highlight && (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full ring-2 ring-white/80 animate-pulse-ring"
        />
      )}
    </m.div>
  )
}
