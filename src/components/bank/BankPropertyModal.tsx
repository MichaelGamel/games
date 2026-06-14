import type { ReactNode } from 'react'
import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { BOARD, GROUP_COLORS, MAX_LEVEL } from '../../bank/config'
import {
  canBuildHouse,
  canMortgage,
  canSellHouse,
  canUnmortgage,
  houseCost,
  mortgageValue,
  sellRefund,
  unmortgageCost,
} from '../../bank/rules'
import type { BankController } from '../../hooks/useBankElHazz'
import { cn } from '../../lib/cn'

interface BankPropertyModalProps {
  /** Tile id of the property being inspected. */
  tile: number
  game: BankController
  onClose: () => void
}

/**
 * Property details + management (P3 upgrades, P4 mortgage). Opened by tapping any
 * property on the board; it shows the rent-by-level table and ownership, and —
 * when the viewer owns it on their own idle turn — Build / Sell / Mortgage /
 * Unmortgage buttons. Each action commits a seq-stamped `manage` event and the
 * modal stays open, reflecting the updated state (so you can build to a hotel).
 */
export function BankPropertyModal({ tile, game, onClose }: BankPropertyModalProps) {
  const { t } = useTranslation('bank')
  const data = BOARD[tile]
  const name = t(`tiles.${data.nameKey}`)
  const groupColor = data.group ? GROUP_COLORS[data.group] : '#888'

  const entry = game.ownership[tile]
  const seat = game.currentPlayerIndex
  const owner = entry ? game.players[entry.owner] : null
  const iOwnIt = entry?.owner === seat
  const improvable = data.houseCost != null
  const showActions = game.canManageProperties && iOwnIt

  const cb = canBuildHouse(game, seat, tile)
  const cs = canSellHouse(game, seat, tile)
  const cm = canMortgage(game, seat, tile)
  const cu = canUnmortgage(game, seat, tile)

  // Rent-by-level rows (level 0 highlighted as the bare lot through to the hotel).
  const levels = improvable && data.rentByLevel ? data.rentByLevel : [data.rent ?? 0]
  const levelLabel = (lvl: number) =>
    lvl === 0 ? t('property.base') : lvl >= MAX_LEVEL ? t('property.hotel') : t('property.houses', { n: lvl })

  return (
    <m.div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label={name}
      onClick={onClose}
    >
      <m.div
        className="w-full max-w-xs overflow-hidden rounded-3xl bg-night-800 text-center shadow-2xl ring-1 ring-white/15"
        initial={{ scale: 0.85, y: 24, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-3 w-full" style={{ background: groupColor }} aria-hidden="true" />
        <div className="p-5">
          <h2 className="text-xl font-bold text-white">{name}</h2>
          <p className="mt-1 text-xs uppercase tracking-widest text-white/45">
            {data.group ? t('buy.group', { group: data.group }) : ''}
          </p>
          <p className="mt-1 text-sm text-white/70">
            {owner ? (iOwnIt ? t('property.yours') : t('property.owned', { name: owner.name })) : t('property.unowned')}
          </p>

          <dl className="mt-3 flex justify-center gap-6 text-sm">
            <div>
              <dt className="text-white/50">{t('buy.price')}</dt>
              <dd className="text-base font-bold tabular-nums text-amber-200">{t('money', { n: data.price })}</dd>
            </div>
            <div>
              <dt className="text-white/50">{t('property.mortgageValue')}</dt>
              <dd className="text-base font-bold tabular-nums text-sky-200">{t('money', { n: mortgageValue(data) })}</dd>
            </div>
          </dl>

          <div className="mt-4 rounded-2xl bg-white/5 p-3 text-start ring-1 ring-white/10">
            <p className="mb-1.5 text-center text-xs font-bold uppercase tracking-widest text-white/45">
              {t('property.rentTitle')}
            </p>
            <ul className="flex flex-col gap-0.5 text-xs">
              {levels.map((rent, lvl) => (
                <li
                  key={lvl}
                  className={cn(
                    'flex items-center justify-between rounded px-2 py-0.5 tabular-nums',
                    entry && (entry.level ?? 0) === lvl && improvable
                      ? 'bg-emerald-400/15 font-semibold text-emerald-200'
                      : 'text-white/70',
                  )}
                >
                  <span>{improvable ? levelLabel(lvl) : t('property.base')}</span>
                  <span>{t('money', { n: rent })}</span>
                </li>
              ))}
            </ul>
            {!improvable && <p className="mt-1.5 text-center text-[11px] text-white/40">{t('property.utility')}</p>}
            {entry?.mortgaged && (
              <p className="mt-1.5 text-center text-[11px] font-semibold text-amber-300">
                {t('property.mortgagedNote')}
              </p>
            )}
          </div>

          {showActions && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {improvable && (
                <>
                  <ActionButton enabled={cb} onClick={() => game.buildHouse(tile)}>
                    {t('property.build', { amount: houseCost(data) })}
                  </ActionButton>
                  <ActionButton enabled={cs} onClick={() => game.sellHouse(tile)}>
                    {t('property.sell', { amount: sellRefund(data) })}
                  </ActionButton>
                </>
              )}
              <ActionButton enabled={cm} onClick={() => game.mortgage(tile)}>
                {t('property.mortgage', { amount: mortgageValue(data) })}
              </ActionButton>
              <ActionButton enabled={cu} onClick={() => game.unmortgage(tile)}>
                {t('property.unmortgage', { amount: unmortgageCost(data) })}
              </ActionButton>
            </div>
          )}
          {showActions && improvable && !cb && entry && !entry.mortgaged && (entry.level ?? 0) === 0 && (
            <p className="mt-2 text-[11px] text-white/40">{t('property.needFullSet')}</p>
          )}

          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full rounded-xl px-6 py-2.5 font-semibold text-white/80 ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            {t('property.close')}
          </button>
        </div>
      </m.div>
    </m.div>
  )
}

function ActionButton({
  enabled,
  onClick,
  children,
}: {
  enabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      className={cn(
        'rounded-lg px-3 py-2 text-sm font-semibold ring-1 ring-white/15 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white',
        enabled ? 'text-white/90 hover:bg-white/10' : 'cursor-not-allowed text-white/25',
      )}
    >
      {children}
    </button>
  )
}
