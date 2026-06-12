/**
 * Pure UNO rules — legality, the deterministic outcome of each move, challenge
 * adjudication, and scoring. No React, no DOM, no randomness: given a state and
 * a chosen move, these compute the exact `UnoTurnResolution` that is broadcast
 * and replayed identically on every client (the way `src/ludo/rules.ts` bakes a
 * token move). Unit-tested in `rules.test.ts`.
 */
import { SCORING } from './config'
import type {
  PenaltyDraw,
  UnoCard,
  UnoColor,
  UnoGameState,
  UnoTurnResolution,
} from './types'

type PlayResolution = Extract<UnoTurnResolution, { kind: 'play' }>
type DrawResolution = Extract<UnoTurnResolution, { kind: 'draw' }>
type ChallengeResolution = Extract<UnoTurnResolution, { kind: 'challenge' }>

// ---- Scoring --------------------------------------------------------------

/** Points one card is worth to the round winner. */
export function cardScore(card: UnoCard): number {
  if (typeof card.value === 'number') return card.value
  if (card.value === 'wild' || card.value === 'wild4') return SCORING.wild
  return SCORING.action // skip / reverse / draw2
}

/** Total value of a hand (what an opponent's leftover cards are worth). */
export function scoreHand(hand: readonly UnoCard[]): number {
  return hand.reduce((sum, c) => sum + cardScore(c), 0)
}

/** Points the round winner scores: the sum of every other hand's value. */
export function scoreRound(state: UnoGameState): number {
  return state.hands.reduce(
    (sum, hand, seat) => (seat === state.currentPlayerIndex ? sum : sum + scoreHand(hand)),
    0,
  )
}

// ---- Turn-order helper ----------------------------------------------------

/** Move `steps` seats from `index` in `direction`, wrapping. (UNO rounds end on
 *  the first emptied hand, so no seat is ever "finished" and skipped here.) */
export function step(index: number, direction: 1 | -1, count: number, steps = 1): number {
  return (((index + direction * steps) % count) + count) % count
}

// ---- Legality -------------------------------------------------------------

/** Remove the given cards (by id) from a hand, returning a new array. */
export function removeCards(hand: readonly UnoCard[], cards: readonly UnoCard[]): UnoCard[] {
  const ids = new Set(cards.map((c) => c.id))
  return hand.filter((c) => !ids.has(c.id))
}

/**
 * The cards in `hand` that may legally be played right now.
 *
 * - With a pending draw: nothing is legal unless `stacking` is on, in which case
 *   only a same-type penalty card (Draw-Two on Draw-Two, WD4 on WD4) may stack.
 * - Otherwise a card is legal if it is a Wild, matches the active color, or
 *   matches the top card's value. A Wild-Draw-Four is restricted to when you
 *   hold no card of the active color — unless the challenge rule is on, which
 *   permits the bluff (the challenge adjudicates it).
 */
export function legalPlays(
  hand: readonly UnoCard[],
  top: UnoCard,
  activeColor: UnoColor,
  pending: number,
  pendingType: 'draw2' | 'wild4' | null,
  rules: { stacking: boolean; challengeWild4: boolean },
): UnoCard[] {
  if (pending > 0) {
    if (!rules.stacking || pendingType == null) return []
    return hand.filter((c) => c.value === pendingType)
  }
  const hasActiveColor = hand.some((c) => c.color === activeColor)
  return hand.filter((c) => {
    if (c.value === 'wild') return true
    if (c.value === 'wild4') return rules.challengeWild4 ? true : !hasActiveColor
    return c.color === activeColor || c.value === top.value
  })
}

/** Was a Wild-Draw-Four a legal (non-bluff) play — i.e. the hand at play time
 *  held no card of the active color? Wilds don't count as a color. */
export function wild4WasLegal(handAtPlay: readonly UnoCard[], activeColor: UnoColor): boolean {
  return !handAtPlay.some((c) => c.color === activeColor)
}

// ---- Resolving a play -----------------------------------------------------

export interface PlayOptions {
  /** The card(s) being played — one, or several identical for multi-play. */
  cards: UnoCard[]
  /** Chosen color for a wild / wild4. */
  chosenColor?: UnoColor
  /** Seven-Zero: the swap partner when playing a `7`. */
  sevenSwapTarget?: number
  /** The player declared UNO with this play. */
  declaredUno?: boolean
}

/**
 * Compute the resolution for the current player playing `cards`. Assumes the set
 * is legal and identical (validated upstream by the hook/bot/UI). The returned
 * `effect` carries every deterministic consequence so the reducer — and every
 * remote client — applies the identical outcome with no re-decision.
 */
