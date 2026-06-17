/**
 * Procedural assets for the 3D Dominoes table — a "cozy wood parlor" look:
 * warm walnut surface, soft-cream bones with black pips, no asset files.
 *
 * A bone is a cream rounded slab (the {@link boneSlabGeometry}) with the pip
 * face drawn onto a {@link THREE.CanvasTexture} that is mapped to a thin plane
 * laid flush on top — far cheaper than dozens of pip meshes per tile and crisp
 * at any zoom. Geometries, materials and textures are all cached and shared:
 * one slab geometry, one cream material, one back material, and at most 49 face
 * textures (one per ordered pip pair). {@link disposeBoneAssets} frees the lot
 * when the last scene tears down.
 *
 * Bone units match `layout.ts` tile-units: long = 2, short = 1; the scene scales
 * the whole line group to fit, so a bone is built once at unit size.
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { Pip } from '../../../../domino/types'

/** Bone dimensions, in tile-units (long edge runs along local +x). */
export const BONE = { long: 2, short: 1, thick: 0.34, radius: 0.13 } as const

/** Warm parlor palette (Three.js hex). */
export const WOOD = {
  /** Scene clear colour — a dim, warm room. */
  background: 0x2a1c14,
  /** Table surface tint (the wood texture is multiplied by this). */
  table: 0xffffff,
  tableEdge: 0x3c2616,
  /** Soft daylight. */
  skyLight: 0xfff4e0,
  groundLight: 0x4a3220,
  keyLight: 0xfff1d8,
  fillLight: 0xffe6c0,
  /** Playable / open-end glow — a warm honey. */
  glow: 0xffcf7a,
} as const

/** Pip positions on a 3×3 grid (index 0..8, row-major) — mirrors `DominoTile`. */
const PIP_CELLS: Record<Pip, number[]> = {
  0: [],
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

// ---- shared geometries ----------------------------------------------------

let slabGeo: RoundedBoxGeometry | null = null
export function boneSlabGeometry(): RoundedBoxGeometry {
  if (!slabGeo) {
    slabGeo = new RoundedBoxGeometry(BONE.long, BONE.thick, BONE.short, 4, BONE.radius)
  }
  return slabGeo
}

let faceGeo: THREE.PlaneGeometry | null = null
function boneFaceGeometry(): THREE.PlaneGeometry {
  if (!faceGeo) faceGeo = new THREE.PlaneGeometry(BONE.long * 0.97, BONE.short * 0.97)
  return faceGeo
}

// ---- shared materials -----------------------------------------------------

let creamMat: THREE.MeshPhysicalMaterial | null = null
function creamMaterial(): THREE.MeshPhysicalMaterial {
  if (!creamMat) {
    creamMat = new THREE.MeshPhysicalMaterial({
      color: 0xefe4c6,
      roughness: 0.5,
      metalness: 0,
      clearcoat: 0.3,
      clearcoatRoughness: 0.5,
      sheen: 0.35,
      sheenColor: new THREE.Color(0xfff2d6),
    })
  }
  return creamMat
}

const faceMatCache = new Map<string, THREE.MeshStandardMaterial>()
function faceMaterial(left: Pip, right: Pip): THREE.MeshStandardMaterial {
  const key = `${left}-${right}`
  let mat = faceMatCache.get(key)
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      map: boneFaceTexture(left, right),
      roughness: 0.55,
      metalness: 0,
    })
    faceMatCache.set(key, mat)
  }
  return mat
}

let backMat: THREE.MeshStandardMaterial | null = null
function backMaterial(): THREE.MeshStandardMaterial {
  if (!backMat) {
    backMat = new THREE.MeshStandardMaterial({ map: boneBackTexture(), roughness: 0.5, metalness: 0 })
  }
  return backMat
}

// ---- canvas textures ------------------------------------------------------

/** Draw one 3×3 pip half into the square [x0, x0+side] × [0, side]. */
function drawPipHalf(ctx: CanvasRenderingContext2D, x0: number, side: number, value: Pip) {
  const cells = PIP_CELLS[value]
  const pad = side * 0.2
  const inner = side - pad * 2
  const step = inner / 2
  const r = side * 0.085
  for (const cell of cells) {
    const col = cell % 3
    const row = Math.floor(cell / 3)
    const cx = x0 + pad + col * step
    const cy = pad + row * step
    // Engraved pip: dark fill with a soft inner highlight.
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = '#16110a'
    ctx.fill()
    const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r)
    g.addColorStop(0, 'rgba(120,110,90,0.55)')
    g.addColorStop(0.5, 'rgba(20,16,10,0)')
    ctx.fillStyle = g
    ctx.fill()
  }
}

