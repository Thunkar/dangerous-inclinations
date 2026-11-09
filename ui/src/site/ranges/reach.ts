/**
 * What each range card draws: the sectors round a ship that a weapon (or the
 * sensor's scan) reaches, in the ship's own frame. Nothing here is a rule of
 * its own: every cell is asked of the engine's targeting (`isInWeaponRange`,
 * `inScanRange`) from a ship on black hole ring 3 facing prograde.
 *
 * The frame is the ship's: `ahead` counts sectors in the direction it faces,
 * `port` counts rings to its left. Facing prograde, port looks outward, and
 * facing retrograde it looks inward (RULES §Weapons), so one picture drawn
 * round the ship is right for both facings.
 */
import {
  BLACK_HOLE_ID,
  SUBSYSTEM_CONFIGS,
  inScanRange,
  isInWeaponRange,
} from '@dangerous-inclinations/engine'
import type { Position, Subsystem, SubsystemType } from '@dangerous-inclinations/engine'

/** The range cards: the six weapons and the sensor's scan. */
export const RANGE_CARDS = [
  'railgun',
  'laser',
  'plasma_cannon',
  'ballistic_rack',
  'disruptor',
  'missiles',
  'sensor_array',
] as const satisfies readonly SubsystemType[]
export type RangeCardType = (typeof RANGE_CARDS)[number]

/** Which mounts reach a cell: a side weapon reaches one side from each flank. */
export type Zone = 'any' | 'port' | 'starboard'

export interface Cell {
  /** Sectors ahead (negative: astern). */
  ahead: number
  /** Rings to port (negative: to starboard). */
  port: number
  zone: Zone
  /** Missiles: reached anywhere in the well, so every cell is one. */
  wellwide?: boolean
  /** Missiles: the steps of the first flight it takes to get there, if it gets there. */
  steps?: number
}

/** The patch every card draws: two rings each side, five sectors each way. */
export const PATCH = { rings: 2, sectors: 5 } as const

const SHIP_RING = 3
const SHIP_SECTOR = 12
const SHIP = {
  wellId: BLACK_HOLE_ID,
  ring: SHIP_RING,
  sector: SHIP_SECTOR,
  facing: 'prograde' as const,
}

/** Facing prograde, port is outward: a ring to port is a ring further out. */
const target = (ahead: number, port: number): Position => ({
  wellId: BLACK_HOLE_ID,
  ring: SHIP_RING + port,
  sector: SHIP_SECTOR + ahead,
})

function mounted(type: SubsystemType, side: 'port' | 'starboard' | 'bow'): Subsystem {
  return {
    id: 'probe',
    type,
    allocatedEnergy: 0,
    usedThisTurn: false,
    spentThisTurn: 0,
    isBroken: false,
    isRevealed: true,
    slotGroup: side === 'bow' ? 'forward' : 'side',
    slotIndex: side === 'starboard' ? 2 : 0,
  }
}

function each(fn: (ahead: number, port: number) => Cell | null): Cell[] {
  const cells: Cell[] = []
  for (let port = -PATCH.rings; port <= PATCH.rings; port++)
    for (let ahead = -PATCH.sectors; ahead <= PATCH.sectors; ahead++) {
      if (ahead === 0 && port === 0) continue
      const cell = fn(ahead, port)
      if (cell) cells.push(cell)
    }
  return cells
}

/** The cells a card shades, the ship's own sector left out (point blank is every weapon's). */
export function reach(type: RangeCardType): Cell[] {
  if (type === 'sensor_array')
    return each((ahead, port) =>
      inScanRange(SHIP, target(ahead, port)) ? { ahead, port, zone: 'any' } : null
    )
  const stats = SUBSYSTEM_CONFIGS[type].weaponStats!
  if (stats.arc === 'turret') {
    // Anyone in the well; the first flight's steps are what the card counts.
    const steps = stats.stepsPerMove ?? 0
    return each((ahead, port) => {
      const n = Math.abs(ahead) + Math.abs(port)
      return { ahead, port, zone: 'any', wellwide: true, steps: n <= steps ? n : undefined }
    })
  }
  const slots = SUBSYSTEM_CONFIGS[type].slotType
  if (slots === 'forward')
    return each((ahead, port) =>
      isInWeaponRange(mounted(type, 'bow'), SHIP, target(ahead, port))
        ? { ahead, port, zone: 'any' }
        : null
    )
  return each((ahead, port) => {
    const p = isInWeaponRange(mounted(type, 'port'), SHIP, target(ahead, port))
    const s = isInWeaponRange(mounted(type, 'starboard'), SHIP, target(ahead, port))
    if (p && s) return { ahead, port, zone: 'any' }
    if (p) return { ahead, port, zone: 'port' }
    if (s) return { ahead, port, zone: 'starboard' }
    return null
  })
}

/** Whether the card's weapon fires to one side only, so its picture has two colours. */
export const isOneSided = (type: RangeCardType) => reach(type).some(c => c.zone !== 'any')

/** The railgun's push: one ring against the facing, inward as the card draws it. */
export const recoils = (type: RangeCardType) =>
  type !== 'sensor_array' && SUBSYSTEM_CONFIGS[type].weaponStats?.hasRecoil === true

