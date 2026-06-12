import { Dice3D } from '../../dice/Dice3D'
import type { DieValue } from '../../../ludo/types'

interface LudoDiceProps {
  value: DieValue | null
  /** True while the dice is tumbling. */
  rolling: boolean
  size?: number
}

/**
 * Ludo's die — a thin wrapper around the shared {@link Dice3D} so Ludo depends
 * on its own dice component (and can diverge later) without duplicating the
 * cube. The die value type is shared with Snakes, so this is a pass-through.
 */
export function LudoDice({ value, rolling, size }: LudoDiceProps) {
  return <Dice3D value={value} rolling={rolling} size={size} />
}
