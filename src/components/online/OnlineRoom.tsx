import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useSnakesAndLadders } from '../../hooks/useSnakesAndLadders'
import { useRoom } from '../../net/useRoom'
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  computeRoster,
  reasonText,
  type RejectReason,
} from '../../net/roster'
import type {
  PlayerProfile,
  RoomMember,
  RoomMessage,
  RoomStatus,
  Role,
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
  const applyStartRef = useRef<(players: StartPlayer[]) => void>(() => {})

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
    onMessage: (msg) => {
      if (msg.event === 'start') applyStartRef.current(msg.players)
      else if (msg.event === 'turn') game.applyRemoteTurn(msg.resolution)
      else if (msg.event === 'reset') game.applyRemoteReset()
    },
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
  applyStartRef.current = applyStart

  const { seats, rejected } = useMemo(() => computeRoster(room.members), [room.members])
  const myReason: RejectReason | null = rejected.get(myClientId) ?? null

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

interface WaitingRoomProps {
  code: string
  role: Role
  status: RoomStatus
  testMode: boolean
  seats: RoomMember[]
  myClientId: string
  rejection: RejectReason | null
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
        ) : rejection ? (
          <RejectionCard reason={rejection} onBack={onLeave} />
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
