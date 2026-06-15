/**
 * Material factories for the 3D chess scene. Pieces use a physically-based
 * material with clearcoat so light pools on their curved surfaces — pearl for
 * White, violet-lit obsidian for Black. Every piece gets its *own* material
 * instance so the scene can pulse one king's emissive (check) or fade a single
 * captured piece without touching the rest.
 */
import * as THREE from 'three'
import { PALETTE } from '../config'

/**
 * A polished piece material in any colour. Light colours get a pearl finish
 * (soft, warm sheen); dark/saturated colours get a glossy, slightly metallic
 * onyx finish. The base emissive is a dim tint of the colour itself, so the
 * piece glows in its own hue (the scene overrides it red for a king in check).
 */
export function pieceMaterial(value: THREE.ColorRepresentation): THREE.MeshPhysicalMaterial {
  const color = new THREE.Color(value)
  // Perceptual-ish luminance (the Color channels are already linearised).
  const lum = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b
  const light = lum > 0.3
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: light ? 0.45 : 0.34,
    metalness: light ? 0.06 : 0.42,
    clearcoat: light ? 0.5 : 0.85,
    clearcoatRoughness: light ? 0.4 : 0.26,
    emissive: color.clone().multiplyScalar(0.5),
    emissiveIntensity: light ? 0.1 : 0.28,
    sheen: 0.5,
    sheenRoughness: 0.5,
    sheenColor: light ? new THREE.Color(0xfff4d8) : color.clone(),
  })
}

export function tileMaterial(light: boolean): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: light ? PALETTE.light : PALETTE.dark,
    roughness: light ? 0.55 : 0.42,
    metalness: 0.12,
    clearcoat: 0.55,
    clearcoatRoughness: 0.45,
    emissive: new THREE.Color(light ? 0x2a2444 : PALETTE.seam),
    emissiveIntensity: light ? 0.05 : 0.12,
  })
}

export function frameMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: PALETTE.frame,
    roughness: 0.35,
    metalness: 0.5,
    clearcoat: 0.7,
    clearcoatRoughness: 0.3,
    emissive: new THREE.Color(PALETTE.frameTrim),
    emissiveIntensity: 0.12,
  })
}

/** Additive glow used for selection rings, move markers and the check ring. */
export function glowMaterial(hex: number, opacity = 0.85): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(hex),
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  })
}
