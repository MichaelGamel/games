import { lazy, Suspense, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { MainMenu } from './components/MainMenu'
import { LocalGame } from './components/LocalGame'
import { Backdrop } from './components/Backdrop'
import { useDocumentMeta } from './lib/useDocumentMeta'
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
  useDocumentMeta({
    title: "Snakes & Ladders — Robin's Games",
    description:
      'Roll the dice, climb the ladders, dodge the snakes — race your friends to 100. A polished, animated Snakes & Ladders for 2–4 players: pass-and-play on one screen or online in real time.',
  })

  return (
    <Backdrop>
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
    </Backdrop>
  )
}
