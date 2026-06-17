/**
 * The orchestration facade for Dominoes — the counterpart of {@link useUno}.
 * This is the ONLY place that mixes the pure reducer, the pure rules engine,
 * sound, and animation timing; components depend on the object it returns
 * ({@link DominoController}), never on the reducer/rules/timers directly.
 *
 * A committed event runs as an async sequence (`executeTurn`): show the beat
 * (bones sliding from the boneyard, then a tile settling onto the line) →
 * commit → play outcome sounds. The same sequence replays a fully-resolved
 * {@link DominoTurnResolution}, so a *local* move and a *remote* move animate
 * identically and two clients stay in sync. Everything protocol-shaped —
 * sequence numbers, the one-at-a-time queue, gap/duplicate handling, run
 * cancellation — lives in the shared {@link createTurnSequencer} core.
 *
 * The only local-only pause is the **`choosing`** beat: a tile that matches both
 * open ends needs the player to pick which. The end is baked into the broadcast
 * resolution, so remote clients never re-decide. Drawing, by contrast, is forced
 * and non-interactive (the Draw rule), so it never pauses — the whole
 * draw-until-playable (or pass) sequence is one atomic resolution.
 *
 * `controlsPlayer` gates who may act: `'all'` for local hot-seat, or a specific
 * seat for online play.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import {
  dominoReducer,
  initialDominoState,
  type PlayerSetup,
  type PlayerSnapshot,
} from '../domino/dominoReducer'
import { legalPlays, resolveDrawTurn, resolvePlay } from '../domino/rules'
import { asDominoStart, TIMING } from '../domino/config'
import type { DominoStartConfig } from '../domino/deck'
import type {
  DominoEnd,
  DominoGameState,
  DominoLine,
  DominoTile,
  DominoTurnResolution,
  MatchDecision,
} from '../domino/types'
import { createTurnSequencer, type SequencerHandlers } from '../lib/turnSequencer'
import { useFlash } from './useFlash'
import { useSound } from './useSound'

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** A random seed for a brand-new match's set (host picks; broadcast online). */
const randomSeed = () => Math.floor(Math.random() * 0x7fffffff)

/** The local `choosing` pause: a tile that fits both ends needs an end picked. */
export interface DominoChoice {
  tileId: string
  ends: DominoEnd[]
}

export function parseStartPayload(payload: unknown): DominoStartConfig {
  return asDominoStart(payload)
}

export interface DominoNetHooks {
  /** Fired after a *local* committed event so it can be broadcast. */
  onLocalTurn?: (resolution: DominoTurnResolution, seq: number) => void
  /** Fired when this client starts/restarts the match (host broadcasts it). */
  onStart?: (players: PlayerSetup[], payload: DominoStartConfig) => void
  /** Fired when a remote event arrives out of order — request a fresh snapshot. */
  onOutOfSync?: () => void
}

export interface UseDominoOptions {
  /** Which seat this client may act for. `'all'` = local hot-seat. */
  controlsPlayer?: number | 'all'
  hooks?: DominoNetHooks
}

export interface DominoLoadSnapshotArgs {
  players: PlayerSnapshot[]
  currentPlayerIndex: number
  boneyard: DominoTile[]
  line: DominoLine
  deckSeed: number
  ended: boolean
  turnCount: number
}