export function resolvePlay(state: UnoGameState, opts: PlayOptions): PlayResolution {
  const seat = state.currentPlayerIndex
  const n = state.players.length
  const cards = opts.cards
  const card = cards[0]
  const count = cards.length
  const value = card.value

  let direction = state.direction
  let reversed = false
  let skipped = false
  let penaltyDraw: PenaltyDraw | undefined
  let sevenSwapTarget: number | undefined
  let zeroRotate: boolean | undefined

  if (value === 'reverse') {
    if (count % 2 === 1) {
      direction = (direction * -1) as 1 | -1
      reversed = true
    }
    // With two players a Reverse acts as a Skip (the opponent loses their turn).
    if (n === 2 && reversed) skipped = true
  } else if (value === 'skip') {
    skipped = true
  } else if (value === 'draw2') {
    penaltyDraw = { seat: step(seat, direction, n, 1), count: state.pendingDraw + 2 * count }
  } else if (value === 'wild4') {
    penaltyDraw = { seat: step(seat, direction, n, 1), count: state.pendingDraw + 4 * count }
  } else if (value === 7 && state.rules.sevenZero) {
    sevenSwapTarget = opts.sevenSwapTarget
  } else if (value === 0 && state.rules.sevenZero) {
    zeroRotate = true
  }

  const remaining = removeCards(state.hands[seat], cards)
  const isRoundWin = remaining.length === 0

  // How far the turn advances. A Skip jumps over `count` seats; a 2-player
  // Reverse skips the opponent; everything else (including Draw-Two/WD4, where
  // the next seat faces the pending) advances one.
  let steps = 1
  if (value === 'skip') steps = 1 + count
  else if (value === 'reverse' && n === 2 && reversed) steps = 2
  const nextIndex = isRoundWin ? seat : step(seat, direction, n, steps)

  const resolution: PlayResolution = {
    kind: 'play',
    seat,
    cards,
    declaredUno: opts.declaredUno === true,
    effect: {
      reversed,
      skipped,
      ...(penaltyDraw ? { penaltyDraw } : {}),
      ...(sevenSwapTarget != null ? { sevenSwapTarget } : {}),
      ...(zeroRotate ? { zeroRotate: true } : {}),
      nextIndex,
      isRoundWin,
    },
  }
  if (card.color == null && opts.chosenColor) resolution.chosenColor = opts.chosenColor
  return resolution
}

// ---- Resolving a draw -----------------------------------------------------

export interface DrawOptions {
  /** A voluntary single draw may be followed by playing the drawn card. */
  thenPlay?: UnoCard | null
  /** Color chosen if `thenPlay` was a wild. */
  chosenColor?: UnoColor
  /** Seven-Zero swap target if `thenPlay` was a `7`. */
  sevenSwapTarget?: number
}

/**
 * Compute a draw resolution for the current player. A pending penalty draws the
 * whole accumulated total (and the seat forfeits its turn); a voluntary draw
 * takes one card, which may then be played (`thenPlay`). The drawn cards'
 * identities come deterministically off the stock, so only the count travels;
 * `thenPlay`'s turn consequences are recomputed by the reducer.
 */
export function resolveDraw(state: UnoGameState, opts: DrawOptions = {}): DrawResolution {
  const seat = state.currentPlayerIndex
  if (state.pendingDraw > 0) {
    return { kind: 'draw', seat, count: state.pendingDraw, thenPlay: null }
  }
  const resolution: DrawResolution = { kind: 'draw', seat, count: 1 }
  if (opts.thenPlay) {
    resolution.thenPlay = opts.thenPlay
    if (opts.thenPlay.color == null && opts.chosenColor) resolution.chosenColor = opts.chosenColor
  }
  return resolution
}

// ---- Wild-Draw-Four challenge ---------------------------------------------

/**
 * Adjudicate a challenge to the current Wild-Draw-Four. Deterministic on every
 * client: the prior hand of the WD4 player is publicly derivable, so the bluff
 * test ("did they still hold a card of the color in effect before the WD4")
 * needs no negotiation. A caught bluff makes the WD4 player draw 4; a failed
 * challenge makes the challenger draw the 4 they owed plus 2 (six total) and
 * lose the turn.
 */
export function adjudicateChallenge(state: UnoGameState): ChallengeResolution {
  const challenger = state.currentPlayerIndex
  const n = state.players.length
  const info = state.wild4Challenge
  // Defensive: no WD4 pending → treat as a failed challenge (no bluff to catch).
  const target = info?.by ?? step(challenger, state.direction, n, -1)
  const bluffed = info ? state.hands[target].some((c) => c.color === info.priorColor) : false

  if (bluffed) {
    return {
      kind: 'challenge',
      seat: challenger,
      target,
      success: true,
      penalty: { seat: target, count: 4 },
      // The challenger was right: they keep their turn (not skipped, no draw).
      nextIndex: challenger,
    }
  }
  return {
    kind: 'challenge',
    seat: challenger,
    target,
    success: false,
    // The challenger draws the owed 4 plus a 2-card penalty, then is skipped.
    penalty: { seat: challenger, count: state.pendingDraw + 2 },
    nextIndex: step(challenger, state.direction, n, 1),
  }
}

// ---- UNO call-out ---------------------------------------------------------

/** A player caught sitting on one card without declaring UNO draws 2. */
export function resolveCallout(target: number, by: number): Extract<UnoTurnResolution, { kind: 'callout' }> {
  return { kind: 'callout', seat: by, target, penalty: { seat: target, count: 2 } }
}
