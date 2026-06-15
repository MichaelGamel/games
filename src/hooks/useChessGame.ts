/**
 * The orchestration facade for chess — the only place that mixes the rules
 * engine, the AI, the Three.js scene, sound, and (for online play) the shared
 * turn-sequencing core. Components depend on the `ChessController` it returns.
 *
 * Like every other game's controller, it is built on {@link createTurnSequencer}
 * and exposes the structural shape `useOnlineMatch` needs (a phase machine with
 * `players` / `currentPlayerIndex` / `turnCount` / `winnerId` / `finishedOrder`),
 * so the same self-healing online machinery drives chess, Snakes, Ludo, etc.
 *
 * Authoritative state lives in the {@link ChessEngine}; the scene is a pure
 * visual replay. One move is one sequenced `turn`: every client applies the same
 * `{from,to,promotion}` to its in-sync engine and animates the result. White is
 * seat 0 (moves first), Black is seat 1.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChessEngine } from '../chess/engine'
import { chooseMove } from '../chess/ai'
import { chessAudio } from '../chess/audio'
import { ChessScene } from '../chess/three/ChessScene'
import { PIECE_VALUE, TIMING } from '../chess/config'
import { createTurnSequencer } from '../lib/turnSequencer'
import type { MatchDecision } from '../game/types'
import type {
  ChessMode,
  ChessPhase,
  ChessPlayer,
  ChessResolution,
  ChessShared,
  ChessWinReason,
  Difficulty,
  GameOutcome,
  PieceColor,
  PieceType,
  Square,
} from '../chess/types'

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export interface CapturedPieces {
  /** Pieces White has captured (Black men), and vice-versa. */
  w: PieceType[]
  b: PieceType[]
}

/** A player to seat — names/colours supplied by the caller (local) or lineup. */
export interface ChessPlayerSetup {
  name: string
  color: string
  isBot?: boolean
}

export interface ChessNetHooks {
  onLocalTurn?: (resolution: ChessResolution, seq: number) => void
  onOutOfSync?: () => void
}

export interface UseChessGameOptions {
  mode: ChessMode
  difficulty?: Difficulty
  /** Online: this client's seat (0 = White, 1 = Black, -1/undefined = spectator). */
  controlsPlayer?: number | 'all'
  /** Local: players to auto-seat on mount. Online seats come from the lineup. */
  localPlayers?: ChessPlayerSetup[]
  hooks?: ChessNetHooks
}

export interface ChessController {
  attachScene: (node: HTMLDivElement | null) => void
  mode: ChessMode
  difficulty: Difficulty
  // ---- HUD-facing view ----
  phase: ChessPhase
  turn: PieceColor
  inCheck: boolean
  outcome: GameOutcome | null
  history: string[]
  captured: CapturedPieces
  advantage: number
  busy: boolean
  thinking: boolean
  promotion: { from: Square; to: Square } | null
  flipped: boolean
  muted: boolean
  autoRotate: boolean
  canUndo: boolean
  isMyTurn: boolean
  controlsPlayer: number | 'all'
  // ---- HUD actions ----
  newGame: () => void
  undo: () => void
  flip: () => void
  toggleAutoRotate: () => void
  toggleMute: () => void
  choosePromotion: (type: PieceType) => void
  cancelPromotion: () => void
  // ---- OnlineMatchGame<ChessResolution> contract ----
  players: ChessPlayer[]
  currentPlayerIndex: number
  turnCount: number
  winnerId: number | null
  finishedOrder: number[]
  draw: boolean
  winReason: ChessWinReason
  standings: ChessPlayer[]
  lastRoll: number | null
  skipFlash: { playerId: number; nonce: number } | null
  applyRemoteTurn: (resolution: ChessResolution, seq: number) => void
  applySkip: (seq: number) => void
  applyRemoteDecision: (decision: MatchDecision, seq: number) => void
  applyRemoteStart: (players: { name: string; color: string }[], rules?: unknown) => void
  applyRemoteReset: () => void
  addPlayer: (player: { name: string; color: string }) => void
  forfeitWin: (winnerId: number) => void
  syncStatus: () => { seq: number; busy: boolean }
  buildShared: () => ChessShared
  // ---- room helpers ----
  startGame: (players: ChessPlayerSetup[]) => void
  loadSnapshot: (snap: {
    players: { name: string; color: string }[]
    shared: ChessShared
    currentPlayerIndex: number
    finishedOrder: number[]
    ended: boolean
    turnCount: number
  }) => void
  /** Current FEN — the per-seat snapshot/heartbeat payload. */
  fen: string
}

