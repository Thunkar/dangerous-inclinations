/**
 * The heat check's mat as this browser keeps it, so a phone locking does not
 * lose the heat track, the one number a table cannot re-derive. A stored mat
 * is read back only as far as it still fits the rules: a subsystem a slot
 * cannot take, an energy the subsystem cannot stand at or a track past its
 * ceiling is dropped for the fresh mat's.
 */
import type { SubsystemType } from '@dangerous-inclinations/engine'
import { BOT_PRESET_LOADOUTS, SUBSYSTEM_CONFIGS } from '@dangerous-inclinations/engine'
import { MOUNTS } from '../../ships/mounts'
import { FORWARD_TILES, SIDE_TILES } from '../numbers'
import { SLOTS, TRACK_CEILING, typeAt, type Mat } from './heatMat'

const STORAGE_KEY = 'di.tools.heat'

const STARTING = BOT_PRESET_LOADOUTS.gunship

function freshMat(): Mat {
  return {
    loadout: {
      'forward-0': STARTING.forwardSlots[0] ?? 'railgun',
      'side-0': STARTING.sideSlots[0] ?? 'laser',
      'side-1': STARTING.sideSlots[1] ?? 'laser',
      'side-2': STARTING.sideSlots[2] ?? 'shields',
      'side-3': STARTING.sideSlots[3] ?? 'radiator',
    },
    energy: {},
    spent: {},
    broken: [],
    track: 0,
    checked: false,
  }
}

/** The settings a subsystem's energy can stand at: off, then each energy to the top. */
export function levelsOf(type: SubsystemType): number[] {
  const { minEnergy, maxEnergy } = SUBSYSTEM_CONFIGS[type]
  const levels = [0]
  if (maxEnergy === 0) return levels
  for (let e = minEnergy; e <= maxEnergy; e++) levels.push(e)
  return levels
}

/** A stored mat, or a fresh one: anything that no longer fits the rules is dropped. */
export function loadMat(): Mat {
  const mat = freshMat()
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!raw || typeof raw !== 'object') return mat
    for (const mount of MOUNTS) {
      const type = raw.loadout?.[mount.id]
      const legal = mount.group === 'forward' ? FORWARD_TILES : SIDE_TILES
      if (legal.includes(type)) mat.loadout[mount.id] = type
    }
    mat.broken = SLOTS.filter(slot => raw.broken?.includes(slot))
    for (const slot of SLOTS) {
      const e = raw.energy?.[slot]
      if (!mat.broken.includes(slot) && levelsOf(typeAt(mat, slot)).includes(e) && e > 0) {
        mat.energy[slot] = e
      }
    }
    if (Number.isInteger(raw.track) && raw.track >= 0 && raw.track <= TRACK_CEILING) {
      mat.track = raw.track
    }
    mat.checked = raw.checked === true
  } catch {
    // Nothing stored, or a private window: a fresh mat.
  }
  return mat
}

export function saveMat(mat: Mat): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mat))
  } catch {
    // A private window refuses to store; the mat still works this visit.
  }
}
