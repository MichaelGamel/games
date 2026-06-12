/**
 * The orchestration facade for Connect Four — the third game built on the
 * shared {@link createTurnSequencer} core. Mirrors `useSnakesAndLadders` /
 * `useLudo`: this is the only place mixing the pure reducer, the pure rules,
 * sound, and animation timing.
 *
 * `controlsPlayer` gates who may drop: `'all'` for local hot-seat, or a seat
 * index for online play.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import {
  fourReducer,
  initialFourState,
  type PlayerSetup,
  type PlayerSnapshot,
} from '../four/fourReducer'
import { dropRow, resolveDrop } from '../four/rules'
import { TIMING } from '../four/config'
import type { FourResolution, MatchDecision } from '../four/types'
import { createTurnSequencer, type SequencerHandlers } from '../lib/turnSequencer'
import { useFlash } from './useFlash'
import { useSound } from './useSound'

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** The one disc currently falling (drawn instead of its committed cell). */
export interface ActiveDrop {
  seat: number
  column: number
  row: number
}

export interface FourNetHooks {
  onLocalTurn?: (resolution: FourResolution, seq: number) => void
  onLocalDecision?: (decision: MatchDecision, seq: number) => void
  onOutOfSync?: () => void
}

export interface UseConnectFourOptions {
  controlsPlayer?: number | 'all'
  hooks?: FourNetHooks
}

export function useConnectFour({ controlsPlayer = 'all', hooks }: UseConnectFourOptions = {}) {
  const [state, dispatch] = useReducer(fourReducer, initialFourState)
  const [activeDrop, setActiveDrop] = useState<ActiveDrop | null>(null)
  const skipFlash = useFlash()
  const { sound, muted, toggleMute } = useSound()
  const reduced = useReducedMotion()

  const stateRef = useRef(state)
  const hooksRef = useRef(hooks)
  useEffect(() => {
    stateRef.current = state
    hooksRef.current = hooks
  })

  const timings = useMemo(
    () =>
      reduced
        ? { drop: 120, settle: 80 }
        : { drop: TIMING.dropMs, settle: TIMING.settleMs },
    [reduced],
  )

  /** Animate a fully-resolved drop, then commit it. Shared by local + remote. */
  const executeTurn = useCallback(
    async (resolution: FourResolution, alive: () => boolean) => {
      if (!stateRef.current.players[resolution.seat]) return
      dispatch({ type: 'BEGIN_DROP' })
      setActiveDrop({ seat: resolution.seat, column: resolution.column, row: resolution.row })
      sound.playRelease()
      await delay(timings.drop)
      if (!alive()) return
      sound.playStep()
      await delay(timings.settle)
      if (!alive()) return
      setActiveDrop(null)
      dispatch({ type: 'COMMIT_TURN', resolution })
      if (resolution.isWin) sound.playWin()
    },
    [sound, timings],
  )

  /** Hand the turn to the other player because the current one left. */
  const executeSkip = useCallback(() => {
    const snap = stateRef.current
    if (snap.phase !== 'idle') return
    sound.playSkip()
    skipFlash.trigger(snap.currentPlayerIndex, TIMING.skipFlashMs)
    dispatch({ type: 'SKIP_TURN' })
  }, [sound, skipFlash])

  // Connect Four has no mid-game host decisions (strictly two players), but the
  // shared online machinery expects the handler to exist.
  const executeDecision = useCallback((decision: MatchDecision) => {
    void decision
  }, [])

  const handlers: SequencerHandlers<FourResolution> = {
    executeTurn,
    executeSkip,
    executeDecision,
    committedCount: () => stateRef.current.turnCount,
    onOutOfSync: () => hooksRef.current?.onOutOfSync?.(),
  }
  const [sequencer] = useState(() => createTurnSequencer<FourResolution>())
  useEffect(() => {
    sequencer.update(handlers)
  })

  /** Drop a disc in `column` (the local player's move). */
  const drop = useCallback(
    async (column: number) => {
      const snap = stateRef.current
      if (snap.phase !== 'idle') return
      if (controlsPlayer !== 'all' && controlsPlayer !== snap.currentPlayerIndex) return
      if (dropRow(snap.board, column) == null) return
      if (!sequencer.acquireTurnLock()) return
      try {
        const resolution = resolveDrop(snap, column)
        if (!resolution) return
        hooksRef.current?.onLocalTurn?.(resolution, sequencer.claimSeq())
        await executeTurn(resolution, sequencer.beginRun())
      } finally {
        sequencer.releaseTurnLock()
      }
    },
    [controlsPlayer, executeTurn, sequencer],
  )

  const applyRemoteTurn = useCallback(
    (resolution: FourResolution, seq: number) => {
      sequencer.accept({ kind: 'turn', resolution }, seq)
    },
    [sequencer],
  )

  const applySkip = useCallback(
    (seq: number) => {
      sequencer.accept({ kind: 'skip' }, seq)
    },
    [sequencer],
  )

  const applyRemoteDecision = useCallback(
    (decision: MatchDecision, seq: number) => {
      sequencer.accept({ kind: 'decision', decision }, seq)
    },
    [sequencer],
  )

  /** Never used in Connect Four (no celebration pause) — kept for the shape. */
  const decide = useCallback((decision: MatchDecision) => {
    void decision
  }, [])

  const clearTransients = useCallback(() => {
    setActiveDrop(null)
    skipFlash.clear()
  }, [skipFlash])

  const startGame = useCallback(
    (players: PlayerSetup[]) => {
      sequencer.rebase(0)
      clearTransients()
      dispatch({ type: 'START_GAME', players })
    },
    [sequencer, clearTransients],
  )

  const applyRemoteStart = useCallback(
    // Connect Four has no rule variants (the second arg is part of the shared
    // online-controller shape).
    (players: PlayerSetup[], rules?: unknown) => {
      void rules
      sequencer.rebase(0)
      clearTransients()
      dispatch({ type: 'START_GAME', players })
    },
    [sequencer, clearTransients],
  )

  /** Connect Four rooms are capped at two seats — late joiners can't be added. */
  const addPlayer = useCallback((player: PlayerSetup) => {
    void player
  }, [])

  const loadSnapshot = useCallback(
    (snapshot: {
      players: PlayerSnapshot[]
      currentPlayerIndex: number
      finishedOrder: number[]
      ended: boolean
      turnCount: number
    }) => {
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
    () => ({ seq: sequencer.seq, busy: sequencer.busy() }),
    [sequencer],
  )

  const reset = useCallback(() => {
    sequencer.rebase(0)
    clearTransients()
    dispatch({ type: 'RESET' })
  }, [sequencer, clearTransients])

  const applyRemoteReset = reset

  const currentPlayer = state.players[state.currentPlayerIndex] ?? null
  const winner = state.winnerId != null ? (state.players[state.winnerId] ?? null) : null
  const standings = state.finishedOrder.map((id) => state.players[id]).filter((p) => p != null)
  const isMyTurn = controlsPlayer === 'all' || controlsPlayer === state.currentPlayerIndex
  const canDrop = state.phase === 'idle' && isMyTurn

  return {
    ...state,
    // The shared online machinery expects a dice field; Connect Four has none.
    lastRoll: null as number | null,
    currentPlayer,
    winner,
    standings,
    activeDrop,
    skipFlash: skipFlash.flash,
    muted,
    toggleMute,
    controlsPlayer,
    isMyTurn,
    canDrop,
    drop,
    decide,
    startGame,
    reset,
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

export type FourController = ReturnType<typeof useConnectFour>
