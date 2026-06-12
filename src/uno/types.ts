/**
 * Core domain types for UNO. Pure data shapes — no React, no DOM. Shared by
 * logic, hooks, and UI. Mirrors `src/game/types.ts` (Snakes) and
 * `src/ludo/types.ts` (Ludo).
 *
 * The defining twist versus the board games is **hidden hands over a shuffled
 * deck**. Secrecy is achieved by determinism, not by a server: the host
 * broadcasts a single `deckSeed`, every client shuffles the identical 108-card
 * deck with `mulberry32`, and the UI simply renders only your own hand. No card
 * identity ever travels except the public card actually played.
 */
import type { MatchDecision } from '../game/types'

export type { MatchDecision }

// ---- Cards ----------------------------------------------------------------

/** The four playable suits. Wild cards have no fixed color (`null`). */
export type UnoColor = 'red' | 'yellow' | 'green' | 'blue'

/** Number cards 0–9. */
export type UnoNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
/** Colored action cards. */
export type UnoAction = 'skip' | 'reverse' | 'draw2'
/** Colorless wild cards. */
export type UnoWild = 'wild' | 'wild4'
/** Everything that can appear on a card's face. */
export type UnoValue = UnoNumber | UnoAction | UnoWild

/**
 * One physical card. `id` is a stable, deck-build-order identifier (`u0`..`u107`)
 * — deterministic on every client, so the UI can track a card through
 * stock → hand → discard, and removal from a hand is unambiguous even with
 * duplicate faces. `color` is `null` for wilds until one is chosen in play (the
 * chosen color lives in `UnoGameState.activeColor`, never mutated onto the card).
 */
export interface UnoCard {
  id: string
  color: UnoColor | null
  value: UnoValue
}

// ---- Rules ----------------------------------------------------------------

/** Single-round (first to empty a hand) or play to a points target. */
export type UnoWinMode = 'single' | 'score'

/**
 * The rule variant for one match — chosen at setup (host chooses online) and
 * broadcast inside `start`, so every client plays the same game. Each toggle is
 * an optional house rule; all default OFF for the cleanest classic game.
 */
export interface UnoRules {
  /** Draw Two stacks on Draw Two, Wild-Draw-Four on Wild-Draw-Four: the target
   *  may pass the penalty on with a same-type card instead of drawing. */
  stacking: boolean
  /** A Wild-Draw-Four may be challenged: if the player had a card of the
   *  current color (an illegal bluff) they draw 4; otherwise the challenger
   *  draws 6. Adjudicated deterministically from the publicly-known prior hand. */
  challengeWild4: boolean
  /** Seven-Zero: playing a 7 swaps your hand with a chosen player; a 0 rotates
   *  every hand one seat in the current direction. */
  sevenZero: boolean
  /** Jump-In / Multi-play: lay several identical cards at once, and (local
   *  rooms only by default) play an exact match of the discard top out of turn.
   *  Out-of-turn jump-in defaults OFF online — see the plan's risk notes. */
  jumpIn: boolean
  /** End after one round, or accumulate scores to a target. */
  winMode: UnoWinMode
  /** Points needed to win in `score` mode (e.g. 200 / 300 / 500). */
  targetScore: number
}

/** How a computer player thinks (local play only). */
export type BotLevel = 'easy' | 'smart'

// ---- Phases & players -----------------------------------------------------

/**
 * Finite phases of an UNO game.
 * - `setup`     — choosing players, no deck dealt
 * - `idle`      — waiting for the current player to play or draw
 * - `choosing`  — **local-only**: picking a wild color, a seven swap target, or
 *                 deciding a Wild-Draw-Four challenge. Remote clients skip it —
 *                 the choice is baked into the broadcast resolution.
 * - `resolving` — a play/draw is animating (cards arcing, draws sliding)
 * - `roundEnd`  — a hand emptied; in `score` mode, paused for the host's
 *                 continue/end call (mirrors Ludo's `celebrating`)
 * - `matchEnd`  — the match is over (standings/scores final)
 */
