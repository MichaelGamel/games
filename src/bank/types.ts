/**
 * Core domain types for Bank El-Hazz — a simplified, Egyptian-flavoured
 * Monopoly. Pure data shapes: no React, no DOM. Shared by logic, the hook, and
 * the UI, exactly like `src/game/types.ts` does for Snakes.
 */
import type { DieValue } from '../game/types'

export type { DieValue }

/**
 * What a perimeter tile *does* when you land on it.
 * - `start`    — corner 0 (البداية); passing or landing pays the start reward.
 * - `property` — buyable; charges rent to visitors once owned.
 * - `luck`     — draw a حظك (Luck) card (can chain into another tile).
 * - `court`    — draw a محاكمة (Court) card (can chain into another tile).
 * - `choice`   — a "Luck or Court" cell: the player picks which deck to draw.
 * - `tax`       — pay a fixed fee to the bank.
 * - `reward`    — collect a fixed gift from the bank (unused by the current board).
 * - `jail`      — corner 30 (السجن); "just visiting" unless sent here by a card.
 * - `luckyClub` — corner 10 (نادي الحظ); landing pays a flat fee.
 * - `fastbus`   — corner 20 (الأتوبيس السريع); landing doubles your next roll.
 */
export type TileKind =
  | 'start'
  | 'property'
  | 'luck'
  | 'court'
  | 'choice'
  | 'tax'
  | 'reward'
  | 'jail'
  | 'luckyClub'
  | 'fastbus'

/**
 * The display-name keys, mirroring the `bank` namespace's `tiles.` map. Typed
 * as a union (not `string`) so `t(`tiles.${nameKey}`)` stays type-checked — the
 * same trick UNO uses for `colors.${color}`.
 */
export type BankTileNameKey =
  // corners + card labels
  | 'start'
  | 'jail'
  | 'luckyClub'
  | 'fastBus'
  | 'luck'
  | 'court'
  | 'cardChoice'
  // the lone petrol utility
  | 'gasStation'
  // cities (in board order)
  | 'alquds'
  | 'gaza'
  | 'beirut'
  | 'riyadh'
  | 'baghdad'
  | 'benghazi'
  | 'aden'
  | 'bahrain'
  | 'casablanca'
  | 'tunis'
  | 'algiers'
  | 'alexandria'
  | 'aleppo'
  | 'aswan'
  | 'damascus'
  | 'cairo'
  | 'khartoum'
  | 'amman'
  | 'luxor'
  | 'portSaid'
  | 'sanaa'
  | 'kuwait'
  | 'qatar'

/** One perimeter tile. Property fields are present only on property tiles. */
export interface BankTile {
  /** 0-based perimeter index, 0..39. */
  id: number
  kind: TileKind
  /** i18n key under the `bank` namespace's `tiles.` map (display only). */
  nameKey: BankTileNameKey
  /** Color group id (e.g. `'A'`..`'H'`); property tiles only. */
  group?: string
  /** Purchase price; property tiles only. */
  price?: number
  /** Base rent (upgrade level 0); property tiles only. */
  rent?: number
  /** Rent per upgrade level (P3 houses/hotels); index 0 mirrors `rent`. */
  rentByLevel?: number[]
  /** Per-upgrade cost (P3). */
  houseCost?: number
  /** Magnitude (always positive) debited by a tax tile / credited by a reward tile. */
  amount?: number
}

/** The concrete consequence of a drawn card (Luck or Court). */
export type CardEffect =
  /** Bank transaction (positive = gift, negative = fine). */
  | { kind: 'cash'; amount: number }
  /** Relative move (positive = forward, negative = back); may chain. */
  | { kind: 'move'; steps: number }
  /** Jump to Start (tile 0) and collect the pass-start reward. */
  | { kind: 'moveToStart' }
  /** Go straight to jail (no pass-start). */
  | { kind: 'jail' }
  /** Collect `amount` from each other solvent player. */
  | { kind: 'collectEach'; amount: number }
  /** Pay `amount` to each other active player. */
  | { kind: 'payEach'; amount: number }
  /** Pay `perProperty` × (properties you own) to the bank. */
  | { kind: 'maintenance'; perProperty: number }
  /** A kept Get-Out-Of-Jail-Free card (P2): banked, used later to leave jail. */
  | { kind: 'getOutFree' }

/** Which deck a drawn card came from. */
export type CardDeck = 'luck' | 'court'

/** حظك (Luck) card ids (mirroring `bank`'s `cards.luck.` map). */
export type LuckCardId =
  | 'advance3'
  | 'back3'
  | 'gotoStart'
  | 'goToJail'
  | 'dividend'
  | 'fine'
  | 'birthday'
  | 'charity'
  | 'repairs'
  | 'getOutOfJail'

/** محاكمة (Court) card ids (mirroring `bank`'s `cards.court.` map). */
export type CourtCardId =
  | 'guilty'
  | 'courtFine'
  | 'legalFees'
  | 'inheritance'
  | 'settlement'
  | 'bail'
  | 'award'
  | 'audit'

