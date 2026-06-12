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
 * two clients stay perfectly in sync.
 *
 * Everything protocol-shaped — sequence numbers, the one-at-a-time event
 * queue, duplicate/gap handling, run cancellation, the settled-state probe —
 * lives in the shared {@link createTurnSequencer} core (also used by Ludo),
 * so this hook only contains what is specific to Snakes & Ladders: the rules
 * calls, the animation beats, and the sounds.
 *
 * `controlsPlayer` gates who may roll: `'all'` for local pass-and-play, or a
 * specific player id for online play (you can only roll on your own turn).
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import {
  gameReducer,
  initialState,
  type PlayerSetup,
  type PlayerSnapshot,
} from '../game/gameReducer'
import { resolveTurn, rollDice } from '../game/rules'
import { asSnakesRules } from '../game/boardGen'
import { TIMING } from '../game/config'
import type {
  ActiveMove,
  MatchDecision,
  SnakesRules,
  SpecialKind,
  TurnResolution,
} from '../game/types'
import { createTurnSequencer, type SequencerHandlers } from '../lib/turnSequencer'
import type { MatchLog } from '../lib/matchLog'
import { useFlash, type GameFlash } from './useFlash'
import { useSound } from './useSound'

export type { GameFlash }

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** What a special-cell banner announces (shield-used = a snake was blocked). */
export type SpecialFlashKind = SpecialKind | 'shield-used'

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
  onStart?: (players: PlayerSetup[], rules: SnakesRules) => void
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
  const extraTurnFlash = useFlash()
  // A special cell fired (shield pickup/use, swap, teleport) — banner for all.
  const specialFlash = useFlash<SpecialFlashKind>()
  // "X's turn was skipped" notice (the player left the room).
  const skipFlash = useFlash()
  // Every committed event since START_GAME — feeds the recap and the replay.
  // Null when this client joined mid-match (it never saw the early turns).
  const [matchLog, setMatchLog] = useState<MatchLog<TurnResolution, SnakesRules> | null>(null)
  const { sound, muted, toggleMute } = useSound()
  const reduced = useReducedMotion()

  // Latest-value refs, synced after each commit. Every consumer reads them
  // from event handlers or async continuations — never during render — so the
  // post-render write is always fresh by the time it is read.
  const stateRef = useRef(state)
  const hooksRef = useRef(hooks)
  useEffect(() => {
    stateRef.current = state
    hooksRef.current = hooks
  })

  const timings = useMemo(
    () =>
      reduced
        ? { dice: 250, step: 45, jump: 180, special: 200, handoff: 120 }
        : {
            dice: TIMING.diceRollMs,
            step: TIMING.stepMs,
            jump: TIMING.jumpMs,
            special: TIMING.specialMs,
            handoff: TIMING.turnHandoffMs,
          },
    [reduced],
  )

  /** Animate a fully-resolved turn, then commit it. Shared by local + remote. */
  const executeTurn = useCallback(
    async (resolution: TurnResolution, alive: () => boolean) => {
      // Safe even for queued remote turns: the sequencer only starts this
      // handler once the previous event's commit is visible in `stateRef`.
      const player = stateRef.current.players[stateRef.current.currentPlayerIndex]
      if (!player) return

      // 1) Tumble the dice.
      dispatch({ type: 'BEGIN_ROLL', dice: resolution.dice })
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

      // 3) Take the snake / ladder — or watch a shield block the snake.
      if (resolution.jump) {
        setActiveMove({ playerId: player.id, cell: resolution.jump.to, kind: resolution.jump.kind })
        if (resolution.jump.kind === 'ladder') sound.playLadder()
        else sound.playSnake()
        await delay(timings.jump)
        if (!alive()) return
      } else if (resolution.shieldUsed) {
        sound.playShield()
        specialFlash.trigger(player.id, TIMING.specialFlashMs, 'shield-used')
        await delay(timings.special)
        if (!alive()) return
      }

      // 4) Special cell effects (the banner explains what just happened).
      if (resolution.shieldGained) {
        sound.playShield()
        specialFlash.trigger(player.id, TIMING.specialFlashMs, 'shield')
        await delay(timings.special)
        if (!alive()) return
      } else if (resolution.swapWith != null) {
        sound.playSwap()
        specialFlash.trigger(player.id, TIMING.specialFlashMs, 'swap')
        // Both tokens spring to their new cells when the commit lands below.
        await delay(timings.special)
        if (!alive()) return
      } else if (resolution.teleportTo != null) {
        sound.playTeleport()
        specialFlash.trigger(player.id, TIMING.specialFlashMs, 'mystery')
        setActiveMove({ playerId: player.id, cell: resolution.teleportTo, kind: 'teleport' })
        await delay(timings.special)
        if (!alive()) return
      }

      // 5) Settle, then commit (batched so the token never flashes back).
      await delay(timings.handoff)
      if (!alive()) return
      setActiveMove(null)
      dispatch({ type: 'COMMIT_TURN', resolution })
      setMatchLog((log) =>
        log && { ...log, events: [...log.events, { kind: 'turn', seat: player.id, resolution }] },
      )
      if (resolution.isWin) {
        sound.playWin()
      } else if (resolution.extraTurn) {
        // Lucky six (or doubles)! Same player goes again — on every client.
        sound.playExtraTurn()
        extraTurnFlash.trigger(player.id, TIMING.extraTurnFlashMs)
      }
    },
    [sound, timings, extraTurnFlash, specialFlash],
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
  const handlers: SequencerHandlers<TurnResolution> = {
    executeTurn,
    executeSkip,
    executeDecision,
    committedCount: () => stateRef.current.turnCount,
    onOutOfSync: () => hooksRef.current?.onOutOfSync?.(),
  }
  const [sequencer] = useState(() => createTurnSequencer<TurnResolution>())
  useEffect(() => {
    sequencer.update(handlers)
  })

  const roll = useCallback(async () => {
    const snap = stateRef.current
    if (snap.phase !== 'idle') return
    if (controlsPlayer !== 'all' && controlsPlayer !== snap.currentPlayerIndex) return
    const player = snap.players[snap.currentPlayerIndex]
    if (!player) return
    // Never roll over remote turns that are still animating or queued, and
    // never double-fire on a double-tap (the phase only changes next render).
    if (!sequencer.acquireTurnLock()) return
    try {
      const resolution = resolveTurn({
        board: snap.board,
        positions: snap.players.map((p) => p.position),
        playerIndex: snap.currentPlayerIndex,
        hasShield: player.shield,
        dice: rollDice(snap.rules.diceCount),
      })
      hooksRef.current?.onLocalTurn?.(resolution, sequencer.claimSeq())
      await executeTurn(resolution, sequencer.beginRun())
    } finally {
      sequencer.releaseTurnLock()
    }
  }, [controlsPlayer, executeTurn, sequencer])

  const applyRemoteTurn = useCallback(
    (resolution: TurnResolution, seq: number) => {
      sequencer.accept({ kind: 'turn', resolution }, seq)
    },
    [sequencer],
  )

  /**
   * Skip the current (absent) player's turn as commit number `seq`. Used both
   * by the client that initiates the skip and by everyone receiving it, so all
   * clients replay the identical event.
   */
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
      // Only decide from a settled state (nothing queued or animating).
      if (sequencer.busy()) return
      hooksRef.current?.onLocalDecision?.(decision, sequencer.claimSeq())
      executeDecision(decision)
    },
    [executeDecision, sequencer],
  )

  const clearTransients = useCallback(() => {
    setActiveMove(null)
    extraTurnFlash.clear()
    specialFlash.clear()
    skipFlash.clear()
  }, [extraTurnFlash, specialFlash, skipFlash])

  const startGame = useCallback(
    (players: PlayerSetup[], rules?: SnakesRules) => {
      const matchRules = asSnakesRules(rules)
      sequencer.rebase(0)
      clearTransients()
      dispatch({ type: 'START_GAME', players, rules: matchRules })
      setMatchLog({ players: players.map((p) => ({ ...p })), rules: matchRules, events: [] })
      hooksRef.current?.onStart?.(players, matchRules)
    },
    [sequencer, clearTransients],
  )

  const applyRemoteStart = useCallback(
    (players: PlayerSetup[], rules?: unknown) => {
      const matchRules = asSnakesRules(rules)
      sequencer.rebase(0)
      clearTransients()
      dispatch({ type: 'START_GAME', players, rules: matchRules })
      setMatchLog({ players: players.map((p) => ({ ...p })), rules: matchRules, events: [] })
    },
    [sequencer, clearTransients],
  )

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
      rules: SnakesRules
      currentPlayerIndex: number
      lastRoll: number | null
      finishedOrder: number[]
      awaitingDecision: boolean
      ended: boolean
      turnCount: number
    }) => {
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

  /**
   * Live sync probe for the networking layer. `seq` counts every turn this
   * client has accepted (including ones still animating); `busy` is true while
   * anything is in flight, i.e. the committed state is not yet final.
   */
  const syncStatus = useCallback(
    () => ({ seq: sequencer.seq, busy: sequencer.busy() }),
    [sequencer],
  )

  const reset = useCallback(() => {
    sequencer.rebase(0)
    clearTransients()
    setMatchLog(null)
    dispatch({ type: 'RESET' })
  }, [sequencer, clearTransients])

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
    matchLog,
    extraTurnFlash: extraTurnFlash.flash,
    specialFlash: specialFlash.flash,
    skipFlash: skipFlash.flash,
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
