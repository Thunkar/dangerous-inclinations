/**
 * The railgun: a heavy spinal gun standing out of the bow collar. A faceted
 * breech block sits low in a saddle of two chamfered cheeks, clamped by a
 * steel band, with a capacitor bank on each flank bussed into the rails.
 * Two deep parallel rails rise out of the breech with an open channel
 * between them, each face lined with steel lips and a cyan conductor sunk
 * between them, armoured outside and held at intervals by faceted insulator
 * clamps that leave the channel face bare. Bow only, so the frame is the
 * bow's: +Y out of the nose, X across it, Z dorsal/ventral.
 */
import { Group } from 'three'
import { armoredSection, type Station } from '../loft'
import type { ModuleBuild } from '../modules'

type Vec3 = [number, number, number]

/** Turns a loft along +X to run along +Y (its section's height then lies along -X). */
const UP: Vec3 = [0, 0, Math.PI / 2]

/** The rail's centre across the bow and its half width across. */
const RAIL = { x: 0.27, h: 0.12 }
/** The rail's half depth (dorsal to ventral) at y: deep at the breech, tapering to the muzzle. */
const depth = (y: number) => 0.29 - (0.07 * (y - 0.8)) / 1.2
/** Where each clamp starts up the rail. */
const CLAMPS = [1.2, 1.56]

export const railgun: ModuleBuild = (kit, p) => {
  const { add, box, plate, fin, prism, m } = kit
  /** A loft standing along +Y at x: stations [y, half across, half depth, lift toward -x]. */
  const stand = (parent: Group, stations: Station[], mat = m.steel, x = 0) =>
    add(parent, armoredSection(stations), mat, [x, 0, 0], UP)

  plate(p, [1.64, 0.08, 1.06], [0, 0.26, 0], m.dark)

  // The breech: a faceted block the rails come out of, its shoulders
  // chamfered in to the rails' roots, under a pale cap.
  const breech = new Group()
  breech.name = 'railgun_breech'
  p.add(breech)
  stand(
    breech,
    [
      [0.28, 0.44, 0.37],
      [0.8, 0.44, 0.37],
      [0.94, 0.33, 0.29],
    ],
    m.hull
  )
  stand(
    breech,
    [
      [0.88, 0.34, 0.32],
      [0.98, 0.34, 0.32],
      [1.02, 0.31, 0.29],
    ],
    m.pale
  )
  // The armature's seat at the foot of the channel: steel ribs from rail to
  // rail with the cyan sunk between them.
  for (const z of [-0.2, 0, 0.2]) box(breech, [0.32, 0.1, 0.07], [0, 1.04, z], m.steel)
  for (const z of [-0.1, 0.1]) box(breech, [0.3, 0.07, 0.13], [0, 1.025, z], m.cyan)

  // The saddle: two chamfered cheeks along the block's dorsal and ventral
  // faces, and a steel clamp band round the block above them, tied down to
  // the cheeks by bolted feet.
  for (const s of [-1, 1])
    add(
      p,
      armoredSection([
        [-0.7, 0.13, 0.07, 0.41],
        [-0.56, 0.22, 0.07, 0.5],
        [0.56, 0.22, 0.07, 0.5],
        [0.7, 0.13, 0.07, 0.41],
      ]),
      m.pale,
      [0, 0, s * 0.4]
    )
  stand(p, [
    [0.66, 0.44, 0.37],
    [0.72, 0.485, 0.415],
    [0.8, 0.485, 0.415],
    [0.83, 0.455, 0.385],
  ])
  for (const s of [-1, 1])
    for (const x of [-0.3, 0, 0.3]) {
      box(p, [0.08, 0.1, 0.08], [x, 0.75, s * 0.42], m.steel)
      prism(p, 6, 0.04, 0.06, [x, 0.8, s * 0.42], m.dark)
    }

  for (const side of [-1, 1]) {
    const flank = new Group()
    flank.name = `railgun_${side < 0 ? 'port' : 'starboard'}`
    if (side < 0) flank.rotation.y = Math.PI
    p.add(flank)

    // The capacitor bank on the block's flank, slatted down its outer face,
    // under a pale cover with two terminals bussed into the rail and a cyan
    // charge slit sunk between steel ribs.
    stand(
      flank,
      [
        [0.3, 0.205, 0.36],
        [0.9, 0.205, 0.36],
      ],
      m.dark,
      0.585
    )
    for (let i = 0; i < 4; i++)
      box(flank, [0.07, 0.42, 0.07], [0.785, 0.47, -0.225 + i * 0.15], m.steel)
    plate(flank, [0.38, 0.06, 0.7], [0.59, 0.9, 0], m.pale)
    for (const z of [-0.075, 0.075]) box(flank, [0.24, 0.08, 0.07], [0.62, 0.94, z], m.steel)
    box(flank, [0.2, 0.07, 0.12], [0.62, 0.93, 0], m.cyan)
    for (const z of [-0.24, 0.24]) {
      prism(flank, 6, 0.06, 0.1, [0.66, 0.95, z], m.steel)
      box(flank, [0.32, 0.08, 0.07], [0.52, 0.94, z * 0.85], m.copper)
    }

    // The rail: steel, deep, its muzzle chamfered in from the outside so
    // the channel keeps its width to the tip.
    const rail = stand(
      flank,
      [
        [0.8, RAIL.h, depth(0.8)],
        [1.98, RAIL.h, depth(1.98)],
        [2.05, RAIL.h - 0.03, depth(2.05) - 0.04, 0.03],
      ],
      m.steel,
      RAIL.x
    )
    rail.name = `accelerator_rail_${side < 0 ? 'port' : 'starboard'}`
    // The channel face: steel lips at its edges and the cyan conductor sunk
    // between them, both rising out of the breech.
    const inner = RAIL.x - RAIL.h
    for (const z of [-0.15, 0.15]) box(flank, [0.07, 1.17, 0.07], [inner, 1.415, z], m.steel)
    box(flank, [0.07, 1.14, 0.24], [inner + 0.015, 1.4, 0], m.cyan)

    // Pale armour along the rail's outer face, under the clamps.
    const outer = RAIL.x + RAIL.h
    fin(
      flank,
      [
        [outer - 0.04, 0.96],
        [outer + 0.03, 1.05],
        [outer + 0.03, 1.86],
        [outer - 0.04, 1.89],
      ],
      0.34,
      m.hull
    )

    // Insulator clamps: faceted, wrapping the rail but standing back of
    // the channel face so the lips and the conductor run on through them,
    // each with a steel strap on its outer face; a dark crown at the
    // muzzle, of a piece with them.
    const clamp = (y: number, length: number, mat = m.dark) => {
      const top = y + length
      stand(
        flank,
        [
          [y, RAIL.h, depth(y)],
          [y + 0.08, RAIL.h + 0.035, depth(y + 0.08) + 0.05, -0.025],
          [top, RAIL.h + 0.035, depth(top) + 0.05, -0.025],
          [top + 0.03, RAIL.h + 0.015, depth(top) + 0.03, -0.01],
        ],
        mat,
        RAIL.x
      )
    }
    for (const y of CLAMPS) {
      clamp(y, 0.16)
      fin(
        flank,
        [
          [outer - 0.02, y],
          [outer + 0.09, y + 0.13],
          [outer + 0.09, y + 0.19],
          [outer - 0.02, y + 0.23],
        ],
        0.32,
        m.steel
      )
    }
    clamp(1.88, 0.12)
  }
}
