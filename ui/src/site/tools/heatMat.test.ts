/**
 * The heat tracker plays the engine's rules by hand, so it is held to the
 * engine on a built ship: a shield soaking a shot (`resolveAttack` with the
 * shot's damage, plasma at its own rate) and a critical breaking a slot
 * (`breakSubsystem`) must leave the same energy on every slot and the same
 * heat on the track as the mat does. Every point absorbed is a point on the
 * track, so a soak moves the track by what the shields stopped.
 */
import { describe, expect, it } from 'vitest'
import type { ShipLoadout, ShipState, SubsystemType } from '@dangerous-inclinations/engine'
import {
  INTERCEPT_HEAT,
  breakSubsystem,
  createInitialShipState,
  resolveAttack,
  rollToResult,
  updateSubsystem,
} from '@dangerous-inclinations/engine'
import type { MountId } from '../../ships/mounts'
import { PLASMA_SHIELD_POINTS, weaponStats } from '../numbers'
import { SLOTS, absorb, breakSlot, rackAnswers, type Mat, type SlotId } from './heatMat'

type Energy = Partial<Record<SlotId, number>>

const SIDES: MountId[] = ['side-0', 'side-1', 'side-2', 'side-3']

function matOf(forward: SubsystemType, sides: SubsystemType[], energy: Energy, track = 0): Mat {
  return {
    loadout: {
      'forward-0': forward,
      'side-0': sides[0],
      'side-1': sides[1],
      'side-2': sides[2],
      'side-3': sides[3],
    },
    energy,
    broken: [],
    track,
    checked: false,
  }
}

/** The same mat as a ship: the loadout built by the engine, the energy put on its slots. */
function shipOf(mat: Mat): ShipState {
  const loadout: ShipLoadout = {
    forwardSlots: [mat.loadout['forward-0']],
    sideSlots: SIDES.map(id => mat.loadout[id]) as ShipLoadout['sideSlots'],
  }
  let ship = createInitialShipState(
    { wellId: 'blackhole', ring: 3, sector: 0, facing: 'prograde' },
    loadout
  )
  for (const slot of SLOTS) {
    const cubes = mat.energy[slot] ?? 0
    if (cubes > 0) ship = updateSubsystem(ship, slot, { allocatedEnergy: cubes })
  }
  return { ...ship, heat: { currentHeat: mat.track } }
}

/** What the mat shows of a ship: the energy on every slot and the track. */
function reading(ship: ShipState) {
  const energy: Energy = {}
  for (const slot of SLOTS) {
    const cubes = ship.subsystems.find(s => s.id === slot)?.allocatedEnergy ?? 0
    if (cubes > 0) energy[slot] = cubes
  }
  return { energy, track: ship.heat.currentHeat }
}

function matReading(mat: Mat) {
  const energy: Energy = {}
  for (const slot of SLOTS) if ((mat.energy[slot] ?? 0) > 0) energy[slot] = mat.energy[slot]
  return { energy, track: mat.track }
}

/** A roll that hits and is not a critical, whatever the attacker runs. */
const HIT = Array.from({ length: 10 }, (_, i) => i + 1).find(roll => rollToResult(roll) === 'hit')!

const WALLS: Array<[string, Mat]> = [
  [
    'one full wall',
    matOf('railgun', ['shields', 'laser', 'radiator', 'radiator'], { 'side-0': 2 }),
  ],
  [
    'one half wall',
    matOf('railgun', ['shields', 'laser', 'radiator', 'radiator'], { 'side-0': 1 }, 4),
  ],
  [
    'two walls, the first half up',
    matOf('railgun', ['shields', 'shields', 'radiator', 'laser'], { 'side-0': 1, 'side-1': 2 }, 3),
  ],
  [
    'two walls, the first down',
    matOf('sensor_array', ['laser', 'shields', 'shields', 'radiator'], { 'side-2': 2 }),
  ],
  [
    'a wall in the bow and one on the side',
    matOf(
      'shields',
      ['shields', 'laser', 'radiator', 'radiator'],
      { 'forward-0': 1, 'side-0': 2 },
      5
    ),
  ],
  ['no wall up', matOf('railgun', ['shields', 'laser', 'radiator', 'radiator'], {}, 2)],
]

