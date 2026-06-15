/**
 * Single source of truth for every Bank El-Hazz tunable: board geometry, the
 * hand-authored 40-tile board, property groups, the luck deck, the token
 * palette, default rules, and all animation timings. Changing the game's feel
 * means editing this file — nothing else hard-codes these values (DRY).
 *
 * Mirrors the role of `src/game/config.ts` (Snakes) and `src/ludo/config.ts`
 * (Ludo), but is a separate file so the games never share mutable tunables.
 */
import type { BankRules, BankTile, BankTileNameKey, Card } from './types'

/**
 * The board is an 11-wide × 8-tall rectangle; its 2·11 + 2·8 − 4 = 34 perimeter
 * cells are the tiles, matching the physical "بنك الحظ" board's landscape shape.
 */
export const BANK_COLS = 11
export const BANK_ROWS = 8
export const BOARD_TILES = 34
export const DIE_FACES = 6

/** Cash every player starts with. */
export const START_CASH = 1500
/** Paid each time a player passes or lands on Start (tile 0). */
export const PASS_START_REWARD = 200
/** Fee to leave jail (P2 richer jail). */
export const JAIL_FINE = 50
/**
 * How many escape attempts a jailed player gets before they are forced to pay
 * the fine (P2). Set on `jailTurns` when a player is sent to jail; each failed
 * roll decrements it, and the last attempt forces the fine (or bankruptcy).
 */
export const JAIL_MAX_TURNS = 3
/**
 * How many cards (Luck or Court) may fire in a single turn before we stop
 * resolving the final tile's action. Bounds the chain so `+3 → +3 → …` can't loop.
 */
export const MAX_CARD_CHAIN = 2

/** Selectable starting-cash amounts in the setup rules picker (P2). */
export const START_CASH_OPTIONS = [1000, 1500, 2000] as const
/** Selectable pass-Start rewards in the setup rules picker (P2). */
export const PASS_START_OPTIONS = [100, 200, 300] as const
/** Selectable round caps for timed mode in the setup rules picker (P2). */
export const MAX_ROUNDS_OPTIONS = [10, 20, 30] as const
/** Selectable dice-per-roll counts. One die is the default (no doubles). */
export const DICE_COUNT_OPTIONS = [1, 2] as const

/**
 * Building levels (P3 upgrades): 0 = bare lot, 1–3 = houses, 4 = a hotel. Stored
 * on each `Ownership.level`; capped by {@link MAX_LEVEL}.
 */
export const MAX_LEVEL = 4
/**
 * Rent multiplier per building level (index = level). Level 0 is the printed
 * base rent; each house roughly multiplies it. `property()` derives a tile's
 * `rentByLevel` from this and its base rent so the two never drift.
 */
export const RENT_MULTIPLIERS: readonly number[] = [1, 5, 15, 40, 60]

// ---------------------------------------------------------------------------
// The board, matching the physical "بنك الحظ" board (the user's photo). It is a
// landscape 11×8 rectangle whose 34 perimeter cells are the tiles. Corners are
// fixed at 0/7/17/24 (Start / Lucky Club / Fast Bus / Jail). 24 property tiles
// (23 cities in color bands + البنزينة as the lone utility) sit between 6 card
// cells (3 حظك Luck + 3 محاكمة Court) — there is no Income/Sales Tax. Prices and
// names are the real board's; rent ≈ price/10. `board.test.ts` asserts the
// invariants (counts, corner kinds, color groups ≥ 2) so values can move freely.
// ---------------------------------------------------------------------------

const property = (
  id: number,
  nameKey: BankTileNameKey,
  group: string,
  price: number,
  rent: number,
): BankTile => {
  const base: BankTile = { id, kind: 'property', nameKey, group, price, rent }
  // Utilities (group `U`) can never be improved — no houses, no hotel, so they
  // carry neither a per-level rent table nor a house cost (P3).
  if (group === 'U') return base
  return {
    ...base,
    rentByLevel: RENT_MULTIPLIERS.map((m) => rent * m),
    houseCost: Math.round(price / 2 / 10) * 10,
  }
}

/**
 * The 34-tile board. Start (البداية) is bottom-left (index 0); play runs
 * clockwise: up the left edge, across the top, down the right edge, then back
 * along the bottom. Corners: 0 Start, 7 Lucky Club (نادي الحظ), 17 Fast Bus
 * (الأتوبيس السريع), 24 Jail (سجن الحظ). Two card kinds — `luck` (حظك) and
 * `court` (محاكمة) — draw from their own decks. Money is in Egyptian pounds.
 * Color groups `A`–`J` (cities) + `U` (the single petrol utility); each color
 * group has ≥ 2 tiles, adjacent cities sharing a band as on the photo.
 */
