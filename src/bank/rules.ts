/**
 * The Bank El-Hazz rules engine — pure functions, no side effects, no React.
 * Given the committed game state and the dice, `resolveTurn` returns a fully
 * resolved {@link BankTurnResolution}: an **ordered list of effects** the UI
 * replays as animation and online clients replay identically. This is the
 * testable heart of the game (`rules.test.ts`).
 *
 * Randomness (the luck draw) happens here, once, on the acting client, and the
 * drawn card id is baked into the resolution — exactly like Snakes bakes the
 * mystery target. The reducer never draws, so a resolution replays the same way
 * everywhere.
 */
import { BOARD, DECKS, DIE_FACES, MAX_CARD_CHAIN, MAX_LEVEL, PROPERTY_GROUPS } from './config'
import { forwardSteps, landingTile, passesStart } from './board'
import type {
  BankGameState,
  BankTile,
  BankTurnResolution,
  Card,
  CardDeck,
  DieValue,
  Ownership,
  TurnEffect,
} from './types'

/** Injectable random source so tests can be deterministic (DIP). */
export type Rng = () => number

/** Roll a fair die. Pass a custom `rng` to make the result deterministic. */
export function rollDie(rng: Rng = Math.random): DieValue {
  return (Math.floor(rng() * DIE_FACES) + 1) as DieValue
}

/** Roll the two dice. Bank El-Hazz always moves the sum of two dice. */
export function rollDice(rng: Rng = Math.random): [DieValue, DieValue] {
  return [rollDie(rng), rollDie(rng)]
}

/** Draw one card from a deck (its id is baked into the resolution). */
export function drawCard(deck: CardDeck, rng: Rng = Math.random): Card {
  const cards = DECKS[deck]
  return cards[Math.floor(rng() * cards.length)]
}

/** Rent owed for landing on a property: 0 if mortgaged, else the level's rent. */
export function rentFor(tile: BankTile, entry: Ownership): number {
  if (entry.mortgaged) return 0
  return tile.rentByLevel?.[entry.level] ?? tile.rent ?? 0
}

/** Cost to add one building to `tile` (0 if it can't be improved, e.g. a utility). */
export function houseCost(tile: BankTile): number {
  return tile.houseCost ?? 0
}

/** Cash returned for selling one building back to the bank (half the build cost). */
export function sellRefund(tile: BankTile): number {
  return Math.round((tile.houseCost ?? 0) / 2)
}

/** Cash raised by mortgaging `tile` (half its purchase price). */
export function mortgageValue(tile: BankTile): number {
  return Math.round((tile.price ?? 0) / 2)
}

/** Cash needed to lift a mortgage on `tile` (the principal plus 10% interest). */
export function unmortgageCost(tile: BankTile): number {
  return Math.round(mortgageValue(tile) * 1.1)
}

/**
 * Whether `owner` holds every tile of color `group` (P2 full-set double rent).
 * Pure over the ownership map + the static {@link PROPERTY_GROUPS}; every group
 * has ≥ 2 tiles (enforced by `board.test.ts`).
 */
export function ownsFullGroup(
  owner: number,
  group: string,
  ownership: Record<number, Ownership>,
): boolean {
  const ids = PROPERTY_GROUPS[group]
  if (!ids || ids.length === 0) return false
  return ids.every((id) => ownership[id]?.owner === owner)
}

/** A player's worth: cash plus the price of every property they own. */
export function netWorth(seat: number, state: BankGameState): number {
  let worth = state.players[seat]?.cash ?? 0
  for (const [tileId, entry] of Object.entries(state.ownership)) {
    if (entry.owner === seat) worth += BOARD[Number(tileId)].price ?? 0
  }
  return worth
}

/** Whether a player can pay `amount` in full from cash (no liquidation in P1). */
export function canAfford(seat: number, amount: number, cash: number[]): boolean {
  return cash[seat] >= amount
}