export function useChessGame(opts: UseChessGameOptions): ChessController {
  const { mode } = opts
  const [engine] = useState(() => new ChessEngine())
  const [sequencer] = useState(() => createTurnSequencer<ChessResolution>())

  const sceneRef = useRef<ChessScene | null>(null)
  const tapRef = useRef<(square: Square) => void>(() => {})

  // Sync-critical refs (read inside event/async callbacks, no render lag).
  const phaseRef = useRef<ChessPhase>('setup')
  const currentSeatRef = useRef(0)
  const turnCountRef = useRef(0)
  const selectedRef = useRef<Square | null>(null)
  const promotionRef = useRef<{ from: Square; to: Square } | null>(null)
  const capturesRef = useRef<Array<{ color: PieceColor; type: PieceType } | null>>([])
  // SAN move list, kept in a ref so it survives a FEN-based snapshot load (which
  // resets chess.js's own history).
  const historyRef = useRef<string[]>([])
  const winnerIdRef = useRef<number | null>(null)
  const autoRotateRef = useRef(false)
  const flippedRef = useRef(false)
  const botTokenRef = useRef(0)
  const difficultyRef = useRef<Difficulty>(opts.difficulty ?? 'medium')
  const hooksRef = useRef(opts.hooks)
  const controlsRef = useRef<number | 'all'>(opts.controlsPlayer ?? (mode === 'pass' ? 'all' : 0))

  // HUD mirrors.
  const [phase, setPhase] = useState<ChessPhase>('setup')
  const [players, setPlayers] = useState<ChessPlayer[]>([])
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0)
  const [turnCount, setTurnCount] = useState(0)
  const [inCheck, setInCheck] = useState(false)
  const [outcome, setOutcome] = useState<GameOutcome | null>(null)
  const [winnerId, setWinnerId] = useState<number | null>(null)
  const [finishedOrder, setFinishedOrder] = useState<number[]>([])
  const [draw, setDraw] = useState(false)
  const [winReason, setWinReason] = useState<ChessWinReason>(null)
  const [history, setHistory] = useState<string[]>([])
  const [captured, setCaptured] = useState<CapturedPieces>({ w: [], b: [] })
  const [promotion, setPromotionState] = useState<{ from: Square; to: Square } | null>(null)
  const [flipped, setFlippedState] = useState(false)
  const [muted, setMuted] = useState(false)
  const [autoRotate, setAutoRotateState] = useState(false)
  const [fen, setFen] = useState(() => engine.fen())

  const controlsPlayer = opts.controlsPlayer ?? (mode === 'pass' ? 'all' : 0)

  useEffect(() => {
    difficultyRef.current = opts.difficulty ?? 'medium'
    hooksRef.current = opts.hooks
    controlsRef.current = controlsPlayer
  })

  const setPromo = useCallback((v: { from: Square; to: Square } | null) => {
    promotionRef.current = v
    setPromotionState(v)
  }, [])

  const play = useCallback((sound: Parameters<typeof chessAudio.play>[0]) => {
    chessAudio.play(sound)
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

  // ---- the heart: animate + commit one move (local and remote share this) ---

  const applyEnd = useCallback(
    (result: GameOutcome) => {
      let wId: number | null = null
      let fin: number[]
      let dr = false
      let reason: ChessWinReason = null
      if (result.kind === 'checkmate') {
        wId = result.winner === 'w' ? 0 : 1
        fin = [wId, wId === 0 ? 1 : 0]
        reason = 'mate'
      } else {
        dr = true
        fin = [0, 1]
      }
      winnerIdRef.current = wId
      setWinnerId(wId)
      setFinishedOrder(fin)
      setDraw(dr)
      setWinReason(reason)
      setOutcome(result)
      phaseRef.current = 'won'
      setPhase('won')
      sceneRef.current?.celebrateWin(wId != null ? (wId === 0 ? 'w' : 'b') : null)
      play(result.kind === 'checkmate' ? 'win' : 'draw')
    },
    [play],
  )

  const executeTurn = useCallback(
    async (resolution: ChessResolution, alive: () => boolean) => {
      const anim = engine.move(resolution.from, resolution.to, resolution.promotion)
      if (!anim) return // illegal ⇒ out of sync; committedCount stalls ⇒ onOutOfSync
      phaseRef.current = 'moving'
      setPhase('moving')
      selectedRef.current = null
      sceneRef.current?.setSelection(null)
      sceneRef.current?.playMove(anim)
      play(anim.captureSquare ? 'capture' : anim.rook ? 'castle' : anim.promotion ? 'promote' : 'move')

      const dur = anim.type === 'n' ? TIMING.knightHop : TIMING.move
      await delay(dur * 1000)
      if (!alive()) return

      // Commit: advance the sequence and refresh every view from the engine.
      capturesRef.current.push(
        anim.capturedType ? { color: anim.color, type: anim.capturedType } : null,
      )
      turnCountRef.current += 1
      const status = engine.status()
      const seat = status.turn === 'w' ? 0 : 1
      currentSeatRef.current = seat
      setCurrentPlayerIndex(seat)
      setTurnCount(turnCountRef.current)
      setInCheck(status.inCheck)
      historyRef.current = [...historyRef.current, anim.san]
      setHistory(historyRef.current)
      setCaptured(deriveCaptured())
      setFen(engine.fen())
      sceneRef.current?.setCheck(status.checkSquare ?? null)

      if (status.outcome) {
        applyEnd(status.outcome)
      } else {
        setOutcome(null)
        phaseRef.current = 'idle'
        setPhase('idle')
        if (status.inCheck) play('check')
      }
    },
    [engine, play, deriveCaptured, applyEnd],
  )

  // Run a locally-initiated move through the sequencer (broadcast + animate).
  const runLocalTurn = useCallback(
    (resolution: ChessResolution) => {
      if (!sequencer.acquireTurnLock()) return
      void (async () => {
        try {
          hooksRef.current?.onLocalTurn?.(resolution, sequencer.claimSeq())
          await executeTurn(resolution, sequencer.beginRun())
        } finally {
          sequencer.releaseTurnLock()
        }
      })()
    },
    [sequencer, executeTurn],
  )

  const isControllable = (seat: number) =>
    controlsRef.current === 'all' || controlsRef.current === seat

  const handleSquareTap = useCallback(
    (square: Square) => {
      if (phaseRef.current !== 'idle' || promotionRef.current) return
      const seat = currentSeatRef.current
      if (!isControllable(seat)) return
      const side: PieceColor = seat === 0 ? 'w' : 'b'

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
          runLocalTurn({ from: sel, to: square })
        }
        return
      }
      const piece = engine.pieceAt(square)
      if (piece && piece.color === side) selectSquare(square)
      else clearSelection()
    },
    [engine, clearSelection, selectSquare, setPromo, runLocalTurn],
  )

  useEffect(() => {
    tapRef.current = handleSquareTap
  }, [handleSquareTap])

  // ---- match lifecycle ------------------------------------------------------

  const startGame = useCallback(
    (setup: ChessPlayerSetup[]) => {
      botTokenRef.current += 1
      engine.reset()
      sequencer.rebase(0)
      turnCountRef.current = 0
      capturesRef.current = []
      selectedRef.current = null
      winnerIdRef.current = null
      setPromo(null)
      setPlayers(
        setup.slice(0, 2).map((p, i) => ({ id: i, name: p.name, color: p.color, isBot: p.isBot ?? false })),
      )
      currentSeatRef.current = 0
      setCurrentPlayerIndex(0)
      setTurnCount(0)
      setWinnerId(null)
      setFinishedOrder([])
      setDraw(false)
      setWinReason(null)
      setOutcome(null)
      setInCheck(false)
      historyRef.current = []
      setHistory([])
      setCaptured({ w: [], b: [] })
      setFen(engine.fen())
      phaseRef.current = 'idle'
      setPhase('idle')
      sceneRef.current?.setPlacements(engine.placements())
      sceneRef.current?.setCheck(null)
    },
    [engine, sequencer, setPromo],
  )

  const playersRef = useRef<ChessPlayer[]>([])
  useEffect(() => {
    playersRef.current = players
  })

  const reset = useCallback(() => {
    botTokenRef.current += 1
    engine.reset()
    sequencer.rebase(0)
    turnCountRef.current = 0
    capturesRef.current = []
    selectedRef.current = null
    winnerIdRef.current = null
    setPromo(null)
    setPlayers([])
    currentSeatRef.current = 0
    setCurrentPlayerIndex(0)
    setTurnCount(0)
    setWinnerId(null)
    setFinishedOrder([])
    setDraw(false)
    setWinReason(null)
    setOutcome(null)
    setInCheck(false)
    historyRef.current = []
    setHistory([])
    setCaptured({ w: [], b: [] })
    setFen(engine.fen())
    phaseRef.current = 'setup'
    setPhase('setup')
    sceneRef.current?.setPlacements(engine.placements())
    sceneRef.current?.setCheck(null)
  }, [engine, sequencer, setPromo])

  const applyRemoteStart = useCallback(
    (lineup: { name: string; color: string }[]) => startGame(lineup),
    [startGame],
  )

  const loadSnapshot = useCallback<ChessController['loadSnapshot']>(
    (snap) => {
      botTokenRef.current += 1
      engine.load(snap.shared.fen)
      sequencer.rebase(snap.turnCount)
      turnCountRef.current = snap.turnCount
      capturesRef.current = snap.shared.captures ?? []
      selectedRef.current = null
      setPromo(null)
      setPlayers(
        snap.players.slice(0, 2).map((p, i) => ({ id: i, name: p.name, color: p.color, isBot: false })),
      )
      const status = engine.status()
      const seat = status.turn === 'w' ? 0 : 1
      currentSeatRef.current = seat
      setCurrentPlayerIndex(seat)
      setTurnCount(snap.turnCount)
      historyRef.current = snap.shared.history ?? []
      setHistory(historyRef.current)
      setCaptured(deriveCaptured())
      setFen(engine.fen())
      setInCheck(status.inCheck)
      winnerIdRef.current = snap.shared.winnerId
      setWinnerId(snap.shared.winnerId)
      setFinishedOrder(snap.finishedOrder)
      setDraw(snap.shared.draw)
      setWinReason(snap.shared.winReason)
      setOutcome(status.outcome ?? null)
      phaseRef.current = snap.ended ? 'won' : 'idle'
      setPhase(snap.ended ? 'won' : 'idle')
      sceneRef.current?.setPlacements(engine.placements())
      sceneRef.current?.setCheck(status.checkSquare ?? null)
    },
    [engine, sequencer, setPromo, deriveCaptured],
  )

  const forfeitWin = useCallback(
    (winner: number) => {
      if (phaseRef.current === 'setup' || phaseRef.current === 'won') return
      const other = winner === 0 ? 1 : 0
      winnerIdRef.current = winner
      setWinnerId(winner)
      setFinishedOrder([winner, other])
      setDraw(false)
      setWinReason('forfeit')
      setOutcome(null)
      phaseRef.current = 'won'
      setPhase('won')
      sceneRef.current?.celebrateWin(winner === 0 ? 'w' : 'b')
      play('win')
    },
    [play],
  )

  // ---- remote events --------------------------------------------------------

  const applyRemoteTurn = useCallback(
    (resolution: ChessResolution, seq: number) => {
      sequencer.accept({ kind: 'turn', resolution }, seq)
    },
    [sequencer],
  )
  // 2-player chess never skips (forfeit covers a leaver; the idle timer is off),
  // but the contract needs the handler.
  const applySkip = useCallback((seq: number) => {
    void seq
  }, [])
  const applyRemoteDecision = useCallback((decision: MatchDecision, seq: number) => {
    void decision
    void seq
  }, [])
  const applyRemoteReset = reset
  const addPlayer = useCallback((player: { name: string; color: string }) => {
    void player
  }, [])

  const syncStatus = useCallback(
    () => ({ seq: sequencer.seq, busy: sequencer.busy() }),
    [sequencer],
  )

  // The full game-global state for an online snapshot's `shared` blob, so a late
  // joiner / resync rebuilds the whole match (position, move list, captures,
  // result) — not just the per-seat FEN.
  const buildShared = useCallback(
    (): ChessShared => ({
      fen: engine.fen(),
      history: [...historyRef.current],
      captures: [...capturesRef.current],
      winnerId: winnerIdRef.current,
      draw,
      winReason,
    }),
    [engine, draw, winReason],
  )

  // Wire the sequencer to this render's handlers.
  useEffect(() => {
    sequencer.update({
      executeTurn,
      executeSkip: () => {},
      executeDecision: () => {},
      committedCount: () => turnCountRef.current,
      onOutOfSync: () => hooksRef.current?.onOutOfSync?.(),
    })
  })

  // ---- computer opponent (local solo only) ----------------------------------

  const botSeatToMove =
    mode === 'solo' && phase === 'idle' && currentPlayerIndex === 1 && !outcome
  useEffect(() => {
    if (!botSeatToMove) return
    const token = ++botTokenRef.current
    const timer = setTimeout(() => {
      if (token !== botTokenRef.current) return
      if (phaseRef.current !== 'idle' || currentSeatRef.current !== 1) return
      const intent = chooseMove(engine.fen(), difficultyRef.current)
      if (intent) runLocalTurn(intent)
    }, TIMING.aiThink * 1000)
    return () => clearTimeout(timer)
  }, [botSeatToMove, engine, runLocalTurn])

  // ---- scene mount + local auto-start ---------------------------------------

  const attachScene = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) {
        const scene = new ChessScene(node, { onSquareTap: (sq) => tapRef.current(sq) })
        sceneRef.current = scene
        scene.setPlacements(engine.placements())
        scene.setAutoRotate(autoRotateRef.current)
        scene.setFlipped(flippedRef.current)
        const status = engine.status()
        scene.setCheck(status.checkSquare ?? null)
      } else {
        sceneRef.current?.dispose()
        sceneRef.current = null
      }
    },
    [engine],
  )

  // Local modes seat themselves once on mount; online seats come from the room.
  const localPlayersRef = useRef(opts.localPlayers)
  useEffect(() => {
    if (mode !== 'online' && localPlayersRef.current) startGame(localPlayersRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    chessAudio.setMuted(muted)
  }, [muted])

  // ---- HUD actions ----------------------------------------------------------

  const newGame = useCallback(() => {
    startGame(playersRef.current.map((p) => ({ name: p.name, color: p.color, isBot: p.isBot })))
  }, [startGame])

  const undo = useCallback(() => {
    if (mode === 'online' || phaseRef.current === 'moving' || phaseRef.current === 'setup') return
    const count = mode === 'solo' ? 2 : 1
    let undone = 0
    for (let i = 0; i < count; i++) {
      if (engine.undo()) undone++
      else break
    }
    if (undone === 0) return
    botTokenRef.current += 1
    for (let i = 0; i < undone; i++) capturesRef.current.pop()
    turnCountRef.current = Math.max(0, turnCountRef.current - undone)
    sequencer.rebase(turnCountRef.current)
    selectedRef.current = null
    setPromo(null)
    const status = engine.status()
    const seat = status.turn === 'w' ? 0 : 1
    currentSeatRef.current = seat
    setCurrentPlayerIndex(seat)
    setTurnCount(turnCountRef.current)
    setInCheck(status.inCheck)
    historyRef.current = historyRef.current.slice(0, Math.max(0, historyRef.current.length - undone))
    setHistory(historyRef.current)
    setCaptured(deriveCaptured())
    setFen(engine.fen())
    setOutcome(null)
    winnerIdRef.current = null
    setWinnerId(null)
    setFinishedOrder([])
    setDraw(false)
    setWinReason(null)
    phaseRef.current = 'idle'
    setPhase('idle')
    sceneRef.current?.setPlacements(engine.placements())
    sceneRef.current?.setCheck(status.checkSquare ?? null)
  }, [mode, engine, sequencer, setPromo, deriveCaptured])

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

  const choosePromotion = useCallback(
    (type: PieceType) => {
      const p = promotionRef.current
      if (!p) return
      setPromo(null)
      runLocalTurn({ from: p.from, to: p.to, promotion: type })
    },
    [runLocalTurn, setPromo],
  )

  const cancelPromotion = useCallback(() => {
    setPromo(null)
    clearSelection()
  }, [clearSelection, setPromo])

  // ---- derived view ---------------------------------------------------------

  const advantage =
    captured.w.reduce((s, p) => s + PIECE_VALUE[p], 0) -
    captured.b.reduce((s, p) => s + PIECE_VALUE[p], 0)
  const thinking = mode === 'solo' && phase === 'idle' && currentPlayerIndex === 1 && !outcome
  const isMyTurn =
    phase === 'idle' && (controlsPlayer === 'all' || controlsPlayer === currentPlayerIndex)
  const standings = finishedOrder.map((id) => players[id]).filter((p): p is ChessPlayer => p != null)

  return {
    attachScene,
    mode,
    difficulty: opts.difficulty ?? 'medium',
    phase,
    turn: currentPlayerIndex === 0 ? 'w' : 'b',
    inCheck,
    outcome,
    history,
    captured,
    advantage,
    busy: phase === 'moving',
    thinking,
    promotion,
    flipped,
    muted,
    autoRotate,
    canUndo: mode !== 'online' && phase === 'idle' && history.length > 0,
    isMyTurn,
    controlsPlayer,
    newGame,
    undo,
    flip,
    toggleAutoRotate,
    toggleMute,
    choosePromotion,
    cancelPromotion,
    players,
    currentPlayerIndex,
    turnCount,
    winnerId,
    finishedOrder,
    draw,
    winReason,
    standings,
    lastRoll: null,
    skipFlash: null,
    applyRemoteTurn,
    applySkip,
    applyRemoteDecision,
    applyRemoteStart,
    applyRemoteReset,
    addPlayer,
    forfeitWin,
    syncStatus,
    buildShared,
    startGame,
    loadSnapshot,
    fen,
  }
}
