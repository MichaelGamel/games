import { useRef, useState } from 'react'
import { OnlineLobby, type LobbyDraft, type RoomParams } from './OnlineLobby'
import { OnlineRoom } from './OnlineRoom'

/** Online mode: pick/create a room, then play the match. */
export function OnlineGame({ onExit }: { onExit: () => void }) {
  const [params, setParams] = useState<RoomParams | null>(null)
  // Remember the last lobby entries so a bounced-back joiner (name/color taken,
  // room full…) returns with their values preserved.
  const draftRef = useRef<LobbyDraft | undefined>(undefined)

  if (!params) {
    return (
      <OnlineLobby
        onBack={onExit}
        initial={draftRef.current}
        onStart={(next, draft) => {
          draftRef.current = draft
          setParams(next)
        }}
      />
    )
  }

  // Leaving the room returns to the lobby so you can start/join another.
  return <OnlineRoom {...params} onLeave={() => setParams(null)} />
}
