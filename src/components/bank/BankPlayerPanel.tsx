import { memo } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import type { BankPlayer } from '../../bank/types'

interface BankPlayerPanelProps {
  player: BankPlayer
  isCurrent: boolean
  propertyCount: number
  /** Online: this seat is the local client ("You"). */
  isYou?: boolean
  /** Online: this seat's player has left the room (greyed out). */
  absent?: boolean
  /** A floating cash delta to flash over this seat (or null). */
  flash: { delta: number; nonce: number } | null
}

/**
 * One player's status card: token color + name, cash on hand, property count,
 * and jail/bankrupt chips, with the current seat highlighted. A cash change
 * flashes a floating ±amount during the turn's effect beats.
 */
export const BankPlayerPanel = memo(function BankPlayerPanel({
  player,
  isCurrent,
  propertyCount,
  isYou,
  absent,
  flash,
}: BankPlayerPanelProps) {
  const { t } = useTranslation(['bank', 'common'])
  const bankrupt = player.status === 'bankrupt'

  return (
    <div
      className={cn(
        'relative flex items-center gap-2.5 rounded-xl bg-white/5 px-3 py-2 ring-1 backdrop-blur transition',
        isCurrent ? 'ring-2' : 'ring-white/10',
        (bankrupt || absent) && 'opacity-50',
      )}
      style={isCurrent ? { boxShadow: `0 0 0 2px ${player.color}` } : undefined}
    >
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold text-white ring-2 ring-white/60"
        style={{ background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.85), rgba(255,255,255,0) 45%), ${player.color}` }}
        aria-hidden="true"
      >
        {player.name.charAt(0).toUpperCase()}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">
          {player.name}
          {player.isBot && <span aria-hidden="true"> 🤖</span>}
          {isYou && <span className="ms-1 text-xs font-normal text-white/50">({t('common:game.you')})</span>}
          {absent && <span className="ms-1 text-xs font-normal text-amber-300/80">({t('common:game.away')})</span>}
        </p>
        <div className="flex items-center gap-2 text-xs text-white/70">
          <span className="font-semibold tabular-nums text-amber-200">
            {bankrupt ? t('panel.bankrupt') : t('panel.cash', { n: player.cash })}
          </span>
          {!bankrupt && propertyCount > 0 && (
            <span className="tabular-nums">{t('panel.props', { n: propertyCount })}</span>
          )}
          {!bankrupt && player.jailTurns > 0 && <span className="text-rose-300">{t('panel.jailed')}</span>}
          {!bankrupt && player.jailCards > 0 && (
            <span className="text-amber-300">{t('panel.jailCard', { n: player.jailCards })}</span>
          )}
          {!bankrupt && player.fastBus && <span className="text-sky-300">{t('panel.fastBus')}</span>}
        </div>
      </div>

      <AnimatePresence>
        {flash && flash.delta !== 0 && (
          <m.span
            key={flash.nonce}
            initial={{ opacity: 0, y: 6, scale: 0.8 }}
            animate={{ opacity: 1, y: -14, scale: 1 }}
            exit={{ opacity: 0, y: -26 }}
            transition={{ duration: 0.5 }}
            className={cn(
              'pointer-events-none absolute end-3 top-1 text-sm font-bold tabular-nums drop-shadow',
              flash.delta > 0 ? 'text-emerald-300' : 'text-rose-300',
            )}
          >
            {flash.delta > 0 ? '+' : '−'}
            {t('money', { n: Math.abs(flash.delta) })}
          </m.span>
        )}
      </AnimatePresence>
    </div>
  )
})
