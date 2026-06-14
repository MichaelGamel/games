import { useState } from 'react'
import { OnlineLobby, type LobbyDraft, type RoomParams } from '../online/OnlineLobby'
import { XO_COLORS } from '../../xo/config'
import { XOOnlineRoom } from './XOOnlineRoom'

interface XOOnlineGameProps {
  onExit: () => void
  /** Room code from a shared invite link — opens the lobby on the Join tab. */
  initialRoomCode?: string
}

/** Online Tic-Tac-Toe: pick/create a room, then play. Mirrors `FourOnlineGame`. */
export function XOOnlineGame({ onExit, initialRoomCode }: XOOnlineGameProps) {
  const [params, setParams] = useState<RoomParams | null>(null)
  // Remember the last lobby entries so a bounced-back joiner returns pre-filled.
  const [draft, setDraft] = useState<LobbyDraft | undefined>(undefined)

  if (!params) {
    return (
      <OnlineLobby
        onBack={onExit}
        initial={draft}
        initialCode={initialRoomCode}
        colors={XO_COLORS}
        onStart={(next, nextDraft) => {
          setDraft(nextDraft)
          setParams(next)
        }}
      />
    )
  }

  return <XOOnlineRoom {...params} onLeave={() => setParams(null)} />
}