export const BOARD: readonly BankTile[] = [
  { id: 0, kind: 'start', nameKey: 'start' },
  // left edge (bottom → top): 0 Start … 7 Lucky Club
  property(1, 'alquds', 'B', 90, 9),
  property(2, 'gaza', 'B', 250, 25),
  // A "Luck or Court" cell — the player chooses which deck to draw from.
  { id: 3, kind: 'choice', nameKey: 'cardChoice' },
  property(4, 'beirut', 'A', 300, 30),
  property(5, 'riyadh', 'A', 250, 25),
  property(6, 'baghdad', 'A', 250, 25),
  { id: 7, kind: 'luckyClub', nameKey: 'luckyClub', amount: 30 },
  // top edge (left → right): 7 Lucky Club … 17 Fast Bus
  property(8, 'benghazi', 'C', 150, 15),
  property(9, 'aden', 'C', 100, 10),
  { id: 10, kind: 'court', nameKey: 'court' },
  property(11, 'bahrain', 'D', 300, 30),
  { id: 12, kind: 'luck', nameKey: 'luck' },
  property(13, 'casablanca', 'D', 250, 25),
  property(14, 'tunis', 'E', 200, 20),
  property(15, 'gasStation', 'U', 300, 30),
  property(16, 'algiers', 'E', 300, 30),
  { id: 17, kind: 'fastbus', nameKey: 'fastBus' },
  // right edge (top → bottom): 17 Fast Bus … 24 Jail
  property(18, 'alexandria', 'F', 325, 33),
  property(19, 'aleppo', 'F', 300, 30),
  { id: 20, kind: 'court', nameKey: 'court' },
  property(21, 'aswan', 'G', 200, 20),
  property(22, 'damascus', 'G', 350, 35),
  property(23, 'cairo', 'G', 450, 45),
  { id: 24, kind: 'jail', nameKey: 'jail' },
  // bottom edge (right → left, approaching Start): 24 Jail … 0 Start
  property(25, 'khartoum', 'H', 200, 20),
  property(26, 'amman', 'H', 250, 25),
  property(27, 'luxor', 'I', 200, 20),
  property(28, 'portSaid', 'I', 200, 20),
  { id: 29, kind: 'luck', nameKey: 'luck' },
  property(30, 'sanaa', 'J', 250, 25),
  { id: 31, kind: 'court', nameKey: 'court' },
  property(32, 'kuwait', 'J', 250, 25),
  property(33, 'qatar', 'J', 150, 15),
]

/** Index of the Jail corner (سجن الحظ), derived so callers never hard-code it. */
export const JAIL_TILE = BOARD.findIndex((t) => t.kind === 'jail')

/**
 * Property groups (color set → tile ids), derived from {@link BOARD} so the two
 * can never drift. Used for full-group double rent in P2; each group has ≥ 2
 * tiles (asserted by `board.test.ts`).
 */
export const PROPERTY_GROUPS: Readonly<Record<string, number[]>> = (() => {
  const groups: Record<string, number[]> = {}
  for (const tile of BOARD) {
    if (tile.kind === 'property' && tile.group) (groups[tile.group] ??= []).push(tile.id)
  }
  return groups
})()

/**
 * The حظك (Luck) deck. Drawn once on the acting client; the chosen card's `id`
 * is baked into the resolution so every client replays the same draw (P6-ready).
 * A mix that exercises every effect kind — including a forward move that can
 * chain into the next tile, go-to-jail, go-to-Start, pay/collect-each, and
 * per-property maintenance.
 */
export const LUCK_DECK: readonly Card[] = [
  { id: 'advance3', effect: { kind: 'move', steps: 3 } },
  { id: 'back3', effect: { kind: 'move', steps: -3 } },
  { id: 'gotoStart', effect: { kind: 'moveToStart' } },
  { id: 'goToJail', effect: { kind: 'jail' } },
  { id: 'dividend', effect: { kind: 'cash', amount: 150 } },
  { id: 'fine', effect: { kind: 'cash', amount: -100 } },
  { id: 'birthday', effect: { kind: 'collectEach', amount: 50 } },
  { id: 'charity', effect: { kind: 'payEach', amount: 40 } },
  { id: 'repairs', effect: { kind: 'maintenance', perProperty: 40 } },
  { id: 'getOutOfJail', effect: { kind: 'getOutFree' } },
]

/**
 * The محاكمة (Court) deck — legal/justice-themed. Same effect vocabulary as Luck,
 * with its own card ids so a `card` effect's `(deck, cardId)` is unambiguous.
 */
