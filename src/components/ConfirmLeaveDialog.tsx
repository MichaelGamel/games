import { useEffect, useRef } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { useTranslation } from 'react-i18next'

interface ConfirmLeaveDialogProps {
  open: boolean
  /** Confirm and actually leave the match. */
  onConfirm: () => void
  /** Dismiss and stay in the game. */
  onCancel: () => void
}

/**
 * A gentle "are you sure you want to leave?" gate shown before a player
 * abandons a live match. Kids tap the Leave button by accident mid-game, so a
 * single sad-face confirmation saves the running game. Game-agnostic shell
 * piece reused by every online room (Snakes, Ludo, …).
 */
export function ConfirmLeaveDialog({ open, onConfirm, onCancel }: ConfirmLeaveDialogProps) {
  const { t } = useTranslation()
  const stayRef = useRef<HTMLButtonElement>(null)

  // Escape always means "stay"; focus the safe choice when the dialog opens.
  useEffect(() => {
    if (!open) return
    stayRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  return (
    <AnimatePresence>
      {open && (
        <m.div
          className="fixed inset-0 z-[60] grid place-items-center bg-black/60 px-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
          role="dialog"
          aria-modal="true"
          aria-labelledby="leave-confirm-title"
          aria-describedby="leave-confirm-body"
        >
          <m.div
            className="relative z-10 w-full max-w-sm rounded-3xl bg-night-800 p-8 text-center shadow-2xl ring-1 ring-white/15"
            initial={{ scale: 0.7, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            // Clicks inside the card must not fall through to the backdrop.
            onClick={(e) => e.stopPropagation()}
          >
            <m.div
              className="text-7xl"
              animate={{ rotate: [0, -8, 8, -5, 0], y: [0, -4, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              aria-hidden="true"
            >
              😢
            </m.div>

            <h2 id="leave-confirm-title" className="mt-4 text-2xl font-bold text-white">
              {t('confirmLeave.title')}
            </h2>
            <p id="leave-confirm-body" className="mt-2 text-base text-white/70">
              {t('confirmLeave.body')}
            </p>

            <div className="mt-7 flex flex-col gap-3">
              <m.button
                ref={stayRef}
                type="button"
                onClick={onCancel}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                className="rounded-xl bg-linear-to-r from-grape to-grape-light px-6 py-3 text-lg font-bold text-white shadow-lg ring-1 ring-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {t('confirmLeave.stay')}
              </m.button>
              <button
                type="button"
                onClick={onConfirm}
                className="rounded-xl px-6 py-2.5 font-semibold text-white/70 ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              >
                {t('confirmLeave.leave')}
              </button>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
