/**
 * Turns each game's recap stats into display rows for {@link RecapPanel} —
 * picking only the chips worth bragging (or laughing) about.
 */
import { summarizeSnakes } from '../game/recap'
import { summarizeLudo } from '../ludo/recap'
import { summarizeUno } from '../uno/recap'
import { summarizeBank } from '../bank/recap'
import type { MatchLog } from '../lib/matchLog'
import type { SnakesRules, TurnResolution } from '../game/types'
import type { LudoRules, LudoTurnResolution } from '../ludo/types'
import type { UnoRules, UnoTurnResolution } from '../uno/types'
import type { BankRules, BankTurnResolution } from '../bank/types'
import type { RecapRow } from './RecapPanel'

export function snakesRecapRows(log: MatchLog<TurnResolution, SnakesRules>): RecapRow[] {
  return summarizeSnakes(log).players.map((p) => {
    const chips: string[] = [`🎲 ${p.rolls}`]
    if (p.laddersClimbed > 0) chips.push(`🪜 ×${p.laddersClimbed}`)
    if (p.snakesHit > 0) chips.push(`🐍 ×${p.snakesHit}`)
    if (p.luckyRolls > 0) chips.push(`✨ ${p.luckyRolls}`)
    if (p.bounces > 0) chips.push(`↩️ ${p.bounces}`)
    if (p.specials > 0) chips.push(`🛡️ ${p.specials}`)
    return { name: p.name, color: p.color, chips }
  })
}

export function ludoRecapRows(log: MatchLog<LudoTurnResolution, LudoRules>): RecapRow[] {
  return summarizeLudo(log).players.map((p) => {
    const chips: string[] = [`🎲 ${p.rolls}`]
    if (p.captures > 0) chips.push(`⚔️ ${p.captures}`)
    if (p.timesCaptured > 0) chips.push(`💥 ${p.timesCaptured}`)
    if (p.homeArrivals > 0) chips.push(`🏠 ${p.homeArrivals}`)
    if (p.luckyRolls > 0) chips.push(`✨ ${p.luckyRolls}`)
    return { name: p.name, color: p.color, chips }
  })
}

export function unoRecapRows(log: MatchLog<UnoTurnResolution, UnoRules>): RecapRow[] {
  return summarizeUno(log).players.map((p) => {
    const chips: string[] = [`🃏 ${p.cardsPlayed}`]
    if (p.cardsDrawn > 0) chips.push(`🫳 ${p.cardsDrawn}`)
    if (p.actionsPlayed > 0) chips.push(`⚡ ${p.actionsPlayed}`)
    if (p.wildsPlayed > 0) chips.push(`✦ ${p.wildsPlayed}`)
    if (p.unoCalls > 0) chips.push(`📣 ${p.unoCalls}`)
    if (p.penalties > 0) chips.push(`💢 ${p.penalties}`)
    return { name: p.name, color: p.color, chips }
  })
}

export function bankRecapRows(log: MatchLog<BankTurnResolution, BankRules>): RecapRow[] {
  return summarizeBank(log).players.map((p) => {
    const chips: string[] = [`🎲 ${p.rolls}`, `💵 ${p.finalCash} LE`]
    if (p.propertiesBought > 0) chips.push(`🏷️ ${p.propertiesBought}`)
    if (p.housesBuilt > 0) chips.push(`🏠 ${p.housesBuilt}`)
    if (p.rentCollected > 0) chips.push(`💰 ${p.rentCollected} LE`)
    if (p.cardsDrawn > 0) chips.push(`🎴 ${p.cardsDrawn}`)
    if (p.taxesPaid > 0) chips.push(`💸 ${p.taxesPaid} LE`)
    if (p.jailVisits > 0) chips.push(`🚔 ${p.jailVisits}`)
    if (p.bankrupt) chips.push('💀')
    return { name: p.name, color: p.color, chips }
  })
}
