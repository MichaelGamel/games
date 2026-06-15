import { useEffect, useState } from 'react'

/**
 * The Chromium-only `beforeinstallprompt` event. It isn't in lib.dom.d.ts
 * (non-standard), so we declare the minimal shape we use.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Captures `beforeinstallprompt` so the app can show its own "Install" button.
 * Calling `preventDefault` on the event suppresses the browser's default
 * mini-infobar and lets us trigger the prompt on demand. `canInstall` is false
 * where unsupported (notably iOS Safari, which never fires it) and once the app
 * has been installed.
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setDeferred(null)
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const promptInstall = async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    // A captured prompt can only be used once; drop it whatever the outcome.
    setDeferred(null)
  }

  return { canInstall: deferred !== null, promptInstall }
}
