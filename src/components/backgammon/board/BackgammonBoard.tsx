import { memo, type CSSProperties, type ReactNode } from 'react'
import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { BAR, OFF } from '../../../backgammon/config'
import type { ActiveChecker } from '../../../hooks/useBackgammon'
import type { BackgammonBoard as Board, BackgammonPlayer } from '../../../backgammon/types'
import { cn } from '../../../lib/cn'

interface BackgammonBoardProps {
  board: Board
  players: BackgammonPlayer[]
  /** Seat whose checkers are interactive right now (the bearer-off tray, etc.). */
  seat: number
  sources: ReadonlySet<number>
  destinations: ReadonlySet<number>
  selectedFrom: number | null
  active: ActiveChecker | null
  interactive: boolean
  onPointClick: (point: number) => void
}

// Screen layout. Seat 0 home (0..5) sits bottom-right; seat 1 home (18..23)
// top-right. Indices are direction-neutral; this maps them to quadrants only.
const TOP_LEFT = [12, 13, 14, 15, 16, 17]
const TOP_RIGHT = [18, 19, 20, 21, 22, 23]
const BOTTOM_LEFT = [11, 10, 9, 8, 7, 6]
const BOTTOM_RIGHT = [5, 4, 3, 2, 1, 0]

const colorOf = (players: BackgammonPlayer[], seat: number) => players[seat]?.color ?? '#94a3b8'

/** Who owns a point and how many sit there. */
function occupant(board: Board, point: number): { seat: number; count: number } | null {
  const v = board.points[point]
  if (v === 0) return null
  return v > 0 ? { seat: 0, count: v } : { seat: 1, count: -v }
}

/**
 * The backgammon board: 24 triangular points across four quadrants, the central
 * bar, and a bear-off tray on the trailing edge. Geometry is direction-neutral
 * and lays out left→right, so it reads correctly under RTL.
 */
export const BackgammonBoard = memo(function BackgammonBoard({
  board,
  players,
  seat,
  sources,
  destinations,
  selectedFrom,
  active,
  interactive,
  onPointClick,
}: BackgammonBoardProps) {
  const { t } = useTranslation('backgammon')

  const renderPoint = (point: number, top: boolean) => {
    const occ = occupant(board, point)
    const isSource = sources.has(point)
    const isDest = destinations.has(point)
    const isSelected = selectedFrom === point
    const clickable = interactive && (isSource || isDest)
    return (
      <button
        key={point}
        type="button"
        disabled={!clickable}
        onClick={() => onPointClick(point)}
        aria-label={t('point', { n: point + 1 })}
        className={cn(
          'group relative flex-1',
          clickable ? 'cursor-pointer' : 'cursor-default',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-white',
        )}
      >
        {/* triangle */}
        <span
          aria-hidden="true"
          className="absolute inset-x-0"
          style={{
            top: top ? 0 : undefined,
            bottom: top ? undefined : 0,
            height: '78%',
            clipPath: top ? 'polygon(0 0, 100% 0, 50% 100%)' : 'polygon(50% 0, 0 100%, 100% 100%)',
            background:
              point % 2 === 0
                ? 'linear-gradient(180deg, rgba(168,85,247,0.55), rgba(124,58,237,0.18))'
                : 'linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.04))',
          }}
        />
        {/* highlight rings */}
        {isDest && (
          <span
            aria-hidden="true"
            className="absolute left-1/2 h-3 w-3 -translate-x-1/2 animate-pulse rounded-full bg-emerald-300 shadow-[0_0_10px_2px_rgba(110,231,183,0.8)]"
            style={{ [top ? 'top' : 'bottom']: '6%' } as CSSProperties}
          />
        )}
        {(isSource || isSelected) && (
          <span
            aria-hidden="true"
            className={cn(
              'absolute inset-x-[18%] rounded-full',
              isSelected ? 'bg-white/70' : 'bg-white/25 group-hover:bg-white/40',
            )}
            style={{ [top ? 'top' : 'bottom']: 0, height: '4px' } as CSSProperties}
          />
        )}
        {/* checker stack */}
        <span
          className={cn('absolute inset-x-0 flex flex-col items-center gap-[2px]', top ? 'top-[3%]' : 'bottom-[3%] flex-col-reverse')}
        >
          {occ && <Stack count={occ.count} color={colorOf(players, occ.seat)} landing={active?.to === point} />}
        </span>
      </button>
    )
  }

  return (
    <div
      className="relative w-full select-none rounded-2xl border-4 border-amber-950/60 bg-gradient-to-b from-night-900/80 to-night-800/90 p-2 shadow-2xl ring-1 ring-black/30"
      style={{ aspectRatio: '13 / 10' }}
    >
      <div className="flex h-full w-full gap-1">
        {/* left half */}
        <Half topRow={TOP_LEFT} bottomRow={BOTTOM_LEFT} renderPoint={renderPoint} />
        {/* the bar */}
        <Bar board={board} players={players} seat={seat} selected={selectedFrom === BAR} clickable={interactive && sources.has(BAR)} onClick={() => onPointClick(BAR)} barLabel={t('bar')} />
        {/* right half */}
        <Half topRow={TOP_RIGHT} bottomRow={BOTTOM_RIGHT} renderPoint={renderPoint} />
        {/* bear-off trays */}
        <BearOff
          board={board}
          players={players}
          canBearOff={interactive && destinations.has(OFF)}
          onClick={() => onPointClick(OFF)}
          label={t('bearOff')}
        />
      </div>
    </div>
  )
})

