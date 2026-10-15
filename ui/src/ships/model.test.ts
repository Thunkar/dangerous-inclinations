/**
 * A module is the same shape wherever the shipyard holds it: changing the
 * loadout while the view is exploded (modules pulled out of their mounts)
 * builds the module exactly as it builds it seated.
 */
import { expect, it } from 'vitest'
import { Box3 } from 'three'
import { DEFAULT_CONFIG, setModule } from './config'
import { createShip, poseShip, type ShipModel } from './model'

const sizeOf = (model: ShipModel) => {
  const module = model.mounts.get('side-0')!.module
  module.updateMatrixWorld(true)
  return new Box3().setFromObject(module).getSize(module.position.clone()).toArray()
}

it.each([0, 1])('builds a module the same with the view exploded %d', exploded => {
  const seated = createShip(setModule(DEFAULT_CONFIG, 'side-0', 'laser'))
  const model = createShip(setModule(DEFAULT_CONFIG, 'side-0', 'radiator'))
  poseShip(model, exploded, null)
  model.update(setModule(DEFAULT_CONFIG, 'side-0', 'laser'))
  for (const [a, b] of sizeOf(model).map((n, i) => [n, sizeOf(seated)[i]]))
    expect(a).toBeCloseTo(b, 6)
  seated.dispose()
  model.dispose()
})
