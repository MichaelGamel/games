import { memo } from 'react'
import { tokenPercent } from '../../../ludo/board'
import {
  BASE_NEST_COORDS,
  HOME_COLUMN_COORDS,
  LUDO_BOARD_SIZE,
  RING_COORDS,
  SAFE_CELLS,
  START_OFFSETS,
  type RC,
} from '../../../ludo/config'
import type { LudoActiveMove } from '../../../hooks/useLudo'
import type { LudoPhase, LudoPlayer } from '../../../ludo/types'
import { LudoCell } from './LudoCell'
import { LudoBaseNest } from './LudoBaseNest'
import { LudoToken } from './LudoToken'

interface LudoBoardProps {
  players: LudoPlayer[]
  activeMove: LudoActiveMove | null
  currentPlayerIndex: number
  phase: LudoPhase
  /** Token ids the current seat may tap (selection pause); empty otherwise. */
  selectableTokens: number[]
  onSelectToken: (tokenId: number) => void
}

/** Pawn diameter as a board percentage (slightly under one 1/15 cell). */
const TOKEN_SIZE = 5.4
/** Neutral fill for a seat with no player (3- or 2-player games). */
const EMPTY_SEAT = '#4b4470'

// ---- Static cell roles (pure geometry, computed once) ---------------------

type CellRole =
  | { kind: 'base'; seat: number }
  | { kind: 'home'; seat: number }
  | { kind: 'start'; seat: number }
  | { kind: 'safe' }
  | { kind: 'ring' }
  | { kind: 'center' }
  | { kind: 'plain' }

const rcKey = (r: number, c: number) => `${r},${c}`

const CELL_ROLES: CellRole[] = (() => {
  const ringIndex = new Map<string, number>()
  RING_COORDS.forEach(([r, c], i) => ringIndex.set(rcKey(r, c), i))
  const homeSeat = new Map<string, number>()
  HOME_COLUMN_COORDS.forEach((cells, seat) =>
    cells.forEach(([r, c]) => homeSeat.set(rcKey(r, c), seat)),
  )
  const startSeat = new Map<number, number>()
  START_OFFSETS.forEach((idx, seat) => startSeat.set(idx, seat))

  const inCenter = (r: number, c: number) => r >= 6 && r <= 8 && c >= 6 && c <= 8
  const cornerSeat = (r: number, c: number): number | null => {
    const lo = r <= 5,
      hi = r >= 9,
      left = c <= 5,
      right = c >= 9
    if (lo && left) return 0
    if (lo && right) return 1
    if (hi && right) return 2
    if (hi && left) return 3
    return null
  }

  const roles: CellRole[] = []
  for (let r = 0; r < LUDO_BOARD_SIZE; r++) {
    for (let c = 0; c < LUDO_BOARD_SIZE; c++) {
      const idx = ringIndex.get(rcKey(r, c))
      const corner = cornerSeat(r, c)
      if (inCenter(r, c)) roles.push({ kind: 'center' })
      else if (idx != null) {
        if (startSeat.has(idx)) roles.push({ kind: 'start', seat: startSeat.get(idx)! })
        else if (SAFE_CELLS.has(idx)) roles.push({ kind: 'safe' })
        else roles.push({ kind: 'ring' })
      } else if (homeSeat.has(rcKey(r, c))) roles.push({ kind: 'home', seat: homeSeat.get(rcKey(r, c))! })
      else if (corner != null) roles.push({ kind: 'base', seat: corner })
      else roles.push({ kind: 'plain' })
    }
  }
  return roles
})()

/** Where the four center triangles point — index = seat, value = clip polygon. */
const CENTER_TRIANGLES: { seat: number; clip: string }[] = [
  { seat: 0, clip: 'polygon(0 0, 0 100%, 50% 50%)' }, // left
  { seat: 1, clip: 'polygon(0 0, 100% 0, 50% 50%)' }, // top
  { seat: 2, clip: 'polygon(100% 0, 100% 100%, 50% 50%)' }, // right
  { seat: 3, clip: 'polygon(0 100%, 100% 100%, 50% 50%)' }, // bottom
]

/**
 * The static board surface: the 225-cell grid, the four base nests, and the
 * center home. It depends only on the seat colors, so it is memoized on them
 * (value-compared) and never re-renders while tokens animate across it.
 */
