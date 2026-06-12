/**
 * Emoji reactions for online play.
 *
 * Reactions are pure social fluff: they never touch game state or the sync
 * sequence (see the `reaction` message in net/types.ts). `ReactionBar` is the
 * pop-up picker docked in a corner; `ReactionLayer` floats each reaction up and
 * fades it. Both are rendered as fixed overlays by OnlineRoom so the shared
 * GameScreen stays free of any online-only chrome.
 */
import { useState } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import type { FloatingReaction } from '../../net/useOnlineMatch'

export type { FloatingReaction }

/** The quick-react palette. */
const REACTION_EMOJIS = ['👍', '😂', '😮', '😢', '🎉', '🔥'] as const

/** Corner picker: a button that pops a column of emoji upward. */
export function ReactionBar({ onReact }: { onReact: (emoji: string) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="pointer-events-auto fixed bottom-24 right-3 z-30 flex flex-col items-end gap-2 lg:bottom-8 lg:right-8">
      <AnimatePresence>
        {open && (
          <m.div
            initial={{ opacity: 0, y: 12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.9 }}
            transition={{ duration: 0.18 }}
            className="flex flex-col gap-1 rounded-2xl bg-night-800/95 p-1.5 shadow-xl ring-1 ring-white/15 backdrop-blur"
          >
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onReact(emoji)
                  setOpen(false)
                }}
                aria-label={`React ${emoji}`}
                className="grid h-10 w-10 place-items-center rounded-xl text-2xl transition hover:scale-110 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              >
                {emoji}
              </button>
            ))}
          </m.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Reactions"
        aria-expanded={open}
        className="grid h-12 w-12 place-items-center rounded-full bg-night-800/90 text-2xl shadow-lg ring-1 ring-white/15 backdrop-blur transition hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        😀
      </button>
    </div>
  )
}

/** Floating layer: each reaction drifts up and fades. */
export function ReactionLayer({ reactions }: { reactions: FloatingReaction[] }) {
  const reduced = useReducedMotion()

  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden="true">
      <AnimatePresence>
        {reactions.map((r) => (
          <m.div
            key={r.id}
            className="absolute bottom-28 -translate-x-1/2 lg:bottom-24"
            style={{ left: `${r.left}%` }}
            initial={{ y: 0, opacity: 0, scale: 0.4 }}
            animate={{
              y: reduced ? -40 : -240,
              opacity: [0, 1, 1, 0],
              scale: [0.4, 1.25, 1, 0.95],
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0.6 : 2.4, ease: 'easeOut' }}
          >
            <span className="relative flex flex-col items-center gap-1">
              <span className="relative grid place-items-center">
                <span
                  className="absolute h-9 w-9 rounded-full opacity-50 blur-md"
                  style={{ background: r.color }}
                />
                <span className="relative text-4xl drop-shadow-lg">{r.emoji}</span>
              </span>
              <span
                className="max-w-28 truncate rounded-full bg-night-800/85 px-2 py-0.5 text-xs font-semibold text-white shadow ring-1 ring-white/15 backdrop-blur"
                style={{ borderBottom: `2px solid ${r.color}` }}
              >
                {r.name}
              </span>
            </span>
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
