import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'
import { BackToHubLink } from './BackToHubLink'
import { LanguageSwitcher } from './LanguageSwitcher'

interface MainMenuProps {
  onLocal: () => void
  onOnline: () => void
  /** Whether online play is available (Supabase configured, or dev test mode). */
  onlineEnabled: boolean
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
}
const item = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 22 } },
} as const

export function MainMenu({ onLocal, onOnline, onlineEnabled }: MainMenuProps) {
  const { t } = useTranslation(['snakes', 'common'])
  return (
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
          className="text-4xl font-bold tracking-tight text-white drop-shadow sm:text-6xl"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <span aria-hidden="true">🐍</span> {t('snakes:title')} <span aria-hidden="true">🪜</span>
        </m.h1>
        <p className="mt-3 text-white/70">{t('snakes:tagline')}</p>
      </m.header>

      <m.div variants={item} className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
        <MenuCard
          emoji="🎲"
          title={t('common:menu.passAndPlay')}
          subtitle={t('snakes:menu.localSubtitle')}
          onClick={onLocal}
        />
        <MenuCard
          emoji="🌐"
          title={t('common:menu.playOnline')}
          subtitle={
            onlineEnabled ? t('snakes:menu.onlineSubtitle') : t('common:menu.onlineDisabled')
          }
          onClick={onOnline}
          disabled={!onlineEnabled}
        />
      </m.div>
    </m.div>
  )
}

interface MenuCardProps {
  emoji: string
  title: string
  subtitle: string
  onClick: () => void
  disabled?: boolean
}

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
