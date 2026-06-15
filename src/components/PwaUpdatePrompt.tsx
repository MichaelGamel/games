import { useRegisterSW } from 'virtual:pwa-register/react'
import { AnimatePresence, m } from 'motion/react'
import { useTranslation } from 'react-i18next'

/**
 * Service-worker update + offline-ready toast. The SW is registered with
 * `registerType: 'prompt'` (vite.config.ts) so a new deploy never swaps the
 * bundle mid-match — instead this surfaces a "new version available" toast and
 * the player reloads when they choose. It also confirms once when the app has
 * been precached and is ready to play offline. Mounted once in Root, so it sits
 * above every route.
 */
export function PwaUpdatePrompt() {
  const { t } = useTranslation('common')
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  const show = offlineReady || needRefresh
  const dismiss = () => {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  return (
    <AnimatePresence>
      {show && (
        <m.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <div className="flex items-center gap-3 rounded-2xl bg-night-800/90 px-4 py-3 text-sm text-white shadow-lg ring-1 ring-white/15 backdrop-blur">
            <span className="font-medium">
              {needRefresh ? t('pwa.updateMessage') : t('pwa.offlineReady')}
            </span>
            {needRefresh && (
              <button
                type="button"
                onClick={() => updateServiceWorker(true)}
                className="rounded-lg bg-linear-to-r from-grape to-grape-light px-3 py-1.5 font-semibold text-white ring-1 ring-white/20 transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {t('pwa.reload')}
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              aria-label={t('pwa.dismiss')}
              className="rounded-lg px-2 py-1.5 text-white/60 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              ✕
            </button>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
