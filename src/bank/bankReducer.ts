/**
 * The Bank El-Hazz phase machine — pure, deterministic, no async. It only
 * *applies* an already-resolved {@link BankTurnResolution}; it computes no rules
 * and runs no timers (that is `rules.ts` and the hook respectively). Every
 * committed event flows through `COMMIT_TURN` and bumps `turnCount`, the online
 * sequence number, so equal `turnCount` ⇒ identical state across clients.
 */
import { BOARD, DEFAULT_BANK_RULES, JAIL_MAX_TURNS } from './config'
import type {
  BankGameState,
  BankPhase,
  BankPlayer,
  BankRules,
  BankTurnResolution,
  DieValue,
  Ownership,
  PlayerStatus,
  TurnEffect,
  WinReason,
} from './types'

export interface PlayerSetup {
  name: string
  color: string
  isBot?: boolean
  botLevel?: 'easy' | 'medium' | 'hard'
}

/** A per-seat snapshot for online resync / late joiners (P6 parity). */
export interface PlayerSnapshot extends PlayerSetup {
  position: number
  cash: number
  status: PlayerStatus
  jailTurns: number
  jailCards: number
  fastBus: boolean
}

export type BankAction =
  | { type: 'START_GAME'; players: PlayerSetup[]; rules?: BankRules }
  | { type: 'BEGIN_ROLL'; dice: DieValue[] }
  | { type: 'BEGIN_MOVE' }
  | { type: 'COMMIT_TURN'; resolution: BankTurnResolution }
  // A late joiner the host approved: append them to the running match (P6).
  | { type: 'ADD_PLAYER'; player: PlayerSetup }
  // The current player left an online room: hand the turn on (P6).
  | { type: 'SKIP_TURN' }
  // Last player standing after others forfeited (P6).
  | { type: 'FORFEIT_WIN'; winnerId: number }
  | {
      type: 'LOAD_SNAPSHOT'
      players: PlayerSnapshot[]
      ownership: Record<number, Ownership>
      rules: BankRules
      currentPlayerIndex: number
      bankruptedOrder: number[]
      ended: boolean
      winnerId: number | null
      turnCount: number
    }
  // Local pass-and-play undo: replace the whole state with a history entry.
  | { type: 'RESTORE'; state: BankGameState }
  | { type: 'RESET' }

export const initialBankState: BankGameState = {
  players: [],
  ownership: {},
  currentPlayerIndex: 0,
  phase: 'setup',
  rules: { ...DEFAULT_BANK_RULES },
  lastDice: [],
  pendingBuy: null,
  bankruptedOrder: [],
  winnerId: null,
  winReason: null,
  consecutiveDoubles: 0,
  round: 0,
  turnCount: 0,
}

/** Next seat in turn order that is still solvent (skips bankrupt players). */
function nextActiveIndex(players: BankPlayer[], from: number): number {
  const count = players.length
  for (let step = 1; step <= count; step++) {
    const i = (from + step) % count
    if (players[i].status === 'active') return i
  }
  return from
}

/** Net worth (cash + every owned property's price) — the timed-mode tiebreaker. */
function netWorthOf(player: BankPlayer, ownership: Record<number, Ownership>): number {
  let worth = player.cash
  for (const tileId of Object.keys(ownership)) {
    if (ownership[Number(tileId)].owner === player.id) worth += BOARD[Number(tileId)].price ?? 0
  }
  return worth
}

/** The active seat with the highest net worth (ties → lowest seat). */
function richestActive(players: BankPlayer[], ownership: Record<number, Ownership>): number {
  let best = -1
  let bestWorth = -Infinity
  for (const p of players) {
    if (p.status !== 'active') continue
    const worth = netWorthOf(p, ownership)
    if (worth > bestWorth) {
      bestWorth = worth
      best = p.id
    }
  }
  return best
}

