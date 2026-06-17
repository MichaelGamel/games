import { lazy, Suspense, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { Backdrop } from '../Backdrop'
import { useDocumentMeta } from '../../lib/useDocumentMeta'
import { isSupabaseConfigured } from '../../net/config'
import { DominoMainMenu } from './DominoMainMenu'
import { DominoLocalGame } from './DominoLocalGame'

// Online play (and the Supabase SDK it pulls in) loads only on demand.
const DominoOnlineGame = lazy(() =>
  import('./online/DominoOnlineGame').then((m) => ({ default: m.DominoOnlineGame })),
)

type Mode = 'menu' | 'local' | 'online'

// Online is available with real Supabase keys, or in dev via the same-browser
// BroadcastChannel test mode.
const onlineEnabled = isSupabaseConfigured || import.meta.env.DEV

/**
 * The Dominoes game shell at `/domino` — a 3-mode switch mirroring the UNO `App`
 * and `LudoApp`. Local "pass & play" (vs bots or hot-seat) and real-time online
 * play (its own lazy chunk) share the same `useDomino` core; online never loads
 * on the menu or local play. A shared `?room=CODE` deep link jumps straight into
 * the online lobby with the code pre-filled.
 */
export function DominoApp() {
  const [searchParams] = useSearchParams()
  const [initialRoomCode] = useState(() => searchParams.get('room')?.toUpperCase() ?? undefined)
  const [mode, setMode] = useState<Mode>(initialRoomCode && onlineEnabled ? 'online' : 'menu')
  const { t } = useTranslation(['domino', 'common'])
  useDocumentMeta({
    title: t('domino:metaTitle'),
    description: t('domino:metaDescription'),
  })

  return (
    <Backdrop>
      <AnimatePresence mode="wait">
        {mode === 'menu' && (
          <DominoMainMenu
            key="menu"
            onLocal={() => setMode('local')}
            onOnline={() => setMode('online')}
            onlineEnabled={onlineEnabled}
          />
        )}
        {mode === 'local' && <DominoLocalGame key="local" onExit={() => setMode('menu')} />}
        {mode === 'online' && (
          <Suspense
            key="online"
            fallback={
              <div className="relative z-10 grid min-h-screen place-items-center text-white/70">
                {t('common:loading')}
              </div>
            }
          >
            <DominoOnlineGame onExit={() => setMode('menu')} initialRoomCode={initialRoomCode} />
          </Suspense>
        )}
      </AnimatePresence>
    </Backdrop>
  )
}
