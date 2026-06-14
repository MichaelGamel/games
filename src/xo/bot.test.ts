import { describe, expect, it } from 'vitest'
import { chooseXOMove } from './bot'
import { EMPTY, emptyBoard, findWinLine, legalCells } from './rules'

/** Build a board from a 3-row ASCII sketch: `.` empty, `X` seat 0, `O` seat 1. */
function board(rows: [string, string, string]): number[][] {
  return rows.map((row) =>
    [...row].map((ch) => (ch === 'X' ? 0 : ch === 'O' ? 1 : EMPTY)),
  )
}

const winnerOf = (b: number[][]): number | null => {
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      if (b[r][c] !== EMPTY && findWinLine(b, r, c, b[r][c])) return b[r][c]
  return null
}

describe('chooseXOMove', () => {
  it('opens in the centre', () => {
    expect(chooseXOMove(emptyBoard(), 0, 1)).toEqual([1, 1])
  })

  it('takes an immediate win', () => {
    // X to move with two in the top row.
    expect(chooseXOMove(board(['XX.', 'OO.', '...']), 0, 1)).toEqual([0, 2])
  })

  it('blocks the opponent’s immediate win', () => {
    // O threatens the top row and X has no win of its own → block at (0,2).
    expect(chooseXOMove(board(['OO.', 'X..', '...']), 0, 1)).toEqual([0, 2])
  })

  it('never loses across full self-play (perfect vs perfect → draw)', () => {
    // Drive a whole game with both seats played by the bot; it must end drawn.
    const b = emptyBoard()
    let toMove = 0
    while (legalCells(b).length > 0 && winnerOf(b) == null) {
      const [r, c] = chooseXOMove(b, toMove, (toMove + 1) % 2)
      b[r][c] = toMove
      toMove = (toMove + 1) % 2
    }
    expect(winnerOf(b)).toBeNull()
  })
})
