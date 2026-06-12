import { useState } from 'react'
import { OnlineLobby, type LobbyDraft, type RoomParams } from './OnlineLobby'
import { OnlineRoom } from './OnlineRoom'

interface OnlineGameProps {
  onExit: () => void
  /** Room code from a shared invite link — opens the lobby on the Join tab. */
  initialRoomCode?: string
}

/** Online mode: pick/create a room, then play the match. */
export function OnlineGame({ onExit, initialRoomCode }: OnlineGameProps) {
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
        onStart={(next, nextDraft) => {
          setDraft(nextDraft)
          setParams(next)
        }}
      />
    )
  }

  // Leaving the room returns to the lobby so you can start/join another.
  return <OnlineRoom {...params} onLeave={() => setParams(null)} />
}
