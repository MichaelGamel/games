/**
 * Turns each game's recap stats into display rows for {@link RecapPanel} —
 * picking only the chips worth bragging (or laughing) about.
 */
import { summarizeSnakes } from '../game/recap'
import { summarizeLudo } from '../ludo/recap'
import type { MatchLog } from '../lib/matchLog'
import type { SnakesRules, TurnResolution } from '../game/types'
import type { LudoRules, LudoTurnResolution } from '../ludo/types'
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
