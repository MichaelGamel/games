import type { ReactNode } from 'react'
import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { BackToHubLink } from '../BackToHubLink'
import { LanguageSwitcher } from '../LanguageSwitcher'
import { DominoIcon } from './DominoIcon'

interface DominoMainMenuProps {
  onLocal: () => void
  onOnline: () => void
  onlineEnabled: boolean
}

const container = { hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } } }
const item = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 22 } },
} as const

/** Dominoes' mode picker, mirroring the other games' main menus. */
export function DominoMainMenu({ onLocal, onOnline, onlineEnabled }: DominoMainMenuProps) {
  const { t } = useTranslation(['domino', 'common'])
  return (
    <m.div
      key="domino-menu"
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
          <DominoIcon className="h-10 w-10 drop-shadow sm:h-14 sm:w-14" /> {t('domino:title')}
        </m.h1>
        <p className="mt-3 text-white/70">{t('domino:tagline')}</p>
      </m.header>

      <m.div variants={item} className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
        <MenuCard
          icon={<DominoIcon className="h-12 w-12 drop-shadow" />}
          title={t('common:menu.passAndPlay')}
          subtitle={t('domino:menu.localSubtitle')}
          onClick={onLocal}
        />
        <MenuCard
          emoji="🌐"
          title={t('common:menu.playOnline')}
          subtitle={onlineEnabled ? t('domino:menu.onlineSubtitle') : t('domino:menu.onlineComingSoon')}
          onClick={onOnline}
          disabled={!onlineEnabled}
        />
      </m.div>

      <m.p variants={item} className="max-w-md text-center text-xs text-white/40">
        {t('domino:secrecyNote')}
      </m.p>
    </m.div>
  )
}

interface MenuCardProps {
  /** Emoji mark, or a custom icon (`icon` wins) — mirrors the hub's GameCard. */
  emoji?: string
  icon?: ReactNode
  title: string
  subtitle: string
  onClick: () => void
  disabled?: boolean
}

function MenuCard({ emoji, icon, title, subtitle, onClick, disabled }: MenuCardProps) {
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
      <span className="flex h-12 items-center justify-center text-5xl" aria-hidden="true">
        {icon ?? emoji}
      </span>
      <span className="text-xl font-bold text-white">{title}</span>
      <span className="text-sm text-white/60">{subtitle}</span>
    </m.button>
  )
}
