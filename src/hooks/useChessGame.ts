/**
 * The orchestration facade for 3D chess — the only place that mixes the rules
 * engine, the AI, the Three.js scene, and sound. Components depend on the
 * `ChessController` it returns, never on those pieces directly.
 *
 * Authoritative game state lives in the {@link ChessEngine}; the scene is a pure
 * visual replay driven by {@link MoveAnimation}s. Synchronous interaction flags
 * (busy / selected / pending promotion) live in refs so a rapid tap can never
 * race a React render; everything else is mirrored into state for the HUD.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChessEngine } from '../chess/engine'
import { chooseMove } from '../chess/ai'
import { chessAudio } from '../chess/audio'
import { ChessScene } from '../chess/three/ChessScene'
import { PIECE_VALUE, TIMING } from '../chess/config'
import type {
  ChessMode,
  Difficulty,
  GameOutcome,
  PieceColor,
  PieceType,
  Square,
} from '../chess/types'

/** The human always plays White (and is at the bottom of the board). */
const HUMAN: PieceColor = 'w'

export interface CapturedPieces {
  /** Pieces White has captured (Black men), and vice-versa. */
  w: PieceType[]
  b: PieceType[]
}

export interface ChessController {
  /** Attach/detach the 3D scene to a DOM node (wrap in a local callback ref). */
  attachScene: (node: HTMLDivElement | null) => void
  mode: ChessMode
  difficulty: Difficulty
  turn: PieceColor
  inCheck: boolean
  outcome: GameOutcome | null
  history: string[]
  captured: CapturedPieces
  /** Net material in centipawns from White's perspective (for the advantage badge). */
  advantage: number
  busy: boolean
  thinking: boolean
  /** A pending human promotion choice, if the picker is open. */
  promotion: { from: Square; to: Square } | null
  flipped: boolean
  muted: boolean
  /** Idle camera auto-orbit — off by default. */
  autoRotate: boolean
  canUndo: boolean
  newGame: () => void
  undo: () => void
  flip: () => void
  toggleAutoRotate: () => void
  toggleMute: () => void
  setDifficulty: (d: Difficulty) => void
  choosePromotion: (type: PieceType) => void
  cancelPromotion: () => void
}

interface Options {
  mode: ChessMode
  difficulty: Difficulty
}

