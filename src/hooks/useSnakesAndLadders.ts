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
 * Besides rolls, two more sequence-stamped events flow through the same queue
 * so every client applies them in the same order: `skip` (the current player
 * left the room) and `decision` (host chose continue/end after a mid-game
 * finish). Each increments `turnCount` exactly like a committed roll.
 *
 * `controlsPlayer` gates who may roll: `'all'` for local pass-and-play, or a
 * specific player id for online play (you can only roll on your own turn).
 */
import {
  useCallback,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { useReducedMotion } from 'motion/react'
import {
  gameReducer,
  initialState,
  type PlayerSetup,
  type PlayerSnapshot,
} from '../game/gameReducer'
import { resolveTurn, rollDie } from '../game/rules'
import { TIMING } from '../game/config'
import type { ActiveMove, DieValue, MatchDecision, TurnResolution } from '../game/types'
import { useSound } from './useSound'

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** A short-lived UI event (e.g. "rolled a 6"). `nonce` re-triggers animations. */
export interface GameFlash {
  playerId: number
  nonce: number
}

type QueueEntry =
  | { kind: 'turn'; resolution: TurnResolution }
  | { kind: 'skip' }
  | { kind: 'decision'; decision: MatchDecision }

export interface GameNetHooks {
  /**
   * Fired after a *local* roll so it can be broadcast to the opponent.
   * `seq` is the 1-based turn number this roll will commit as — receivers use
   * it to detect dropped or duplicated turns.
   */
  onLocalTurn?: (resolution: TurnResolution, seq: number) => void
  /** Fired after a *local* continue/end decision so it can be broadcast. */
  onLocalDecision?: (decision: MatchDecision, seq: number) => void
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
  // "Rolled a 6 — go again!" celebration, shown on every client.
  const [extraTurnFlash, setExtraTurnFlash] = useState<GameFlash | null>(null)
  // "X's turn was skipped" notice (the player left the room).
  const [skipFlash, setSkipFlash] = useState<GameFlash | null>(null)
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
  // Monotonic id for flash events so repeats re-trigger their animation.
  const flashNonceRef = useRef(0)

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

  /** Show a flash, then clear it automatically (unless a newer one replaced it). */
  const flash = useCallback(
    (set: Dispatch<SetStateAction<GameFlash | null>>, playerId: number, ms: number) => {
      const nonce = ++flashNonceRef.current
      set({ playerId, nonce })
      setTimeout(() => {
        set((prev) => (prev?.nonce === nonce ? null : prev))
      }, ms)
    },
    [],
  )

  const clearFlashes = useCallback(() => {
    setExtraTurnFlash(null)
    setSkipFlash(null)
  }, [])

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
      if (resolution.isWin) {
        sound.playWin()
      } else if (resolution.extraTurn) {
        // Lucky six! Same player goes again — celebrate on every client.
        sound.playExtraTurn()
        flash(setExtraTurnFlash, player.id, TIMING.extraTurnFlashMs)
      }
    },
    [sound, timings, flash],
  )

  /** Hand the turn to the next active player because the current one left. */
  const executeSkip = useCallback(() => {
    const snap = stateRef.current
    if (snap.phase !== 'idle') return
    sound.playSkip()
    flash(setSkipFlash, snap.currentPlayerIndex, TIMING.skipFlashMs)
    dispatch({ type: 'SKIP_TURN' })
  }, [sound, flash])

  const executeDecision = useCallback(
    (decision: MatchDecision) => {
      dispatch({ type: decision === 'continue' ? 'CONTINUE_MATCH' : 'END_MATCH' })
    },
    [],
  )

  // Sequence-stamped events (turns, skips, decisions) are queued and applied
  // one at a time (handles back-to-back rolls from a 6 even if our animation
  // lags the opponent's).
  const queueRef = useRef<QueueEntry[]>([])
  const drainingRef = useRef(false)
  const drainQueue = useCallback(async () => {
    if (drainingRef.current) return
    drainingRef.current = true
    try {
      let next: QueueEntry | undefined
      while ((next = queueRef.current.shift())) {
        if (next.kind === 'turn') await executeTurn(next.resolution)
        else if (next.kind === 'skip') executeSkip()
        else executeDecision(next.decision)
      }
    } finally {
      drainingRef.current = false
    }
  }, [executeTurn, executeSkip, executeDecision])

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

  /**
   * Shared seq bookkeeping for every remote (or remotely-replicated) event.
   * Returns true when the event is the expected next one and was queued.
   */
  const enqueueSequenced = useCallback(
    (entry: QueueEntry, seq: number): boolean => {
      const expected = lastSeqRef.current + 1
      // Already have this event (duplicate delivery): drop it.
      if (seq < expected) return false
      // An event was lost in transit. Don't apply this one (it would corrupt
      // the state) — ask the room for a full snapshot instead.
      if (seq > expected) {
        hooksRef.current?.onOutOfSync?.()
        return false
      }
      lastSeqRef.current = seq
      queueRef.current.push(entry)
      void drainQueue()
      return true
    },
    [drainQueue],
  )

  const applyRemoteTurn = useCallback(
    (resolution: TurnResolution, seq: number) => {
      enqueueSequenced({ kind: 'turn', resolution }, seq)
    },
    [enqueueSequenced],
  )

  /**
   * Skip the current (absent) player's turn as commit number `seq`. Used both
   * by the client that initiates the skip and by everyone receiving it, so all
   * clients replay the identical event.
   */
  const applySkip = useCallback(
    (seq: number) => {
      enqueueSequenced({ kind: 'skip' }, seq)
    },
    [enqueueSequenced],
  )

  const applyRemoteDecision = useCallback(
    (decision: MatchDecision, seq: number) => {
      enqueueSequenced({ kind: 'decision', decision }, seq)
    },
    [enqueueSequenced],
  )

  /** Local continue/end call (host online, anyone in hot-seat). */
  const decide = useCallback(
    (decision: MatchDecision) => {
      const snap = stateRef.current
      if (snap.phase !== 'celebrating') return
      // Only decide from a settled state (nothing queued or animating).
      if (drainingRef.current || queueRef.current.length > 0) return
      if (lastSeqRef.current !== snap.turnCount) return
      const seq = ++lastSeqRef.current
      hooksRef.current?.onLocalDecision?.(decision, seq)
      executeDecision(decision)
    },
    [executeDecision],
  )

  const startGame = useCallback((players: PlayerSetup[]) => {
    runIdRef.current++
    queueRef.current = []
    lastSeqRef.current = 0
    setActiveMove(null)
    clearFlashes()
    dispatch({ type: 'START_GAME', players })
    hooksRef.current?.onStart?.(players)
  }, [clearFlashes])

  const applyRemoteStart = useCallback((players: PlayerSetup[]) => {
    runIdRef.current++
    queueRef.current = []
    lastSeqRef.current = 0
    setActiveMove(null)
    clearFlashes()
    dispatch({ type: 'START_GAME', players })
  }, [clearFlashes])

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
      finishedOrder: number[]
      awaitingDecision: boolean
      ended: boolean
      turnCount: number
    }) => {
      runIdRef.current++
      queueRef.current = []
      lastSeqRef.current = snapshot.turnCount
      setActiveMove(null)
      clearFlashes()
      dispatch({ type: 'LOAD_SNAPSHOT', ...snapshot })
    },
    [clearFlashes],
  )

  // Last player standing: every other active player left, so `winnerId` takes
  // the remaining podium spot and the match ends now.
  const forfeitWin = useCallback(
    (winnerId: number) => {
      const snap = stateRef.current
      if (snap.phase === 'setup' || snap.phase === 'won') return
      runIdRef.current++
      queueRef.current = []
      lastSeqRef.current = snap.turnCount
      setActiveMove(null)
      clearFlashes()
      dispatch({ type: 'FORFEIT_WIN', winnerId })
      sound.playWin()
    },
    [sound, clearFlashes],
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
    clearFlashes()
    dispatch({ type: 'RESET' })
  }, [clearFlashes])

  const applyRemoteReset = reset

  const currentPlayer = state.players[state.currentPlayerIndex] ?? null
  const winner = state.winnerId != null ? (state.players[state.winnerId] ?? null) : null
  /** Players who already finished, in podium order (1st, 2nd, 3rd). */
  const standings = state.finishedOrder
    .map((id) => state.players[id])
    .filter((p) => p != null)
  const isMyTurn = controlsPlayer === 'all' || controlsPlayer === state.currentPlayerIndex
  const canRoll = state.phase === 'idle' && isMyTurn

  return {
    ...state,
    currentPlayer,
    winner,
    standings,
    activeMove,
    extraTurnFlash,
    skipFlash,
    muted,
    toggleMute,
    controlsPlayer,
    isMyTurn,
    canRoll,
    roll,
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

export type GameController = ReturnType<typeof useSnakesAndLadders>
