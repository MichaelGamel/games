import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { ColorPicker } from './ColorPicker'
import { UnoCard } from './board/UnoCard'
import { mostCommonColor } from '../../uno/bot'
import type { UnoController, UnoChoice } from '../../hooks/useUno'
import type { UnoPlayer } from '../../uno/types'

interface UnoChoiceOverlayProps {
  choice: UnoChoice
  game: UnoController
  /** The seat making the choice (its hand drives a wild-color default). */
  seat: number
}

/**
 * The local `choosing` pause: a modal that collects the one decision baked into
 * the broadcast resolution — a wild color, a Seven-Zero swap target, or whether
 * to play a freshly-drawn card. Remote clients never see this.
 */
export function UnoChoiceOverlay({ choice, game, seat }: UnoChoiceOverlayProps) {
  const { t } = useTranslation(['uno', 'common'])

  return (
    <m.div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
    >
      <m.div
        className="w-full max-w-xs rounded-3xl bg-night-800 p-6 text-center shadow-2xl ring-1 ring-white/15"
        initial={{ scale: 0.8, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      >
        {choice.kind === 'color' && (
          <>
            <h3 className="mb-4 text-lg font-bold text-white">{t('chooseColor')}</h3>
            <div className="flex justify-center">
              <ColorPicker onPick={game.chooseColor} />
            </div>
          </>
        )}

        {choice.kind === 'seven' && (
          <>
            <h3 className="mb-1 text-lg font-bold text-white">{t('chooseSwap')}</h3>
            <p className="mb-4 text-sm text-white/60">{t('chooseSwapHint')}</p>
            <ul className="flex flex-col gap-2">
              {game.players.map((p: UnoPlayer) =>
                p.id === seat ? null : (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => game.chooseSwapTarget(p.id)}
                      className="flex w-full items-center gap-3 rounded-xl bg-white/5 px-4 py-2.5 text-left ring-1 ring-white/10 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                    >
                      <span
                        className="h-5 w-5 shrink-0 rounded-full ring-2 ring-white/40"
                        style={{ background: p.color }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate font-semibold text-white">{p.name}</span>
                      <span className="shrink-0 text-sm tabular-nums text-white/60">
                        {t('handCount', { n: game.hands[p.id]?.length ?? 0 })}
                      </span>
                    </button>
                  </li>
                ),
              )}
            </ul>
          </>
        )}

        {choice.kind === 'drawn' && (
          <>
            <h3 className="mb-1 text-lg font-bold text-white">{t('drewCard')}</h3>
            <p className="mb-4 text-sm text-white/60">{t('drewCardHint')}</p>
            <div className="mb-5 flex justify-center">
              <UnoCard card={choice.card} width={92} />
            </div>
            <div className="flex flex-col gap-2.5">
              <m.button
                type="button"
                onClick={() =>
                  game.resolveDrawnCard(
                    true,
                    choice.card.color == null ? mostCommonColor(game.hands[seat] ?? []) : undefined,
                  )
                }
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="rounded-xl bg-linear-to-r from-emerald-500 to-emerald-400 px-6 py-3 text-base font-bold text-white shadow-lg ring-1 ring-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {t('playIt')}
              </m.button>
              <button
                type="button"
                onClick={() => game.resolveDrawnCard(false)}
                className="rounded-xl px-6 py-2.5 font-semibold text-white/80 ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              >
                {t('keepIt')}
              </button>
            </div>
          </>
        )}
      </m.div>
    </m.div>
  )
}