const ATTACKER = shipOf(matOf('railgun', ['laser', 'laser', 'radiator', 'radiator'], {}))

/** Energy on the mat's working shields: what a soak can spend. */
const shieldEnergy = (mat: Mat) =>
  SLOTS.filter(slot => slot in mat.loadout && mat.loadout[slot as MountId] === 'shields').reduce(
    (sum, slot) => sum + (mat.energy[slot] ?? 0),
    0
  )

const PLASMA = weaponStats('plasma_cannon').damage

describe('the heat mat against the engine', () => {
  it.each(WALLS)('soaks a point where the engine does: %s', (_name, mat) => {
    const hit = resolveAttack(shipOf(mat), 'p1', 1, 'engines', HIT, ATTACKER, 'p2')
    expect(matReading(absorb(mat, 1))).toEqual(reading(hit.ship))
  })

  it.each(WALLS)('soaks a second point where the engine does: %s', (_name, mat) => {
    const hit = resolveAttack(shipOf(mat), 'p1', 2, 'engines', HIT, ATTACKER, 'p2')
    expect(matReading(absorb(absorb(mat, 1), 1))).toEqual(reading(hit.ship))
    expect(matReading(absorb(mat, 2))).toEqual(reading(hit.ship))
  })

  it.each(WALLS)('stops a plasma bolt where the engine does: %s', (_name, mat) => {
    const hit = resolveAttack(shipOf(mat), 'p1', PLASMA, 'engines', HIT, ATTACKER, 'p2', {
      shieldPointsPerEnergy: PLASMA_SHIELD_POINTS,
    })
    expect(matReading(absorb(mat, PLASMA, PLASMA_SHIELD_POINTS))).toEqual(reading(hit.ship))
  })

  it.each(WALLS)('puts every point a soak stopped on the track: %s', (_name, mat) => {
    const stopped = Math.min(1, shieldEnergy(mat))
    expect(absorb(mat, 1).track).toBe(mat.track + stopped)
    const plasma = Math.min(PLASMA, shieldEnergy(mat) * PLASMA_SHIELD_POINTS)
    expect(absorb(mat, PLASMA, PLASMA_SHIELD_POINTS).track).toBe(mat.track + plasma)
  })

  const BREAKS: Array<[SlotId, Mat]> = [
    ['side-0', WALLS[1][1]],
    [
      'forward-0',
      matOf('sensor_array', ['laser', 'shields', 'radiator', 'radiator'], { 'forward-0': 2 }, 4),
    ],
    [
      'engines',
      matOf('railgun', ['laser', 'shields', 'radiator', 'radiator'], { engines: 3, 'side-1': 2 }),
    ],
    ['side-3', matOf('railgun', ['laser', 'shields', 'radiator', 'radiator'], { 'side-1': 2 }, 1)],
  ]

  it.each(BREAKS)('dumps what the engine dumps when %s breaks', (slot, mat) => {
    const broken = breakSubsystem(shipOf(mat), 'p1', slot)
    const after = breakSlot(mat, slot)
    expect(matReading(after)).toEqual(reading(broken.ship))
    expect(after.broken).toContain(slot)
  })
})

describe('a rack answering missiles', () => {
  const RACKED = matOf('railgun', ['ballistic_rack', 'laser', 'shields', 'radiator'], {}, 3)
  it.each<[string, Mat, number]>([
    ['a rack up', { ...RACKED, energy: { 'side-0': 2 } }, INTERCEPT_HEAT],
    ['a rack down', RACKED, 0],
    ['a broken rack', { ...RACKED, energy: { 'side-0': 2 }, broken: ['side-0'] }, 0],
  ])("puts the engine's heat on the track with %s", (_label, mat, added) => {
    const after = rackAnswers(mat)
    expect(after.track - mat.track).toBe(added)
    expect(after.energy).toEqual(mat.energy)
  })
})
