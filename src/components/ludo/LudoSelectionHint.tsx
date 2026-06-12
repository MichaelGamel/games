import { motion } from 'motion/react'

/**
 * The prompt shown during the local selection pause: more than one token can
 * move, so the player taps a glowing one on the board. Rendered only when it is
 * actually this client's turn to choose.
 */
export function LudoSelectionHint() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      className="pointer-events-none flex justify-center"
      role="status"
    >
      <span className="inline-flex items-center gap-2 rounded-full bg-night-800/95 px-4 py-2 text-sm font-semibold text-white shadow-lg ring-1 ring-white/15 backdrop-blur">
        <motion.span
          aria-hidden="true"
          animate={{ y: [0, -3, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
        >
          👆
        </motion.span>
        Tap a glowing token to move
      </span>
    </motion.div>
  )
}
