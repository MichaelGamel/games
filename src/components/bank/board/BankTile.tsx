import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import type { BankTile as BankTileT } from '../../../bank/types'
import { MAX_LEVEL } from '../../../bank/config'
import { cn } from '../../../lib/cn'

interface BankTileProps {
  tile: BankTileT
  /** Group stripe color for property tiles. */
  groupColor: string | null
  /** Owner's token color when the property is owned; null otherwise. */
  ownerColor: string | null
  /** Building level (0 = bare, 1–3 = houses, 4 = hotel). */
  level: number
  /** Whether the property is mortgaged (collects no rent). */
  mortgaged: boolean
  /** Open the property details / management modal (property tiles only). */
  onSelect?: (id: number) => void
}

/** Icon for the non-property tile kinds. */
const KIND_EMOJI: Partial<Record<BankTileT['kind'], string>> = {
  start: '🏁',
  jail: '🔒',
  luckyClub: '🍀',
  fastbus: '🚌',
  luck: '🎲',
  court: '⚖️',
  tax: '💸',
  reward: '🎁',
}

/**
 * One perimeter cell, themed by its kind. Properties show a group stripe, name,
 * and price, an owner ribbon in the owner's color once bought, a house/hotel
 * indicator once improved (P3), and a mortgage overlay when mortgaged (P4).
 * Property cells are buttons that open the management modal. Memoized: a cell
 * only re-renders when its own owner color / level / mortgage state changes.
 */
export const BankTileCell = memo(function BankTileCell({
  tile,
  groupColor,
  ownerColor,
  level,
  mortgaged,
  onSelect,
}: BankTileProps) {
  const { t } = useTranslation('bank')
  const name = t(`tiles.${tile.nameKey}`)
  const isProperty = tile.kind === 'property'
  const isCorner =
    tile.kind === 'start' || tile.kind === 'jail' || tile.kind === 'luckyClub' || tile.kind === 'fastbus'

  const className = cn(
    'relative flex h-full w-full flex-col overflow-hidden border border-black/10 bg-white text-night-900',
    isCorner && 'bg-amber-50',
    isProperty &&
      'cursor-pointer transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sky-500',
  )

  const inner = (
    <>
      {isProperty && groupColor && (
        <span className="relative h-[24%] w-full shrink-0" style={{ background: groupColor }} aria-hidden="true">
          {level > 0 && (
            <span className="absolute inset-0 flex items-center justify-center gap-[1px]">
              {level >= MAX_LEVEL ? (
                <span className="text-[7px] leading-none sm:text-[10px]">🏨</span>
              ) : (
                Array.from({ length: level }).map((_, i) => (
                  <span
                    key={i}
                    className="h-1 w-1 rounded-[1px] bg-emerald-300 ring-[0.5px] ring-emerald-900/50 sm:h-1.5 sm:w-1.5"
                  />
                ))
              )}
            </span>
          )}
        </span>
      )}

      <span className="flex flex-1 flex-col items-center justify-center gap-px px-px text-center leading-[1.05]">
        {!isProperty && (
          <span className="text-[9px] sm:text-base" aria-hidden="true">
            {KIND_EMOJI[tile.kind]}
          </span>
        )}
        <span className={cn('w-full truncate text-[6px] font-semibold sm:text-[9px]', isCorner && 'font-bold')}>
          {name}
        </span>
        {isProperty && (
          <span className="text-[6px] font-medium tabular-nums text-night-900/55 sm:text-[8px]">
            {t('money', { n: tile.price })}
          </span>
        )}
        {(tile.kind === 'tax' || tile.kind === 'luckyClub') && (
          <span className="text-[6px] font-semibold tabular-nums text-red-600 sm:text-[8px]">
            −{t('money', { n: tile.amount })}
          </span>
        )}
        {tile.kind === 'reward' && (
          <span className="text-[6px] font-semibold tabular-nums text-emerald-600 sm:text-[8px]">
            +{t('money', { n: tile.amount })}
          </span>
        )}
      </span>

      {isProperty && ownerColor && (
        <span
          className="h-[14%] w-full shrink-0 ring-1 ring-inset ring-black/20"
          style={{ background: ownerColor }}
          aria-hidden="true"
        />
      )}

      {mortgaged && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center bg-night-900/45">
          <span className="text-[8px] sm:text-xs" aria-hidden="true">
            🏦
          </span>
        </span>
      )}
    </>
  )

  if (isProperty && onSelect) {
    return (
      <button type="button" onClick={() => onSelect(tile.id)} className={className} aria-label={name}>
        {inner}
      </button>
    )
  }

  return <div className={className}>{inner}</div>
})
