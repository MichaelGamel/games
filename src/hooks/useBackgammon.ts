/**
 * The orchestration facade for Backgammon — built on the shared
 * {@link createTurnSequencer} core, exactly like `useLudo` / `useConnectFour`.
 * This is the ONLY place that mixes the pure reducer, the pure rules, sound, and
 * animation timing; components depend on the object it returns.
 *
 * A turn is multi-step and player-driven: roll two dice → build an ordered
 * sequence of checker hops → end the turn. The dice are the only random part
 * (rolled once via an injected RNG and carried in the resolution); the ordered
 * `moves` replay identically on every client.
 *
 * Two interaction paths share one over-the-wire contract:
 *   - **Local human**: after the roll we pause in `selecting`; each `playHop`
 *     updates a working board *instantly* (the player watches their own moves),
 *     and `endTurn` commits without re-animating.
 *   - **Remote / bot**: {@link executeTurn} replays the resolution's `moves` one
 *     checker at a time from the committed board (the Ludo step-replay pattern).
 *
 * `controlsPlayer` gates who may act: `'all'` for local pass-and-play, or a seat.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import {
  backgammonReducer,
  initialBackgammonState,
  type PlayerSetup,
  type PlayerSnapshot,
} from '../backgammon/backgammonReducer'
import { applyHop, cloneBoard, pipCount } from '../backgammon/board'
import {
  expandDice,
  legalSequences,
  resolveBackgammonTurn,
  rollBackgammonDice,
  selectableHops,
  type LegalHop,
} from '../backgammon/rules'
import { asBackgammonRules, TIMING } from '../backgammon/config'
import type {
  BackgammonBoard,
  BackgammonGameState,
  BackgammonRules,
  BackgammonTurnResolution,
  DieValue,
  SubMove,
} from '../backgammon/types'
import { createTurnSequencer, type SequencerHandlers } from '../lib/turnSequencer'
import type { MatchDecision } from '../game/types'
import type { MatchLog } from '../lib/matchLog'
import { useFlash } from './useFlash'
import { useSound } from './useSound'

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** The one checker currently sliding (drawn in motion instead of at rest). */
export interface ActiveChecker {
  seat: number
  /** Source point (0..23), or {@link BAR}. */
  from: number
  /** Destination point (0..23), or {@link OFF}. */
  to: number
}

/** The transient in-progress build during the `selecting` pause. */
interface BuildState {
  seat: number
  board: BackgammonBoard
  pending: SubMove[]
  remaining: DieValue[]
}

export interface BackgammonNetHooks {
  onLocalTurn?: (resolution: BackgammonTurnResolution, seq: number) => void
  onStart?: (players: PlayerSetup[], rules: BackgammonRules) => void
  onOutOfSync?: () => void
}

export interface UseBackgammonOptions {
  controlsPlayer?: number | 'all'
  hooks?: BackgammonNetHooks
}

interface LoadSnapshotArgs {
  players: PlayerSnapshot[]
  rules: BackgammonRules
  board: BackgammonBoard
  currentPlayerIndex: number
  lastDice: DieValue[]
  finishedOrder: number[]
  ended: boolean
  winReason: BackgammonGameState['winReason']
  turnCount: number
}

/** How many committed states the local undo stack keeps. */
const UNDO_DEPTH = 30