export function useDomino({ controlsPlayer = 'all', hooks }: UseDominoOptions = {}) {
  const [state, dispatch] = useReducer(dominoReducer, initialDominoState)
  // The open local `choosing` prompt (a tile that fits both open ends).
  const [choice, setChoice] = useState<DominoChoice | null>(null)
  // "Player passed / turn skipped" flash, shown on every client.
  const passFlash = useFlash()
  const { sound, muted, toggleMute } = useSound()
  const reduced = useReducedMotion()

  // Latest-value refs, synced after each commit. Read from async continuations.
  const stateRef = useRef(state)
  const hooksRef = useRef(hooks)
  // The tile awaiting a `choosing` end decision.
  const pendingTileRef = useRef<string | null>(null)
  useEffect(() => {
    stateRef.current = state
    hooksRef.current = hooks
  })

  const timings = useMemo(
    () =>
      reduced
        ? { place: 150, draw: 110, handoff: 120 }
        : { place: TIMING.placeMs, draw: TIMING.drawMs, handoff: TIMING.turnHandoffMs },
    [reduced],
  )

  const controls = useCallback(
    (seat: number) => controlsPlayer === 'all' || controlsPlayer === seat,
    [controlsPlayer],
  )

  /**
   * Animate a fully-resolved event, then commit it. Shared by local + remote, so
   * both animate identically. The sequencer's run token (`alive`) invalidates an
   * in-flight sequence on reset/restart/snapshot.
   */
  const executeTurn = useCallback(
    async (resolution: DominoTurnResolution, alive: () => boolean) => {
      const seat = resolution.seat
      if (!stateRef.current.players[seat]) return

      // Forced draws (when stuck) animate as bones sliding off the boneyard.
      if (resolution.drewBefore > 0) {
        dispatch({ type: 'BEGIN_DRAW' })
        const beats = Math.min(resolution.drewBefore, 6)
        for (let i = 0; i < beats; i++) {
          sound.playDraw()
          await delay(timings.draw)
          if (!alive()) return
        }
      }

      if (resolution.kind === 'play') {
        dispatch({ type: 'BEGIN_PLACE' })
        sound.playTilePlace()
        await delay(timings.place)
        if (!alive()) return
        dispatch({ type: 'COMMIT_TURN', resolution })
        if (resolution.isWin) sound.playWin()
        return
      }

      // A forced pass / knock.
      sound.playKnock()
      passFlash.trigger(seat, TIMING.skipFlashMs)
      await delay(timings.handoff)
      if (!alive()) return
      dispatch({ type: 'COMMIT_TURN', resolution })
      if (resolution.blocks) sound.playWin()
    },
    [sound, timings, passFlash],
  )

  /** Hand the turn to the next player because the current one left the room. */
  const executeSkip = useCallback(() => {
    const snap = stateRef.current
    if (snap.phase !== 'idle') return
    sound.playSkip()
    passFlash.trigger(snap.currentPlayerIndex, TIMING.skipFlashMs)
    dispatch({ type: 'SKIP_TURN' })
  }, [sound, passFlash])

  // Dominoes (single round) has no mid-match decisions; the handler is a no-op.
  const executeDecision = useCallback(() => {}, [])

  // The shared sequencing core orders, dedupes, and drains every
  // sequence-stamped event (turns, skips) exactly once.
  const handlers: SequencerHandlers<DominoTurnResolution> = {
    executeTurn,
    executeSkip,
    executeDecision,
    committedCount: () => stateRef.current.turnCount,
    onOutOfSync: () => hooksRef.current?.onOutOfSync?.(),
  }
  const [sequencer] = useState(() => createTurnSequencer<DominoTurnResolution>())
  useEffect(() => {
    sequencer.update(handlers)
  })

  // ---- Local actions -------------------------------------------------------

  const legalForSeat = useCallback(
    (snap: DominoGameState, seat: number) => legalPlays(snap.hands[seat] ?? [], snap.line),
    [],
  )

  /** Lay a tile. When it fits both open ends, pauses for an end choice. */
  const play = useCallback(
    async (tileId: string, endArg?: DominoEnd) => {
      const snap = stateRef.current
      if (snap.phase !== 'idle') return
      const seat = snap.currentPlayerIndex
      if (!controls(seat)) return
      const entry = legalForSeat(snap, seat).find((p) => p.tile.id === tileId)
      if (!entry) return // ignore taps on illegal tiles
      if (!sequencer.acquireTurnLock()) return
      try {
        let end: DominoEnd
        if (endArg && entry.ends.includes(endArg)) {
          end = endArg
        } else if (entry.ends.length === 1) {
          end = entry.ends[0]
        } else {
          // Fits both ends — pause for the player to choose.
          pendingTileRef.current = tileId
          setChoice({ tileId, ends: entry.ends })
          dispatch({ type: 'BEGIN_CHOOSE' })
          return // lock released in finally; the `choosing` phase guards re-entry
        }
        const res = resolvePlay(snap, tileId, end, 0)
        if (!res) return
        hooksRef.current?.onLocalTurn?.(res, sequencer.claimSeq())
        await executeTurn(res, sequencer.beginRun())
      } finally {
        sequencer.releaseTurnLock()
      }
    },
    [controls, executeTurn, legalForSeat, sequencer],
  )

  /** Finish a pending play once the player picks an end. */
  const chooseEnd = useCallback(
    async (end: DominoEnd) => {
      const snap = stateRef.current
      if (snap.phase !== 'choosing') return
      const tileId = pendingTileRef.current
      if (!tileId || !controls(snap.currentPlayerIndex)) return
      if (!sequencer.acquireTurnLock()) return
      try {
        setChoice(null)
        pendingTileRef.current = null
        const res = resolvePlay(snap, tileId, end, 0)
        if (!res) return
        hooksRef.current?.onLocalTurn?.(res, sequencer.claimSeq())
        await executeTurn(res, sequencer.beginRun())
      } finally {
        sequencer.releaseTurnLock()
      }
    },
    [controls, executeTurn, sequencer],
  )

  /** Draw-until-playable, or pass when the boneyard is dry. Only valid when the
   *  current seat has no legal play in hand. */
  const drawOrPass = useCallback(async () => {
    const snap = stateRef.current
    if (snap.phase !== 'idle') return
    const seat = snap.currentPlayerIndex
    if (!controls(seat)) return
    if (legalForSeat(snap, seat).length > 0) return // must play, can't draw
    if (!sequencer.acquireTurnLock()) return
    try {
      const res = resolveDrawTurn(snap)
      hooksRef.current?.onLocalTurn?.(res, sequencer.claimSeq())
      await executeTurn(res, sequencer.beginRun())
    } finally {
      sequencer.releaseTurnLock()
    }
  }, [controls, executeTurn, legalForSeat, sequencer])

  // ---- Remote application (drained by the sequencer) -----------------------

  const applyRemoteTurn = useCallback(
    (resolution: DominoTurnResolution, seq: number) => {
      sequencer.accept({ kind: 'turn', resolution }, seq)
    },
    [sequencer],
  )
  const applySkip = useCallback((seq: number) => sequencer.accept({ kind: 'skip' }, seq), [sequencer])
  const applyRemoteDecision = useCallback(
    (decision: MatchDecision, seq: number) => sequencer.accept({ kind: 'decision', decision }, seq),
    [sequencer],
  )

  const clearTransients = useCallback(() => {
    setChoice(null)
    pendingTileRef.current = null
    passFlash.clear()
  }, [passFlash])

  const startGame = useCallback(
    (players: PlayerSetup[], deckSeed?: number) => {
      const seed = deckSeed ?? randomSeed()
      sequencer.rebase(0)
      clearTransients()
      dispatch({ type: 'START_GAME', players, deckSeed: seed })
      hooksRef.current?.onStart?.(players, { deckSeed: seed })
    },
    [sequencer, clearTransients],
  )

  const applyRemoteStart = useCallback(
    (players: PlayerSetup[], payload?: unknown) => {
      const { deckSeed } = parseStartPayload(payload)
      sequencer.rebase(0)
      clearTransients()
      dispatch({ type: 'START_GAME', players, deckSeed })
    },
    [sequencer, clearTransients],
  )

  const addPlayer = useCallback((player: PlayerSetup) => {
    dispatch({ type: 'ADD_PLAYER', player })
  }, [])

  const loadSnapshot = useCallback(
    (snapshot: DominoLoadSnapshotArgs) => {
      sequencer.rebase(snapshot.turnCount)
      clearTransients()
      dispatch({ type: 'LOAD_SNAPSHOT', ...snapshot })
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
      // The `choosing` pause counts as busy: the turn is claimed but not final.
      busy: sequencer.busy() || stateRef.current.phase === 'choosing',
    }),
    [sequencer],
  )

  const reset = useCallback(() => {
    sequencer.rebase(0)
    clearTransients()
    dispatch({ type: 'RESET' })
  }, [sequencer, clearTransients])

  const applyRemoteReset = reset

  // ---- Derived view for components ----------------------------------------

  const currentPlayer = state.players[state.currentPlayerIndex] ?? null
  const winner = state.winnerId != null ? (state.players[state.winnerId] ?? null) : null
  const isMyTurn = controlsPlayer === 'all' || controlsPlayer === state.currentPlayerIndex

  // Legal plays for whichever seat this client controls on its turn (UI hint).
  const legalForControlled = useMemo(() => {
    if (state.phase !== 'idle' || !isMyTurn) return []
    return legalForSeat(state, state.currentPlayerIndex)
  }, [state, isMyTurn, legalForSeat])
  const legalEndsById = useMemo(() => {
    const m = new Map<string, DominoEnd[]>()
    for (const p of legalForControlled) m.set(p.tile.id, p.ends)
    return m
  }, [legalForControlled])

  const hasLegalPlay = legalForControlled.length > 0
  const canPlay = state.phase === 'idle' && isMyTurn && hasLegalPlay
  const mustDrawOrPass = state.phase === 'idle' && isMyTurn && !hasLegalPlay
  const canDraw = mustDrawOrPass && state.boneyard.length > 0
  const mustPass = mustDrawOrPass && state.boneyard.length === 0

  return {
    ...state,
    // `lastRoll`/`finishedOrder` satisfy the structural net contract shared with
    // the dice games; Dominoes never rolls and ends on the first emptied hand
    // (or a blocked board).
    lastRoll: null as number | null,
    currentPlayer,
    winner,
    choice,
    legalEndsById,
    muted,
    toggleMute,
    controlsPlayer,
    isMyTurn,
    canPlay,
    canDraw,
    mustPass,
    skipFlash: passFlash.flash,
    // Local actions
    play,
    chooseEnd,
    drawOrPass,
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

export type DominoController = ReturnType<typeof useDomino>