export const COURT_DECK: readonly Card[] = [
  { id: 'guilty', effect: { kind: 'jail' } },
  { id: 'courtFine', effect: { kind: 'cash', amount: -150 } },
  { id: 'legalFees', effect: { kind: 'maintenance', perProperty: 25 } },
  { id: 'inheritance', effect: { kind: 'cash', amount: 200 } },
  { id: 'settlement', effect: { kind: 'collectEach', amount: 50 } },
  { id: 'bail', effect: { kind: 'cash', amount: -50 } },
  { id: 'award', effect: { kind: 'cash', amount: 100 } },
  { id: 'audit', effect: { kind: 'payEach', amount: 30 } },
]

/** Look up a deck by name. */
export const DECKS = { luck: LUCK_DECK, court: COURT_DECK } as const

/**
 * Display color for each property group's band on the board (board art, not game
 * logic), matched to the physical board's color bands. `U` is the lone petrol
 * utility (البنزينة), painted slate so it reads apart from the city bands.
 */
export const GROUP_COLORS: Readonly<Record<string, string>> = {
  A: '#b91c1c', // red    (Beirut / Riyadh / Baghdad)
  B: '#0f766e', // teal   (Jerusalem / Gaza)
  C: '#c2410c', // orange (Benghazi / Aden)
  D: '#6d28d9', // violet (Bahrain / Casablanca)
  E: '#15803d', // green  (Tunis / Algiers)
  F: '#1d4ed8', // blue   (Alexandria / Aleppo)
  G: '#b45309', // amber  (Aswan / Damascus / Cairo)
  H: '#be185d', // magenta(Khartoum / Amman)
  I: '#0891b2', // cyan   (Luxor / Port Said)
  J: '#7e22ce', // purple (Sanaa / Kuwait / Qatar)
  U: '#475569', // slate  (petrol utility)
}

export interface ColorOption {
  name: string
  value: string
}

/** Selectable token colors — one per seat. */
export const BANK_COLORS: readonly ColorOption[] = [
  { name: 'Gold', value: '#f59e0b' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Lapis', value: '#3b82f6' },
  { name: 'Garnet', value: '#ef4444' },
]

export interface PlayerPreset {
  name: string
  color: string
}

export const DEFAULT_BANK_PLAYERS: readonly PlayerPreset[] = [
  { name: 'Player 1', color: BANK_COLORS[0].value },
  { name: 'Player 2', color: BANK_COLORS[1].value },
]

/** The canonical game: one die, classic cash + reward, doubles on (for two
 *  dice), last-player-standing. */
export const DEFAULT_BANK_RULES: Readonly<BankRules> = {
  startCash: START_CASH,
  passStartReward: PASS_START_REWARD,
  diceCount: 1,
  doubles: true,
  jailFine: JAIL_FINE,
  maxRounds: null,
}

/**
 * Validate a rules payload that arrived over the wire (or default it). A
 * malformed payload must never crash the reducer — fall back to the classic
 * game. Defaults-only in P1; the seam P2 leans on.
 */
export function asBankRules(value: unknown): BankRules {
  if (typeof value !== 'object' || value == null) return { ...DEFAULT_BANK_RULES }
  const v = value as Partial<BankRules>
  return {
    startCash: typeof v.startCash === 'number' && v.startCash > 0 ? v.startCash : START_CASH,
    passStartReward:
      typeof v.passStartReward === 'number' && v.passStartReward >= 0
        ? v.passStartReward
        : PASS_START_REWARD,
    diceCount: v.diceCount === 2 ? 2 : 1,
    doubles: v.doubles === true,
    jailFine: typeof v.jailFine === 'number' && v.jailFine >= 0 ? v.jailFine : JAIL_FINE,
    maxRounds: typeof v.maxRounds === 'number' && v.maxRounds > 0 ? v.maxRounds : null,
  }
}

/** All animation timings (ms) in one place so motion stays in sync. */
export const TIMING = {
  /** Dice tumble before the cube settles on a face. */
  diceRollMs: 900,
  /** Time a token spends hopping one tile. */
  stepMs: 180,
  /** A cash gain/loss number flashing on a player. */
  cashBeatMs: 520,
  /** A drawn luck card staying revealed before its effect resolves. */
  luckRevealMs: 1500,
  /** Going-to-jail clang + gate pause. */
  jailMs: 700,
  /** A bankruptcy's descending fade. */
  bankruptMs: 900,
  /** Pause before handing the turn to the next player. */
  turnHandoffMs: 420,
  /** Short handoff used when a jailed player skips their turn. */
  skipHandoffMs: 700,
  /** "Thinking" pause before a computer player acts (reserved for P5). */
  botThinkMs: 650,
} as const
