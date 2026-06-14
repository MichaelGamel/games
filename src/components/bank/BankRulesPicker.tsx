import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'
import { MAX_ROUNDS_OPTIONS, PASS_START_OPTIONS, START_CASH_OPTIONS } from '../../bank/config'
import type { BankRules } from '../../bank/types'
import { cn } from '../../lib/cn'

interface BankRulesPickerProps {
  value: BankRules
  onChange: (rules: BankRules) => void
  /** Tighter spacing for the online waiting-room card (P6). */
  compact?: boolean
}

/**
 * The match-rules controls for Bank El-Hazz: starting cash, the pass-Start
 * reward, the doubles rule, and the game length (last-standing or a round cap
 * that ends with the richest player). Mirrors `UnoRulesPicker`; used by the local
 * setup screen and (for the host) the online waiting room later.
 */
export function BankRulesPicker({ value, onChange, compact }: BankRulesPickerProps) {
  const { t } = useTranslation(['bank', 'common'])
  const set = (patch: Partial<BankRules>) => onChange({ ...value, ...patch })

  return (
    <div
      className={cn(
        'w-full rounded-2xl bg-white/5 ring-1 ring-white/10 backdrop-blur',
        compact ? 'p-4 text-start' : 'p-5',
      )}
    >
      <p className="mb-3 text-xs font-bold uppercase tracking-widest text-white/50">
        {t('common:setup.gameRules')}
      </p>
      <div className={cn('grid gap-3', compact ? 'grid-cols-1' : 'sm:grid-cols-2')}>
        <RuleRow label={t('rules.startCash')}>
          <Segment
            options={START_CASH_OPTIONS.map((n) => ({
              label: t('money', { n }),
              selected: value.startCash === n,
              onPick: () => set({ startCash: n }),
            }))}
          />
        </RuleRow>

        <RuleRow label={t('rules.passReward')}>
          <Segment
            options={PASS_START_OPTIONS.map((n) => ({
              label: t('money', { n }),
              selected: value.passStartReward === n,
              onPick: () => set({ passStartReward: n }),
            }))}
          />
        </RuleRow>

        <RuleRow label={t('rules.doubles')} hint={t('rules.doublesHint')}>
          <Segment
            options={[
              { label: t('rules.off'), selected: !value.doubles, onPick: () => set({ doubles: false }) },
              { label: t('rules.on'), selected: value.doubles, onPick: () => set({ doubles: true }) },
            ]}
          />
        </RuleRow>

        <RuleRow label={t('rules.length')} hint={t('rules.lengthHint')}>
          <Segment
            options={[
              { label: t('rules.unlimited'), selected: value.maxRounds == null, onPick: () => set({ maxRounds: null }) },
              ...MAX_ROUNDS_OPTIONS.map((n) => ({
                label: t('rules.rounds', { n }),
                selected: value.maxRounds === n,
                onPick: () => set({ maxRounds: n }),
              })),
            ]}
          />
        </RuleRow>
      </div>
    </div>
  )
}

function RuleRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs uppercase tracking-wide text-white/50">
        {label}
        {hint && <span className="ms-1.5 normal-case tracking-normal text-white/35">({hint})</span>}
      </p>
      {children}
    </div>
  )
}

interface SegmentOption {
  label: string
  selected: boolean
  onPick: () => void
}

function Segment({ options }: { options: SegmentOption[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.label}
          type="button"
          onClick={opt.onPick}
          aria-pressed={opt.selected}
          className={cn(
            'flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white',
            opt.selected
              ? 'bg-linear-to-r from-amber-500 to-emerald-500 text-white ring-white/20'
              : 'bg-night-900/60 text-white/70 ring-white/15 hover:bg-white/10 hover:text-white',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
