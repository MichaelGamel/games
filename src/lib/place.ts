/** Podium copy shared by the player panel, overlays, and status text. */

/**
 * The minimal player shape the podium overlays need. Both the Snakes `Player`
 * and the `LudoPlayer` satisfy it, so `CelebrationOverlay`/`WinnerOverlay` are
 * shared verbatim by both games (Dependency Inversion — depend on this, not on
 * either game's concrete player type).
 */
export interface PodiumPlayer {
  id: number
  name: string
  color: string
}

const MEDALS = ['🥇', '🥈', '🥉'] as const
const LABELS = ['1st', '2nd', '3rd', '4th'] as const

/** Medal emoji for a 0-based podium rank. */
export const placeMedal = (rank: number): string => MEDALS[rank] ?? '🏅'

/** Ordinal label ("1st", "2nd"…) for a 0-based podium rank. */
export const placeLabel = (rank: number): string => LABELS[rank] ?? `${rank + 1}th`

/** Translation key (namespace-qualified) for a 0-based podium rank. */
export const placeKey = (rank: number) =>
  (['common:place.p1', 'common:place.p2', 'common:place.p3', 'common:place.p4'] as const)[
    Math.min(Math.max(rank, 0), 3)
  ]
