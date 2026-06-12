/**
 * Game-agnostic chrome shared by every online room (Snakes, Ludo, …): the
 * transient notices, the host's late-joiner prompt, and the pre-match waiting
 * room. None of it touches game state — it only reflects roster/presence — so
 * both `OnlineRoom` and `LudoOnlineRoom` render the identical lobby without
 * duplicating it (DRY).
 */
import { AnimatePresence, m } from 'motion/react'
import { MAX_PLAYERS, MIN_PLAYERS, reasonText, type RejectReason } from '../../net/roster'
import type { RoomMember, RoomStatus, Role } from '../../net/types'
import { cn } from '../../lib/cn'

/** Transient join/leave/skip announcements, stacked top-center. */
export function Notices({ notices }: { notices: { id: number; text: string }[] }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-40 flex flex-col items-center gap-1.5 px-4">
      <AnimatePresence>
        {notices.map((n) => (
          <m.p
            key={n.id}
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="rounded-full bg-night-800/95 px-4 py-2 text-sm font-semibold text-white shadow-lg ring-1 ring-white/15 backdrop-blur"
            role="status"
          >
            {n.text}
          </m.p>
        ))}
      </AnimatePresence>
    </div>
  )
}

interface JoinRequestsProps {
  requests: RoomMember[]
  canAccept: boolean
  onAccept: (m: RoomMember) => void
  onReject: (m: RoomMember) => void
}

/** Host-only prompt: incoming requests to join the live match. */
export function JoinRequests({ requests, canAccept, onAccept, onReject }: JoinRequestsProps) {
  return (
    <div className="fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {requests.map((member) => (
          <m.div
            key={member.clientId}
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
                style={{ background: member.color }}
                aria-hidden="true"
              />
              <span className="flex-1 truncate text-base font-semibold text-white">{member.name}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => onAccept(member)}
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
                onClick={() => onReject(member)}
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
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export interface WaitingRoomProps {
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

export function WaitingRoom({
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
    <m.div
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
              <m.button
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
              </m.button>
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
    </m.div>
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
      <m.p
        className="text-2xl"
        animate={{ rotate: [0, 12, -12, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden="true"
      >
        ✋
      </m.p>
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
