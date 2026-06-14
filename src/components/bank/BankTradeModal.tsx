import { useMemo, useState } from 'react'
import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { BOARD, GROUP_COLORS } from '../../bank/config'
import { canTrade, tradableTilesFor, type TradeOffer } from '../../bank/rules'
import type { BankController } from '../../hooks/useBankElHazz'
import { cn } from '../../lib/cn'

const tileName = (t: TFunction<'bank'>, id: number) => t(`tiles.${BOARD[id].nameKey}`)

/**
 * Build and complete a trade (P4). The current player picks a partner, then the
 * properties + cash each side gives, validated live by `canTrade`. "Propose"
 * moves to a hand-the-device confirmation where the partner accepts or declines;
 * an accepted trade commits as a seq-stamped `trade` event through the controller.
 */
export function BankTradeModal({ game, onClose }: { game: BankController; onClose: () => void }) {
  const { t } = useTranslation('bank')
  const me = game.currentPlayerIndex
  const partners = useMemo(() => game.players.filter((p) => p.id !== me && p.status === 'active'), [game.players, me])

  const [partner, setPartner] = useState<number | null>(partners.length === 1 ? partners[0].id : null)
  const [giveTiles, setGiveTiles] = useState<number[]>([])
  const [receiveTiles, setReceiveTiles] = useState<number[]>([])
  const [giveCash, setGiveCash] = useState(0)
  const [receiveCash, setReceiveCash] = useState(0)
  const [confirming, setConfirming] = useState(false)

  const myTiles = useMemo(() => tradableTilesFor(game, me), [game, me])
  const theirTiles = useMemo(() => (partner != null ? tradableTilesFor(game, partner) : []), [game, partner])
  const myCash = game.players[me]?.cash ?? 0
  const theirCash = partner != null ? (game.players[partner]?.cash ?? 0) : 0
  const partnerName = partner != null ? (game.players[partner]?.name ?? '') : ''

  const offer: TradeOffer | null =
    partner == null ? null : { from: me, to: partner, giveTiles, giveCash, receiveTiles, receiveCash }
  const valid = offer != null && canTrade(game, offer)

  const choosePartner = (id: number) => {
    setPartner(id)
    setReceiveTiles([])
    setReceiveCash(0)
  }
  const toggle = (list: number[], set: (v: number[]) => void, id: number) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  const accept = () => {
    if (offer) game.commitTrade(offer)
    onClose()
  }

  return (
    <m.div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label={t('trade.title')}
      onClick={onClose}
    >
      <m.div
        className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-night-800 shadow-2xl ring-1 ring-white/15"
        initial={{ scale: 0.85, y: 24, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        {confirming && offer ? (
          <div className="p-6 text-center">
            <h2 className="text-lg font-bold text-white">🤝 {t('trade.confirmTitle', { name: partnerName })}</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 text-start text-xs">
              <TradeSummary
                t={t}
                heading={t('trade.gives', { name: game.players[me]?.name ?? '' })}
                tiles={giveTiles}
                cash={giveCash}
              />
              <TradeSummary t={t} heading={t('trade.gives', { name: partnerName })} tiles={receiveTiles} cash={receiveCash} />
            </div>
            <div className="mt-6 flex gap-2.5">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-xl px-4 py-2.5 font-semibold text-white/80 ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              >
                {t('trade.decline')}
              </button>
              <m.button
                type="button"
                onClick={accept}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                className="flex-1 rounded-xl bg-linear-to-r from-amber-500 to-emerald-500 px-4 py-2.5 font-bold text-white shadow-lg ring-1 ring-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              >
                {t('trade.accept')}
              </m.button>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-white/10 p-5 pb-3">
              <h2 className="text-center text-lg font-bold text-white">🤝 {t('trade.title')}</h2>
              <p className="mt-2 text-xs uppercase tracking-wide text-white/50">{t('trade.with')}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {partners.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => choosePartner(p.id)}
                    aria-pressed={partner === p.id}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white',
                      partner === p.id
                        ? 'bg-white/15 text-white ring-white/30'
                        : 'text-white/70 ring-white/15 hover:bg-white/10',
                    )}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} aria-hidden="true" />
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {partner != null && (
              <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-y-auto p-5 pt-3">
                <TradeSide
                  t={t}
                  heading={t('trade.youGive')}
                  tiles={myTiles}
                  selected={giveTiles}
                  onToggle={(id) => toggle(giveTiles, setGiveTiles, id)}
                  cash={giveCash}
                  maxCash={myCash}
                  onCash={setGiveCash}
                />
                <TradeSide
                  t={t}
                  heading={t('trade.youReceive')}
                  tiles={theirTiles}
                  selected={receiveTiles}
                  onToggle={(id) => toggle(receiveTiles, setReceiveTiles, id)}
                  cash={receiveCash}
                  maxCash={theirCash}
                  onCash={setReceiveCash}
                />
              </div>
            )}

            <div className="flex gap-2.5 border-t border-white/10 p-5 pt-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl px-4 py-2.5 font-semibold text-white/80 ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              >
                {t('trade.cancel')}
              </button>
              <m.button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={!valid}
                whileHover={valid ? { scale: 1.04 } : undefined}
                whileTap={valid ? { scale: 0.96 } : undefined}
                className={cn(
                  'flex-1 rounded-xl px-4 py-2.5 font-bold text-white shadow-lg ring-1 ring-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white',
                  valid ? 'bg-linear-to-r from-amber-500 to-emerald-500' : 'cursor-not-allowed bg-white/10 text-white/40',
                )}
              >
                {t('trade.propose')}
              </m.button>
            </div>
          </>
        )}
      </m.div>
    </m.div>
  )
}