export function useBackgammon({ controlsPlayer = 'all', hooks }: UseBackgammonOptions = {}) {
  const [state, dispatch] = useReducer(backgammonReducer, initialBackgammonState)
  const [activeChecker, setActiveChecker] = useState<ActiveChecker | null>(null)
  // The board shown while a turn is in progress (built interactively, or stepped
  // through during a remote/bot animation). Null when idle/won → render the
  // committed board.
  const [displayBoard, setDisplayBoard] = useState<BackgammonBoard | null>(null)
  const [pendingMoves, setPendingMoves] = useState<SubMove[]>([])
  const [remainingDice, setRemainingDice] = useState<DieValue[]>([])
  const [selectable, setSelectable] = useState<LegalHop[]>([])
  // Local pass-and-play only: pre-roll snapshots (the undo stack).
  const [history, setHistory] = useState<BackgammonGameState[]>([])
  // Every committed event since START_GAME — feeds the recap and replay. Null
  // when this client joined mid-match (it never saw the early turns).
  const [matchLog, setMatchLog] = useState<MatchLog<BackgammonTurnResolution, BackgammonRules> | null>(
    null,
  )
  const skipFlash = useFlash()
  const { sound, muted, toggleMute } = useSound()
  const reduced = useReducedMotion()

  const stateRef = useRef(state)
  const hooksRef = useRef(hooks)
  const buildRef = useRef<BuildState | null>(null)
  useEffect(() => {
    stateRef.current = state
    hooksRef.current = hooks
  })

  const timings = useMemo(
    () =>
      reduced
        ? { dice: 240, step: 90, hit: 150, bearOff: 130, handoff: 120, noMove: 280 }
        : {
            dice: TIMING.diceRollMs,
            step: TIMING.checkerStepMs,
            hit: TIMING.hitMs,
            bearOff: TIMING.bearOffMs,
            handoff: TIMING.turnHandoffMs,
            noMove: TIMING.noMoveHandoffMs,
          },
    [reduced],
  )

  /** Push the in-progress build to render state (or clear it). */
  const syncBuild = useCallback((next: BuildState | null) => {
    buildRef.current = next
    if (next) {
      setDisplayBoard(next.board)
      setPendingMoves(next.pending)
      setRemainingDice(next.remaining)
      setSelectable(selectableHops(next.board, next.seat, next.remaining))
    } else {
      setDisplayBoard(null)
      setPendingMoves([])
      setRemainingDice([])
      setSelectable([])
    }
  }, [])

  /** Commit a fully-resolved turn into the reducer + record it in the log. */
  const finishTurn = useCallback((resolution: BackgammonTurnResolution) => {
    dispatch({ type: 'COMMIT_TURN', resolution })
    setMatchLog((log) =>
      log && { ...log, events: [...log.events, { kind: 'turn', seat: resolution.seat, resolution }] },
    )
    setActiveChecker(null)
    syncBuild(null)
    if (resolution.isWin) sound.playWin()
  }, [sound, syncBuild])

  /**
   * Animate a fully-resolved turn from the committed board, then commit it.
   * Used for remote turns, bot turns, and no-move turns. `skipRoll` is set when
   * the dice were already tumbled.
   */
  const executeTurn = useCallback(
    async (resolution: BackgammonTurnResolution, alive: () => boolean, opts?: { skipRoll?: boolean }) => {
      const { seat } = resolution
      if (!stateRef.current.players[seat]) return

      if (!opts?.skipRoll) {
        dispatch({ type: 'BEGIN_ROLL', dice: resolution.dice })
        sound.playRoll()
        await delay(timings.dice)
        if (!alive()) return
      }

      if (resolution.noLegalMoves) {
        await delay(timings.noMove)
        if (!alive()) return
        finishTurn(resolution)
        return
      }

      dispatch({ type: 'BEGIN_MOVE' })
      let board = cloneBoard(stateRef.current.board)
      setDisplayBoard(board)
      for (const move of resolution.moves) {
        setActiveChecker({ seat, from: move.from, to: move.to })
        sound.playStep()
        await delay(timings.step)
        if (!alive()) return
        board = applyHop(board, seat, move)
        setDisplayBoard(board)
        setActiveChecker(null)
        if (move.hit) {
          sound.playCapture()
          await delay(timings.hit)
          if (!alive()) return
        }
        if (move.to === 24) {
          sound.playHomeArrival()
          await delay(timings.bearOff)
          if (!alive()) return
        }
      }
      await delay(timings.handoff)
      if (!alive()) return
      finishTurn(resolution)
    },
    [sound, timings, finishTurn],
  )

  /** Hand the turn to the other player because the current one left. */
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

  // Backgammon has no mid-game host decisions (strictly two players), but the
  // shared online machinery expects the handler to exist.
  const executeDecision = useCallback((decision: MatchDecision) => {
    void decision
  }, [])

  const handlers: SequencerHandlers<BackgammonTurnResolution> = {
    executeTurn,
    executeSkip,
    executeDecision,
    committedCount: () => stateRef.current.turnCount,
    onOutOfSync: () => hooksRef.current?.onOutOfSync?.(),
  }
  const [sequencer] = useState(() => createTurnSequencer<BackgammonTurnResolution>())
  useEffect(() => {
    sequencer.update(handlers)
  })

  /** Roll the dice for the local player and either pause to choose, or pass. */
  const roll = useCallback(async () => {
    const snap = stateRef.current
    if (snap.phase !== 'idle') return
    if (controlsPlayer !== 'all' && controlsPlayer !== snap.currentPlayerIndex) return
    const seat = snap.currentPlayerIndex
    if (!snap.players[seat]) return
    if (!sequencer.acquireTurnLock()) return
    try {
      if (controlsPlayer === 'all') {
        setHistory((prev) => [...prev.slice(-(UNDO_DEPTH - 1)), snap])
      }
      const alive = sequencer.beginRun()
      const dice = rollBackgammonDice()
      dispatch({ type: 'BEGIN_ROLL', dice })
      sound.playRoll()
      await delay(timings.dice)
      if (!alive()) return

      if (!legalSequences(snap.board, seat, dice).some((s) => s.length > 0)) {
        // Dice rolled, nothing playable: pass the turn.
        const resolution = resolveBackgammonTurn(snap, seat, dice, [])
        hooksRef.current?.onLocalTurn?.(resolution, sequencer.claimSeq())
        await delay(timings.noMove)
        if (!alive()) return
        finishTurn(resolution)
        return
      }
      // Pause for the player (or bot) to build the move sequence.
      dispatch({ type: 'BEGIN_SELECT' })
      syncBuild({ seat, board: cloneBoard(snap.board), pending: [], remaining: expandDice(dice) })
    } finally {
      sequencer.releaseTurnLock()
    }
  }, [controlsPlayer, sequencer, sound, timings, finishTurn, syncBuild])

  /** Play one checker hop during the selection pause (local human). */
  const playHop = useCallback(
    (from: number, to: number) => {
      const b = buildRef.current
      if (!b || stateRef.current.phase !== 'selecting') return
      if (controlsPlayer !== 'all' && controlsPlayer !== b.seat) return
      const hop = selectableHops(b.board, b.seat, b.remaining).find((h) => h.from === from && h.to === to)
      if (!hop) return
      const move: SubMove = { from, to, die: hop.die, hit: hop.hit }
      const board = applyHop(b.board, b.seat, move)
      const idx = b.remaining.indexOf(hop.die)
      const remaining = [...b.remaining.slice(0, idx), ...b.remaining.slice(idx + 1)]
      syncBuild({ seat: b.seat, board, pending: [...b.pending, move], remaining })
      sound.playStep()
    },
    [controlsPlayer, sound, syncBuild],
  )

  /** Undo the last hop of the in-progress turn (pre-commit, never broadcast). */
  const undoHop = useCallback(() => {
    const b = buildRef.current
    if (!b || b.pending.length === 0 || stateRef.current.phase !== 'selecting') return
    const pending = b.pending.slice(0, -1)
    let board = stateRef.current.board
    for (const m of pending) board = applyHop(board, b.seat, m)
    const remaining = expandDice(stateRef.current.lastDice)
    for (const m of pending) {
      const i = remaining.indexOf(m.die)
      if (i >= 0) remaining.splice(i, 1)
    }
    syncBuild({ seat: b.seat, board, pending, remaining })
  }, [syncBuild])

  /** Confirm the built turn (local human). The board already shows it. */
  const endTurn = useCallback(() => {
    const b = buildRef.current
    const snap = stateRef.current
    if (!b || snap.phase !== 'selecting') return
    if (controlsPlayer !== 'all' && controlsPlayer !== b.seat) return
    if (selectableHops(b.board, b.seat, b.remaining).length > 0) return // a die is still playable
    if (b.pending.length === 0) return
    if (!sequencer.acquireTurnLock()) return
    try {
      const resolution = resolveBackgammonTurn(snap, b.seat, snap.lastDice, b.pending)
      hooksRef.current?.onLocalTurn?.(resolution, sequencer.claimSeq())
      sequencer.beginRun() // own the run so busy() tracks the pending commit
      finishTurn(resolution)
    } finally {
      sequencer.releaseTurnLock()
    }
  }, [controlsPlayer, sequencer, finishTurn])

  /** Play a pre-chosen sequence with animation (the computer player). */
  const botPlay = useCallback(
    async (moves: SubMove[]) => {
      const snap = stateRef.current
      if (snap.phase !== 'selecting') return
      const seat = snap.currentPlayerIndex
      if (!sequencer.acquireTurnLock()) return
      try {
        const resolution = resolveBackgammonTurn(snap, seat, snap.lastDice, moves)
        hooksRef.current?.onLocalTurn?.(resolution, sequencer.claimSeq())
        await executeTurn(resolution, sequencer.beginRun(), { skipRoll: true })
      } finally {
        sequencer.releaseTurnLock()
      }
    },
    [sequencer, executeTurn],
  )

  const applyRemoteTurn = useCallback(
    (resolution: BackgammonTurnResolution, seq: number) => {
      sequencer.accept({ kind: 'turn', resolution }, seq)
    },
    [sequencer],
  )

  const applySkip = useCallback((seq: number) => sequencer.accept({ kind: 'skip' }, seq), [sequencer])

  const applyRemoteDecision = useCallback(
    (decision: MatchDecision, seq: number) => {
      sequencer.accept({ kind: 'decision', decision }, seq)
    },
    [sequencer],
  )

  /** Never used in Backgammon (no celebration pause) — kept for the shape. */
  const decide = useCallback((decision: MatchDecision) => {
    void decision
  }, [])

  const clearTransients = useCallback(() => {
    setActiveChecker(null)
    syncBuild(null)
    skipFlash.clear()
  }, [skipFlash, syncBuild])

  const startGame = useCallback(
    (players: PlayerSetup[], rules?: BackgammonRules) => {
      const matchRules = asBackgammonRules(rules)
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
      const matchRules = asBackgammonRules(rules)
      sequencer.rebase(0)
      clearTransients()
      setHistory([])
      dispatch({ type: 'START_GAME', players, rules: matchRules })
      setMatchLog({ players: players.map((p) => ({ ...p })), rules: matchRules, events: [] })
    },
    [sequencer, clearTransients],
  )

  /** Backgammon rooms are capped at two seats — late joiners can't be added. */
  const addPlayer = useCallback((player: PlayerSetup) => {
    void player
  }, [])

  const loadSnapshot = useCallback(
    (snapshot: LoadSnapshotArgs) => {
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
      // Any non-settled phase counts as busy: a turn is claimed but not final.
      busy:
        sequencer.busy() ||
        (stateRef.current.phase !== 'idle' &&
          stateRef.current.phase !== 'won' &&
          stateRef.current.phase !== 'setup'),
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

  /** Local pass-and-play undo: rewind to the last human pre-roll state. */
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
      dispatch({ type: 'LOAD_SNAPSHOT', players: target.players, rules: target.rules, board: target.board, currentPlayerIndex: target.currentPlayerIndex, lastDice: [], finishedOrder: target.finishedOrder, ended: false, winReason: null, turnCount: target.turnCount })
      setMatchLog((log) => log && { ...log, events: log.events.slice(0, target.turnCount) })
      return prev.slice(0, i)
    })
  }, [controlsPlayer, sequencer, clearTransients])

  const canUndo =
    controlsPlayer === 'all' &&
    (state.phase === 'idle' || state.phase === 'selecting') &&
    history.some((h) => !h.players[h.currentPlayerIndex]?.isBot)

  const boardView = displayBoard ?? state.board
  const currentPlayer = state.players[state.currentPlayerIndex] ?? null
  const winner = state.winnerId != null ? (state.players[state.winnerId] ?? null) : null
  const standings = state.finishedOrder.map((id) => state.players[id]).filter((p) => p != null)
  const isMyTurn = controlsPlayer === 'all' || controlsPlayer === state.currentPlayerIndex
  const canRoll = state.phase === 'idle' && isMyTurn
  const canConfirm = state.phase === 'selecting' && isMyTurn && selectable.length === 0 && pendingMoves.length > 0
  const canUndoHop = state.phase === 'selecting' && isMyTurn && pendingMoves.length > 0
  const pipCounts: [number, number] = [pipCount(boardView, 0), pipCount(boardView, 1)]

  return {
    ...state,
    boardView,
    currentPlayer,
    winner,
    standings,
    activeChecker,
    pendingMoves,
    remainingDice,
    selectable,
    matchLog,
    skipFlash: skipFlash.flash,
    muted,
    toggleMute,
    controlsPlayer,
    isMyTurn,
    canRoll,
    canConfirm,
    canUndoHop,
    canUndo,
    pipCounts,
    roll,
    playHop,
    undoHop,
    endTurn,
    botPlay,
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

export type BackgammonController = ReturnType<typeof useBackgammon>