export interface BankTurnContext {
  state: BankGameState
  dice: [DieValue, DieValue]
  /** Random source for the luck draw (injectable for tests). */
  rng?: Rng
  /**
   * P2 jail: how a jailed player is trying to leave this turn. `'roll'` (the
   * default) attempts doubles; `'payFine'` pays the fine then moves; `'useCard'`
   * spends a kept Get-Out-Of-Jail-Free card then moves. Ignored when not jailed.
   */
  jailIntent?: 'roll' | 'payFine' | 'useCard'
}

/**
 * Compute the complete outcome of one roll as an ordered effect list.
 *
 * Order of resolution:
 * 1. Walk the dice total forward (paying the start reward if the path crosses 0).
 * 2. Resolve the landed tile: rent/buy-option (property), tax, reward, jail, or
 *    a luck draw. A luck card can move you, whereupon the **new** tile resolves
 *    too — a bounded chain (`MAX_CARD_CHAIN`) that go-to-jail/go-to-Start cut
 *    short immediately.
 * 3. A buy option is offered iff the *final* tile is an unowned property the
 *    acting player can afford (purchase is a separate, later decision).
 * 4. If a forced payment can't be met in full the actor goes bankrupt (their
 *    properties are released); if that leaves exactly one active player, the win
 *    is recorded in the resolution.
 */
