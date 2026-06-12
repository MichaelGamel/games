import { useTranslation } from 'react-i18next'
import type { SnakesRules } from '../game/types'
import { cn } from '../lib/cn'

interface SnakesRulesPickerProps {
  value: SnakesRules
  onChange: (rules: SnakesRules) => void
  /** Tighter spacing for the online waiting room card. */
  compact?: boolean
}

/**
 * The match-rules controls for Snakes & Ladders: board (classic/surprise),
 * size, dice count, and special cells. Used by the local setup screen and, for
 * the host, by the online waiting room. The `seed` for surprise boards is NOT
 * chosen here — callers mint one when the match actually starts.
 */
export function SnakesRulesPicker({ value, onChange, compact }: SnakesRulesPickerProps) {
  const { t } = useTranslation(['snakes', 'common'])
  const set = (patch: Partial<SnakesRules>) => onChange({ ...value, ...patch })

  return (
    <div
      className={cn(
        'w-full rounded-2xl bg-white/5 ring-1 ring-white/10 backdrop-blur',
        compact ? 'p-4 text-left' : 'p-5',
      )}
    >
      <p className="mb-3 text-xs font-bold uppercase tracking-widest text-white/50">
        {t('common:setup.gameRules')}
      </p>
      <div className={cn('grid gap-3', compact ? 'grid-cols-1' : 'sm:grid-cols-2')}>
        <RuleRow label={t('snakes:rules.board')}>
          <Segment
            options={[
              { label: t('snakes:rules.classic'), selected: value.board === 'classic', onPick: () => set({ board: 'classic', size: 10 }) },
              { label: t('snakes:rules.surprise'), selected: value.board === 'random', onPick: () => set({ board: 'random' }) },
            ]}
          />
        </RuleRow>

        <RuleRow
          label={t('snakes:rules.size')}
          hint={value.board === 'classic' ? t('snakes:rules.sizeHint') : undefined}
        >
          <Segment
            disabled={value.board === 'classic'}
            options={[
              { label: t('snakes:rules.size10'), selected: value.size === 10, onPick: () => set({ size: 10 }) },
              { label: t('snakes:rules.size8'), selected: value.size === 8, onPick: () => set({ size: 8 }) },
            ]}
          />
        </RuleRow>

        <RuleRow label={t('snakes:rules.dice')}>
          <Segment
            options={[
              { label: t('snakes:rules.oneDie'), selected: value.diceCount === 1, onPick: () => set({ diceCount: 1 }) },
              { label: t('snakes:rules.twoDice'), selected: value.diceCount === 2, onPick: () => set({ diceCount: 2 }) },
            ]}
          />
        </RuleRow>

        <RuleRow label={t('snakes:rules.specialCells')} hint={t('snakes:rules.specialsHint')}>
          <Segment
            options={[
              { label: t('snakes:rules.off'), selected: !value.specials, onPick: () => set({ specials: false }) },
              { label: t('snakes:rules.on'), selected: value.specials, onPick: () => set({ specials: true }) },
            ]}
          />
        </RuleRow>
      </div>
    </div>
  )
}

function RuleRow({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs uppercase tracking-wide text-white/50">
        {label}
        {hint && <span className="ml-1.5 normal-case tracking-normal text-white/35">({hint})</span>}
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

function Segment({ options, disabled }: { options: SegmentOption[]; disabled?: boolean }) {
  return (
    <div className={cn('flex gap-1.5', disabled && 'pointer-events-none opacity-40')}>
      {options.map((opt) => (
        <button
          key={opt.label}
          type="button"
          onClick={opt.onPick}
          aria-pressed={opt.selected}
          disabled={disabled}
          className={cn(
            'flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white',
            opt.selected
              ? 'bg-linear-to-r from-grape to-grape-light text-white ring-white/20'
              : 'bg-night-900/60 text-white/70 ring-white/15 hover:bg-white/10 hover:text-white',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
