import { useState } from 'react'
import { m } from 'motion/react'
import { TOKEN_COLORS, type ColorOption } from '../../game/config'
import type { PlayerProfile, Role } from '../../net/types'
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
  /** Token palette to choose from; defaults to the Snakes set. Ludo passes its own. */
  colors?: readonly ColorOption[]
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no ambiguous chars
const genCode = () =>
  Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('')

export function OnlineLobby({ onBack, onStart, initial, colors }: OnlineLobbyProps) {
  const palette = colors ?? TOKEN_COLORS
  const [tab, setTab] = useState<'create' | 'join'>(initial?.tab ?? 'create')
  const [name, setName] = useState(initial?.name ?? '')
  const [color, setColor] = useState(initial?.color ?? palette[0].value)
  const [code, setCode] = useState(initial?.code ?? '')

  const joinDisabled = tab === 'join' && code.trim().length < 4

  const handleSubmit = () => {
    const cleanName = name.trim() || 'Player'
    const profile: PlayerProfile = { name: cleanName, color }
    const draft: LobbyDraft = { tab, name: cleanName, color, code }
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
      className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10"
    >
      <button
        type="button"
        onClick={onBack}
        className="absolute left-4 top-4 rounded-lg px-3 py-1.5 text-sm text-white/70 ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        ← Menu
      </button>

      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow sm:text-4xl">
          Play Online
        </h1>
        <p className="mt-2 text-white/70">Create a room and share the code, or join a friend's.</p>
      </header>

      <div className="w-full max-w-sm rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur">
        {/* Create / Join toggle */}
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-night-900/50 p-1">
          {(['create', 'join'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'rounded-lg py-2 text-sm font-semibold capitalize transition',
                tab === t ? 'bg-grape text-white shadow' : 'text-white/60 hover:text-white',
              )}
            >
              {t === 'create' ? 'Create room' : 'Join room'}
            </button>
          ))}
        </div>

        <label htmlFor="online-name" className="mb-1.5 block text-xs uppercase tracking-wide text-white/50">
          Your name
        </label>
        <input
          id="online-name"
          type="text"
          value={name}
          maxLength={14}
          onChange={(e) => setName(e.target.value)}
          placeholder="Player"
          className="mb-4 w-full rounded-lg bg-night-900/60 px-3 py-2 text-white placeholder-white/40 outline-none ring-1 ring-white/15 focus:ring-2 focus:ring-white/50"
        />

        <p className="mb-2 text-xs uppercase tracking-wide text-white/50">Token color</p>
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
              Room code
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
          disabled={joinDisabled}
          whileHover={joinDisabled ? undefined : { scale: 1.03 }}
          whileTap={joinDisabled ? undefined : { scale: 0.97 }}
          className={cn(
            'w-full rounded-xl bg-linear-to-r from-grape to-grape-light px-6 py-3 text-lg font-bold text-white shadow-lg ring-1 ring-white/20 transition',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
            joinDisabled && 'cursor-not-allowed opacity-50',
          )}
        >
          {tab === 'create' ? 'Create Room ▶' : 'Join Room ▶'}
        </m.button>
      </div>
    </m.div>
  )
}
