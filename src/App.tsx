import { lazy, Suspense, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import { useTranslation } from 'react-i18next'
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
  // A shared invite link (`/snakes?room=CODE`) jumps straight into the online
  // lobby with the code pre-filled. Consumed once on mount.
  const [searchParams] = useSearchParams()
  const [initialRoomCode] = useState(() => searchParams.get('room')?.toUpperCase() ?? undefined)
  const [mode, setMode] = useState<Mode>(initialRoomCode && onlineEnabled ? 'online' : 'menu')
  const { t } = useTranslation(['snakes', 'common'])
  useDocumentMeta({
    title: t('snakes:metaTitle'),
    description: t('snakes:metaDescription'),
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
            fallback={
              <div className="relative z-10 grid min-h-screen place-items-center text-white/70">
                {t('common:loading')}
              </div>
            }
          >
            <OnlineGame onExit={() => setMode('menu')} initialRoomCode={initialRoomCode} />
          </Suspense>
        )}
      </AnimatePresence>
    </Backdrop>
  )
}
