/**
 * The railgun: a heavy spinal gun standing out of the bow collar, short
 * enough to hide in a base pocket. A faceted
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

/**
 * How much of its drawn height each part of the gun keeps out of the plate,
 * so the gun hides in a base pocket no deeper than the rack's: the breech,
 * its clamp band and the capacitor banks (drawn up to 0.8) keep half, the
 * rails above them (drawn from 0.8 to 2.05) seven tenths. `Y` takes a drawn
 * height to its height, `L` a drawn length up the rails, `B` one in the breech.
 */
const BASE = 0.5
const RAILS = 0.7
const ROOT = 0.8
const Y = (y: number) =>
  y <= ROOT ? 0.3 + (y - 0.3) * BASE : 0.3 + (ROOT - 0.3) * BASE + (y - ROOT) * RAILS
const L = (length: number) => length * RAILS
const B = (length: number) => length * BASE
/** The rail's centre across the bow and its half width across. */
const RAIL = { x: 0.23, h: 0.08 }
/** The rail's half depth (dorsal to ventral) at y: deep at the breech, tapering to the muzzle. */
const depth = (y: number) => 0.2 - (0.05 * (y - Y(0.8))) / L(1.2)
/** Where each clamp starts up the rail. */
const CLAMPS = [Y(1.2), Y(1.56)]
/** The breech's half width across and half depth. */
const BREECH = { w: 0.41, d: 0.345 }

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
      [Y(0.28), BREECH.w, BREECH.d],
      [Y(0.8), BREECH.w, BREECH.d],
      [Y(0.94), BREECH.w - 0.11, BREECH.d - 0.08],
    ],
    m.hull
  )
  stand(
    breech,
    [
      [Y(0.88), BREECH.w - 0.1, BREECH.d - 0.05],
      [Y(0.98), BREECH.w - 0.1, BREECH.d - 0.05],
      [Y(1.02), BREECH.w - 0.13, BREECH.d - 0.08],
    ],
    m.pale
  )
  // The armature's seat at the foot of the channel: steel ribs from rail to
  // rail with the cyan sunk between them.
  for (const z of [-0.2, 0, 0.2]) box(breech, [0.32, 0.1, 0.07], [0, Y(1.04), z], m.steel)
  for (const z of [-0.1, 0.1]) box(breech, [0.3, 0.07, 0.13], [0, Y(1.025), z], m.cyan)

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
    [Y(0.66), BREECH.w, BREECH.d],
    [Y(0.72), BREECH.w + 0.045, BREECH.d + 0.045],
    [Y(0.8), BREECH.w + 0.045, BREECH.d + 0.045],
    [Y(0.83), BREECH.w + 0.015, BREECH.d + 0.015],
  ])
  for (const s of [-1, 1])
    for (const x of [-0.3, 0, 0.3]) {
      box(p, [0.08, 0.1, 0.08], [x, Y(0.75), s * 0.42], m.steel)
      prism(p, 6, 0.04, 0.06, [x, Y(0.8), s * 0.42], m.dark)
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
        [0.3, 0.13, 0.24],
        [Y(0.72), 0.13, 0.24],
      ],
      m.dark,
      0.51
    )
    for (let i = 0; i < 3; i++)
      box(flank, [0.07, B(0.3), 0.07], [0.645, Y(0.5), -0.15 + i * 0.15], m.steel)
    plate(flank, [0.28, 0.06, 0.5], [0.51, Y(0.72), 0], m.pale)
    for (const z of [-0.06, 0.06]) box(flank, [0.18, 0.08, 0.07], [0.52, Y(0.76), z], m.steel)
    box(flank, [0.15, 0.07, 0.1], [0.52, Y(0.75), 0], m.cyan)
    for (const z of [-0.17, 0.17]) {
      prism(flank, 6, 0.05, 0.08, [0.56, Y(0.77), z], m.steel)
      box(flank, [0.26, 0.07, 0.07], [0.42, Y(0.76), z * 0.85], m.copper)
    }

    // The rail: steel, deep, its muzzle chamfered in from the outside so
    // the channel keeps its width to the tip.
    const rail = stand(
      flank,
      [
        [Y(0.8), RAIL.h, depth(Y(0.8))],
        [Y(1.98), RAIL.h, depth(Y(1.98))],
        [Y(2.05), RAIL.h - 0.03, depth(Y(2.05)) - 0.04, 0.03],
      ],
      m.steel,
      RAIL.x
    )
    rail.name = `accelerator_rail_${side < 0 ? 'port' : 'starboard'}`
    // The channel face: steel lips at its edges and the cyan conductor sunk
    // between them, both rising out of the breech.
    const inner = RAIL.x - RAIL.h
    for (const z of [-0.15, 0.15])
      box(flank, [0.07, L(1.17), 0.07], [inner, Y(1.415), z], m.steel)
    box(flank, [0.07, L(1.14), 0.24], [inner + 0.015, Y(1.4), 0], m.cyan)

    // Pale armour along the rail's outer face, under the clamps.
    const outer = RAIL.x + RAIL.h
    fin(
      flank,
      [
        [outer - 0.04, Y(0.96)],
        [outer + 0.03, Y(1.05)],
        [outer + 0.03, Y(1.86)],
        [outer - 0.04, Y(1.89)],
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
          [y + L(0.08), RAIL.h + 0.035, depth(y + L(0.08)) + 0.05, -0.025],
          [top, RAIL.h + 0.035, depth(top) + 0.05, -0.025],
          [top + L(0.03), RAIL.h + 0.015, depth(top) + 0.03, -0.01],
        ],
        mat,
        RAIL.x
      )
    }
    for (const y of CLAMPS) {
      clamp(y, L(0.16))
      fin(
        flank,
        [
          [outer - 0.02, y],
          [outer + 0.09, y + L(0.13)],
          [outer + 0.09, y + L(0.19)],
          [outer - 0.02, y + L(0.23)],
        ],
        0.32,
        m.steel
      )
    }
    clamp(Y(1.88), L(0.12))
  }
}
