import { useState } from 'react'
import { OnlineLobby, type LobbyDraft, type RoomParams } from '../../online/OnlineLobby'
import { DOMINO_SEAT_COLORS } from '../../../domino/config'
import { DominoOnlineRoom } from './DominoOnlineRoom'

interface DominoOnlineGameProps {
  onExit: () => void
  /** Room code from a shared invite link — opens the lobby on the Join tab. */
  initialRoomCode?: string
}

/** Online Dominoes: pick/create a room, then play the match. Mirrors `OnlineGame`. */
export function DominoOnlineGame({ onExit, initialRoomCode }: DominoOnlineGameProps) {
  const [params, setParams] = useState<RoomParams | null>(null)
  // Remember the last lobby entries so a bounced-back joiner returns pre-filled.
  const [draft, setDraft] = useState<LobbyDraft | undefined>(undefined)

  if (!params) {
    return (
      <OnlineLobby
        onBack={onExit}
        initial={draft}
        initialCode={initialRoomCode}
        colors={DOMINO_SEAT_COLORS}
        onStart={(next, nextDraft) => {
          setDraft(nextDraft)
          setParams(next)
        }}
      />
    )
  }

  // Leaving the room returns to the lobby so you can start/join another.
  return <DominoOnlineRoom {...params} onLeave={() => setParams(null)} />
}
