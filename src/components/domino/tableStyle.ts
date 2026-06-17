/**
 * The Dominoes "table style" — a per-client *visual* preference (it never
 * affects game state, so it is not synced over the wire). `classic` is the
 * original 2D CSS board; `3d` is the Three.js table. Default is `classic`;
 * `3d` is opt-in on the setup screen. Persisted in localStorage so the choice
 * is remembered and is also picked up by online play (which has no local setup
 * screen of its own).
 */
import { loadLocal, saveLocal } from '../../lib/storage'

export type DominoTableStyle = 'classic' | '3d'

const KEY = 'domino:tableStyle'

export function loadTableStyle(): DominoTableStyle {
  return loadLocal<DominoTableStyle>(KEY, 'classic') === '3d' ? '3d' : 'classic'
}

export function saveTableStyle(style: DominoTableStyle): void {
  saveLocal(KEY, style)
}