export function useChessGame({ mode, difficulty: initialDifficulty }: Options): ChessController {
  // A single stable engine instance for the life of the hook.
  const [engine] = useState(() => new ChessEngine())

  const sceneRef = useRef<ChessScene | null>(null)
  const tapRef = useRef<(square: Square) => void>(() => {})

  // Synchronous interaction state (read inside event/async callbacks).
  const selectedRef = useRef<Square | null>(null)
  const busyRef = useRef(false)
  const promotionRef = useRef<{ from: Square; to: Square } | null>(null)
  const tokenRef = useRef(0)
  const aiTimerRef = useRef<number | null>(null)
  /** One entry per half-move played: the piece captured, or null. Undo-aware. */
  const capturesRef = useRef<Array<{ color: PieceColor; type: PieceType } | null>>([])
  const flippedRef = useRef(false)

  // HUD mirrors.
  const [difficulty, setDifficultyState] = useState<Difficulty>(initialDifficulty)
  const [turn, setTurn] = useState<PieceColor>('w')
  const [inCheck, setInCheck] = useState(false)
  const [outcome, setOutcome] = useState<GameOutcome | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const [captured, setCaptured] = useState<CapturedPieces>({ w: [], b: [] })
  const [busy, setBusyState] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [promotion, setPromotionState] = useState<{ from: Square; to: Square } | null>(null)
  const [flipped, setFlippedState] = useState(false)
  const [muted, setMuted] = useState(false)
  const [autoRotate, setAutoRotateState] = useState(false)
  const autoRotateRef = useRef(false)

  const difficultyRef = useRef(initialDifficulty)
  useEffect(() => {
    difficultyRef.current = difficulty
  }, [difficulty])

  const setBusy = useCallback((v: boolean) => {
    busyRef.current = v
    setBusyState(v)
  }, [])
  const setPromo = useCallback((v: { from: Square; to: Square } | null) => {
    promotionRef.current = v
    setPromotionState(v)
  }, [])

  const deriveCaptured = useCallback((): CapturedPieces => {
    const w: PieceType[] = []
    const b: PieceType[] = []
    for (const c of capturesRef.current) {
      if (!c) continue
      ;(c.color === 'w' ? w : b).push(c.type)
    }
    const byValue = (a: PieceType, z: PieceType) => PIECE_VALUE[z] - PIECE_VALUE[a]
    return { w: w.sort(byValue), b: b.sort(byValue) }
  }, [])

  const refreshHud = useCallback(() => {
    const status = engine.status()
    setTurn(status.turn)
    setInCheck(status.inCheck)
    setOutcome(status.outcome ?? null)
    setHistory(engine.history())
    setCaptured(deriveCaptured())
    sceneRef.current?.setCheck(status.checkSquare ?? null)
    return status
  }, [deriveCaptured, engine])

  const play = useCallback((sound: Parameters<typeof chessAudio.play>[0]) => {
    chessAudio.play(sound)
  }, [])

  const clearSelection = useCallback(() => {
    selectedRef.current = null
    sceneRef.current?.setSelection(null)
  }, [])

  const selectSquare = useCallback((square: Square) => {
    const targets = engine.legalTargets(square)
    selectedRef.current = square
    sceneRef.current?.setSelection(
      square,
      targets.map((t) => ({ to: t.to, capture: t.capture })),
    )
  }, [engine])

  // Forward declarations resolved via a ref so the move → AI → move cycle can
  // call back into itself without stale closures.
  const executeRef = useRef<(from: Square, to: Square, promotion?: PieceType) => void>(() => {})

  const triggerAI = useCallback(() => {
    setThinking(true)
    const token = tokenRef.current
    aiTimerRef.current = window.setTimeout(() => {
      if (token !== tokenRef.current) return
      const intent = chooseMove(engine.fen(), difficultyRef.current)
      setThinking(false)
      if (!intent) {
        setBusy(false)
        return
      }
      executeRef.current(intent.from, intent.to, intent.promotion)
    }, Math.max(TIMING.aiThink * 1000, 250))
  }, [engine, setBusy])

  const afterMove = useCallback(
    (capturedType: PieceType | undefined, color: PieceColor, check: boolean) => {
      capturesRef.current.push(capturedType ? { color, type: capturedType } : null)
      const status = refreshHud()
      if (status.outcome) {
        setBusy(false)
        const winner = status.outcome.kind === 'checkmate' ? status.outcome.winner : null
        sceneRef.current?.celebrateWin(winner)
        play(status.outcome.kind === 'checkmate' ? 'win' : 'draw')
        return
      }
      if (check) play('check')
      const next = engine.turn()
      if (mode === 'solo' && next !== HUMAN) triggerAI()
      else setBusy(false)
    },
    [engine, mode, play, refreshHud, setBusy, triggerAI],
  )

  const executeMove = useCallback(
    (from: Square, to: Square, promotionPiece?: PieceType) => {
      const anim = engine.move(from, to, promotionPiece)
      if (!anim) return
      selectedRef.current = null
      setBusy(true)
      play(anim.captureSquare ? 'capture' : anim.rook ? 'castle' : anim.promotion ? 'promote' : 'move')
      const token = tokenRef.current
      sceneRef.current?.playMove(anim, () => {
        if (token !== tokenRef.current) return
        afterMove(anim.capturedType, anim.color, anim.check)
      })
    },
    [engine, afterMove, play, setBusy],
  )
  useEffect(() => {
    executeRef.current = executeMove
  }, [executeMove])

  const handleSquareTap = useCallback(
    (square: Square) => {
      if (busyRef.current || promotionRef.current) return
      const side = engine.turn()
      const isHumanTurn = mode === 'pass' || side === HUMAN
      if (!isHumanTurn) return

      const sel = selectedRef.current
      if (!sel) {
        const piece = engine.pieceAt(square)
        if (piece && piece.color === side) selectSquare(square)
        return
      }
      if (square === sel) {
        clearSelection()
        return
      }
      const target = engine.legalTargets(sel).find((t) => t.to === square)
      if (target) {
        if (engine.isPromotion(sel, square)) {
          setPromo({ from: sel, to: square })
          clearSelection()
        } else {
          executeMove(sel, square)
        }
        return
      }
      const piece = engine.pieceAt(square)
      if (piece && piece.color === side) selectSquare(square)
      else clearSelection()
    },
    [engine, mode, clearSelection, executeMove, selectSquare, setPromo],
  )

  // Keep the scene's stable tap callback pointed at the latest handler.
  useEffect(() => {
    tapRef.current = handleSquareTap
  }, [handleSquareTap])

  // Build the scene when the board div mounts; tear it down when it unmounts.
  const attachScene = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) {
        const scene = new ChessScene(node, { onSquareTap: (sq) => tapRef.current(sq) })
        sceneRef.current = scene
        scene.setPlacements(engine.placements())
        scene.setAutoRotate(autoRotateRef.current)
      } else {
        sceneRef.current?.dispose()
        sceneRef.current = null
      }
    },
    [engine],
  )

  // Keep the audio engine's mute state in sync.
  useEffect(() => {
    chessAudio.setMuted(muted)
  }, [muted])

  const newGame = useCallback(() => {
    tokenRef.current += 1
    if (aiTimerRef.current) window.clearTimeout(aiTimerRef.current)
    engine.reset()
    capturesRef.current = []
    selectedRef.current = null
    setPromo(null)
    setThinking(false)
    setBusy(false)
    sceneRef.current?.setPlacements(engine.placements())
    refreshHud()
  }, [engine, refreshHud, setBusy, setPromo])

  const undo = useCallback(() => {
    if (busyRef.current) return
    const count = mode === 'solo' ? 2 : 1
    let undone = 0
    for (let i = 0; i < count; i++) {
      if (engine.undo()) undone++
      else break
    }
    if (undone === 0) return
    for (let i = 0; i < undone; i++) capturesRef.current.pop()
    selectedRef.current = null
    setPromo(null)
    sceneRef.current?.setPlacements(engine.placements())
    refreshHud()
  }, [engine, mode, refreshHud, setPromo])

  const flip = useCallback(() => {
    const next = !flippedRef.current
    flippedRef.current = next
    setFlippedState(next)
    sceneRef.current?.setFlipped(next)
  }, [])

  const toggleAutoRotate = useCallback(() => {
    const next = !autoRotateRef.current
    autoRotateRef.current = next
    setAutoRotateState(next)
    sceneRef.current?.setAutoRotate(next)
  }, [])

  const toggleMute = useCallback(() => setMuted((m) => !m), [])

  const setDifficulty = useCallback((d: Difficulty) => setDifficultyState(d), [])

  const choosePromotion = useCallback(
    (type: PieceType) => {
      const p = promotionRef.current
      if (!p) return
      setPromo(null)
      executeMove(p.from, p.to, type)
    },
    [executeMove, setPromo],
  )

  const cancelPromotion = useCallback(() => {
    setPromo(null)
    clearSelection()
  }, [clearSelection, setPromo])

  const advantage =
    captured.w.reduce((s, p) => s + PIECE_VALUE[p], 0) -
    captured.b.reduce((s, p) => s + PIECE_VALUE[p], 0)

  return {
    attachScene,
    mode,
    difficulty,
    turn,
    inCheck,
    outcome,
    history,
    captured,
    advantage,
    busy,
    thinking,
    promotion,
    flipped,
    muted,
    autoRotate,
    canUndo: !busy && history.length > 0,
    newGame,
    undo,
    flip,
    toggleAutoRotate,
    toggleMute,
    setDifficulty,
    choosePromotion,
    cancelPromotion,
  }
}
