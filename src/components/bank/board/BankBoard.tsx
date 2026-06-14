import { memo } from 'react'
import { BANK_GRID, BOARD, GROUP_COLORS } from '../../../bank/config'
import { cellsInRenderOrder, tilePercent } from '../../../bank/board'
import type { BankActiveMove } from '../../../hooks/useBankElHazz'
import type { BankGameState, BankPhase, BankPlayer, Ownership } from '../../../bank/types'
import { BankTileCell } from './BankTile'
import { BankToken } from './BankToken'
import { BankCenter } from './BankCenter'
import type { DieValue } from '../../../bank/types'

interface BankBoardProps {
  players: BankPlayer[]
  ownership: BankGameState['ownership']
  activeMove: BankActiveMove | null
  currentPlayerIndex: number
  phase: BankPhase
  lastDice: DieValue[]
  statusText: string
  /** Open a property's details / management modal (must be a stable callback). */
  onSelectTile?: (tileId: number) => void
}

/** Pawn diameter as a board percentage (a bit under one 1/11 cell). */
const TOKEN_SIZE = 6

const RENDER_CELLS = cellsInRenderOrder()

/**
 * The static board surface: the 11×11 CSS grid of perimeter tiles around the
 * empty interior. Depends only on the seat colors and the ownership map, so it
 * is memoized on them and never re-renders while tokens animate across it.
 */
const BankBoardSurface = memo(
  function BankBoardSurface({
    ownership,
    colors,
    onSelectTile,
  }: {
    ownership: Record<number, Ownership>
    colors: readonly string[]
    onSelectTile?: (tileId: number) => void
  }) {
    return (
      <div
        className="absolute inset-0 grid overflow-hidden rounded-2xl border-4 border-board-line/70 shadow-2xl ring-1 ring-black/20"
        style={{
          gridTemplateColumns: `repeat(${BANK_GRID}, 1fr)`,
          gridTemplateRows: `repeat(${BANK_GRID}, 1fr)`,
          background: '#0f1424',
        }}
      >
        {RENDER_CELLS.map((cell) =>
          cell.tileId == null ? (
            <span key={`${cell.row}-${cell.col}`} aria-hidden="true" />
          ) : (
            <BankTileCell
              key={cell.tileId}
              tile={BOARD[cell.tileId]}
              groupColor={BOARD[cell.tileId].group ? GROUP_COLORS[BOARD[cell.tileId].group!] : null}
              ownerColor={
                ownership[cell.tileId] ? (colors[ownership[cell.tileId].owner] ?? null) : null
              }
              level={ownership[cell.tileId]?.level ?? 0}
              mortgaged={ownership[cell.tileId]?.mortgaged ?? false}
              onSelect={onSelectTile}
            />
          ),
        )}
      </div>
    )
  },
  (prev, next) =>
    prev.ownership === next.ownership &&
    prev.colors.length === next.colors.length &&
    prev.colors.every((c, i) => c === next.colors[i]),
)

/**
 * The board: the static tile surface, the center hub (brand + dice + status),
 * and an un-clipped token layer whose pawns animate tile-to-tile. The moving
 * token (from `activeMove`) overrides its committed position so a walk reads as
 * a hop across cells; co-located pawns fan out so all stay visible.
 */
export const BankBoard = memo(function BankBoard({
  players,
  ownership,
  activeMove,
  currentPlayerIndex,
  phase,
  lastDice,
  statusText,
  onSelectTile,
}: BankBoardProps) {
  const live = phase !== 'won' && phase !== 'setup'

  const tokens = players.map((p) => {
    const moving = activeMove != null && activeMove.seat === p.id
    const tile = moving ? activeMove.tile : p.position
    const { x, y } = tilePercent(tile)
    return { seat: p.id, name: p.name, color: p.color, x, y, moving }
  })

  // Fan co-located pawns out into a small cluster so all stay visible.
  const groups = new Map<string, number[]>()
  tokens.forEach((tk, i) => {
    const k = `${Math.round(tk.x)},${Math.round(tk.y)}`
    const arr = groups.get(k) ?? []
    arr.push(i)
    groups.set(k, arr)
  })

  const accent = players[currentPlayerIndex]?.color ?? '#ffffff'

  return (
    // The board lives in a fixed left-to-right coordinate space: tile cells flow
    // through a CSS grid while tokens are positioned with physical `left`/`top`
    // percentages, so the geometry must not mirror under an RTL page (Arabic).
    // Centered hub text still reads correctly either way.
    <div className="relative aspect-square w-full" dir="ltr">
      <BankBoardSurface ownership={ownership} colors={players.map((p) => p.color)} onSelectTile={onSelectTile} />

      <BankCenter
        lastDice={lastDice}
        rolling={phase === 'rolling'}
        statusText={statusText}
        accentColor={accent}
      />

      <div className="pointer-events-none absolute inset-0">
        {tokens.map((tk, i) => {
          const group = groups.get(`${Math.round(tk.x)},${Math.round(tk.y)}`)!
          const { dx, dy } = clusterOffset(group.indexOf(i), group.length)
          return (
            <BankToken
              key={tk.seat}
              name={tk.name}
              color={tk.color}
              x={tk.x + dx}
              y={tk.y + dy}
              isMoving={tk.moving}
              isCurrent={live && tk.seat === currentPlayerIndex}
              z={tk.moving ? 50 : tk.seat === currentPlayerIndex ? 30 : 20}
              size={TOKEN_SIZE}
            />
          )
        })}
      </div>
    </div>
  )
})

/** Small cluster offset (board %) for the n-th of `count` co-located pawns. */
function clusterOffset(index: number, count: number): { dx: number; dy: number } {
  if (count < 2) return { dx: 0, dy: 0 }
  const s = 1.7
  const grid = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]
  const [gx, gy] = grid[index % grid.length]
  return { dx: gx * s, dy: gy * s }
}
