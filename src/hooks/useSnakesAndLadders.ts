/**
 * The orchestration facade for the whole game.
 *
 * This is the ONLY place that mixes the pure reducer, the pure rules engine,
 * sound, and animation timing. Components depend on the clean object it returns
 * — never on the reducer, timers, or rules directly (Dependency Inversion).
 *
 * A turn runs as an async sequence: tumble dice → walk the path cell by cell →
 * take any snake/ladder → commit. The sequence is factored into `executeTurn`
 * so it can be driven both by a *local* roll and by a *remote* roll arriving
 * over the network — both replay the same resolved {@link TurnResolution}, so
 * two clients stay perfectly in sync. A run-id guard cancels an in-flight
 * sequence on reset/restart.
 *
 * `controlsPlayer` gates who may roll: `'all'` for local pass-and-play, or a
 * specific player id for online play (you can only roll on your own turn).
 */
import { useCallback, useMemo, useReducer, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import {
  gameReducer,
  initialState,
  type PlayerSetup,
  type PlayerSnapshot,
} from '../game/gameReducer'
import { resolveTurn, rollDie } from '../game/rules'
import { TIMING } from '../game/config'
import type { ActiveMove, DieValue, TurnResolution } from '../game/types'
import { useSound } from './useSound'

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export interface GameNetHooks {
  /**
   * Fired after a *local* roll so it can be broadcast to the opponent.
   * `seq` is the 1-based turn number this roll will commit as — receivers use
   * it to detect dropped or duplicated turns.
   */
  onLocalTurn?: (resolution: TurnResolution, seq: number) => void
  /** Fired when this client starts/restarts the game (host broadcasts it). */
  onStart?: (players: PlayerSetup[]) => void
  /** Fired when a remote turn arrives out of order — we missed one or more
   *  turns and need a fresh state snapshot from another client. */
  onOutOfSync?: () => void
}

export interface UseGameOptions {
  /** Which player this client may roll for. `'all'` = local hot-seat. */
  controlsPlayer?: number | 'all'
  hooks?: GameNetHooks
}

export function useSnakesAndLadders({ controlsPlayer = 'all', hooks }: UseGameOptions = {}) {
  const [state, dispatch] = useReducer(gameReducer, initialState)
  const [activeMove, setActiveMove] = useState<ActiveMove | null>(null)
  const { sound, muted, toggleMute } = useSound()
  const reduced = useReducedMotion()

  // Cancellation token: bumping this invalidates any in-flight sequence.
  const runIdRef = useRef(0)
  // Always read the freshest state inside async sequences.
  const stateRef = useRef(state)
  stateRef.current = state
  // Keep net hooks fresh without rebuilding callbacks.
  const hooksRef = useRef(hooks)
  hooksRef.current = hooks
  // Sequence number of the latest turn accepted (committed, queued, or
  // animating). Compared against state.turnCount (committed only) to tell
  // whether this client is fully settled.
  const lastSeqRef = useRef(0)
  // Synchronous re-entrancy guard for `roll`: the phase only leaves 'idle' on
  // the next render, so a double-tap could otherwise fire two turns.
  const rollingRef = useRef(false)

  const timings = useMemo(
    () =>
      reduced
        ? { dice: 250, step: 45, jump: 180, handoff: 120 }
        : {
            dice: TIMING.diceRollMs,
            step: TIMING.stepMs,
            jump: TIMING.jumpMs,
            handoff: TIMING.turnHandoffMs,
          },
    [reduced],
  )

  /** Animate a fully-resolved turn, then commit it. Shared by local + remote. */
  const executeTurn = useCallback(
    async (resolution: TurnResolution) => {
      const myRun = ++runIdRef.current
      const alive = () => runIdRef.current === myRun
      const player = stateRef.current.players[stateRef.current.currentPlayerIndex]
      if (!player) return

      // 1) Tumble the dice.
      dispatch({ type: 'BEGIN_ROLL', roll: resolution.roll })
      sound.playRoll()
      await delay(timings.dice)
      if (!alive()) return

      // 2) Walk the path one cell at a time.
      dispatch({ type: 'BEGIN_MOVE' })
      for (const cell of resolution.walkPath) {
        setActiveMove({ playerId: player.id, cell, kind: 'walk' })
        sound.playStep()
        await delay(timings.step)
        if (!alive()) return
      }

      // 3) Take the snake / ladder, if any.
      if (resolution.jump) {
        setActiveMove({ playerId: player.id, cell: resolution.jump.to, kind: resolution.jump.kind })
        if (resolution.jump.kind === 'ladder') sound.playLadder()
        else sound.playSnake()
        await delay(timings.jump)
        if (!alive()) return
      }

      // 4) Settle, then commit (batched so the token never flashes back).
      await delay(timings.handoff)
      if (!alive()) return
      setActiveMove(null)
      dispatch({ type: 'COMMIT_TURN', resolution })
      if (resolution.isWin) sound.playWin()
    },
    [sound, timings],
  )

  // Remote turns are queued and applied one at a time (handles back-to-back
  // rolls from a 6 even if our animation lags the opponent's).
  const queueRef = useRef<TurnResolution[]>([])
  const drainingRef = useRef(false)
  const drainQueue = useCallback(async () => {
    if (drainingRef.current) return
    drainingRef.current = true
    try {
      let next: TurnResolution | undefined
      while ((next = queueRef.current.shift())) {
        await executeTurn(next)
      }
    } finally {
      drainingRef.current = false
    }
  }, [executeTurn])

  const roll = useCallback(async () => {
    const snap = stateRef.current
    if (snap.phase !== 'idle') return
    if (rollingRef.current) return
    // Never roll over remote turns that are still animating or queued.
    if (drainingRef.current || queueRef.current.length > 0) return
    if (controlsPlayer !== 'all' && controlsPlayer !== snap.currentPlayerIndex) return

    const player = snap.players[snap.currentPlayerIndex]
    if (!player) return
    rollingRef.current = true
    try {
      const resolution = resolveTurn(player.position, rollDie())
      const seq = ++lastSeqRef.current
      hooksRef.current?.onLocalTurn?.(resolution, seq)
      await executeTurn(resolution)
    } finally {
      rollingRef.current = false
    }
  }, [controlsPlayer, executeTurn])

  const applyRemoteTurn = useCallback(
    (resolution: TurnResolution, seq: number) => {
      const expected = lastSeqRef.current + 1
      // Already have this turn (duplicate delivery): drop it.
      if (seq < expected) return
      // A turn was lost in transit. Don't apply this one (it would corrupt the
      // state) — ask the room for a full snapshot instead.
      if (seq > expected) {
        hooksRef.current?.onOutOfSync?.()
        return
      }
      lastSeqRef.current = seq
      queueRef.current.push(resolution)
      void drainQueue()
    },
    [drainQueue],
  )

  const startGame = useCallback((players: PlayerSetup[]) => {
    runIdRef.current++
    queueRef.current = []
    lastSeqRef.current = 0
    setActiveMove(null)
    dispatch({ type: 'START_GAME', players })
    hooksRef.current?.onStart?.(players)
  }, [])

  const applyRemoteStart = useCallback((players: PlayerSetup[]) => {
    runIdRef.current++
    queueRef.current = []
    lastSeqRef.current = 0
    setActiveMove(null)
    dispatch({ type: 'START_GAME', players })
  }, [])

  // Append a host-approved late joiner. Non-destructive: it never cancels an
  // in-flight turn animation, so existing players keep playing without a hitch.
  const addPlayer = useCallback((player: PlayerSetup) => {
    dispatch({ type: 'ADD_PLAYER', player })
  }, [])

  // Replace the whole game with an authoritative running snapshot. Used by a
  // freshly-approved late joiner — and by any client recovering from a missed
  // message (resync).
  const loadSnapshot = useCallback(
    (snapshot: {
      players: PlayerSnapshot[]
      currentPlayerIndex: number
      lastRoll: DieValue | null
      winnerId: number | null
      turnCount: number
    }) => {
      runIdRef.current++
      queueRef.current = []
      lastSeqRef.current = snapshot.turnCount
      setActiveMove(null)
      dispatch({ type: 'LOAD_SNAPSHOT', ...snapshot })
    },
    [],
  )

  // Last player standing: everyone else left the room, so `winnerId` wins now.
  const forfeitWin = useCallback(
    (winnerId: number) => {
      const snap = stateRef.current
      if (snap.phase === 'setup' || snap.phase === 'won') return
      runIdRef.current++
      queueRef.current = []
      lastSeqRef.current = snap.turnCount
      setActiveMove(null)
      dispatch({ type: 'FORFEIT_WIN', winnerId })
      sound.playWin()
    },
    [sound],
  )

  /**
   * Live sync probe for the networking layer. `seq` counts every turn this
   * client has accepted (including ones still animating); `busy` is true while
   * anything is in flight, i.e. the committed state is not yet final.
   */
  const syncStatus = useCallback(
    () => ({
      seq: lastSeqRef.current,
      busy:
        drainingRef.current ||
        queueRef.current.length > 0 ||
        rollingRef.current ||
        lastSeqRef.current !== stateRef.current.turnCount,
    }),
    [],
  )

  const reset = useCallback(() => {
    runIdRef.current++
    queueRef.current = []
    lastSeqRef.current = 0
    setActiveMove(null)
    dispatch({ type: 'RESET' })
  }, [])

  const applyRemoteReset = reset

  const currentPlayer = state.players[state.currentPlayerIndex] ?? null
  const winner = state.winnerId != null ? (state.players[state.winnerId] ?? null) : null
  const isMyTurn = controlsPlayer === 'all' || controlsPlayer === state.currentPlayerIndex
  const canRoll = state.phase === 'idle' && isMyTurn

  return {
    ...state,
    currentPlayer,
    winner,
    activeMove,
    muted,
    toggleMute,
    controlsPlayer,
    isMyTurn,
    canRoll,
    roll,
    startGame,
    reset,
    applyRemoteTurn,
    applyRemoteStart,
    applyRemoteReset,
    addPlayer,
    loadSnapshot,
    forfeitWin,
    syncStatus,
  }
}

export type GameController = ReturnType<typeof useSnakesAndLadders>
