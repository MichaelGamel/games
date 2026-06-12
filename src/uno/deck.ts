/**
 * The UNO deck — built, shuffled, dealt, and reshuffled **deterministically**.
 *
 * This is the whole secrecy mechanism: there is no server and no hidden state on
 * the wire. The host broadcasts a single `deckSeed`; every client calls
 * `shuffle(seed)` to produce the byte-identical 108-card stock, deals identically,
 * and thereafter stays in sync by replaying only the public card played. When the
 * stock runs out, `reshuffleDiscard(discard, reshuffleCount)` rebuilds it from the
 * public discard with the reshuffle counter as its only entropy — so every client
 * reshuffles the same way with no message exchanged.
 *
 * Pure and framework-free (no React, no DOM); the only randomness is `mulberry32`
 * over an explicit seed. Unit-tested in `deck.test.ts`.
 */
import { mulberry32 } from '../game/boardGen'
import { HAND_SIZE, UNO_COLORS } from './config'
import type { UnoCard, UnoNumber } from './types'

const ACTIONS = ['skip', 'reverse', 'draw2'] as const

/**
 * Build the canonical, unshuffled 108-card deck in a fixed order.
 *
 * Per color (×4): one `0`, two each of `1`–`9`, two each Skip/Reverse/Draw-Two
 * = 25 → 100; plus 4 Wild and 4 Wild-Draw-Four = 108. Ids are assigned in build
 * order (`u0`..`u107`) and are therefore identical on every client.
 */
export function buildDeck(): UnoCard[] {
  const cards: UnoCard[] = []
  const push = (color: UnoCard['color'], value: UnoCard['value']) =>
    cards.push({ id: `u${cards.length}`, color, value })

  for (const color of UNO_COLORS) {
    push(color, 0)
    for (let n = 1; n <= 9; n++) {
      push(color, n as UnoNumber)
      push(color, n as UnoNumber)
    }
    for (const action of ACTIONS) {
      push(color, action)
      push(color, action)
    }
  }
  for (let k = 0; k < 4; k++) push(null, 'wild')
  for (let k = 0; k < 4; k++) push(null, 'wild4')

  return cards
}

/**
 * The full shuffled stock for one round. Fisher–Yates driven by `mulberry32`,
 * so a given seed yields the identical order on every client. The returned
 * array's **last element is the top of the pile** (drawn first).
 */
export function shuffle(seed: number): UnoCard[] {
  const deck = buildDeck()
  const rng = mulberry32(seed)
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = deck[i]
    deck[i] = deck[j]
    deck[j] = tmp
  }
  return deck
}

/** The result of dealing a fresh round. */
export interface DealResult {
  /** Each seat's 7-card hand, parallel to seats `0..playerCount-1`. */
  hands: UnoCard[][]
  /** The remaining draw pile (top = last element). */
  stock: UnoCard[]
  /** The card flipped to start the discard — never a Wild-Draw-Four. */
  startCard: UnoCard
}

/**
 * Deal {@link HAND_SIZE} cards to each of `playerCount` seats (round-robin from
 * the top of `stock`), then flip the start card. Per the official rule a
 * Wild-Draw-Four may not start the discard: any flipped WD4 is buried at the
 * bottom of the stock and the next card is flipped instead (deterministic —
 * every client does the same). The input `stock` is not mutated.
 */
export function deal(stock: readonly UnoCard[], playerCount: number): DealResult {
  const pile = [...stock]
  const hands: UnoCard[][] = Array.from({ length: playerCount }, () => [])
  for (let k = 0; k < HAND_SIZE; k++) {
    for (let seat = 0; seat < playerCount; seat++) {
      hands[seat].push(pile.pop()!)
    }
  }

  // Flip the start card; bury any Wild-Draw-Four at the bottom and re-flip.
  const buried: UnoCard[] = []
  let startCard = pile.pop()!
  while (startCard.value === 'wild4') {
    buried.push(startCard)
    startCard = pile.pop()!
  }
  pile.unshift(...buried)

  return { hands, stock: pile, startCard }
}

/**
 * Rebuild an exhausted stock from the discard pile. The current top card stays
 * in play (it remains the discard); everything beneath it is reshuffled into a
 * new stock. The shuffle is seeded purely by `reshuffleCount`, so two clients
 * with the same discard and counter produce the identical new stock — no message
 * needed. Returns the new stock (top = last element) and the discard reduced to
 * just its top card.
 */
export function reshuffleDiscard(
  discard: readonly UnoCard[],
  reshuffleCount: number,
): { stock: UnoCard[]; discard: UnoCard[] } {
  if (discard.length <= 1) return { stock: [], discard: [...discard] }
  const top = discard[discard.length - 1]
  const pool = discard.slice(0, -1)

  // Sort by id first so the input order can't leak board-state divergence into
  // the result: the seed alone determines the outcome.
  pool.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const rng = mulberry32(reshuffleCount)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = pool[i]
    pool[i] = pool[j]
    pool[j] = tmp
  }

  return { stock: pool, discard: [top] }
}
