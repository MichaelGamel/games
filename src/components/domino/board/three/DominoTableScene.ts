/**
 * The 3D Dominoes table — an imperative Three.js scene the React layer mounts
 * once (via a callback ref) and drives through a tiny command surface
 * ({@link setLine}, {@link setHand}, {@link setBoneyard}). It owns *everything*
 * visual: the walnut table under soft daylight, the laid serpentine line, the
 * fanned hand you tap to play, and the boneyard you tap to draw. It computes no
 * rules — the React layer hands it the already-resolved {@link DominoLine} and
 * hand, and the scene only renders + animates them, reporting taps back through
 * its callbacks.
 *
 * Coordinate frame: the table top is the y = 0 plane; +z runs toward the camera
 * (the near edge, where your hand sits), −z is the far edge. The laid line lives
 * in a single child group that is auto-scaled to fit, exactly mirroring the 2D
 * board's GPU-scale trick, so an arbitrarily long chain stays fully visible.
 *
 * Per the project's standing rule, there is **no idle/ambient camera motion** —
 * the camera only moves when the user drags it. Azimuth + polar are clamped so
 * the hand always faces the player.
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { computeLayout } from '../../../../domino/layout'
import { LAYOUT } from '../../../../domino/config'
import type { DominoLine, DominoTile, Pip } from '../../../../domino/types'
import { BONE, WOOD, makeBone, woodTexture, type Bone } from './boneGeometry'

export interface DominoSceneCallbacks {
  onPlayTile: (tileId: string) => void
  onDrawTile: () => void
}

export interface HandState {
  tiles: DominoTile[]
  legalIds: ReadonlySet<string>
  /** Whether taps may play a tile (your turn, on this device, not a bot). */
  active: boolean
  /** Hide every face (a bot's hand / privacy hand-off). */
  faceDown: boolean
}

interface Anim {
  update: (dt: number) => boolean
}

interface LineBone {
  bone: Bone
  pos: THREE.Vector3
}

interface HandBone {
  bone: Bone
  tileId: string
  legal: boolean
  /** Resting transform target; the tick eases the bone toward it. */
  targetX: number
  baseY: number
  baseZ: number
  /** `down` or `a-b` — what the face currently shows, to detect a flip. */
  faceKey: string
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const easeOutBack = (t: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

/** Geometry of the play surface + camera framing, in world units. */
const TABLE = {
  width: 17,
  depth: 13.5,
  thickness: 0.7,
  /** Centre of the laid-line play region. */
  lineCenterZ: -1.2,
  lineFitW: 13.5,
  lineFitD: 7.6,
  /** Where the fanned hand sits (near edge). */
  handZ: 4.9,
  handY: 0.05,
  handTilt: 0.62,
  /** The draw pile — a compact low stack, fully in frame. */
  boneyard: new THREE.Vector3(-5.5, 0, -3.1),
  boneyardStep: 0.16,
  boneyardMax: 6,
} as const

export class DominoTableScene {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly controls: OrbitControls
  private readonly timer = new THREE.Timer()
  private readonly raycaster = new THREE.Raycaster()

  private readonly lineGroup = new THREE.Group()
  private readonly handGroup = new THREE.Group()
  private readonly boneyardGroup = new THREE.Group()

  private readonly lineBones = new Map<string, LineBone>()
  private handBones: HandBone[] = []
  private boneyardBones: Bone[] = []

  // Open-end + playable + draw glow halos (additive, pulse in the tick).
  private endHalos: THREE.Mesh[] = []
  private handHalos = new Map<string, THREE.Mesh>()
  private boneyardHalo: THREE.Mesh | null = null

  private anims: Anim[] = []
  private readonly pickables: THREE.Object3D[] = []
  private readonly disposables: { dispose(): void }[] = []

  // Latest applied UI state (read by picking + the tick).
  private handActive = false
  private handFaceDown = false
  private legalIds: ReadonlySet<string> = new Set()
  private canDraw = false
  private hoveredHandId: string | null = null
  private highlightEnds = true

  // Shared glow assets (scene-owned, disposed on teardown).
  private readonly haloGeo = new THREE.CircleGeometry(1, 40)
  private readonly haloMat: THREE.MeshBasicMaterial

  private time = 0
  private raf = 0
  private disposed = false
  private readonly reduceMotion: boolean
  private readonly resizeObserver: ResizeObserver
  private pointerDown: { x: number; y: number; t: number } | null = null

  private readonly container: HTMLElement
  private readonly callbacks: DominoSceneCallbacks

  constructor(container: HTMLElement, callbacks: DominoSceneCallbacks) {
    this.container = container
    this.callbacks = callbacks
    this.reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

    const width = container.clientWidth || 1
    const height = container.clientHeight || 1

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(width, height)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.08
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.touchAction = 'none'
    container.appendChild(this.renderer.domElement)

    this.scene.background = new THREE.Color(WOOD.background)
    this.scene.fog = new THREE.Fog(WOOD.background, 22, 46)

    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 200)
    this.camera.position.set(0, 10.2, 11)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.09
    this.controls.enablePan = false
    this.controls.autoRotate = false // never — no ambient view motion
    this.controls.minDistance = 9.5
    this.controls.maxDistance = 18
    this.controls.minPolarAngle = 0.18
    this.controls.maxPolarAngle = 1.16
    this.controls.minAzimuthAngle = -0.52
    this.controls.maxAzimuthAngle = 0.52
    this.controls.rotateSpeed = 0.7
    this.controls.target.set(0, 0.3, 1.4)

    this.haloMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(WOOD.glow),
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
    this.disposables.push(this.haloGeo, this.haloMat)

    this.scene.add(this.lineGroup, this.handGroup, this.boneyardGroup)
    this.handGroup.position.z = TABLE.handZ
    this.lineGroup.position.z = TABLE.lineCenterZ

    this.buildLights()
    this.buildTable()

    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp)
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)

