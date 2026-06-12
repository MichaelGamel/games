/**
 * The Connect Four computer player — pure and deterministic.
 * Strategy: win now if possible; otherwise block the opponent's immediate win;
 * otherwise avoid handing the opponent a win on top of our disc; otherwise
 * play center-out (strongest columns first).
 */
import { COLS } from './config'
import { dropRow, findWinLine, legalColumns } from './rules'

/** Columns in center-out preference order (center controls the most lines). */
const CENTER_OUT: readonly number[] = Array.from({ length: COLS }, (_, i) => i).sort(
  (a, b) => Math.abs(a - (COLS - 1) / 2) - Math.abs(b - (COLS - 1) / 2) || a - b,
)

/** Would dropping in `column` win the game for `seat`? */
function winsAt(board: number[][], column: number, seat: number): boolean {
  const row = dropRow(board, column)
  if (row == null) return false
  const probe = board.map((r) => [...r])
  probe[row][column] = seat
  return findWinLine(probe, row, column, seat) != null
}

/** Pick the bot's column. `board` must have at least one legal column. */
export function chooseFourMove(board: number[][], seat: number, opponent: number): number {
  const legal = legalColumns(board)

  // 1) Take an immediate win.
  for (const col of legal) if (winsAt(board, col, seat)) return col

  // 2) Block the opponent's immediate win.
  for (const col of legal) if (winsAt(board, col, opponent)) return col

  // 3) Prefer center-out, but avoid gifting the cell above to the opponent.
  const safe = legal.filter((col) => {
    const row = dropRow(board, col)!
    if (row === 0) return true
    const probe = board.map((r) => [...r])
    probe[row][col] = seat
    return !winsAt(probe, col, opponent)
  })
  const pool = safe.length > 0 ? safe : legal
  for (const col of CENTER_OUT) if (pool.includes(col)) return col
  return pool[0]
}
