import { useTranslation } from 'react-i18next'
import { Dice3D } from '../../dice/Dice3D'
import type { DieValue } from '../../../bank/types'

interface BankCenterProps {
  /** The last roll's dice (empty before the first roll). */
  lastDice: DieValue[]
  /** How many dice this match rolls (1 or 2) — fixes the cube count. */
  diceCount: 1 | 2
  rolling: boolean
  /** Status line under the dice (whose turn / what's happening). */
  statusText: string
  /** Accent color for the status line (the current player's token). */
  accentColor: string
}

/** A classic bank facade (pediment + columns), drawn in the brand red. */
function BankEmblem() {
  const columns = [7, 18, 29, 40, 51]
  return (
    <svg viewBox="0 0 64 44" className="h-8 w-auto drop-shadow-sm sm:h-11" aria-hidden="true">
      {/* pediment */}
      <polygon points="32,3 61,17 3,17" fill="#b91c1c" stroke="#7f1d1d" strokeWidth="1.4" />
      {/* architrave */}
      <rect x="3" y="17" width="58" height="3.4" rx="0.6" fill="#b91c1c" />
      {/* columns */}
      {columns.map((x) => (
        <rect key={x} x={x} y="21" width="6" height="16" rx="1" fill="#fbf3de" stroke="#7f1d1d" strokeWidth="0.7" />
      ))}
      {/* base + steps */}
      <rect x="1" y="37" width="62" height="3.6" rx="0.8" fill="#b91c1c" />
      <rect x="4" y="40.6" width="56" height="2.4" rx="0.8" fill="#7f1d1d" />
    </svg>
  )
}

/** One tilted "stamp" draw-pile card, like the cards printed on the board. */
function DeckCard({ label, icon, tilt }: { label: string; icon: string; tilt: string }) {
  return (
    <div
      className={`flex flex-col items-center gap-0.5 rounded-md border-2 border-dashed border-amber-800/70 bg-[#fbf3de] px-2 py-1 text-amber-950 shadow-md ${tilt}`}
    >
      <span className="text-[1.5vmin] font-extrabold uppercase leading-none tracking-wide sm:text-xs">
        {label}
      </span>
      <span className="text-[2.2vmin] leading-none sm:text-lg" aria-hidden="true">
        {icon}
      </span>
    </div>
  )
}

/**
 * The board's center hub, filling the 9×6 interior of the 11×8 board: the bank
 * building + brand (in vintage red), the two tilted draw piles (حظك Luck ·
 * محاكمة Court), the dice (one or two, the focal point of every roll — well
 * spaced so the cubes never touch), and the live turn/status line. Reuses the
 * shared {@link Dice3D} cube verbatim. Insets cover the interior exactly:
 * x = 100/11 ≈ 9.09%, y = 100/8 = 12.5%.
 */
export function BankCenter({ lastDice, diceCount, rolling, statusText, accentColor }: BankCenterProps) {
  const { t } = useTranslation('bank')
  return (
    <div className="pointer-events-none absolute inset-x-[9.0909%] inset-y-[12.5%] grid place-items-center">
      <div className="flex max-w-full flex-col items-center gap-2 rounded-2xl border border-amber-800/30 bg-[#fdf6e3]/85 px-4 py-3 text-center shadow-[0_6px_20px_rgba(120,80,20,0.25)] backdrop-blur-sm sm:gap-3 sm:px-7 sm:py-4">
        <div className="flex flex-col items-center gap-1">
          <BankEmblem />
          <span className="font-serif text-[2vmin] font-black uppercase tracking-[0.18em] text-red-700 drop-shadow-sm sm:text-xl">
            {t('center.brand')}
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3.5">
          <DeckCard label={t('decks.luck')} icon="🎲" tilt="-rotate-6" />
          <div className="flex items-center gap-3 sm:gap-4">
            {Array.from({ length: diceCount }, (_, i) => (
              <Dice3D key={i} value={lastDice[i] ?? null} rolling={rolling} size={46} />
            ))}
          </div>
          <DeckCard label={t('decks.court')} icon="⚖️" tilt="rotate-6" />
        </div>

        <span
          className="max-w-[22ch] text-[1.6vmin] font-bold leading-tight sm:text-sm"
          style={{ color: accentColor }}
        >
          {statusText}
        </span>
      </div>
    </div>
  )
}
