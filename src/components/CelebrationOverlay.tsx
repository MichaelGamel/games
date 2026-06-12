import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { placeKey, placeMedal, type PodiumPlayer } from '../lib/place'
import { Confetti } from './Confetti'

interface CelebrationOverlayProps {
  /** The player who just secured a podium spot. */
  player: PodiumPlayer
  /** 0-based podium rank they secured (0 = first place). */
  rank: number
  /** Whether this client may choose to continue or end the match. */
  canDecide: boolean
  /** Who everyone else is waiting on (shown when `canDecide` is false). */
  waitingFor: string
  /** What the finisher just achieved (the calling game supplies the copy). */
  message: string
  onContinue: () => void
  onEnd: () => void
}

/**
 * Mid-game finish: a player took a podium spot but others are still racing.
 * Celebrates the finisher, then the host decides whether the match goes on.
 */
export function CelebrationOverlay({
  player,
  rank,
  canDecide,
  waitingFor,
  message,
  onContinue,
  onEnd,
}: CelebrationOverlayProps) {
  const { t } = useTranslation(['common'])
  return (
    <m.div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label={`${player.name} — ${t(placeKey(rank))}`}
    >
      <Confetti count={60} />

      <m.div
        className="relative z-10 w-full max-w-sm rounded-3xl bg-night-800 p-8 text-center shadow-2xl ring-1 ring-white/15"
        initial={{ scale: 0.7, y: 30, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      >
        <m.div
          className="text-7xl"
          animate={{ y: [0, -12, 0], rotate: [0, -8, 8, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          aria-hidden="true"
        >
          {placeMedal(rank)}
        </m.div>

        <h2 className="mt-4 text-3xl font-bold text-white">
          {t('overlay.celebrationTitle', { place: t(placeKey(rank)) })}
        </h2>
        <p className="mt-2 text-xl font-semibold" style={{ color: player.color }}>
          {player.name} {message}
        </p>
        <p className="mt-2 text-sm text-white/60">{t('overlay.celebrationRace')}</p>

        {canDecide ? (
          <div className="mt-7 flex flex-col gap-3">
            <m.button
              type="button"
              onClick={onContinue}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className="rounded-xl bg-linear-to-r from-emerald-500 to-emerald-400 px-6 py-3 text-lg font-bold text-white shadow-lg ring-1 ring-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {t('overlay.keepPlaying')}
            </m.button>
            <button
              type="button"
              onClick={onEnd}
              className="rounded-xl px-6 py-2.5 font-semibold text-white/80 ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              {t('overlay.endGame')}
            </button>
          </div>
        ) : (
          <p className="mt-7 animate-pulse text-sm font-semibold text-white/70" role="status">
            {t('overlay.waitingForDecision', { name: waitingFor })}
          </p>
        )}
      </m.div>
    </m.div>
  )
}
