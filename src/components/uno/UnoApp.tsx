import { lazy, Suspense, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { Backdrop } from '../Backdrop'
import { useDocumentMeta } from '../../lib/useDocumentMeta'
import { isSupabaseConfigured } from '../../net/config'
import { UnoMainMenu } from './UnoMainMenu'
import { UnoLocalGame } from './UnoLocalGame'

// Online play (and the Supabase SDK it pulls in) loads only on demand.
const UnoOnlineGame = lazy(() =>
  import('./online/UnoOnlineGame').then((m) => ({ default: m.UnoOnlineGame })),
)

type Mode = 'menu' | 'local' | 'online'

// Online is available with real Supabase keys, or in dev via the same-browser
// BroadcastChannel test mode.
const onlineEnabled = isSupabaseConfigured || import.meta.env.DEV

/**
 * The UNO game shell at `/uno` — a 3-mode switch mirroring the Snakes `App` and
 * `LudoApp`. Local "pass & play" (vs bots or hot-seat) and real-time online play
 * (its own lazy chunk) share the same `useUno` core; online never loads on the
 * menu or local play. A shared `?room=CODE` deep link jumps straight into the
 * online lobby with the code pre-filled.
 */
export function UnoApp() {
  const [searchParams] = useSearchParams()
  const [initialRoomCode] = useState(() => searchParams.get('room')?.toUpperCase() ?? undefined)
  const [mode, setMode] = useState<Mode>(initialRoomCode && onlineEnabled ? 'online' : 'menu')
  const { t } = useTranslation(['uno', 'common'])
  useDocumentMeta({
    title: t('uno:metaTitle'),
    description: t('uno:metaDescription'),
  })

  return (
    <Backdrop>
      <AnimatePresence mode="wait">
        {mode === 'menu' && (
          <UnoMainMenu
            key="menu"
            onLocal={() => setMode('local')}
            onOnline={() => setMode('online')}
            onlineEnabled={onlineEnabled}
          />
        )}
        {mode === 'local' && <UnoLocalGame key="local" onExit={() => setMode('menu')} />}
        {mode === 'online' && (
          <Suspense
            key="online"
            fallback={
              <div className="relative z-10 grid min-h-screen place-items-center text-white/70">
                {t('common:loading')}
              </div>
            }
          >
            <UnoOnlineGame onExit={() => setMode('menu')} initialRoomCode={initialRoomCode} />
          </Suspense>
        )}
      </AnimatePresence>
    </Backdrop>
  )
}
