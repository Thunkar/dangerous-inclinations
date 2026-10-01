/**
 * The heat tracker's mat with no React in it: the loadout, the energy on it,
 * the broken slots and the heat track, and the two things that happen to it
 * on other players' turns. Both are the engine's rules played by hand: a
 * shield soaking a point spends its energy, in the order the engine walks the
 * shields, and leaves the track alone; a break dumps a subsystem's energy onto
 * the track. `heatMat.test.ts` holds them to the engine on a built ship.
 */
import type { SubsystemType } from '@dangerous-inclinations/engine'
import { SHIELD_ENERGY_PER_POINT } from '@dangerous-inclinations/engine'
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
  broken: SlotId[]
  track: number
  /** This turn's heat check is done; the energy stays on until the next turn starts. */
  checked: boolean
}

export const typeAt = (mat: Mat, slot: SlotId): SubsystemType =>
  slot in mat.loadout ? mat.loadout[slot as MountId] : (slot as FixedId)

/** The shield that soaks the next point: the first, in slot order, with a point's energy on it. */
export function absorbingShield(mat: Mat): SlotId | undefined {
  return SLOTS.find(
    slot =>
      typeAt(mat, slot) === 'shields' &&
      !mat.broken.includes(slot) &&
      (mat.energy[slot] ?? 0) >= SHIELD_ENERGY_PER_POINT
  )
}

/** A shield soaks one point: its energy comes off, and the track is untouched. */
export function absorbPoint(mat: Mat): Mat {
  const shield = absorbingShield(mat)
  if (!shield) return mat
  return {
    ...mat,
    energy: { ...mat.energy, [shield]: (mat.energy[shield] ?? 0) - SHIELD_ENERGY_PER_POINT },
  }
}

/** A break dumps the subsystem's energy onto the track; breaking a broken one does nothing. */
export function breakSlot(mat: Mat, slot: SlotId): Mat {
  if (mat.broken.includes(slot)) return mat
  return {
    ...mat,
    broken: [...mat.broken, slot],
    energy: { ...mat.energy, [slot]: 0 },
    track: Math.min(TRACK_CEILING, mat.track + (mat.energy[slot] ?? 0)),
  }
}
