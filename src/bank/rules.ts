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
import { BOARD, DECKS, DIE_FACES, JAIL_TILE, MAX_CARD_CHAIN, MAX_LEVEL, PROPERTY_GROUPS } from './config'
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
/**
 * Mutable working state for a turn's tail — the chain → buy → win logic shared
 * by {@link resolveTurn} (after the dice move) and {@link resolveCardDraw} (after
 * a "Luck or Court" deck pick). The helpers below mutate it in place.
 */
interface TurnWork {
  state: BankGameState
  seat: number
  passReward: number
  rng: Rng
  /** Working cash/jail-card copies, so chained transactions see running totals. */
  cash: number[]
  jailCards: number[]
  effects: TurnEffect[]
  currentTile: number
  bankrupted: boolean
  /** Sent to jail this turn (card / third double): suppresses buy + extra turn. */
  wentToJail: boolean
  /** Landed/chained onto a `choice` cell and paused for a deck pick (else null). */
  choiceTile: number | null
  cardsUsed: number
}

const activeIn = (state: BankGameState, id: number): boolean => state.players[id]?.status === 'active'

function workBankrupt(w: TurnWork): void {
  const releasedTiles = Object.keys(w.state.ownership)
    .map(Number)
    .filter((id) => w.state.ownership[id].owner === w.seat)
    .sort((a, b) => a - b)
  w.effects.push({ kind: 'bankrupt', seat: w.seat, releasedTiles })
  w.bankrupted = true
}

function workMoveForward(w: TurnWork, from: number, steps: number): number {
  const to = landingTile(from, steps)
  const passed = passesStart(from, steps)
  w.effects.push({ kind: 'move', from, to, path: forwardSteps(from, steps), passedStart: passed })
  if (passed) {
    w.effects.push({ kind: 'passStart', amount: w.passReward })
    w.cash[w.seat] += w.passReward
  }
  return to
}

function workMoveBackward(w: TurnWork, from: number, steps: number): number {
  // Backward moves never pay the start reward, even crossing 0 in reverse.
  const path: number[] = []
  let t = from
  for (let i = 0; i < steps; i++) {
    t = (t - 1 + BOARD.length) % BOARD.length
    path.push(t)
  }
  w.effects.push({ kind: 'move', from, to: t, path, passedStart: false })
  return t
}

function workMoveToStart(w: TurnWork, from: number): number {
  const steps = (BOARD.length - (from % BOARD.length)) % BOARD.length
  w.effects.push({
    kind: 'move',
    from,
    to: 0,
    path: steps > 0 ? forwardSteps(from, steps) : [],
    passedStart: true,
  })
  w.effects.push({ kind: 'passStart', amount: w.passReward })
  w.cash[w.seat] += w.passReward
  return 0
}

function workGoToJail(w: TurnWork): number {
  w.effects.push({ kind: 'jail', seat: w.seat })
  w.wentToJail = true
  return JAIL_TILE // the Jail corner (سجن الحظ)
}