export function resolveTurn(ctx: BankTurnContext): BankTurnResolution {
  const { state, dice } = ctx
  const rng = ctx.rng ?? Math.random
  const seat = state.currentPlayerIndex
  const ownership = state.ownership
  const player = state.players[seat]

  const effects: TurnEffect[] = []
  // Working copies, so chained payments / the jail fine see running totals.
  const cash = state.players.map((p) => p.cash)
  const jailCards = state.players.map((p) => p.jailCards)
  let currentTile = player.position
  let bankrupted = false
  // True once the seat is sent to jail this turn (card / third double): it
  // suppresses both the extra turn and any buy option from the landed tile.
  let wentToJail = false

  const passReward = state.rules.passStartReward
  const wasInJail = player.jailTurns > 0
  const isDoubles = dice[0] === dice[1]
  const doublesEnabled = state.rules.doubles === true

  const isActive = (id: number) => state.players[id]?.status === 'active'

  function bankrupt(): void {
    const releasedTiles = Object.keys(ownership)
      .map(Number)
      .filter((id) => ownership[id].owner === seat)
      .sort((a, b) => a - b)
    effects.push({ kind: 'bankrupt', seat, releasedTiles })
    bankrupted = true
  }

  function moveForward(from: number, steps: number): number {
    const to = landingTile(from, steps)
    const passed = passesStart(from, steps)
    effects.push({ kind: 'move', from, to, path: forwardSteps(from, steps), passedStart: passed })
    if (passed) {
      effects.push({ kind: 'passStart', amount: passReward })
      cash[seat] += passReward
    }
    return to
  }

  function moveBackward(from: number, steps: number): number {
    // Backward moves never pay the start reward, even crossing 0 in reverse.
    const path: number[] = []
    let t = from
    for (let i = 0; i < steps; i++) {
      t = (t - 1 + BOARD.length) % BOARD.length
      path.push(t)
    }
    effects.push({ kind: 'move', from, to: t, path, passedStart: false })
    return t
  }

  function moveToStart(from: number): number {
    const steps = (BOARD.length - (from % BOARD.length)) % BOARD.length
    effects.push({
      kind: 'move',
      from,
      to: 0,
      path: steps > 0 ? forwardSteps(from, steps) : [],
      passedStart: true,
    })
    effects.push({ kind: 'passStart', amount: passReward })
    cash[seat] += passReward
    return 0
  }

  function goToJail(): number {
    effects.push({ kind: 'jail', seat })
    wentToJail = true
    return 30 // the Jail corner
  }

  /** Apply a drawn card's effect. Returns true to keep resolving the new tile. */
  function applyCard(card: Card): boolean {
    const e = card.effect
    switch (e.kind) {
      case 'cash': {
        if (e.amount < 0 && !canAfford(seat, -e.amount, cash)) {
          bankrupt()
          return false
        }
        effects.push({ kind: 'cash', seat, delta: e.amount, reason: 'luck' })
        cash[seat] += e.amount
        return false
      }
      case 'move':
        currentTile = e.steps >= 0 ? moveForward(currentTile, e.steps) : moveBackward(currentTile, -e.steps)
        return true
      case 'moveToStart':
        currentTile = moveToStart(currentTile)
        return false
      case 'jail':
        currentTile = goToJail()
        return false
      case 'collectEach': {
        const froms: number[] = []
        for (const p of state.players) {
          if (p.id === seat || !isActive(p.id)) continue
          if (canAfford(p.id, e.amount, cash)) {
            froms.push(p.id)
            cash[p.id] -= e.amount
            cash[seat] += e.amount
          }
        }
        if (froms.length)
          effects.push({ kind: 'collect', to: seat, froms, amount: e.amount, reason: 'luck-collect-each' })
        return false
      }
      case 'payEach': {
        const others = state.players.filter((p) => p.id !== seat && isActive(p.id))
        const total = e.amount * others.length
        if (!canAfford(seat, total, cash)) {
          bankrupt()
          return false
        }
        for (const p of others) {
          effects.push({ kind: 'pay', from: seat, to: p.id, amount: e.amount, reason: 'luck-pay-each' })
          cash[seat] -= e.amount
          cash[p.id] += e.amount
        }
        return false
      }
      case 'maintenance': {
        const owned = Object.values(ownership).filter((o) => o.owner === seat).length
        const total = e.perProperty * owned
        if (total === 0) return false
        if (!canAfford(seat, total, cash)) {
          bankrupt()
          return false
        }
        effects.push({ kind: 'cash', seat, delta: -total, reason: 'maintenance' })
        cash[seat] -= total
        return false
      }
      case 'getOutFree':
        // Banked as a kept card; spent later to leave jail for free.
        effects.push({ kind: 'grantJailCard', seat })
        jailCards[seat] += 1
        return false
    }
  }

  // 0) A jailed player must first deal with jail (P2 richer jail). They either
  //    pay the fine, spend a kept card, or roll for doubles; a failed roll uses
  //    up an attempt, and the last attempt forces the fine (or bankruptcy).
  let skipMovement = false
  if (wasInJail) {
    const intent = ctx.jailIntent ?? 'roll'
    const fine = state.rules.jailFine
    if (intent === 'useCard' && jailCards[seat] > 0) {
      effects.push({ kind: 'jailRelease', seat, via: 'card' })
      jailCards[seat] -= 1
    } else if (intent === 'payFine') {
      if (!canAfford(seat, fine, cash)) {
        bankrupt()
        skipMovement = true
      } else {
        effects.push({ kind: 'cash', seat, delta: -fine, reason: 'jailFine' })
        cash[seat] -= fine
        effects.push({ kind: 'jailRelease', seat, via: 'fine' })
      }
    } else if (isDoubles) {
      effects.push({ kind: 'jailRelease', seat, via: 'doubles' })
    } else if (player.jailTurns <= 1) {
      // Out of attempts: forced to pay (or go bankrupt), then move the roll.
      if (!canAfford(seat, fine, cash)) {
        bankrupt()
        skipMovement = true
      } else {
        effects.push({ kind: 'cash', seat, delta: -fine, reason: 'jailFine' })
        cash[seat] -= fine
        effects.push({ kind: 'jailRelease', seat, via: 'forced' })
      }
    } else {
      // Still have attempts left: stay in jail, the turn ends here.
      effects.push({ kind: 'jailStay', seat })
      skipMovement = true
    }
  }

  // 1) The dice move (skipped when staying in jail or going bankrupt on a fine).
  //    A non-jail roll of doubles chains an extra turn; the third in a row goes
  //    straight to jail without moving. A held Fast Bus buff doubles the total.
  let usedFastBus = false
  let doublesCount = 0
  let moved = false
  if (!skipMovement) {
    if (!wasInJail && doublesEnabled && isDoubles) doublesCount = state.consecutiveDoubles + 1
    if (doublesCount >= 3) {
      currentTile = goToJail()
    } else {
      usedFastBus = player.fastBus === true
      const total = (dice[0] + dice[1]) * (usedFastBus ? 2 : 1)
      currentTile = moveForward(currentTile, total)
      moved = true
    }
  }

  // 2) Resolve the landed tile, chaining through cards up to the cap (only when
  //    the seat actually moved — a jail stay / third double resolves nothing).
  let cardsUsed = 0
  let resolving = moved
  while (resolving && !bankrupted) {
    const tile = BOARD[currentTile]
    switch (tile.kind) {
      case 'property': {
        const entry = ownership[currentTile]
        if (entry && entry.owner !== seat && !entry.mortgaged && isActive(entry.owner)) {
          let rent = rentFor(tile, entry)
          // Owning the full color group (no upgrades yet) doubles the rent (P2).
          if (
            rent > 0 &&
            entry.level === 0 &&
            tile.group &&
            ownsFullGroup(entry.owner, tile.group, ownership)
          ) {
            rent *= 2
          }
          if (rent > 0) {
            if (!canAfford(seat, rent, cash)) {
              bankrupt()
            } else {
              effects.push({ kind: 'pay', from: seat, to: entry.owner, amount: rent, reason: 'rent' })
              cash[seat] -= rent
              cash[entry.owner] += rent
            }
          }
        }
        resolving = false
        break
      }
      case 'tax': {
        const amt = tile.amount ?? 0
        if (!canAfford(seat, amt, cash)) bankrupt()
        else {
          effects.push({ kind: 'cash', seat, delta: -amt, reason: 'tax' })
          cash[seat] -= amt
        }
        resolving = false
        break
      }
      case 'reward': {
        const amt = tile.amount ?? 0
        effects.push({ kind: 'cash', seat, delta: amt, reason: 'reward' })
        cash[seat] += amt
        resolving = false
        break
      }
      case 'luck':
      case 'court': {
        if (cardsUsed >= MAX_CARD_CHAIN) {
          resolving = false
          break
        }
        cardsUsed++
        const deck = tile.kind // 'luck' | 'court'
        const card = drawCard(deck, rng)
        effects.push({ kind: 'card', deck, cardId: card.id })
        resolving = applyCard(card)
        break
      }
      case 'luckyClub': {
        // The Lucky Club charges a flat entry fee.
        const fee = tile.amount ?? 0
        if (!canAfford(seat, fee, cash)) bankrupt()
        else {
          effects.push({ kind: 'cash', seat, delta: -fee, reason: 'club' })
          cash[seat] -= fee
        }
        resolving = false
        break
      }
      case 'fastbus':
        // Catch the Fast Bus — the seat's next roll will be doubled.
        effects.push({ kind: 'fastBus', seat })
        resolving = false
        break
      default:
        // start / jail (just visiting) — no action.
        resolving = false
    }
  }

  // 3) Buy option from the *final* tile (unowned + affordable; never while
  //    bankrupt this turn, sent to jail, or staying in jail).
  let buyOption: { tile: number; price: number } | null = null
  if (!bankrupted && !wentToJail && !skipMovement) {
    const tile = BOARD[currentTile]
    if (tile.kind === 'property' && ownership[currentTile] == null) {
      const price = tile.price ?? Infinity
      if (canAfford(seat, price, cash)) buyOption = { tile: currentTile, price }
    }
  }

  // 4) Win detection: a bankruptcy that leaves exactly one active player ends it.
  let isWin = false
  let winnerId: number | null = null
  if (bankrupted) {
    const remaining = state.players.filter((p) => p.status === 'active' && p.id !== seat).map((p) => p.id)
    if (remaining.length === 1) {
      isWin = true
      winnerId = remaining[0]
    }
  }

  // 5) Doubles grant another turn — unless it's the third in a row, or the move
  //    finished the game / sent the seat to jail (a jail-origin roll never chains).
  const extraTurn = doublesCount >= 1 && doublesCount < 3 && !wentToJail && !bankrupted && !isWin

  return {
    type: 'roll',
    seat,
    dice,
    usedFastBus,
    effects,
    finalTile: currentTile,
    buyOption,
    isWin,
    winnerId,
    extraTurn,
    doublesCount,
  }
}