/** Any drawn card id (ids are unique across the two decks). */
export type CardId = LuckCardId | CourtCardId

/** A deck card. The `id` is baked into the resolution so replays agree. */
export interface Card {
  id: CardId
  effect: CardEffect
}

/**
 * Ownership of one property tile. The full shape exists from day one so P3
 * (upgrades → `level`) and P4 (mortgage → `mortgaged`) add zero structural
 * churn. In P1 `level` is always 0 and `mortgaged` always false.
 */
export interface Ownership {
  owner: number
  level: number
  mortgaged: boolean
}

export type PlayerStatus = 'active' | 'bankrupt'

export interface BankPlayer {
  /** Stable 0-based index, also the turn order. */
  id: number
  name: string
  /** Token color as a CSS hex string. */
  color: string
  /** Current tile, 0..39. */
  position: number
  cash: number
  status: PlayerStatus
  /**
   * Escape attempts still owed in jail (0 = free). Set to `JAIL_MAX_TURNS` when
   * sent to jail (P2 richer jail): each failed roll decrements it, and the last
   * attempt forces a fine. Paying / using a card / rolling doubles clears it.
   */
  jailTurns: number
  /** Held Get-Out-Of-Jail-Free cards (P2): spend one to leave jail for free. */
  jailCards: number
  /** Holds a Fast Bus buff — the next roll's total is doubled, then cleared. */
  fastBus: boolean
  /**
   * Computer-controlled (local play only). Carried data, never a rule — the
   * reducer never branches on it. The bot driver arrives in P5; never set in P1.
   */
  isBot: boolean
  botLevel?: 'easy' | 'medium' | 'hard'
}

/**
 * Finite phases of a match.
 * - `setup`    — choosing players
 * - `idle`     — waiting for the current player to roll
 * - `rolling`  — dice tumbling
 * - `moving`   — a token is walking / effects animating
 * - `deciding` — a buy/skip choice is open (local pause, like Ludo `selecting`)
 * - `won`      — the match is over
 */
export type BankPhase = 'setup' | 'idle' | 'rolling' | 'moving' | 'deciding' | 'won'

/** How a match ended. */
export type WinReason = 'lastStanding' | 'forfeit' | 'rounds'

/**
 * The rule variant for one match. Defaults-only in P1; the seam P2 fills in
 * (doubles, jail fine, round cap). Validated by `asBankRules()` on receipt and
 * carried in the `start` payload for P6 so every client plays the same game.
 */
export interface BankRules {
  startCash: number
  passStartReward: number
  /** P2: a roll of doubles grants an extra turn. */
  doubles: boolean
  /** P2: the fee to leave jail. */
  jailFine: number
  /** P2: a round cap for timed games (null = play to last-standing). */
  maxRounds: number | null
}

/**
 * One sub-event of a turn's outcome. A turn resolves to an **ordered** list of
 * these: the reducer applies them in order, the hook animates them in order,
 * and online clients replay them identically. New tile types / rules become new
 * `kind`s without touching the commit/animate pipeline.
 */
export type TurnEffect =
  | { kind: 'move'; from: number; to: number; path: number[]; passedStart: boolean }
  | { kind: 'passStart'; amount: number }
  | {
      kind: 'cash'
      seat: number
      delta: number
      reason: 'tax' | 'reward' | 'luck' | 'maintenance' | 'club' | 'jailFine'
    }
  | { kind: 'pay'; from: number; to: number; amount: number; reason: 'rent' | 'luck-pay-each' }
  | { kind: 'collect'; to: number; froms: number[]; amount: number; reason: 'luck-collect-each' }
  | {
      kind: 'card'
      deck: CardDeck
      cardId: CardId
      /**
       * The drawer's balance immediately before the card's direct cash effect,
       * the signed change, and the balance after — so the confirmation popup can
       * show "You have {before} − {|delta|} → {after}". Optional (mirrors the
       * `extraTurn?`/`doublesCount?` back-compat pattern: pre-popup fixtures omit
       * them); live play always sets them, with `delta: 0` for non-money cards.
       */
      balanceBefore?: number
      delta?: number
      balanceAfter?: number
    }
  | { kind: 'jail'; seat: number }
  /** A jailed seat left jail this turn (P2): how it happened decides the cost. */
  | { kind: 'jailRelease'; seat: number; via: 'fine' | 'card' | 'doubles' | 'forced' }
  /** A failed escape attempt (P2): the seat stays in jail, one attempt fewer. */
  | { kind: 'jailStay'; seat: number }
  /** Drew a Get-Out-Of-Jail-Free card (P2): bank it on the seat. */
  | { kind: 'grantJailCard'; seat: number }
  /** Landed on the Fast Bus — the seat's next roll is doubled. */
  | { kind: 'fastBus'; seat: number }
  /** Built one house/hotel on an owned property (P3): `level` is the new level. */
  | { kind: 'upgrade'; seat: number; tile: number; level: number; cost: number }
  /** Sold one house/hotel back to the bank (P3): `level` is the new level. */
  | { kind: 'sell'; seat: number; tile: number; level: number; refund: number }
  /** Mortgaged a property for cash (P4): `amount` is the cash raised. */
  | { kind: 'mortgage'; seat: number; tile: number; amount: number }
  /** Lifted a mortgage (P4): `cost` is the principal + interest paid. */
  | { kind: 'unmortgage'; seat: number; tile: number; cost: number }
  | { kind: 'bankrupt'; seat: number; releasedTiles: number[] }