/** Apply a drawn card's effect to `w`. Returns true to keep resolving the new tile. */
function workApplyCard(w: TurnWork, card: Card): boolean {
  const e = card.effect
  const seat = w.seat
  switch (e.kind) {
    case 'cash': {
      if (e.amount < 0 && !canAfford(seat, -e.amount, w.cash)) {
        workBankrupt(w)
        return false
      }
      w.effects.push({ kind: 'cash', seat, delta: e.amount, reason: 'luck' })
      w.cash[seat] += e.amount
      return false
    }
    case 'move':
      w.currentTile =
        e.steps >= 0 ? workMoveForward(w, w.currentTile, e.steps) : workMoveBackward(w, w.currentTile, -e.steps)
      return true
    case 'moveToStart':
      w.currentTile = workMoveToStart(w, w.currentTile)
      return false
    case 'jail':
      w.currentTile = workGoToJail(w)
      return false
    case 'collectEach': {
      const froms: number[] = []
      for (const p of w.state.players) {
        if (p.id === seat || !activeIn(w.state, p.id)) continue
        if (canAfford(p.id, e.amount, w.cash)) {
          froms.push(p.id)
          w.cash[p.id] -= e.amount
          w.cash[seat] += e.amount
        }
      }
      if (froms.length)
        w.effects.push({ kind: 'collect', to: seat, froms, amount: e.amount, reason: 'luck-collect-each' })
      return false
    }
    case 'payEach': {
      const others = w.state.players.filter((p) => p.id !== seat && activeIn(w.state, p.id))
      const total = e.amount * others.length
      if (!canAfford(seat, total, w.cash)) {
        workBankrupt(w)
        return false
      }
      for (const p of others) {
        w.effects.push({ kind: 'pay', from: seat, to: p.id, amount: e.amount, reason: 'luck-pay-each' })
        w.cash[seat] -= e.amount
        w.cash[p.id] += e.amount
      }
      return false
    }
    case 'maintenance': {
      const owned = Object.values(w.state.ownership).filter((o) => o.owner === seat).length
      const total = e.perProperty * owned
      if (total === 0) return false
      if (!canAfford(seat, total, w.cash)) {
        workBankrupt(w)
        return false
      }
      w.effects.push({ kind: 'cash', seat, delta: -total, reason: 'maintenance' })
      w.cash[seat] -= total
      return false
    }
    case 'getOutFree':
      // Banked as a kept card; spent later to leave jail for free.
      w.effects.push({ kind: 'grantJailCard', seat })
      w.jailCards[seat] += 1
      return false
  }
}

/**
 * Draw one card from `deck`, emit the calculation-stamped marker, and apply it.
 * The marker carries the drawer's running balance around the card (so the popup
 * can show before/±/after), back-filled once the direct debit/credit has run.
 */
function workDrawCard(w: TurnWork, deck: CardDeck): boolean {
  const card = drawCard(deck, w.rng)
  const before = w.cash[w.seat]
  const cardEffect: Extract<TurnEffect, { kind: 'card' }> = {
    kind: 'card',
    deck,
    cardId: card.id,
    balanceBefore: before,
    delta: 0,
    balanceAfter: before,
  }
  w.effects.push(cardEffect)
  const keep = workApplyCard(w, card)
  cardEffect.delta = w.cash[w.seat] - before
  cardEffect.balanceAfter = w.cash[w.seat]
  return keep
}

/**
 * Resolve the landed tile and chain through cards up to {@link MAX_CARD_CHAIN}.
 * A `choice` cell pauses the turn (records `choiceTile`) so the player can pick a
 * deck — unless `forcedDeck` pre-decides the *first* one (the resume after a
 * pick). Mutates `w`.
 */
