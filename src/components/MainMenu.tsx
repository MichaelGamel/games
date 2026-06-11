import { motion } from 'motion/react'
import { cn } from '../lib/cn'
import { BackToHubLink } from './BackToHubLink'

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
  return (
    <motion.div
      key="menu"
      variants={container}
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, y: -24, transition: { duration: 0.25 } }}
      className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-10 px-4 py-10"
    >
      <BackToHubLink />

      <motion.header variants={item} className="text-center">
        <motion.h1
          className="text-4xl font-bold tracking-tight text-white drop-shadow sm:text-6xl"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <span aria-hidden="true">🐍</span> Snakes &amp; Ladders{' '}
          <span aria-hidden="true">🪜</span>
        </motion.h1>
        <p className="mt-3 text-white/70">Climb the ladders, dodge the snakes, race to 100.</p>
      </motion.header>

      <motion.div variants={item} className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
        <MenuCard
          emoji="🎲"
          title="Pass & Play"
          subtitle="Two players, one screen. Take turns on the same device."
          onClick={onLocal}
        />
        <MenuCard
          emoji="🌐"
          title="Play Online"
          subtitle={
            onlineEnabled
              ? 'Create or join a room and play with a friend on another computer.'
              : 'Add Supabase keys to enable cross-computer play (see README).'
          }
          onClick={onOnline}
          disabled={!onlineEnabled}
        />
      </motion.div>
    </motion.div>
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
    <motion.button
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
    </motion.button>
  )
}
