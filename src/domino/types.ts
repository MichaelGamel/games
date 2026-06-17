/**
 * Core domain types for Dominoes (Draw variant, double-six set). Pure data
 * shapes — no React, no DOM. Shared by logic, hook, and UI. Mirrors
 * `src/uno/types.ts` (UNO) and `src/four/types.ts` (Connect Four).
 *
 * Like UNO, the defining twist versus the board games is **hidden hands over a
 * shuffled boneyard**. Secrecy is achieved by determinism, not a server: the
 * host broadcasts a single `deckSeed`, every client shuffles the identical
 * 28-tile set with `mulberry32`, deals identically, and the UI simply renders
 * only your own hand. No tile identity ever travels except the public tile
 * actually laid; drawn tiles travel only as a *count* (their identities come
 * off the seeded boneyard).
 */
import type { MatchDecision } from '../game/types'

export type { MatchDecision }

// ---- Tiles ----------------------------------------------------------------

/** A pip value on one half of a tile (0..6 for a double-six set). */
export type Pip = 0 | 1 | 2 | 3 | 4 | 5 | 6

/**
 * One physical bone. `id` is a stable, build-order identifier (`d0`..`d27`),
 * deterministic on every client, so a tile is unambiguous through
 * boneyard → hand → line. Stored canonically with `a <= b`; a **double** is
 * `a === b`.
 */
export interface DominoTile {
  id: string
  a: Pip
  b: Pip
}

/** The two open ends of the laid line. */
export type DominoEnd = 'left' | 'right'

// ---- The line / chain -----------------------------------------------------

/**
 * One tile committed to the line, in board order from the left (head) end to
 * the right (tail) end. `flip` records orientation: the tile's "first" pip
 * (the one touching the previous tile / the head) is `flip ? b : a`, and its
 * "second" pip (touching the next tile / the tail) is `flip ? a : b`.
 * `isDouble` is cached for the renderer.
 */
export interface PlacedTile {
  tile: DominoTile
  flip: boolean
  isDouble: boolean
}

/**
 * The laid line. `tiles[0]` is the left/head end, the last entry the
 * right/tail end. `leftEnd`/`rightEnd` are the two open pip values legality
 * consults; both `null` only before the first tile is laid.
 */
export interface DominoLine {
  tiles: PlacedTile[]
  leftEnd: Pip | null
  rightEnd: Pip | null
}

// ---- Players & phases -----------------------------------------------------

/** How a computer player thinks (local play only). */
export type DominoBotLevel = 'easy' | 'smart'

export interface DominoPlayer {
  /** Stable 0-based index, also the seat / turn order. */
  id: number
  name: string
  /** Seat color as a CSS hex string (roster identity). */
  color: string
  /** Computer-controlled (local play only). Carried data, never a rule. */
  isBot: boolean
  botLevel?: DominoBotLevel
}

/**
 * Finite phases of a Dominoes game.
 * - `setup`    — choosing players, no tiles dealt
 * - `idle`     — waiting for the current player to play, draw, or pass
 * - `choosing` — **local-only**: a tile matches both open ends; pick which.
 *                Remote clients skip it — the end is baked into the resolution.
 * - `placing`  — a tile is animating onto the line
 * - `drawing`  — one or more bones sliding from the boneyard into the hand
 * - `won`      — the round (and match) is over
 */
export type DominoPhase = 'setup' | 'idle' | 'choosing' | 'placing' | 'drawing' | 'won'

/** How the round ended. */
export type DominoWinReason = 'empty' | 'blocked' | 'forfeit'

// ---- Game state -----------------------------------------------------------

/**
 * The complete state of a Dominoes match. Hands and boneyard are explicit
 * arrays built identically on every client from `deckSeed`, so the whole
 * hidden-information game stays in sync by replaying only public moves.
 */
export interface DominoGameState {
  phase: DominoPhase
  players: DominoPlayer[]
  /** Each seat's hand, parallel to `players` (hidden in the UI except your own). */
  hands: DominoTile[][]
  /** The draw pile, top = last element (popped on draw). */
  boneyard: DominoTile[]
  line: DominoLine
  currentPlayerIndex: number
  /** The seed the whole round's set was shuffled from. */
  deckSeed: number
  /** Per-seat pip totals at a blocked-board end; `[]` during play. */
  pipCounts: number[]
  /** Seats tied for fewest pips on a blocked board (length > 1 = a tie); `[]` otherwise. */
  blockedTie: number[]
  /** The winner's seat once decided (single round), else `[]` / `null`. */
  finishedOrder: number[]
  winnerId: number | null
  winReason: DominoWinReason | null
  /** Committed events since the match started — the online sync sequence number. */
  turnCount: number
}

// ---- Wire contract --------------------------------------------------------

/**
 * The fully-computed outcome of one committed event — the entire over-the-wire
 * contract. Computed once on the acting client (after any local `choosing`) and
 * replayed identically on every other client. A discriminated union.
 *
 * Drawn tile identities never travel: only `drewBefore` (a count) does, and each
 * client pops the identical bones off its seed-derived boneyard — exactly UNO's
 * `draw.count` trick. A play and any forced draws before it ride in ONE
 * resolution so the whole turn replays atomically.
 */
export type DominoTurnResolution =
  | {
      kind: 'play'
      seat: number
      /** Bones drawn from the boneyard before this play (0 = had a play in hand). */
      drewBefore: number
      /** Which tile was laid (from hand, possibly just-drawn). */
      tileId: string
      /** Which open end it attached to (ignored for the opening tile). */
      end: DominoEnd
      /** Orientation of the placed tile (see {@link PlacedTile}). */
      flip: boolean
      /** This play emptied the hand → the round is won. */
      isWin: boolean
    }
  | {
      kind: 'pass'
      seat: number
      /** Bones drawn (the entire remaining boneyard) before giving up. */
      drewBefore: number
      /** This pass left the board blocked (boneyard empty AND no seat can play). */
      blocks: boolean
      /** Final pip totals per seat (only when `blocks`). */
      pipCounts?: number[]
      /** Winner seat(s) by fewest pips when `blocks` (length > 1 = a tie). */
      blockWinners?: number[]
    }

// ---- Per-seat snapshot payload (the net layer's `S`) ----------------------

/**
 * Per-seat state carried in online snapshots and heartbeats — the `S` payload
 * the generic net layer is parameterised over. Broadcast on every `sync-ping`
 * (~4s), so it is **deliberately cheap and hand-free**: tile count is the
 * divergence signal; the actual tiles live in {@link DominoSharedState}, which
 * rides only on the (infrequent) `sync-state` / `add-player` snapshots.
 */
export interface DominoSeatState {
  tileCount: number
  pipTotal: number
}

/**
 * Game-global state carried in the snapshot's `shared` blob — everything a late
 * joiner / resyncing client needs to rebuild the full deterministic match,
 * including every seat's actual `hands` (kept here, not in the per-seat `S`, so
 * they never ride the periodic ping). Mirrors `UnoSharedState`.
 */
export interface DominoSharedState {
  hands: DominoTile[][]
  boneyard: DominoTile[]
  line: DominoLine
  deckSeed: number
}
