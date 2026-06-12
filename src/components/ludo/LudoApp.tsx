import { lazy, Suspense, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { Backdrop } from '../Backdrop'
import { useDocumentMeta } from '../../lib/useDocumentMeta'
import { isSupabaseConfigured } from '../../net/config'
import { LudoMainMenu } from './LudoMainMenu'
import { LudoLocalGame } from './LudoLocalGame'

// Online play (and the Supabase SDK it pulls in) loads only on demand.
const LudoOnlineGame = lazy(() =>
  import('./online/LudoOnlineGame').then((m) => ({ default: m.LudoOnlineGame })),
)

type Mode = 'menu' | 'local' | 'online'

// Online is available with real Supabase keys, or in dev via the same-browser
// BroadcastChannel test mode.
const onlineEnabled = isSupabaseConfigured || import.meta.env.DEV

/**
 * The Ludo game shell at `/ludo` — a mode switch mirroring the Snakes `App`.
 * Local pass-and-play and real-time online play (its own lazy chunk) share the
 * same `useLudo` core; online never loads on the menu or local play.
 */
export function LudoApp() {
  // A shared invite link (`/ludo?room=CODE`) jumps straight into the online
  // lobby with the code pre-filled. Consumed once on mount.
  const [searchParams] = useSearchParams()
  const [initialRoomCode] = useState(() => searchParams.get('room')?.toUpperCase() ?? undefined)
  const [mode, setMode] = useState<Mode>(initialRoomCode && onlineEnabled ? 'online' : 'menu')
  const { t } = useTranslation(['ludo', 'common'])
  useDocumentMeta({
    title: t('ludo:metaTitle'),
    description: t('ludo:metaDescription'),
  })

  return (
    <Backdrop>
      <AnimatePresence mode="wait">
        {mode === 'menu' && (
          <LudoMainMenu
            key="menu"
            onLocal={() => setMode('local')}
            onOnline={() => setMode('online')}
            onlineEnabled={onlineEnabled}
          />
        )}
        {mode === 'local' && <LudoLocalGame key="local" onExit={() => setMode('menu')} />}
        {mode === 'online' && (
          <Suspense
            key="online"
            fallback={
              <div className="relative z-10 grid min-h-screen place-items-center text-white/70">
                {t('common:loading')}
              </div>
            }
          >
            <LudoOnlineGame onExit={() => setMode('menu')} initialRoomCode={initialRoomCode} />
          </Suspense>
        )}
      </AnimatePresence>
    </Backdrop>
  )
}
