import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { DominoTile } from './DominoTile'
import { cn } from '../../../lib/cn'

interface BoneyardProps {
  /** Tiles left to draw. */
  count: number
  /** Whether tapping draws right now (your turn, no legal play, tiles left). */
  canDraw: boolean
  onDraw: () => void
  /** The SHORT side of the stacked (vertical) tiles, in px. */
  size?: number
}

/** The boneyard: a face-down stack you tap to draw when you can't play. */
export function Boneyard({ count, canDraw, onDraw, size = 30 }: BoneyardProps) {
  const { t } = useTranslation('domino')
  const empty = count === 0
  return (
    <div className="flex flex-col items-center gap-1.5">
      <m.button
        type="button"
        onClick={onDraw}
        disabled={!canDraw}
        aria-label={t('drawTile')}
        whileHover={canDraw ? { scale: 1.05, y: -2 } : undefined}
        whileTap={canDraw ? { scale: 0.96 } : undefined}
        animate={canDraw ? { scale: [1, 1.05, 1] } : { scale: 1 }}
        transition={canDraw ? { duration: 0.9, repeat: Infinity } : { duration: 0.2 }}
        className={cn(
          'relative block rounded-[10px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
          canDraw ? 'cursor-pointer' : 'cursor-default',
          empty && 'opacity-30',
        )}
        style={{ width: size, height: size * 2 }}
      >
        {!empty && (
          <>
            <div className="absolute inset-0 translate-x-1 translate-y-1">
              <DominoTile pipA={0} pipB={0} orientation="v" size={size} faceDown className="opacity-50" />
            </div>
            <div className="absolute inset-0">
              <DominoTile pipA={0} pipB={0} orientation="v" size={size} faceDown />
            </div>
          </>
        )}
        {empty && (
          <div
            className="grid h-full w-full place-items-center rounded-[10px] border-2 border-dashed border-white/15 text-white/30"
            aria-hidden="true"
          >
            —
          </div>
        )}
        {canDraw && (
          <span className="absolute inset-x-0 -bottom-2 mx-auto w-fit rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-night-900 shadow">
            {t('tapToDraw')}
          </span>
        )}
      </m.button>
      <span className="text-[11px] tabular-nums text-white/50">{t('boneyardCount', { n: count })}</span>
    </div>
  )
}
