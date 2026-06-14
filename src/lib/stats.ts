/**
 * Local match statistics — the "Hall of Fame" data.
 *
 * Results are keyed by player display name (this is a couch/local notion of
 * identity, good enough for family bragging rights) and aggregated per game.
 * Everything lives in localStorage; there is no server.
 */
import { loadLocal, saveLocal } from './storage'

export type GameId = 'snakes' | 'ludo' | 'four' | 'uno' | 'bank' | 'xo'

export interface PlayerStats {
  games: number
  wins: number
  /** Current consecutive-wins streak (any game). */
  streak: number
  bestStreak: number
}

export type StatsStore = Record<string, PlayerStats & { perGame: Partial<Record<GameId, { games: number; wins: number }>> }>

const KEY = 'rg-stats-v1'

export function loadStats(): StatsStore {
  return loadLocal<StatsStore>(KEY, {})
}

export interface MatchResult {
  name: string
  /** Won = finished first (or by forfeit). */
  won: boolean
}

/** Record one finished match. Call exactly once per match. */
export function recordMatch(gameId: GameId, results: MatchResult[]): void {
  const store = loadStats()
  for (const { name, won } of results) {
    const key = name.trim()
    if (!key) continue
    const entry = store[key] ?? { games: 0, wins: 0, streak: 0, bestStreak: 0, perGame: {} }
    entry.games += 1
    const game = entry.perGame[gameId] ?? { games: 0, wins: 0 }
    game.games += 1
    if (won) {
      entry.wins += 1
      game.wins += 1
      entry.streak += 1
      entry.bestStreak = Math.max(entry.bestStreak, entry.streak)
    } else {
      entry.streak = 0
    }
    entry.perGame[gameId] = game
    store[key] = entry
  }
  saveLocal(KEY, store)
}

export interface HallOfFameRow {
  name: string
  wins: number
  games: number
  streak: number
  bestStreak: number
}

/** Top players by total wins (ties broken by win rate), for the hub. */
export function hallOfFame(limit = 5): HallOfFameRow[] {
  const store = loadStats()
  return Object.entries(store)
    .map(([name, s]) => ({
      name,
      wins: s.wins,
      games: s.games,
      streak: s.streak,
      bestStreak: s.bestStreak,
    }))
    .filter((r) => r.games > 0)
    .sort((a, b) => b.wins - a.wins || b.wins / b.games - a.wins / a.games || a.name.localeCompare(b.name))
    .slice(0, limit)
}
