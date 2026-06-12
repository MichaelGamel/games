import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'
import { SCORE_TARGETS } from '../../uno/config'
import type { UnoRules } from '../../uno/types'
import { cn } from '../../lib/cn'

interface UnoRulesPickerProps {
  value: UnoRules
  onChange: (rules: UnoRules) => void
  /** Tighter spacing for the online waiting-room card. */
  compact?: boolean
}

/**
 * The match-rules controls for UNO: the four optional house rules plus the win
 * mode and points target. Used by the local setup screen and (for the host) the
 * online waiting room.
 */
export function UnoRulesPicker({ value, onChange, compact }: UnoRulesPickerProps) {
  const { t } = useTranslation(['uno', 'common'])
  const set = (patch: Partial<UnoRules>) => onChange({ ...value, ...patch })

  const onOff = (on: boolean, apply: (v: boolean) => void) => [
    { label: t('rules.off'), selected: !on, onPick: () => apply(false) },
    { label: t('rules.on'), selected: on, onPick: () => apply(true) },
  ]

  return (
    <div className={cn('w-full rounded-2xl bg-white/5 ring-1 ring-white/10 backdrop-blur', compact ? 'p-4 text-left' : 'p-5')}>
      <p className="mb-3 text-xs font-bold uppercase tracking-widest text-white/50">{t('common:setup.gameRules')}</p>
      <div className={cn('grid gap-3', compact ? 'grid-cols-1' : 'sm:grid-cols-2')}>
        <RuleRow label={t('rules.stacking')} hint={t('rules.stackingHint')}>
          <Segment options={onOff(value.stacking, (v) => set({ stacking: v }))} />
        </RuleRow>
        <RuleRow label={t('rules.challenge')} hint={t('rules.challengeHint')}>
          <Segment options={onOff(value.challengeWild4, (v) => set({ challengeWild4: v }))} />
        </RuleRow>
        <RuleRow label={t('rules.sevenZero')} hint={t('rules.sevenZeroHint')}>
          <Segment options={onOff(value.sevenZero, (v) => set({ sevenZero: v }))} />
        </RuleRow>
        <RuleRow label={t('rules.jumpIn')} hint={t('rules.jumpInHint')}>
          <Segment options={onOff(value.jumpIn, (v) => set({ jumpIn: v }))} />
        </RuleRow>

        <RuleRow label={t('rules.winMode')} hint={t('rules.winModeHint')}>
          <Segment
            options={[
              { label: t('rules.single'), selected: value.winMode === 'single', onPick: () => set({ winMode: 'single' }) },
              { label: t('rules.score'), selected: value.winMode === 'score', onPick: () => set({ winMode: 'score' }) },
            ]}
          />
        </RuleRow>
        {value.winMode === 'score' && (
          <RuleRow label={t('rules.target')} hint={t('rules.targetHint')}>
            <Segment
              options={SCORE_TARGETS.map((target) => ({
                label: String(target),
                selected: value.targetScore === target,
                onPick: () => set({ targetScore: target }),
              }))}
            />
          </RuleRow>
        )}
      </div>
    </div>
  )
}

function RuleRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
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

function Segment({ options }: { options: SegmentOption[] }) {
  return (
    <div className="flex gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.label}
          type="button"
          onClick={opt.onPick}
          aria-pressed={opt.selected}
          className={cn(
            'flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white',
            opt.selected
              ? 'bg-linear-to-r from-red-500 to-orange-500 text-white ring-white/20'
              : 'bg-night-900/60 text-white/70 ring-white/15 hover:bg-white/10 hover:text-white',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
