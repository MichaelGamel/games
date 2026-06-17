import { useEffect, useMemo, useRef, useState } from 'react'
import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { computeLayout } from '../../../domino/layout'
import { LAYOUT, TIMING } from '../../../domino/config'
import type { DominoLine } from '../../../domino/types'
import { BoardTile } from './BoardTile'

/** Pixels per layout-unit at scale 1 (the board scales this to fit). */
const UNIT_PX = 38

interface DominoBoardProps {
  line: DominoLine
  /** Glow the two open ends of the line (a "play here" hint). */
  highlightEnds?: boolean
}

/**
 * The laid line, rendered as an auto-scaling serpentine. A pure `computeLayout`
 * walk produces tile-unit positions; the board measures its container and
 * applies one GPU `scale` transform so the entire chain — however long — stays
 * visible. Tiles are individually `memo`'d so only a newly-laid bone animates.
 */
export function DominoBoard({ line, highlightEnds = true }: DominoBoardProps) {
  const { t } = useTranslation('domino')
  const containerRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (r) setBox({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Fewer tiles per row on narrow screens so the chain stays legible.
  const perRow = box.w > 0 && box.w < 520 ? 5 : LAYOUT.perRow
  const layout = useMemo(
    () => computeLayout(line, { ...LAYOUT, perRow }),
    [line, perRow],
  )

  const innerW = Math.max(layout.width, LAYOUT.tileLong) * UNIT_PX
  const innerH = Math.max(layout.height, LAYOUT.tileShort) * UNIT_PX
  const scale =
    box.w > 0 && box.h > 0 ? Math.min(box.w / innerW, box.h / innerH, 1.2) : 1

  const headId = line.tiles[0]?.tile.id
  const tailId = line.tiles[line.tiles.length - 1]?.tile.id

  return (
    <div ref={containerRef} className="relative flex w-full flex-1 items-center justify-center overflow-hidden">
      {layout.tiles.length === 0 ? (
        <p className="text-sm text-white/40">{t('emptyLineHint')}</p>
      ) : (
        <m.div
          className="absolute left-1/2 top-1/2"
          style={{ width: innerW, height: innerH, x: '-50%', y: '-50%' }}
          animate={{ scale }}
          transition={{ duration: TIMING.scaleMs / 1000, ease: [0.4, 0, 0.2, 1] }}
        >
          {layout.tiles.map((tile) => (
            <BoardTile
              key={tile.id}
              cx={tile.cx}
              cy={tile.cy}
              leftPip={tile.leftPip}
              rightPip={tile.rightPip}
              isDouble={tile.isDouble}
              glow={highlightEnds && (tile.id === headId || tile.id === tailId)}
              unitPx={UNIT_PX}
              tileLong={LAYOUT.tileLong}
              tileShort={LAYOUT.tileShort}
            />
          ))}
        </m.div>
      )}
    </div>
  )
}
