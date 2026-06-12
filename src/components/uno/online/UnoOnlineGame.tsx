import { useState } from 'react'
import { OnlineLobby, type LobbyDraft, type RoomParams } from '../../online/OnlineLobby'
import { UNO_SEAT_COLORS } from '../../../uno/config'
import { UnoOnlineRoom } from './UnoOnlineRoom'

interface UnoOnlineGameProps {
  onExit: () => void
  /** Room code from a shared invite link — opens the lobby on the Join tab. */
  initialRoomCode?: string
}

/** Online UNO: pick/create a room, then play the match. Mirrors `OnlineGame`. */
export function UnoOnlineGame({ onExit, initialRoomCode }: UnoOnlineGameProps) {
  const [params, setParams] = useState<RoomParams | null>(null)
  // Remember the last lobby entries so a bounced-back joiner (name/color taken,
  // room full…) returns with their values preserved.
  const [draft, setDraft] = useState<LobbyDraft | undefined>(undefined)

  if (!params) {
    return (
      <OnlineLobby
        onBack={onExit}
        initial={draft}
        initialCode={initialRoomCode}
        colors={UNO_SEAT_COLORS}
        onStart={(next, nextDraft) => {
          setDraft(nextDraft)
          setParams(next)
        }}
      />
    )
  }

  // Leaving the room returns to the lobby so you can start/join another.
  return <UnoOnlineRoom {...params} onLeave={() => setParams(null)} />
}
