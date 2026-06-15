import { useState } from 'react'
import { OnlineLobby, type LobbyDraft, type RoomParams } from '../../online/OnlineLobby'
import { BACKGAMMON_COLORS } from '../../../backgammon/config'
import { BackgammonOnlineRoom } from './BackgammonOnlineRoom'

interface BackgammonOnlineGameProps {
  onExit: () => void
  /** Room code from a shared invite link — opens the lobby on the Join tab. */
  initialRoomCode?: string
}

/** Online Backgammon: pick/create a room, then play. Mirrors `FourOnlineGame`. */
export function BackgammonOnlineGame({ onExit, initialRoomCode }: BackgammonOnlineGameProps) {
  const [params, setParams] = useState<RoomParams | null>(null)
  const [draft, setDraft] = useState<LobbyDraft | undefined>(undefined)

  if (!params) {
    return (
      <OnlineLobby
        onBack={onExit}
        initial={draft}
        initialCode={initialRoomCode}
        colors={BACKGAMMON_COLORS}
        onStart={(next, nextDraft) => {
          setDraft(nextDraft)
          setParams(next)
        }}
      />
    )
  }

  return <BackgammonOnlineRoom {...params} onLeave={() => setParams(null)} />
}
