import { lazy, Suspense, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { Backdrop } from '../Backdrop'
import { useDocumentMeta } from '../../lib/useDocumentMeta'
import { isSupabaseConfigured } from '../../net/config'
import { BankMainMenu } from './BankMainMenu'
import { BankLocalGame } from './BankLocalGame'

// Online play (and the Supabase SDK it pulls in) loads only on demand.
const BankOnlineGame = lazy(() =>
  import('./online/BankOnlineGame').then((m) => ({ default: m.BankOnlineGame })),
)

type Mode = 'menu' | 'local' | 'online'

// Online is available with real Supabase keys, or in dev via the same-browser
// BroadcastChannel test mode.
const onlineEnabled = isSupabaseConfigured || import.meta.env.DEV

/**
 * The Bank El-Hazz game shell at `/bank` — a mode switch mirroring the other
 * games. Local pass-and-play and real-time online play (its own lazy chunk)
 * share the same `useBankElHazz` core; online never loads on the menu or local
 * play. Per-route SEO + the shared backdrop wrap the mode switch.
 */
export function BankApp() {
  // A shared invite link (`/bank?room=CODE`) jumps straight into the online
  // lobby with the code pre-filled. Consumed once on mount.
  const [searchParams] = useSearchParams()
  const [initialRoomCode] = useState(() => searchParams.get('room')?.toUpperCase() ?? undefined)
  const [mode, setMode] = useState<Mode>(initialRoomCode && onlineEnabled ? 'online' : 'menu')
  const { t } = useTranslation(['bank', 'common'])
  useDocumentMeta({
    title: t('bank:metaTitle'),
    description: t('bank:metaDescription'),
  })

  return (
    <Backdrop>
      <AnimatePresence mode="wait">
        {mode === 'menu' && (
          <BankMainMenu
            key="menu"
            onLocal={() => setMode('local')}
            onOnline={() => setMode('online')}
            onlineEnabled={onlineEnabled}
          />
        )}
        {mode === 'local' && <BankLocalGame key="local" onExit={() => setMode('menu')} />}
        {mode === 'online' && (
          <Suspense
            key="online"
            fallback={
              <div className="relative z-10 grid min-h-screen place-items-center text-white/70">
                {t('common:loading')}
              </div>
            }
          >
            <BankOnlineGame onExit={() => setMode('menu')} initialRoomCode={initialRoomCode} />
          </Suspense>
        )}
      </AnimatePresence>
    </Backdrop>
  )
}
