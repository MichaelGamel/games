import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { BOARD, DECKS, MAX_LEVEL } from '../../bank/config'
import type {
  BankRules,
  BankTurnResolution,
  CardDeck,
  CardId,
  CourtCardId,
  LuckCardId,
} from '../../bank/types'
import type { MatchLog } from '../../lib/matchLog'

interface BankGameLogProps {
  log: MatchLog<BankTurnResolution, BankRules> | null
  /** Pass-start reward, used to fill in the "go to Start" card text. */
  passReward: number
}

const tileName = (t: TFunction<'bank'>, tileId: number) => t(`tiles.${BOARD[tileId].nameKey}`)

/** The drawn card's full description, with its amount/reward filled in. */
function cardText(t: TFunction<'bank'>, deck: CardDeck, cardId: CardId, passReward: number): string {
  const e = DECKS[deck].find((c) => c.id === cardId)?.effect
  const opts =
    e?.kind === 'cash'
      ? { amount: Math.abs(e.amount) }
      : e?.kind === 'collectEach' || e?.kind === 'payEach'
        ? { amount: e.amount }
        : e?.kind === 'maintenance'
          ? { amount: e.perProperty }
          : e?.kind === 'moveToStart'
            ? { reward: passReward }
            : {}
  return deck === 'luck'
    ? t(`cards.luck.${cardId as LuckCardId}`, opts)
    : t(`cards.court.${cardId as CourtCardId}`, opts)
}

/** Turn the committed match log into human-readable lines (oldest → newest). */
function buildLines(
  log: MatchLog<BankTurnResolution, BankRules>,
  t: TFunction<'bank'>,
  passReward: number,
): { id: string; text: string }[] {
  const lines: { id: string; text: string }[] = []
  const nameOf = (seat: number) => log.players[seat]?.name ?? `P${seat + 1}`

  log.events.forEach((event, ei) => {
    if (event.kind !== 'turn') return
    const r = event.resolution
    const push = (text: string) => lines.push({ id: `${ei}-${lines.length}`, text })

    if (r.type === 'jailSkip') {
      push(t('log.skip', { name: nameOf(r.seat) }))
      return
    }
    if (r.type === 'decision') {
      const tile = tileName(t, r.tile)
      push(
        r.action === 'buy'
          ? t('log.bought', { name: nameOf(r.seat), tile, amount: r.price })
          : t('log.declined', { name: nameOf(r.seat), tile }),
      )
      return
    }
    if (r.type === 'manage') {
      for (const effect of r.effects) {
        const tile = 'tile' in effect ? tileName(t, effect.tile) : ''
        if (effect.kind === 'upgrade')
          push(t(effect.level >= MAX_LEVEL ? 'log.hotel' : 'log.build', { name: nameOf(effect.seat), tile }))
        else if (effect.kind === 'sell') push(t('log.sell', { name: nameOf(effect.seat), tile }))
        else if (effect.kind === 'mortgage')
          push(t('log.mortgage', { name: nameOf(effect.seat), tile, amount: effect.amount }))
        else if (effect.kind === 'unmortgage')
          push(t('log.unmortgage', { name: nameOf(effect.seat), tile, amount: effect.cost }))
      }
      return
    }
    if (r.type === 'trade') {
      push(t('log.trade', { from: nameOf(r.from), to: nameOf(r.to) }))
      return
    }

    // r.type === 'roll' | 'cardDraw' — a card draw shares the roll's effect feed
    // but moves no dice, so it skips the "rolled a+b" / Fast Bus opener.
    const name = nameOf(r.seat)
    if (r.type === 'roll') {
      push(
        r.dice.length === 1
          ? t('log.rolledOne', { name, a: r.dice[0] })
          : t('log.rolled', { name, a: r.dice[0], b: r.dice[1] }),
      )
      if (r.usedFastBus) push(t('log.fastBusRide', { name }))
    }
    for (const effect of r.effects) {
      switch (effect.kind) {
        case 'passStart':
          push(t('log.passStart', { name, amount: effect.amount }))
          break
        case 'jailRelease':
          if (effect.via === 'doubles') push(t('log.jailEscape', { name: nameOf(effect.seat) }))
          else if (effect.via === 'card') push(t('log.jailCardUsed', { name: nameOf(effect.seat) }))
          break
        case 'jailStay':
          push(t('log.jailStay', { name: nameOf(effect.seat) }))
          break
        case 'fastBus':
          push(t('log.fastBus', { name: nameOf(effect.seat) }))
          break
        case 'card':
          push(t('log.card', { name, card: cardText(t, effect.deck, effect.cardId, passReward) }))
          break
        case 'pay':
          if (effect.reason === 'rent')
            push(t('log.rent', { name, amount: effect.amount, owner: nameOf(effect.to) }))
          break
        case 'collect':
          push(t('log.collect', { name: nameOf(effect.to), amount: effect.amount * effect.froms.length }))
          break
        case 'cash':
          if (effect.reason === 'tax')
            push(t('log.tax', { name, amount: -effect.delta, label: tileName(t, r.finalTile) }))
          else if (effect.reason === 'club') push(t('log.club', { name, amount: -effect.delta }))
          else if (effect.reason === 'reward') push(t('log.reward', { name, amount: effect.delta }))
          else if (effect.reason === 'maintenance')
            push(t('log.maintenance', { name, amount: -effect.delta }))
          else if (effect.reason === 'jailFine') push(t('log.jailFine', { name, amount: -effect.delta }))
          break
        case 'jail':
          push(t('log.jail', { name: nameOf(effect.seat) }))
          break
        case 'bankrupt':
          push(t('log.bankrupt', { name: nameOf(effect.seat) }))
          break
      }
    }
    if (r.extraTurn) push(t('log.doubles', { name }))
    if (r.isWin && r.winnerId != null) push(t('log.win', { name: nameOf(r.winnerId) }))
  })

  return lines
}

/**
 * The scrolling action feed — the spec's "visible history". Rendered purely
 * from the match log, so it replays exactly during a recap. Auto-scrolls to the
 * newest line. Hidden for a client that joined mid-match (no log).
 */
export function BankGameLog({ log, passReward }: BankGameLogProps) {
  const { t } = useTranslation('bank')
  const scrollRef = useRef<HTMLOListElement>(null)
  const lines = log ? buildLines(log, t, passReward) : []

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines.length])

  if (!log) return null

  return (
    <div className="flex min-h-0 flex-col rounded-2xl bg-white/5 p-3 ring-1 ring-white/10 backdrop-blur">
      <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-white/45">{t('log.title')}</p>
      <ol
        ref={scrollRef}
        className="flex max-h-40 min-h-0 flex-col gap-1 overflow-y-auto pe-1 text-xs text-white/75 lg:max-h-72"
        aria-live="polite"
      >
        {lines.slice(-80).map((line) => (
          <li key={line.id} className="leading-snug">
            {line.text}
          </li>
        ))}
      </ol>
    </div>
  )
}
