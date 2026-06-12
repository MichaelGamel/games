/**
 * The orchestration facade for UNO — the UNO counterpart of {@link useLudo}.
 * This is the ONLY place that mixes the pure reducer, the pure rules engine,
 * sound, and animation timing; components depend on the object it returns
 * ({@link UnoController}), never on the reducer/rules/timers directly.
 *
 * A committed event runs as an async sequence (`executeTurn`): show the beat
 * (card arcing to the discard / a draw sliding in) → commit → play outcome
 * sounds. The same sequence replays a fully-resolved {@link UnoTurnResolution},
 * so a *local* move and a *remote* move animate identically and two clients stay
 * in sync. Everything protocol-shaped — sequence numbers, the one-at-a-time
 * queue, gap/duplicate handling, run cancellation — lives in the shared
 * {@link createTurnSequencer} core.
 *
 * UNO's analogue of Ludo's selection pause is the **local-only `choosing`
 * pause**: a wild needs a color, a `7` (Seven-Zero) needs a swap target, and a
 * voluntary draw of a playable card needs a keep/play decision. The choice is
 * baked into the broadcast resolution, so remote clients never re-decide — the
 * same trick Ludo uses for its explicit `tokenId`.
 *
 * `controlsPlayer` gates who may act: `'all'` for local hot-seat, or a specific
 * seat for online play.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import {
  initialUnoState,
  unoReducer,
  type PlayerSetup,
  type PlayerSnapshot,
} from '../uno/unoReducer'
import {
  adjudicateChallenge,
  legalPlays,
  resolveCallout,
  resolveDraw,
  resolvePlay,
} from '../uno/rules'
import { mostCommonColor } from '../uno/bot'
import { asUnoRules, TIMING } from '../uno/config'
import { mulberry32 } from '../game/boardGen'
import type {
  MatchDecision,
  UnoCard,
  UnoColor,
  UnoGameState,
  UnoRules,
  UnoTurnResolution,
} from '../uno/types'
import { createTurnSequencer, type SequencerHandlers } from '../lib/turnSequencer'
import type { MatchLog } from '../lib/matchLog'
import { useFlash, type GameFlash } from './useFlash'
import { useSound } from './useSound'

export type UnoFlash = GameFlash

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** A random seed for a brand-new match's deck (host picks; broadcast online). */
const randomSeed = () => Math.floor(Math.random() * 0x7fffffff)

/**
 * The next round's deck seed, derived deterministically from the current one so
 * every client computes the identical next deck with no seed traveling over the
 * wire — the continue/end decision carries only the decision.
 */
const nextRoundSeed = (state: UnoGameState): number =>
  Math.floor(mulberry32(state.deckSeed + state.roundNumber * 0x9e3779b1)() * 0x7fffffff)

/** The local `choosing` pause: what the acting client is being asked to decide. */
export type UnoChoice =
  | { kind: 'color'; cards: UnoCard[] }
  | { kind: 'seven'; cards: UnoCard[] }
  | { kind: 'drawn'; card: UnoCard }

/** The opaque start payload UNO broadcasts: its rules *and* the deck seed. */
export interface UnoStartPayload {
  rules: UnoRules
  deckSeed: number
}

export function parseStartPayload(payload: unknown): UnoStartPayload {
  if (payload && typeof payload === 'object' && 'deckSeed' in payload) {
    const p = payload as { rules?: unknown; deckSeed?: unknown }
    return {
      rules: asUnoRules(p.rules),
      deckSeed: typeof p.deckSeed === 'number' ? p.deckSeed : 0,
    }
  }
  return { rules: asUnoRules(payload), deckSeed: 0 }
}

export interface UnoNetHooks {
  /** Fired after a *local* committed event (post-choice) so it can be broadcast. */
  onLocalTurn?: (resolution: UnoTurnResolution, seq: number) => void
  /** Fired after a *local* continue/end decision so it can be broadcast. */
  onLocalDecision?: (decision: MatchDecision, seq: number) => void
  /** Fired when this client starts/restarts the match (host broadcasts it). */
  onStart?: (players: PlayerSetup[], rules: UnoRules, deckSeed: number) => void
  /** Fired when a remote event arrives out of order — request a fresh snapshot. */
  onOutOfSync?: () => void
}

export interface UseUnoOptions {
  /** Which seat this client may act for. `'all'` = local hot-seat. */
  controlsPlayer?: number | 'all'
  hooks?: UnoNetHooks
}