/** Where the turn passes after a committed event. */
interface Advance {
  currentPlayerIndex: number
  round: number
  phase: BankPhase
  winnerId: number | null
  winReason: WinReason | null
}

/**
 * Hand the turn on. `keepSeat` (a doubles extra turn) holds the current seat and
 * never completes a round. Otherwise step to the next active seat; a wrap past
 * the lineup completes a round, and once `rules.maxRounds` rounds are done the
 * richest active player wins (`winReason: 'rounds'`).
 */
function advanceTurn(
  state: BankGameState,
  players: BankPlayer[],
  ownership: Record<number, Ownership>,
  fromSeat: number,
  keepSeat: boolean,
): Advance {
  if (keepSeat) {
    return { currentPlayerIndex: fromSeat, round: state.round, phase: 'idle', winnerId: null, winReason: null }
  }
  const next = nextActiveIndex(players, fromSeat)
  const wrapped = next <= fromSeat
  const round = wrapped ? state.round + 1 : state.round
  if (wrapped && state.rules.maxRounds != null && round >= state.rules.maxRounds) {
    return { currentPlayerIndex: next, round, phase: 'won', winnerId: richestActive(players, ownership), winReason: 'rounds' }
  }
  return { currentPlayerIndex: next, round, phase: 'idle', winnerId: null, winReason: null }
}

/** Apply one effect to a working draft of players + ownership (in place). */
function applyEffect(
  players: BankPlayer[],
  ownership: Record<number, Ownership>,
  bankruptedOrder: number[],
  seat: number,
  effect: TurnEffect,
): void {
  switch (effect.kind) {
    case 'move':
      players[seat].position = effect.to
      break
    case 'passStart':
      players[seat].cash += effect.amount
      break
    case 'cash':
      players[effect.seat].cash += effect.delta
      break
    case 'pay':
      players[effect.from].cash -= effect.amount
      players[effect.to].cash += effect.amount
      break
    case 'collect':
      for (const from of effect.froms) players[from].cash -= effect.amount
      players[effect.to].cash += effect.amount * effect.froms.length
      break
    case 'card':
      // A marker only — the card's concrete effects are their own entries.
      break
    case 'jail':
      players[effect.seat].position = 30 // the Jail corner (السجن)
      players[effect.seat].jailTurns = JAIL_MAX_TURNS // P2: that many escape attempts
      break
    case 'jailRelease':
      players[effect.seat].jailTurns = 0
      if (effect.via === 'card') {
        players[effect.seat].jailCards = Math.max(0, players[effect.seat].jailCards - 1)
      }
      break
    case 'jailStay':
      players[effect.seat].jailTurns = Math.max(0, players[effect.seat].jailTurns - 1)
      break
    case 'grantJailCard':
      players[effect.seat].jailCards += 1
      break
    case 'fastBus':
      players[effect.seat].fastBus = true
      break
    case 'upgrade':
    case 'sell':
      // Set the new building level on the owned tile; pay / refund the seat.
      ownership[effect.tile] = { ...ownership[effect.tile], level: effect.level }
      players[effect.seat].cash += effect.kind === 'sell' ? effect.refund : -effect.cost
      break
    case 'mortgage':
      ownership[effect.tile] = { ...ownership[effect.tile], mortgaged: true }
      players[effect.seat].cash += effect.amount
      break
    case 'unmortgage':
      ownership[effect.tile] = { ...ownership[effect.tile], mortgaged: false }
      players[effect.seat].cash -= effect.cost
      break
    case 'bankrupt':
      players[effect.seat].status = 'bankrupt'
      players[effect.seat].cash = 0
      players[effect.seat].jailTurns = 0
      players[effect.seat].jailCards = 0
      for (const tile of effect.releasedTiles) delete ownership[tile]
      if (!bankruptedOrder.includes(effect.seat)) bankruptedOrder.push(effect.seat)
      break
  }
}