export type UnoPhase = 'setup' | 'idle' | 'choosing' | 'resolving' | 'roundEnd' | 'matchEnd'

/** How the match ended: a hand emptied to the target, or everyone else left. */
export type UnoWinReason = 'empty' | 'forfeit'

export interface UnoPlayer {
  /** Stable 0-based index, also the seat / turn order. */
  id: number
  name: string
  /** Seat color as a CSS hex string (UI/roster identity — NOT a card color). */
  color: string
  /** Computer-controlled (local play only). Carried data, never a rule. */
  isBot: boolean
  /** How the bot thinks (when `isBot`). */
  botLevel?: BotLevel
}

// ---- Game state -----------------------------------------------------------

/**
 * The complete state of an UNO match. Hands/stock/discard are explicit arrays
 * built identically on every client from `deckSeed` (+ `reshuffleCount`), so the
 * whole hidden-information game stays in sync by replaying only public moves.
 */
export interface UnoGameState {
  phase: UnoPhase
  players: UnoPlayer[]
  /** Each seat's hand, parallel to `players` (hidden in the UI except your own). */
  hands: UnoCard[][]
  /** The draw pile, top = last element (popped on draw). */
  stock: UnoCard[]
  /** The discard pile, top = last element (the card in play). */
  discard: UnoCard[]
  /** The color currently in effect (a wild's chosen color, else the top card's). */
  activeColor: UnoColor
  /** Turn order: +1 clockwise, -1 after an odd number of Reverses. */
  direction: 1 | -1
  currentPlayerIndex: number
  /** Cards the next player must draw (accumulates while stacking). 0 = none. */
  pendingDraw: number
  /** Which penalty is stacking, so only same-type cards may stack onto it. */
  pendingDrawType: 'draw2' | 'wild4' | null
  /** Set only in the brief window right after a Wild-Draw-Four (for the
   *  challenge rule): who played it, and the color in effect beforehand — the
   *  bluff test is "did `by` still hold a card of `priorColor`". Cleared on the
   *  next committed event. */
  wild4Challenge: { by: number; priorColor: UnoColor } | null
  /** How many times the stock has been rebuilt from the discard this round —
   *  the only entropy in a reshuffle, so every client reshuffles identically. */
  reshuffleCount: number
  /** The seed the whole round's deck was shuffled from. */
  deckSeed: number
  /** Per-seat "I have one card left" declaration, cleared when the hand grows. */
  saidUno: boolean[]
  /** Cumulative match scores, parallel to `players` (score mode). */
  scores: number[]
  /** 1-based round counter (always 1 in single-round mode). */
  roundNumber: number
  /** Present to satisfy the shared net contract; UNO rounds end on first-out, so
   *  no seat finishes mid-round — left empty during play. */
  finishedOrder: number[]
  /** The match winner's seat once decided, else null. */
  winnerId: number | null
  winReason: UnoWinReason | null
  /** Committed events since the match started — the online sync sequence number. */
  turnCount: number
  /** The match's rule variant (fixed at START_ROUND, constant across rounds). */
  rules: UnoRules
}

// ---- Wire contract --------------------------------------------------------

/** A penalty draw applied to one seat by an action card or a challenge. */
export interface PenaltyDraw {
  seat: number
  count: number
}

/**
 * The deterministic consequence of a `play`, beyond the cards leaving the hand.
 * Recorded explicitly so every client applies the identical effect (the way
 * Ludo's resolution carries an explicit `tokenId`) without re-deciding anything.
 */
