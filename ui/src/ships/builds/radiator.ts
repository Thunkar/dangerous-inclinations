/**
 * The radiator: two radiative panels along the hull, canted open like a book
 * off a faceted dark manifold with a copper header down its spine. Local Z is
 * the ship's vertical on a flank. The panels stand at 55 degrees, so both
 * broad faces show and neither faces down past 35 degrees from vertical when
 * the module prints standing on its foot. Their upper faces carry ribs up the
 * slope, a cyan coolant line along the inner edge and copper headers along
 * both edges, fed from the spine; their undersides a frame of stringers and
 * cross ribs, held off the manifold by steel gussets that stand as walls in
 * the print.
 */
import { Group } from 'three'
import { armoredSection } from '../loft'
import type { ModuleBuild } from '../modules'

/**
 * The whole radiator is drawn at full size and built at nine tenths of it,
 * about the base plate's top (module y 0.22), so it is no bigger than the
 * other modules.
 */
const SCALE = 0.9
const PLATE_TOP = 0.22
/** How far each panel is canted from lying flat on the hull. */
const CANT = (55 * Math.PI) / 180
const PANEL = { length: 1.83, thick: 0.08, width: 0.7, at: 0.5, out: 0.3 }

export const radiator: ModuleBuild = (k, module) => {
  const { dark, steel, copper, pale, red, cyan } = k.m
  const p = new Group()
  p.name = 'radiator'
  p.scale.setScalar(SCALE)
  p.position.y = PLATE_TOP * (1 - SCALE)
  module.add(p)
  // The manifold: a faceted dark spine the panels hinge off, its copper
  // header laid along the top, a pale cap at each end with a red telltale.
  k.add(p, armoredSection([[-0.82, 0.085, 0.21, 0.3], [0.82, 0.085, 0.21, 0.3]]), dark)
  k.pipe(p, [-0.81, 0.41, 0], [0.81, 0.41, 0], 0.05, copper)
  for (const x of [-0.86, 0.86]) {
    k.plate(p, [0.1, 0.24, 0.46], [x, 0.34, 0], pale)
    k.box(p, [0.07, 0.07, 0.12], [x * 1.04, 0.38, 0], red)
  }
  for (const side of [-1, 1]) {
    const panel = new Group()
    panel.name = `radiator_panel_${side}`
    panel.position.set(0, PANEL.at, side * PANEL.out)
    // Turned about X, the panel's outer edge rises and its face looks up and
    // in, into the opening between the two.
    panel.rotation.x = -side * CANT
    p.add(panel)
    const { length, thick, width } = PANEL
    k.plate(panel, [length, thick, width], [0, 0, 0], steel)
    for (const face of [-1, 1]) k.plate(panel, [1.7, 0.02, 0.58], [0, face * 0.05, 0], dark)
    // The upper face: ribs running up the slope, a cyan coolant line along
    // the inner edge.
    for (let i = 0; i < 9; i++)
      k.box(panel, [0.07, 0.035, 0.54], [-0.72 + i * 0.18, 0.075, 0], steel)
    k.box(panel, [1.62, 0.025, 0.05], [0, 0.07, -side * 0.31], cyan)
    // The underside: two stringers along it and cross ribs between them.
    for (const z of [-0.18, 0.18]) k.box(panel, [1.7, 0.045, 0.06], [0, -0.075, z], steel)
    for (let i = 0; i < 5; i++)
      k.box(panel, [0.06, 0.035, 0.42], [-0.68 + i * 0.34, -0.07, 0], steel)
    // A copper header along each long edge.
    for (const edge of [-1, 1])
      k.pipe(panel, [-0.88, 0, (edge * width) / 2], [0.88, 0, (edge * width) / 2], 0.04, copper)
    // Feeds from the spine's header to the panel, and a steel hinge block at
    // each end where it meets the spine.
    for (const x of [-0.7, 0.7]) {
      k.pipe(p, [x, 0.41, 0], [x, PANEL.at, side * PANEL.out], 0.04, copper)
      k.plate(p, [0.14, 0.18, 0.2], [x * 1.17, 0.35, side * 0.17], steel)
    }
    // Gussets from the base plate up to the panel's underside, in the
    // plane across the module: the panel's underside line, at its foot on
    // the plate, and back into the manifold.
    const c = Math.cos(CANT)
    const sn = Math.sin(CANT)
    // The underside's line: the panel's centre, less half its thickness and
    // the frame's depth along the panel's normal, along its width.
    const under = (t: number): [number, number] => {
      const y = PANEL.at - 0.09 * c + t * sn
      const z = side * (PANEL.out + 0.09 * sn + t * c)
      return [y, z]
    }
    const [ay, az] = under(-0.28)
    const [by, bz] = under(0.22)
    for (const x of [-0.62, 0, 0.62]) {
      const gusset = k.fin(
        p,
        [
          [-az, ay],
          [-bz, by],
          [-bz, 0.23],
          [-az, 0.23],
        ],
        0.06,
        steel,
        [0, Math.PI / 2, 0]
      )
      gusset.position.x = x
    }
  }
}