interface TradeSideProps {
  t: TFunction<'bank'>
  heading: string
  tiles: number[]
  selected: number[]
  onToggle: (id: number) => void
  cash: number
  maxCash: number
  onCash: (n: number) => void
}

function TradeSide({ t, heading, tiles, selected, onToggle, cash, maxCash, onCash }: TradeSideProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-bold uppercase tracking-wide text-white/50">{heading}</p>
      <div className="flex flex-col gap-1.5">
        {tiles.length === 0 && <p className="text-[11px] text-white/35">{t('trade.noProps')}</p>}
        {tiles.map((id) => {
          const on = selected.includes(id)
          const color = BOARD[id].group ? GROUP_COLORS[BOARD[id].group!] : '#888'
          return (
            <button
              key={id}
              type="button"
              onClick={() => onToggle(id)}
              aria-pressed={on}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-start text-xs ring-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white',
                on ? 'bg-emerald-400/15 text-white ring-emerald-300/40' : 'text-white/75 ring-white/12 hover:bg-white/10',
              )}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: color }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{tileName(t, id)}</span>
            </button>
          )
        })}
      </div>
      <label className="mt-1 flex flex-col gap-1 text-xs text-white/50">
        {t('trade.cash')}
        <input
          type="number"
          min={0}
          max={maxCash}
          step={10}
          value={cash}
          onChange={(e) => onCash(Math.max(0, Math.min(maxCash, Math.floor(Number(e.target.value) || 0))))}
          className="w-full rounded-lg bg-night-900/60 px-2 py-1.5 text-sm tabular-nums text-white outline-none ring-1 ring-white/15 focus:ring-2 focus:ring-white/50"
        />
      </label>
    </div>
  )
}

function TradeSummary({
  t,
  heading,
  tiles,
  cash,
}: {
  t: TFunction<'bank'>
  heading: string
  tiles: number[]
  cash: number
}) {
  return (
    <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
      <p className="mb-1 font-bold text-white/80">{heading}</p>
      <ul className="flex flex-col gap-0.5 text-white/65">
        {tiles.map((id) => (
          <li key={id} className="truncate">
            • {tileName(t, id)}
          </li>
        ))}
        {cash > 0 && <li className="tabular-nums text-amber-200">• {t('money', { n: cash })}</li>}
        {tiles.length === 0 && cash === 0 && <li className="text-white/35">{t('trade.nothing')}</li>}
      </ul>
    </div>
  )
}
