import { useState } from 'react'
import { OnlineLobby, type LobbyDraft, type RoomParams } from '../online/OnlineLobby'
import { FOUR_COLORS } from '../../four/config'
import { FourOnlineRoom } from './FourOnlineRoom'

interface FourOnlineGameProps {
  onExit: () => void
  /** Room code from a shared invite link — opens the lobby on the Join tab. */
  initialRoomCode?: string
}

/** Online Connect Four: pick/create a room, then play. Mirrors `OnlineGame`. */
export function FourOnlineGame({ onExit, initialRoomCode }: FourOnlineGameProps) {
  const [params, setParams] = useState<RoomParams | null>(null)
  // Remember the last lobby entries so a bounced-back joiner returns pre-filled.
  const [draft, setDraft] = useState<LobbyDraft | undefined>(undefined)

  if (!params) {
    return (
      <OnlineLobby
        onBack={onExit}
        initial={draft}
        initialCode={initialRoomCode}
        colors={FOUR_COLORS}
        onStart={(next, nextDraft) => {
          setDraft(nextDraft)
          setParams(next)
        }}
      />
    )
  }

  return <FourOnlineRoom {...params} onLeave={() => setParams(null)} />
}
