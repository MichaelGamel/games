/**
 * The Connect Four computer player — pure and deterministic (apart from the
 * `easy` level's injectable RNG, defaulting to `Math.random`). Local play only:
 * online rooms never run a bot.
 *
 * Three strengths, chosen per seat at setup:
 *   - `easy`   — takes obvious wins, blocks only sometimes, otherwise random.
 *                Beatable by a beginner.
 *   - `medium` — the classic one-ply heuristic: win now → block now → don't gift
 *                the opponent the cell above → play center-out.
 *   - `hard`   — a negamax search with alpha-beta pruning over a positional
 *                window-evaluation; sees {@link HARD_SEARCH_DEPTH} plies ahead and
 *                plays at a near-professional level (creates and answers double
 *                threats, never blunders an in-horizon win).
 */
import { COLS, HARD_SEARCH_DEPTH, ROWS } from './config'
import { EMPTY, dropRow, findWinLine, legalColumns } from './rules'
import type { FourBotLevel } from './types'

/** The center column — controls the most winning lines. */
const CENTER = Math.floor(COLS / 2)

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

// ──────────────────────────────────────────────────────────────────────────
//  easy — barely-competent: grabs a free win, blocks only half the time.
// ──────────────────────────────────────────────────────────────────────────
function chooseEasyMove(
  board: number[][],
  seat: number,
  opponent: number,
  rng: () => number,
): number {
  const legal = legalColumns(board)
  for (const col of legal) if (winsAt(board, col, seat)) return col
  // Block an imminent loss only sometimes, so it feels like a casual human.
  if (rng() < 0.5) {
    for (const col of legal) if (winsAt(board, col, opponent)) return col
  }
  return legal[Math.floor(rng() * legal.length)]
}

// ──────────────────────────────────────────────────────────────────────────
//  medium — the classic one-ply heuristic.
// ──────────────────────────────────────────────────────────────────────────
function chooseMediumMove(board: number[][], seat: number, opponent: number): number {
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

// ──────────────────────────────────────────────────────────────────────────
//  hard — negamax + alpha-beta over a positional window evaluation.
// ──────────────────────────────────────────────────────────────────────────

/** A win is worth far more than any positional score (which stays in the 100s). */
const WIN_SCORE = 1_000_000

/** Score a 4-cell window from `me`'s perspective; mixed windows are dead. */
function windowScore(
  board: number[][],
  r: number,
  c: number,
  dr: number,
  dc: number,
  me: number,
  opp: number,
): number {
  let mine = 0
  let theirs = 0
  for (let i = 0; i < 4; i++) {
    const v = board[r + dr * i][c + dc * i]
    if (v === me) mine++
    else if (v === opp) theirs++
  }
  if (mine > 0 && theirs > 0) return 0 // blocked window — worthless to both
  if (mine === 3) return 50
  if (mine === 2) return 10
  if (mine === 1) return 1
  if (theirs === 3) return -70 // weight defense a touch higher than offense
  if (theirs === 2) return -8
  if (theirs === 1) return -1
  return 0
}

/** Static evaluation of a non-terminal board from `me`'s perspective. */
function evaluate(board: number[][], me: number, opp: number): number {
  let score = 0
  // Central discs are flexible — count them.
  for (let r = 0; r < ROWS; r++) {
    if (board[r][CENTER] === me) score += 6
    else if (board[r][CENTER] === opp) score -= 6
  }
  // Every length-4 window in all four directions.
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c <= COLS - 4; c++) score += windowScore(board, r, c, 0, 1, me, opp)
  for (let r = 0; r <= ROWS - 4; r++)
    for (let c = 0; c < COLS; c++) score += windowScore(board, r, c, 1, 0, me, opp)
  for (let r = 0; r <= ROWS - 4; r++)
    for (let c = 0; c <= COLS - 4; c++) score += windowScore(board, r, c, 1, 1, me, opp)
  for (let r = 0; r <= ROWS - 4; r++)
    for (let c = 3; c < COLS; c++) score += windowScore(board, r, c, 1, -1, me, opp)
  return score
}

/** Legal columns, center-first — the ordering that makes alpha-beta cut deep. */
function orderedLegal(board: number[][]): number[] {
  return CENTER_OUT.filter((c) => board[0][c] === EMPTY)
}

/**
 * Negamax with alpha-beta. Returns the value of `board` for the side `toMove`,
 * searching `depth` plies. Mutates `board` in place but always restores it.
 */
function negamax(
  board: number[][],
  depth: number,
  alpha: number,
  beta: number,
  toMove: number,
  other: number,
): number {
  const legal = orderedLegal(board)
  if (legal.length === 0) return 0 // board full — draw

  // Any move that completes four ends the line here (faster wins score higher).
  for (const col of legal) {
    const row = dropRow(board, col)!
    board[row][col] = toMove
    const win = findWinLine(board, row, col, toMove) != null
    board[row][col] = EMPTY
    if (win) return WIN_SCORE - (HARD_SEARCH_DEPTH - depth)
  }
  if (depth === 0) return evaluate(board, toMove, other)

  let best = -Infinity
  for (const col of legal) {
    const row = dropRow(board, col)!
    board[row][col] = toMove
    const score = -negamax(board, depth - 1, -beta, -alpha, other, toMove)
    board[row][col] = EMPTY
    if (score > best) best = score
    if (best > alpha) alpha = best
    if (alpha >= beta) break // opponent won't allow this line
  }
  return best
}

function chooseHardMove(board: number[][], seat: number, opponent: number): number {
  const legal = orderedLegal(board)

  // 1) Take a forced win immediately (and 2) deny the opponent theirs) — cheap,
  // and it short-circuits the search. Center-out order breaks ties sensibly.
  for (const col of legal) if (winsAt(board, col, seat)) return col
  for (const col of legal) if (winsAt(board, col, opponent)) return col

  // 3) The textbook optimal opening is the center; skip the search for it.
  if (board.every((row) => row.every((v) => v === EMPTY))) return CENTER

  // 4) Full search. Work on one scratch copy, mutated and restored throughout.
  const work = board.map((r) => [...r])
  let bestCol = legal[0]
  let bestScore = -Infinity
  let alpha = -Infinity
  for (const col of legal) {
    const row = dropRow(work, col)!
    work[row][col] = seat
    const score = -negamax(work, HARD_SEARCH_DEPTH - 1, -Infinity, -alpha, opponent, seat)
    work[row][col] = EMPTY
    if (score > bestScore) {
      bestScore = score
      bestCol = col
    }
    if (bestScore > alpha) alpha = bestScore
  }
  return bestCol
}

/**
 * Pick the bot's column. `board` must have at least one legal column.
 * `level` selects the engine; `rng` (easy only) is injectable for tests.
 */
export function chooseFourMove(
  board: number[][],
  seat: number,
  opponent: number,
  level: FourBotLevel = 'medium',
  rng: () => number = Math.random,
): number {
  switch (level) {
    case 'easy':
      return chooseEasyMove(board, seat, opponent, rng)
    case 'hard':
      return chooseHardMove(board, seat, opponent)
    default:
      return chooseMediumMove(board, seat, opponent)
  }
}
