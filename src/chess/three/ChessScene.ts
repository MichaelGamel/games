/**
 * The 3D chess renderer — an imperative Three.js scene the React layer mounts
 * once and drives through a small command surface. It owns *everything* visual:
 * the floating amethyst board, the procedurally-built pieces, orbit camera,
 * lighting, raycast picking, and every animation (gliding moves, leaping
 * knights, shattering captures, promotions, the check pulse, and the
 * checkmate topple). It computes no chess rules — it only replays the
 * {@link MoveAnimation} records the engine hands it.
 *
 * Coordinate frame: one square is 1 world unit; the board's top surface is the
 * y = 0 plane; pieces stand on it and grow upward. Tiles, frame, pieces and
 * markers all live inside `boardGroup`, so flipping the board is a single group
 * rotation — picking still works because the raycaster runs in world space.
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { DIMS, PALETTE, TIMING } from '../config'
import type { MoveAnimation, PieceColor, PiecePlacement, PieceType, Square } from '../types'
import { buildPieceMeshes } from './pieceGeometry'
import { frameMaterial, glowMaterial, pieceMaterial, tileMaterial } from './materials'
import { createBurst, createMotes, createStarfield, type Effect } from './effects'

export interface ChessSceneCallbacks {
  onSquareTap: (square: Square) => void
}

interface Piece {
  group: THREE.Group
  color: PieceColor
  type: PieceType
  square: Square
  material: THREE.MeshPhysicalMaterial
  baseEmissive: THREE.Color
  baseEmissiveIntensity: number
}

interface Anim {
  update: (dt: number) => boolean
}

interface Marker {
  mesh: THREE.Mesh
  baseScale: number
  phase: number
}

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

export class ChessScene {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly controls: OrbitControls
  private readonly timer = new THREE.Timer()
  private readonly raycaster = new THREE.Raycaster()

  private readonly boardGroup = new THREE.Group()
  private readonly piecesGroup = new THREE.Group()
  private readonly markersGroup = new THREE.Group()
  private readonly starfield: THREE.Points
  private readonly motes: THREE.Points

  private readonly tiles: THREE.Mesh[] = []
  private readonly pieces = new Map<Square, Piece>()
  private readonly animating = new Set<Piece>()
  private anims: Anim[] = []
  private effects: Effect[] = []
  private markers: Marker[] = []

  private selected: Piece | null = null
  private selectionRing: THREE.Mesh | null = null
  private checkPiece: Piece | null = null
  private checkRing: THREE.Mesh | null = null

  private flipped = false
  private celebrating = false
  /** Idle camera auto-orbit. Off by default — opt-in via {@link setAutoRotate}. */
  private autoRotateEnabled = false
  private time = 0
  private lastInteract = 0
  private raf = 0
  private readonly reduceMotion: boolean
  private readonly resizeObserver: ResizeObserver
  private pointerDown: { x: number; y: number; t: number } | null = null
  private disposed = false

  private readonly container: HTMLElement
  private readonly callbacks: ChessSceneCallbacks

  constructor(container: HTMLElement, callbacks: ChessSceneCallbacks) {
    this.container = container
    this.callbacks = callbacks
    this.reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

    const width = container.clientWidth || 1
    const height = container.clientHeight || 1

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(width, height)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.touchAction = 'none'
    container.appendChild(this.renderer.domElement)

    this.scene.fog = new THREE.Fog(PALETTE.fog, 16, 42)

    this.camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 200)
    this.camera.position.set(0, 9, 9.6)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.enablePan = false
    this.controls.minDistance = 7.5
    this.controls.maxDistance = 22
    this.controls.minPolarAngle = 0.18
    this.controls.maxPolarAngle = 1.42
    this.controls.rotateSpeed = 0.85
    this.controls.autoRotateSpeed = 0.55
    this.controls.target.set(0, 0.4, 0)
    this.controls.addEventListener('start', () => (this.lastInteract = this.time))

    this.scene.add(this.boardGroup)
    this.boardGroup.add(this.piecesGroup)
    this.boardGroup.add(this.markersGroup)

    this.buildLights()
    this.buildBoard()
    this.buildFloor()
    this.starfield = createStarfield()
    this.scene.add(this.starfield)
    this.motes = createMotes()
    this.scene.add(this.motes)

    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)

    this.raf = requestAnimationFrame(this.tick)
  }

  // ---- scene construction -------------------------------------------------

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x9a86e8, 0x140a26, 0.55))

    const key = new THREE.DirectionalLight(PALETTE.keyLight, 1.6)
    key.position.set(5, 12.5, 7)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.camera.near = 0.5
    key.shadow.camera.far = 40
    key.shadow.camera.left = -8
    key.shadow.camera.right = 8
    key.shadow.camera.top = 8
    key.shadow.camera.bottom = -8
    key.shadow.bias = -0.0005
    key.shadow.normalBias = 0.02
    this.scene.add(key)
    this.scene.add(key.target)

    const violet = new THREE.PointLight(PALETTE.rimViolet, 90, 45, 2)
    violet.position.set(-8, 6, -6)
    this.scene.add(violet)
    const cyan = new THREE.PointLight(PALETTE.rimCyan, 70, 45, 2)
    cyan.position.set(8, 5, 8)
    this.scene.add(cyan)
  }

  private buildBoard() {
    // A glowing base plate the inter-tile seams reveal.
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(8.05, 0.3, 8.05),
      new THREE.MeshStandardMaterial({
        color: PALETTE.seam,
        emissive: new THREE.Color(PALETTE.frameTrim),
        emissiveIntensity: 0.35,
        roughness: 0.4,
        metalness: 0.3,
      }),
    )
    plate.position.y = -0.17
    plate.receiveShadow = true
    this.boardGroup.add(plate)

    const lightMat = tileMaterial(true)
    const darkMat = tileMaterial(false)
    const tileGeo = new THREE.BoxGeometry(DIMS.tile, DIMS.tileHeight, DIMS.tile)
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const isLight = (rank + file) % 2 === 1
        const tile = new THREE.Mesh(tileGeo, isLight ? lightMat : darkMat)
        tile.receiveShadow = true
        const square = `${'abcdefgh'[file]}${rank + 1}` as Square
        tile.userData.square = square
        const p = this.squareToLocal(square)
        tile.position.set(p.x, -DIMS.tileHeight / 2, p.z)
        this.tiles.push(tile)
        this.boardGroup.add(tile)
      }
    }

    // Bevelled frame ringing the board.
    const fMat = frameMaterial()
    const fw = DIMS.frameWidth
    const fh = 0.34
    const outer = 4 + fw / 2
    const span = 8 + fw * 2
    const bars: [number, number, number, number, number][] = [
      [span, fh, fw, 0, outer],
      [span, fh, fw, 0, -outer],
    ]
    for (const [w, h, d, x, z] of bars) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), fMat)
      bar.position.set(x, -0.1, z)
      bar.castShadow = true
      bar.receiveShadow = true
      this.boardGroup.add(bar)
    }
    for (const z of [0]) {
      for (const x of [outer, -outer]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 8 + fw * 2), fMat)
        bar.position.set(x, -0.1, z)
        bar.castShadow = true
        bar.receiveShadow = true
        this.boardGroup.add(bar)
      }
    }
  }

  private buildFloor() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 140),
      new THREE.MeshStandardMaterial({
        color: PALETTE.floor,
        roughness: 0.5,
        metalness: 0.45,
      }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.28
    floor.receiveShadow = true
    this.scene.add(floor)

    // A soft violet pool under the board for a "magic table" glow.
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(8, 48),
      glowMaterial(PALETTE.rimViolet, 0.18),
    )
    pool.rotation.x = -Math.PI / 2
    pool.position.y = -0.27
    this.scene.add(pool)
  }

  // ---- coordinates --------------------------------------------------------

  private squareToLocal(square: Square): THREE.Vector3 {
    const file = square.charCodeAt(0) - 97
    const rank = Number(square[1]) - 1
    return new THREE.Vector3((file - 3.5) * DIMS.square, 0, (3.5 - rank) * DIMS.square)
  }

  // ---- public command surface --------------------------------------------

  /** Replace the whole board with a new position, no animation (new game/undo). */
  setPlacements(placements: PiecePlacement[]) {
    this.clearAll()
    for (const p of placements) this.addPiece(p)
  }

  /** Highlight a selected piece and its legal destinations. */
  setSelection(square: Square | null, targets: { to: Square; capture: boolean }[] = []) {
    this.clearMarkers()
    this.selected = square ? this.pieces.get(square) ?? null : null
    if (!this.selected) return

    const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.46, 40), glowMaterial(PALETTE.select))
    ring.rotation.x = -Math.PI / 2
    const sp = this.squareToLocal(square!)
    ring.position.set(sp.x, 0.012, sp.z)
    this.selectionRing = ring
    this.markersGroup.add(ring)

    for (const t of targets) {
      const tp = this.squareToLocal(t.to)
      const mesh = t.capture
        ? new THREE.Mesh(new THREE.RingGeometry(0.32, 0.44, 36), glowMaterial(PALETTE.capture, 0.9))
        : new THREE.Mesh(new THREE.CircleGeometry(0.16, 28), glowMaterial(PALETTE.move, 0.8))
      mesh.rotation.x = -Math.PI / 2
      mesh.position.set(tp.x, 0.012, tp.z)
      this.markersGroup.add(mesh)
      this.markers.push({ mesh, baseScale: 1, phase: Math.random() * Math.PI * 2 })
    }
  }

  /** Mark (or clear) the king in check, with a red pulse + warning ring. */
  setCheck(square: Square | null) {
    if (this.checkPiece) {
      this.checkPiece.material.emissive.copy(this.checkPiece.baseEmissive)
      this.checkPiece.material.emissiveIntensity = this.checkPiece.baseEmissiveIntensity
      this.checkPiece = null
    }
    if (this.checkRing) {
      this.markersGroup.remove(this.checkRing)
      this.disposeMesh(this.checkRing)
      this.checkRing = null
    }
    if (!square) return
    const piece = this.pieces.get(square)
    if (!piece) return
    this.checkPiece = piece
    piece.material.emissive.set(PALETTE.check)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.5, 40), glowMaterial(PALETTE.check, 0.9))
    ring.rotation.x = -Math.PI / 2
    const p = this.squareToLocal(square)
    ring.position.set(p.x, 0.014, p.z)
    this.checkRing = ring
    this.markersGroup.add(ring)
  }

  /** Animate a fully-resolved move; optional `onDone` fires when the mover lands.
   *  (The controller commits on its own timer, so `onDone` is usually omitted.) */
  playMove(anim: MoveAnimation, onDone?: () => void) {
    this.lastInteract = this.time
    this.setSelection(null)
    const mover = this.pieces.get(anim.from)
    if (!mover) {
      onDone?.()
      return
    }
    this.pieces.delete(anim.from)

    if (anim.captureSquare) this.animateCapture(anim.captureSquare)
    if (anim.rook) this.animateSlide(anim.rook.from, anim.rook.to, 0.12)

    const fromV = this.squareToLocal(anim.from)
    const toV = this.squareToLocal(anim.to)
    const isKnight = mover.type === 'n'
    const arc = isKnight ? TIMING.knightArcHeight : TIMING.arcHeight
    const dur = isKnight ? TIMING.knightHop : TIMING.move

    this.animating.add(mover)
    this.anims.push(
      this.tween(dur, (t) => {
        const e = easeInOutCubic(t)
        mover.group.position.x = fromV.x + (toV.x - fromV.x) * e
        mover.group.position.z = fromV.z + (toV.z - fromV.z) * e
        mover.group.position.y = Math.sin(Math.PI * t) * arc
      }, () => {
        mover.group.position.set(toV.x, 0, toV.z)
        this.animating.delete(mover)
        this.pieces.set(anim.to, mover)
        mover.square = anim.to
        if (anim.promotion) this.promote(mover, anim.promotion, toV)
        onDone?.()
      }),
    )
  }

  /** Flip the board 180° so the other player faces the camera. */
  setFlipped(flipped: boolean) {
    if (flipped === this.flipped) return
    this.flipped = flipped
    const from = this.boardGroup.rotation.y
    const to = flipped ? Math.PI : 0
    this.anims.push(
      this.tween(this.reduceMotion ? 0.01 : TIMING.flip, (t) => {
        this.boardGroup.rotation.y = from + (to - from) * easeInOutCubic(t)
      }),
    )
  }

  /** Toggle the idle camera auto-orbit (off by default). */
  setAutoRotate(enabled: boolean) {
    this.autoRotateEnabled = enabled
    // Re-arm the idle delay so it doesn't snap into motion the instant it's on.
    this.lastInteract = this.time
  }

  /** Celebrate the end of the game: topple the loser, shower the winner. */
  celebrateWin(winner: PieceColor | null) {
    this.celebrating = true
    this.setCheck(null)
    if (winner) {
      const loser = winner === 'w' ? 'b' : 'w'
      for (const piece of this.pieces.values()) {
        if (piece.type === 'k' && piece.color === loser) {
          const from = piece.group.rotation.x
          this.anims.push(
            this.tween(1.4, (t) => {
              const e = easeOutCubic(Math.min(1, t * 1.1))
              piece.group.rotation.x = from + (Math.PI / 2) * e
              piece.group.position.y = Math.sin(Math.PI * Math.min(1, t)) * 0.12
            }),
          )
        }
      }
    }
    const color = winner ? PALETTE.victory : PALETTE.rimCyan
    for (let i = 0; i < 5; i++) {
      const x = (Math.random() - 0.5) * 7
      const z = (Math.random() - 0.5) * 7
      this.spawnBurst(new THREE.Vector3(x, 0.5, z), color, {
        count: 60,
        speed: 5,
        spread: 0.7,
        upward: 1.2,
        gravity: 4,
        duration: 1.6,
        size: 0.3,
      })
    }
  }

  resize() {
    if (this.disposed) return
    const width = this.container.clientWidth || 1
    const height = this.container.clientHeight || 1
    this.renderer.setSize(width, height)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.resizeObserver.disconnect()
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp)
    this.controls.dispose()
    this.clearAll()
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const mat = (mesh as THREE.Mesh).material
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else if (mat) mat.dispose()
    })
    this.renderer.dispose()
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }

  // ---- piece + animation internals ---------------------------------------

  private addPiece(p: PiecePlacement) {
    const material = pieceMaterial(p.color)
    const group = new THREE.Group()
    for (const mesh of buildPieceMeshes(p.type, material)) group.add(mesh)
    group.scale.setScalar(DIMS.pieceScale)
    if (p.type === 'n' && p.color === 'b') group.rotation.y = Math.PI
    const pos = this.squareToLocal(p.square)
    group.position.set(pos.x, 0, pos.z)
    this.piecesGroup.add(group)
    this.pieces.set(p.square, {
      group,
      color: p.color,
      type: p.type,
      square: p.square,
      material,
      baseEmissive: material.emissive.clone(),
      baseEmissiveIntensity: material.emissiveIntensity,
    })
  }

  private animateCapture(square: Square) {
    const cap = this.pieces.get(square)
    if (!cap) return
    this.pieces.delete(square)
    this.animating.add(cap)
    cap.material.transparent = true
    const burstColor = cap.color === 'w' ? 0xffe8b0 : 0xbf9bff
    this.spawnBurst(new THREE.Vector3(...cap.group.position.toArray()).setY(0.45), burstColor, {
      count: 40,
      speed: 3,
      spread: 0.8,
      upward: 0.6,
    })
    this.anims.push(
      this.tween(TIMING.capture, (t) => {
        const s = DIMS.pieceScale * (1 - easeOutCubic(t))
        cap.group.scale.setScalar(Math.max(0.0001, s))
        cap.group.rotation.y += 0.3
        cap.group.position.y = t * 0.7
        cap.material.opacity = 1 - t
      }, () => {
        this.piecesGroup.remove(cap.group)
        this.disposePiece(cap)
        this.animating.delete(cap)
      }),
    )
  }

  private animateSlide(from: Square, to: Square, arc: number) {
    const piece = this.pieces.get(from)
    if (!piece) return
    this.pieces.delete(from)
    const fromV = this.squareToLocal(from)
    const toV = this.squareToLocal(to)
    this.animating.add(piece)
    this.anims.push(
      this.tween(TIMING.move, (t) => {
        const e = easeInOutCubic(t)
        piece.group.position.x = fromV.x + (toV.x - fromV.x) * e
        piece.group.position.z = fromV.z + (toV.z - fromV.z) * e
        piece.group.position.y = Math.sin(Math.PI * t) * arc
      }, () => {
        piece.group.position.set(toV.x, 0, toV.z)
        this.animating.delete(piece)
        this.pieces.set(to, piece)
        piece.square = to
      }),
    )
  }

  private promote(piece: Piece, type: PieceType, at: THREE.Vector3) {
    for (const child of [...piece.group.children]) {
      piece.group.remove(child)
      const mesh = child as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
    }
    for (const mesh of buildPieceMeshes(type, piece.material)) piece.group.add(mesh)
    piece.type = type
    piece.group.rotation.y = type === 'n' && piece.color === 'b' ? Math.PI : 0
    this.spawnBurst(new THREE.Vector3(at.x, 0.6, at.z), PALETTE.victory, {
      count: 70,
      speed: 4,
      spread: 0.45,
      upward: 1.4,
      gravity: 3,
      duration: 1.3,
      size: 0.26,
    })
  }

  private spawnBurst(origin: THREE.Vector3, color: number, opts: Parameters<typeof createBurst>[2]) {
    if (this.reduceMotion) return
    const effect = createBurst(origin, color, opts)
    this.effects.push(effect)
    this.boardGroup.add(effect.object3d)
  }

  private tween(duration: number, onUpdate: (t: number) => void, onDone?: () => void): Anim {
    let elapsed = 0
    return {
      update: (dt: number) => {
        elapsed += dt
        const t = Math.min(1, elapsed / duration)
        onUpdate(t)
        if (t >= 1) {
          onDone?.()
          return false
        }
        return true
      },
    }
  }

  // ---- cleanup helpers ----------------------------------------------------

  private clearMarkers() {
    if (this.selectionRing) {
      this.markersGroup.remove(this.selectionRing)
      this.disposeMesh(this.selectionRing)
      this.selectionRing = null
    }
    for (const m of this.markers) {
      this.markersGroup.remove(m.mesh)
      this.disposeMesh(m.mesh)
    }
    this.markers = []
  }

  private clearAll() {
    this.anims = []
    for (const e of this.effects) {
      this.boardGroup.remove(e.object3d)
      e.dispose()
    }
    this.effects = []
    this.clearMarkers()
    this.setCheck(null)
    this.selected = null
    this.celebrating = false
    this.animating.clear()
    for (const piece of this.pieces.values()) {
      this.piecesGroup.remove(piece.group)
      this.disposePiece(piece)
    }
    this.pieces.clear()
    this.boardGroup.rotation.y = this.flipped ? Math.PI : 0
  }

  private disposePiece(piece: Piece) {
    piece.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
    })
    piece.material.dispose()
  }

  private disposeMesh(mesh: THREE.Mesh) {
    mesh.geometry.dispose()
    const mat = mesh.material
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
    else mat.dispose()
  }

  // ---- picking ------------------------------------------------------------

  private onPointerDown = (e: PointerEvent) => {
    this.pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() }
  }

  private onPointerUp = (e: PointerEvent) => {
    const down = this.pointerDown
    this.pointerDown = null
    if (!down) return
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
    if (moved > 8 || performance.now() - down.t > 500) return // a drag, not a tap

    const rect = this.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(ndc, this.camera)
    const hit = this.raycaster.intersectObjects(this.tiles, false)[0]
    if (hit) this.callbacks.onSquareTap(hit.object.userData.square as Square)
  }

  // ---- frame loop ---------------------------------------------------------

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick)
    this.timer.update()
    const dt = Math.min(this.timer.getDelta(), 0.05) // clamp big gaps (backgrounded tab)
    this.time += dt

    this.anims = this.anims.filter((a) => a.update(dt))
    this.effects = this.effects.filter((effect) => {
      const alive = effect.update(dt)
      if (!alive) {
        this.boardGroup.remove(effect.object3d)
        effect.dispose()
      }
      return alive
    })

    // Selected piece floats and bobs; everyone else settles to the board.
    for (const piece of this.pieces.values()) {
      if (this.animating.has(piece)) continue
      const target =
        piece === this.selected ? DIMS.lift + Math.sin(this.time * 3) * 0.04 : 0
      piece.group.position.y += (target - piece.group.position.y) * Math.min(1, dt * 10)
    }

    if (this.checkPiece) {
      this.checkPiece.material.emissiveIntensity = 0.5 + 0.5 * Math.sin(this.time * 6)
    }

    const pulse = 1 + Math.sin(this.time * 4) * 0.12
    for (const m of this.markers) {
      const s = m.baseScale * (1 + Math.sin(this.time * 4 + m.phase) * 0.12)
      m.mesh.scale.setScalar(s)
    }
    if (this.selectionRing) this.selectionRing.scale.setScalar(pulse)
    if (this.checkRing) {
      this.checkRing.scale.setScalar(1 + Math.sin(this.time * 7) * 0.16)
      ;(this.checkRing.material as THREE.MeshBasicMaterial).opacity =
        0.6 + 0.3 * Math.sin(this.time * 7)
    }

    if (!this.reduceMotion) {
      this.starfield.rotation.y += dt * 0.012
      this.motes.rotation.y += dt * 0.03
      this.motes.position.y = Math.sin(this.time * 0.4) * 0.15
    }

    const idle = this.anims.length === 0 && this.time - this.lastInteract > 3.2
    this.controls.autoRotate =
      this.autoRotateEnabled && !this.reduceMotion && (idle || this.celebrating)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }
}
