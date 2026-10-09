/**
 * The hulls a player can fly. Every hull carries the same five mounts, the
 * same drive's worth of engines and the same modules, so the choice is
 * cosmetic: what changes is the body built round them, where the mounts sit
 * on it, how the shipyard frames it and how the livery is laid over it.
 */
import type { Hull } from '@dangerous-inclinations/engine'
import type { MountId, Vec3 } from './config'

export interface MountPose {
  position: Vec3
  rotation: Vec3
  scale: Vec3
  normal: Vec3
}

export interface HullInfo {
  name: string
  /** The shipyard's framing: where the camera looks, how much it takes in, the floor. */
  stage: { center: Vec3; radius: number; floor: number }
  /**
   * The livery shader is laid out in corvette units. Each pattern is moved to
   * where it reads on this hull: the band's (x, y), the chevron's and the
   * stern band's x, the split line's and the spine's y, how much of the beam
   * the chevron counts (a wide hull counts less of it), and how far off the
   * centreline the spine runs (the mantis paints one down each arm).
   */
  livery: {
    band: [number, number]
    chevron: number
    stern: number
    split: number
    spine: number
    beam: number
    spineZ: number
  }
  /**
   * The 3D board's miniature: its scale, and how far it rides above the
   * hover height so nothing of it sinks through the surface the rings are
   * drawn on.
   */
  board: { scale: number; lift: number }
}

export const HULL_INFO: Record<Hull, HullInfo> = {
  corvette: {
    name: 'Corvette',
    stage: { center: [0.2, 0, 0], radius: 6.9, floor: -3.3 },
    livery: { band: [0, 0], chevron: 0, stern: 0, split: 0, spine: 0, beam: 1, spineZ: 0 },
    board: { scale: 4, lift: 0 },
  },
  shrike: {
    name: 'Shrike',
    stage: { center: [0.6, -0.25, 0], radius: 7.6, floor: -6 },
    livery: {
      band: [0.4, -0.9],
      chevron: 1.2,
      stern: -1.85,
      split: -0.6,
      spine: -1.55,
      beam: 1,
      spineZ: 0,
    },
    // Smaller than the corvette's 4, so the crest stays under the escort
    // badges once the blade is lifted clear of the surface.
    board: { scale: 3.2, lift: 10.7 },
  },
  mantis: {
    name: 'Mantis',
    stage: { center: [-0.2, 0.2, 0], radius: 8.8, floor: -3.3 },
    livery: {
      band: [-0.4, 0],
      chevron: 0.79,
      stern: 0.65,
      split: 0,
      spine: 0,
      beam: 0.5,
      spineZ: 1.7,
    },
    board: { scale: 3.2, lift: 1.6 },
  },
}

const side = (x: number, y: number, face: number, s: -1 | 1): MountPose => ({
  position: [x, y, s * face],
  rotation: [(s * Math.PI) / 2, 0, 0],
  scale: [1, 1, -s],
  normal: [0, 0, s],
})

/**
 * The shrike's mounts: both flanks in one column on the chassis, the upper
 * pair over the lower, and the bow mount sunk under the cockpit.
 */
export const SHRIKE_MOUNTS: Record<MountId, MountPose> = {
  'forward-0': {
    position: [2.0, 1.45, 0],
    rotation: [-Math.PI / 2, 0, -Math.PI / 2],
    scale: [1, 1, 1],
    normal: [1, 0, 0],
  },
  'side-0': side(0.3, 1.45, 0.76, -1),
  'side-1': side(0.3, -0.15, 0.76, -1),
  'side-2': side(0.3, 1.45, 0.76, 1),
  'side-3': side(0.3, -0.15, 0.76, 1),
}

/**
 * The mantis's mounts: the flank pairs fore and aft on the outboard faces of
 * the arms, and the bow mount on the core where the arms meet it.
 */
export const MANTIS_MOUNTS: Record<MountId, MountPose> = {
  'forward-0': {
    position: [-1.43, 0.5, 0],
    rotation: [-Math.PI / 2, 0, -Math.PI / 2],
    scale: [1, 1, 1],
    normal: [1, 0, 0],
  },
  'side-0': side(1.6, 0, 2.11, -1),
  'side-1': side(-1.0, 0, 2.11, -1),
  'side-2': side(1.6, 0, 2.11, 1),
  'side-3': side(-1.0, 0, 2.11, 1),
}
