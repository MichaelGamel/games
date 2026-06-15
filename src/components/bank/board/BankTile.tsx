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
  /** Owner's display name when the property is owned (shown on the ribbon). */
  ownerName: string | null
  /** Building level (0 = bare, 1–3 = houses, 4 = hotel). */
  level: number
  /** Whether the property is mortgaged (collects no rent). */
  mortgaged: boolean
  /** Open the property details / management modal (property tiles only). */
  onSelect?: (id: number) => void
}

/** Icon for the non-property tile kinds (matched to the physical board). */
const KIND_EMOJI: Partial<Record<BankTileT['kind'], string>> = {
  start: '🏁',
  jail: '🚔',
  luckyClub: '🏛️',
  fastbus: '🚌',
  luck: '🎲',
  court: '⚖️',
  choice: '🎲⚖️',
  tax: '💸',
  reward: '🎁',
}

/**
 * One perimeter cell in the vintage cream style. Properties show a bold group
 * band, a serif name, and the price; an owner ribbon carrying the **owner's
 * name** once bought (so you can read who owns what, not just the color); a
 * house/hotel indicator once improved (P3); and a mortgage overlay (P4). The
 * lone petrol utility carries a fuel-pump glyph. Property cells are buttons that
 * open the management modal. Memoized: a cell only re-renders when its own owner
 * color / name / level / mortgage state changes.
 */
export const BankTileCell = memo(function BankTileCell({
  tile,
  groupColor,
  ownerColor,
  ownerName,
  level,
  mortgaged,
  onSelect,
}: BankTileProps) {
  const { t } = useTranslation('bank')
  const name = t(`tiles.${tile.nameKey}`)
  const isProperty = tile.kind === 'property'
  const isUtility = isProperty && tile.group === 'U'
  const isCorner =
    tile.kind === 'start' || tile.kind === 'jail' || tile.kind === 'luckyClub' || tile.kind === 'fastbus'

  const className = cn(
    'relative flex h-full w-full flex-col overflow-hidden border border-amber-950/30 bg-[#fbf3de] text-amber-950',
    isCorner && 'bg-[#f6e2b3]',
    (tile.kind === 'luck' || tile.kind === 'court' || tile.kind === 'choice') && 'bg-[#f8ecc8]',
    isProperty &&
      'cursor-pointer transition hover:brightness-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sky-600',
  )

  const inner = (
    <>
      {isProperty && groupColor && (
        <span
          className="relative h-[26%] w-full shrink-0 border-b border-black/25"
          style={{ background: groupColor }}
          aria-hidden="true"
        >
          {level > 0 && (
            <span className="absolute inset-0 flex items-center justify-center gap-[1px]">
              {level >= MAX_LEVEL ? (
                <span className="text-[8px] leading-none sm:text-[11px]">🏨</span>
              ) : (
                Array.from({ length: level }).map((_, i) => (
                  <span
                    key={i}
                    className="h-1 w-1 rounded-[1px] bg-emerald-200 ring-[0.5px] ring-emerald-950/60 sm:h-1.5 sm:w-1.5"
                  />
                ))
              )}
            </span>
          )}
        </span>
      )}

      <span className="flex flex-1 flex-col items-center justify-center gap-px px-[2px] text-center leading-[1.07]">
        {!isProperty && (
          <span className="text-[11px] leading-none sm:text-xl" aria-hidden="true">
            {KIND_EMOJI[tile.kind]}
          </span>
        )}
        {isUtility && (
          <span className="text-[10px] leading-none sm:text-base" aria-hidden="true">
            ⛽
          </span>
        )}
        <span
          className={cn(
            'w-full truncate font-serif text-[7px] font-bold sm:text-[11px]',
            isCorner && 'uppercase tracking-tight',
          )}
        >
          {name}
        </span>
        {isProperty && (
          <span className="text-[7px] font-bold tabular-nums text-amber-950/70 sm:text-[9px]">
            {t('money', { n: tile.price })}
          </span>
        )}
        {(tile.kind === 'tax' || tile.kind === 'luckyClub') && tile.amount != null && (
          <span className="text-[7px] font-bold tabular-nums text-red-700 sm:text-[9px]">
            −{t('money', { n: tile.amount })}
          </span>
        )}
        {tile.kind === 'reward' && (
          <span className="text-[7px] font-bold tabular-nums text-emerald-700 sm:text-[9px]">
            +{t('money', { n: tile.amount })}
          </span>
        )}
      </span>

      {isProperty && ownerColor && (
        <span
          className="flex h-[22%] w-full shrink-0 items-center justify-center ring-1 ring-inset ring-black/30"
          style={{ background: ownerColor }}
        >
          {ownerName && (
            <span className="max-w-full truncate px-[3px] text-[6px] font-bold leading-none text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.75)] sm:text-[9px]">
              {ownerName}
            </span>
          )}
        </span>
      )}

      {mortgaged && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center bg-amber-950/45">
          <span className="text-[9px] sm:text-sm" aria-hidden="true">
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