export interface PlayEffect {
  /** A Reverse flipped the direction this play (odd number of Reverses). */
  reversed: boolean
  /** The next seat loses their turn outright — a Skip, or a 2-player Reverse.
   *  (Draw-Two / WD4 do NOT set this: they set `penaltyDraw` and pass the turn
   *  to the next seat, who may stack or draw.) */
  skipped: boolean
  /** The penalty the next seat now faces (Draw-Two / WD4) — the accumulated
   *  `pendingDraw`. They stack a same-type card or draw the total and lose the
   *  turn. */
  penaltyDraw?: PenaltyDraw
  /** Seven-Zero: the seat this player swapped hands with (a `7`). */
  sevenSwapTarget?: number
  /** Seven-Zero: a `0` rotated all hands one seat in `direction`. */
  zeroRotate?: boolean
  /** Seat to move to after this play (already accounts for direction/skip). */
  nextIndex: number
  /** This play emptied the hand — the round is won. */
  isRoundWin: boolean
}

/**
 * The fully-computed outcome of one committed event — the entire over-the-wire
 * contract. Computed once on the acting client (after any local `choosing`) and
 * replayed identically on every other client. A discriminated union: each
 * variant carries everything a pure replay needs.
 */
export type UnoTurnResolution =
  | {
      kind: 'play'
      seat: number
      /** The card(s) played — one, or several identical for multi-play. */
      cards: UnoCard[]
      /** The color chosen for a wild (undefined for non-wild plays). */
      chosenColor?: UnoColor
      /** The player declared UNO as this play left them on one card. */
      declaredUno: boolean
      effect: PlayEffect
    }
  | {
      kind: 'draw'
      seat: number
      /** How many cards were drawn (only the count travels; identities come off
       *  the deterministic stock). A voluntary draw is 1; a penalty is the
       *  accumulated `pendingDraw`. */
      count: number
      /** A card played immediately after a voluntary single draw, else null.
       *  Its turn-order consequences are recomputed deterministically by the
       *  reducer (it re-runs `resolvePlay` on the post-draw hand), so only the
       *  card and chosen color travel. */
      thenPlay?: UnoCard | null
      /** Color chosen if `thenPlay` was a wild. */
      chosenColor?: UnoColor
    }
  | {
      kind: 'challenge'
      seat: number
      /** The seat being challenged (the Wild-Draw-Four player). */
      target: number
      /** True when the bluff was caught (the target held the current color). */
      success: boolean
      /** Who draws and how many: target draws 4 if caught, else challenger draws 6. */
      penalty: PenaltyDraw
      /** Seat to move to after the challenge resolves. */
      nextIndex: number
    }
  | {
      kind: 'callout'
      seat: number
      /** The seat caught sitting on one card without declaring UNO. */
      target: number
      penalty: PenaltyDraw
    }

// ---- Per-seat snapshot payload (the net layer's `S`) ----------------------

/**
 * Per-seat state carried in online snapshots and heartbeats — the `S` payload
 * the generic net layer is parameterised over. The net layer broadcasts this on
 * every `sync-ping` (~4s), so it is **deliberately cheap and hand-free**: a hand
 * here would publish every hand to every client continuously, defeating the
 * UI-hidden secrecy model. Only the count travels for divergence detection; the
 * actual cards live in {@link UnoSharedState}, which rides only on the
 * (infrequent) `sync-state` / `add-player` snapshots.
 */
export interface UnoSeatState {
  handCount: number
  saidUno: boolean
  score: number
}

/**
 * Game-global state carried in the snapshot's `shared` blob (the net layer's
 * opaque payload, sent only on `sync-state` / `add-player`). Everything a late
 * joiner / resyncing client needs to rebuild the full deterministic match —
 * including every seat's actual `hands` (kept here, not in the per-seat `S`, so
 * they never ride the periodic ping).
 */
export interface UnoSharedState {
  hands: UnoCard[][]
  stock: UnoCard[]
  discard: UnoCard[]
  activeColor: UnoColor
  direction: 1 | -1
  pendingDraw: number
  pendingDrawType: 'draw2' | 'wild4' | null
  reshuffleCount: number
  deckSeed: number
  roundNumber: number
  // (The transient `wild4Challenge` window is intentionally not carried — a
  // resync lands outside it, falling back to drawing rather than challenging.)
}
