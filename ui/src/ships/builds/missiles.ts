/**
 * The missiles module, built from the yard's kit (see `../modules.ts` for the
 * frame and the kit): a salvo cell launcher, the same box in every mount.
 *
 * An armoured box rises off the plinth with a pale rim round its face, and in
 * the face a honeycomb of four hexagonal cells (the four-round magazine), each
 * capped by a pale blow-out door sunk in its tube, a ready lamp in the deck
 * beside it. Two raked blast shields stand along the face's edges, braced
 * from the plinth by deflector vanes, and a steel clamp at each end holds the
 * magazine down by the rim.
 */
import { Group } from 'three'
import type { MeshStandardMaterial } from 'three'
import { armoredSection, hollowSection, type Station } from '../loft'
import type { ModuleBuild, ModuleKit } from '../modules'

type Vec3 = [number, number, number]

/** Turns a loft along +X to run along +Y (its section's height then lies along -X). */
const UP: Vec3 = [0, 0, Math.PI / 2]

/** A loft up +Y: each station is [y, half length along X, half width along Z]. */
function rise(k: ModuleKit, p: Group, stations: Station[], mat: MeshStandardMaterial) {
  return k.add(p, armoredSection(stations), mat, [0, 0, 0], UP)
}

/** The cells' honeycomb: hexes with a corner fore and aft, sharing flats. */
const CELL = 0.2
const PITCH = 0.316
const CELLS: [number, number][] = [
  [-PITCH * Math.cos(Math.PI / 6), 0],
  [PITCH * Math.cos(Math.PI / 6), 0],
  [0, -PITCH / 2],
  [0, PITCH / 2],
]

export const missiles: ModuleBuild = (kit, p) => {
  const { add, plate, prism, frustum, box, fin, m } = kit
  plate(p, [1.64, 0.08, 1.06], [0, 0.26, 0], m.dark)

  // The box, narrowing a little as it rises, and the rim round its face.
  const body = new Group()
  body.name = 'missiles_box'
  p.add(body)
  rise(
    kit,
    body,
    [
      [0.29, 0.68, 0.45],
      [0.72, 0.66, 0.43],
    ],
    m.hull
  )
  // The breech band round its foot, and a steel belt with its underside
  // chamfered back to the box.
  rise(
    kit,
    body,
    [
      [0.29, 0.695, 0.465],
      [0.4, 0.695, 0.465],
    ],
    m.dark
  )
  rise(
    kit,
    body,
    [
      [0.5, 0.67, 0.44],
      [0.535, 0.695, 0.465],
      [0.6, 0.695, 0.465],
      [0.62, 0.675, 0.445],
    ],
    m.steel
  )
  add(
    body,
    hollowSection(0.69, 0.79, [0.65, 0.42, 0], [0.65, 0.42, 0], [0.56, 0.35, 0], [0.56, 0.35, 0]),
    m.pale,
    [0, 0, 0],
    UP
  )
  rise(
    kit,
    body,
    [
      [0.69, 0.565, 0.355],
      [0.75, 0.565, 0.355],
    ],
    m.dark
  )

  // The magazine: four hex tubes in a honeycomb, a blow-out door sunk in each.
  const cells = new Group()
  cells.name = 'missiles_cells'
  p.add(cells)
  for (const [x, z] of CELLS) {
    prism(cells, 6, CELL, 0.15, [x, 0.795, z], m.pale, [0, Math.PI / 2, 0], 0.11)
    frustum(cells, 6, 0.105, 0.065, 0.1, [x, 0.77, z], m.steel, [0, Math.PI / 2, 0])
  }
  // A ready lamp in the deck beside each cell, down among the tubes.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      plate(cells, [0.13, 0.06, 0.1], [sx * 0.37, 0.75, sz * 0.27], m.steel)
      box(cells, [0.08, 0.05, 0.07], [sx * 0.37, 0.775, sz * 0.27], m.cyan)
    }

  // Blast shields along the face's edges, raked away from the cells, and the
  // deflector vanes bracing them down to the plinth.
  const rake = 0.26
  for (const side of [-1, 1]) {
    const shield = new Group()
    shield.name = `missiles_shield_${side < 0 ? 0 : 1}`
    shield.position.set(0, 0.75, side * 0.38)
    shield.rotation.x = side * rake
    p.add(shield)
    fin(
      shield,
      [
        [-0.5, -0.04],
        [0.5, -0.04],
        [0.5, 0.1],
        [0.42, 0.19],
        [-0.42, 0.19],
        [-0.5, 0.1],
      ],
      0.08,
      m.steel
    )
    for (const x of [-0.36, 0, 0.36])
      fin(
        p,
        [
          [0.4, 0.21],
          [0.52, 0.21],
          [0.52, 0.36],
          [0.49, 0.88],
          [0.42, 0.88],
          [0.4, 0.7],
        ],
        0.08,
        m.steel,
        [0, (-side * Math.PI) / 2, 0]
      ).position.x = x
  }

  // The magazine clamps, one at each end: up from the plinth and over the
  // rim, bolted down on the lip.
  for (const end of [-1, 1]) {
    const clamp = new Group()
    clamp.name = `missiles_clamp_${end < 0 ? 0 : 1}`
    clamp.rotation.y = end < 0 ? Math.PI : 0
    p.add(clamp)
    fin(
      clamp,
      [
        [0.6, 0.21],
        [0.8, 0.21],
        [0.8, 0.4],
        [0.72, 0.62],
        [0.72, 0.82],
        [0.67, 0.87],
        [0.52, 0.87],
        [0.52, 0.8],
        [0.56, 0.76],
        [0.6, 0.76],
      ],
      0.22,
      m.steel
    )
    for (const z of [-0.06, 0.06]) prism(clamp, 6, 0.04, 0.07, [0.62, 0.87, z], m.dark)
  }
}
