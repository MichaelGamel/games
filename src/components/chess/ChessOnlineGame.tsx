/**
 * Online chess: pick or create a room, then play. Mirrors `XOOnlineGame` /
 * `FourOnlineGame`.
 */
import { useState } from 'react'
import { OnlineLobby, type LobbyDraft, type RoomParams } from '../online/OnlineLobby'
import { CHESS_PIECE_COLORS } from '../../chess/config'
import { ChessOnlineRoom } from './ChessOnlineRoom'

interface ChessOnlineGameProps {
  onExit: () => void
  /** Room code from a shared invite link — opens the lobby on the Join tab. */
  initialRoomCode?: string
}

export function ChessOnlineGame({ onExit, initialRoomCode }: ChessOnlineGameProps) {
  const [params, setParams] = useState<RoomParams | null>(null)
  // Remember the last lobby entries so a bounced-back joiner returns pre-filled.
  const [draft, setDraft] = useState<LobbyDraft | undefined>(undefined)

  if (!params) {
    return (
      <OnlineLobby
        onBack={onExit}
        initial={draft}
        initialCode={initialRoomCode}
        colors={CHESS_PIECE_COLORS}
        onStart={(next, nextDraft) => {
          setDraft(nextDraft)
          setParams(next)
        }}
      />
    )
  }

  return <ChessOnlineRoom {...params} onLeave={() => setParams(null)} />
}