const faceTexCache = new Map<string, THREE.CanvasTexture>()
/** A cream bone face showing `left` | `right`, with a centre groove. Cached. */
export function boneFaceTexture(left: Pip, right: Pip): THREE.CanvasTexture {
  const key = `${left}-${right}`
  const cached = faceTexCache.get(key)
  if (cached) return cached

  const side = 256
  const canvas = document.createElement('canvas')
  canvas.width = side * 2
  canvas.height = side
  const ctx = canvas.getContext('2d')!

  // Cream base with a soft warm sheen.
  const grad = ctx.createLinearGradient(0, 0, 0, side)
  grad.addColorStop(0, '#f7efd8')
  grad.addColorStop(0.55, '#efe4c6')
  grad.addColorStop(1, '#e3d4ad')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, side * 2, side)

  // Top sheen highlight.
  const sheen = ctx.createLinearGradient(0, 0, 0, side * 0.5)
  sheen.addColorStop(0, 'rgba(255,255,255,0.35)')
  sheen.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = sheen
  ctx.fillRect(0, 0, side * 2, side * 0.5)

  // Centre groove: an engraved double line.
  const mid = side
  ctx.strokeStyle = 'rgba(80,60,30,0.35)'
  ctx.lineWidth = side * 0.018
  ctx.beginPath()
  ctx.moveTo(mid, side * 0.12)
  ctx.lineTo(mid, side * 0.88)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,250,235,0.6)'
  ctx.lineWidth = side * 0.01
  ctx.beginPath()
  ctx.moveTo(mid + side * 0.014, side * 0.12)
  ctx.lineTo(mid + side * 0.014, side * 0.88)
  ctx.stroke()

  drawPipHalf(ctx, 0, side, left)
  drawPipHalf(ctx, side, side, right)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  faceTexCache.set(key, tex)
  return tex
}

let backTex: THREE.CanvasTexture | null = null
/** The face-down back of a bone — cream with a subtle diamond emboss. */
export function boneBackTexture(): THREE.CanvasTexture {
  if (backTex) return backTex
  const side = 256
  const canvas = document.createElement('canvas')
  canvas.width = side * 2
  canvas.height = side
  const ctx = canvas.getContext('2d')!

  const grad = ctx.createLinearGradient(0, 0, 0, side)
  grad.addColorStop(0, '#eadcb8')
  grad.addColorStop(1, '#dcc99c')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, side * 2, side)

  // A faint diamond lattice.
  ctx.strokeStyle = 'rgba(120,90,50,0.18)'
  ctx.lineWidth = 2
  const s = side * 0.28
  for (let x = -side; x < side * 3; x += s) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + side, side)
    ctx.moveTo(x, side)
    ctx.lineTo(x + side, 0)
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  backTex = tex
  return tex
}

let woodTex: THREE.CanvasTexture | null = null
/** A procedural walnut surface for the table top. */
export function woodTexture(): THREE.CanvasTexture {
  if (woodTex) return woodTex
  const size = 1024
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#6b4326'
  ctx.fillRect(0, 0, size, size)

  // Long grain: many soft vertical stripes with wandering lightness.
  for (let i = 0; i < 240; i++) {
    const x = Math.random() * size
    const w = 1 + Math.random() * 4
    const shade = 0.5 + Math.random() * 0.5
    const warm = Math.random() > 0.5
    const r = Math.round((warm ? 130 : 90) * shade)
    const g = Math.round((warm ? 80 : 60) * shade)
    const b = Math.round((warm ? 45 : 34) * shade)
    ctx.strokeStyle = `rgba(${r},${g},${b},${0.12 + Math.random() * 0.18})`
    ctx.lineWidth = w
    ctx.beginPath()
    let y = 0
    ctx.moveTo(x, 0)
    while (y < size) {
      y += 24 + Math.random() * 40
      ctx.lineTo(x + Math.sin(y * 0.01 + i) * 6, y)
    }
    ctx.stroke()
  }

  // A couple of soft knots for character.
  for (let i = 0; i < 3; i++) {
    const kx = Math.random() * size
    const ky = Math.random() * size
    const kr = 30 + Math.random() * 60
    const g = ctx.createRadialGradient(kx, ky, 2, kx, ky, kr)
    g.addColorStop(0, 'rgba(50,30,16,0.55)')
    g.addColorStop(0.6, 'rgba(80,50,28,0.2)')
    g.addColorStop(1, 'rgba(80,50,28,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(kx, ky, kr, 0, Math.PI * 2)
    ctx.fill()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  woodTex = tex
  return tex
}

// ---- bone factory ---------------------------------------------------------

export interface Bone {
  group: THREE.Group
  /** The slab mesh — also the raycast pick target (scene sets `userData`). */
  slab: THREE.Mesh
  faceMesh: THREE.Mesh
}

/**
 * Build one bone, centred at its group origin, lying flat (face up along +y).
 * `left`/`right` are the pips shown on the local −x / +x halves. A face-down
 * bone shows the diamond back. Materials and geometries are shared/cached.
 */
export function makeBone(left: Pip, right: Pip, faceDown: boolean): Bone {
  const group = new THREE.Group()
  const slab = new THREE.Mesh(boneSlabGeometry(), creamMaterial())
  slab.castShadow = true
  slab.receiveShadow = true
  group.add(slab)

  const faceMesh = new THREE.Mesh(boneFaceGeometry(), faceDown ? backMaterial() : faceMaterial(left, right))
  faceMesh.rotation.x = -Math.PI / 2
  faceMesh.position.y = BONE.thick / 2 + 0.004
  group.add(faceMesh)

  return { group, slab, faceMesh }
}

/** Free every shared geometry/material/texture (last scene out turns off). */
export function disposeBoneAssets() {
  slabGeo?.dispose()
  slabGeo = null
  faceGeo?.dispose()
  faceGeo = null
  creamMat?.dispose()
  creamMat = null
  backMat?.dispose()
  backMat = null
  for (const m of faceMatCache.values()) m.dispose()
  faceMatCache.clear()
  for (const t of faceTexCache.values()) t.dispose()
  faceTexCache.clear()
  backTex?.dispose()
  backTex = null
  woodTex?.dispose()
  woodTex = null
}
