/**
 * The radiator: two radiative panels along the hull, canted open like a book
 * off a dark manifold with a copper header down its spine. Local Z is the
 * ship's vertical on a flank. The panels stand at 55 degrees, so both broad
 * faces show and neither faces down past 35 degrees from vertical when the
 * module prints standing on its foot; their ribs run up the slope, and copper
 * headers run along their edges, fed from the spine.
 */
import { Group } from 'three'
import type { ModuleBuild } from '../modules'

/** How far each panel is canted from lying flat on the hull. */
const CANT = (55 * Math.PI) / 180
const PANEL = { length: 1.83, thick: 0.08, width: 0.7, at: 0.5, out: 0.3 }

export const radiator: ModuleBuild = (k, p) => {
  const { dark, steel, copper, pale, red } = k.m
  // The manifold: the dark spine the panels hinge off, its copper header
  // laid along the top, a pale cap at each end with a red telltale.
  k.plate(p, [1.65, 0.16, 0.42], [0, 0.3, 0], dark)
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
    // Ribs on the upper face, running up the slope.
    for (let i = 0; i < 9; i++)
      k.box(panel, [0.07, 0.035, 0.54], [-0.72 + i * 0.18, 0.075, 0], steel)
    // A copper header along each long edge.
    for (const edge of [-1, 1])
      k.pipe(panel, [-0.88, 0, (edge * width) / 2], [0.88, 0, (edge * width) / 2], 0.04, copper)
    // Feeds from the spine's header to the panel, and a steel hinge block at
    // each end where it meets the spine.
    for (const x of [-0.7, 0.7]) {
      k.pipe(p, [x, 0.41, 0], [x, PANEL.at, side * PANEL.out], 0.04, copper)
      // Inside the end cap's outline, so no face of one lies on a face of the other.
      k.plate(p, [0.14, 0.18, 0.2], [x * 1.17, 0.35, side * 0.17], steel)
    }
  }
}