/**
 * The over-the-wire contract for one committed event. A discriminated union so
 * a single `COMMIT_TURN` channel + `matchLog` + `recap` handle every case
 * uniformly (no edits to `matchLog.ts`).
 */
export type BankTurnResolution =
  | {
      type: 'roll'
      seat: number
      dice: [DieValue, DieValue]
      /** True when this roll's total was doubled by a held Fast Bus buff. */
      usedFastBus: boolean
      effects: TurnEffect[]
      finalTile: number
      buyOption: { tile: number; price: number } | null
      isWin: boolean
      winnerId: number | null
      /**
       * P2 doubles: this roll grants the seat another turn (rolled doubles, not
       * the third in a row, didn't finish/jail). Optional so pre-P2 fixtures and
       * resolutions stay valid; the reducer treats a missing value as `false`.
       */
      extraTurn?: boolean
      /** P2 doubles: this seat's consecutive-doubles count incl. this roll (0 = none). */
      doublesCount?: number
      /**
       * Set when the roll ended on a "Luck or Court" cell: the turn pauses so the
       * player can pick a deck. The reducer opens a `deciding` choice (like a buy)
       * and the pick commits as a separate `cardDraw` event. Optional/back-compat.
       */
      cardChoice?: { tile: number } | null
    }
  | { type: 'decision'; seat: number; tile: number; action: 'buy' | 'decline'; price: number }
  /**
   * The player's chosen-deck draw on a "Luck or Court" cell — the second half of
   * a turn that paused for {@link cardChoice}. Resolves the drawn card and any
   * chain exactly like a roll's tail (so it carries `effects`, a possible
   * `buyOption`, win detection, and the carried doubles/extra-turn), but moves no
   * dice. Committed through the same channel; the reducer clears `pendingChoice`.
   */
  | {
      type: 'cardDraw'
      seat: number
      deck: CardDeck
      effects: TurnEffect[]
      finalTile: number
      buyOption: { tile: number; price: number } | null
      isWin: boolean
      winnerId: number | null
      extraTurn?: boolean
      doublesCount?: number
    }
  | { type: 'jailSkip'; seat: number }
  /**
   * A property-management action taken during the player's own idle turn (P3/P4):
   * build or sell a house, mortgage or lift a property. The reducer applies the
   * ordered `effects`, bumps the sequence, and — unlike a roll/decision — **keeps
   * the same seat and phase** (the player still has their roll).
   */
  | { type: 'manage'; seat: number; effects: TurnEffect[] }
  /**
   * A completed property/cash trade between two players (P4). Both sides already
   * accepted; the reducer swaps ownership of the listed tiles and the cash. Keeps
   * the current seat (the proposer trades on their own turn).
   */
  | {
      type: 'trade'
      from: number
      to: number
      giveTiles: number[]
      giveCash: number
      receiveTiles: number[]
      receiveCash: number
    }

export interface BankGameState {
  players: BankPlayer[]
  /** Keyed by TILE id → ownership entry. Absent key = unowned. */
  ownership: Record<number, Ownership>
  currentPlayerIndex: number
  phase: BankPhase
  rules: BankRules
  /** The last roll's two dice (empty before the first roll / after a resync). */
  lastDice: DieValue[]
  /** An open buy/skip choice (set while `phase === 'deciding'`). */
  pendingBuy: { seat: number; tile: number; price: number } | null
  /**
   * An open "Luck or Court" deck choice (set while `phase === 'deciding'`, after
   * a roll lands on a `choice` cell). Mutually exclusive with `pendingBuy`; the
   * pick commits as a `cardDraw` event.
   */
  pendingChoice: { seat: number; tile: number } | null
  /** Seats in elimination order → final standings (last out = best of the losers). */
  bankruptedOrder: number[]
  winnerId: number | null
  winReason: WinReason | null
  /**
   * P2 doubles: the current seat's running consecutive-doubles count. Carried so
   * a buy decision taken mid-chain still hands the seat its extra roll, and so a
   * third double sends the seat to jail. Reset to 0 whenever the turn passes on.
   */
  consecutiveDoubles: number
  /**
   * P2 timed mode: completed rotations of the table (starts at 1). When
   * `rules.maxRounds` is set and `round` exceeds it, the richest active player
   * wins (`winReason: 'rounds'`).
   */
  round: number
  /** Committed-event counter; the online sequence number (one step per commit). */
  turnCount: number
}

/** Per-seat wire payload for online snapshots and heartbeats (reserved for P6). */
export interface BankSeatState {
  position: number
  cash: number
  status: PlayerStatus
  jailTurns: number
  jailCards: number
  fastBus: boolean
}
