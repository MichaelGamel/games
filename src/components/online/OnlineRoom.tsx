import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useSnakesAndLadders } from '../../hooks/useSnakesAndLadders'
import { useRoom } from '../../net/useRoom'
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  computeRoster,
  orderMembers,
  reasonText,
  type RejectReason,
} from '../../net/roster'
import type {
  PlayerProfile,
  RoomMember,
  RoomMessage,
  RoomStatus,
  Role,
  RunningSnapshot,
  StartPlayer,
} from '../../net/types'
import { GameScreen } from '../GameScreen'
import { WinnerOverlay } from '../WinnerOverlay'
import { cn } from '../../lib/cn'

interface OnlineRoomProps {
  code: string
  role: Role
  profile: PlayerProfile
  onLeave: () => void
}

/**
 * One online match. Owns both the game controller and the room connection and
 * wires them together: local rolls/starts are broadcast; incoming messages are
 * applied as remote turns/starts. The host chooses when to start (so players can
 * keep joining up to {@link MAX_PLAYERS}); every client locates its own seat in
 * the authoritative start payload by clientId.
 */
export function OnlineRoom({ code, role, profile, onLeave }: OnlineRoomProps) {
  // This client's seat (player index). Unknown until the match starts.
  const [seat, setSeat] = useState<number | null>(null)
  const [startedPlayers, setStartedPlayers] = useState<StartPlayer[] | null>(null)
  const startedRef = useRef<StartPlayer[] | null>(null)
  const sendRef = useRef<((m: RoomMessage) => void) | null>(null)
  const handleMessageRef = useRef<(m: RoomMessage) => void>(() => {})
  // Host-only: late joiners we have already turned down, so they drop out of the
  // request prompt even though they stay connected.
  const [declinedIds, setDeclinedIds] = useState<ReadonlySet<string>>(() => new Set())
  // Late joiner: the host declined our request to join the running match.
  const [declined, setDeclined] = useState(false)

  const game = useSnakesAndLadders({
    controlsPlayer: seat ?? -1,
    hooks: {
      onLocalTurn: (resolution) => sendRef.current?.({ event: 'turn', resolution }),
    },
  })

  const room = useRoom({
    code,
    role,
    profile,
    onMessage: (msg) => handleMessageRef.current(msg),
  })
  sendRef.current = room.send
  const myClientId = room.clientId

  // Lock in a started match: find our seat, remember the lineup, flag presence.
  const applyStart = (players: StartPlayer[]) => {
    startedRef.current = players
    setStartedPlayers(players)
    const mySeat = players.findIndex((p) => p.clientId === myClientId)
    setSeat(mySeat >= 0 ? mySeat : null)
    room.setInGame(true)
    game.applyRemoteStart(players.map(({ name, color }) => ({ name, color })))
  }

  // Apply a host-approved late joiner. The approved client itself rebuilds the
  // whole match from the snapshot (it never saw `start`); everyone else simply
  // appends the newcomer to their lineup. Idempotent against duplicate delivery.
  const applyAddPlayer = (newPlayer: StartPlayer, snapshot: RunningSnapshot) => {
    if (newPlayer.clientId === myClientId) {
      startedRef.current = snapshot.lineup
      setStartedPlayers(snapshot.lineup)
      const mySeat = snapshot.lineup.findIndex((p) => p.clientId === myClientId)
      setSeat(mySeat >= 0 ? mySeat : null)
      room.setInGame(true)
      game.loadSnapshot({
        players: snapshot.lineup.map((p, i) => ({
          name: p.name,
          color: p.color,
          position: snapshot.positions[i] ?? 0,
        })),
        currentPlayerIndex: snapshot.currentPlayerIndex,
        lastRoll: snapshot.lastRoll,
        winnerId: snapshot.winnerId,
      })
      return
    }
    const current = startedRef.current
    if (!current || current.some((p) => p.clientId === newPlayer.clientId)) return
    const next = [...current, newPlayer]
    startedRef.current = next
    setStartedPlayers(next)
    game.addPlayer({ name: newPlayer.name, color: newPlayer.color })
  }

  handleMessageRef.current = (msg: RoomMessage) => {
    if (msg.event === 'start') applyStart(msg.players)
    else if (msg.event === 'turn') game.applyRemoteTurn(msg.resolution)
    else if (msg.event === 'reset') game.applyRemoteReset()
    else if (msg.event === 'add-player') applyAddPlayer(msg.player, msg.snapshot)
    else if (msg.event === 'reject-join' && msg.clientId === myClientId) setDeclined(true)
  }

  // The joiner's own status (pending / full / name-or-color clash) is derived
  // from presence: a late joiner reliably sees the seated players' `inGame`
  // flag, so computeRoster tells them whether they fit, collide, or must wait.
  const { seats, pending, rejected } = useMemo(() => computeRoster(room.members), [room.members])
  const myReason: RejectReason | null = rejected.get(myClientId) ?? null
  const amPending = pending.some((p) => p.clientId === myClientId)

  // Host: which late joiners to prompt about. We derive this from the host's own
  // authoritative game state (game.players / startedPlayers) rather than the
  // aggregated `inGame` presence flag — a client doesn't reliably read its own
  // `inGame` back, so presence alone would hide the running match from the host.
  // A request is anyone connected who isn't seated, isn't declined, and doesn't
  // clash with a seated name/color; we surface only as many as there are seats.
  const joinRequests = useMemo<RoomMember[]>(() => {
    if (role !== 'host' || game.phase === 'setup') return []
    const openSeats = MAX_PLAYERS - game.players.length
    if (openSeats <= 0) return []
    const lineupIds = new Set((startedPlayers ?? []).map((p) => p.clientId))
    const lineupNames = new Set(game.players.map((p) => p.name.trim().toLowerCase()))
    const lineupColors = new Set(game.players.map((p) => p.color))
    return orderMembers(room.members)
      .filter(
        (m) =>
          m.clientId !== myClientId &&
          !lineupIds.has(m.clientId) &&
          !declinedIds.has(m.clientId) &&
          !lineupNames.has(m.name.trim().toLowerCase()) &&
          !lineupColors.has(m.color),
      )
      .slice(0, openSeats)
  }, [role, game.phase, game.players, startedPlayers, room.members, declinedIds, myClientId])

  // Host: broadcast the authoritative lineup, then everyone applies it.
  const startMatch = () => {
    const players: StartPlayer[] = seats.map((m) => ({
      clientId: m.clientId,
      name: m.name,
      color: m.color,
    }))
    applyStart(players)
    room.send({ event: 'start', players })
  }

  // Play Again: replay the same lineup (idempotent — any player may trigger it).
  const restartMatch = () => {
    const players = startedRef.current
    if (!players) return
    applyStart(players)
    room.send({ event: 'start', players })
  }

  // Host: admit a late joiner into the live match. Only between turns (so the
  // newcomer can't miss an in-flight roll) and only while a seat is open.
  const canAdmit = game.phase === 'idle' && game.players.length < MAX_PLAYERS
  const acceptJoiner = (member: RoomMember) => {
    const current = startedRef.current
    if (!current || !canAdmit) return
    if (current.some((p) => p.clientId === member.clientId)) return
    const newPlayer: StartPlayer = {
      clientId: member.clientId,
      name: member.name,
      color: member.color,
    }
    const lineup = [...current, newPlayer]
    const snapshot: RunningSnapshot = {
      lineup,
      positions: lineup.map((_, i) => game.players[i]?.position ?? 0),
      currentPlayerIndex: game.currentPlayerIndex,
      lastRoll: game.lastRoll,
      winnerId: game.winnerId,
    }
    applyAddPlayer(newPlayer, snapshot)
    room.send({ event: 'add-player', player: newPlayer, snapshot })
  }

  // Host: turn a late joiner away (they return to the lobby).
  const rejectJoiner = (member: RoomMember) => {
    setDeclinedIds((prev) => new Set(prev).add(member.clientId))
    room.send({ event: 'reject-join', clientId: member.clientId })
  }

  const canStart = role === 'host' && game.phase === 'setup' && seats.length >= MIN_PLAYERS

  const rosterIds = useMemo(() => new Set(room.members.map((m) => m.clientId)), [room.members])
  const everyonePresent = startedPlayers
    ? startedPlayers.every((p) => p.clientId === myClientId || rosterIds.has(p.clientId))
    : false

  if (game.phase === 'setup') {
    return (
      <WaitingRoom
        code={code}
        role={role}
        status={room.status}
        testMode={room.testMode}
        seats={seats}
        myClientId={myClientId}
        rejection={myReason}
        declined={declined}
        pendingApproval={amPending}
        canStart={canStart}
        onStart={startMatch}
        onLeave={onLeave}
      />
    )
  }

  return (
    <>
      <GameScreen
        game={game}
        online={{
          roomCode: code,
          everyonePresent,
          testMode: room.testMode,
          onLeave,
        }}
      />
      {role === 'host' && game.phase !== 'won' && joinRequests.length > 0 && (
        <JoinRequests
          requests={joinRequests}
          canAccept={canAdmit}
          onAccept={acceptJoiner}
          onReject={rejectJoiner}
        />
      )}
      <AnimatePresence>
        {game.phase === 'won' && game.winner && (
          <WinnerOverlay
            key="winner"
            winner={game.winner}
            onPlayAgain={restartMatch}
            onSecondary={onLeave}
            secondaryLabel="Leave"
          />
        )}
      </AnimatePresence>
    </>
  )
}

