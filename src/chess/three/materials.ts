/**
 * Material factories for the 3D chess scene. Pieces use a physically-based
 * material with clearcoat so light pools on their curved surfaces — pearl for
 * White, violet-lit obsidian for Black. Every piece gets its *own* material
 * instance so the scene can pulse one king's emissive (check) or fade a single
 * captured piece without touching the rest.
 */
import * as THREE from 'three'
import { PALETTE } from '../config'
import type { PieceColor } from '../types'

export function pieceMaterial(color: PieceColor): THREE.MeshPhysicalMaterial {
  const white = color === 'w'
  return new THREE.MeshPhysicalMaterial({
    color: white ? PALETTE.whitePiece : PALETTE.blackPiece,
    roughness: white ? 0.45 : 0.3,
    metalness: white ? 0.05 : 0.45,
    clearcoat: white ? 0.5 : 0.9,
    clearcoatRoughness: white ? 0.4 : 0.25,
    emissive: new THREE.Color(white ? PALETTE.whiteEmissive : PALETTE.blackEmissive),
    emissiveIntensity: white ? 0.16 : 0.35,
    sheen: 0.5,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(white ? 0xfff4d8 : PALETTE.rimViolet),
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