export function bankReducer(state: BankGameState, action: BankAction): BankGameState {
  switch (action.type) {
    case 'START_GAME': {
      // A random first player comes from shuffling the lineup *before* dispatch,
      // so the reducer stays deterministic for online sync (like Ludo).
      const rules = action.rules ?? { ...DEFAULT_BANK_RULES }
      const players: BankPlayer[] = action.players.map((p, id) => ({
        id,
        name: p.name,
        color: p.color,
        position: 0,
        cash: rules.startCash,
        status: 'active',
        jailTurns: 0,
        jailCards: 0,
        fastBus: false,
        isBot: p.isBot ?? false,
        botLevel: p.botLevel,
      }))
      return { ...initialBankState, players, rules, phase: 'idle' }
    }

    case 'ADD_PLAYER': {
      // A late joiner the host approved — seated at the end of the turn order
      // with the starting cash on Start; the in-flight match keeps running.
      const player: BankPlayer = {
        id: state.players.length,
        name: action.player.name,
        color: action.player.color,
        position: 0,
        cash: state.rules.startCash,
        status: 'active',
        jailTurns: 0,
        jailCards: 0,
        fastBus: false,
        isBot: false,
      }
      return { ...state, players: [...state.players, player] }
    }

    case 'BEGIN_ROLL':
      return { ...state, phase: 'rolling', lastDice: action.dice }

    case 'BEGIN_MOVE':
      return { ...state, phase: 'moving' }

    case 'COMMIT_TURN': {
      const r = action.resolution
      const turnCount = state.turnCount + 1

      if (r.type === 'jailSkip') {
        const players = state.players.map((p) =>
          p.id === r.seat ? { ...p, jailTurns: Math.max(0, p.jailTurns - 1) } : p,
        )
        const adv = advanceTurn(state, players, state.ownership, r.seat, false)
        return {
          ...state,
          players,
          currentPlayerIndex: adv.currentPlayerIndex,
          round: adv.round,
          phase: adv.phase,
          winnerId: adv.winnerId,
          winReason: adv.winReason,
          consecutiveDoubles: 0,
          turnCount,
        }
      }

      if (r.type === 'decision') {
        const players = state.players.map((p) => ({ ...p }))
        const ownership = { ...state.ownership }
        if (r.action === 'buy') {
          players[r.seat].cash -= r.price
          ownership[r.tile] = { owner: r.seat, level: 0, mortgaged: false }
        }
        // A doubles chain (recorded on the roll that opened this buy) still owes
        // the seat its extra roll once the choice is made.
        const keepSeat = state.consecutiveDoubles > 0
        const adv = advanceTurn(state, players, ownership, r.seat, keepSeat)
        return {
          ...state,
          players,
          ownership,
          pendingBuy: null,
          currentPlayerIndex: adv.currentPlayerIndex,
          round: adv.round,
          phase: adv.phase,
          winnerId: adv.winnerId,
          winReason: adv.winReason,
          consecutiveDoubles: keepSeat ? state.consecutiveDoubles : 0,
          turnCount,
        }
      }

      if (r.type === 'manage') {
        // A management action (build/sell/mortgage/unmortgage) mutates holdings
        // and bumps the sequence, but keeps the seat, phase, round and doubles
        // chain — the player still owes their roll.
        const players = state.players.map((p) => ({ ...p }))
        const ownership = { ...state.ownership }
        const bankruptedOrder = [...state.bankruptedOrder]
        for (const effect of r.effects) applyEffect(players, ownership, bankruptedOrder, r.seat, effect)
        return { ...state, players, ownership, turnCount }
      }

      if (r.type === 'trade') {
        // Swap ownership of the listed tiles and net the cash both ways. Like a
        // management action, it keeps the current seat (the proposer's turn).
        const players = state.players.map((p) => ({ ...p }))
        const ownership = { ...state.ownership }
        for (const id of r.giveTiles) ownership[id] = { ...ownership[id], owner: r.to }
        for (const id of r.receiveTiles) ownership[id] = { ...ownership[id], owner: r.from }
        players[r.from].cash += r.receiveCash - r.giveCash
        players[r.to].cash += r.giveCash - r.receiveCash
        return { ...state, players, ownership, turnCount }
      }

      // r.type === 'roll'
      const players = state.players.map((p) => ({ ...p }))
      const ownership = { ...state.ownership }
      const bankruptedOrder = [...state.bankruptedOrder]
      // Consume a held Fast Bus buff first; a fresh Fast Bus landing (below) re-grants it.
      if (r.usedFastBus) players[r.seat].fastBus = false
      for (const effect of r.effects) {
        applyEffect(players, ownership, bankruptedOrder, r.seat, effect)
      }

      // The doubles chain survives only while the same seat keeps its extra turn.
      const extraTurn = r.extraTurn ?? false
      const doublesCount = r.doublesCount ?? 0
      const consecutiveDoubles = doublesCount > 0 && extraTurn ? doublesCount : 0

      if (r.isWin) {
        return {
          ...state,
          players,
          ownership,
          bankruptedOrder,
          phase: 'won',
          winnerId: r.winnerId,
          winReason: 'lastStanding',
          consecutiveDoubles: 0,
          turnCount,
        }
      }

      if (r.buyOption && players[r.seat].status === 'active') {
        // Keep the seat; open the buy/skip choice. The doubles chain rides along
        // so the post-decision commit can still grant the extra roll.
        return {
          ...state,
          players,
          ownership,
          bankruptedOrder,
          phase: 'deciding',
          pendingBuy: { seat: r.seat, tile: r.buyOption.tile, price: r.buyOption.price },
          consecutiveDoubles,
          turnCount,
        }
      }

      const adv = advanceTurn(state, players, ownership, r.seat, extraTurn)
      return {
        ...state,
        players,
        ownership,
        bankruptedOrder,
        currentPlayerIndex: adv.currentPlayerIndex,
        round: adv.round,
        phase: adv.phase,
        winnerId: adv.winnerId,
        winReason: adv.winReason,
        consecutiveDoubles,
        turnCount,
      }
    }

    case 'SKIP_TURN': {
      const adv = advanceTurn(state, state.players, state.ownership, state.currentPlayerIndex, false)
      return {
        ...state,
        currentPlayerIndex: adv.currentPlayerIndex,
        round: adv.round,
        phase: adv.phase,
        winnerId: adv.winnerId,
        winReason: adv.winReason,
        consecutiveDoubles: 0,
        turnCount: state.turnCount + 1,
      }
    }

    case 'FORFEIT_WIN':
      return {
        ...state,
        phase: 'won',
        winnerId: action.winnerId,
        winReason: 'forfeit',
        turnCount: state.turnCount + 1,
      }

    case 'LOAD_SNAPSHOT': {
      const players: BankPlayer[] = action.players.map((p, id) => ({
        id,
        name: p.name,
        color: p.color,
        position: p.position,
        cash: p.cash,
        status: p.status,
        jailTurns: p.jailTurns,
        jailCards: p.jailCards,
        fastBus: p.fastBus,
        isBot: false,
      }))
      return {
        players,
        ownership: { ...action.ownership },
        currentPlayerIndex: action.currentPlayerIndex,
        phase: action.ended ? 'won' : 'idle',
        rules: action.rules,
        lastDice: [],
        pendingBuy: null,
        bankruptedOrder: action.bankruptedOrder,
        winnerId: action.winnerId,
        winReason: action.ended ? 'lastStanding' : null,
        // A resync resets the per-turn doubles chain and the round counter (the
        // joiner can't reconstruct early rounds; timed mode tolerates the reset).
        consecutiveDoubles: 0,
        round: 0,
        turnCount: action.turnCount,
      }
    }

    case 'RESTORE':
      return action.state

    case 'RESET':
      return initialBankState

    default:
      return state
  }
}
