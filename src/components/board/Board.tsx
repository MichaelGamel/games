import { memo } from 'react'
import { cellsInRenderOrder, cellToPercent } from '../../game/board'
import type { ActiveMove, BoardLayout, Phase, Player } from '../../game/types'
import { Cell } from './Cell'
import { SnakesLaddersLayer } from './SnakesLaddersLayer'
import { Token } from './Token'

interface BoardProps {
  /** The match's board (classic or generated) — fixed for the whole match. */
  board: BoardLayout
  players: Player[]
  activeMove: ActiveMove | null
  currentPlayerId: number
  phase: Phase
}

/**
 * The static playing surface: the cell grid and the snakes/ladders SVG. It
 * depends only on the (per-match constant) board layout, so the memo makes it
 * render exactly once per match while tokens animate across it.
 */
const BoardSurface = memo(function BoardSurface({ board }: { board: BoardLayout }) {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-2xl border-4 border-board-line/70 shadow-2xl ring-1 ring-black/20">
      <div
        className="grid h-full w-full"
        style={{
          gridTemplateColumns: `repeat(${board.size}, 1fr)`,
          gridTemplateRows: `repeat(${board.size}, 1fr)`,
        }}
      >
        {cellsInRenderOrder(board.size).map((cell) => (
          <Cell key={cell} cell={cell} board={board} />
        ))}
      </div>
      <SnakesLaddersLayer board={board} />
    </div>
  )
})

/**
 * The playing surface: a clipped grid with the snakes/ladders SVG on top, and
 * an un-clipped token layer so pawns can wait in the start lane just below the
 * board. Tokens sharing a cell are fanned out horizontally so both stay
 * visible.
 */
export const Board = memo(function Board({
  board,
  players,
  activeMove,
  currentPlayerId,
  phase,
}: BoardProps) {
  // Where off-board (position 0) tokens wait, just below cell 1.
  const startCoord = { x: 50 / board.size, y: 100 + 50 / board.size }
  // Pawn diameter: just under one cell, whatever the board size.
  const tokenSizePct = 86 / board.size

  const display = players.map((p) => {
    const moving = activeMove?.playerId === p.id
    return {
      player: p,
      cell: moving ? activeMove!.cell : p.position,
      kind: moving ? activeMove!.kind : null,
      moving,
    }
  })

  // Group co-located tokens so we can spread them apart.
  const occupants = new Map<number, number[]>()
  for (const d of display) {
    const ids = occupants.get(d.cell) ?? []
    ids.push(d.player.id)
    occupants.set(d.cell, ids)
  }

  const offsetX = (cell: number, id: number) => {
    const ids = occupants.get(cell)!
    if (ids.length < 2) return 0
    const index = ids.indexOf(id)
    return (index - (ids.length - 1) / 2) * (26 / board.size)
  }

  return (
    <div className="relative aspect-square w-full">
      <BoardSurface board={board} />

      {/* un-clipped token layer (start lane lives just below the board) */}
      <div className="pointer-events-none absolute inset-0">
        {display.map((d) => {
          const base = d.cell === 0 ? startCoord : cellToPercent(d.cell, board.size)
          const isCurrent =
            d.player.id === currentPlayerId && phase !== 'won' && phase !== 'setup'
          return (
            <Token
              key={d.player.id}
              name={d.player.name}
              color={d.player.color}
              x={base.x + offsetX(d.cell, d.player.id)}
              y={base.y}
              sizePct={tokenSizePct}
              hasShield={d.player.shield}
              kind={d.kind}
              isMoving={d.moving}
              isCurrent={isCurrent}
              z={d.moving ? 40 : isCurrent ? 30 : 20}
            />
          )
        })}
      </div>
    </div>
  )
})
