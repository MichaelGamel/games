/**
 * The Chess shell at `/chess` — a menu that mirrors the other games: two cards,
 * Pass & Play and Play Online. Pass & Play opens a setup screen where you pick
 * piece colours, your opponent (two players or the computer), and — versus the
 * computer — the difficulty, before handing off to the right screen. Online play
 * (and the Supabase SDK it pulls in) loads only on demand, like the other games.
 */
import { lazy, Suspense, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { Backdrop } from '../Backdrop'
import { BackToHubLink } from '../BackToHubLink'
import { LanguageSwitcher } from '../LanguageSwitcher'
import { useDocumentMeta } from '../../lib/useDocumentMeta'
import { isSupabaseConfigured } from '../../net/config'
import { cn } from '../../lib/cn'
import { CHESS_PIECE_COLORS, DEFAULT_PIECE_COLORS } from '../../chess/config'
import type { Difficulty } from '../../chess/types'
import { ChessIcon } from './ChessIcon'
import { ChessGame } from './ChessGame'

const ChessOnlineGame = lazy(() =>
  import('./ChessOnlineGame').then((m) => ({ default: m.ChessOnlineGame })),
)

type Opponent = 'pass' | 'solo'

type View =
  | { screen: 'menu' }
  | { screen: 'setup' }
  | { screen: 'local'; mode: Opponent; difficulty: Difficulty }
  | { screen: 'online' }

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']
const onlineEnabled = isSupabaseConfigured || import.meta.env.DEV

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
}
const item = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 22 } },
} as const

export function ChessApp() {
  const { t } = useTranslation(['chess', 'common'])
  const [searchParams] = useSearchParams()
  const [initialRoomCode] = useState(() => searchParams.get('room')?.toUpperCase() ?? undefined)
  const [view, setView] = useState<View>(
    initialRoomCode && onlineEnabled ? { screen: 'online' } : { screen: 'menu' },
  )
  // Pass & Play choices, kept here so they survive going back to the menu.
  // Online players pick their own colour in the lobby instead.
  const [whiteColor, setWhiteColor] = useState<string>(DEFAULT_PIECE_COLORS.white)
  const [blackColor, setBlackColor] = useState<string>(DEFAULT_PIECE_COLORS.black)
  const [opponent, setOpponent] = useState<Opponent>('pass')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  useDocumentMeta({
    title: t('chess:metaTitle'),
    description: t('chess:metaDescription'),
  })

  const pickWhite = (v: string) => {
    if (v === blackColor) setBlackColor(whiteColor)
    setWhiteColor(v)
  }
  const pickBlack = (v: string) => {
    if (v === whiteColor) setWhiteColor(blackColor)
    setBlackColor(v)
  }

  return (
    <Backdrop>
      <AnimatePresence mode="wait">
        {view.screen === 'local' && (
          <ChessGame
            key="local"
            mode={view.mode}
            difficulty={view.difficulty}
            whiteColor={whiteColor}
            blackColor={blackColor}
            onExit={() => setView({ screen: 'menu' })}
          />
        )}
        {view.screen === 'online' && (
          <Suspense
            key="online"
            fallback={
              <div className="relative z-10 grid min-h-dvh place-items-center text-white/70">
                {t('common:loading')}
              </div>
            }
          >
            <ChessOnlineGame
              onExit={() => setView({ screen: 'menu' })}
              initialRoomCode={initialRoomCode}
            />
          </Suspense>
        )}
        {view.screen === 'setup' && (
          <m.div
            key="setup"
            variants={container}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, y: -24, transition: { duration: 0.25 } }}
            className="relative z-10 flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12"
          >
            <m.button
              variants={item}
              type="button"
              onClick={() => setView({ screen: 'menu' })}
              className="absolute start-4 top-4 z-20 rounded-full bg-white/5 px-4 py-2 text-sm font-medium text-white/70 ring-1 ring-white/10 backdrop-blur transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <span aria-hidden="true" className="rtl:-scale-x-100">
                ←
              </span>{' '}
              {t('common:menu.back')}
            </m.button>
            <LanguageSwitcher className="absolute end-4 top-4 z-20" />

            <m.header variants={item} className="text-center">
              <m.h1
                className="flex items-center justify-center gap-3 text-4xl font-bold tracking-tight text-white drop-shadow sm:text-6xl"
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
              >
                <ChessIcon className="h-10 w-10 drop-shadow sm:h-14 sm:w-14" />
                {t('common:menu.passAndPlay')}
              </m.h1>
              <p className="mt-3 text-white/70">{t('chess:setupSubtitle')}</p>
            </m.header>

            {/* Opponent — two players on one screen, or the computer at a level. */}
            <m.div
              variants={item}
              className="w-full max-w-2xl rounded-3xl bg-white/5 p-5 ring-1 ring-white/10 backdrop-blur"
            >
              <p className="mb-3 text-center text-xs font-semibold uppercase tracking-widest text-violet-200">
                {t('chess:menu.opponent')}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <OpponentCard
                  emoji="♟️"
                  title={t('chess:menu.pass')}
                  subtitle={t('chess:menu.passSubtitle')}
                  selected={opponent === 'pass'}
                  onClick={() => setOpponent('pass')}
                />
                <OpponentCard
                  emoji="🤖"
                  title={t('chess:menu.solo')}
                  subtitle={t('chess:menu.soloSubtitle')}
                  selected={opponent === 'solo'}
                  onClick={() => setOpponent('solo')}
                />
              </div>

              {opponent === 'solo' && (
                <div className="mt-4">
                  <p className="mb-2 text-center text-xs font-semibold uppercase tracking-widest text-violet-200">
                    {t('chess:menu.difficulty')}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {DIFFICULTIES.map((d) => {
                      const selected = difficulty === d
                      return (
                        <m.button
                          key={d}
                          type="button"
                          onClick={() => setDifficulty(d)}
                          aria-pressed={selected}
                          whileHover={{ scale: 1.05, y: -2 }}
                          whileTap={{ scale: 0.96 }}
                          className={cn(
                            'rounded-xl px-2 py-2.5 text-sm font-semibold ring-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
                            selected
                              ? 'bg-linear-to-r from-grape to-grape-light text-white ring-white/20'
                              : 'bg-white/5 text-white/80 ring-white/10 hover:bg-white/10 hover:text-white',
                          )}
                        >
                          {t(`chess:difficulty.${d}`)}
                        </m.button>
                      )
                    })}
                  </div>
                </div>
              )}
            </m.div>

            {/* Piece colours — default classic White vs Black. */}
            <m.div
              variants={item}
              className="w-full max-w-2xl rounded-3xl bg-white/5 p-5 ring-1 ring-white/10 backdrop-blur"
            >
              <p className="mb-3 text-center text-xs font-semibold uppercase tracking-widest text-violet-200">
                {t('chess:menu.pieceColors')}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center sm:gap-10">
                <PieceColorRow label={t('chess:side.white')} value={whiteColor} onPick={pickWhite} />
                <PieceColorRow label={t('chess:side.black')} value={blackColor} onPick={pickBlack} />
              </div>
            </m.div>

            <m.button
              variants={item}
              type="button"
              onClick={() => setView({ screen: 'local', mode: opponent, difficulty })}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.96 }}
              className="rounded-xl bg-linear-to-r from-grape to-grape-light px-10 py-4 text-xl font-bold text-white shadow-xl ring-1 ring-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {t('chess:menu.start')}
            </m.button>
          </m.div>
        )}
        {view.screen === 'menu' && (
          <m.div
            key="menu"
            variants={container}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, y: -24, transition: { duration: 0.25 } }}
            className="relative z-10 flex min-h-dvh flex-col items-center justify-center gap-10 px-4 py-10"
          >
            <BackToHubLink />
            <LanguageSwitcher className="absolute end-4 top-4 z-20" />

            <m.header variants={item} className="text-center">
              <m.h1
                className="flex items-center justify-center gap-3 text-4xl font-bold tracking-tight text-white drop-shadow sm:text-6xl"
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
              >
                <ChessIcon className="h-10 w-10 drop-shadow sm:h-14 sm:w-14" />
                {t('chess:title')}
              </m.h1>
              <p className="mt-3 text-white/70">{t('chess:tagline')}</p>
            </m.header>

            <m.div variants={item} className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
              <MenuCard
                emoji="♟️"
                title={t('common:menu.passAndPlay')}
                subtitle={t('chess:menu.localSubtitle')}
                onClick={() => setView({ screen: 'setup' })}
              />
              <MenuCard
                emoji="🌐"
                title={t('common:menu.playOnline')}
                subtitle={onlineEnabled ? t('chess:menu.onlineSubtitle') : t('common:menu.onlineDisabled')}
                onClick={() => setView({ screen: 'online' })}
                disabled={!onlineEnabled}
              />
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </Backdrop>
  )
}