/** The committed event for accepting an open buy. */
export function resolveBuyDecision(state: BankGameState): BankTurnResolution {
  const pb = state.pendingBuy
  if (!pb) throw new Error('resolveBuyDecision called with no pending buy')
  return { type: 'decision', seat: pb.seat, tile: pb.tile, action: 'buy', price: pb.price }
}

/** The committed event for declining an open buy. */
export function resolveDecline(state: BankGameState): BankTurnResolution {
  const pb = state.pendingBuy
  if (!pb) throw new Error('resolveDecline called with no pending buy')
  return { type: 'decision', seat: pb.seat, tile: pb.tile, action: 'decline', price: pb.price }
}

/** The committed event for a jailed player skipping their turn. */
export function buildJailSkip(seat: number): BankTurnResolution {
  return { type: 'jailSkip', seat }
}

// ---------------------------------------------------------------------------
// P3 property upgrades + P4 mortgage/trading — pure predicates and builders.
// These produce `manage` / `trade` resolutions (committed during the player's
// idle turn) and are validated here so the reducer can apply them blindly.
// ---------------------------------------------------------------------------

/** The building level of every tile in `group` (absent ⇒ 0). */
function groupLevels(group: string, ownership: Record<number, Ownership>): number[] {
  return (PROPERTY_GROUPS[group] ?? []).map((id) => ownership[id]?.level ?? 0)
}

