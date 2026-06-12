import { useTranslation } from 'react-i18next'
import type { LudoRules } from '../../ludo/types'
import { cn } from '../../lib/cn'

interface LudoRulesPickerProps {
  value: LudoRules
  onChange: (rules: LudoRules) => void
  /** Current player count — team play needs exactly 4. */
  playerCount: number
  /** Tighter spacing for the online waiting room card. */
  compact?: boolean
}

/**
 * The match-rules controls for Ludo: dice count, head start, blockades, the
 * capture gate, and 2v2 team play. Used by the local setup screen and, for the
 * host, by the online waiting room.
 */
export function LudoRulesPicker({ value, onChange, playerCount, compact }: LudoRulesPickerProps) {
  const { t } = useTranslation(['ludo', 'common'])
  const set = (patch: Partial<LudoRules>) => onChange({ ...value, ...patch })

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
        <RuleRow label={t('ludo:rules.dice')} hint={t('ludo:rules.diceHint')}>
          <Segment
            options={[
              { label: t('ludo:rules.oneDie'), selected: value.diceCount === 1, onPick: () => set({ diceCount: 1 }) },
              { label: t('ludo:rules.twoDice'), selected: value.diceCount === 2, onPick: () => set({ diceCount: 2 }) },
            ]}
          />
        </RuleRow>

        <RuleRow label={t('ludo:rules.headStart')} hint={t('ludo:rules.headStartHint')}>
          <Segment
            options={[
              { label: t('ludo:rules.off'), selected: !value.startWithOneOut, onPick: () => set({ startWithOneOut: false }) },
              { label: t('ludo:rules.on'), selected: value.startWithOneOut, onPick: () => set({ startWithOneOut: true }) },
            ]}
          />
        </RuleRow>

        <RuleRow label={t('ludo:rules.blockades')} hint={t('ludo:rules.blockadesHint')}>
          <Segment
            options={[
              { label: t('ludo:rules.on'), selected: value.blockades, onPick: () => set({ blockades: true }) },
              { label: t('ludo:rules.off'), selected: !value.blockades, onPick: () => set({ blockades: false }) },
            ]}
          />
        </RuleRow>

        <RuleRow label={t('ludo:rules.captureGate')} hint={t('ludo:rules.captureGateHint')}>
          <Segment
            options={[
              { label: t('ludo:rules.off'), selected: !value.captureToEnterHome, onPick: () => set({ captureToEnterHome: false }) },
              { label: t('ludo:rules.on'), selected: value.captureToEnterHome, onPick: () => set({ captureToEnterHome: true }) },
            ]}
          />
        </RuleRow>

        <RuleRow
          label={t('ludo:rules.teams')}
          hint={playerCount === 4 ? t('ludo:rules.teamsHint') : t('ludo:rules.teamsNeedsFour')}
        >
          <Segment
            disabled={playerCount !== 4}
            options={[
              { label: t('ludo:rules.off'), selected: !value.teams, onPick: () => set({ teams: false }) },
              { label: t('ludo:rules.on'), selected: value.teams, onPick: () => set({ teams: true }) },
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