function Half({
  topRow,
  bottomRow,
  renderPoint,
}: {
  topRow: number[]
  bottomRow: number[]
  renderPoint: (point: number, top: boolean) => ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1">{topRow.map((p) => renderPoint(p, true))}</div>
      <div className="h-2" />
      <div className="flex flex-1">{bottomRow.map((p) => renderPoint(p, false))}</div>
    </div>
  )
}

function Stack({ count, color, landing }: { count: number; color: string; landing: boolean }) {
  const shown = Math.min(count, 5)
  return (
    <>
      {Array.from({ length: shown }, (_, i) => (
        <m.span
          key={i}
          initial={landing && i === shown - 1 ? { scale: 0.4, opacity: 0.4 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
          className="aspect-square w-[78%] rounded-full ring-1 ring-black/40"
          style={{
            background: `radial-gradient(circle at 34% 28%, rgba(255,255,255,0.6), rgba(255,255,255,0) 46%), ${color}`,
            boxShadow: 'inset 0 -2px 3px rgba(0,0,0,0.4)',
          }}
        >
          {i === shown - 1 && count > 5 && (
            <span className="grid h-full w-full place-items-center text-[10px] font-bold text-white mix-blend-difference">
              {count}
            </span>
          )}
        </m.span>
      ))}
    </>
  )
}

function Bar({
  board,
  players,
  seat,
  selected,
  clickable,
  onClick,
  barLabel,
}: {
  board: Board
  players: BackgammonPlayer[]
  seat: number
  selected: boolean
  clickable: boolean
  onClick: () => void
  barLabel: string
}) {
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={onClick}
      aria-label={barLabel}
      className={cn(
        'relative flex w-[7%] shrink-0 flex-col items-center justify-between rounded-md bg-black/30 py-2 ring-1 ring-white/10',
        clickable ? 'cursor-pointer ring-white/50' : 'cursor-default',
        selected && 'ring-2 ring-white',
      )}
    >
      {/* seat 1 (enters at the top), seat 0 (enters at the bottom) */}
      <span className="flex flex-col items-center gap-[2px]">
        {Array.from({ length: Math.min(board.bar[1], 4) }, (_, i) => (
          <span key={i} className="aspect-square w-3 rounded-full ring-1 ring-black/40" style={{ background: colorOf(players, 1) }} />
        ))}
      </span>
      <span className="flex flex-col items-center gap-[2px]">
        {Array.from({ length: Math.min(board.bar[0], 4) }, (_, i) => (
          <span key={i} className="aspect-square w-3 rounded-full ring-1 ring-black/40" style={{ background: colorOf(players, 0) }} />
        ))}
      </span>
      {clickable && board.bar[seat] > 0 && (
        <span className="absolute inset-0 animate-pulse rounded-md ring-2 ring-emerald-300/70" aria-hidden="true" />
      )}
    </button>
  )
}

function BearOff({
  board,
  players,
  canBearOff,
  onClick,
  label,
}: {
  board: Board
  players: BackgammonPlayer[]
  canBearOff: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      disabled={!canBearOff}
      onClick={onClick}
      aria-label={label}
      className={cn(
        'relative flex w-[9%] shrink-0 flex-col justify-between gap-1 rounded-md bg-black/25 p-1 ring-1 ring-white/10',
        canBearOff ? 'cursor-pointer ring-emerald-300/70' : 'cursor-default',
      )}
    >
      <Tray count={board.off[1]} color={colorOf(players, 1)} />
      <Tray count={board.off[0]} color={colorOf(players, 0)} />
      {canBearOff && (
        <span className="absolute inset-0 animate-pulse rounded-md ring-2 ring-emerald-300/70" aria-hidden="true" />
      )}
    </button>
  )
}

function Tray({ count, color }: { count: number; color: string }) {
  return (
    <span className="flex flex-1 flex-col-reverse items-center gap-[2px] overflow-hidden">
      {Array.from({ length: Math.min(count, 8) }, (_, i) => (
        <span key={i} className="h-1.5 w-full rounded-sm ring-1 ring-black/40" style={{ background: color }} />
      ))}
      {count > 0 && <span className="text-[10px] font-bold tabular-nums text-white/70">{count}</span>}
    </span>
  )
}
