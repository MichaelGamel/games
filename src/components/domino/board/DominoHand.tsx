import { m } from 'motion/react'
import { DominoTile } from './DominoTile'
import type { DominoTile as DominoTileType } from '../../../domino/types'
import { cn } from '../../../lib/cn'

interface DominoHandProps {
  tiles: DominoTileType[]
  /** Ids of the tiles that may be played right now (highlighted + clickable). */
  legalIds: ReadonlySet<string>
  /** Whether this hand may act at all (its owner's turn, on this device). */
  active: boolean
  /** Hide every face (the privacy hand-off / a bot's hand). */
  faceDown?: boolean
  onPlay: (tileId: string) => void
  /** The SHORT side of each (vertical) hand tile, in px. */
  size?: number
}

/**
 * The acting player's fanned hand: bones overlap and scroll horizontally, legal
 * tiles lift and glow and are clickable, the rest are dimmed. Synthesized tiles
 * only — no assets. Mirrors UNO's `UnoHand`.
 */
export function DominoHand({ tiles, legalIds, active, faceDown, onPlay, size = 30 }: DominoHandProps) {
  const tileWidth = size
  const overlap = tiles.length > 7 ? tileWidth * 0.4 : tileWidth * 0.24

  return (
    <div className="flex w-full justify-center overflow-x-auto overflow-y-visible px-3 pb-2 pt-6">
      <ul className="flex items-end" style={{ paddingInlineEnd: overlap }}>
        {tiles.map((tile, i) => {
          const playable = active && !faceDown && legalIds.has(tile.id)
          return (
            <m.li
              key={tile.id}
              layout
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: playable ? -14 : 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              style={{ marginInlineStart: i === 0 ? 0 : -overlap, zIndex: i }}
              whileHover={playable ? { y: -26, zIndex: 99 } : undefined}
            >
              <button
                type="button"
                disabled={!playable}
                onClick={() => onPlay(tile.id)}
                aria-label={faceDown ? undefined : `${tile.a}-${tile.b}`}
                className={cn(
                  'block rounded-[8px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
                  playable ? 'cursor-pointer' : 'cursor-default',
                  active && !faceDown && !playable && 'opacity-55',
                )}
              >
                <DominoTile pipA={tile.a} pipB={tile.b} orientation="v" size={size} faceDown={faceDown} glow={playable} />
              </button>
            </m.li>
          )
        })}
      </ul>
    </div>
  )
}
