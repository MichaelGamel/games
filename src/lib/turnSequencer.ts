/**
 * The turn-sequencing core shared by every game's orchestration hook.
 *
 * Online play has no server: clients stay in sync by committing the *same*
 * sequence-stamped events (turns, skips, host decisions) in the *same* order.
 * This module owns that protocol — duplicate detection, gap detection, the
 * one-at-a-time animation queue, run cancellation, and the "is this client
 * settled?" probe — so both Snakes & Ladders and Ludo (and any future game)
 * share one tested implementation instead of two drifting copies.
 *
 * It is deliberately framework-free (no React): the hooks adapt it with refs,
 * and the protocol itself stays unit-testable in plain vitest.
 *
 * Two subtle rules encoded here:
 *
 * 1. **Events queue and drain one at a time.** Remote events can arrive faster
 *    than their animations play (back-to-back sixes, a tab waking from the
 *    background); each is animated fully before the next starts.
 *
 * 2. **Each queued event waits for the previous commit to be visible.** The
 *    handlers read live game state (whose turn it is, the current phase), but
 *    React renders asynchronously — a synchronously-drained queue could apply
 *    event N+1 while state still shows the world before event N. The drain
 *    therefore gates on `committedCount()` reaching the event's predecessor.
 *    If it never does (an event was dropped by a reducer guard), the queue is
 *    abandoned and `onOutOfSync` asks the room for a fresh snapshot.
 */
import type { MatchDecision } from '../game/types'

/** A sequence-stamped event every client commits in the same order. */
export type SequencedEvent<R> =
  | { kind: 'turn'; resolution: R }
  | { kind: 'skip' }
  | { kind: 'decision'; decision: MatchDecision }

export interface SequencerHandlers<R> {
  /**
   * Animate and commit one turn. `alive` goes false when the run is superseded
   * (reset, restart, snapshot adopted) — the handler should stop animating.
   */
  executeTurn: (resolution: R, alive: () => boolean) => Promise<void>
  /** Hand the turn to the next player (the current one left the room). */
  executeSkip: () => void
  /** Apply the host's continue/end call after a mid-game finish. */
  executeDecision: (decision: MatchDecision) => void
  /** Committed turns as currently visible in live game state. */
  committedCount: () => number
  /** The local state can't advance by replaying events — request a snapshot. */
  onOutOfSync: () => void
}

export interface TurnSequencer<R> {
  /** Sequence number of the latest accepted event (committed, queued, or animating). */
  readonly seq: number
  /** Point the sequencer at this render's handler closures. */
  update(handlers: SequencerHandlers<R>): void
  /** Claim the next sequence number for a locally-initiated event. */
  claimSeq(): number
  /**
   * Accept a sequence-stamped remote event. Duplicates are dropped; a gap
   * (an event was lost in transit) fires `onOutOfSync` instead of applying —
   * applying out of order would corrupt the state. Returns true when queued.
   */
  accept(event: SequencedEvent<R>, seq: number): boolean
  /**
   * Start an animation run, invalidating any previous one. The returned probe
   * stays true until the run is superseded or the sequencer is rebased.
   */
  beginRun(): () => boolean
  /**
   * Cancel in-flight work, drop queued events, and restart the sequence at
   * `seq` — used on reset/restart (0) and when adopting a snapshot (its
   * turn count).
   */
  rebase(seq: number): void
  /**
   * Synchronous re-entrancy lock for a locally-initiated turn. Fails while a
   * local turn is already running or remote events are queued/animating (the
   * `idle` phase only leaves on the next render, so a double-tap could
   * otherwise fire two turns). Pair with `releaseTurnLock` in a finally.
   */
  acquireTurnLock(): boolean
  releaseTurnLock(): void
  /**
   * True while anything is unsettled: a local turn in flight, events queued or
   * animating, or an accepted event not yet visible in committed state.
   */
  busy(): boolean
}

interface SequencerOptions {
  /** How often the drain re-checks for the previous event's commit. */
  pollMs?: number
  /** How long to wait for a commit before declaring the client out of sync. */
  commitTimeoutMs?: number
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Placeholder until `update` injects the real handlers (always before the
 *  first event: transports subscribe, and users interact, only after mount). */
const inertHandlers = <R,>(): SequencerHandlers<R> => ({
  executeTurn: async () => {},
  executeSkip: () => {},
  executeDecision: () => {},
  committedCount: () => 0,
  onOutOfSync: () => {},
})

export function createTurnSequencer<R>(
  initialHandlers?: SequencerHandlers<R>,
  { pollMs = 16, commitTimeoutMs = 1500 }: SequencerOptions = {},
): TurnSequencer<R> {
  let handlers = initialHandlers ?? inertHandlers<R>()
  let lastSeq = 0
  let runId = 0
  let localTurnRunning = false
  let draining = false
  let queue: Array<{ seq: number; event: SequencedEvent<R> }> = []

  const beginRun = (): (() => boolean) => {
    const myRun = ++runId
    return () => runId === myRun
  }

  /** Wait until `count` commits are visible in game state (or give up). */
  const waitForCommits = async (count: number, alive: () => boolean): Promise<boolean> => {
    const deadline = Date.now() + commitTimeoutMs
    while (handlers.committedCount() < count) {
      if (!alive() || Date.now() > deadline) return false
      await delay(pollMs)
    }
    return alive()
  }

  const drain = async (): Promise<void> => {
    if (draining) return
    draining = true
    try {
      let next: { seq: number; event: SequencedEvent<R> } | undefined
      while ((next = queue.shift())) {
        // Gate on the previous event's commit being visible (rule 2 above).
        const runIdAtShift = runId
        const stillThisRun = () => runId === runIdAtShift
        if (!(await waitForCommits(next.seq - 1, stillThisRun))) {
          if (runId !== runIdAtShift) return // rebased mid-wait; queue replaced
          queue = []
          handlers.onOutOfSync()
          return
        }
        const { event } = next
        if (event.kind === 'turn') await handlers.executeTurn(event.resolution, beginRun())
        else if (event.kind === 'skip') handlers.executeSkip()
        else handlers.executeDecision(event.decision)
      }
    } finally {
      draining = false
    }
  }

  return {
    get seq() {
      return lastSeq
    },

    update(next) {
      handlers = next
    },

    claimSeq() {
      return ++lastSeq
    },

    accept(event, seq) {
      const expected = lastSeq + 1
      // Already have this event (duplicate delivery): drop it.
      if (seq < expected) return false
      // An event was lost in transit; applying this one would corrupt state.
      if (seq > expected) {
        handlers.onOutOfSync()
        return false
      }
      lastSeq = seq
      queue.push({ seq, event })
      void drain()
      return true
    },

    beginRun,

    rebase(seq) {
      runId++
      queue = []
      lastSeq = seq
    },

    acquireTurnLock() {
      if (localTurnRunning || draining || queue.length > 0) return false
      localTurnRunning = true
      return true
    },

    releaseTurnLock() {
      localTurnRunning = false
    },

    busy() {
      return (
        localTurnRunning ||
        draining ||
        queue.length > 0 ||
        lastSeq !== handlers.committedCount()
      )
    },
  }
}
