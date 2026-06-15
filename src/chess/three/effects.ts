/**
 * Particle atmosphere for the chess scene: a parallax starfield and drifting
 * motes for depth, plus one-shot bursts that fire when a piece is captured,
 * a pawn promotes, or the game is won. Each burst is a self-contained
 * {@link Effect} the scene ticks until it reports itself dead, then disposes.
 */
import * as THREE from 'three'

export interface Effect {
  object3d: THREE.Object3D
  /** Advance by `dt` seconds. Returns false when the effect is finished. */
  update(dt: number): boolean
  dispose(): void
}

/** A soft round sprite so points read as glowing motes, not hard squares. */
let sprite: THREE.Texture | null = null
function softSprite(): THREE.Texture {
  if (sprite) return sprite
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.7)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  sprite = new THREE.CanvasTexture(canvas)
  sprite.colorSpace = THREE.SRGBColorSpace
  return sprite
}

export function createStarfield(count = 520): THREE.Points {
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    // Scatter on a large shell around the scene.
    const r = 26 + Math.random() * 30
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.7 + 2
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const mat = new THREE.PointsMaterial({
    color: 0xc9bcff,
    size: 0.42,
    map: softSprite(),
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  })
  const points = new THREE.Points(geo, mat)
  points.name = 'starfield'
  return points
}

/** Slow-drifting motes hovering just above the board for a dusty, magical air. */
export function createMotes(count = 60): THREE.Points {
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 11
    positions[i * 3 + 1] = Math.random() * 4 + 0.2
    positions[i * 3 + 2] = (Math.random() - 0.5) * 11
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const mat = new THREE.PointsMaterial({
    color: 0xb49bff,
    size: 0.13,
    map: softSprite(),
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  return new THREE.Points(geo, mat)
}

interface BurstOptions {
  count?: number
  speed?: number
  spread?: number
  gravity?: number
  duration?: number
  size?: number
  /** Bias the initial velocity upward (fountains) vs. all directions (shatters). */
  upward?: number
}

/**
 * A one-shot particle burst at `origin` (in the parent's local space). Used for
 * capture shatters, promotion sparkles and the victory shower.
 */
export function createBurst(origin: THREE.Vector3, colorHex: number, opts: BurstOptions = {}): Effect {
  const {
    count = 46,
    speed = 3.2,
    spread = 1,
    gravity = 5.5,
    duration = 1.0,
    size = 0.22,
    upward = 0.4,
  } = opts

  const positions = new Float32Array(count * 3)
  const velocities = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    positions[i * 3] = origin.x
    positions[i * 3 + 1] = origin.y
    positions[i * 3 + 2] = origin.z
    const dir = new THREE.Vector3(
      (Math.random() - 0.5) * 2 * spread,
      Math.random() * 2 * upward + upward,
      (Math.random() - 0.5) * 2 * spread,
    ).normalize()
    const v = speed * (0.5 + Math.random())
    velocities[i * 3] = dir.x * v
    velocities[i * 3 + 1] = dir.y * v
    velocities[i * 3 + 2] = dir.z * v
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const mat = new THREE.PointsMaterial({
    color: new THREE.Color(colorHex),
    size,
    map: softSprite(),
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
  const points = new THREE.Points(geo, mat)

  let elapsed = 0
  return {
    object3d: points,
    update(dt) {
      elapsed += dt
      const pos = geo.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < count; i++) {
        velocities[i * 3 + 1] -= gravity * dt
        positions[i * 3] += velocities[i * 3] * dt
        positions[i * 3 + 1] += velocities[i * 3 + 1] * dt
        positions[i * 3 + 2] += velocities[i * 3 + 2] * dt
      }
      pos.needsUpdate = true
      const life = 1 - elapsed / duration
      mat.opacity = Math.max(0, life)
      mat.size = size * (0.4 + 0.6 * Math.max(0, life))
      return elapsed < duration
    },
    dispose() {
      geo.dispose()
      mat.dispose()
    },
  }
}
