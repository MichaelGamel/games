import type { ReactNode } from 'react'
import { m } from 'motion/react'
import { Link } from 'react-router-dom'
import { Backdrop } from './Backdrop'
import { LudoBoardIcon } from './ludo/LudoBoardIcon'
import { useDocumentMeta } from '../lib/useDocumentMeta'
import { cn } from '../lib/cn'

/** One playable game on the hub. Adding a future game is a single array entry. */
interface Game {
  id: string
  title: string
  tagline: string
  /** The card's visual mark — either an emoji or a custom icon (`icon` wins). */
  emoji?: string
  icon?: ReactNode
  /** Route the card links to. */
  to: string
  /** Tailwind gradient classes for the card's hover glow. */
  accent: string
}

const GAMES: Game[] = [
  {
    id: 'snakes',
    title: 'Snakes & Ladders',
    tagline: 'Climb the ladders, dodge the snakes, race to 100.',
    emoji: '🐍',
    to: '/snakes',
    accent: 'from-snake-a/30 via-transparent to-ladder/25',
  },
  {
    id: 'ludo',
    title: 'Ludo',
    tagline: 'Get all four tokens home — capture, block and roll a six.',
    icon: <LudoBoardIcon className="h-16 w-16 drop-shadow" />,
    to: '/ludo',
    accent: 'from-grape/35 via-transparent to-grape-light/25',
  },
]

// Staggered entrance: the page reveals its header, then the card grid, whose
// own children cascade in. Mirrors the motion vocabulary used in MainMenu.
const page = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
}
const item = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 22 } },
} as const
const grid = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
}

export function HomeHub() {
  useDocumentMeta({
    title: "Robin's Games — Snakes & Ladders, Ludo and more",
    description:
      "Robin's Games is a hub of polished, animated board games for 2–4 players. Play Snakes & Ladders or Ludo — pass-and-play on one screen or online with friends in real time.",
  })

  return (
    <Backdrop>
      <m.main
        variants={page}
        initial="hidden"
        animate="show"
        className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-12 px-4 py-16"
      >
        <m.header variants={item} className="text-center">
          <m.h1
            className="text-4xl font-bold tracking-tight text-white drop-shadow sm:text-6xl"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <span aria-hidden="true">🎲</span> Robin&apos;s Games
          </m.h1>
          <p className="mt-3 text-white/70">
            Pick a game — pass-and-play on one screen or online with friends.
          </p>
        </m.header>

        <m.ul
          variants={grid}
          className="grid w-full max-w-3xl list-none gap-5 sm:grid-cols-2"
        >
          {GAMES.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </m.ul>
      </m.main>
    </Backdrop>
  )
}

const MotionLink = m.create(Link)

function GameCard({ game }: { game: Game }) {
  return (
    <m.li variants={item} className="flex">
      <MotionLink
        to={game.to}
        aria-label={`Play ${game.title}`}
        whileHover={{ scale: 1.03, y: -4 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className={cn(
          'group relative flex h-full w-full flex-col items-center gap-3 overflow-hidden rounded-3xl bg-white/5 p-8 text-center ring-1 ring-white/10 backdrop-blur',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
        )}
      >
        {/* hover glow, tinted per game */}
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-0 bg-linear-to-br opacity-0 transition-opacity duration-300 group-hover:opacity-100',
            game.accent,
          )}
        />
        <span className="relative transition-transform duration-300 group-hover:scale-110">
          {game.icon ?? <span className="text-6xl">{game.emoji}</span>}
        </span>
        <span className="relative text-2xl font-bold text-white">{game.title}</span>
        <span className="relative text-sm text-white/60">{game.tagline}</span>
        <span
          aria-hidden="true"
          className="relative mt-1 inline-flex items-center gap-1 text-sm font-semibold text-grape-light transition-transform duration-300 group-hover:translate-x-1"
        >
          Play <span>→</span>
        </span>
      </MotionLink>
    </m.li>
  )
}
