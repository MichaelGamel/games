import type { PodiumPlayer } from '../../lib/place'
import type { DominoController } from '../../hooks/useDomino'

export interface DominoWinnerInfo {
  /** Podium order for the WinnerOverlay (never empty when the round ended). */
  standings: PodiumPlayer[]
  /** A blocked board with two or more seats level on pips. */
  isTie: boolean
  /** The winner's leftover pips on a blocked win, else null. */
  winnerPips: number | null
}

/**
 * Derive the end-of-round standings from a finished controller. A normal win
 * (empty hand) or a single fewest-pips winner on a blocked board yields one
 * finisher; a pip tie yields the tied seats together.
 */
export function dominoWinnerInfo(game: DominoController): DominoWinnerInfo {
  const toPodium = (p: { id: number; name: string; color: string }): PodiumPlayer => ({
    id: p.id,
    name: p.name,
    color: p.color,
  })

  if (game.winnerId != null) {
    const winner = game.players[game.winnerId]
    return {
      standings: winner ? [toPodium(winner)] : [],
      isTie: false,
      winnerPips: game.winReason === 'blocked' ? (game.pipCounts[game.winnerId] ?? null) : null,
    }
  }
  if (game.blockedTie.length > 0) {
    return {
      standings: game.blockedTie.map((id) => toPodium(game.players[id])).filter(Boolean),
      isTie: true,
      winnerPips: null,
    }
  }
  return { standings: [], isTie: false, winnerPips: null }
}
