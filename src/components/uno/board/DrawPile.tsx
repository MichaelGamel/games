import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { UnoCard } from './UnoCard'
import { cn } from '../../../lib/cn'

interface DrawPileProps {
  /** Cards left in the stock (badge + thickness hint). */
  count: number
  /** Whether tapping draws right now (your turn, idle). */
  canDraw: boolean
  /** Cards the current player is forced to draw (the pending penalty), or 0. */
  pendingDraw?: number
  onDraw: () => void
  width?: number
}

/** The draw pile: a face-down stack you tap to draw. A pending penalty pulses. */
export function DrawPile({ count, canDraw, pendingDraw = 0, onDraw, width = 88 }: DrawPileProps) {
  const { t } = useTranslation('uno')
  const height = Math.round(width * 1.4)
  return (
    <div className="flex flex-col items-center gap-1.5">
      <m.button
        type="button"
        onClick={onDraw}
        disabled={!canDraw}
        aria-label={pendingDraw > 0 ? t('drawPenalty', { n: pendingDraw }) : t('drawCard')}
        whileHover={canDraw ? { scale: 1.05, y: -2 } : undefined}
        whileTap={canDraw ? { scale: 0.96 } : undefined}
        animate={pendingDraw > 0 ? { scale: [1, 1.05, 1] } : { scale: 1 }}
        transition={pendingDraw > 0 ? { duration: 0.9, repeat: Infinity } : { duration: 0.2 }}
        className={cn(
          'relative block rounded-[12px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
          canDraw ? 'cursor-pointer' : 'cursor-default opacity-80',
        )}
        style={{ width, height }}
      >
        {/* A little stack depth */}
        <div className="absolute inset-0 translate-x-1 translate-y-1">
          <UnoCard faceDown width={width} className="opacity-50" />
        </div>
        <div className="absolute inset-0">
          <UnoCard faceDown width={width} />
        </div>
        {canDraw && (
          <span className="absolute inset-x-0 -bottom-2 mx-auto w-fit rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-night-900 shadow">
            {pendingDraw > 0 ? `+${pendingDraw}` : t('tapToDraw')}
          </span>
        )}
      </m.button>
      <span className="text-[11px] tabular-nums text-white/50">{t('cardsLeft', { n: count })}</span>
    </div>
  )
}
