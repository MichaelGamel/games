import { useSyncExternalStore } from 'react'
import i18n from '../i18n'
import { cn } from '../lib/cn'

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
] as const

function useCurrentLanguage(): string {
  return useSyncExternalStore(
    (cb) => {
      i18n.on('languageChanged', cb)
      return () => i18n.off('languageChanged', cb)
    },
    () => i18n.language,
    () => i18n.language,
  )
}

/**
 * EN ⇄ AR toggle, shown on the hub and each game's menu. With two languages a
 * single toggle beats a dropdown; the choice persists in localStorage and the
 * `<html dir>` listener in `i18n.ts` flips the layout.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const current = useCurrentLanguage()
  const next = LANGUAGES.find((l) => l.code !== current) ?? LANGUAGES[0]

  return (
    <button
      type="button"
      onClick={() => {
        localStorage.setItem('i18nextLng', next.code)
        void i18n.changeLanguage(next.code)
      }}
      aria-label={`Switch language to ${next.label}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3.5 py-2 text-sm font-medium text-white/70 ring-1 ring-white/10 backdrop-blur transition',
        'hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
        className,
      )}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path
          d="M3 12h18M12 3a13 13 0 010 18M12 3a13 13 0 000 18"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
      {next.label}
    </button>
  )
}
