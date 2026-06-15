/**
 * The orchestration facade for Bank El-Hazz — the Bank counterpart of
 * {@link useLudo}. This is the ONLY place that mixes the pure reducer, the pure
 * rules engine, sound, and animation timing; components depend on the clean
 * object it returns (`BankController`), never on the reducer/rules/timers
 * directly (Dependency Inversion).
 *
 * A turn runs as an async sequence (`executeTurn`): tumble dice → walk the move
 * path tile-by-tile (flashing on a pass-start) → play the remaining effects in
 * order (luck reveal, cash/rent/tax beats, jail clang, bankruptcy) → commit. The
 * sequence replays a fully-resolved {@link BankTurnResolution}, so a *local* roll
 * and a *remote* roll animate identically and two clients stay in sync.
 *
 * Everything protocol-shaped — sequence numbers, the one-at-a-time event queue,
 * duplicate/gap handling, run cancellation, the settled-state probe — lives in
 * the shared {@link createTurnSequencer} core (also used by Snakes and Ludo).
 *
 * The one piece with no Snakes analogue is the **buy decision**: a roll can land
 * on an unowned, affordable property, which the reducer commits into a local
 * `deciding` pause. The choice is then a *separate*, seq-stamped committed event
 * (`type:'decision'`) flowing through the very same turn channel — so it stays
 * replay-safe online with no authoritative server.
 *
 * `controlsPlayer` gates who may act: `'all'` for local pass-and-play, or a
 * specific seat for online play (P6).
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import {
  bankReducer,
  initialBankState,
  type PlayerSetup,
  type PlayerSnapshot,
} from '../bank/bankReducer'
import {
  buildMortgage,
  buildSell,
  buildTrade,
  buildUnmortgage,
  buildUpgrade,
  canBuildHouse,
  canMortgage,
  canSellHouse,
  canTrade,
  canUnmortgage,
  resolveBuyDecision,
  resolveCardDraw,
  resolveDecline,
  resolveTurn,
  rollDice,
  type TradeOffer,
} from '../bank/rules'
import { asBankRules, JAIL_TILE, TIMING } from '../bank/config'
import type { BankGameState, BankRules, BankTurnResolution, CardDeck, CardId } from '../bank/types'
import { createTurnSequencer, type SequencerHandlers } from '../lib/turnSequencer'
import type { MatchLog } from '../lib/matchLog'
import { useFlash } from './useFlash'
import { useSound } from './useSound'

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Transient mid-animation override for the one token currently in motion. */
export interface BankActiveMove {
  seat: number
  /** The tile to render the moving token at (instead of its committed one). */
  tile: number
}

/** The drawn card being revealed mid-turn (transient; not committed state). */
export interface BankCardReveal {
  seat: number
  deck: CardDeck
  cardId: CardId
  /** The drawer's balance before the card's direct cash effect. */
  balanceBefore: number
  /** The signed cash change the card applied (0 for non-money cards). */
  delta: number
  /** The drawer's balance after the card resolved. */
  balanceAfter: number
}

export interface BankNetHooks {
  /** Fired after a *local* committed event (roll / buy decision) so it can be broadcast. */
  onLocalTurn?: (resolution: BankTurnResolution, seq: number) => void
  /** Fired when this client starts/restarts the game (host broadcasts it). */
  onStart?: (players: PlayerSetup[], rules: BankRules) => void
  /** Fired when a remote turn arrives out of order — request a fresh snapshot. */
  onOutOfSync?: () => void
}

export interface UseBankOptions {
  /** Which seat this client may act for. `'all'` = local hot-seat. */
  controlsPlayer?: number | 'all'
  hooks?: BankNetHooks
}

interface LoadSnapshotArgs {
  players: PlayerSnapshot[]
  ownership: BankGameState['ownership']
  rules: BankRules
  currentPlayerIndex: number
  bankruptedOrder: number[]
  ended: boolean
  winnerId: number | null
  turnCount: number
}

