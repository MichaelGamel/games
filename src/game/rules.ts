/**
 * The rules engine — pure functions with no side effects and no React.
 * Given the turn's context (board, positions, dice) it returns a fully-resolved
 * {@link TurnResolution} the UI can replay as animation — and that online
 * clients replay identically. This is the testable heart of the game.
 */
import { DIE_FACES } from './config'
import type { BoardLayout, DieValue, Jump, SpecialKind, TurnResolution } from './types'

/** Injectable random source so tests can be deterministic (DIP). */
export type Rng = () => number

/** Roll a fair die. Pass a custom `rng` to make the result deterministic. */
export function rollDie(rng: Rng = Math.random): DieValue {
  return (Math.floor(rng() * DIE_FACES) + 1) as DieValue
}

/** Roll one or two dice (per the match rules). */
export function rollDice(count: 1 | 2, rng: Rng = Math.random): DieValue[] {
  return Array.from({ length: count }, () => rollDie(rng))
}

/** The snake or ladder entered at `cell`, or `null` if none. */
export function jumpAt(board: BoardLayout, cell: number): Jump | null {
  const ladderTo = board.ladders[cell]
  if (ladderTo != null) return { from: cell, to: ladderTo, kind: 'ladder' }
  const snakeTo = board.snakes[cell]
  if (snakeTo != null) return { from: cell, to: snakeTo, kind: 'snake' }
  return null
}

/** Everything `resolveTurn` needs to know about the moment of the roll. */
export interface TurnContext {
  board: BoardLayout
  /** Committed positions of every player, indexed by player id. */
  positions: number[]
  /** The seat rolling this turn. */
  playerIndex: number
  /** Whether that seat currently holds a shield. */
  hasShield: boolean
  /** The dice as rolled (one or two, per the match rules). */
  dice: DieValue[]
  /** Random source for the mystery teleport target (injectable for tests). */
  rng?: Rng
}

/**
 * Compute the complete outcome of one roll.
 *
 * Rules applied, in order:
 * - The token walks the dice total. Overshooting the final cell reflects
 *   ("bounces") back — you must land exactly on the finish to win.
 * - The snake/ladder at the landed cell (if any) is then taken — unless it is
 *   a snake and the player holds a shield, which is spent to stay put.
 * - The special at the resulting cell (if any) fires: shield pickup, swap with
 *   the leader, or a mystery teleport (the destination is decided here, once,
 *   and carried in the resolution so every client replays it identically).
 * - One die: a 6 grants another turn. Two dice: doubles grant another turn.
 *   Winning always ends the turn.
 */
export function resolveTurn(ctx: TurnContext): TurnResolution {
  const { board, positions, playerIndex, hasShield, dice } = ctx
  const rng = ctx.rng ?? Math.random
  const final = board.size * board.size
  const from = positions[playerIndex]
  const roll = dice.reduce((sum, d) => sum + d, 0)

  // 1) Walk (with the bounce off the final cell).
  const raw = from + roll
  const walkPath: number[] = []
  let landed: number
  let bounced = false
  if (raw <= final) {
    landed = raw
    for (let c = from + 1; c <= raw; c++) walkPath.push(c)
  } else {
    bounced = true
    landed = final - (raw - final)
    for (let c = from + 1; c <= final; c++) walkPath.push(c)
    for (let c = final - 1; c >= landed; c--) walkPath.push(c)
  }

  // 2) Snake / ladder (a shield blocks a snake and is spent).
  const jumpHere = jumpAt(board, landed)
  let jump: Jump | null = jumpHere
  let shieldUsed = false
  if (jumpHere?.kind === 'snake' && hasShield) {
    jump = null
    shieldUsed = true
  }
  let pos = jump ? jump.to : landed

  // 3) Special cell at the resulting position (never on the finish).
  const special: SpecialKind | null = board.specials[pos] ?? null
  let shieldGained = false
  let swapWith: number | null = null
  let swapPartnerPos: number | null = null
  let teleportTo: number | null = null

  if (special === 'shield') {
    shieldGained = true
  } else if (special === 'swap') {
    // Trade places with the player furthest ahead of us (never a finished one).
    let leader: number | null = null
    for (let id = 0; id < positions.length; id++) {
      if (id === playerIndex) continue
      const p = positions[id]
      if (p >= final || p <= pos) continue
      if (leader == null || p > positions[leader]) leader = id
    }
    if (leader != null) {
      swapWith = leader
      swapPartnerPos = pos
      pos = positions[leader]
    }
  } else if (special === 'mystery') {
    // Anywhere except the start run, the finish, and where we already stand.
    let target = pos
    while (target === pos) target = 2 + Math.floor(rng() * (final - 3))
    teleportTo = target
    pos = target
  }

  const isWin = pos === final
  const extraTurn =
    !isWin && (dice.length === 1 ? dice[0] === DIE_FACES : dice[0] === dice[1])

  return {
    dice,
    roll,
    from,
    walkPath,
    bounced,
    landed,
    jump,
    shieldUsed,
    special,
    shieldGained,
    swapWith,
    swapPartnerPos,
    teleportTo,
    finalPos: pos,
    isWin,
    extraTurn,
  }
}
