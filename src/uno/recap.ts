/**
 * Pure match-recap statistics for UNO, distilled from a {@link MatchLog}.
 * No React, no DOM — unit-tested in `recap.test.ts`. Feeds the stats panel in
 * the winner overlay, mirroring `src/ludo/recap.ts`.
 */
import type { MatchLog } from '../lib/matchLog'
import type { UnoRules, UnoTurnResolution } from './types'

export interface UnoPlayerRecap {
  name: string
  color: string
  /** Cards laid down (counts each card in a multi-play). */
  cardsPlayed: number
  /** Cards drawn (voluntary + penalty + challenge/callout losses). */
  cardsDrawn: number
  /** Skips, Reverses and Draw-Twos this seat played. */
  actionsPlayed: number
  /** Wilds and Wild-Draw-Fours this seat played. */
  wildsPlayed: number
  /** Times this seat declared "UNO!". */
  unoCalls: number
  /** Times this seat was penalized (caught not declaring, or lost a challenge). */
  penalties: number
}

export interface UnoRecap {
  totalTurns: number
  players: UnoPlayerRecap[]
}

export function summarizeUno(log: MatchLog<UnoTurnResolution, UnoRules>): UnoRecap {
  const players: UnoPlayerRecap[] = log.players.map((p) => ({
    name: p.name,
    color: p.color,
    cardsPlayed: 0,
    cardsDrawn: 0,
    actionsPlayed: 0,
    wildsPlayed: 0,
    unoCalls: 0,
    penalties: 0,
  }))

  let totalTurns = 0
  const add = (seat: number, key: keyof UnoPlayerRecap, by = 1) => {
    const s = players[seat]
    if (s) (s[key] as number) += by
  }

  for (const event of log.events) {
    if (event.kind !== 'turn') continue
    totalTurns++
    const r = event.resolution
    switch (r.kind) {
      case 'play': {
        add(r.seat, 'cardsPlayed', r.cards.length)
        if (r.declaredUno) add(r.seat, 'unoCalls')
        for (const c of r.cards) {
          if (c.value === 'wild' || c.value === 'wild4') add(r.seat, 'wildsPlayed')
          else if (c.value === 'skip' || c.value === 'reverse' || c.value === 'draw2')
            add(r.seat, 'actionsPlayed')
        }
        break
      }
      case 'draw': {
        add(r.seat, 'cardsDrawn', r.count)
        if (r.thenPlay) {
          add(r.seat, 'cardsPlayed')
          if (r.thenPlay.value === 'wild' || r.thenPlay.value === 'wild4') add(r.seat, 'wildsPlayed')
          else if (
            r.thenPlay.value === 'skip' ||
            r.thenPlay.value === 'reverse' ||
            r.thenPlay.value === 'draw2'
          )
            add(r.seat, 'actionsPlayed')
        }
        break
      }
      case 'challenge': {
        add(r.penalty.seat, 'cardsDrawn', r.penalty.count)
        // A failed challenge penalizes the challenger; a caught bluff penalizes
        // the WD4 player — either way the seat that drew is the penalized one.
        add(r.penalty.seat, 'penalties')
        break
      }
      case 'callout': {
        add(r.penalty.seat, 'cardsDrawn', r.penalty.count)
        add(r.penalty.seat, 'penalties')
        break
      }
    }
  }

  return { totalTurns, players }
}
