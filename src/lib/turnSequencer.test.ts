import { describe, expect, it, vi } from 'vitest'
import { createTurnSequencer, type SequencerHandlers } from './turnSequencer'

/**
 * A little world that mimics how the hooks use the sequencer: `executeTurn`
 * "commits" by bumping a counter — optionally after a delay, like React
 * flushing a render — and the sequencer reads that counter back.
 */
function makeWorld(opts: { commitDelayMs?: number } = {}) {
  let committed = 0
  const applied: string[] = []
  const outOfSync = vi.fn()

  const handlers: SequencerHandlers<string> = {
    executeTurn: async (resolution) => {
      applied.push(`turn:${resolution}`)
      if (opts.commitDelayMs) {
        // Commit becomes visible only later (React renders asynchronously).
        setTimeout(() => committed++, opts.commitDelayMs)
      } else {
        committed++
      }
    },
    executeSkip: () => {
      applied.push('skip')
      committed++
    },
    executeDecision: (decision) => {
      applied.push(`decision:${decision}`)
      committed++
    },
    committedCount: () => committed,
    onOutOfSync: outOfSync,
  }

  const sequencer = createTurnSequencer(handlers, { pollMs: 2, commitTimeoutMs: 120 })
  return {
    sequencer,
    applied,
    outOfSync,
    committed: () => committed,
    setCommitted: (n: number) => {
      committed = n
    },
  }
}

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))

describe('accept', () => {
  it('applies events in sequence order', async () => {
    const { sequencer, applied } = makeWorld()
    expect(sequencer.accept({ kind: 'turn', resolution: 'a' }, 1)).toBe(true)
    expect(sequencer.accept({ kind: 'skip' }, 2)).toBe(true)
    expect(sequencer.accept({ kind: 'decision', decision: 'continue' }, 3)).toBe(true)
    await tick(20)
    expect(applied).toEqual(['turn:a', 'skip', 'decision:continue'])
    expect(sequencer.seq).toBe(3)
  })

  it('drops duplicate deliveries', async () => {
    const { sequencer, applied, outOfSync } = makeWorld()
    sequencer.accept({ kind: 'turn', resolution: 'a' }, 1)
    expect(sequencer.accept({ kind: 'turn', resolution: 'a' }, 1)).toBe(false)
    await tick(20)
    expect(applied).toEqual(['turn:a'])
    expect(outOfSync).not.toHaveBeenCalled()
  })

  it('flags a gap (lost event) instead of applying out of order', async () => {
    const { sequencer, applied, outOfSync } = makeWorld()
    sequencer.accept({ kind: 'turn', resolution: 'a' }, 1)
    expect(sequencer.accept({ kind: 'turn', resolution: 'c' }, 3)).toBe(false)
    await tick(20)
    expect(applied).toEqual(['turn:a'])
    expect(outOfSync).toHaveBeenCalledOnce()
  })

  it('waits for the previous commit to become visible before the next event', async () => {
    const { sequencer, applied } = makeWorld({ commitDelayMs: 30 })
    // Both arrive at once (e.g. a backgrounded tab catching up).
    sequencer.accept({ kind: 'turn', resolution: 'a' }, 1)
    sequencer.accept({ kind: 'turn', resolution: 'b' }, 2)
    await tick(10)
    // Turn b must not start until turn a's commit is visible.
    expect(applied).toEqual(['turn:a'])
    await tick(60)
    expect(applied).toEqual(['turn:a', 'turn:b'])
  })

  it('abandons the queue and asks for a snapshot when a commit never lands', async () => {
    const { sequencer, applied, outOfSync } = makeWorld()
    // Claim a local seq but never commit it (e.g. a reducer guard dropped it):
    // the next remote event can then never satisfy its gate.
    sequencer.claimSeq()
    sequencer.accept({ kind: 'turn', resolution: 'b' }, 2)
    await tick(200) // past commitTimeoutMs
    expect(applied).toEqual([])
    expect(outOfSync).toHaveBeenCalledOnce()
    expect(sequencer.busy()).toBe(true) // still unsettled until a snapshot lands
  })
})

describe('claimSeq / busy', () => {
  it('claims monotonically increasing numbers', () => {
    const { sequencer } = makeWorld()
    expect(sequencer.claimSeq()).toBe(1)
    expect(sequencer.claimSeq()).toBe(2)
    expect(sequencer.seq).toBe(2)
  })

  it('is busy until the committed count catches up with the accepted seq', async () => {
    const { sequencer } = makeWorld({ commitDelayMs: 20 })
    expect(sequencer.busy()).toBe(false)
    sequencer.accept({ kind: 'turn', resolution: 'a' }, 1)
    expect(sequencer.busy()).toBe(true)
    await tick(50)
    expect(sequencer.busy()).toBe(false)
  })
})

describe('turn lock', () => {
  it('blocks re-entry until released', () => {
    const { sequencer } = makeWorld()
    expect(sequencer.acquireTurnLock()).toBe(true)
    expect(sequencer.acquireTurnLock()).toBe(false)
    sequencer.releaseTurnLock()
    expect(sequencer.acquireTurnLock()).toBe(true)
  })

  it('blocks while remote events are queued or animating', async () => {
    const { sequencer } = makeWorld({ commitDelayMs: 20 })
    sequencer.accept({ kind: 'turn', resolution: 'a' }, 1)
    expect(sequencer.acquireTurnLock()).toBe(false)
    await tick(50)
    expect(sequencer.acquireTurnLock()).toBe(true)
  })
})

describe('runs and rebase', () => {
  it('invalidates the previous run when a new one begins', () => {
    const { sequencer } = makeWorld()
    const first = sequencer.beginRun()
    expect(first()).toBe(true)
    sequencer.beginRun()
    expect(first()).toBe(false)
  })

  it('rebase cancels the active run, drops the queue, and restarts the sequence', async () => {
    const { sequencer, applied } = makeWorld({ commitDelayMs: 30 })
    const run = sequencer.beginRun()
    sequencer.accept({ kind: 'turn', resolution: 'a' }, 1)
    sequencer.accept({ kind: 'turn', resolution: 'b' }, 2)
    sequencer.rebase(10)
    expect(run()).toBe(false)
    expect(sequencer.seq).toBe(10)
    await tick(80)
    // Turn a may already have been applied, but the queued b must be dropped.
    expect(applied).not.toContain('turn:b')
    expect(sequencer.claimSeq()).toBe(11)
  })

  it('accepts the snapshot-following event after a rebase', async () => {
    const { sequencer, applied, setCommitted } = makeWorld()
    setCommitted(5) // the adopted snapshot already carries 5 committed turns
    sequencer.rebase(5)
    expect(sequencer.accept({ kind: 'turn', resolution: 'f' }, 6)).toBe(true)
    await tick(200)
    expect(applied).toEqual(['turn:f'])
  })
})
