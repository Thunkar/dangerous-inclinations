/**
 * The heat tracker plays the engine's rules by hand, so it is held to the
 * engine on a built ship: a shield soaking a shot (`resolveAttack` with the
 * shot's damage, plasma at its own rate) and a critical breaking a slot
 * (`breakSubsystem`) must leave the same energy on every slot, the same
 * slots broken and the same heat on the track as the mat does. Every point
 * absorbed is a point on the track, so a soak moves the track by what the
 * shields stopped.
 */
import { describe, expect, it } from 'vitest'
import type { ShipLoadout, ShipState, SubsystemType } from '@dangerous-inclinations/engine'
import {
  breakSubsystem,
  resolveAttack,
  rollToResult,
  updateSubsystem,
} from '@dangerous-inclinations/engine'
import { makePlayer } from '../../../../engine/src/test/testUtils.ts'
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
  let ship = makePlayer('p1', undefined, loadout).ship
  for (const slot of SLOTS) {
    const cubes = mat.energy[slot] ?? 0
    if (cubes > 0) ship = updateSubsystem(ship, slot, { allocatedEnergy: cubes })
  }
  return { ...ship, heat: { currentHeat: mat.track } }
}

/** What the mat shows of a ship: the energy on every slot, the broken slots and the track. */
function reading(ship: ShipState) {
  const energy: Energy = {}
  for (const slot of SLOTS) {
    const cubes = ship.subsystems.find(s => s.id === slot)?.allocatedEnergy ?? 0
    if (cubes > 0) energy[slot] = cubes
  }
  const broken = SLOTS.filter(slot => ship.subsystems.find(s => s.id === slot)?.isBroken)
  return { energy, broken, track: ship.heat.currentHeat }
}

function matReading(mat: Mat) {
  const energy: Energy = {}
  for (const slot of SLOTS) if ((mat.energy[slot] ?? 0) > 0) energy[slot] = mat.energy[slot]
  const broken = SLOTS.filter(slot => mat.broken.includes(slot))
  return { energy, broken, track: mat.track }
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

/** The default hull: no sensor, so the roll above is a plain hit. */
const ATTACKER = makePlayer('p2').ship

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

  const BREAKS: Array<[SlotId, Mat]> = [
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
    expect(matReading(breakSlot(mat, slot))).toEqual(reading(broken.ship))
  })
})

describe('a rack answering missiles', () => {
  const RACKED = matOf('railgun', ['ballistic_rack', 'laser', 'shields', 'radiator'], {}, 3)
  it.each<[string, Mat, number]>([
    // RULES §Weapons: answering a turn's missiles is a flat 2 heat.
    ['a rack up', { ...RACKED, energy: { 'side-0': 2 } }, 2],
    ['a rack down', RACKED, 0],
    ['a broken rack', { ...RACKED, energy: { 'side-0': 2 }, broken: ['side-0'] }, 0],
  ])('puts the heat of answering on the track with %s', (_label, mat, added) => {
    const after = rackAnswers(mat)
    expect(after.track - mat.track).toBe(added)
    expect(after.energy).toEqual(mat.energy)
  })
})
