import { useSyncExternalStore } from 'react'
import i18n from '../i18n'
import { cn } from '../lib/cn'

const LANGUAGES = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'ar', label: 'العربية', short: 'ع' },
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
 * EN ⇄ AR toggle. Shown full-width on the hub and each game's menu, and as a
 * `compact` pill (globe + language code) in-match and in the online lobby so a
 * player can flip language mid-game. The switch is purely client-side — it
 * persists in localStorage and `i18n.ts` flips `<html dir>` — so each player
 * changes only their own screen, never the shared match state.
 */
export function LanguageSwitcher({
  className,
  compact = false,
}: {
  className?: string
  compact?: boolean
}) {
  const current = useCurrentLanguage()
  const next = LANGUAGES.find((l) => l.code !== current) ?? LANGUAGES[0]
  const size = compact ? 14 : 15

  return (
    <button
      type="button"
      onClick={() => {
        localStorage.setItem('i18nextLng', next.code)
        void i18n.changeLanguage(next.code)
      }}
      aria-label={`Switch language to ${next.label}`}
      className={cn(
        'inline-flex items-center rounded-full bg-white/5 font-medium text-white/70 ring-1 ring-white/10 backdrop-blur transition',
        'hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
        compact ? 'gap-1 px-2.5 py-1.5 text-xs' : 'gap-1.5 px-3.5 py-2 text-sm',
        className,
      )}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path
          d="M3 12h18M12 3a13 13 0 010 18M12 3a13 13 0 000 18"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
      {compact ? next.short : next.label}
    </button>
  )
}
