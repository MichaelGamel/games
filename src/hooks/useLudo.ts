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
 * sync.
 *
 * Everything protocol-shaped — sequence numbers, the one-at-a-time event queue,
 * duplicate/gap handling, run cancellation, the settled-state probe — lives in
 * the shared {@link createTurnSequencer} core (also used by Snakes & Ladders).
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
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import {
  initialLudoState,
  ludoReducer,
  type PlayerSetup,
  type PlayerSnapshot,
} from '../ludo/ludoReducer'
import { legalMoves, resolveLudoMove, rollLudoDice } from '../ludo/rules'
import { asLudoRules, TIMING } from '../ludo/config'
import type {
  LudoGameState,
  LudoRules,
  LudoTurnResolution,
  MatchDecision,
  TokenMoveOption,
} from '../ludo/types'
import { createTurnSequencer, type SequencerHandlers } from '../lib/turnSequencer'
import type { MatchLog } from '../lib/matchLog'
import { useFlash, type GameFlash } from './useFlash'
import { useSound } from './useSound'

/** Re-exported under Ludo's historical name. */
export type LudoFlash = GameFlash

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Transient mid-animation override for the one token currently in motion. */
export interface LudoActiveMove {
  seat: number
  tokenId: number
  /** Progress value to render the moving token at (instead of its committed one). */
  progress: number
  kind: 'step' | 'release' | 'home'
}

export interface LudoNetHooks {
  /** Fired after a *local* turn (post-selection) so it can be broadcast. */
  onLocalTurn?: (resolution: LudoTurnResolution, seq: number) => void
  /** Fired after a *local* continue/end decision so it can be broadcast. */
  onLocalDecision?: (decision: MatchDecision, seq: number) => void
  /** Fired when this client starts/restarts the game (host broadcasts it). */
  onStart?: (players: PlayerSetup[], rules: LudoRules) => void
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
  rules: LudoRules
  currentPlayerIndex: number
  lastRoll: number | null
  finishedOrder: number[]
  awaitingDecision: boolean
  ended: boolean
  turnCount: number
  consecutiveSixes: number
}

/** How many committed states the local undo stack keeps. */
const UNDO_DEPTH = 40

