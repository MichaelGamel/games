import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'

interface PassDeviceScreenProps {
  name: string
  color: string
  onReady: () => void
}

/**
 * The privacy hand-off shown between hot-seat turns so the previous player's
 * hand stays hidden until the next player taps to reveal. Skipped for bots and
 * when "Private hands" is off. Mirrors UNO's `PassDeviceScreen`.
 */
export function PassDeviceScreen({ name, color, onReady }: PassDeviceScreenProps) {
  const { t } = useTranslation('domino')
  return (
    <m.div
      className="fixed inset-0 z-50 grid place-items-center bg-night-900/95 px-4 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onReady}
        className="flex w-full max-w-sm flex-col items-center gap-5 rounded-3xl bg-white/5 p-10 text-center ring-1 ring-white/10 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <m.span
          className="grid h-20 w-20 place-items-center rounded-full text-3xl font-bold text-white ring-4 ring-white/70"
          style={{ background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.85), rgba(255,255,255,0) 45%), ${color}` }}
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          aria-hidden="true"
        >
          {name.charAt(0).toUpperCase()}
        </m.span>
        <div>
          <h2 className="text-2xl font-bold text-white">{t('passTo', { name })}</h2>
          <p className="mt-2 text-sm text-white/60">{t('passHint')}</p>
        </div>
        <span className="rounded-xl bg-linear-to-r from-stone-500 to-amber-500 px-8 py-3 text-lg font-bold text-white shadow-lg ring-1 ring-white/20">
          {t('tapWhenReady')}
        </span>
      </button>
    </m.div>
  )
}
