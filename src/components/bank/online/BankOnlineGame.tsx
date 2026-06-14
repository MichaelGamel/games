import { useState } from 'react'
import { OnlineLobby, type LobbyDraft, type RoomParams } from '../../online/OnlineLobby'
import { BANK_COLORS } from '../../../bank/config'
import { BankOnlineRoom } from './BankOnlineRoom'

interface BankOnlineGameProps {
  onExit: () => void
  /** Room code from a shared invite link — opens the lobby on the Join tab. */
  initialRoomCode?: string
}

/** Online Bank El-Hazz: pick/create a room, then play the match. Mirrors
 *  `LudoOnlineGame`. */
export function BankOnlineGame({ onExit, initialRoomCode }: BankOnlineGameProps) {
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
        colors={BANK_COLORS}
        onStart={(next, nextDraft) => {
          setDraft(nextDraft)
          setParams(next)
        }}
      />
    )
  }

  // Leaving the room returns to the lobby so you can start/join another.
  return <BankOnlineRoom {...params} onLeave={() => setParams(null)} />
}