export function useLudo({ controlsPlayer = 'all', hooks }: UseLudoOptions = {}) {
  const [state, dispatch] = useReducer(ludoReducer, initialLudoState)
  const [activeMove, setActiveMove] = useState<LudoActiveMove | null>(null)
  // The legal moves awaiting a tap while in `selecting` (local only). Empty
  // otherwise. Held as state so the board re-renders the highlight.
  const [selectableMoves, setSelectableMoves] = useState<TokenMoveOption[]>([])
  // Local pass-and-play only: pre-roll snapshots, newest last (the undo stack).
  const [history, setHistory] = useState<LudoGameState[]>([])
  // Every committed event since START_GAME — feeds the recap and the replay.
  // Null when this client joined mid-match (it never saw the early turns).
  const [matchLog, setMatchLog] = useState<MatchLog<LudoTurnResolution, LudoRules> | null>(null)
  // "Rolled a 6 / captured — go again!" celebration, shown on every client.
  const extraTurnFlash = useFlash()
  // "X's turn was skipped" notice (the player left the room).
  const skipFlash = useFlash()
  const { sound, muted, toggleMute } = useSound()
  const reduced = useReducedMotion()

  // Latest-value refs, synced after each commit. Every consumer reads them
  // from event handlers or async continuations — never during render.
  const stateRef = useRef(state)
  const hooksRef = useRef(hooks)
  useEffect(() => {
    stateRef.current = state
    hooksRef.current = hooks
  })

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

  /**
   * Animate a fully-resolved turn, then commit it. Shared by local + remote.
   * `skipRoll` is set when the dice were already tumbled (a local turn that went
   * through the selection pause), so we don't roll twice.
   */
  const executeTurn = useCallback(
    async (
      resolution: LudoTurnResolution,
      alive: () => boolean,
      opts?: { skipRoll?: boolean },
    ) => {
      const { seat, tokenId } = resolution
      if (!stateRef.current.players[seat]) return

      // 1) Tumble the dice (unless the caller already did).
      if (!opts?.skipRoll) {
        dispatch({ type: 'BEGIN_ROLL', dice: resolution.dice })
        sound.playRoll()
        await delay(timings.dice)
        if (!alive()) return
      }

      // No legal move (or a third six): a short beat on the settled die, commit.
      if (resolution.noMove) {
        await delay(timings.noMove)
        if (!alive()) return
        dispatch({ type: 'COMMIT_TURN', resolution })
        setMatchLog((log) =>
          log && { ...log, events: [...log.events, { kind: 'turn', seat, resolution }] },
        )
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
      setMatchLog((log) =>
        log && { ...log, events: [...log.events, { kind: 'turn', seat, resolution }] },
      )
      if (resolution.isWin) {
        sound.playWin()
      } else if (resolution.extraTurn) {
        sound.playExtraTurn()
        extraTurnFlash.trigger(seat, TIMING.extraTurnFlashMs)
      }
    },
    [sound, timings, extraTurnFlash],
  )

  /** Hand the turn to the next active player because the current one left. */
  const executeSkip = useCallback(() => {
    const snap = stateRef.current
    if (snap.phase !== 'idle') return
    sound.playSkip()
    skipFlash.trigger(snap.currentPlayerIndex, TIMING.skipFlashMs)
    dispatch({ type: 'SKIP_TURN' })
    setMatchLog((log) =>
      log && { ...log, events: [...log.events, { kind: 'skip', seat: snap.currentPlayerIndex }] },
    )
  }, [sound, skipFlash])

  const executeDecision = useCallback((decision: MatchDecision) => {
    dispatch({ type: decision === 'continue' ? 'CONTINUE_MATCH' : 'END_MATCH' })
    setMatchLog((log) => log && { ...log, events: [...log.events, { kind: 'decision', decision }] })
  }, [])

  // The shared sequencing core: orders, dedupes, and drains every
  // sequence-stamped event (turns, skips, decisions) exactly once.
  const handlers: SequencerHandlers<LudoTurnResolution> = {
    executeTurn,
    executeSkip,
    executeDecision,
    committedCount: () => stateRef.current.turnCount,
    onOutOfSync: () => hooksRef.current?.onOutOfSync?.(),
  }
  const [sequencer] = useState(() => createTurnSequencer<LudoTurnResolution>())
  useEffect(() => {
    sequencer.update(handlers)
  })

  const roll = useCallback(async () => {
    const snap = stateRef.current
    if (snap.phase !== 'idle') return
    if (controlsPlayer !== 'all' && controlsPlayer !== snap.currentPlayerIndex) return
    const seat = snap.currentPlayerIndex
    if (!snap.players[seat]) return
    if (!sequencer.acquireTurnLock()) return
    try {
      // Local hot-seat: remember the pre-roll state so this turn can be undone.
      if (controlsPlayer === 'all') {
        setHistory((prev) => [...prev.slice(-(UNDO_DEPTH - 1)), snap])
      }
      // Tumble the dice first, then decide: auto-resolve, pause for a choice, or
      // a no-move turn.
      const alive = sequencer.beginRun()
      const dice = rollLudoDice(snap.rules.diceCount)
      dispatch({ type: 'BEGIN_ROLL', dice })
      sound.playRoll()
      await delay(timings.dice)
      if (!alive()) return

      const moves = legalMoves(snap, seat, dice)
      if (moves.length > 1) {
        // More than one option — wait for the player (or bot) to choose.
        dispatch({ type: 'BEGIN_SELECT' })
        setSelectableMoves(moves)
        return
      }
      const tokenId = moves[0]?.tokenId ?? -1
      const resolution = resolveLudoMove(snap, tokenId, dice)
      hooksRef.current?.onLocalTurn?.(resolution, sequencer.claimSeq())
      await executeTurn(resolution, sequencer.beginRun(), { skipRoll: true })
    } finally {
      sequencer.releaseTurnLock()
    }
  }, [controlsPlayer, executeTurn, sequencer, sound, timings])

  /** Commit the chosen token after a selection pause (local only). */
  const selectToken = useCallback(
    async (tokenId: number) => {
      const snap = stateRef.current
      if (snap.phase !== 'selecting') return
      if (controlsPlayer !== 'all' && controlsPlayer !== snap.currentPlayerIndex) return
      const dice = snap.lastDice
      if (dice.length === 0) return
      // Re-validate the tap against the rules (ignore taps on illegal tokens).
      const moves = legalMoves(snap, snap.currentPlayerIndex, dice)
      if (!moves.some((m) => m.tokenId === tokenId)) return
      if (!sequencer.acquireTurnLock()) return
      try {
        setSelectableMoves([])
        const resolution = resolveLudoMove(snap, tokenId, dice)
        hooksRef.current?.onLocalTurn?.(resolution, sequencer.claimSeq())
        await executeTurn(resolution, sequencer.beginRun(), { skipRoll: true })
      } finally {
        sequencer.releaseTurnLock()
      }
    },
    [controlsPlayer, executeTurn, sequencer],
  )

  const applyRemoteTurn = useCallback(
    (resolution: LudoTurnResolution, seq: number) => {
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

  /** Local continue/end call (host online, anyone in hot-seat). */
  const decide = useCallback(
    (decision: MatchDecision) => {
      const snap = stateRef.current
      if (snap.phase !== 'celebrating') return
      if (sequencer.busy()) return
      hooksRef.current?.onLocalDecision?.(decision, sequencer.claimSeq())
      executeDecision(decision)
    },
    [executeDecision, sequencer],
  )

  const clearTransients = useCallback(() => {
    setActiveMove(null)
    setSelectableMoves([])
    extraTurnFlash.clear()
    skipFlash.clear()
  }, [extraTurnFlash, skipFlash])

  const startGame = useCallback(
    (players: PlayerSetup[], rules?: LudoRules) => {
      const matchRules = asLudoRules(rules)
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
      const matchRules = asLudoRules(rules)
      sequencer.rebase(0)
      clearTransients()
      setHistory([])
      dispatch({ type: 'START_GAME', players, rules: matchRules })
      setMatchLog({ players: players.map((p) => ({ ...p })), rules: matchRules, events: [] })
    },
    [sequencer, clearTransients],
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
      sequencer.rebase(snapshot.turnCount)
      clearTransients()
      dispatch({ type: 'LOAD_SNAPSHOT', ...snapshot })
      // Joined (or repaired) mid-match: the early turns are unknowable.
      setMatchLog(null)
    },
    [sequencer, clearTransients],
  )

  // Last player standing: every other active player left, so `winnerId` takes
  // the remaining podium spot and the match ends now.
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

  /** Live sync probe for the networking layer. */
  const syncStatus = useCallback(
    () => ({
      seq: sequencer.seq,
      // The selection pause counts as busy: the turn is claimed but not final.
      busy: sequencer.busy() || stateRef.current.phase === 'selecting',
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

  const applyRemoteReset = reset

  /**
   * Local pass-and-play undo: rewind to the last pre-roll state where a HUMAN
   * was about to act (skipping bot turns, which would instantly replay).
   * Online play never records history, so this is inert there.
   */
  const undo = useCallback(() => {
    if (controlsPlayer !== 'all') return
    const snap = stateRef.current
    if (snap.phase !== 'idle' && snap.phase !== 'selecting') return
    setHistory((prev) => {
      let i = prev.length - 1
      while (i >= 0 && prev[i].players[prev[i].currentPlayerIndex]?.isBot) i--
      if (i < 0) return prev
      const target = prev[i]
      sequencer.rebase(target.turnCount)
      clearTransients()
      dispatch({ type: 'RESTORE', state: target })
      // Rewind the recap/replay log to match (events are 1:1 with commits).
      setMatchLog((log) => log && { ...log, events: log.events.slice(0, target.turnCount) })
      return prev.slice(0, i)
    })
  }, [controlsPlayer, sequencer, clearTransients])

  const canUndo =
    controlsPlayer === 'all' &&
    (state.phase === 'idle' || state.phase === 'selecting') &&
    history.some((h) => !h.players[h.currentPlayerIndex]?.isBot)

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
    matchLog,
    extraTurnFlash: extraTurnFlash.flash,
    skipFlash: skipFlash.flash,
    selectableMoves,
    selectableTokens,
    muted,
    toggleMute,
    controlsPlayer,
    isMyTurn,
    canRoll,
    canUndo,
    roll,
    selectToken,
    undo,
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
