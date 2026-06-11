import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { Backdrop } from '../Backdrop'
import { useDocumentMeta } from '../../lib/useDocumentMeta'
import { BackToHubLink } from '../BackToHubLink'

/**
 * Phase 0 placeholder for the Ludo game. The real game (setup → board → online)
 * lands here in Phase 4; the route, lazy chunk, SEO and back-affordance are all
 * already wired so swapping in the game body is the only remaining change.
 */
export function LudoApp() {
  useDocumentMeta({
    title: "Ludo — Robin's Games",
    description:
      "Ludo on Robin's Games — race all four tokens home, capture opponents and roll a six for an extra turn. Play locally or online with friends. Coming soon.",
  })

  return (
    <Backdrop>
      <BackToHubLink />
      <motion.main
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-16 text-center"
      >
        <motion.span
          className="text-7xl drop-shadow"
          animate={{ rotate: [0, -8, 8, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          aria-hidden="true"
        >
          🎲
        </motion.span>
        <h1 className="text-4xl font-bold tracking-tight text-white drop-shadow sm:text-5xl">
          Ludo
        </h1>
        <p className="max-w-md text-white/70">
          The board is being painted. Ludo — capture, block and race four tokens home — is coming
          soon to Robin&apos;s Games.
        </p>
        <Link
          to="/snakes"
          className="rounded-full bg-white/10 px-6 py-3 font-semibold text-white ring-1 ring-white/15 backdrop-blur transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Play Snakes &amp; Ladders meanwhile →
        </Link>
      </motion.main>
    </Backdrop>
  )
}
