import { motion } from 'motion/react'
import { placeLabel, placeMedal, type PodiumPlayer } from '../lib/place'
import { Confetti } from './Confetti'

interface WinnerOverlayProps {
  /** Finished players in podium order (1st, 2nd, 3rd). Never empty. */
  standings: PodiumPlayer[]
  /** Extra context under the winner line (e.g. won because everyone left). */
  subtitle?: string
  /** Omit to hide the Play Again button (e.g. no opponents left). */
  onPlayAgain?: () => void
  onSecondary: () => void
  secondaryLabel?: string
}

/**
 * The end-of-match stage. With a single finisher it is the classic "we have a
 * winner" card; with several it shows the full podium (the player who never
 * finished is the loser and is deliberately not mentioned).
 */
export function WinnerOverlay({
  standings,
  subtitle,
  onPlayAgain,
  onSecondary,
  secondaryLabel = 'New Players',
}: WinnerOverlayProps) {
  const winner = standings[0]
  const single = standings.length === 1

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label={single ? `${winner.name} wins` : 'Final standings'}
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
          aria-hidden="true"
        >
          🏆
        </motion.div>

        <h2 className="mt-4 text-3xl font-bold text-white">
          {single ? 'We have a winner!' : 'Final standings!'}
        </h2>

        {single ? (
          <p className="mt-2 text-xl font-semibold" style={{ color: winner.color }}>
            {winner.name} wins! 🎉
          </p>
        ) : (
          <ol className="mt-5 flex flex-col gap-2" aria-label="Final standings">
            {standings.map((p, rank) => (
              <motion.li
                key={p.id}
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + rank * 0.18, type: 'spring', stiffness: 260, damping: 22 }}
                className={
                  rank === 0
                    ? 'flex items-center gap-3 rounded-xl bg-amber-400/15 px-4 py-2.5 ring-1 ring-amber-300/40'
                    : 'flex items-center gap-3 rounded-xl bg-white/5 px-4 py-2 ring-1 ring-white/10'
                }
              >
                <span className={rank === 0 ? 'text-3xl' : 'text-2xl'} aria-hidden="true">
                  {placeMedal(rank)}
                </span>
                <span
                  className="h-5 w-5 shrink-0 rounded-full ring-2 ring-white/40"
                  style={{ background: p.color }}
                  aria-hidden="true"
                />
                <span
                  className={
                    rank === 0
                      ? 'min-w-0 flex-1 truncate text-left text-lg font-bold'
                      : 'min-w-0 flex-1 truncate text-left font-semibold'
                  }
                  style={{ color: p.color }}
                >
                  {p.name}
                </span>
                <span className="shrink-0 text-sm font-semibold text-white/60">
                  {placeLabel(rank)}
                </span>
              </motion.li>
            ))}
          </ol>
        )}

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
