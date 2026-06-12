import { useRef, useState } from 'react'
import { OnlineLobby, type LobbyDraft, type RoomParams } from '../../online/OnlineLobby'
import { LUDO_COLORS } from '../../../ludo/config'
import { LudoOnlineRoom } from './LudoOnlineRoom'

/** Online Ludo: pick/create a room, then play the match. Mirrors `OnlineGame`. */
export function LudoOnlineGame({ onExit }: { onExit: () => void }) {
  const [params, setParams] = useState<RoomParams | null>(null)
  // Remember the last lobby entries so a bounced-back joiner (name/color taken,
  // room full…) returns with their values preserved.
  const draftRef = useRef<LobbyDraft | undefined>(undefined)

  if (!params) {
    return (
      <OnlineLobby
        onBack={onExit}
        initial={draftRef.current}
        colors={LUDO_COLORS}
        onStart={(next, draft) => {
          draftRef.current = draft
          setParams(next)
        }}
      />
    )
  }

  // Leaving the room returns to the lobby so you can start/join another.
  return <LudoOnlineRoom {...params} onLeave={() => setParams(null)} />
}
