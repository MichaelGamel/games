import { useState } from 'react'
import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { MAX_PLAYERS, MIN_PLAYERS } from '../../game/config'
import { BANK_COLORS, DEFAULT_BANK_PLAYERS, DEFAULT_BANK_RULES } from '../../bank/config'
import type { PlayerSetup } from '../../bank/bankReducer'
import type { BankRules } from '../../bank/types'
import { BankRulesPicker } from './BankRulesPicker'
import { cn } from '../../lib/cn'

interface BankSetupScreenProps {
  onStart: (players: PlayerSetup[], rules: BankRules) => void
  onBack?: () => void
}

const container = { hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } } }
const item = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 22 } },
} as const

/**
 * Local player setup for Bank El-Hazz: 2–4 humans, each a name + a unique token
 * color. Cash is fixed at the classic 1500 in P1 (a rules picker arrives in P2).
 */
export function BankSetupScreen({ onStart, onBack }: BankSetupScreenProps) {
  const { t } = useTranslation(['bank', 'common'])
  const [players, setPlayers] = useState<PlayerSetup[]>(() => DEFAULT_BANK_PLAYERS.map((p) => ({ ...p })))
  const [rules, setRules] = useState<BankRules>({ ...DEFAULT_BANK_RULES })

  const update = (index: number, patch: Partial<PlayerSetup>) =>
    setPlayers((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)))

  const setBot = (index: number, isBot: boolean) =>
    setPlayers((prev) =>
      prev.map((p, i) => {
        if (i !== index) return p
        const human = `Player ${i + 1}`
        const bot = `Computer ${i + 1}`
        let name = p.name
        if (isBot && name.trim() === human) name = bot
        else if (!isBot && name.trim() === bot) name = human
        return { ...p, isBot, name }
      }),
    )

  const addPlayer = () =>
    setPlayers((prev) => {
      if (prev.length >= MAX_PLAYERS) return prev
      const used = new Set(prev.map((p) => p.color))
      const color = BANK_COLORS.find((c) => !used.has(c.value))?.value ?? BANK_COLORS[0].value
      return [...prev, { name: `Player ${prev.length + 1}`, color }]
    })

  const removePlayer = (index: number) =>
    setPlayers((prev) => (prev.length > MIN_PLAYERS ? prev.filter((_, i) => i !== index) : prev))

  const handleStart = () =>
    onStart(
      players.map((p, i) => ({
        name: p.name.trim() || (p.isBot ? `Computer ${i + 1}` : `Player ${i + 1}`),
        color: p.color,
        isBot: p.isBot ?? false,
        botLevel: p.botLevel,
      })),
      rules,
    )

  return (
    <m.div
      key="bank-setup"
      variants={container}
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, y: -24, transition: { duration: 0.25 } }}
      className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-10"
    >
      {onBack && (
        <m.button
          variants={item}
          type="button"
          onClick={onBack}
          className="absolute start-4 top-4 rounded-lg px-3 py-1.5 text-sm text-white/70 ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          ← {t('common:menu.back')}
        </m.button>
      )}

      <m.header variants={item} className="text-center">
        <m.h1
          className="flex items-center justify-center gap-3 text-4xl font-bold tracking-tight text-white drop-shadow sm:text-6xl"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <span aria-hidden="true">🏦</span> {t('bank:title')}
        </m.h1>
        <p className="mt-3 text-white/70">{t('bank:setupSubtitle')}</p>
      </m.header>

      <m.div variants={item} className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
        {players.map((p, index) => (
          <div
            key={index}
            className="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10 backdrop-blur"
            style={{ boxShadow: `0 0 0 2px ${p.color}44` }}
          >
            <div className="mb-3 flex items-center gap-3">
              <span
                className="grid h-9 w-9 place-items-center rounded-full font-bold text-white ring-2 ring-white/70"
                style={{ background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.85), rgba(255,255,255,0) 45%), ${p.color}` }}
                aria-hidden="true"
              >
                {(p.name.trim() || `P${index + 1}`).charAt(0).toUpperCase()}
              </span>
              <label htmlFor={`bank-player-${index}`} className="flex-1 text-sm font-semibold text-white/80">
                {t('common:setup.player', { n: index + 1 })}
              </label>
              {players.length > MIN_PLAYERS && (
                <button
                  type="button"
                  onClick={() => removePlayer(index)}
                  aria-label={t('common:setup.removePlayer', { n: index + 1 })}
                  className="grid h-7 w-7 place-items-center rounded-full text-white/60 ring-1 ring-white/15 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                >
                  ✕
                </button>
              )}
            </div>

            <input
              id={`bank-player-${index}`}
              type="text"
              value={p.name}
              maxLength={14}
              onChange={(e) => update(index, { name: e.target.value })}
              placeholder={t('common:setup.player', { n: index + 1 })}
              className="w-full rounded-lg bg-night-900/60 px-3 py-2 text-white placeholder-white/40 outline-none ring-1 ring-white/15 focus:ring-2 focus:ring-white/50"
            />

            <div className="mt-4">
              <p className="mb-2 text-xs uppercase tracking-wide text-white/50">{t('common:setup.tokenColor')}</p>
              <div className="flex flex-wrap gap-2">
                {BANK_COLORS.map((c) => {
                  const selected = p.color === c.value
                  const taken = players.some((q, i) => i !== index && q.color === c.value)
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => !taken && update(index, { color: c.value })}
                      aria-label={c.name}
                      aria-pressed={selected}
                      disabled={taken}
                      className={cn(
                        'h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-night-800 transition',
                        selected ? 'scale-110 ring-white' : 'ring-transparent hover:scale-105',
                        taken && !selected && 'cursor-not-allowed opacity-30',
                      )}
                      style={{ background: c.value }}
                    />
                  )
                })}
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs uppercase tracking-wide text-white/50">
                {t('common:setup.playerType')}
              </p>
              <div className="flex gap-2">
                {[
                  { bot: false, label: t('common:setup.human') },
                  { bot: true, label: t('common:setup.bot') },
                ].map((opt) => {
                  const selected = (p.isBot ?? false) === opt.bot
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setBot(index, opt.bot)}
                      aria-pressed={selected}
                      className={cn(
                        'flex-1 rounded-lg px-3 py-2 text-sm font-semibold ring-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white',
                        selected
                          ? 'bg-linear-to-r from-amber-500 to-emerald-500 text-white ring-white/20'
                          : 'bg-night-900/60 text-white/70 ring-white/15 hover:bg-white/10 hover:text-white',
                      )}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
              {p.isBot && (
                <div className="mt-2 flex gap-2">
                  {[
                    { level: 'easy' as const, label: t('bank:setup.botEasy') },
                    { level: 'medium' as const, label: t('bank:setup.botMedium') },
                    { level: 'hard' as const, label: t('bank:setup.botHard') },
                  ].map((opt) => {
                    const selected = (p.botLevel ?? 'easy') === opt.level
                    return (
                      <button
                        key={opt.level}
                        type="button"
                        onClick={() => update(index, { botLevel: opt.level })}
                        aria-pressed={selected}
                        className={cn(
                          'flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white',
                          selected
                            ? 'bg-white/20 text-white ring-white/30'
                            : 'bg-night-900/60 text-white/60 ring-white/15 hover:bg-white/10 hover:text-white',
                        )}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ))}

        {players.length < MAX_PLAYERS && (
          <button
            type="button"
            onClick={addPlayer}
            className="grid min-h-32 place-items-center rounded-2xl border-2 border-dashed border-white/20 text-white/60 transition hover:border-white/40 hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <span className="text-lg font-semibold">{t('common:setup.addPlayer')}</span>
          </button>
        )}
      </m.div>

      <m.div variants={item} className="w-full max-w-2xl">
        <BankRulesPicker value={rules} onChange={setRules} />
      </m.div>

      <m.button
        variants={item}
        type="button"
        onClick={handleStart}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.96 }}
        className="rounded-xl bg-linear-to-r from-amber-500 to-emerald-500 px-10 py-4 text-xl font-bold text-white shadow-xl ring-1 ring-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        {t('common:actions.startGame')}
      </m.button>
    </m.div>
  )
}
