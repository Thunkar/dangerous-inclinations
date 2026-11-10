/**
 * The heat tracker's mat with no React in it: the loadout, the energy on it,
 * the broken slots and the heat track, and the two things that happen to it
 * on other players' turns. Both are the engine's rules played by hand: a
 * shield soaking a shot spends its energy for the rest of that player's turn,
 * in the order the engine walks the shields, and puts every point it soaked
 * on the track; a break dumps a
 * subsystem's energy onto the track. `heatMat.test.ts` holds them to the
 * engine on a built ship.
 */
import type { Subsystem, SubsystemType } from '@dangerous-inclinations/engine'
import {
  INTERCEPT_HEAT,
  SHIELD_POINTS_PER_ENERGY,
  absorbOnShields,
} from '@dangerous-inclinations/engine'
import { MOUNTS } from '../../ships/mounts'
import type { MountId } from '../../ships/mounts'

export type FixedId = 'engines' | 'rotation' | 'scoop'
export type SlotId = MountId | FixedId

export const FIXED: FixedId[] = ['engines', 'rotation', 'scoop']
/** The loadout's slots in the engine's order, the forward slot first, then the fixed systems. */
export const SLOTS: SlotId[] = [...MOUNTS.map(mount => mount.id), ...FIXED]

/** A break dumps its energy between checks, so the track can stand over the top until yours. */
export const TRACK_CEILING = 30

export interface Mat {
  loadout: Record<MountId, SubsystemType>
  energy: Partial<Record<SlotId, number>>
  /**
   * Shield energy spent absorbing this player-turn: it stays on (and is heat
   * at the check) but stops nothing more until that player's turn ends.
   */
  spent: Partial<Record<SlotId, number>>
  broken: SlotId[]
  track: number
  /** This turn's heat check is done; the energy stays on until the next turn starts. */
  checked: boolean
}

export const typeAt = (mat: Mat, slot: SlotId): SubsystemType =>
  slot in mat.loadout ? mat.loadout[slot as MountId] : (slot as FixedId)

/** The mat as the engine's subsystems, in slot order, for the engine's rules to read. */
function subsystemsOf(mat: Mat): Subsystem[] {
  return SLOTS.map(slot => ({
    id: slot,
    type: typeAt(mat, slot),
    allocatedEnergy: mat.energy[slot] ?? 0,
    usedThisTurn: false,
    spentThisTurn: mat.spent[slot] ?? 0,
    isBroken: mat.broken.includes(slot),
    isRevealed: true,
  }))
}

/** The shield that soaks the next point: the first, in slot order, with energy ready. */
export function absorbingShield(mat: Mat): SlotId | undefined {
  return absorbOnShields(subsystemsOf(mat), 1, 1).shields[0]?.id as SlotId | undefined
}

/**
 * A shot of `damage` meets the shields as the engine meets it
 * (`absorbOnShields`): the cubes that absorbed are spent for the turn but
 * stay on, and every point absorbed goes onto the track. What the shields
 * cannot take is hull, which the mat does not keep.
 */
export function absorb(
  mat: Mat,
  damage: number,
  pointsPerEnergy: number = SHIELD_POINTS_PER_ENERGY
): Mat {
  const { shields } = absorbOnShields(subsystemsOf(mat), damage, pointsPerEnergy)
  if (shields.length === 0) return mat
  const spent = { ...mat.spent }
  let absorbed = 0
  for (const shield of shields) {
    const slot = shield.id as SlotId
    spent[slot] = (spent[slot] ?? 0) + shield.spent
    absorbed += shield.absorbed
  }
  return { ...mat, spent, track: Math.min(TRACK_CEILING, mat.track + absorbed) }
}

/** The attacker's turn ends: every shield is whole again for the next one. */
export function turnEnds(mat: Mat): Mat {
  return { ...mat, spent: {} }
}

/** Shield energy set aside this player-turn, waiting for that turn to end. */
export const spentCubes = (mat: Mat) =>
  Object.values(mat.spent).reduce((sum, n) => sum + (n ?? 0), 0)

/** A working ballistic rack with energy on it: one that answers missiles. */
export function upRack(mat: Mat): SlotId | undefined {
  return SLOTS.find(
    slot =>
      typeAt(mat, slot) === 'ballistic_rack' &&
      !mat.broken.includes(slot) &&
      (mat.energy[slot] ?? 0) > 0
  )
}

/**
 * A rack answers a turn's missiles: INTERCEPT_HEAT on the track, however many
 * it rolls at, and its energy stays on. Nothing without a rack up.
 */
export function rackAnswers(mat: Mat): Mat {
  if (!upRack(mat)) return mat
  return { ...mat, track: Math.min(TRACK_CEILING, mat.track + INTERCEPT_HEAT) }
}

/** A break dumps the subsystem's energy onto the track; breaking a broken one does nothing. */
export function breakSlot(mat: Mat, slot: SlotId): Mat {
  if (mat.broken.includes(slot)) return mat
  return {
    ...mat,
    broken: [...mat.broken, slot],
    energy: { ...mat.energy, [slot]: 0 },
    spent: { ...mat.spent, [slot]: 0 },
    track: Math.min(TRACK_CEILING, mat.track + (mat.energy[slot] ?? 0)),
  }
}