/**
 * Whether `seat` can add one building to `tile` right now. Requires owning the
 * whole color group (none mortgaged), an un-maxed, unmortgaged tile, the cash for
 * the house, and — like real Monopoly — *even building*: you may only raise a
 * tile that sits at the group's current minimum level.
 */
export function canBuildHouse(state: BankGameState, seat: number, tileId: number): boolean {
  const tile = BOARD[tileId]
  if (tile.kind !== 'property' || tile.houseCost == null || !tile.group) return false
  const entry = state.ownership[tileId]
  if (!entry || entry.owner !== seat || entry.mortgaged || entry.level >= MAX_LEVEL) return false
  if (!ownsFullGroup(seat, tile.group, state.ownership)) return false
  const ids = PROPERTY_GROUPS[tile.group]
  if (ids.some((id) => state.ownership[id]?.mortgaged)) return false
  if (entry.level !== Math.min(...groupLevels(tile.group, state.ownership))) return false
  return (state.players[seat]?.cash ?? 0) >= tile.houseCost
}

/**
 * Whether `seat` can sell one building from `tile`. Even-selling mirrors
 * even-building: you may only sell from a tile at the group's current maximum.
 */
export function canSellHouse(state: BankGameState, seat: number, tileId: number): boolean {
  const tile = BOARD[tileId]
  if (tile.kind !== 'property' || !tile.group) return false
  const entry = state.ownership[tileId]
  if (!entry || entry.owner !== seat || entry.level <= 0) return false
  return entry.level === Math.max(...groupLevels(tile.group, state.ownership))
}

/** Whether `seat` can mortgage `tile` (owns it, unmortgaged, no houses in the group). */
export function canMortgage(state: BankGameState, seat: number, tileId: number): boolean {
  const tile = BOARD[tileId]
  if (tile.kind !== 'property') return false
  const entry = state.ownership[tileId]
  if (!entry || entry.owner !== seat || entry.mortgaged) return false
  if (tile.group && groupLevels(tile.group, state.ownership).some((l) => l > 0)) return false
  return true
}

/** Whether `seat` can lift the mortgage on `tile` (owns it, mortgaged, can afford). */
export function canUnmortgage(state: BankGameState, seat: number, tileId: number): boolean {
  const tile = BOARD[tileId]
  if (tile.kind !== 'property') return false
  const entry = state.ownership[tileId]
  if (!entry || entry.owner !== seat || !entry.mortgaged) return false
  return (state.players[seat]?.cash ?? 0) >= unmortgageCost(tile)
}

/** Build one house/hotel on `tile` (caller must have checked `canBuildHouse`). */
export function buildUpgrade(state: BankGameState, tileId: number): BankTurnResolution {
  const entry = state.ownership[tileId]
  if (!entry) throw new Error('buildUpgrade on an unowned tile')
  return {
    type: 'manage',
    seat: entry.owner,
    effects: [{ kind: 'upgrade', seat: entry.owner, tile: tileId, level: entry.level + 1, cost: houseCost(BOARD[tileId]) }],
  }
}