function resolveChain(w: TurnWork, startResolving: boolean, forcedDeck?: CardDeck): void {
  let resolving = startResolving
  let forcedUsed = false
  while (resolving && !w.bankrupted) {
    const tile = BOARD[w.currentTile]
    switch (tile.kind) {
      case 'property': {
        const entry = w.state.ownership[w.currentTile]
        if (entry && entry.owner !== w.seat && !entry.mortgaged && activeIn(w.state, entry.owner)) {
          let rent = rentFor(tile, entry)
          // Owning the full color group (no upgrades yet) doubles the rent (P2).
          if (
            rent > 0 &&
            entry.level === 0 &&
            tile.group &&
            ownsFullGroup(entry.owner, tile.group, w.state.ownership)
          ) {
            rent *= 2
          }
          if (rent > 0) {
            if (!canAfford(w.seat, rent, w.cash)) {
              workBankrupt(w)
            } else {
              w.effects.push({ kind: 'pay', from: w.seat, to: entry.owner, amount: rent, reason: 'rent' })
              w.cash[w.seat] -= rent
              w.cash[entry.owner] += rent
            }
          }
        }
        resolving = false
        break
      }
      case 'tax': {
        const amt = tile.amount ?? 0
        if (!canAfford(w.seat, amt, w.cash)) workBankrupt(w)
        else {
          w.effects.push({ kind: 'cash', seat: w.seat, delta: -amt, reason: 'tax' })
          w.cash[w.seat] -= amt
        }
        resolving = false
        break
      }
      case 'reward': {
        const amt = tile.amount ?? 0
        w.effects.push({ kind: 'cash', seat: w.seat, delta: amt, reason: 'reward' })
        w.cash[w.seat] += amt
        resolving = false
        break
      }
      case 'luck':
      case 'court': {
        if (w.cardsUsed >= MAX_CARD_CHAIN) {
          resolving = false
          break
        }
        w.cardsUsed++
        resolving = workDrawCard(w, tile.kind)
        break
      }
      case 'choice': {
        if (forcedDeck && !forcedUsed) {
          // The resume after a deck pick: draw the first card from the chosen deck.
          forcedUsed = true
          if (w.cardsUsed >= MAX_CARD_CHAIN) {
            resolving = false
            break
          }
          w.cardsUsed++
          resolving = workDrawCard(w, forcedDeck)
        } else {
          // Pause for the player's Luck-or-Court pick (resolved as a `cardDraw`).
          w.choiceTile = w.currentTile
          resolving = false
        }
        break
      }
      case 'luckyClub': {
        // The Lucky Club charges a flat entry fee.
        const fee = tile.amount ?? 0
        if (!canAfford(w.seat, fee, w.cash)) workBankrupt(w)
        else {
          w.effects.push({ kind: 'cash', seat: w.seat, delta: -fee, reason: 'club' })
          w.cash[w.seat] -= fee
        }
        resolving = false
        break
      }
      case 'fastbus':
        // Catch the Fast Bus — the seat's next roll will be doubled.
        w.effects.push({ kind: 'fastBus', seat: w.seat })
        resolving = false
        break
      default:
        // start / jail (just visiting) — no action.
        resolving = false
    }
  }
}

/** Buy option from the final tile (unowned + affordable; never while paused/out). */
function computeBuyOption(w: TurnWork): { tile: number; price: number } | null {
  if (w.bankrupted || w.wentToJail || w.choiceTile != null) return null
  const tile = BOARD[w.currentTile]
  if (tile.kind === 'property' && w.state.ownership[w.currentTile] == null) {
    const price = tile.price ?? Infinity
    if (canAfford(w.seat, price, w.cash)) return { tile: w.currentTile, price }
  }
  return null
}

/** A bankruptcy that leaves exactly one active player ends the match. */
function computeWin(w: TurnWork): { isWin: boolean; winnerId: number | null } {
  if (!w.bankrupted) return { isWin: false, winnerId: null }
  const remaining = w.state.players.filter((p) => p.status === 'active' && p.id !== w.seat).map((p) => p.id)
  return remaining.length === 1 ? { isWin: true, winnerId: remaining[0] } : { isWin: false, winnerId: null }
}

/** Fresh working state for `seat`, standing on its current tile. */
function newWork(state: BankGameState, rng: Rng): TurnWork {
  const seat = state.currentPlayerIndex
  return {
    state,
    seat,
    passReward: state.rules.passStartReward,
    rng,
    cash: state.players.map((p) => p.cash),
    jailCards: state.players.map((p) => p.jailCards),
    effects: [],
    currentTile: state.players[seat].position,
    bankrupted: false,
    wentToJail: false,
    choiceTile: null,
    cardsUsed: 0,
  }
}

