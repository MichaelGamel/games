/**
 * React wrapper around the imperative {@link DominoTableScene}. It mounts the
 * scene once via a callback ref (keeping the Three.js object out of the
 * controller, per the project's ref-poisoning rule), then pushes the line, the
 * viewer's hand and the boneyard into it whenever they change. Tap callbacks
 * are read through refs so the long-lived scene always calls the latest
 * handlers.
 *
 * If WebGL is unavailable, it transparently renders the original 2D board,
 * boneyard and hand instead, so the game stays fully playable everywhere.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DominoLine, DominoTile } from '../../../../domino/types'
import { cn } from '../../../../lib/cn'
import { DominoBoard } from '../DominoBoard'
import { DominoHand } from '../DominoHand'
import { Boneyard } from '../Boneyard'
import { DominoTableScene, type DominoSceneCallbacks } from './DominoTableScene'

interface DominoTable3DProps {
  line: DominoLine
  /** The viewer's hand (their own tiles; face-down for a bot / privacy). */
  handTiles: DominoTile[]
  legalIds: ReadonlySet<string>
  /** Whether taps may play right now (your turn, this device, not a bot). */
  active: boolean
  faceDown: boolean
  boneyardCount: number
  canDraw: boolean
  highlightEnds?: boolean
  onPlay: (tileId: string) => void
  onDraw: () => void
  className?: string
}

function webglAvailable(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    return (
      'WebGLRenderingContext' in window &&
      (canvas.getContext('webgl2') != null || canvas.getContext('webgl') != null)
    )
  } catch {
    return false
  }
}

export function DominoTable3D({
  line,
  handTiles,
  legalIds,
  active,
  faceDown,
  boneyardCount,
  canDraw,
  highlightEnds = true,
  onPlay,
  onDraw,
  className,
}: DominoTable3DProps) {
  const [supported] = useState(webglAvailable)
  const sceneRef = useRef<DominoTableScene | null>(null)
  const [ready, setReady] = useState(false)

  // Latest tap handlers, read by the long-lived scene.
  const onPlayRef = useRef(onPlay)
  const onDrawRef = useRef(onDraw)
  useEffect(() => {
    onPlayRef.current = onPlay
    onDrawRef.current = onDraw
  })

  const attach = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const callbacks: DominoSceneCallbacks = {
        onPlayTile: (id) => onPlayRef.current(id),
        onDrawTile: () => onDrawRef.current(),
      }
      sceneRef.current = new DominoTableScene(node, callbacks)
      setReady(true)
    } else {
      sceneRef.current?.dispose()
      sceneRef.current = null
      setReady(false)
    }
  }, [])

  // Push state into the scene whenever it changes (or the scene (re)mounts).
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    scene.setHighlightEnds(highlightEnds)
    scene.setLine(line)
    scene.setHand({ tiles: handTiles, legalIds, active, faceDown })
    scene.setBoneyard(boneyardCount, canDraw)
  }, [ready, line, handTiles, legalIds, active, faceDown, boneyardCount, canDraw, highlightEnds])

  if (!supported) {
    return (
      <Fallback2D
        className={className}
        line={line}
        handTiles={handTiles}
        legalIds={legalIds}
        active={active}
        faceDown={faceDown}
        boneyardCount={boneyardCount}
        canDraw={canDraw}
        highlightEnds={highlightEnds}
        onPlay={onPlay}
        onDraw={onDraw}
      />
    )
  }

  return <div ref={attach} className={cn('h-full w-full', className)} aria-hidden="true" />
}

/** The original CSS board/boneyard/hand, used when WebGL is unavailable. */
function Fallback2D({
  line,
  handTiles,
  legalIds,
  active,
  faceDown,
  boneyardCount,
  canDraw,
  highlightEnds,
  onPlay,
  onDraw,
  className,
}: DominoTable3DProps) {
  const { t } = useTranslation('domino')
  return (
    <div className={cn('flex h-full w-full flex-col gap-2', className)}>
      <div className="flex flex-1 items-stretch gap-3">
        <div className="flex shrink-0 flex-col items-center justify-center gap-2">
          <Boneyard count={boneyardCount} canDraw={canDraw} onDraw={onDraw} />
          {line.leftEnd != null && line.rightEnd != null && (
            <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/70 ring-1 ring-white/10 tabular-nums">
              {t('openEnds', { left: line.leftEnd, right: line.rightEnd })}
            </span>
          )}
        </div>
        <DominoBoard line={line} highlightEnds={highlightEnds} />
      </div>
      <div className={cn('shrink-0', !active && 'pointer-events-none')}>
        <DominoHand
          tiles={handTiles}
          legalIds={legalIds}
          active={active}
          faceDown={faceDown}
          onPlay={onPlay}
        />
      </div>
    </div>
  )
}