interface JoinRequestsProps {
  requests: RoomMember[]
  canAccept: boolean
  onAccept: (m: RoomMember) => void
  onReject: (m: RoomMember) => void
}

/** Host-only prompt: incoming requests to join the live match. */
function JoinRequests({ requests, canAccept, onAccept, onReject }: JoinRequestsProps) {
  return (
    <div className="fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {requests.map((m) => (
          <motion.div
            key={m.clientId}
            initial={{ opacity: 0, y: -24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -24, scale: 0.96 }}
            className="w-full max-w-sm rounded-2xl bg-night-800/95 p-4 shadow-xl ring-1 ring-white/15 backdrop-blur"
            role="alert"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-white/45">
              Wants to join
            </p>
            <div className="mt-2 flex items-center gap-3">
              <span
                className="h-7 w-7 shrink-0 rounded-full ring-2 ring-white/40"
                style={{ background: m.color }}
                aria-hidden="true"
              />
              <span className="flex-1 truncate text-base font-semibold text-white">{m.name}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => onAccept(m)}
                disabled={!canAccept}
                className={cn(
                  'flex-1 rounded-lg bg-linear-to-r from-emerald-500 to-emerald-400 px-4 py-2 text-sm font-bold text-white shadow ring-1 ring-white/20 transition',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
                  canAccept ? 'hover:brightness-110' : 'cursor-not-allowed opacity-50',
                )}
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => onReject(m)}
                className="flex-1 rounded-lg bg-white/10 px-4 py-2 text-sm font-bold text-white/80 ring-1 ring-white/15 transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Reject
              </button>
            </div>
            {!canAccept && (
              <p className="mt-2 text-center text-xs text-white/45">
                You can let players in between turns.
              </p>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

interface WaitingRoomProps {
  code: string
  role: Role
  status: RoomStatus
  testMode: boolean
  seats: RoomMember[]
  myClientId: string
  rejection: RejectReason | null
  /** Host declined our request to join the running match. */
  declined: boolean
  /** A match is already running and we are waiting for the host to let us in. */
  pendingApproval: boolean
  canStart: boolean
  onStart: () => void
  onLeave: () => void
}

function WaitingRoom({
  code,
  role,
  status,
  testMode,
  seats,
  myClientId,
  rejection,
  declined,
  pendingApproval,
  canStart,
  onStart,
  onLeave,
}: WaitingRoomProps) {
  const copyCode = () => {
    navigator.clipboard?.writeText(code).catch(() => {})
  }

  return (
    <motion.div
      key="waiting"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10"
    >
      <button
        type="button"
        onClick={onLeave}
        className="absolute left-4 top-4 rounded-lg px-3 py-1.5 text-sm text-white/70 ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        ← Leave
      </button>

      <div className="w-full max-w-md rounded-2xl bg-white/5 p-8 text-center ring-1 ring-white/10 backdrop-blur">
        {status === 'error' ? (
          <>
            <p className="text-2xl">⚠️</p>
            <h2 className="mt-3 text-xl font-bold text-white">Couldn't connect</h2>
            <p className="mt-2 text-sm text-white/60">
              Online play isn't configured. Add your Supabase keys and redeploy, or run locally in
              dev test mode.
            </p>
          </>
        ) : declined ? (
          <DeclinedCard onBack={onLeave} />
        ) : rejection ? (
          <RejectionCard reason={rejection} onBack={onLeave} />
        ) : pendingApproval ? (
          <PendingCard onCancel={onLeave} />
        ) : (
          <>
            {role === 'host' ? (
              <>
                <h2 className="text-xl font-bold text-white">Share this code</h2>
                <p className="mt-1 text-sm text-white/60">
                  Friends enter it on the “Join room” screen.
                </p>
                <button
                  type="button"
                  onClick={copyCode}
                  className="mx-auto mt-4 flex items-center gap-3 rounded-xl bg-night-900/60 px-6 py-3 font-mono text-4xl tracking-[0.3em] text-white ring-1 ring-white/15 transition hover:bg-night-900/80"
                  aria-label={`Room code ${code}, click to copy`}
                >
                  {code}
                  <span className="text-base" aria-hidden="true">
                    📋
                  </span>
                </button>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold text-white">Joined room</h2>
                <p className="mt-2 font-mono text-3xl tracking-[0.3em] text-white">{code}</p>
              </>
            )}

            <Roster seats={seats} myClientId={myClientId} />

            {role === 'host' ? (
              <motion.button
                type="button"
                onClick={onStart}
                disabled={!canStart}
                whileHover={canStart ? { scale: 1.03 } : undefined}
                whileTap={canStart ? { scale: 0.97 } : undefined}
                className={cn(
                  'mt-5 w-full rounded-xl bg-linear-to-r from-grape to-grape-light px-6 py-3 text-lg font-bold text-white shadow-lg ring-1 ring-white/20 transition',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
                  !canStart && 'cursor-not-allowed opacity-50',
                )}
              >
                {canStart ? 'Start Game ▶' : `Waiting for players… (need ${MIN_PLAYERS}+)`}
              </motion.button>
            ) : (
              <p className="mt-5 text-sm text-white/70">Waiting for the host to start…</p>
            )}

            {testMode && (
              <p className="mt-4 rounded-lg bg-white/5 px-3 py-2 text-xs text-white/45">
                Test mode: works across tabs in this browser only. Add Supabase keys for real
                cross-computer play.
              </p>
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}

function Roster({ seats, myClientId }: { seats: RoomMember[]; myClientId: string }) {
  return (
    <div className="mt-6">
      <p className="mb-2 text-xs uppercase tracking-wide text-white/45">
        Players {seats.length}/{MAX_PLAYERS}
      </p>
      <ul className="flex flex-col gap-2" aria-label="Players in room">
        {seats.map((m) => (
          <li
            key={m.clientId}
            className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10"
          >
            <span
              className="h-5 w-5 shrink-0 rounded-full ring-2 ring-white/40"
              style={{ background: m.color }}
              aria-hidden="true"
            />
            <span className="truncate text-sm font-semibold text-white">
              {m.name}
              {m.clientId === myClientId && (
                <span className="ml-1 text-xs font-normal text-white/50">(you)</span>
              )}
              {m.role === 'host' && (
                <span className="ml-1 text-xs font-normal text-amber-300/80">host</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function RejectionCard({ reason, onBack }: { reason: RejectReason; onBack: () => void }) {
  const { title, detail } = reasonText(reason)
  return (
    <>
      <p className="text-2xl">🚫</p>
      <h2 className="mt-3 text-xl font-bold text-white">{title}</h2>
      <p className="mt-2 text-sm text-white/60">{detail}</p>
      <button
        type="button"
        onClick={onBack}
        className="mx-auto mt-5 rounded-xl bg-linear-to-r from-grape to-grape-light px-6 py-2.5 font-bold text-white shadow-lg ring-1 ring-white/20 transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        ← Back to change
      </button>
    </>
  )
}

/** Late joiner: a match is running and the host has been asked to let us in. */
function PendingCard({ onCancel }: { onCancel: () => void }) {
  return (
    <>
      <motion.p
        className="text-2xl"
        animate={{ rotate: [0, 12, -12, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden="true"
      >
        ✋
      </motion.p>
      <h2 className="mt-3 text-xl font-bold text-white">Asking the host…</h2>
      <p className="mt-2 text-sm text-white/60">
        This match is already in progress. The host has been asked to let you in — hang tight.
      </p>
      <button
        type="button"
        onClick={onCancel}
        className="mx-auto mt-5 rounded-xl bg-white/10 px-6 py-2.5 font-bold text-white/80 ring-1 ring-white/15 transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        Cancel
      </button>
    </>
  )
}

/** Late joiner: the host declined our request. */
function DeclinedCard({ onBack }: { onBack: () => void }) {
  return (
    <>
      <p className="text-2xl">🚫</p>
      <h2 className="mt-3 text-xl font-bold text-white">Not this time</h2>
      <p className="mt-2 text-sm text-white/60">
        The host declined your request to join. You can try a different room.
      </p>
      <button
        type="button"
        onClick={onBack}
        className="mx-auto mt-5 rounded-xl bg-linear-to-r from-grape to-grape-light px-6 py-2.5 font-bold text-white shadow-lg ring-1 ring-white/20 transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        ← Back to lobby
      </button>
    </>
  )
}
