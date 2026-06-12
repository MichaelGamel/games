/**
 * The orchestration facade for Ludo — the Ludo counterpart of
 * {@link useSnakesAndLadders}. This is the ONLY place that mixes the pure
 * reducer, the pure rules engine, sound, and animation timing; components depend
 * on the clean object it returns, never on the reducer/rules/timers directly
 * (Dependency Inversion).
 *
 * A turn runs as an async sequence (`executeTurn`): tumble dice → (release a
 * token / step it cell by cell) → resolve captures → home-arrival sparkle →
 * commit. The sequence replays a fully-resolved {@link LudoTurnResolution}, so a
 * *local* roll and a *remote* roll animate identically and two clients stay in
 * sync. A run-id guard cancels an in-flight sequence on reset/restart.
 *
 * The one piece with no Snakes analogue is the **local selection pause**: when a
 * local roll has more than one legal move, we tumble the dice and then wait in
 * the `selecting` phase for the player to tap a token. Exactly one legal move
 * auto-selects; zero is a no-move turn. Remote turns carry an explicit `tokenId`
 * and never enter `selecting`.
 *
 * `controlsPlayer` gates who may act: `'all'` for local pass-and-play, or a
 * specific seat for online play.
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
  initialLudoState,
  ludoReducer,
  type PlayerSetup,
  type PlayerSnapshot,
} from '../ludo/ludoReducer'
import { legalMoves, resolveLudoMove, rollDie } from '../ludo/rules'
import { TIMING } from '../ludo/config'
import type {
  DieValue,
  LudoTurnResolution,
  MatchDecision,
  TokenMoveOption,
} from '../ludo/types'
import { useSound } from './useSound'

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** A short-lived UI event (e.g. "rolled a 6"). `nonce` re-triggers animations. */
export interface LudoFlash {
  playerId: number
  nonce: number
}

/** Transient mid-animation override for the one token currently in motion. */
export interface LudoActiveMove {
  seat: number
  tokenId: number
  /** Progress value to render the moving token at (instead of its committed one). */
  progress: number
  kind: 'step' | 'release' | 'home'
}

type QueueEntry =
  | { kind: 'turn'; resolution: LudoTurnResolution }
  | { kind: 'skip' }
  | { kind: 'decision'; decision: MatchDecision }

export interface LudoNetHooks {
  /** Fired after a *local* turn (post-selection) so it can be broadcast. */
  onLocalTurn?: (resolution: LudoTurnResolution, seq: number) => void
  /** Fired after a *local* continue/end decision so it can be broadcast. */
  onLocalDecision?: (decision: MatchDecision, seq: number) => void
  /** Fired when this client starts/restarts the game (host broadcasts it). */
  onStart?: (players: PlayerSetup[]) => void
  /** Fired when a remote turn arrives out of order — we missed one or more turns
   *  and need a fresh state snapshot from another client. */
  onOutOfSync?: () => void
}

export interface UseLudoOptions {
  /** Which seat this client may act for. `'all'` = local hot-seat. */
  controlsPlayer?: number | 'all'
  hooks?: LudoNetHooks
}

interface LoadSnapshotArgs {
  players: PlayerSnapshot[]
  currentPlayerIndex: number
  lastRoll: DieValue | null
  finishedOrder: number[]
  awaitingDecision: boolean
  ended: boolean
  turnCount: number
  consecutiveSixes: number
}

