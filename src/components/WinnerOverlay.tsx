import { motion } from 'motion/react'
import type { Player } from '../game/types'
import { Confetti } from './Confetti'

interface WinnerOverlayProps {
  winner: Player
  /** Extra context under the winner line (e.g. won because everyone left). */
  subtitle?: string
  /** Omit to hide the Play Again button (e.g. no opponents left). */
  onPlayAgain?: () => void
  onSecondary: () => void
  secondaryLabel?: string
}

export function WinnerOverlay({
  winner,
  subtitle,
  onPlayAgain,
  onSecondary,
  secondaryLabel = 'New Players',
}: WinnerOverlayProps) {
  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label={`${winner.name} wins`}
    >
      <Confetti />

      <motion.div
        className="relative z-10 w-full max-w-sm rounded-3xl bg-night-800 p-8 text-center shadow-2xl ring-1 ring-white/15"
        initial={{ scale: 0.7, y: 30, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      >
        <motion.div
          className="text-7xl"
          animate={{ y: [0, -12, 0], rotate: [0, -8, 8, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          🏆
        </motion.div>

        <h2 className="mt-4 text-3xl font-bold text-white">We have a winner!</h2>
        <p className="mt-2 text-xl font-semibold" style={{ color: winner.color }}>
          {winner.name} wins! 🎉
        </p>
        {subtitle && <p className="mt-2 text-sm text-white/60">{subtitle}</p>}

        <div className="mt-7 flex flex-col gap-3">
          {onPlayAgain && (
            <motion.button
              type="button"
              onClick={onPlayAgain}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className="rounded-xl bg-linear-to-r from-grape to-grape-light px-6 py-3 text-lg font-bold text-white shadow-lg ring-1 ring-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Play Again
            </motion.button>
          )}
          <button
            type="button"
            onClick={onSecondary}
            className="rounded-xl px-6 py-2.5 font-semibold text-white/80 ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            {secondaryLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
