import { useTranslation } from 'react-i18next'
import { Dice3D } from '../../dice/Dice3D'
import type { DieValue } from '../../../bank/types'

interface BankCenterProps {
  /** The last roll's two dice (empty before the first roll). */
  lastDice: DieValue[]
  rolling: boolean
  /** Status line under the dice (whose turn / what's happening). */
  statusText: string
  /** Accent color for the status line (the current player's token). */
  accentColor: string
}

/** One tilted draw-pile card sitting on the board, like the physical board. */
function DeckCard({ label, icon, tilt }: { label: string; icon: string; tilt: string }) {
  return (
    <div
      className={`flex flex-col items-center gap-0.5 rounded-md bg-white px-2 py-1 text-night-900 shadow-lg ring-1 ring-black/20 ${tilt}`}
    >
      <span className="text-[1.5vmin] font-extrabold leading-none sm:text-xs">{label}</span>
      <span className="text-[2vmin] leading-none sm:text-base" aria-hidden="true">
        {icon}
      </span>
    </div>
  )
}

/**
 * The board's center hub, filling the 9×9 interior: the bank building + brand,
 * the two tilted draw piles (حظك Luck · محاكمة Court — a player landing on a
 * Luck/Court tile draws "off the top of the board"), the two dice (the focal
 * point of every roll — the Roll button lives in the controls), and the live
 * turn/status line. Reuses the shared {@link Dice3D} cube verbatim.
 */
export function BankCenter({ lastDice, rolling, statusText, accentColor }: BankCenterProps) {
  const { t } = useTranslation('bank')
  return (
    <div className="pointer-events-none absolute inset-[9.0909%] grid place-items-center">
      <div className="flex flex-col items-center gap-2 rounded-2xl bg-amber-300/10 px-3 py-3 text-center ring-1 ring-amber-200/20 backdrop-blur-sm sm:gap-3 sm:px-5 sm:py-4">
        <div className="flex items-center gap-1.5">
          <span className="text-[2.4vmin] sm:text-2xl" aria-hidden="true">
            🏦
          </span>
          <span className="text-[1.7vmin] font-extrabold uppercase tracking-widest text-amber-300 drop-shadow sm:text-base">
            {t('center.brand')}
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <DeckCard label={t('decks.luck')} icon="🎲" tilt="-rotate-6" />
          <div className="flex items-center gap-1.5">
            <Dice3D value={lastDice[0] ?? null} rolling={rolling} size={44} />
            <Dice3D value={lastDice[1] ?? null} rolling={rolling} size={44} />
          </div>
          <DeckCard label={t('decks.court')} icon="⚖️" tilt="rotate-6" />
        </div>

        <span
          className="max-w-[20ch] text-[1.5vmin] font-semibold leading-tight sm:text-sm"
          style={{ color: accentColor }}
        >
          {statusText}
        </span>
      </div>
    </div>
  )
}