interface MenuCardProps {
  emoji: string
  title: string
  subtitle: string
  onClick: () => void
  disabled?: boolean
}

/** A top-level menu card, identical in look to the other games' menus. */
function MenuCard({ emoji, title, subtitle, onClick, disabled }: MenuCardProps) {
  return (
    <m.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.03, y: -2 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      className={cn(
        'flex flex-col items-center gap-2 rounded-2xl bg-white/5 p-7 text-center ring-1 ring-white/10 backdrop-blur transition',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
        disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-white/10',
      )}
    >
      <span className="text-5xl" aria-hidden="true">
        {emoji}
      </span>
      <span className="text-xl font-bold text-white">{title}</span>
      <span className="text-sm text-white/60">{subtitle}</span>
    </m.button>
  )
}

interface OpponentCardProps {
  emoji: string
  title: string
  subtitle: string
  selected: boolean
  onClick: () => void
}

/** A selectable opponent tile inside the Pass & Play setup screen. */
function OpponentCard({ emoji, title, subtitle, selected, onClick }: OpponentCardProps) {
  return (
    <m.button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-2xl p-5 text-center ring-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
        selected
          ? 'bg-grape/20 ring-grape-light'
          : 'bg-white/5 ring-white/10 hover:bg-white/10',
      )}
    >
      <span className="text-4xl" aria-hidden="true">
        {emoji}
      </span>
      <span className="text-lg font-bold text-white">{title}</span>
      <span className="text-xs text-white/60">{subtitle}</span>
    </m.button>
  )
}

/** One army's colour chooser: a label and a row of selectable swatches. */
function PieceColorRow({
  label,
  value,
  onPick,
}: {
  label: string
  value: string
  onPick: (value: string) => void
}) {
  return (
    <div className="flex items-center justify-center gap-3">
      <span className="w-12 shrink-0 text-sm font-semibold text-white/70">{label}</span>
      <div className="flex flex-wrap gap-2">
        {CHESS_PIECE_COLORS.map((c) => {
          const selected = c.value === value
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => onPick(c.value)}
              aria-label={c.name}
              aria-pressed={selected}
              className={cn(
                'h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-night-800 transition',
                selected ? 'scale-110 ring-white' : 'ring-white/15 hover:scale-105',
              )}
              style={{ background: c.value }}
            />
          )
        })}
      </div>
    </div>
  )
}
