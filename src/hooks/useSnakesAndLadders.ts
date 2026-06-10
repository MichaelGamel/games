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
  /** Fired after a *local* roll so it can be broadcast to the opponent. */
  onLocalTurn?: (resolution: TurnResolution) => void
  /** Fired when this client starts/restarts the game (host broadcasts it). */
  onStart?: (players: PlayerSetup[]) => void
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
    if (controlsPlayer !== 'all' && controlsPlayer !== snap.currentPlayerIndex) return

    const player = snap.players[snap.currentPlayerIndex]
    const resolution = resolveTurn(player.position, rollDie())
    hooksRef.current?.onLocalTurn?.(resolution)
    await executeTurn(resolution)
  }, [controlsPlayer, executeTurn])

  const applyRemoteTurn = useCallback(
    (resolution: TurnResolution) => {
      queueRef.current.push(resolution)
      void drainQueue()
    },
    [drainQueue],
  )

  const startGame = useCallback((players: PlayerSetup[]) => {
    runIdRef.current++
    queueRef.current = []
    setActiveMove(null)
    dispatch({ type: 'START_GAME', players })
    hooksRef.current?.onStart?.(players)
  }, [])

  const applyRemoteStart = useCallback((players: PlayerSetup[]) => {
    runIdRef.current++
    queueRef.current = []
    setActiveMove(null)
    dispatch({ type: 'START_GAME', players })
  }, [])

  // Append a host-approved late joiner. Non-destructive: it never cancels an
  // in-flight turn animation, so existing players keep playing without a hitch.
  const addPlayer = useCallback((player: PlayerSetup) => {
    dispatch({ type: 'ADD_PLAYER', player })
  }, [])

  // Initialize a freshly-approved late joiner from the host's running snapshot.
  const loadSnapshot = useCallback(
    (snapshot: {
      players: PlayerSnapshot[]
      currentPlayerIndex: number
      lastRoll: DieValue | null
      winnerId: number | null
    }) => {
      runIdRef.current++
      queueRef.current = []
      setActiveMove(null)
      dispatch({ type: 'LOAD_SNAPSHOT', ...snapshot })
    },
    [],
  )

  const reset = useCallback(() => {
    runIdRef.current++
    queueRef.current = []
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
  }
}

export type GameController = ReturnType<typeof useSnakesAndLadders>
