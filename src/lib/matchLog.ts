/**
 * The recorded history of one match: the starting lineup + rules, and every
 * committed event in commit order. Because a {@link MatchEvent} carries the
 * same resolved payload the online protocol broadcasts, a log can be **fed
 * back through a fresh game controller to replay the whole match** with full
 * animation — and pure summarizers can distil it into a recap.
 */
import type { MatchDecision } from '../game/types'

export interface MatchLogPlayer {
  name: string
  color: string
  isBot?: boolean
}

export type MatchEvent<R> =
  | { kind: 'turn'; seat: number; resolution: R }
  | { kind: 'skip'; seat: number }
  | { kind: 'decision'; decision: MatchDecision }

export interface MatchLog<R, Rules = unknown> {
  players: MatchLogPlayer[]
  rules: Rules
  events: MatchEvent<R>[]
}