/** How many committed states the local undo stack keeps. */
const UNDO_DEPTH = 40

export function useBankElHazz({ controlsPlayer = 'all', hooks }: UseBankOptions = {}) {
  const [state, dispatch] = useReducer(bankReducer, initialBankState)
  const [activeMove, setActiveMove] = useState<BankActiveMove | null>(null)
  const [cardReveal, setCardReveal] = useState<BankCardReveal | null>(null)
  // Local pass-and-play only: pre-roll snapshots, newest last (the undo stack).
  const [history, setHistory] = useState<BankGameState[]>([])
  // Every committed event since START_GAME — feeds the recap and the replay.
  // Null when this client joined mid-match (it never saw the early turns).
  const [matchLog, setMatchLog] = useState<MatchLog<BankTurnResolution, BankRules> | null>(null)
  // Floating "+200 / −100" number over a player during the effect beats.
  const cashFlash = useFlash<{ delta: number }>()
  // "X's turn was skipped" notice (jail skip, or an absent online player).
  const skipFlash = useFlash()
  // A brief celebration over the board: doubles (roll again), catching the Fast
  // Bus (next roll doubled), or cashing in a held Fast Bus buff (this roll ×2).
  const rollFlash = useFlash<{ reason: 'doubles' | 'fastBus' | 'usedFastBus' }>()
  const { sound, muted, toggleMute } = useSound()
  const reduced = useReducedMotion()

  // A one-shot acknowledge gate for the Luck/Court card popup. `executeTurn`
  // parks on `waitForCardAck()` while a card is shown; the modal's Confirm
  // button calls `acknowledgeCard` to resume. `clearTransients` flushes any
  // pending gate so a cancelled run (reset/undo/new game) never hangs.
  const ackRef = useRef<(() => void) | null>(null)
  const waitForCardAck = useCallback(
    () => new Promise<void>((resolve) => { ackRef.current = resolve }),
    [],
  )
  const acknowledgeCard = useCallback(() => {
    const resolve = ackRef.current
    ackRef.current = null
    resolve?.()
  }, [])

  // Latest-value refs, synced after each commit. Every consumer reads them from
  // event handlers or async continuations — never during render.
  const stateRef = useRef(state)
  const hooksRef = useRef(hooks)
  useEffect(() => {
    stateRef.current = state
    hooksRef.current = hooks
  })

  const timings = useMemo(
    () =>
      reduced
        ? { dice: 250, step: 60, cash: 160, luck: 500, jail: 240, bankrupt: 320, handoff: 120, skip: 240 }
        : {
            dice: TIMING.diceRollMs,
            step: TIMING.stepMs,
            cash: TIMING.cashBeatMs,
            luck: TIMING.luckRevealMs,
            jail: TIMING.jailMs,
            bankrupt: TIMING.bankruptMs,
            handoff: TIMING.turnHandoffMs,
            skip: TIMING.skipHandoffMs,
          },
    [reduced],
  )

  /** Commit a resolution and append it to the recap/replay log. */
  const commitResolution = useCallback((resolution: BankTurnResolution) => {
    dispatch({ type: 'COMMIT_TURN', resolution })
    // A trade has no single `seat`; log it under the proposer.
    const seat = resolution.type === 'trade' ? resolution.from : resolution.seat
    setMatchLog(
      (log) =>
        log && {
          ...log,
          events: [...log.events, { kind: 'turn', seat, resolution }],
        },
    )
  }, [])

  /**
   * Animate a fully-resolved event, then commit it. Shared by local + remote.
   * `skipRoll` is set when the dice were already tumbled by a local roll.
   */
  const executeTurn = useCallback(
    async (resolution: BankTurnResolution, alive: () => boolean, opts?: { skipRoll?: boolean }) => {
      // A jailed player's committed skip: a short beat, then commit.
      if (resolution.type === 'jailSkip') {
        sound.playSkip()
        skipFlash.trigger(resolution.seat, TIMING.skipHandoffMs)
        await delay(timings.skip)
        if (!alive()) return
        commitResolution(resolution)
        return
      }

      // A buy/decline decision: stamp the purchase, then commit.
      if (resolution.type === 'decision') {
        if (resolution.action === 'buy') {
          sound.playBuy()
          await delay(timings.cash)
          if (!alive()) return
        }
        commitResolution(resolution)
        return
      }

      // A property-management action (build/sell/mortgage/unmortgage): one cash
      // beat with a floating delta, then commit. The seat doesn't change.
      if (resolution.type === 'manage') {
        for (const effect of resolution.effects) {
          switch (effect.kind) {
            case 'upgrade':
              sound.playBuy()
              cashFlash.trigger(effect.seat, timings.cash, { delta: -effect.cost })
              break
            case 'sell':
              sound.playCoins()
              cashFlash.trigger(effect.seat, timings.cash, { delta: effect.refund })
              break
            case 'mortgage':
              sound.playCoins()
              cashFlash.trigger(effect.seat, timings.cash, { delta: effect.amount })
              break
            case 'unmortgage':
              sound.playPenalty()
              cashFlash.trigger(effect.seat, timings.cash, { delta: -effect.cost })
              break
          }
        }
        await delay(timings.cash)
        if (!alive()) return
        commitResolution(resolution)
        return
      }

      // A completed trade: a brief coins beat, then commit.
      if (resolution.type === 'trade') {
        sound.playCoins()
        await delay(timings.cash)
        if (!alive()) return
        commitResolution(resolution)
        return
      }

      // resolution.type === 'roll' | 'cardDraw'. A `cardDraw` (the chosen-deck
      // draw on a "Luck or Court" cell) shares the roll's effect animation but
      // tumbles no dice — the dice already settled on the paused roll.
      const { seat } = resolution
      if (!stateRef.current.players[seat]) return

      // 1) Tumble the dice (a fresh roll only, unless the local roll already did).
      if (resolution.type === 'roll' && !opts?.skipRoll) {
        dispatch({ type: 'BEGIN_ROLL', dice: resolution.dice })
        sound.playRoll()
        await delay(timings.dice)
        if (!alive()) return
      }
      // A held Fast Bus buff just doubled this roll — celebrate the ×2.
      if (resolution.type === 'roll' && resolution.usedFastBus)
        rollFlash.trigger(seat, 1500, { reason: 'usedFastBus' })

      // 2) Play every effect in order.
      dispatch({ type: 'BEGIN_MOVE' })
      for (const effect of resolution.effects) {
        switch (effect.kind) {
          case 'move':
            for (const tile of effect.path) {
              setActiveMove({ seat, tile })
              sound.playStep()
              await delay(timings.step)
              if (!alive()) return
            }
            break
          case 'passStart':
            sound.playPassStart()
            cashFlash.trigger(seat, timings.cash, { delta: effect.amount })
            await delay(timings.cash)
            if (!alive()) return
            break
          case 'card':
            sound.playLuckDraw()
            setCardReveal({
              seat,
              deck: effect.deck,
              cardId: effect.cardId,
              balanceBefore: effect.balanceBefore ?? 0,
              delta: effect.delta ?? 0,
              balanceAfter: effect.balanceAfter ?? 0,
            })
            // Hold until the player taps Confirm (no auto-dismiss). The pause
            // keeps `phase === 'moving'`, so the bot driver waits too.
            await waitForCardAck()
            if (!alive()) return
            break
          case 'cash':
            if (effect.delta >= 0) sound.playCoins()
            else sound.playPenalty()
            cashFlash.trigger(effect.seat, timings.cash, { delta: effect.delta })
            await delay(timings.cash)
            if (!alive()) return
            break
          case 'pay':
            sound.playPenalty()
            cashFlash.trigger(effect.from, timings.cash, { delta: -effect.amount })
            await delay(timings.cash)
            if (!alive()) return
            break
          case 'collect':
            sound.playCoins()
            cashFlash.trigger(effect.to, timings.cash, { delta: effect.amount * effect.froms.length })
            await delay(timings.cash)
            if (!alive()) return
            break
          case 'jail':
            setActiveMove({ seat: effect.seat, tile: JAIL_TILE })
            sound.playJail()
            await delay(timings.jail)
            if (!alive()) return
            break
          case 'jailRelease':
            // Stepping out of jail — a short freedom chime before moving.
            sound.playPassStart()
            await delay(timings.cash)
            if (!alive()) return
            break
          case 'jailStay':
            // Failed escape — gate clang + the "sat out" flash, then hand off.
            sound.playJail()
            skipFlash.trigger(effect.seat, timings.jail)
            await delay(timings.jail)
            if (!alive()) return
            break
          case 'grantJailCard':
            // The card reveal already showed; a brief beat to bank it.
            sound.playCoins()
            await delay(timings.handoff)
            if (!alive()) return
            break
          case 'fastBus':
            sound.playPassStart()
            rollFlash.trigger(effect.seat, 1500, { reason: 'fastBus' })
            await delay(timings.cash)
            if (!alive()) return
            break
          case 'bankrupt':
            sound.playBankrupt()
            await delay(timings.bankrupt)
            if (!alive()) return
            break
        }
      }

      // 3) Settle, then commit (batched so the token never flashes back).
      await delay(timings.handoff)
      if (!alive()) return
      setActiveMove(null)
      setCardReveal(null)
      commitResolution(resolution)
      if (resolution.isWin) sound.playWin()
      // Rolling doubles earns another turn — a quick "roll again!" cheer. Hold it
      // on a roll that paused for a deck choice; the follow-up `cardDraw` cheers.
      else if (resolution.extraTurn && !(resolution.type === 'roll' && resolution.cardChoice)) {
        sound.playExtraTurn()
        rollFlash.trigger(seat, 1500, { reason: 'doubles' })
      }
    },
    [sound, timings, cashFlash, skipFlash, rollFlash, commitResolution, waitForCardAck],
  )

  /** Hand the turn to the next active player because the current one left (P6). */
  const executeSkip = useCallback(() => {
    const snap = stateRef.current
    if (snap.phase !== 'idle') return
    sound.playSkip()
    skipFlash.trigger(snap.currentPlayerIndex, TIMING.skipHandoffMs)
    dispatch({ type: 'SKIP_TURN' })
    setMatchLog(
      (log) => log && { ...log, events: [...log.events, { kind: 'skip', seat: snap.currentPlayerIndex }] },
    )
  }, [sound, skipFlash])

  // The shared sequencing core: orders, dedupes, and drains every
  // sequence-stamped event (turns, skips) exactly once.
  const handlers: SequencerHandlers<BankTurnResolution> = {
    executeTurn,
    executeSkip,
    executeDecision: () => {}, // Bank has no host continue/end decision.
    committedCount: () => stateRef.current.turnCount,
    onOutOfSync: () => hooksRef.current?.onOutOfSync?.(),
  }
  const [sequencer] = useState(() => createTurnSequencer<BankTurnResolution>())
  useEffect(() => {
    sequencer.update(handlers)
  })

  /**
   * Tumble the dice and resolve the current player's turn. `jailIntent` tells the
   * rules engine how a jailed player is leaving (roll for doubles / pay the fine /
   * spend a card); it is ignored for a free player. Shared by `roll`,
   * `payJailFine`, and `useJailCard` so every turn flows through one channel.
   */
  const beginTurn = useCallback(
    async (jailIntent?: 'roll' | 'payFine' | 'useCard') => {
      const snap = stateRef.current
      if (snap.phase !== 'idle') return
      if (controlsPlayer !== 'all' && controlsPlayer !== snap.currentPlayerIndex) return
      const seat = snap.currentPlayerIndex
      const player = snap.players[seat]
      if (!player) return
      if (!sequencer.acquireTurnLock()) return
      try {
        // Local hot-seat: remember the pre-roll state so this turn can be undone.
        if (controlsPlayer === 'all') {
          setHistory((prev) => [...prev.slice(-(UNDO_DEPTH - 1)), snap])
        }

        const alive = sequencer.beginRun()
        const dice = rollDice()
        dispatch({ type: 'BEGIN_ROLL', dice })
        sound.playRoll()
        await delay(timings.dice)
        if (!alive()) return

        const resolution = resolveTurn({ state: snap, dice, jailIntent })
        hooksRef.current?.onLocalTurn?.(resolution, sequencer.claimSeq())
        await executeTurn(resolution, sequencer.beginRun(), { skipRoll: true })
      } finally {
        sequencer.releaseTurnLock()
      }
    },
    [controlsPlayer, executeTurn, sequencer, sound, timings],
  )

  /** Roll for the current player (a jailed player rolls for doubles to escape). */
  const roll = useCallback(() => {
    const player = stateRef.current.players[stateRef.current.currentPlayerIndex]
    return beginTurn(player && player.jailTurns > 0 ? 'roll' : undefined)
  }, [beginTurn])

  /** Pay the jail fine, then roll and move (only when jailed and able to pay). */
  const payJailFine = useCallback(() => {
    const snap = stateRef.current
    const player = snap.players[snap.currentPlayerIndex]
    if (!player || player.jailTurns <= 0 || player.cash < snap.rules.jailFine) return
    return beginTurn('payFine')
  }, [beginTurn])

  /** Spend a kept Get-Out-of-Jail card, then roll and move (only when held). */
  const useJailCard = useCallback(() => {
    const snap = stateRef.current
    const player = snap.players[snap.currentPlayerIndex]
    if (!player || player.jailTurns <= 0 || player.jailCards <= 0) return
    return beginTurn('useCard')
  }, [beginTurn])

  /** Resolve the open buy choice (buy or decline). */
  const decide = useCallback(
    async (action: 'buy' | 'decline') => {
      const snap = stateRef.current
      if (snap.phase !== 'deciding' || !snap.pendingBuy) return
      if (controlsPlayer !== 'all' && controlsPlayer !== snap.pendingBuy.seat) return
      if (!sequencer.acquireTurnLock()) return
      try {
        const resolution = action === 'buy' ? resolveBuyDecision(snap) : resolveDecline(snap)
        hooksRef.current?.onLocalTurn?.(resolution, sequencer.claimSeq())
        await executeTurn(resolution, sequencer.beginRun())
      } finally {
        sequencer.releaseTurnLock()
      }
    },
    [controlsPlayer, executeTurn, sequencer],
  )

  const decideBuy = useCallback(() => decide('buy'), [decide])
  const decideDecline = useCallback(() => decide('decline'), [decide])

  /**
   * Resolve an open "Luck or Court" deck choice: draw from the chosen deck and
   * commit the `cardDraw` through the same channel as a roll (so the drawn card
   * shows in the same confirmation popup and a doubles chain still grants an
   * extra roll). Mirrors {@link decide}.
   */
  const chooseCard = useCallback(
    async (deck: CardDeck) => {
      const snap = stateRef.current
      if (snap.phase !== 'deciding' || !snap.pendingChoice) return
      if (controlsPlayer !== 'all' && controlsPlayer !== snap.pendingChoice.seat) return
      if (!sequencer.acquireTurnLock()) return
      try {
        const resolution = resolveCardDraw(snap, deck)
        hooksRef.current?.onLocalTurn?.(resolution, sequencer.claimSeq())
        await executeTurn(resolution, sequencer.beginRun())
      } finally {
        sequencer.releaseTurnLock()
      }
    },
    [controlsPlayer, executeTurn, sequencer],
  )

  /**
   * Commit a property-management / trade resolution through the same channel as a
   * roll: take the turn lock, snapshot for undo (local), broadcast, animate, and
   * commit. The reducer keeps the seat, so the player plays on after acting.
   */
  const runManage = useCallback(
    async (resolution: BankTurnResolution) => {
      if (!sequencer.acquireTurnLock()) return
      try {
        if (controlsPlayer === 'all') {
          setHistory((prev) => [...prev.slice(-(UNDO_DEPTH - 1)), stateRef.current])
        }
        hooksRef.current?.onLocalTurn?.(resolution, sequencer.claimSeq())
        await executeTurn(resolution, sequencer.beginRun())
      } finally {
        sequencer.releaseTurnLock()
      }
    },
    [controlsPlayer, executeTurn, sequencer],
  )

  /** Build one house/hotel on an owned property (validated against live state). */
  const buildHouse = useCallback(
    (tile: number) => {
      const snap = stateRef.current
      const seat = snap.currentPlayerIndex
      if (snap.phase !== 'idle' || (controlsPlayer !== 'all' && controlsPlayer !== seat)) return
      if (!canBuildHouse(snap, seat, tile)) return
      return runManage(buildUpgrade(snap, tile))
    },
    [controlsPlayer, runManage],
  )

  /** Sell one house/hotel back to the bank. */
  const sellHouse = useCallback(
    (tile: number) => {
      const snap = stateRef.current
      const seat = snap.currentPlayerIndex
      if (snap.phase !== 'idle' || (controlsPlayer !== 'all' && controlsPlayer !== seat)) return
      if (!canSellHouse(snap, seat, tile)) return
      return runManage(buildSell(snap, tile))
    },
    [controlsPlayer, runManage],
  )

  /** Mortgage an owned, unimproved property for cash. */
  const mortgage = useCallback(
    (tile: number) => {
      const snap = stateRef.current
      const seat = snap.currentPlayerIndex
      if (snap.phase !== 'idle' || (controlsPlayer !== 'all' && controlsPlayer !== seat)) return
      if (!canMortgage(snap, seat, tile)) return
      return runManage(buildMortgage(snap, tile))
    },
    [controlsPlayer, runManage],
  )

  /** Lift a mortgage by paying the principal + interest. */
  const unmortgage = useCallback(
    (tile: number) => {
      const snap = stateRef.current
      const seat = snap.currentPlayerIndex
      if (snap.phase !== 'idle' || (controlsPlayer !== 'all' && controlsPlayer !== seat)) return
      if (!canUnmortgage(snap, seat, tile)) return
      return runManage(buildUnmortgage(snap, tile))
    },
    [controlsPlayer, runManage],
  )

  /** Commit an accepted trade proposed by the current player. */
  const commitTrade = useCallback(
    (offer: TradeOffer) => {
      const snap = stateRef.current
      if (snap.phase !== 'idle' || offer.from !== snap.currentPlayerIndex) return
      if (controlsPlayer !== 'all' && controlsPlayer !== offer.from) return
      if (!canTrade(snap, offer)) return
      return runManage(buildTrade(offer))
    },
    [controlsPlayer, runManage],
  )

  const applyRemoteTurn = useCallback(
    (resolution: BankTurnResolution, seq: number) => {
      sequencer.accept({ kind: 'turn', resolution }, seq)
    },
    [sequencer],
  )

  const applySkip = useCallback((seq: number) => sequencer.accept({ kind: 'skip' }, seq), [sequencer])

  // Bank has no host continue/end (`decide`) decision — the buy/skip choice is a
  // normal `turn` resolution. This stub exists only to satisfy the generic
  // online machinery's structural `OnlineMatchGame` view of the controller.
  const applyRemoteDecision = useCallback(() => {}, [])

  /** Seat a host-approved late joiner at the end of the running match (P6). */
  const addPlayer = useCallback((player: PlayerSetup) => {
    dispatch({ type: 'ADD_PLAYER', player })
  }, [])

  const clearTransients = useCallback(() => {
    setActiveMove(null)
    setCardReveal(null)
    cashFlash.clear()
    skipFlash.clear()
    rollFlash.clear()
    // Release a pending card-confirm gate so a cancelled run never hangs.
    ackRef.current?.()
    ackRef.current = null
  }, [cashFlash, skipFlash, rollFlash])

  const startGame = useCallback(
    (players: PlayerSetup[], rules?: BankRules) => {
      const matchRules = asBankRules(rules)
      sequencer.rebase(0)
      clearTransients()
      setHistory([])
      dispatch({ type: 'START_GAME', players, rules: matchRules })
      setMatchLog({ players: players.map((p) => ({ ...p })), rules: matchRules, events: [] })
      hooksRef.current?.onStart?.(players, matchRules)
    },
    [sequencer, clearTransients],
  )

  const applyRemoteStart = useCallback(
    (players: PlayerSetup[], rules?: unknown) => {
      const matchRules = asBankRules(rules)
      sequencer.rebase(0)
      clearTransients()
      setHistory([])
      dispatch({ type: 'START_GAME', players, rules: matchRules })
      setMatchLog({ players: players.map((p) => ({ ...p })), rules: matchRules, events: [] })
    },
    [sequencer, clearTransients],
  )

  const loadSnapshot = useCallback(
    (snapshot: LoadSnapshotArgs) => {
      sequencer.rebase(snapshot.turnCount)
      clearTransients()
      dispatch({ type: 'LOAD_SNAPSHOT', ...snapshot })
      setMatchLog(null) // joined mid-match: the early turns are unknowable
    },
    [sequencer, clearTransients],
  )

  const forfeitWin = useCallback(
    (winnerId: number) => {
      const snap = stateRef.current
      if (snap.phase === 'setup' || snap.phase === 'won') return
      sequencer.rebase(snap.turnCount)
      clearTransients()
      dispatch({ type: 'FORFEIT_WIN', winnerId })
      sound.playWin()
    },
    [sequencer, sound, clearTransients],
  )

  const syncStatus = useCallback(
    () => ({
      seq: sequencer.seq,
      // The buy pause counts as busy: the turn is committed but not yet resolved.
      busy: sequencer.busy() || stateRef.current.phase === 'deciding',
    }),
    [sequencer],
  )

  const reset = useCallback(() => {
    sequencer.rebase(0)
    clearTransients()
    setHistory([])
    setMatchLog(null)
    dispatch({ type: 'RESET' })
  }, [sequencer, clearTransients])

  /**
   * Restore a saved local pass-and-play match (Phase 8): rebase the sequencer to
   * the saved turn count, reinstate its committed state and recap/replay log, and
   * clear any animation transients + undo history. Online play never persists, so
   * this is a local-only entry point.
   */
  const resume = useCallback(
    (saved: { state: BankGameState; log: MatchLog<BankTurnResolution, BankRules> | null }) => {
      sequencer.rebase(saved.state.turnCount)
      clearTransients()
      setHistory([])
      dispatch({ type: 'RESTORE', state: saved.state })
      setMatchLog(saved.log)
    },
    [sequencer, clearTransients],
  )

  const applyRemoteReset = reset

  /**
   * Local pass-and-play undo: rewind to the last pre-roll state where a HUMAN
   * was about to act (skipping bot turns, which would instantly replay).
   * Online play never records history, so this is inert there.
   */
  const undo = useCallback(() => {
    if (controlsPlayer !== 'all') return
    const snap = stateRef.current
    if (snap.phase !== 'idle') return
    setHistory((prev) => {
      let i = prev.length - 1
      while (i >= 0 && prev[i].players[prev[i].currentPlayerIndex]?.isBot) i--
      if (i < 0) return prev
      const target = prev[i]
      sequencer.rebase(target.turnCount)
      clearTransients()
      dispatch({ type: 'RESTORE', state: target })
      setMatchLog((log) => log && { ...log, events: log.events.slice(0, target.turnCount) })
      return prev.slice(0, i)
    })
  }, [controlsPlayer, sequencer, clearTransients])

  const canUndo =
    controlsPlayer === 'all' &&
    state.phase === 'idle' &&
    history.some((h) => !h.players[h.currentPlayerIndex]?.isBot)

  const currentPlayer = state.players[state.currentPlayerIndex] ?? null
  const winner = state.winnerId != null ? (state.players[state.winnerId] ?? null) : null
  // Final standings (best → worst): the winner, then the bankrupted in reverse
  // elimination order (the last one out placed highest of the losers).
  const standings =
    state.phase === 'won' && state.winnerId != null
      ? [state.winnerId, ...[...state.bankruptedOrder].reverse()]
          .map((id) => state.players[id])
          .filter((p) => p != null)
      : []
  const isMyTurn = controlsPlayer === 'all' || controlsPlayer === state.currentPlayerIndex
  const canRoll = state.phase === 'idle' && isMyTurn
  const canDecide =
    state.phase === 'deciding' &&
    state.pendingBuy != null &&
    (controlsPlayer === 'all' || controlsPlayer === state.pendingBuy.seat)
  // A "Luck or Court" deck choice is open for this client to resolve.
  const canChooseCard =
    state.phase === 'deciding' &&
    state.pendingChoice != null &&
    (controlsPlayer === 'all' || controlsPlayer === state.pendingChoice.seat)
  // P2 jail: the current player is locked up and choosing how to get out.
  const inJail = (currentPlayer?.jailTurns ?? 0) > 0
  const canManageJail = state.phase === 'idle' && isMyTurn && inJail
  const canPayJailFine = canManageJail && (currentPlayer?.cash ?? 0) >= state.rules.jailFine
  const canUseJailCard = canManageJail && (currentPlayer?.jailCards ?? 0) > 0
  // P3/P4 management: actionable on your own idle turn. A trade also needs at
  // least one other solvent player to deal with.
  const canManageProperties = state.phase === 'idle' && isMyTurn
  const canOpenTrade =
    canManageProperties && state.players.filter((p) => p.status === 'active').length >= 2

  return {
    ...state,
    currentPlayer,
    winner,
    standings,
    // The online machinery's generic view of "seats out of the rotation": in
    // Bank, bankrupt players (Ludo's `finishedOrder` are winners; here they are
    // the eliminated). The net layer only uses it to skip non-racing seats.
    finishedOrder: state.bankruptedOrder,
    // The last roll's total (sum of the two dice), or null before the first roll
    // / after a resync — the shape the online snapshot/heartbeat expects.
    lastRoll: state.lastDice.length === 2 ? state.lastDice[0] + state.lastDice[1] : null,
    activeMove,
    cardReveal,
    matchLog,
    cashFlash: cashFlash.flash,
    skipFlash: skipFlash.flash,
    rollFlash: rollFlash.flash,
    muted,
    toggleMute,
    controlsPlayer,
    isMyTurn,
    canRoll,
    canDecide,
    canUndo,
    // P2 jail controls.
    inJail,
    jailFine: state.rules.jailFine,
    canPayJailFine,
    canUseJailCard,
    payJailFine,
    useJailCard,
    roll,
    decideBuy,
    decideDecline,
    // "Luck or Court" deck choice (set while `pendingChoice` is open).
    canChooseCard,
    chooseCard,
    /** Dismiss the Luck/Court card popup (resumes the paused turn). */
    acknowledgeCard,
    // P3/P4 property management.
    canManageProperties,
    canOpenTrade,
    buildHouse,
    sellHouse,
    mortgage,
    unmortgage,
    commitTrade,
    undo,
    startGame,
    reset,
    resume,
    // The online layer (P6) drops in without logic changes.
    applyRemoteTurn,
    applySkip,
    applyRemoteDecision,
    applyRemoteStart,
    applyRemoteReset,
    addPlayer,
    loadSnapshot,
    forfeitWin,
    syncStatus,
  }
}

export type BankController = ReturnType<typeof useBankElHazz>