export interface UnoLoadSnapshotArgs {
  players: PlayerSnapshot[]
  rules: UnoRules
  currentPlayerIndex: number
  stock: UnoCard[]
  discard: UnoCard[]
  activeColor: UnoColor
  direction: 1 | -1
  pendingDraw: number
  pendingDrawType: 'draw2' | 'wild4' | null
  reshuffleCount: number
  deckSeed: number
  roundNumber: number
  awaitingDecision: boolean
  ended: boolean
  turnCount: number
}

export interface UnoPlayOptions {
  chosenColor?: UnoColor
  sevenSwapTarget?: number
  /** Override the auto-armed UNO declaration (defaults to true when going to 1). */
  declareUno?: boolean
}

export function useUno({ controlsPlayer = 'all', hooks }: UseUnoOptions = {}) {
  const [state, dispatch] = useReducer(unoReducer, initialUnoState)
  // The open local `choosing` prompt (wild color / seven target / drawn card).
  const [choice, setChoice] = useState<UnoChoice | null>(null)
  // Every committed event since the match started — feeds the recap and replay.
  // Null when this client joined mid-match (it never saw the early turns).
  const [matchLog, setMatchLog] = useState<MatchLog<UnoTurnResolution, UnoRules> | null>(null)
  // "UNO!" call flash and "turn skipped" flash, shown on every client.
  const unoFlash = useFlash()
  const skipFlash = useFlash()
  const { sound, muted, toggleMute } = useSound()
  const reduced = useReducedMotion()

  // Latest-value refs, synced after each commit. Consumers read them from event
  // handlers / async continuations — never during render.
  const stateRef = useRef(state)
  const hooksRef = useRef(hooks)
  // The play awaiting a `choosing` decision (color / seven target).
  const pendingPlayRef = useRef<{ cards: UnoCard[]; declareUno?: boolean } | null>(null)
  // The card a voluntary draw turned up, awaiting keep/play.
  const drawnOfferRef = useRef<UnoCard | null>(null)
  useEffect(() => {
    stateRef.current = state
    hooksRef.current = hooks
  })

  const timings = useMemo(
    () =>
      reduced
        ? { play: 140, draw: 120, handoff: 120 }
        : { play: TIMING.playCardMs, draw: TIMING.drawCardMs, handoff: TIMING.turnHandoffMs },
    [reduced],
  )

  const controls = useCallback(
    (seat: number) => controlsPlayer === 'all' || controlsPlayer === seat,
    [controlsPlayer],
  )

  const appendTurn = useCallback((resolution: UnoTurnResolution) => {
    setMatchLog(
      (log) => log && { ...log, events: [...log.events, { kind: 'turn', seat: resolution.seat, resolution }] },
    )
  }, [])

  /**
   * Animate a fully-resolved event, then commit it. Shared by local + remote, so
   * both animate identically. The sequencer's run token (`alive`) invalidates an
   * in-flight sequence on reset/restart/snapshot.
   */
  const executeTurn = useCallback(
    async (resolution: UnoTurnResolution, alive: () => boolean) => {
      const seat = resolution.seat
      if (!stateRef.current.players[seat]) return

      switch (resolution.kind) {
        case 'play': {
          dispatch({ type: 'BEGIN_PLAY' })
          sound.playCardPlay()
          if (resolution.chosenColor) sound.playColorPick()
          await delay(timings.play)
          if (!alive()) return
          if (resolution.effect.reversed) sound.playReverse()
          if (resolution.effect.skipped) sound.playSkip()
          dispatch({ type: 'COMMIT_TURN', resolution })
          appendTurn(resolution)
          if (resolution.declaredUno) {
            sound.playUnoCall()
            unoFlash.trigger(seat, TIMING.unoFlashMs)
          }
          if (resolution.effect.isRoundWin) sound.playWin()
          return
        }
        case 'draw': {
          const wasPenalty = stateRef.current.pendingDraw > 0
          dispatch({ type: 'BEGIN_DRAW' })
          sound.playDraw()
          await delay(timings.draw)
          if (!alive()) return
          if (resolution.thenPlay) sound.playCardPlay()
          dispatch({ type: 'COMMIT_TURN', resolution })
          appendTurn(resolution)
          if (wasPenalty) sound.playPenalty()
          return
        }
        case 'challenge': {
          dispatch({ type: 'BEGIN_PLAY' })
          await delay(timings.play)
          if (!alive()) return
          dispatch({ type: 'COMMIT_TURN', resolution })
          appendTurn(resolution)
          sound.playPenalty()
          return
        }
        case 'callout': {
          sound.playPenalty()
          await delay(timings.draw)
          if (!alive()) return
          dispatch({ type: 'COMMIT_TURN', resolution })
          appendTurn(resolution)
          return
        }
      }
    },
    [sound, timings, unoFlash, appendTurn],
  )

  /** Hand the turn to the next player because the current one left the room. */
  const executeSkip = useCallback(() => {
    const snap = stateRef.current
    if (snap.phase !== 'idle') return
    sound.playSkip()
    skipFlash.trigger(snap.currentPlayerIndex, TIMING.skipFlashMs)
    dispatch({ type: 'SKIP_TURN' })
    setMatchLog(
      (log) => log && { ...log, events: [...log.events, { kind: 'skip', seat: snap.currentPlayerIndex }] },
    )
  }, [sound, skipFlash])

  const executeDecision = useCallback((decision: MatchDecision) => {
    if (decision === 'continue') {
      dispatch({ type: 'CONTINUE_MATCH', deckSeed: nextRoundSeed(stateRef.current) })
    } else {
      dispatch({ type: 'END_MATCH' })
    }
    setMatchLog((log) => log && { ...log, events: [...log.events, { kind: 'decision', decision }] })
  }, [])

  // The shared sequencing core orders, dedupes, and drains every
  // sequence-stamped event (turns, skips, decisions) exactly once.
  const handlers: SequencerHandlers<UnoTurnResolution> = {
    executeTurn,
    executeSkip,
    executeDecision,
    committedCount: () => stateRef.current.turnCount,
    onOutOfSync: () => hooksRef.current?.onOutOfSync?.(),
  }
  const [sequencer] = useState(() => createTurnSequencer<UnoTurnResolution>())
  useEffect(() => {
    sequencer.update(handlers)
  })

  // ---- Local actions -------------------------------------------------------

  const legalForSeat = useCallback((snap: UnoGameState, seat: number): UnoCard[] => {
    const top = snap.discard[snap.discard.length - 1]
    if (!top) return []
    return legalPlays(snap.hands[seat], top, snap.activeColor, snap.pendingDraw, snap.pendingDrawType, snap.rules)
  }, [])

  /** Play one card (or several identical, for multi-play). Pauses for a wild
   *  color / seven target when the choice isn't already supplied. */
  const play = useCallback(
    async (cards: UnoCard[], opts: UnoPlayOptions = {}) => {
      const snap = stateRef.current
      if (snap.phase !== 'idle') return
      const seat = snap.currentPlayerIndex
      if (!controls(seat)) return
      const card = cards[0]
      if (!card) return
      // Guard legality against the live rules (ignore taps on illegal cards).
      const legal = legalForSeat(snap, seat)
      if (!legal.some((c) => c.id === card.id)) return
      if (!cards.every((c) => c.value === card.value)) return
      if (!sequencer.acquireTurnLock()) return
      try {
        const needsColor = card.color == null && opts.chosenColor == null
        const needsTarget = card.value === 7 && snap.rules.sevenZero && opts.sevenSwapTarget == null
        if (needsColor || needsTarget) {
          pendingPlayRef.current = { cards, declareUno: opts.declareUno }
          setChoice(needsColor ? { kind: 'color', cards } : { kind: 'seven', cards })
          dispatch({ type: 'BEGIN_CHOOSE' })
          return // lock released in finally; the `choosing` phase guards re-entry
        }
        const declaredUno = opts.declareUno ?? snap.hands[seat].length - cards.length === 1
        const res = resolvePlay(snap, {
          cards,
          chosenColor: opts.chosenColor,
          sevenSwapTarget: opts.sevenSwapTarget,
          declaredUno,
        })
        hooksRef.current?.onLocalTurn?.(res, sequencer.claimSeq())
        await executeTurn(res, sequencer.beginRun())
      } finally {
        sequencer.releaseTurnLock()
      }
    },
    [controls, executeTurn, legalForSeat, sequencer],
  )

  /** Finish a pending play once the local choice is made. */
  const finishPendingPlay = useCallback(
    async (extra: { chosenColor?: UnoColor; sevenSwapTarget?: number }) => {
      const snap = stateRef.current
      if (snap.phase !== 'choosing') return
      const pending = pendingPlayRef.current
      if (!pending || !controls(snap.currentPlayerIndex)) return
      if (!sequencer.acquireTurnLock()) return
      try {
        setChoice(null)
        pendingPlayRef.current = null
        const seat = snap.currentPlayerIndex
        const declaredUno = pending.declareUno ?? snap.hands[seat].length - pending.cards.length === 1
        const res = resolvePlay(snap, { cards: pending.cards, ...extra, declaredUno })
        hooksRef.current?.onLocalTurn?.(res, sequencer.claimSeq())
        await executeTurn(res, sequencer.beginRun())
      } finally {
        sequencer.releaseTurnLock()
      }
    },
    [controls, executeTurn, sequencer],
  )

  const chooseColor = useCallback((color: UnoColor) => finishPendingPlay({ chosenColor: color }), [finishPendingPlay])
  const chooseSwapTarget = useCallback(
    (target: number) => finishPendingPlay({ sevenSwapTarget: target }),
    [finishPendingPlay],
  )

  /** Draw a card. A forced penalty draws the whole stack; a voluntary draw of a
   *  playable card pauses to offer keep/play. */
  const drawCard = useCallback(async () => {
    const snap = stateRef.current
    if (snap.phase !== 'idle') return
    const seat = snap.currentPlayerIndex
    if (!controls(seat)) return
    if (!sequencer.acquireTurnLock()) return
    try {
      if (snap.pendingDraw > 0) {
        const res = resolveDraw(snap)
        hooksRef.current?.onLocalTurn?.(res, sequencer.claimSeq())
        await executeTurn(res, sequencer.beginRun())
        return
      }
      // Voluntary: peek what would be drawn; if it can be played, offer the choice.
      const drawn = snap.stock[snap.stock.length - 1]
      const top = snap.discard[snap.discard.length - 1]
      const canPlay = !!drawn && legalPlays([drawn], top, snap.activeColor, 0, null, snap.rules).length > 0
      if (canPlay && drawn) {
        drawnOfferRef.current = drawn
        setChoice({ kind: 'drawn', card: drawn })
        dispatch({ type: 'BEGIN_CHOOSE' })
        return
      }
      const res = resolveDraw(snap)
      hooksRef.current?.onLocalTurn?.(res, sequencer.claimSeq())
      await executeTurn(res, sequencer.beginRun())
    } finally {
      sequencer.releaseTurnLock()
    }
  }, [controls, executeTurn, sequencer])

  /** Resolve the keep/play offer after a voluntary draw turned up a card. */
  const resolveDrawnCard = useCallback(
    async (playIt: boolean, color?: UnoColor) => {
      const snap = stateRef.current
      if (snap.phase !== 'choosing') return
      const drawn = drawnOfferRef.current
      if (!drawn || !controls(snap.currentPlayerIndex)) return
      if (!sequencer.acquireTurnLock()) return
      try {
        setChoice(null)
        drawnOfferRef.current = null
        const seat = snap.currentPlayerIndex
        const chosenColor = drawn.color == null ? (color ?? mostCommonColor(snap.hands[seat])) : undefined
        const res = resolveDraw(snap, playIt ? { thenPlay: drawn, chosenColor } : {})
        hooksRef.current?.onLocalTurn?.(res, sequencer.claimSeq())
        await executeTurn(res, sequencer.beginRun())
      } finally {
        sequencer.releaseTurnLock()
      }
    },
    [controls, executeTurn, sequencer],
  )

  /** Challenge the current Wild-Draw-Four (the next player's choice). */
  const challenge = useCallback(async () => {
    const snap = stateRef.current
    if (snap.phase !== 'idle' || !snap.wild4Challenge) return
    if (!controls(snap.currentPlayerIndex)) return
    if (!sequencer.acquireTurnLock()) return
    try {
      const res = adjudicateChallenge(snap)
      hooksRef.current?.onLocalTurn?.(res, sequencer.claimSeq())
      await executeTurn(res, sequencer.beginRun())
    } finally {
      sequencer.releaseTurnLock()
    }
  }, [controls, executeTurn, sequencer])

  /** Catch a player who reached one card without declaring UNO (+2). */
  const callOut = useCallback(
    async (target: number, by: number) => {
      const snap = stateRef.current
      if (snap.phase !== 'idle') return
      if (snap.hands[target]?.length !== 1 || snap.saidUno[target]) return
      if (!controls(by)) return
      if (!sequencer.acquireTurnLock()) return
      try {
        const res = resolveCallout(target, by)
        hooksRef.current?.onLocalTurn?.(res, sequencer.claimSeq())
        await executeTurn(res, sequencer.beginRun())
      } finally {
        sequencer.releaseTurnLock()
      }
    },
    [controls, executeTurn, sequencer],
  )

  // ---- Remote application (drained by the sequencer) -----------------------

  const applyRemoteTurn = useCallback(
    (resolution: UnoTurnResolution, seq: number) => {
      sequencer.accept({ kind: 'turn', resolution }, seq)
    },
    [sequencer],
  )
  const applySkip = useCallback((seq: number) => sequencer.accept({ kind: 'skip' }, seq), [sequencer])
  const applyRemoteDecision = useCallback(
    (decision: MatchDecision, seq: number) => sequencer.accept({ kind: 'decision', decision }, seq),
    [sequencer],
  )

  /** Local continue/end call at a round end (host online, anyone in hot-seat). */
  const decide = useCallback(
    (decision: MatchDecision) => {
      const snap = stateRef.current
      if (snap.phase !== 'roundEnd') return
      if (sequencer.busy()) return
      hooksRef.current?.onLocalDecision?.(decision, sequencer.claimSeq())
      executeDecision(decision)
    },
    [executeDecision, sequencer],
  )

  const clearTransients = useCallback(() => {
    setChoice(null)
    pendingPlayRef.current = null
    drawnOfferRef.current = null
    unoFlash.clear()
    skipFlash.clear()
  }, [unoFlash, skipFlash])

  const startGame = useCallback(
    (players: PlayerSetup[], rules?: UnoRules, deckSeed?: number) => {
      const matchRules = asUnoRules(rules)
      const seed = deckSeed ?? randomSeed()
      sequencer.rebase(0)
      clearTransients()
      dispatch({ type: 'START_ROUND', players, rules: matchRules, deckSeed: seed })
      setMatchLog({ players: players.map((p) => ({ ...p })), rules: matchRules, events: [] })
      hooksRef.current?.onStart?.(players, matchRules, seed)
    },
    [sequencer, clearTransients],
  )

  const applyRemoteStart = useCallback(
    (players: PlayerSetup[], payload?: unknown) => {
      const { rules, deckSeed } = parseStartPayload(payload)
      sequencer.rebase(0)
      clearTransients()
      dispatch({ type: 'START_ROUND', players, rules, deckSeed })
      setMatchLog({ players: players.map((p) => ({ ...p })), rules, events: [] })
    },
    [sequencer, clearTransients],
  )

  const addPlayer = useCallback((player: PlayerSetup) => {
    dispatch({ type: 'ADD_PLAYER', player })
  }, [])

  const loadSnapshot = useCallback(
    (snapshot: UnoLoadSnapshotArgs) => {
      sequencer.rebase(snapshot.turnCount)
      clearTransients()
      dispatch({ type: 'LOAD_SNAPSHOT', ...snapshot })
      setMatchLog(null)
    },
    [sequencer, clearTransients],
  )

  const forfeitWin = useCallback(
    (winnerId: number) => {
      const snap = stateRef.current
      if (snap.phase === 'setup' || snap.phase === 'matchEnd') return
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
      // The `choosing` pause counts as busy: the turn is claimed but not final.
      busy: sequencer.busy() || stateRef.current.phase === 'choosing',
    }),
    [sequencer],
  )

  const reset = useCallback(() => {
    sequencer.rebase(0)
    clearTransients()
    setMatchLog(null)
    dispatch({ type: 'RESET' })
  }, [sequencer, clearTransients])

  const applyRemoteReset = reset

  // ---- Derived view for components ----------------------------------------

  const currentPlayer = state.players[state.currentPlayerIndex] ?? null
  const winner = state.winnerId != null ? (state.players[state.winnerId] ?? null) : null
  const isMyTurn = controlsPlayer === 'all' || controlsPlayer === state.currentPlayerIndex
  const top = state.discard[state.discard.length - 1] ?? null
  // Legal plays for whichever seat this client controls on its turn (UI hint).
  const legalCards = useMemo(() => {
    if (state.phase !== 'idle' || !isMyTurn) return []
    return legalForSeat(state, state.currentPlayerIndex)
  }, [state, isMyTurn, legalForSeat])
  const canPlay = state.phase === 'idle' && isMyTurn && legalCards.length > 0
  const canDraw = state.phase === 'idle' && isMyTurn
  const canChallenge = state.phase === 'idle' && isMyTurn && state.wild4Challenge != null

  return {
    ...state,
    // `lastRoll`/`finishedOrder` satisfy the structural net contract shared with
    // the dice games; UNO never rolls and ends rounds on the first emptied hand.
    lastRoll: null as number | null,
    currentPlayer,
    winner,
    top,
    choice,
    legalCards,
    matchLog,
    unoFlash: unoFlash.flash,
    skipFlash: skipFlash.flash,
    muted,
    toggleMute,
    controlsPlayer,
    isMyTurn,
    canPlay,
    canDraw,
    canChallenge,
    // Local actions
    play,
    drawCard,
    chooseColor,
    chooseSwapTarget,
    resolveDrawnCard,
    challenge,
    callOut,
    decide,
    startGame,
    reset,
    // Remote / net plumbing
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

export type UnoController = ReturnType<typeof useUno>
