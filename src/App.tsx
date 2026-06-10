import { lazy, Suspense, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { MainMenu } from './components/MainMenu'
import { LocalGame } from './components/LocalGame'
import { isSupabaseConfigured } from './net/config'

// Online play (and the Supabase SDK it pulls in) loads only on demand.
const OnlineGame = lazy(() =>
  import('./components/online/OnlineGame').then((m) => ({ default: m.OnlineGame })),
)

type Mode = 'menu' | 'local' | 'online'

// Online is available with real Supabase keys, or in dev via the same-browser
// BroadcastChannel test mode.
const onlineEnabled = isSupabaseConfigured || import.meta.env.DEV

export default function App() {
  const [mode, setMode] = useState<Mode>('menu')

  return (
    <div className="relative min-h-screen overflow-hidden bg-night-900 text-white">
      {/* slowly panning gradient backdrop */}
      <div className="animate-gradient pointer-events-none absolute inset-0 bg-linear-to-br from-night-900 via-night-800 to-night-700 bg-[length:200%_200%]" />
      {/* soft floating blobs for depth */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-float absolute -left-24 top-12 h-72 w-72 rounded-full bg-grape/25 blur-3xl" />
        <div className="animate-float-slow absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-grape-light/20 blur-3xl" />
      </div>

      <AnimatePresence mode="wait">
        {mode === 'menu' && (
          <MainMenu
            key="menu"
            onLocal={() => setMode('local')}
            onOnline={() => setMode('online')}
            onlineEnabled={onlineEnabled}
          />
        )}
        {mode === 'local' && <LocalGame key="local" onExit={() => setMode('menu')} />}
        {mode === 'online' && (
          <Suspense
            key="online"
            fallback={<div className="relative z-10 grid min-h-screen place-items-center text-white/70">Loading…</div>}
          >
            <OnlineGame onExit={() => setMode('menu')} />
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  )
}
