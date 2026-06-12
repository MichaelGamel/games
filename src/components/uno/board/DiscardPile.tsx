import { AnimatePresence, m } from 'motion/react'
import { UnoCard } from './UnoCard'
import type { UnoCard as UnoCardType } from '../../../uno/types'

interface DiscardPileProps {
  top: UnoCardType | null
  width?: number
}

/** The discard pile: the live top card arcs in over a couple of stacked cards. */
export function DiscardPile({ top, width = 88 }: DiscardPileProps) {
  const height = Math.round(width * 1.4)
  return (
    <div className="relative" style={{ width, height }}>
      {/* Static depth underneath */}
      <div className="absolute inset-0" style={{ transform: 'rotate(-6deg) translate(-3px,2px)' }}>
        <UnoCard faceDown width={width} className="opacity-40" />
      </div>
      <div className="absolute inset-0" style={{ transform: 'rotate(5deg) translate(3px,1px)' }}>
        <UnoCard faceDown width={width} className="opacity-60" />
      </div>
      <AnimatePresence mode="popLayout">
        {top && (
          <m.div
            key={top.id}
            className="absolute inset-0"
            initial={{ opacity: 0, y: -34, rotate: -18, scale: 1.1 }}
            animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
          >
            <UnoCard card={top} width={width} />
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
