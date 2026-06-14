/**
 * The orchestration facade for Tic-Tac-Toe — built on the shared
 * {@link createTurnSequencer} core, exactly like `useConnectFour` /
 * `useSnakesAndLadders` / `useLudo`. This is the only place that mixes the pure
 * reducer, the pure rules, sound, and animation timing.
 *
 * `controlsPlayer` gates who may mark: `'all'` for local hot-seat, or a seat
 * index for online play.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import {
  xoReducer,
  initialXOState,
  type PlayerSetup,
  type PlayerSnapshot,
} from '../xo/xoReducer'
import { EMPTY, resolvePlace } from '../xo/rules'
import { TIMING } from '../xo/config'
import type { Cell, XOResolution, MatchDecision } from '../xo/types'
import { createTurnSequencer, type SequencerHandlers } from '../lib/turnSequencer'
import { useFlash } from './useFlash'
import { useSound } from './useSound'

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** The one square currently being marked (drawn before the turn commits). */
export interface ActivePlace {
  seat: number
  row: number
  col: number
}

export interface XONetHooks {
  onLocalTurn?: (resolution: XOResolution, seq: number) => void
  onLocalDecision?: (decision: MatchDecision, seq: number) => void
  onOutOfSync?: () => void
}

export interface UseTicTacToeOptions {
  controlsPlayer?: number | 'all'
  hooks?: XONetHooks
}

export function useTicTacToe({ controlsPlayer = 'all', hooks }: UseTicTacToeOptions = {}) {
  const [state, dispatch] = useReducer(xoReducer, initialXOState)
  const [activePlace, setActivePlace] = useState<ActivePlace | null>(null)
  // The victory walk: how many of the winning squares are currently lit, and
  // whether the celebration is still running (the winner overlay waits for it).
  const [winLit, setWinLit] = useState(0)
  const [celebratingWin, setCelebratingWin] = useState(false)
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
        ? { place: 110, settle: 70, winStep: 200, winFanfare: 500 }
        : {
            place: TIMING.placeMs,
            settle: TIMING.settleMs,
            winStep: TIMING.winStepMs,
            winFanfare: TIMING.winFanfareMs,
          },
    [reduced],
  )

  /**
   * Light the winning squares one at a time (ascending chime each), hold on the
   * fully-lit line with the fanfare, then release. The winner overlay stays
   * hidden until this resolves. Runs inside the turn's animation run, so a
   * reset/restart (which flips `alive`) cuts it short. Replayed identically on
   * every client, since it keys off the resolution's win line.
   */
  const celebrateWin = useCallback(
    async (winLine: Cell[] | null, alive: () => boolean) => {
      const cells = winLine ?? []
      setCelebratingWin(true)
      setWinLit(0)
      for (let i = 0; i < cells.length; i++) {
        if (!alive()) return
        setWinLit(i + 1)
        sound.playConnectStep(i)
        await delay(timings.winStep)
      }
      if (!alive()) return
      sound.playWin()
      await delay(timings.winFanfare)
      if (!alive()) return
      setCelebratingWin(false)
    },
    [sound, timings],
  )

  /** Animate a fully-resolved mark, then commit it. Shared by local + remote. */
  const executeTurn = useCallback(
    async (resolution: XOResolution, alive: () => boolean) => {
      if (!stateRef.current.players[resolution.seat]) return
      dispatch({ type: 'BEGIN_PLACE' })
      setActivePlace({ seat: resolution.seat, row: resolution.row, col: resolution.col })
      sound.playStep()
      await delay(timings.place)
      if (!alive()) return
      await delay(timings.settle)
      if (!alive()) return
      setActivePlace(null)
      dispatch({ type: 'COMMIT_TURN', resolution })
      if (resolution.isWin) await celebrateWin(resolution.winLine, alive)
    },
    [sound, timings, celebrateWin],
  )

  /** Hand the turn to the other player because the current one left. */
  const executeSkip = useCallback(() => {
    const snap = stateRef.current
    if (snap.phase !== 'idle') return
    sound.playSkip()
    skipFlash.trigger(snap.currentPlayerIndex, TIMING.skipFlashMs)
    dispatch({ type: 'SKIP_TURN' })
  }, [sound, skipFlash])

  // Tic-Tac-Toe has no mid-game host decisions (strictly two players), but the
  // shared online machinery expects the handler to exist.
  const executeDecision = useCallback((decision: MatchDecision) => {
    void decision
  }, [])

  const handlers: SequencerHandlers<XOResolution> = {
    executeTurn,
    executeSkip,
    executeDecision,
    committedCount: () => stateRef.current.turnCount,
    onOutOfSync: () => hooksRef.current?.onOutOfSync?.(),
  }
  const [sequencer] = useState(() => createTurnSequencer<XOResolution>())
  useEffect(() => {
    sequencer.update(handlers)
  })

  /** Mark the square at (row, col) — the local player's move. */
  const place = useCallback(
    async (row: number, col: number) => {
      const snap = stateRef.current
      if (snap.phase !== 'idle') return
      if (controlsPlayer !== 'all' && controlsPlayer !== snap.currentPlayerIndex) return
      if (snap.board[row]?.[col] !== EMPTY) return
      if (!sequencer.acquireTurnLock()) return
      try {
        const resolution = resolvePlace(snap, row, col)
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
    (resolution: XOResolution, seq: number) => {
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

  /** Never used in Tic-Tac-Toe (no celebration pause) — kept for the shape. */
  const decide = useCallback((decision: MatchDecision) => {
    void decision
  }, [])

  const clearTransients = useCallback(() => {
    setActivePlace(null)
    setCelebratingWin(false)
    setWinLit(0)
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
    // Tic-Tac-Toe has no rule variants (the second arg is part of the shared
    // online-controller shape).
    (players: PlayerSetup[], rules?: unknown) => {
      void rules
      sequencer.rebase(0)
      clearTransients()
      dispatch({ type: 'START_GAME', players })
    },
    [sequencer, clearTransients],
  )

  /** Tic-Tac-Toe rooms are capped at two seats — late joiners can't be added. */
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
  const canPlace = state.phase === 'idle' && isMyTurn

  return {
    ...state,
    // The shared online machinery expects a dice field; Tic-Tac-Toe has none.
    lastRoll: null as number | null,
    currentPlayer,
    winner,
    standings,
    activePlace,
    /** How many of the winning squares are lit during the victory walk. */
    winLit,
    /** True while the win line is still being celebrated (overlay waits). */
    celebratingWin,
    skipFlash: skipFlash.flash,
    muted,
    toggleMute,
    controlsPlayer,
    isMyTurn,
    canPlace,
    place,
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

export type XOController = ReturnType<typeof useTicTacToe>