/** Sell one house/hotel from `tile` (caller must have checked `canSellHouse`). */
export function buildSell(state: BankGameState, tileId: number): BankTurnResolution {
  const entry = state.ownership[tileId]
  if (!entry) throw new Error('buildSell on an unowned tile')
  return {
    type: 'manage',
    seat: entry.owner,
    effects: [{ kind: 'sell', seat: entry.owner, tile: tileId, level: entry.level - 1, refund: sellRefund(BOARD[tileId]) }],
  }
}

/** Mortgage `tile` (caller must have checked `canMortgage`). */
export function buildMortgage(state: BankGameState, tileId: number): BankTurnResolution {
  const entry = state.ownership[tileId]
  if (!entry) throw new Error('buildMortgage on an unowned tile')
  return {
    type: 'manage',
    seat: entry.owner,
    effects: [{ kind: 'mortgage', seat: entry.owner, tile: tileId, amount: mortgageValue(BOARD[tileId]) }],
  }
}

/** Lift the mortgage on `tile` (caller must have checked `canUnmortgage`). */
export function buildUnmortgage(state: BankGameState, tileId: number): BankTurnResolution {
  const entry = state.ownership[tileId]
  if (!entry) throw new Error('buildUnmortgage on an unowned tile')
  return {
    type: 'manage',
    seat: entry.owner,
    effects: [{ kind: 'unmortgage', seat: entry.owner, tile: tileId, cost: unmortgageCost(BOARD[tileId]) }],
  }
}

/** A proposed property/cash swap: `from` gives the give-side, receives the rest. */
export interface TradeOffer {
  from: number
  to: number
  giveTiles: number[]
  giveCash: number
  receiveTiles: number[]
  receiveCash: number
}

/** A tile (and its whole group) is free of buildings, so it can change hands. */
function tradableTile(tileId: number, ownership: Record<number, Ownership>): boolean {
  const tile = BOARD[tileId]
  if (tile.kind !== 'property') return false
  // No property in the group may carry buildings (sell houses before trading).
  if (!tile.group) return (ownership[tileId]?.level ?? 0) === 0
  return groupLevels(tile.group, ownership).every((l) => l === 0)
}

/**
 * Whether `offer` is a legal trade: both players active, each owns (building-free)
 * the tiles they're giving, each holds the cash they're paying, and the swap moves
 * *something*. Mortgaged tiles may be traded (the mortgage rides along).
 */
export function canTrade(state: BankGameState, offer: TradeOffer): boolean {
  const { from, to } = offer
  if (from === to) return false
  const a = state.players[from]
  const b = state.players[to]
  if (!a || !b || a.status !== 'active' || b.status !== 'active') return false
  if (offer.giveCash < 0 || offer.receiveCash < 0) return false
  if (
    offer.giveTiles.length === 0 &&
    offer.receiveTiles.length === 0 &&
    offer.giveCash === 0 &&
    offer.receiveCash === 0
  ) {
    return false
  }
  for (const id of offer.giveTiles) {
    if (state.ownership[id]?.owner !== from || !tradableTile(id, state.ownership)) return false
  }
  for (const id of offer.receiveTiles) {
    if (state.ownership[id]?.owner !== to || !tradableTile(id, state.ownership)) return false
  }
  return a.cash >= offer.giveCash && b.cash >= offer.receiveCash
}

/** Tiles `seat` owns that may currently change hands (no houses in their group). */
export function tradableTilesFor(state: BankGameState, seat: number): number[] {
  return Object.keys(state.ownership)
    .map(Number)
    .filter((id) => state.ownership[id]?.owner === seat && tradableTile(id, state.ownership))
    .sort((a, b) => a - b)
}

/** The committed event for an accepted trade (caller must have checked `canTrade`). */
export function buildTrade(offer: TradeOffer): BankTurnResolution {
  return { type: 'trade', ...offer }
}
