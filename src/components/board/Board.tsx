import { memo } from 'react'
import { cellsInRenderOrder, cellToPercent } from '../../game/board'
import type { ActiveMove, Phase, Player } from '../../game/types'
import { Cell } from './Cell'
import { SnakesLaddersLayer } from './SnakesLaddersLayer'
import { Token } from './Token'

interface BoardProps {
  players: Player[]
  activeMove: ActiveMove | null
  currentPlayerId: number
  phase: Phase
}

const CELLS = cellsInRenderOrder()
/** Where off-board (position 0) tokens wait, just below cell 1. */
const START_COORD = { x: 5, y: 105 }

/**
 * The static playing surface: the 100-cell grid and the snakes/ladders SVG.
 * Pure geometry with no props, so it is built once at module scope — React
 * sees the same element on every Board render and skips reconciling the whole
 * subtree while tokens animate across it.
 */
const BOARD_SURFACE = (
  <div className="absolute inset-0 overflow-hidden rounded-2xl border-4 border-board-line/70 shadow-2xl ring-1 ring-black/20">
    <div className="grid h-full w-full grid-cols-10 grid-rows-10">
      {CELLS.map((cell) => (
        <Cell key={cell} cell={cell} />
      ))}
    </div>
    <SnakesLaddersLayer />
  </div>
)

/**
 * The playing surface: a clipped 10×10 grid with the snakes/ladders SVG on top,
 * and an un-clipped token layer so pawns can wait in the start lane just below
 * the board. Tokens sharing a cell are fanned out horizontally so both stay
 * visible.
 */
export const Board = memo(function Board({
  players,
  activeMove,
  currentPlayerId,
  phase,
}: BoardProps) {
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
    return (index - (ids.length - 1) / 2) * 2.6
  }

  return (
    <div className="relative aspect-square w-full">
      {BOARD_SURFACE}

      {/* un-clipped token layer (start lane lives just below the board) */}
      <div className="pointer-events-none absolute inset-0">
        {display.map((d) => {
          const base = d.cell === 0 ? START_COORD : cellToPercent(d.cell)
          const isCurrent =
            d.player.id === currentPlayerId && phase !== 'won' && phase !== 'setup'
          return (
            <Token
              key={d.player.id}
              name={d.player.name}
              color={d.player.color}
              x={base.x + offsetX(d.cell, d.player.id)}
              y={base.y}
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