    this.raf = requestAnimationFrame(this.tick)
  }

  // ---- scene construction -------------------------------------------------

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight(WOOD.skyLight, WOOD.groundLight, 0.85))

    const key = new THREE.DirectionalLight(WOOD.keyLight, 2.1)
    key.position.set(-6, 13, 6)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.camera.near = 0.5
    key.shadow.camera.far = 44
    key.shadow.camera.left = -12
    key.shadow.camera.right = 12
    key.shadow.camera.top = 12
    key.shadow.camera.bottom = -12
    key.shadow.bias = -0.0004
    key.shadow.normalBias = 0.02
    this.scene.add(key, key.target)

    const fill = new THREE.DirectionalLight(WOOD.fillLight, 0.5)
    fill.position.set(7, 6, 9)
    this.scene.add(fill)

    // A warm overhead pool so the table centre glows like a lamp-lit parlor.
    const lamp = new THREE.PointLight(0xffdca0, 60, 30, 2)
    lamp.position.set(0, 9, 1)
    this.scene.add(lamp)
  }

  private buildTable() {
    const map = woodTexture()
    const topMat = new THREE.MeshStandardMaterial({
      map,
      color: WOOD.table,
      roughness: 0.62,
      metalness: 0.05,
    })
    const sideMat = new THREE.MeshStandardMaterial({ color: WOOD.tableEdge, roughness: 0.7, metalness: 0.05 })
    this.disposables.push(topMat, sideMat)

    const geo = new THREE.BoxGeometry(TABLE.width, TABLE.thickness, TABLE.depth)
    this.disposables.push(geo)
    // BoxGeometry face order: +x, -x, +y(top), -y, +z, -z.
    const table = new THREE.Mesh(geo, [sideMat, sideMat, topMat, sideMat, sideMat, sideMat])
    table.position.set(0, -TABLE.thickness / 2, 0.4)
    table.receiveShadow = true
    this.scene.add(table)
  }

  // ---- public command surface --------------------------------------------

  /** Lay out the line (auto-fit serpentine). New bones drop in; the rest reflow. */
  setLine(line: DominoLine) {
    const perRow = LAYOUT.perRow
    const layout = computeLayout(line, { ...LAYOUT, perRow })

    if (layout.tiles.length === 0) {
      this.clearLine()
      return
    }

    const W = Math.max(layout.width, BONE.long)
    const H = Math.max(layout.height, BONE.short)
    const fit = Math.min(TABLE.lineFitW / W, TABLE.lineFitD / H, 1)
    this.tweenScale(this.lineGroup, fit)

    const seen = new Set<string>()
    for (const tl of layout.tiles) {
      seen.add(tl.id)
      const target = new THREE.Vector3(tl.cx - W / 2, BONE.thick / 2, tl.cy - H / 2)
      const existing = this.lineBones.get(tl.id)
      if (existing) {
        existing.pos.copy(target)
        this.tweenPos(existing.bone.group, target)
      } else {
        const bone = makeBone(tl.leftPip as Pip, tl.rightPip as Pip, false)
        bone.group.position.set(target.x, target.y, target.z)
        this.lineGroup.add(bone.group)
        this.lineBones.set(tl.id, { bone, pos: target.clone() })
        this.dropIn(bone.group, target)
      }
    }

    for (const [id, lb] of this.lineBones) {
      if (!seen.has(id)) {
        this.lineGroup.remove(lb.bone.group)
        this.lineBones.delete(id)
      }
    }

    this.refreshEndHalos(layout.head, layout.tail, W, H)
  }

  /** Render the viewer's fanned hand; legal tiles lift + glow and are tappable. */
  setHand(state: HandState) {
    this.handActive = state.active
    this.handFaceDown = state.faceDown
    this.legalIds = state.legalIds

    const tiles = state.tiles
    const byId = new Map(this.handBones.map((h) => [h.tileId, h]))
    const next: HandBone[] = []

    const n = tiles.length
    const baseY = TABLE.handY + BONE.thick / 2
    tiles.forEach((tile, i) => {
      const legal = !state.faceDown && state.active && state.legalIds.has(tile.id)
      const t = n > 1 ? i / (n - 1) - 0.5 : 0
      const step = Math.min(2.0, 11 / Math.max(n, 1))
      const x = (i - (n - 1) / 2) * step
      const baseZ = Math.abs(t) * 1.4
      const yaw = -t * 0.5

      let hb = byId.get(tile.id)
      if (hb) {
        byId.delete(tile.id)
      } else {
        const bone = makeBone(tile.a, tile.b, state.faceDown)
        bone.slab.userData = { kind: 'hand', tileId: tile.id }
        this.pickables.push(bone.slab)
        this.handGroup.add(bone.group)
        // Deal in from above the table; the tick eases it down to rest.
        bone.group.position.set(x, baseY + (this.reduceMotion ? 0 : 3), baseZ)
        const faceKey = state.faceDown ? 'down' : `${tile.a}-${tile.b}`
        hb = { bone, tileId: tile.id, legal, targetX: x, baseY, baseZ, faceKey }
      }

      hb.legal = legal
      hb.targetX = x
      hb.baseY = baseY
      hb.baseZ = baseZ
      hb.bone.group.rotation.set(TABLE.handTilt, yaw, 0)
      this.ensureFace(hb, tile, state.faceDown)
      this.setHaloFor(tile.id, legal)
      next.push(hb)
    })

    // Remove bones no longer in hand (played / passed).
    for (const stale of byId.values()) {
      this.removePickable(stale.bone.slab)
      this.handGroup.remove(stale.bone.group)
      const halo = this.handHalos.get(stale.tileId)
      if (halo) {
        this.handGroup.remove(halo)
        this.handHalos.delete(stale.tileId)
      }
    }

    this.handBones = next
  }

  /** Set the boneyard stack height; pulse + bob when a draw is available. */
  setBoneyard(count: number, canDraw: boolean) {
    this.canDraw = canDraw
    const shown = Math.min(count, TABLE.boneyardMax)

    // Grow or shrink the visible stack — a tidy low pile (the count badge in the
    // chrome carries the exact number, so the stack need not be literal).
    while (this.boneyardBones.length < shown) {
      const i = this.boneyardBones.length
      const bone = makeBone(0, 0, true)
      bone.slab.userData = { kind: 'boneyard' }
      bone.group.rotation.set(0, 0.1 + (i % 2) * 0.06, 0)
      bone.group.position.set(
        TABLE.boneyard.x + (i % 2) * 0.06,
        BONE.thick / 2 + i * TABLE.boneyardStep,
        TABLE.boneyard.z + (i % 3) * 0.05,
      )
      this.pickables.push(bone.slab)
      this.boneyardGroup.add(bone.group)
      this.boneyardBones.push(bone)
    }
    while (this.boneyardBones.length > shown) {
      const bone = this.boneyardBones.pop()!
      this.removePickable(bone.slab)
      this.boneyardGroup.remove(bone.group)
    }

    if (canDraw && shown > 0) {
      if (!this.boneyardHalo) {
        const halo = new THREE.Mesh(this.haloGeo, this.haloMat)
        halo.rotation.x = -Math.PI / 2
        halo.position.set(TABLE.boneyard.x, 0.02, TABLE.boneyard.z)
        halo.scale.setScalar(1.4)
        this.boneyardGroup.add(halo)
        this.boneyardHalo = halo
      }
    } else if (this.boneyardHalo) {
      this.boneyardGroup.remove(this.boneyardHalo)
      this.boneyardHalo = null
    }
  }

  /** Whether to glow the two open ends of the line (a "play here" hint). */
  setHighlightEnds(on: boolean) {
    this.highlightEnds = on
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
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove)
    this.controls.dispose()
    for (const d of this.disposables) d.dispose()
    this.renderer.dispose()
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }

  // ---- halos / faces ------------------------------------------------------

  private refreshEndHalos(
    head: { cx: number; cy: number } | null,
    tail: { cx: number; cy: number } | null,
    W: number,
    H: number,
  ) {
    for (const h of this.endHalos) this.lineGroup.remove(h)
    this.endHalos = []
    if (!this.highlightEnds) return
    for (const end of [head, tail]) {
      if (!end) continue
      const halo = new THREE.Mesh(this.haloGeo, this.haloMat)
      halo.rotation.x = -Math.PI / 2
      halo.position.set(end.cx - W / 2, 0.014, end.cy - H / 2)
      halo.scale.setScalar(BONE.short * 0.95)
      this.lineGroup.add(halo)
      this.endHalos.push(halo)
    }
  }

  private setHaloFor(tileId: string, legal: boolean) {
    const existing = this.handHalos.get(tileId)
    if (legal && !existing) {
      const halo = new THREE.Mesh(this.haloGeo, this.haloMat)
      halo.rotation.x = -Math.PI / 2
      halo.scale.setScalar(BONE.short * 0.85)
      this.handGroup.add(halo)
      this.handHalos.set(tileId, halo)
    } else if (!legal && existing) {
      this.handGroup.remove(existing)
      this.handHalos.delete(tileId)
    }
  }

  /** Swap a hand bone's face when its privacy (face-up/down) state changes. */
  private ensureFace(hb: HandBone, tile: DominoTile, faceDown: boolean) {
    const want = faceDown ? 'down' : `${tile.a}-${tile.b}`
    if (hb.faceKey === want) return
    // Faces map to shared, cached materials, so a fresh bone just hands us the
    // right one — the throwaway group's geometry/materials are not owned here.
    const fresh = makeBone(tile.a, tile.b, faceDown)
    hb.bone.faceMesh.material = fresh.faceMesh.material
    hb.faceKey = want
  }

  // ---- animation helpers --------------------------------------------------

  private dropIn(group: THREE.Object3D, target: THREE.Vector3) {
    if (this.reduceMotion) {
      group.position.copy(target)
      return
    }
    const startY = target.y + 2.4
    const tilt = (Math.random() - 0.5) * 0.4
    group.position.set(target.x, startY, target.z)
    group.rotation.set(tilt, group.rotation.y, tilt * 0.5)
    this.anims.push(
      this.tween(0.5, (t) => {
        const e = easeOutBack(Math.min(1, t * 1.05))
        group.position.y = startY + (target.y - startY) * Math.min(1, t * 1.15)
        group.rotation.x = tilt * (1 - e)
        group.rotation.z = tilt * 0.5 * (1 - e)
      }),
    )
  }

  private tweenPos(group: THREE.Object3D, target: THREE.Vector3) {
    if (this.reduceMotion) {
      group.position.copy(target)
      return
    }
    const from = group.position.clone()
    this.anims.push(
      this.tween(0.34, (t) => {
        const e = easeOutCubic(t)
        group.position.lerpVectors(from, target, e)
      }),
    )
  }

  private tweenScale(group: THREE.Object3D, target: number) {
    if (this.reduceMotion) {
      group.scale.setScalar(target)
      return
    }
    const from = group.scale.x
    if (Math.abs(from - target) < 0.001) return
    this.anims.push(
      this.tween(0.34, (t) => {
        const e = easeOutCubic(t)
        group.scale.setScalar(from + (target - from) * e)
      }),
    )
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

  private clearLine() {
    for (const lb of this.lineBones.values()) this.lineGroup.remove(lb.bone.group)
    this.lineBones.clear()
    for (const h of this.endHalos) this.lineGroup.remove(h)
    this.endHalos = []
  }

  private removePickable(obj: THREE.Object3D) {
    const i = this.pickables.indexOf(obj)
    if (i >= 0) this.pickables.splice(i, 1)
  }

  // ---- picking ------------------------------------------------------------

  private pointerNdc(e: PointerEvent): THREE.Vector2 {
    const rect = this.renderer.domElement.getBoundingClientRect()
    return new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
  }

  private onPointerDown = (e: PointerEvent) => {
    this.pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() }
  }

  private onPointerMove = (e: PointerEvent) => {
    if (!this.handActive || this.handFaceDown) {
      this.hoveredHandId = null
      return
    }
    this.raycaster.setFromCamera(this.pointerNdc(e), this.camera)
    const hit = this.raycaster.intersectObjects(this.pickables, false)[0]
    const data = hit?.object.userData
    this.hoveredHandId =
      data?.kind === 'hand' && this.legalIds.has(data.tileId) ? (data.tileId as string) : null
    this.renderer.domElement.style.cursor = this.hoveredHandId || this.hitDraw(hit) ? 'pointer' : 'default'
  }

  private hitDraw(hit: THREE.Intersection | undefined) {
    return this.canDraw && hit?.object.userData.kind === 'boneyard'
  }

  private onPointerUp = (e: PointerEvent) => {
    const down = this.pointerDown
    this.pointerDown = null
    if (!down) return
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
    if (moved > 8 || performance.now() - down.t > 600) return // a drag, not a tap

    this.raycaster.setFromCamera(this.pointerNdc(e), this.camera)
    const hit = this.raycaster.intersectObjects(this.pickables, false)[0]
    if (!hit) return
    const data = hit.object.userData
    if (data.kind === 'hand') {
      if (this.handActive && !this.handFaceDown && this.legalIds.has(data.tileId)) {
        this.callbacks.onPlayTile(data.tileId as string)
      }
    } else if (data.kind === 'boneyard' && this.canDraw) {
      this.callbacks.onDrawTile()
    }
  }

  // ---- frame loop ---------------------------------------------------------

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick)
    this.timer.update()
    const dt = Math.min(this.timer.getDelta(), 0.05)
    this.time += dt

    this.anims = this.anims.filter((a) => a.update(dt))

    // Hand: each bone eases toward its resting x/z; legal tiles lift, and the
    // hovered one lifts + slides a touch toward the camera.
    const k = Math.min(1, dt * 9)
    for (const hb of this.handBones) {
      const lifted = hb.legal ? 0.42 : 0
      const hover = hb.tileId === this.hoveredHandId ? 0.32 : 0
      const targetY = hb.baseY + (this.reduceMotion ? lifted * 0.6 : lifted + hover)
      const targetZ = hb.baseZ + (hover > 0 ? 0.6 : 0)
      const p = hb.bone.group.position
      p.x += (hb.targetX - p.x) * k
      p.y += (targetY - p.y) * k
      p.z += (targetZ - p.z) * k
      const halo = this.handHalos.get(hb.tileId)
      if (halo) halo.position.set(p.x, 0.016, hb.baseZ + 0.55)
    }

    // Pulse all glow halos together.
    const pulse = 0.4 + 0.28 * (0.5 + 0.5 * Math.sin(this.time * 3))
    this.haloMat.opacity = this.reduceMotion ? 0.45 : pulse
    const s = this.reduceMotion ? 1 : 1 + Math.sin(this.time * 3) * 0.06
    for (const h of this.endHalos) h.scale.setScalar(BONE.short * 0.95 * s)

    // Boneyard invites a draw with a gentle bob.
    if (this.canDraw && !this.reduceMotion) {
      const bob = Math.sin(this.time * 2.4) * 0.06
      this.boneyardGroup.position.y = bob
    } else {
      this.boneyardGroup.position.y = 0
    }

    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }
}
