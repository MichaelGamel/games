/**
 * The Chess shell at `/chess` — a menu that picks the opponent (the computer at
 * one of three levels, or a friend hot-seat) and then hands off to the 3D board.
 * There is no online mode: chess is local-only, so this is a 2-state switch
 * rather than the 3-mode switch the dice games use.
 */
import { useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { Backdrop } from '../Backdrop'
import { BackToHubLink } from '../BackToHubLink'
import { LanguageSwitcher } from '../LanguageSwitcher'
import { useDocumentMeta } from '../../lib/useDocumentMeta'
import { cn } from '../../lib/cn'
import type { Difficulty } from '../../chess/types'
import { ChessIcon } from './ChessIcon'
import { ChessGame } from './ChessGame'

type Session = { mode: 'solo'; difficulty: Difficulty } | { mode: 'pass'; difficulty: Difficulty }

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']

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
  const [session, setSession] = useState<Session | null>(null)
  useDocumentMeta({
    title: t('chess:metaTitle'),
    description: t('chess:metaDescription'),
  })

  return (
    <Backdrop>
      <AnimatePresence mode="wait">
        {session ? (
          <ChessGame
            key="game"
            mode={session.mode}
            difficulty={session.difficulty}
            onExit={() => setSession(null)}
          />
        ) : (
          <m.div
            key="menu"
            variants={container}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, y: -24, transition: { duration: 0.25 } }}
            className="relative z-10 flex min-h-dvh flex-col items-center justify-center gap-10 px-4 py-12"
          >
            <BackToHubLink />
            <LanguageSwitcher className="absolute end-4 top-4 z-20" />

            <m.header variants={item} className="text-center">
              <m.div
                className="mx-auto mb-4 w-20"
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
              >
                <ChessIcon className="h-20 w-20 drop-shadow-[0_8px_24px_rgba(124,58,237,0.5)]" />
              </m.div>
              <h1 className="text-4xl font-bold tracking-tight text-white drop-shadow sm:text-6xl">
                {t('chess:title')}
              </h1>
              <p className="mt-3 text-white/70">{t('chess:tagline')}</p>
            </m.header>

            <div className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
              {/* Vs Computer — pick a level to start. */}
              <m.div
                variants={item}
                className="flex flex-col items-center gap-4 rounded-3xl bg-white/5 p-7 text-center ring-1 ring-white/10 backdrop-blur"
              >
                <span className="text-5xl" aria-hidden="true">
                  🤖
                </span>
                <div>
                  <h2 className="text-xl font-bold text-white">{t('chess:menu.solo')}</h2>
                  <p className="mt-1 text-sm text-white/60">{t('chess:menu.soloSubtitle')}</p>
                </div>
                <div className="mt-1 w-full">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-violet-200">
                    {t('chess:menu.difficulty')}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {DIFFICULTIES.map((d) => (
                      <m.button
                        key={d}
                        type="button"
                        onClick={() => setSession({ mode: 'solo', difficulty: d })}
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.96 }}
                        className={cn(
                          'rounded-xl bg-white/5 px-2 py-2.5 text-sm font-semibold text-white ring-1 ring-white/10 transition',
                          'hover:bg-grape hover:ring-grape-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
                        )}
                      >
                        {t(`chess:difficulty.${d}`)}
                      </m.button>
                    ))}
                  </div>
                </div>
              </m.div>

              {/* Two Players — start immediately. */}
              <m.button
                variants={item}
                type="button"
                onClick={() => setSession({ mode: 'pass', difficulty: 'medium' })}
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="flex flex-col items-center justify-center gap-3 rounded-3xl bg-white/5 p-7 text-center ring-1 ring-white/10 backdrop-blur transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <span className="text-5xl" aria-hidden="true">
                  ♟️
                </span>
                <div>
                  <h2 className="text-xl font-bold text-white">{t('chess:menu.pass')}</h2>
                  <p className="mt-1 text-sm text-white/60">{t('chess:menu.passSubtitle')}</p>
                </div>
                <span className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-grape-light">
                  {t('chess:menu.start')}
                </span>
              </m.button>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </Backdrop>
  )
}
