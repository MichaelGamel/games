/**
 * Game-agnostic chrome shared by every online room (Snakes, Ludo, …): the
 * transient notices, the host's late-joiner prompt, and the pre-match waiting
 * room. None of it touches game state — it only reflects roster/presence — so
 * both `OnlineRoom` and `LudoOnlineRoom` render the identical lobby without
 * duplicating it (DRY).
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { MAX_PLAYERS, MIN_PLAYERS, type RejectReason } from '../../net/roster'
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
  const { t } = useTranslation('online')
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
              {t('joinRequests.wantsToJoin')}
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
                {t('joinRequests.accept')}
              </button>
              <button
                type="button"
                onClick={() => onReject(member)}
                className="flex-1 rounded-lg bg-white/10 px-4 py-2 text-sm font-bold text-white/80 ring-1 ring-white/15 transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {t('joinRequests.reject')}
              </button>
            </div>
            {!canAccept && (
              <p className="mt-2 text-center text-xs text-white/45">
                {t('joinRequests.betweenTurns')}
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
  /** Seats this game supports (display only; default 4). */
  maxPlayers?: number
  /** Host-only: the game's rule controls, rendered above the Start button. */
  settings?: ReactNode
  /** Offered on a full room: watch the match without a seat. */
  onSpectate?: () => void
  /** True once this client asked to spectate and is waiting for the state. */
  spectatePending?: boolean
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
  maxPlayers = MAX_PLAYERS,
  settings,
  onSpectate,
  spectatePending,
  onStart,
  onLeave,
}: WaitingRoomProps) {
  const { t } = useTranslation(['online', 'common'])
  const copyCode = () => {
    navigator.clipboard?.writeText(code).catch(() => {})
  }

  // One-tap invite: a deep link that opens this game's lobby with the code
  // pre-filled on the Join tab (`?room=CODE`, handled by each game's App).
  const [linkCopied, setLinkCopied] = useState(false)
  const copyInviteLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${code}`
    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setLinkCopied(true)
        setTimeout(() => setLinkCopied(false), 2000)
      })
      .catch(() => {})
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
        ← {t('online:waiting.leave')}
      </button>

      <div className="w-full max-w-md rounded-2xl bg-white/5 p-8 text-center ring-1 ring-white/10 backdrop-blur">
        {status === 'error' ? (
          <>
            <p className="text-2xl">⚠️</p>
            <h2 className="mt-3 text-xl font-bold text-white">{t('online:waiting.connectErrorTitle')}</h2>
            <p className="mt-2 text-sm text-white/60">{t('online:waiting.connectErrorBody')}</p>
          </>
        ) : spectatePending ? (
          <SpectatePendingCard onCancel={onLeave} />
        ) : declined ? (
          <DeclinedCard onBack={onLeave} />
        ) : rejection ? (
          <RejectionCard
            reason={rejection}
            onBack={onLeave}
            onSpectate={rejection === 'full' ? onSpectate : undefined}
          />
        ) : pendingApproval ? (
          <PendingCard onCancel={onLeave} />
        ) : (
          <>
            {role === 'host' ? (
              <>
                <h2 className="text-xl font-bold text-white">{t('online:waiting.shareCode')}</h2>
                <p className="mt-1 text-sm text-white/60">{t('online:waiting.shareHint')}</p>
                <button
                  type="button"
                  onClick={copyCode}
                  className="mx-auto mt-4 flex items-center gap-3 rounded-xl bg-night-900/60 px-6 py-3 font-mono text-4xl tracking-[0.3em] text-white ring-1 ring-white/15 transition hover:bg-night-900/80"
                  aria-label={t('online:waiting.codeAria', { code })}
                >
                  {code}
                  <span className="text-base" aria-hidden="true">
                    📋
                  </span>
                </button>
                <button
                  type="button"
                  onClick={copyInviteLink}
                  className="mx-auto mt-3 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-white/70 ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                >
                  <span aria-hidden="true">🔗</span>
                  {linkCopied ? t('online:waiting.linkCopied') : t('online:waiting.copyInvite')}
                </button>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold text-white">{t('online:waiting.joinedRoom')}</h2>
                <p className="mt-2 font-mono text-3xl tracking-[0.3em] text-white">{code}</p>
              </>
            )}

            <Roster seats={seats} myClientId={myClientId} maxPlayers={maxPlayers} />

            {settings && <div className="mt-5">{settings}</div>}

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
                {canStart
                  ? t('common:actions.startGame')
                  : t('online:waiting.waitingForPlayers', { min: MIN_PLAYERS })}
              </m.button>
            ) : (
              <p className="mt-5 text-sm text-white/70">{t('online:waiting.waitingForHost')}</p>
            )}

            {testMode && (
              <p className="mt-4 rounded-lg bg-white/5 px-3 py-2 text-xs text-white/45">
                {t('online:waiting.testModeHint')}
              </p>
            )}
          </>
        )}
      </div>
    </m.div>
  )
}

function Roster({
  seats,
  myClientId,
  maxPlayers,
}: {
  seats: RoomMember[]
  myClientId: string
  maxPlayers: number
}) {
  const { t } = useTranslation(['online', 'common'])
  return (
    <div className="mt-6">
      <p className="mb-2 text-xs uppercase tracking-wide text-white/45">
        {t('online:waiting.playersCount', { count: seats.length, max: maxPlayers })}
      </p>
      <ul className="flex flex-col gap-2" aria-label={t('online:waiting.playersAria')}>
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
                <span className="ms-1 text-xs font-normal text-white/50">
                  {t('common:game.you')}
                </span>
              )}
              {m.role === 'host' && (
                <span className="ms-1 text-xs font-normal text-amber-300/80">
                  {t('online:waiting.host')}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Translation keys per rejection reason. */
const REJECT_KEYS = {
  full: { title: 'reject.fullTitle', detail: 'reject.fullDetail' },
  'name-taken': { title: 'reject.nameTakenTitle', detail: 'reject.nameTakenDetail' },
  'color-taken': { title: 'reject.colorTakenTitle', detail: 'reject.colorTakenDetail' },
} as const

function RejectionCard({
  reason,
  onBack,
  onSpectate,
}: {
  reason: RejectReason
  onBack: () => void
  /** Offered when the room is merely full — you can still watch. */
  onSpectate?: () => void
}) {
  const { t } = useTranslation('online')
  const keys = REJECT_KEYS[reason]
  return (
    <>
      <p className="text-2xl">🚫</p>
      <h2 className="mt-3 text-xl font-bold text-white">{t(keys.title)}</h2>
      <p className="mt-2 text-sm text-white/60">{t(keys.detail)}</p>
      <div className="mx-auto mt-5 flex flex-col gap-2">
        {onSpectate && (
          <button
            type="button"
            onClick={onSpectate}
            className="rounded-xl bg-linear-to-r from-sky-500 to-sky-400 px-6 py-2.5 font-bold text-white shadow-lg ring-1 ring-white/20 transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {t('reject.watchInstead')}
          </button>
        )}
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl bg-linear-to-r from-grape to-grape-light px-6 py-2.5 font-bold text-white shadow-lg ring-1 ring-white/20 transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {t('reject.backToChange')}
        </button>
      </div>
    </>
  )
}

/** Spectator: asked to watch and waiting for a seated player to send state. */
function SpectatePendingCard({ onCancel }: { onCancel: () => void }) {
  const { t } = useTranslation(['online', 'common'])
  return (
    <>
      <m.p
        className="text-2xl"
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden="true"
      >
        👀
      </m.p>
      <h2 className="mt-3 text-xl font-bold text-white">{t('online:spectate.title')}</h2>
      <p className="mt-2 text-sm text-white/60">{t('online:spectate.body')}</p>
      <button
        type="button"
        onClick={onCancel}
        className="mx-auto mt-5 rounded-xl bg-white/10 px-6 py-2.5 font-bold text-white/80 ring-1 ring-white/15 transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        {t('common:actions.cancel')}
      </button>
    </>
  )
}

/** Late joiner: a match is running and the host has been asked to let us in. */
function PendingCard({ onCancel }: { onCancel: () => void }) {
  const { t } = useTranslation(['online', 'common'])
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
      <h2 className="mt-3 text-xl font-bold text-white">{t('online:pending.title')}</h2>
      <p className="mt-2 text-sm text-white/60">{t('online:pending.body')}</p>
      <button
        type="button"
        onClick={onCancel}
        className="mx-auto mt-5 rounded-xl bg-white/10 px-6 py-2.5 font-bold text-white/80 ring-1 ring-white/15 transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        {t('common:actions.cancel')}
      </button>
    </>
  )
}

/** Late joiner: the host declined our request. */
function DeclinedCard({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation('online')
  return (
    <>
      <p className="text-2xl">🚫</p>
      <h2 className="mt-3 text-xl font-bold text-white">{t('reject.declinedTitle')}</h2>
      <p className="mt-2 text-sm text-white/60">{t('reject.declinedBody')}</p>
      <button
        type="button"
        onClick={onBack}
        className="mx-auto mt-5 rounded-xl bg-linear-to-r from-grape to-grape-light px-6 py-2.5 font-bold text-white shadow-lg ring-1 ring-white/20 transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        {t('reject.backToLobby')}
      </button>
    </>
  )
}
