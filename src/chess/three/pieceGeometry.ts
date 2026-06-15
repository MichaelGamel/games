/**
 * Procedurally sculpted chess pieces — no model files, every piece is built from
 * math at runtime. The royalty are surfaces of revolution: a hand-authored
 * silhouette (radius, height) is spun around the vertical axis with
 * `LatheGeometry`. Details that can't be turned on a lathe are added on top —
 * the rook's crenellations, the queen's coronet, the king's cross. The knight is
 * the exception: its horse head is a 2D silhouette extruded to give it depth.
 *
 * All meshes are built around a single shared material (passed in) so the scene
 * can recolour or fade a whole piece at once. Pieces stand with their base on the
 * board's top surface (local y = 0) and grow upward.
 */
import * as THREE from 'three'
import type { PieceType } from '../types'

const LATHE_SEGMENTS = 56

/** Silhouettes as [radius, height] pairs, bottom (y=0) to top. */
// prettier-ignore
const PROFILES: Record<Exclude<PieceType, 'n'>, [number, number][]> = {
  p: [
    [0, 0], [0.30, 0], [0.28, 0.03], [0.20, 0.06], [0.14, 0.10], [0.12, 0.14],
    [0.155, 0.20], [0.135, 0.27], [0.10, 0.33], [0.175, 0.37], [0.155, 0.40],
    [0.10, 0.43], [0.13, 0.45], [0.155, 0.49], [0.155, 0.55], [0.13, 0.60],
    [0.075, 0.645], [0, 0.66],
  ],
  r: [
    [0, 0], [0.32, 0], [0.30, 0.04], [0.22, 0.09], [0.185, 0.14], [0.178, 0.30],
    [0.175, 0.45], [0.20, 0.50], [0.235, 0.55], [0.25, 0.62], [0.25, 0.70],
    [0.17, 0.70], [0.17, 0.66], [0, 0.66],
  ],
  b: [
    [0, 0], [0.30, 0], [0.28, 0.03], [0.20, 0.07], [0.135, 0.12], [0.12, 0.18],
    [0.15, 0.24], [0.13, 0.30], [0.095, 0.36], [0.175, 0.40], [0.15, 0.43],
    [0.085, 0.46], [0.12, 0.50], [0.155, 0.57], [0.15, 0.64], [0.11, 0.72],
    [0.06, 0.79], [0.045, 0.84], [0.058, 0.875], [0.03, 0.91], [0, 0.93],
  ],
  q: [
    [0, 0], [0.34, 0], [0.32, 0.04], [0.22, 0.09], [0.165, 0.15], [0.15, 0.22],
    [0.175, 0.30], [0.15, 0.40], [0.105, 0.48], [0.20, 0.53], [0.175, 0.57],
    [0.115, 0.60], [0.16, 0.66], [0.22, 0.74], [0.235, 0.80], [0.225, 0.84],
    [0.15, 0.84], [0.15, 0.80], [0, 0.80],
  ],
  k: [
    [0, 0], [0.35, 0], [0.33, 0.04], [0.23, 0.09], [0.17, 0.15], [0.155, 0.22],
    [0.18, 0.30], [0.155, 0.42], [0.11, 0.50], [0.205, 0.55], [0.18, 0.59],
    [0.12, 0.62], [0.165, 0.68], [0.225, 0.76], [0.235, 0.82], [0.225, 0.86],
    [0.16, 0.86], [0.16, 0.82], [0, 0.82],
  ],
}

/** The knight's horse-head silhouette (x = nose direction, y = up). */
// prettier-ignore
const KNIGHT_SILHOUETTE: [number, number][] = [
  [0.02, 0.00], [-0.20, 0.00], [-0.22, 0.16], [-0.20, 0.32], [-0.17, 0.46],
  [-0.13, 0.56], [-0.14, 0.63], [-0.08, 0.66], [-0.05, 0.585], [-0.005, 0.66],
  [0.03, 0.60], [0.075, 0.50], [0.13, 0.41], [0.205, 0.33], [0.255, 0.275],
  [0.265, 0.225], [0.215, 0.195], [0.245, 0.155], [0.16, 0.175], [0.115, 0.235],
  [0.075, 0.205], [0.055, 0.135], [0.03, 0.075],
]

