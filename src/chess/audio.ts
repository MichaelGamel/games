/**
 * Synthesised chess sounds via the Web Audio API — no asset files, in the spirit
 * of the rest of Robin's Games. A single lazily-created AudioContext (unlocked by
 * the first tap) plays short envelopes: a soft knock for a move, a thud for a
 * capture, a bright chime for check, a fanfare arpeggio for a win.
 */
type ChessSound = 'move' | 'capture' | 'castle' | 'check' | 'promote' | 'win' | 'draw'

class ChessAudioEngine {
  private ctx: AudioContext | null = null
  private muted = false

  setMuted(muted: boolean) {
    this.muted = muted
  }

  private context(): AudioContext | null {
    if (this.muted) return null
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      this.ctx = new Ctor()
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  private blip(
    ctx: AudioContext,
    freq: number,
    start: number,
    duration: number,
    gain: number,
    type: OscillatorType = 'sine',
  ) {
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, start)
    env.gain.setValueAtTime(0.0001, start)
    env.gain.exponentialRampToValueAtTime(gain, start + 0.012)
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    osc.connect(env).connect(ctx.destination)
    osc.start(start)
    osc.stop(start + duration + 0.02)
  }

  play(sound: ChessSound) {
    const ctx = this.context()
    if (!ctx) return
    const t = ctx.currentTime
    switch (sound) {
      case 'move':
        this.blip(ctx, 220, t, 0.12, 0.18, 'triangle')
        this.blip(ctx, 330, t + 0.005, 0.09, 0.1, 'sine')
        break
      case 'capture':
        this.blip(ctx, 150, t, 0.2, 0.26, 'sawtooth')
        this.blip(ctx, 90, t + 0.01, 0.22, 0.2, 'square')
        break
      case 'castle':
        this.blip(ctx, 200, t, 0.12, 0.16, 'triangle')
        this.blip(ctx, 200, t + 0.13, 0.12, 0.16, 'triangle')
        break
      case 'check':
        this.blip(ctx, 880, t, 0.16, 0.18, 'sine')
        this.blip(ctx, 1175, t + 0.08, 0.18, 0.16, 'sine')
        break
      case 'promote':
        ;[523, 659, 784, 1047].forEach((f, i) => this.blip(ctx, f, t + i * 0.07, 0.2, 0.16, 'triangle'))
        break
      case 'win':
        ;[523, 659, 784, 1047, 1319].forEach((f, i) =>
          this.blip(ctx, f, t + i * 0.1, 0.32, 0.2, 'triangle'),
        )
        break
      case 'draw':
        this.blip(ctx, 392, t, 0.3, 0.16, 'sine')
        this.blip(ctx, 311, t + 0.14, 0.34, 0.16, 'sine')
        break
    }
  }
}

export const chessAudio = new ChessAudioEngine()
