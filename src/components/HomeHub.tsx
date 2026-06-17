import { useState, type ReactNode } from 'react'
import { m } from 'motion/react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Backdrop } from './Backdrop'
import { LudoBoardIcon } from './ludo/LudoBoardIcon'
import { XOBoardIcon } from './xo/XOBoardIcon'
import { ChessIcon } from './chess/ChessIcon'
import { BackgammonIcon } from './backgammon/BackgammonIcon'
import { DominoIcon } from './domino/DominoIcon'
import { useDocumentMeta } from '../lib/useDocumentMeta'
import { hallOfFame, type HallOfFameRow } from '../lib/stats'
import { placeMedal } from '../lib/place'
import { LanguageSwitcher } from './LanguageSwitcher'
import { useInstallPrompt } from '../lib/useInstallPrompt'
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
  const { t } = useTranslation(['common', 'snakes', 'ludo', 'four', 'uno', 'bank', 'xo', 'chess', 'backgammon', 'domino'])
  useDocumentMeta({
    title: t('common:hub.metaTitle'),
    description: t('common:hub.metaDescription'),
  })

  const games: Game[] = [
    {
      id: 'snakes',
      title: t('snakes:title'),
      tagline: t('snakes:tagline'),
      emoji: '🐍',
      to: '/snakes',
      accent: 'from-snake-a/30 via-transparent to-ladder/25',
    },
    {
      id: 'ludo',
      title: t('ludo:title'),
      tagline: t('ludo:tagline'),
      icon: <LudoBoardIcon className="h-16 w-16 drop-shadow" />,
      to: '/ludo',
      accent: 'from-grape/35 via-transparent to-grape-light/25',
    },
    {
      id: 'four',
      title: t('four:title'),
      tagline: t('four:hubTagline'),
      emoji: '🔴',
      to: '/four',
      accent: 'from-sky-500/30 via-transparent to-amber-400/25',
    },
    {
      id: 'uno',
      title: t('uno:title'),
      tagline: t('uno:tagline'),
      emoji: '🃏',
      to: '/uno',
      accent: 'from-red-500/30 via-transparent to-yellow-400/25',
    },
    {
      id: 'bank',
      title: t('bank:title'),
      tagline: t('bank:tagline'),
      emoji: '🏦',
      to: '/bank',
      accent: 'from-amber-500/30 via-transparent to-emerald-400/25',
    },
    {
      id: 'xo',
      title: t('xo:title'),
      tagline: t('xo:hubTagline'),
      icon: <XOBoardIcon className="h-16 w-16 drop-shadow" />,
      to: '/xo',
      accent: 'from-rose-500/30 via-transparent to-sky-400/25',
    },
    {
      id: 'chess',
      title: t('chess:title'),
      tagline: t('chess:hubTagline'),
      icon: <ChessIcon className="h-16 w-16 drop-shadow" />,
      to: '/chess',
      accent: 'from-grape/35 via-transparent to-violet-400/25',
    },
    {
      id: 'backgammon',
      title: t('backgammon:title'),
      tagline: t('backgammon:hubTagline'),
      icon: <BackgammonIcon className="h-16 w-16 drop-shadow" />,
      to: '/backgammon',
      accent: 'from-amber-600/30 via-transparent to-emerald-500/25',
    },
    {
      id: 'domino',
      title: t('domino:title'),
      tagline: t('domino:hubTagline'),
      icon: <DominoIcon className="h-16 w-16 drop-shadow" />,
      to: '/domino',
      accent: 'from-stone-400/30 via-transparent to-amber-300/25',
    },
  ]

  return (
    <Backdrop>
      <LanguageSwitcher className="absolute end-4 top-4 z-20" />
      <m.main
        variants={page}
        initial="hidden"
        animate="show"
        className="relative z-10 flex min-h-dvh flex-col items-center justify-center gap-12 px-4 py-16"
      >
        <m.header variants={item} className="text-center">
          <m.h1
            className="text-4xl font-bold tracking-tight text-white drop-shadow sm:text-6xl"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <span aria-hidden="true">🎲</span> {t('common:hub.title')}
          </m.h1>
          <p className="mt-3 text-white/70">{t('common:hub.subtitle')}</p>
          <InstallButton />
        </m.header>

        <m.ul
          variants={grid}
          className="grid w-full max-w-5xl list-none grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5"
        >
          {games.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </m.ul>

        <HallOfFame />
      </m.main>
    </Backdrop>
  )
}

/**
 * "Install app" button — only rendered once the browser fires
 * `beforeinstallprompt` (so it's hidden on unsupported browsers, iOS Safari,
 * and after the app is already installed). Tapping it opens the native prompt.
 */
function InstallButton() {
  const { t } = useTranslation('common')
  const { canInstall, promptInstall } = useInstallPrompt()
  if (!canInstall) return null
  return (
    <m.button
      type="button"
      onClick={promptInstall}
      aria-label={t('pwa.installAria')}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.97 }}
      className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      <span aria-hidden="true">📲</span> {t('pwa.install')}
    </m.button>
  )
}

/** Local bragging rights: top players by wins across every game on this device. */
function HallOfFame() {
  const { t } = useTranslation()
  // Loaded once per visit; stats only change between matches, never mid-render.
  const [rows] = useState<HallOfFameRow[]>(() => hallOfFame(5))

  if (rows.length === 0) return null

  return (
    <m.section
      variants={item}
      aria-label="Hall of Fame"
      className="w-full max-w-3xl rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur"
    >
      <h2 className="text-center text-sm font-bold uppercase tracking-widest text-amber-300">
        🏆 {t('hub.hallOfFame')}
      </h2>
      <ol className="mt-4 flex flex-col gap-1.5">
        {rows.map((row, i) => (
          <li
            key={row.name}
            className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-2 ring-1 ring-white/10"
          >
            <span className="w-7 shrink-0 text-lg" aria-hidden="true">
              {i < 3 ? placeMedal(i) : `${i + 1}.`}
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold text-white">{row.name}</span>
            {row.streak >= 2 && (
              <span
                className="shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-semibold text-amber-300"
                title={t('hub.streak', { count: row.streak })}
              >
                🔥 {row.streak}
              </span>
            )}
            <span className="shrink-0 text-sm tabular-nums text-white/60">
              {t('hub.winsOf', { count: row.wins, wins: row.wins, games: row.games })}
            </span>
          </li>
        ))}
      </ol>
    </m.section>
  )
}

const MotionLink = m.create(Link)

function GameCard({ game }: { game: Game }) {
  const { t } = useTranslation()
  return (
    <m.li variants={item} className="flex">
      <MotionLink
        to={game.to}
        aria-label={t('hub.playGame', { title: game.title })}
        whileHover={{ scale: 1.03, y: -4 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className={cn(
          'group relative flex h-full w-full flex-col items-center gap-3 overflow-hidden rounded-3xl bg-white/5 p-5 text-center ring-1 ring-white/10 backdrop-blur sm:p-8',
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
          {t('hub.play')} <span className="rtl:-scale-x-100">→</span>
        </span>
      </MotionLink>
    </m.li>
  )
}
