import { useState } from 'react'
import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { TOKEN_COLORS, type ColorOption } from '../../game/config'
import type { PlayerProfile, Role } from '../../net/types'
import { loadLocal, saveLocal } from '../../lib/storage'
import { useOnline } from '../../lib/useOnline'
import { cn } from '../../lib/cn'

export interface RoomParams {
  code: string
  role: Role
  profile: PlayerProfile
}

/** The raw lobby entries, kept so a bounced-back joiner returns pre-filled. */
export interface LobbyDraft {
  tab: 'create' | 'join'
  name: string
  color: string
  code: string
}

interface OnlineLobbyProps {
  onBack: () => void
  onStart: (params: RoomParams, draft: LobbyDraft) => void
  initial?: LobbyDraft
  /** Pre-filled room code from a shared invite link (`?room=CODE`). */
  initialCode?: string
  /** Token palette to choose from; defaults to the Snakes set. Ludo passes its own. */
  colors?: readonly ColorOption[]
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no ambiguous chars
const genCode = () =>
  Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('')

/** "Remember me": last-used name + color, shared by every game's lobby. */
const PROFILE_KEY = 'rg-profile-v1'
interface StoredProfile {
  name: string
  color: string
}

export function OnlineLobby({ onBack, onStart, initial, initialCode, colors }: OnlineLobbyProps) {
  const { t } = useTranslation(['online', 'common'])
  const palette = colors ?? TOKEN_COLORS
  const [tab, setTab] = useState<'create' | 'join'>(
    initial?.tab ?? (initialCode ? 'join' : 'create'),
  )
  // Prefill from the remembered profile unless a bounce-back already carries
  // fresher values. Loaded once in the initializers (storage never changes
  // while the lobby is open).
  const [remembered] = useState<StoredProfile | null>(() =>
    initial ? null : loadLocal<StoredProfile | null>(PROFILE_KEY, null),
  )
  const [name, setName] = useState(initial?.name ?? remembered?.name ?? '')
  const [color, setColor] = useState(() => {
    if (initial?.color) return initial.color
    if (remembered && palette.some((c) => c.value === remembered.color)) return remembered.color
    return palette[0].value
  })
  const [code, setCode] = useState(initial?.code ?? initialCode ?? '')

  // Both creating and joining open a live Realtime connection, so the whole
  // lobby is gated while offline; local pass-and-play is unaffected.
  const offline = !useOnline()
  const submitDisabled = (tab === 'join' && code.trim().length < 4) || offline

  const handleSubmit = () => {
    const cleanName = name.trim() || t('online:lobby.namePlaceholder')
    const profile: PlayerProfile = { name: cleanName, color }
    const draft: LobbyDraft = { tab, name: cleanName, color, code }
    saveLocal<StoredProfile>(PROFILE_KEY, { name: cleanName, color })
    if (tab === 'create') {
      onStart({ code: genCode(), role: 'host', profile }, draft)
    } else {
      onStart({ code: code.trim().toUpperCase(), role: 'guest', profile }, draft)
    }
  }

  return (
    <m.div
      key="lobby"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="relative z-10 flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10"
    >
      <button
        type="button"
        onClick={onBack}
        className="absolute left-4 top-4 rounded-lg px-3 py-1.5 text-sm text-white/70 ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        ← {t('common:menu.back')}
      </button>

      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow sm:text-4xl">
          {t('online:lobby.title')}
        </h1>
        <p className="mt-2 text-white/70">{t('online:lobby.subtitle')}</p>
      </header>

      {offline && (
        <div
          role="status"
          className="w-full max-w-sm rounded-2xl bg-amber-400/10 p-4 text-center ring-1 ring-amber-300/30"
        >
          <p className="text-sm font-semibold text-amber-200">{t('online:lobby.offlineTitle')}</p>
          <p className="mt-1 text-xs text-white/70">{t('online:lobby.offlineBody')}</p>
        </div>
      )}

      <div className="w-full max-w-sm rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur">
        {/* Create / Join toggle */}
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-night-900/50 p-1">
          {(['create', 'join'] as const).map((tabId) => (
            <button
              key={tabId}
              type="button"
              onClick={() => setTab(tabId)}
              className={cn(
                'rounded-lg py-2 text-sm font-semibold transition',
                tab === tabId ? 'bg-grape text-white shadow' : 'text-white/60 hover:text-white',
              )}
            >
              {tabId === 'create' ? t('online:lobby.createTab') : t('online:lobby.joinTab')}
            </button>
          ))}
        </div>

        <label htmlFor="online-name" className="mb-1.5 block text-xs uppercase tracking-wide text-white/50">
          {t('online:lobby.yourName')}
        </label>
        <input
          id="online-name"
          type="text"
          value={name}
          maxLength={14}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('online:lobby.namePlaceholder')}
          className="mb-4 w-full rounded-lg bg-night-900/60 px-3 py-2 text-white placeholder-white/40 outline-none ring-1 ring-white/15 focus:ring-2 focus:ring-white/50"
        />

        <p className="mb-2 text-xs uppercase tracking-wide text-white/50">
          {t('online:lobby.tokenColor')}
        </p>
        <div className="mb-5 flex flex-wrap gap-2">
          {palette.map((c) => {
            const selected = color === c.value
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => setColor(c.value)}
                aria-label={c.name}
                aria-pressed={selected}
                className={cn(
                  'h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-night-800 transition',
                  selected ? 'scale-110 ring-white' : 'ring-transparent hover:scale-105',
                )}
                style={{ background: c.value }}
              />
            )
          })}
        </div>

        {tab === 'join' && (
          <div className="mb-5">
            <label htmlFor="room-code" className="mb-1.5 block text-xs uppercase tracking-wide text-white/50">
              {t('online:lobby.roomCode')}
            </label>
            <input
              id="room-code"
              type="text"
              value={code}
              maxLength={4}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCD"
              autoCapitalize="characters"
              className="w-full rounded-lg bg-night-900/60 px-3 py-2 text-center font-mono text-2xl tracking-[0.4em] text-white placeholder-white/30 outline-none ring-1 ring-white/15 focus:ring-2 focus:ring-white/50"
            />
          </div>
        )}

        <m.button
          type="button"
          onClick={handleSubmit}
          disabled={submitDisabled}
          whileHover={submitDisabled ? undefined : { scale: 1.03 }}
          whileTap={submitDisabled ? undefined : { scale: 0.97 }}
          className={cn(
            'w-full rounded-xl bg-linear-to-r from-grape to-grape-light px-6 py-3 text-lg font-bold text-white shadow-lg ring-1 ring-white/20 transition',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
            submitDisabled && 'cursor-not-allowed opacity-50',
          )}
        >
          {tab === 'create' ? t('online:lobby.createRoom') : t('online:lobby.joinRoom')}
        </m.button>
      </div>
    </m.div>
  )
}
