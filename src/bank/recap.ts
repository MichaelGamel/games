/**
 * Pure match-recap statistics for Bank El-Hazz, distilled from a
 * {@link MatchLog}. No React, no DOM — unit-tested in `recap.test.ts`. Feeds the
 * stats panel in the winner overlay.
 */
import type { MatchLog } from '../lib/matchLog'
import type { BankRules, BankTurnResolution } from './types'

export interface BankPlayerRecap {
  name: string
  color: string
  rolls: number
  propertiesBought: number
  rentPaid: number
  rentCollected: number
  /** Tax + maintenance + luck fines paid to the bank / other players. */
  taxesPaid: number
  /** Reward tiles + card gifts + collect-each winnings. */
  rewardsEarned: number
  /** Luck + Court cards drawn. */
  cardsDrawn: number
  /** Houses + hotels built (P3 upgrades). */
  housesBuilt: number
  jailVisits: number
  bankrupt: boolean
  /** Cash on hand at the end of the recorded log. */
  finalCash: number
}

export interface BankRecap {
  totalTurns: number
  players: BankPlayerRecap[]
}

export function summarizeBank(log: MatchLog<BankTurnResolution, BankRules>): BankRecap {
  const startCash = log.rules?.startCash ?? 1500
  const players: BankPlayerRecap[] = log.players.map((p) => ({
    name: p.name,
    color: p.color,
    rolls: 0,
    propertiesBought: 0,
    rentPaid: 0,
    rentCollected: 0,
    taxesPaid: 0,
    rewardsEarned: 0,
    cardsDrawn: 0,
    housesBuilt: 0,
    jailVisits: 0,
    bankrupt: false,
    finalCash: startCash,
  }))

  let totalTurns = 0
  for (const event of log.events) {
    if (event.kind !== 'turn') continue
    const r = event.resolution

    if (r.type === 'jailSkip') {
      totalTurns++
      continue
    }

    if (r.type === 'decision') {
      totalTurns++
      const stats = players[r.seat]
      if (stats && r.action === 'buy') {
        stats.propertiesBought++
        stats.finalCash -= r.price
      }
      continue
    }

    if (r.type === 'manage') {
      totalTurns++
      for (const effect of r.effects) {
        if (effect.kind === 'upgrade') {
          const s = players[effect.seat]
          if (s) {
            s.housesBuilt++
            s.finalCash -= effect.cost
          }
        } else if (effect.kind === 'sell') {
          const s = players[effect.seat]
          if (s) s.finalCash += effect.refund
        } else if (effect.kind === 'mortgage') {
          const s = players[effect.seat]
          if (s) s.finalCash += effect.amount
        } else if (effect.kind === 'unmortgage') {
          const s = players[effect.seat]
          if (s) s.finalCash -= effect.cost
        }
      }
      continue
    }

    if (r.type === 'trade') {
      totalTurns++
      const giver = players[r.from]
      const taker = players[r.to]
      if (giver) giver.finalCash += r.receiveCash - r.giveCash
      if (taker) taker.finalCash += r.giveCash - r.receiveCash
      continue
    }

    // r.type === 'roll' | 'cardDraw' — both carry an ordered effect list; only a
    // real dice roll counts toward the roll tally (a card draw is a sub-event).
    totalTurns++
    const stats = players[r.seat]
    if (stats && r.type === 'roll') stats.rolls++

    for (const effect of r.effects) {
      switch (effect.kind) {
        case 'passStart':
          if (stats) stats.finalCash += effect.amount
          break
        case 'cash': {
          const s = players[effect.seat]
          if (!s) break
          s.finalCash += effect.delta
          if (effect.delta >= 0) s.rewardsEarned += effect.delta
          else s.taxesPaid += -effect.delta
          break
        }
        case 'pay': {
          const payer = players[effect.from]
          const payee = players[effect.to]
          if (payer) {
            payer.finalCash -= effect.amount
            if (effect.reason === 'rent') payer.rentPaid += effect.amount
            else payer.taxesPaid += effect.amount
          }
          if (payee) {
            payee.finalCash += effect.amount
            if (effect.reason === 'rent') payee.rentCollected += effect.amount
            else payee.rewardsEarned += effect.amount
          }
          break
        }
        case 'collect': {
          const collector = players[effect.to]
          if (collector) {
            collector.finalCash += effect.amount * effect.froms.length
            collector.rewardsEarned += effect.amount * effect.froms.length
          }
          for (const from of effect.froms) {
            const payer = players[from]
            if (payer) {
              payer.finalCash -= effect.amount
              payer.taxesPaid += effect.amount
            }
          }
          break
        }
        case 'card':
          if (stats) stats.cardsDrawn++
          break
        case 'jail': {
          const s = players[effect.seat]
          if (s) s.jailVisits++
          break
        }
        case 'bankrupt': {
          const s = players[effect.seat]
          if (s) {
            s.bankrupt = true
            s.finalCash = 0
          }
          break
        }
      }
    }
  }

  return { totalTurns, players }
}
