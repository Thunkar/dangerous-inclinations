/**
 * Every mesh the yard builds is described as a solid (`solid.ts`), so the
 * printed model can rebuild the ship: on every hull, with the default loadout
 * and with each subsystem in every mount it may take, and on the station, `placedSolids` finds a
 * description on every mesh, a named paint on it, and finite transforms.
 */
import { describe, expect, it } from 'vitest'
import { Mesh, type Object3D } from 'three'
import {
  DEFAULT_SHIP_APPEARANCE,
  INSTALLABLE_SUBSYSTEMS,
  canInstallInSlot,
  type Hull,
  type SubsystemType,
} from '@dangerous-inclinations/engine'
import {
  DEFAULT_CONFIG,
  MOUNTS,
  moduleAt,
  setModule,
  type MountId,
  type ShipConfig,
} from './config'
import { createShip } from './model'
import { placedSolids } from './solid'
import { createStation } from './station'

const HULLS: Hull[] = ['corvette', 'shrike', 'mantis']

const onHull = (hull: Hull): ShipConfig => ({
  ...DEFAULT_CONFIG,
  appearance: { ...DEFAULT_SHIP_APPEARANCE, hull },
})

const finite16 = (m: number[]) => m.length === 16 && m.every(Number.isFinite)

function expectDescribed(config: ShipConfig) {
  expectModelDescribed(createShip(config))
}

function expectModelDescribed({ root, dispose }: { root: Object3D; dispose: () => void }) {
  let meshes = 0
  root.traverse(object => {
    if (object instanceof Mesh) meshes++
  })
  const solids = placedSolids(root)
  expect(meshes).toBeGreaterThan(0)
  expect(solids).toHaveLength(meshes)
  for (const solid of solids) {
    expect(finite16(solid.matrix)).toBe(true)
    if (solid.spec.bake) expect(finite16(solid.spec.bake)).toBe(true)
    expect(solid.material).not.toBe('')
  }
  dispose()
}

describe('ship solids', () => {
  it.each(HULLS)('describes every mesh of the default %s', hull => {
    expectDescribed(onHull(hull))
  })

  const placements: [Hull, MountId, SubsystemType][] = HULLS.flatMap(hull =>
    MOUNTS.flatMap(mount =>
      INSTALLABLE_SUBSYSTEMS.filter(type => canInstallInSlot(type, mount.group)).map(
        (type): [Hull, MountId, SubsystemType] => [hull, mount.id, type]
      )
    )
  )
  it.each(placements)('describes every mesh of a %s with %s holding %s', (hull, mount, type) => {
    const config = setModule(onHull(hull), mount, type)
    expect(moduleAt(config, mount)).toBe(type)
    expectDescribed(config)
  })

  it('describes every mesh of the station', () => {
    expectModelDescribed(createStation('#3fa7d6'))
  })
})