const LudoBoardSurface = memo(
  function LudoBoardSurface({ colors }: { colors: readonly string[] }) {
    const colorOf = (seat: number) => colors[seat] ?? EMPTY_SEAT

    return (
      <div
        className="absolute inset-0 overflow-hidden rounded-2xl border-4 border-board-line/70 shadow-2xl ring-1 ring-black/20"
        style={{ background: '#fcf7ea' }}
      >
        <div
          className="grid h-full w-full"
          style={{
            gridTemplateColumns: `repeat(${LUDO_BOARD_SIZE}, 1fr)`,
            gridTemplateRows: `repeat(${LUDO_BOARD_SIZE}, 1fr)`,
          }}
        >
          {CELL_ROLES.map((role, i) => (
            <LudoCell key={i} {...cellStyle(role, colorOf)} />
          ))}
        </div>

        {BASE_NEST_COORDS.map((nest, seat) => (
          <LudoBaseNest key={seat} color={colorOf(seat)} nest={nest as readonly RC[]} />
        ))}

        {/* center home: four triangles meeting at the goal */}
        <div className="absolute left-[40%] top-[40%] h-[20%] w-[20%] overflow-hidden rounded-md ring-1 ring-black/10">
          {CENTER_TRIANGLES.map(({ seat, clip }) => (
            <span
              key={seat}
              className="absolute inset-0"
              style={{ background: colorOf(seat), clipPath: clip }}
              aria-hidden="true"
            />
          ))}
          <span className="absolute inset-0 grid place-items-center text-[2.4vmin] leading-none drop-shadow">
            🏠
          </span>
        </div>
      </div>
    )
  },
  (prev, next) =>
    prev.colors.length === next.colors.length &&
    prev.colors.every((c, i) => c === next.colors[i]),
)

export const LudoBoard = memo(function LudoBoard({
  players,
  activeMove,
  currentPlayerIndex,
  phase,
  selectableTokens,
  onSelectToken,
}: LudoBoardProps) {
  // Build the token list, applying the in-flight move override.
  const tokens = players.flatMap((p) =>
    p.tokens.map((committed, tokenId) => {
      const moving =
        activeMove != null && activeMove.seat === p.id && activeMove.tokenId === tokenId
      const progress = moving ? activeMove.progress : committed
      const { x, y } = tokenPercent(p.id, tokenId, progress)
      return { seat: p.id, tokenId, name: p.name, color: p.color, x, y, moving, progress }
    }),
  )

  // Fan co-located tokens (opponents sharing a ring cell, or own tokens stacked)
  // out into a small cluster so all stay visible. Base slots never collide.
  const groups = new Map<string, number[]>()
  tokens.forEach((t, i) => {
    const k = `${Math.round(t.x)},${Math.round(t.y)}`
    const arr = groups.get(k) ?? []
    arr.push(i)
    groups.set(k, arr)
  })

  const live = phase !== 'won' && phase !== 'setup'

  return (
    <div className="relative aspect-square w-full">
      <LudoBoardSurface colors={players.map((p) => p.color)} />

      {/* un-clipped token layer */}
      <div className="pointer-events-none absolute inset-0">
        {tokens.map((t, i) => {
          const group = groups.get(`${Math.round(t.x)},${Math.round(t.y)}`)!
          const { dx, dy } = clusterOffset(group.indexOf(i), group.length)
          const selectable =
            phase === 'selecting' &&
            t.seat === currentPlayerIndex &&
            selectableTokens.includes(t.tokenId)
          return (
            <LudoToken
              key={`${t.seat}-${t.tokenId}`}
              tokenId={t.tokenId}
              name={t.name}
              color={t.color}
              x={t.x + dx}
              y={t.y + dy}
              kind={t.moving ? (activeMove?.kind ?? null) : null}
              isMoving={t.moving}
              isCurrent={live && t.seat === currentPlayerIndex}
              selectable={selectable}
              onSelect={onSelectToken}
              z={t.moving ? 50 : selectable ? 40 : t.seat === currentPlayerIndex ? 30 : 20}
              size={TOKEN_SIZE}
            />
          )
        })}
      </div>
    </div>
  )
})

/** Resolve a cell's background / border / star from its role + the seat colors. */
function cellStyle(
  role: CellRole,
  colorOf: (seat: number) => string,
): { background: string; bordered: boolean; star: boolean } {
  switch (role.kind) {
    case 'base':
      return { background: `${colorOf(role.seat)}2e`, bordered: false, star: false }
    case 'home':
    case 'start':
      return { background: colorOf(role.seat), bordered: true, star: false }
    case 'safe':
      return { background: '#ffffff', bordered: true, star: true }
    case 'ring':
      return { background: '#ffffff', bordered: true, star: false }
    default:
      return { background: 'transparent', bordered: false, star: false }
  }
}

/** Small cluster offset (board %) for the n-th of `count` co-located tokens. */
function clusterOffset(index: number, count: number): { dx: number; dy: number } {
  if (count < 2) return { dx: 0, dy: 0 }
  const s = 1.6
  const grid = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]
  const [gx, gy] = grid[index % grid.length]
  return { dx: gx * s, dy: gy * s }
}
