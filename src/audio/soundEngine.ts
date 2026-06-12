/**
 * A tiny Web Audio sound engine — no audio files. Every effect is synthesized
 * from oscillators with shaped gain envelopes, so the bundle stays asset-free
 * and the sounds are generated on demand.
 *
 * One lazily-created AudioContext is shared across the app (browsers require it
 * be created/resumed inside a user gesture, which the first roll provides).
 * The engine owns its own `muted` flag so every call site can fire effects
 * unconditionally and trust the engine to stay silent when muted.
 */
type Wave = OscillatorType

export class SoundEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private muted = false

  setMuted(muted: boolean): void {
    this.muted = muted
  }

  /** Lazily create/resume the audio graph. Returns null if unsupported. */
  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.45
      this.master.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  /** Play a single shaped tone, `start` seconds from now. */
  private blip(freq: number, start: number, duration: number, type: Wave = 'sine', peak = 0.3): void {
    const ctx = this.ctx
    const master = this.master
    if (!ctx || !master) return
    const t0 = ctx.currentTime + start
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
    osc.connect(gain).connect(master)
    osc.start(t0)
    osc.stop(t0 + duration + 0.03)
  }

  /** Rattle of the die against the table. */
  playRoll(): void {
    if (this.muted || !this.ensure()) return
    for (let i = 0; i < 7; i++) {
      this.blip(150 + Math.random() * 160, i * 0.06, 0.05, 'square', 0.12)
    }
  }

  /** A single hop along the board. */
  playStep(): void {
    if (this.muted || !this.ensure()) return
    this.blip(660, 0, 0.07, 'triangle', 0.14)
  }

  /** Bright ascending arpeggio for climbing a ladder. */
  playLadder(): void {
    if (this.muted || !this.ensure()) return
    const notes = [392, 523.25, 659.25, 783.99] // G4 C5 E5 G5
    notes.forEach((f, i) => this.blip(f, i * 0.09, 0.2, 'triangle', 0.26))
  }

  /** Descending glissando + hiss for sliding down a snake. */
  playSnake(): void {
    if (this.muted || !this.ensure()) return
    const ctx = this.ctx
    const master = this.master
    if (!ctx || !master) return
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(720, t0)
    osc.frequency.exponentialRampToValueAtTime(120, t0 + 0.5)
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55)
    osc.connect(gain).connect(master)
    osc.start(t0)
    osc.stop(t0 + 0.6)
  }

  /**
   * Playful "lucky six" jingle: a fast rising arpeggio capped with a sparkle
   * trill. Shorter and cheekier than the win fanfare — it says "go again!".
   */
  playExtraTurn(): void {
    if (this.muted || !this.ensure()) return
    const run = [659.25, 783.99, 987.77, 1318.51] // E5 G5 B5 E6
    run.forEach((f, i) => this.blip(f, i * 0.07, 0.16, 'triangle', 0.28))
    // sparkle on top
    this.blip(2093, 0.3, 0.1, 'sine', 0.16) // C7
    this.blip(2637, 0.38, 0.14, 'sine', 0.14) // E7
  }

  /** Soft descending "whoosh" when an absent player's turn is skipped. */
  playSkip(): void {
    if (this.muted || !this.ensure()) return
    this.blip(440, 0, 0.12, 'triangle', 0.18)
    this.blip(330, 0.1, 0.16, 'triangle', 0.14)
  }

  /** Light "pop" when an emoji reaction lands (online play). */
  playReaction(): void {
    if (this.muted || !this.ensure()) return
    this.blip(880, 0, 0.07, 'triangle', 0.14)
    this.blip(1318.51, 0.05, 0.1, 'sine', 0.12)
  }

  /** Springy "pop" as a Ludo token launches out of its base on a six. */
  playRelease(): void {
    if (this.muted || !this.ensure()) return
    this.blip(330, 0, 0.08, 'triangle', 0.2)
    this.blip(660, 0.06, 0.12, 'triangle', 0.24)
  }

  /** Punchy thwack, then a descending tumble as the captured token is sent home. */
  playCapture(): void {
    if (this.muted || !this.ensure()) return
    this.blip(180, 0, 0.09, 'square', 0.28) // impact
    this.blip(520, 0.05, 0.12, 'sawtooth', 0.2) // victim…
    this.blip(300, 0.16, 0.16, 'sawtooth', 0.16) // …tumbling back to base
  }

  /** Bright sparkle chime when a Ludo token completes its journey home. */
  playHomeArrival(): void {
    if (this.muted || !this.ensure()) return
    const notes = [659.25, 987.77, 1318.51] // E5 B5 E6
    notes.forEach((f, i) => this.blip(f, i * 0.08, 0.22, 'triangle', 0.26))
    this.blip(2093, 0.26, 0.12, 'sine', 0.14) // C7 sparkle on top
  }

  /** Metallic "clang" as a shield is picked up — or blocks a snake. */
  playShield(): void {
    if (this.muted || !this.ensure()) return
    this.blip(523.25, 0, 0.16, 'square', 0.18) // C5 clang
    this.blip(1046.5, 0.02, 0.22, 'triangle', 0.22) // C6 ring
    this.blip(1568, 0.1, 0.18, 'sine', 0.12) // G6 shimmer
  }

  /** Two quick crossing "zips" as players swap places. */
  playSwap(): void {
    if (this.muted || !this.ensure()) return
    const ctx = this.ctx
    const master = this.master
    if (!ctx || !master) return
    const t0 = ctx.currentTime
    for (const [f1, f2] of [
      [300, 900],
      [900, 300],
    ]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(f1, t0)
      osc.frequency.exponentialRampToValueAtTime(f2, t0 + 0.3)
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32)
      osc.connect(gain).connect(master)
      osc.start(t0)
      osc.stop(t0 + 0.35)
    }
  }

  /** Wobbly rising "warp" for the mystery teleport. */
  playTeleport(): void {
    if (this.muted || !this.ensure()) return
    const notes = [440, 554.37, 698.46, 880, 1108.73] // A4 C#5 F5 A5 C#6
    notes.forEach((f, i) => this.blip(f, i * 0.05, 0.12, 'sine', 0.2))
    this.blip(1760, 0.28, 0.18, 'sine', 0.14) // A6 sparkle
  }

  /** Victory fanfare. */
  playWin(): void {
    if (this.muted || !this.ensure()) return
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51] // C5 E5 G5 C6 E6
    notes.forEach((f, i) => this.blip(f, i * 0.13, 0.5, 'triangle', 0.3))
  }
}

/** App-wide singleton so the whole game shares one AudioContext. */
export const soundEngine = new SoundEngine()
