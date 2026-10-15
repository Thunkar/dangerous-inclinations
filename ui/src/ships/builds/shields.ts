/**
 * The shields module, built from the yard's kit (see `../modules.ts` for the
 * frame and the kit): a field projector, the same module in every mount.
 *
 * A row of upright projector vanes stands on a dark plinth between two
 * capacitors, each vane with a cyan strip along its crest in a steel cap and
 * a cyan slit through the blade, the row highest in the middle. Two flat
 * plates close it dorsal and ventral, each cut to the outline of a dome and
 * edged in cyan, so from above or below the module shows the dome its icon
 * draws. Plates and vanes stand upright in the print and nothing hangs.
 */
import { Group } from 'three'
import { armoredSection } from '../loft'
import type { ModuleBuild, ModuleKit } from '../modules'

type Vec3 = [number, number, number]

/** Turns a loft along +X to run along +Y (its section's height then lies along -X). */
const UP: Vec3 = [0, 0, Math.PI / 2]

/** The plinth's top, where the vanes and the plates stand. */
const FLOOR = 0.36

/** A projector vane across the module at x: its outline in (z, y), a cyan crest in a steel cap, a cyan slit. */
function vane(k: ModuleKit, p: Group, x: number, outline: [number, number][], slitAt: number) {
  const { box, fin, m } = k
  const g = new Group()
  g.position.x = x
  p.add(g)
  fin(g, outline, 0.06, m.pale, [0, Math.PI / 2, 0])
  const top = Math.max(...outline.map(([, y]) => y))
  const crest = Math.max(...outline.filter(([, y]) => y === top).map(([z]) => Math.abs(z)))
  box(g, [0.08, 0.03, crest * 2 + 0.02], [0, top - 0.03, 0], m.steel)
  box(g, [0.09, 0.02, crest * 2 - 0.06], [0, top - 0.015, 0], m.cyan)
  box(g, [0.08, 0.02, 0.36], [0, slitAt, 0], m.cyan)
}

/** The dome's outline in (x, y), grown outward by `grow` for the cyan edge behind the plate. */
function dome(grow: number): [number, number][] {
  return [
    [-0.6 - grow, FLOOR],
    [0.6 + grow, FLOOR],
    [0.6 + grow, 0.54 + grow * 0.4],
    [0.32 + grow * 0.6, 0.88 + grow],
    [-0.32 - grow * 0.6, 0.88 + grow],
    [-0.6 - grow, 0.54 + grow * 0.4],
  ]
}

export const shields: ModuleBuild = (k, p) => {
  const { box, plate, fin, m } = k
  plate(p, [1.64, 0.08, 1.06], [0, 0.26, 0], m.dark)
  k.add(
    p,
    armoredSection([
      [0.3, 0.6, 0.48],
      [FLOOR, 0.6, 0.48],
    ]),
    m.dark,
    [0, 0, 0],
    UP
  )
  // Capacitors at both ends, armoured on top, slatted on their faces.
  for (const side of [-1, 1]) {
    const [a, b] = side < 0 ? [-0.86, -0.64] : [0.64, 0.86]
    k.add(
      p,
      armoredSection([
        [a, 0.14, 0.34, 0.44],
        [b, 0.14, 0.34, 0.44],
      ]),
      m.dark
    )
    plate(p, [0.2, 0.04, 0.56], [(a + b) / 2, 0.59, 0], m.pale)
    for (let i = 0; i < 5; i++)
      box(p, [0.03, 0.18, 0.04], [side * 0.865, 0.44, -0.24 + i * 0.12], m.steel)
    box(p, [0.12, 0.025, 0.02], [(a + b) / 2, 0.5, 0.345], m.cyan)
  }
  // The vanes, fore to aft, highest in the middle.
  const vanes = new Group()
  vanes.name = 'shields_vanes'
  p.add(vanes)
  for (const x of [-0.39, -0.26, -0.13, 0, 0.13, 0.26, 0.39]) {
    const h = 0.84 - Math.abs(x) * 0.5
    vane(
      k,
      vanes,
      x,
      [
        [-0.3, FLOOR],
        [0.3, FLOOR],
        [0.3, h - 0.1],
        [0.2, h],
        [-0.2, h],
        [-0.3, h - 0.1],
      ],
      0.48
    )
  }
  // The plates, dorsal and ventral, a cyan edge sandwiched in each.
  for (const z of [-0.38, 0.38]) {
    fin(p, dome(0), 0.06, m.pale).position.z = z
    fin(p, dome(0.025), 0.03, m.cyan).position.z = z
  }
}