function lathe(profile: [number, number][], material: THREE.Material): THREE.Mesh {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y))
  const geo = new THREE.LatheGeometry(pts, LATHE_SEGMENTS)
  geo.computeVertexNormals()
  return shadowMesh(geo, material)
}

function shadowMesh(geo: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** Small boxes ringing the rook's rim, with the classic battlement gaps. */
function crenellations(material: THREE.Material): THREE.Mesh[] {
  const out: THREE.Mesh[] = []
  const geo = new THREE.BoxGeometry(0.11, 0.14, 0.11)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    const m = shadowMesh(geo, material)
    m.position.set(Math.cos(a) * 0.18, 0.74, Math.sin(a) * 0.18)
    out.push(m)
  }
  return out
}

/** The queen's coronet: a ring of points around a central finial. */
function coronet(material: THREE.Material): THREE.Mesh[] {
  const out: THREE.Mesh[] = []
  const point = new THREE.SphereGeometry(0.05, 14, 12)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const m = shadowMesh(point, material)
    m.position.set(Math.cos(a) * 0.2, 0.88, Math.sin(a) * 0.2)
    out.push(m)
  }
  const finial = shadowMesh(new THREE.SphereGeometry(0.07, 18, 14), material)
  finial.position.y = 0.9
  out.push(finial)
  return out
}

/** The king's surmounting cross. */
function cross(material: THREE.Material): THREE.Mesh[] {
  const band = shadowMesh(new THREE.TorusGeometry(0.15, 0.028, 12, 32), material)
  band.rotation.x = Math.PI / 2
  band.position.y = 0.85
  const vertical = shadowMesh(new THREE.BoxGeometry(0.055, 0.26, 0.055), material)
  vertical.position.y = 1.0
  const horizontal = shadowMesh(new THREE.BoxGeometry(0.17, 0.055, 0.055), material)
  horizontal.position.y = 0.98
  return [band, vertical, horizontal]
}

function knight(material: THREE.Material): THREE.Mesh[] {
  // Pedestal the head sits on.
  const pedestal = lathe(
    [
      [0, 0], [0.3, 0], [0.28, 0.03], [0.2, 0.07], [0.165, 0.12], [0.16, 0.24],
      [0.2, 0.28], [0.18, 0.3], [0, 0.3],
    ],
    material,
  )

  const shape = new THREE.Shape()
  shape.moveTo(KNIGHT_SILHOUETTE[0][0], KNIGHT_SILHOUETTE[0][1])
  for (let i = 1; i < KNIGHT_SILHOUETTE.length; i++) {
    shape.lineTo(KNIGHT_SILHOUETTE[i][0], KNIGHT_SILHOUETTE[i][1])
  }
  shape.closePath()

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.24,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.035,
    bevelSegments: 3,
    steps: 1,
  })
  // Centre the head on x and z; rest its base on the pedestal top.
  geo.computeBoundingBox()
  const bb = geo.boundingBox!
  geo.translate(-(bb.min.x + bb.max.x) / 2, 0, -(bb.min.z + bb.max.z) / 2)
  geo.computeVertexNormals()
  const head = shadowMesh(geo, material)
  head.position.y = 0.27

  return [pedestal, head]
}

/**
 * Build the meshes for one piece around a shared material. Returns bare meshes so
 * the scene can group, scale and position them; the group's local origin is the
 * centre of the piece's base on the board surface.
 */
export function buildPieceMeshes(type: PieceType, material: THREE.Material): THREE.Mesh[] {
  switch (type) {
    case 'p':
      return [lathe(PROFILES.p, material)]
    case 'r':
      return [lathe(PROFILES.r, material), ...crenellations(material)]
    case 'n':
      return knight(material)
    case 'b': {
      const finial = shadowMesh(new THREE.SphereGeometry(0.05, 16, 12), material)
      finial.position.y = 0.96
      return [lathe(PROFILES.b, material), finial]
    }
    case 'q':
      return [lathe(PROFILES.q, material), ...coronet(material)]
    case 'k':
      return [lathe(PROFILES.k, material), ...cross(material)]
  }
}