export function useLudo({ controlsPlayer = 'all', hooks }: UseLudoOptions = {}) {
  const [state, dispatch] = useReducer(ludoReducer, initialLudoState)
  const [activeMove, setActiveMove] = useState<LudoActiveMove | null>(null)
  // The legal moves awaiting a tap while in `selecting` (local only). Empty
  // otherwise. Held as state so the board re-renders the highlight.
  const [selectableMoves, setSelectableMoves] = useState<TokenMoveOption[]>([])
  // "Rolled a 6 / captured — go again!" celebration, shown on every client.
  const [extraTurnFlash, setExtraTurnFlash] = useState<LudoFlash | null>(null)
  // "X's turn was skipped" notice (the player left the room).
  const [skipFlash, setSkipFlash] = useState<LudoFlash | null>(null)
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
  // Sequence number of the latest turn accepted (committed, queued, or animating).
  const lastSeqRef = useRef(0)
  // Synchronous re-entrancy guard for `roll`.
  const rollingRef = useRef(false)
  // Monotonic id for flash events so repeats re-trigger their animation.
  const flashNonceRef = useRef(0)

  const timings = useMemo(
    () =>
      reduced
        ? { dice: 250, step: 55, release: 110, capture: 170, home: 220, handoff: 120, noMove: 240 }
        : {
            dice: TIMING.diceRollMs,
            step: TIMING.stepMs,
            release: TIMING.releaseMs,
            capture: TIMING.captureMs,
            home: TIMING.homeArrivalMs,
            handoff: TIMING.turnHandoffMs,
            noMove: TIMING.noMoveHandoffMs,
          },
    [reduced],
  )

  /** Show a flash, then clear it automatically (unless a newer one replaced it). */
  const flash = useCallback(
    (set: Dispatch<SetStateAction<LudoFlash | null>>, playerId: number, ms: number) => {
      const nonce = ++flashNonceRef.current
      set({ playerId, nonce })
      setTimeout(() => set((prev) => (prev?.nonce === nonce ? null : prev)), ms)
    },
    [],
  )

  const clearTransients = useCallback(() => {
    setActiveMove(null)
    setSelectableMoves([])
    setExtraTurnFlash(null)
    setSkipFlash(null)
  }, [])

  /**
   * Animate a fully-resolved turn, then commit it. Shared by local + remote.
   * `skipRoll` is set when the dice were already tumbled (a local turn that went
   * through the selection pause), so we don't roll twice.
   */
  const executeTurn = useCallback(
    async (resolution: LudoTurnResolution, opts?: { skipRoll?: boolean }) => {
      const myRun = ++runIdRef.current
      const alive = () => runIdRef.current === myRun
      const { seat, tokenId } = resolution
      if (!stateRef.current.players[seat]) return

      // 1) Tumble the dice (unless the caller already did).
      if (!opts?.skipRoll) {
        dispatch({ type: 'BEGIN_ROLL', roll: resolution.roll })
        sound.playRoll()
        await delay(timings.dice)
        if (!alive()) return
      }

      // No legal move (or a third six): a short beat on the settled die, commit.
      if (resolution.noMove) {
        await delay(timings.noMove)
        if (!alive()) return
        dispatch({ type: 'COMMIT_TURN', resolution })
        return
      }

      // 2) Move the chosen token.
      dispatch({ type: 'BEGIN_MOVE' })
      if (resolution.releasedFromBase) {
        setActiveMove({ seat, tokenId, progress: resolution.to, kind: 'release' })
        sound.playRelease()
        await delay(timings.release)
        if (!alive()) return
      } else {
        for (const progress of resolution.stepPath) {
          const arrivingHome = progress === resolution.to && resolution.reachedHome
          setActiveMove({ seat, tokenId, progress, kind: arrivingHome ? 'home' : 'step' })
          sound.playStep()
          await delay(timings.step)
          if (!alive()) return
        }
      }

      // 3) Captures: the landing reveals the kill; commit then sends them home.
      if (resolution.captures.length > 0) {
        sound.playCapture()
        await delay(timings.capture)
        if (!alive()) return
      }

      // 4) Home-arrival sparkle.
      if (resolution.reachedHome) {
        sound.playHomeArrival()
        await delay(timings.home)
        if (!alive()) return
      }

      // 5) Settle, then commit (batched so the token never flashes back).
      await delay(timings.handoff)
      if (!alive()) return
      setActiveMove(null)
      dispatch({ type: 'COMMIT_TURN', resolution })
      if (resolution.isWin) {
        sound.playWin()
      } else if (resolution.extraTurn) {
        sound.playExtraTurn()
        flash(setExtraTurnFlash, seat, TIMING.extraTurnFlashMs)
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

  const executeDecision = useCallback((decision: MatchDecision) => {
    dispatch({ type: decision === 'continue' ? 'CONTINUE_MATCH' : 'END_MATCH' })
  }, [])

  // Sequence-stamped events queued and applied one at a time (handles back-to-
  // back rolls from a six even if our animation lags the opponent's).
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
    if (drainingRef.current || queueRef.current.length > 0) return
    if (controlsPlayer !== 'all' && controlsPlayer !== snap.currentPlayerIndex) return

    const seat = snap.currentPlayerIndex
    if (!snap.players[seat]) return
    rollingRef.current = true
    try {
      // Tumble the dice first, then decide: auto-resolve, pause for a choice, or
      // a no-move turn.
      const myRun = ++runIdRef.current
      const die = rollDie()
      dispatch({ type: 'BEGIN_ROLL', roll: die })
      sound.playRoll()
      await delay(timings.dice)
      if (runIdRef.current !== myRun) return

      const moves = legalMoves(snap, seat, die)
      if (moves.length > 1) {
        // More than one option — wait for the player (or bot) to choose.
        dispatch({ type: 'BEGIN_SELECT' })
        setSelectableMoves(moves)
        return
      }
      const tokenId = moves[0]?.tokenId ?? -1
      const resolution = resolveLudoMove(snap, tokenId, die)
      const seq = ++lastSeqRef.current
      hooksRef.current?.onLocalTurn?.(resolution, seq)
      await executeTurn(resolution, { skipRoll: true })
    } finally {
      rollingRef.current = false
    }
  }, [controlsPlayer, executeTurn, sound, timings])

  /** Commit the chosen token after a selection pause (local only). */
  const selectToken = useCallback(
    async (tokenId: number) => {
      const snap = stateRef.current
      if (snap.phase !== 'selecting') return
      if (controlsPlayer !== 'all' && controlsPlayer !== snap.currentPlayerIndex) return
      const die = snap.lastRoll
      if (die == null) return
      // Re-validate the tap against the rules (ignore taps on illegal tokens).
      const moves = legalMoves(snap, snap.currentPlayerIndex, die)
      if (!moves.some((m) => m.tokenId === tokenId)) return

      setSelectableMoves([])
      const resolution = resolveLudoMove(snap, tokenId, die)
      const seq = ++lastSeqRef.current
      hooksRef.current?.onLocalTurn?.(resolution, seq)
      await executeTurn(resolution, { skipRoll: true })
    },
    [controlsPlayer, executeTurn],
  )

  /** Shared seq bookkeeping for every remote (or remotely-replicated) event. */
  const enqueueSequenced = useCallback(
    (entry: QueueEntry, seq: number): boolean => {
      const expected = lastSeqRef.current + 1
      if (seq < expected) return false // duplicate delivery
      if (seq > expected) {
        hooksRef.current?.onOutOfSync?.() // a turn was lost — ask for a snapshot
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
    (resolution: LudoTurnResolution, seq: number) => {
      enqueueSequenced({ kind: 'turn', resolution }, seq)
    },
    [enqueueSequenced],
  )

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
      if (drainingRef.current || queueRef.current.length > 0) return
      if (lastSeqRef.current !== snap.turnCount) return
      const seq = ++lastSeqRef.current
      hooksRef.current?.onLocalDecision?.(decision, seq)
      executeDecision(decision)
    },
    [executeDecision],
  )

  const startGame = useCallback(
    (players: PlayerSetup[]) => {
      runIdRef.current++
      queueRef.current = []
      lastSeqRef.current = 0
      clearTransients()
      dispatch({ type: 'START_GAME', players })
      hooksRef.current?.onStart?.(players)
    },
    [clearTransients],
  )

  const applyRemoteStart = useCallback(
    (players: PlayerSetup[]) => {
      runIdRef.current++
      queueRef.current = []
      lastSeqRef.current = 0
      clearTransients()
      dispatch({ type: 'START_GAME', players })
    },
    [clearTransients],
  )

  // Append a host-approved late joiner. Non-destructive: never cancels an
  // in-flight animation, so existing players keep playing without a hitch.
  const addPlayer = useCallback((player: PlayerSetup) => {
    dispatch({ type: 'ADD_PLAYER', player })
  }, [])

  // Replace the whole game with an authoritative running snapshot (late joiner
  // or a client recovering from a missed message).
  const loadSnapshot = useCallback(
    (snapshot: LoadSnapshotArgs) => {
      runIdRef.current++
      queueRef.current = []
      lastSeqRef.current = snapshot.turnCount
      clearTransients()
      dispatch({ type: 'LOAD_SNAPSHOT', ...snapshot })
    },
    [clearTransients],
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
      clearTransients()
      dispatch({ type: 'FORFEIT_WIN', winnerId })
      sound.playWin()
    },
    [sound, clearTransients],
  )

  /** Live sync probe for the networking layer. */
  const syncStatus = useCallback(
    () => ({
      seq: lastSeqRef.current,
      busy:
        drainingRef.current ||
        queueRef.current.length > 0 ||
        rollingRef.current ||
        stateRef.current.phase === 'selecting' ||
        lastSeqRef.current !== stateRef.current.turnCount,
    }),
    [],
  )

  const reset = useCallback(() => {
    runIdRef.current++
    queueRef.current = []
    lastSeqRef.current = 0
    clearTransients()
    dispatch({ type: 'RESET' })
  }, [clearTransients])

  const applyRemoteReset = reset

  const currentPlayer = state.players[state.currentPlayerIndex] ?? null
  const winner = state.winnerId != null ? (state.players[state.winnerId] ?? null) : null
  /** Players who already finished, in podium order (1st, 2nd, 3rd). */
  const standings = state.finishedOrder.map((id) => state.players[id]).filter((p) => p != null)
  const isMyTurn = controlsPlayer === 'all' || controlsPlayer === state.currentPlayerIndex
  const canRoll = state.phase === 'idle' && isMyTurn
  const selectableTokens = useMemo(() => selectableMoves.map((m) => m.tokenId), [selectableMoves])

  return {
    ...state,
    currentPlayer,
    winner,
    standings,
    activeMove,
    extraTurnFlash,
    skipFlash,
    selectableMoves,
    selectableTokens,
    muted,
    toggleMute,
    controlsPlayer,
    isMyTurn,
    canRoll,
    roll,
    selectToken,
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

export type LudoController = ReturnType<typeof useLudo>