export function resolveTurn(ctx: BankTurnContext): BankTurnResolution {
  const { state, dice } = ctx
  const rng = ctx.rng ?? Math.random
  const seat = state.currentPlayerIndex
  const player = state.players[seat]
  const w = newWork(state, rng)

  const wasInJail = player.jailTurns > 0
  const isDoubles = dice[0] === dice[1]
  const doublesEnabled = state.rules.doubles === true

  // 0) A jailed player must first deal with jail (P2 richer jail). They either
  //    pay the fine, spend a kept card, or roll for doubles; a failed roll uses
  //    up an attempt, and the last attempt forces the fine (or bankruptcy).
  let skipMovement = false
  if (wasInJail) {
    const intent = ctx.jailIntent ?? 'roll'
    const fine = state.rules.jailFine
    if (intent === 'useCard' && w.jailCards[seat] > 0) {
      w.effects.push({ kind: 'jailRelease', seat, via: 'card' })
      w.jailCards[seat] -= 1
    } else if (intent === 'payFine') {
      if (!canAfford(seat, fine, w.cash)) {
        workBankrupt(w)
        skipMovement = true
      } else {
        w.effects.push({ kind: 'cash', seat, delta: -fine, reason: 'jailFine' })
        w.cash[seat] -= fine
        w.effects.push({ kind: 'jailRelease', seat, via: 'fine' })
      }
    } else if (isDoubles) {
      w.effects.push({ kind: 'jailRelease', seat, via: 'doubles' })
    } else if (player.jailTurns <= 1) {
      // Out of attempts: forced to pay (or go bankrupt), then move the roll.
      if (!canAfford(seat, fine, w.cash)) {
        workBankrupt(w)
        skipMovement = true
      } else {
        w.effects.push({ kind: 'cash', seat, delta: -fine, reason: 'jailFine' })
        w.cash[seat] -= fine
        w.effects.push({ kind: 'jailRelease', seat, via: 'forced' })
      }
    } else {
      // Still have attempts left: stay in jail, the turn ends here.
      w.effects.push({ kind: 'jailStay', seat })
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
      w.currentTile = workGoToJail(w)
    } else {
      usedFastBus = player.fastBus === true
      const total = (dice[0] + dice[1]) * (usedFastBus ? 2 : 1)
      w.currentTile = workMoveForward(w, w.currentTile, total)
      moved = true
    }
  }

  // 2) Resolve the landed tile, chaining through cards (only when the seat moved
  //    — a jail stay / third double resolves nothing). A `choice` cell pauses.
  resolveChain(w, moved)

  const buyOption = computeBuyOption(w)
  const { isWin, winnerId } = computeWin(w)

  // Doubles grant another turn — unless the third in a row, or the move finished
  // the game / went to jail. A choice-pause keeps the chain alive in the reducer.
  const extraTurn = doublesCount >= 1 && doublesCount < 3 && !w.wentToJail && !w.bankrupted && !isWin

  return {
    type: 'roll',
    seat,
    dice,
    usedFastBus,
    effects: w.effects,
    finalTile: w.currentTile,
    buyOption,
    isWin,
    winnerId,
    extraTurn,
    doublesCount,
    cardChoice: w.choiceTile != null ? { tile: w.choiceTile } : null,
  }
}

/**
 * Resolve a player's chosen-deck draw on a "Luck or Court" cell — the second
 * half of a turn that paused via {@link resolveTurn}'s `cardChoice`. The seat is
 * already committed standing on the choice cell; this draws from `deck`, applies
 * the card, and resolves any chain (the same tail as a roll). The doubles chain
 * carried on the state grants the extra turn unless the card jails/bankrupts/wins.
 */
export function resolveCardDraw(state: BankGameState, deck: CardDeck, rng: Rng = Math.random): BankTurnResolution {
  const seat = state.currentPlayerIndex
  const w = newWork(state, rng)
  // The seat stands on the choice cell — draw from the chosen deck, then chain.
  resolveChain(w, true, deck)

  const buyOption = computeBuyOption(w)
  const { isWin, winnerId } = computeWin(w)
  const hadDoubles = state.consecutiveDoubles > 0
  const extraTurn = hadDoubles && !w.wentToJail && !w.bankrupted && !isWin
  const doublesCount = extraTurn ? state.consecutiveDoubles : 0

  return {
    type: 'cardDraw',
    seat,
    deck,
    effects: w.effects,
    finalTile: w.currentTile,
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
