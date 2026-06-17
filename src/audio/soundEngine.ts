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

  // ---- UNO ----------------------------------------------------------------
  // (The Skip card reuses `playSkip` above; these cover the rest.)

  /** Light flick/slap as a card lands on the discard pile. */
  playCardPlay(): void {
    if (this.muted || !this.ensure()) return
    this.blip(520, 0, 0.05, 'square', 0.16)
    this.blip(360, 0.03, 0.08, 'triangle', 0.18)
  }

  /** Solid wooden "clack" as a domino bone is laid onto the line. */
  playTilePlace(): void {
    if (this.muted || !this.ensure()) return
    this.blip(240, 0, 0.06, 'square', 0.22)
    this.blip(150, 0.02, 0.1, 'triangle', 0.2)
  }

  /** A double knuckle-rap on the table — a player knocks/passes. */
  playKnock(): void {
    if (this.muted || !this.ensure()) return
    this.blip(180, 0, 0.05, 'square', 0.2)
    this.blip(170, 0.13, 0.06, 'square', 0.18)
  }

  /** Soft "slide" as a card is drawn off the deck. */
  playDraw(): void {
    if (this.muted || !this.ensure()) return
    const ctx = this.ctx
    const master = this.master
    if (!ctx || !master) return
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(300, t0)
    osc.frequency.exponentialRampToValueAtTime(560, t0 + 0.12)
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16)
    osc.connect(gain).connect(master)
    osc.start(t0)
    osc.stop(t0 + 0.2)
  }

  /** Quick riffle as the discard is reshuffled into a fresh stock. */
  playShuffle(): void {
    if (this.muted || !this.ensure()) return
    for (let i = 0; i < 9; i++) {
      this.blip(240 + Math.random() * 220, i * 0.035, 0.04, 'triangle', 0.1)
    }
  }

  /** A pitch-bending "whoosh" as play direction flips. */
  playReverse(): void {
    if (this.muted || !this.ensure()) return
    const ctx = this.ctx
    const master = this.master
    if (!ctx || !master) return
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(420, t0)
    osc.frequency.exponentialRampToValueAtTime(840, t0 + 0.18)
    osc.frequency.exponentialRampToValueAtTime(360, t0 + 0.36)
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(0.2, t0 + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4)
    osc.connect(gain).connect(master)
    osc.start(t0)
    osc.stop(t0 + 0.44)
  }

  /** Bright ascending triad when a wild color is chosen. */
  playColorPick(): void {
    if (this.muted || !this.ensure()) return
    const notes = [523.25, 698.46, 880] // C5 F5 A5
    notes.forEach((f, i) => this.blip(f, i * 0.07, 0.18, 'sine', 0.22))
  }

  /** Two-note "U-NO!" call. */
  playUnoCall(): void {
    if (this.muted || !this.ensure()) return
    this.blip(659.25, 0, 0.16, 'square', 0.24) // E5
    this.blip(987.77, 0.16, 0.24, 'square', 0.26) // B5
  }

  /** Low descending "donk" for a penalty draw or a caught miss. */
  playPenalty(): void {
    if (this.muted || !this.ensure()) return
    this.blip(220, 0, 0.16, 'sawtooth', 0.22)
    this.blip(165, 0.12, 0.22, 'sawtooth', 0.2)
  }

  /**
   * Ascending chime as each winning Connect Four disc lights up in turn. The
   * pitch climbs with `step` (0-based) so the four discs ring out a rising
   * arpeggio that resolves into the win fanfare.
   */
  playConnectStep(step: number): void {
    if (this.muted || !this.ensure()) return
    const scale = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98] // C5 E5 G5 C6 E6 G6
    const f = scale[Math.min(step, scale.length - 1)]
    this.blip(f, 0, 0.3, 'triangle', 0.3)
    this.blip(f * 2, 0.03, 0.18, 'sine', 0.12) // shimmer an octave up
  }

  // ---- Bank El-Hazz -------------------------------------------------------
  // (Rolls/steps reuse `playRoll`/`playStep`; jail-skip reuses `playSkip`.)

  /** Bright cascade of coin clinks for a cash gain (rent, reward, collect). */
  playCoins(): void {
    if (this.muted || !this.ensure()) return
    const notes = [1318.51, 1567.98, 2093, 2637] // E6 G6 C7 E7
    notes.forEach((f, i) => this.blip(f, i * 0.05, 0.1, 'triangle', 0.16))
  }

  /** Two-note rising chime when a player passes Start and collects the reward. */
  playPassStart(): void {
    if (this.muted || !this.ensure()) return
    this.blip(659.25, 0, 0.18, 'triangle', 0.24) // E5
    this.blip(987.77, 0.14, 0.28, 'triangle', 0.26) // B5
  }

  /** Mystical shimmer as a luck card is drawn. */
  playLuckDraw(): void {
    if (this.muted || !this.ensure()) return
    const notes = [587.33, 880, 1174.66, 1760] // D5 A5 D6 A6
    notes.forEach((f, i) => this.blip(f, i * 0.06, 0.16, 'sine', 0.18))
    this.blip(2349.32, 0.3, 0.2, 'sine', 0.12) // D7 sparkle
  }

  /** Cha-ching + stamp as a property is purchased. */
  playBuy(): void {
    if (this.muted || !this.ensure()) return
    this.blip(880, 0, 0.1, 'square', 0.2) // ching…
    this.blip(1318.51, 0.08, 0.16, 'triangle', 0.24) // …ching!
    this.blip(196, 0.2, 0.12, 'square', 0.26) // stamp thud
  }

  /** Heavy metallic clang of the jail gate. */
  playJail(): void {
    if (this.muted || !this.ensure()) return
    this.blip(196, 0, 0.18, 'square', 0.3) // G3 gate slam
    this.blip(146.83, 0.05, 0.3, 'sawtooth', 0.22) // D3 reverberation
    this.blip(392, 0.04, 0.24, 'triangle', 0.14) // metallic ring
  }

  /** Descending sad glissando as a player goes bankrupt. */
  playBankrupt(): void {
    if (this.muted || !this.ensure()) return
    const ctx = this.ctx
    const master = this.master
    if (!ctx || !master) return
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(440, t0)
    osc.frequency.exponentialRampToValueAtTime(98, t0 + 0.7) // A4 → G2
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(0.24, t0 + 0.04)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.8)
    osc.connect(gain).connect(master)
    osc.start(t0)
    osc.stop(t0 + 0.85)
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
