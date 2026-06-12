import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import type { UnoPlayer } from '../../uno/types'

interface UnoCallButtonProps {
  /** Opponents sitting on one card without having declared UNO. */
  catchable: UnoPlayer[]
  onCatch: (target: number) => void
}

/**
 * The "Catch!" affordance: when a player reaches one card without declaring UNO
 * (e.g. after a Seven-Zero swap), opponents may catch them for a +2 penalty.
 * Declaration itself is auto-armed into the play, so honest UNOs need no button.
 */
export function UnoCallButton({ catchable, onCatch }: UnoCallButtonProps) {
  const { t } = useTranslation('uno')
  if (catchable.length === 0) return null
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {catchable.map((p) => (
        <m.button
          key={p.id}
          type="button"
          onClick={() => onCatch(p.id)}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: [1, 1.06, 1], opacity: 1 }}
          transition={{ scale: { duration: 0.8, repeat: Infinity }, opacity: { duration: 0.2 } }}
          className="rounded-full bg-linear-to-r from-amber-500 to-orange-500 px-4 py-1.5 text-sm font-bold text-white shadow-lg ring-1 ring-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {t('catch', { name: p.name })}
        </m.button>
      ))}
    </div>
  )
}
