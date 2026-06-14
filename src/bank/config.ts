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

/** The board is an 11×11 grid; its 4·11−4 = 40 perimeter cells are the tiles. */
export const BANK_GRID = 11
export const BOARD_TILES = 40
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
// The board. Corners are fixed at 0/10/20/30 (Start / Jail / Free-Parking /
// Go-To-Jail) — the classic Monopoly layout. 23 properties span 8 color groups
// (seven of 3, one of 2), with 5 luck, 3 tax, and 5 reward tiles between them.
// Egyptian names are placeholders, tuned in Phase 7. `board.test.ts` asserts
// the invariants (counts, corner kinds, groups ≥ 2) so values can move freely.
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
 * The board, matching the physical "بنك الحظا" board (best-effort transcription
 * of the user's photo — correct names/prices/colors here). Start (البداية) is
 * bottom-left (index 0); play runs clockwise. Corners: 0 Start, 10 Go-To-Jail
 * (اذهب إلى السجن), 20 Free Parking (استراحة), 30 Jail (السجن). Two card kinds —
 * `luck` (حظك) and `court` (محاكمة) — draw from their own decks. Money is in
 * Egyptian pounds. Eight color groups (`A`–`G` cities + `U` utilities), each ≥ 2.
 */
export const BOARD: readonly BankTile[] = [
  { id: 0, kind: 'start', nameKey: 'start' },
  // left edge (bottom → top)
  property(1, 'suezCanal', 'U', 200, 20),
  { id: 2, kind: 'court', nameKey: 'court' },
  property(3, 'damascus', 'A', 100, 10),
  { id: 4, kind: 'tax', nameKey: 'incomeTax', amount: 100 },
  property(5, 'beirut', 'A', 100, 10),
  { id: 6, kind: 'luck', nameKey: 'luck' },
  property(7, 'baghdad', 'A', 120, 12),
  property(8, 'banqueMisr', 'U', 200, 20),
  property(9, 'tripoli', 'B', 120, 12),
  { id: 10, kind: 'luckyClub', nameKey: 'luckyClub', amount: 30 },
  // top edge (left → right)
  property(11, 'tunis', 'B', 140, 14),
  { id: 12, kind: 'court', nameKey: 'court' },
  property(13, 'algiers', 'B', 140, 14),
  property(14, 'petrolStation', 'U', 150, 15),
  property(15, 'rabat', 'C', 160, 16),
  { id: 16, kind: 'luck', nameKey: 'luck' },
  property(17, 'casablanca', 'C', 160, 16),
  { id: 18, kind: 'tax', nameKey: 'salesTax', amount: 75 },
  property(19, 'mecca', 'C', 180, 18),
  { id: 20, kind: 'fastbus', nameKey: 'fastBus' },
  // right edge (top → bottom)
  property(21, 'alexandria', 'D', 250, 25),
  { id: 22, kind: 'court', nameKey: 'court' },
  property(23, 'aleppo', 'D', 200, 20),
  property(24, 'aswan', 'E', 250, 25),
  property(25, 'cairoHospital', 'U', 50, 5),
  { id: 26, kind: 'luck', nameKey: 'luck' },
  property(27, 'medina', 'E', 220, 22),
  property(28, 'jeddah', 'E', 240, 24),
  property(29, 'riyadh', 'E', 260, 26),
  { id: 30, kind: 'jail', nameKey: 'jail' },
  // bottom edge (right → left, approaching Start)
  property(31, 'khartoum', 'F', 200, 20),
  property(32, 'amman', 'F', 250, 25),
  property(33, 'luxor', 'F', 200, 20),
  property(34, 'portSaid', 'F', 250, 25),
  { id: 35, kind: 'luck', nameKey: 'luck' },
  property(36, 'sanaa', 'G', 250, 25),
  { id: 37, kind: 'court', nameKey: 'court' },
  property(38, 'kuwait', 'G', 250, 25),
  property(39, 'qatar', 'G', 150, 15),
]

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
 * Display color for each property group's stripe on the board (board art, not
 * game logic), matched to the physical board's palette. `U` is the utilities
 * group (Suez Canal, Banque Misr, petrol station, hospital).
 */
export const GROUP_COLORS: Readonly<Record<string, string>> = {
  A: '#db2777', // pink (Damascus/Beirut/Baghdad)
  B: '#ea580c', // orange (Tripoli/Tunis/Algiers)
  C: '#ca8a04', // gold (Rabat/Casablanca/Mecca)
  D: '#7f1d1d', // maroon (Alexandria/Aleppo)
  E: '#15803d', // green (Aswan/Medina/Jeddah/Riyadh)
  F: '#0891b2', // cyan (Khartoum/Amman/Luxor/Port Said)
  G: '#dc2626', // red (Sanaa/Kuwait/Qatar)
  U: '#64748b', // slate (utilities)
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

/** The canonical game: classic cash + reward, doubles on, last-player-standing. */
export const DEFAULT_BANK_RULES: Readonly<BankRules> = {
  startCash: START_CASH,
  passStartReward: PASS_START_REWARD,
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
