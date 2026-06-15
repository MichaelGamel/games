import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { BackToHubLink } from '../BackToHubLink'
import { LanguageSwitcher } from '../LanguageSwitcher'

interface UnoMainMenuProps {
  onLocal: () => void
  onOnline: () => void
  /** Whether online play is available yet (lands in Phase 5). */
  onlineEnabled: boolean
}

const container = { hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } } }
const item = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 22 } },
} as const

/** UNO's mode picker, mirroring the other games' main menus. */
export function UnoMainMenu({ onLocal, onOnline, onlineEnabled }: UnoMainMenuProps) {
  const { t } = useTranslation(['uno', 'common'])
  return (
    <m.div
      key="uno-menu"
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
          <span aria-hidden="true">🃏</span> {t('uno:title')}
        </m.h1>
        <p className="mt-3 text-white/70">{t('uno:tagline')}</p>
      </m.header>

      <m.div variants={item} className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
        <MenuCard emoji="🃏" title={t('common:menu.passAndPlay')} subtitle={t('uno:menu.localSubtitle')} onClick={onLocal} />
        <MenuCard
          emoji="🌐"
          title={t('common:menu.playOnline')}
          subtitle={onlineEnabled ? t('uno:menu.onlineSubtitle') : t('uno:menu.onlineComingSoon')}
          onClick={onOnline}
          disabled={!onlineEnabled}
        />
      </m.div>

      <m.p variants={item} className="max-w-md text-center text-xs text-white/40">
        {t('uno:secrecyNote')}
      </m.p>
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
