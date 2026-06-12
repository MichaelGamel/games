/**
 * Computer-player decisions for local UNO — pure and deterministic (ties break
 * by card-id order), so it is unit-testable and would agree on every client if
 * it ever ran remotely. Mirrors `src/ludo/bot.ts`.
 *
 * Heuristic: face a penalty by stacking a same-type card if allowed, else draw;
 * challenge a Wild-Draw-Four only when the bluff is already visible; otherwise
 * dump the highest-value matching card (saving wilds for last), choose the color
 * you hold most of, and steal a hand with a `7` from whoever is closest to out.
 */
import { adjudicateChallenge, cardScore, legalPlays, wild4WasLegal } from './rules'
import { UNO_COLORS } from './config'
import type { UnoCard, UnoColor, UnoGameState } from './types'

/** The color a hand holds the most of (ties break by `UNO_COLORS` order). */
export function mostCommonColor(hand: readonly UnoCard[]): UnoColor {
  const counts = new Map<UnoColor, number>()
  for (const c of hand) if (c.color) counts.set(c.color, (counts.get(c.color) ?? 0) + 1)
  let best: UnoColor = UNO_COLORS[0]
  let max = -1
  for (const color of UNO_COLORS) {
    const n = counts.get(color) ?? 0
    if (n > max) {
      max = n
      best = color
    }
  }
  return best
}

/** What a bot decides to do on its turn. */
export type BotMove =
  | { type: 'play'; cards: UnoCard[]; chosenColor?: UnoColor; sevenSwapTarget?: number; declareUno: boolean }
  | { type: 'draw' }
  | { type: 'challenge' }

/** Pick the seat (other than `seat`) holding the fewest cards — the biggest
 *  threat to steal a hand from with a `7`. */
function fewestCardsOpponent(state: UnoGameState, seat: number): number {
  let best = seat
  let min = Infinity
  for (let i = 0; i < state.players.length; i++) {
    if (i === seat) continue
    if (state.hands[i].length < min) {
      min = state.hands[i].length
      best = i
    }
  }
  return best
}

export function chooseBotPlay(state: UnoGameState, seat: number): BotMove {
  const hand = state.hands[seat]
  const top = state.discard[state.discard.length - 1]

  // Facing a Wild-Draw-Four we can see was an illegal bluff: challenge it.
  if (
    state.pendingDraw > 0 &&
    state.pendingDrawType === 'wild4' &&
    state.rules.challengeWild4 &&
    state.wild4Challenge &&
    !wild4WasLegal(state.hands[state.wild4Challenge.by], state.wild4Challenge.priorColor)
  ) {
    return { type: 'challenge' }
  }

  const legal = legalPlays(hand, top, state.activeColor, state.pendingDraw, state.pendingDrawType, state.rules)
  if (legal.length === 0) return { type: 'draw' }

  // Prefer a colored card; dump the highest-value one first. Fall back to wilds
  // only when nothing else is playable (they are the most flexible to keep).
  const colored = legal.filter((c) => c.color != null)
  const pick = (colored.length > 0 ? colored : legal)
    .slice()
    .sort((a, b) => cardScore(b) - cardScore(a) || (a.id < b.id ? -1 : 1))[0]

  const declareUno = hand.length - 1 === 1
  const move: BotMove = { type: 'play', cards: [pick], declareUno }
  if (pick.color == null) move.chosenColor = mostCommonColor(hand)
  if (pick.value === 7 && state.rules.sevenZero) move.sevenSwapTarget = fewestCardsOpponent(state, seat)
  return move
}

// Re-export so the auto-play driver can reuse challenge adjudication symmetry.
export { adjudicateChallenge }
