/**
 * The radiator: a pack of chevron fins rising from a dark faceted manifold,
 * every fin a fir tree in section (three tiers of drooping branches, the
 * tallest at the chevron's point), swept back from a steel spine that runs
 * their points. Two heat pipes thread the pack from a tall header tank aft,
 * clamped in steel with a red heat telltale sunk in its crown, to a low
 * header forward with a cyan gauge.
 *
 * The fins stand upright, so printed outboard up they have no underside:
 * only their branches' undercuts face down, 34 degrees off vertical, and the
 * gaps between fins are wider than the slicer's minimum.
 */
import { armoredSection } from '../loft'
import type { ModuleBuild } from '../modules'

type Vec3 = [number, number, number]
type Station4 = [number, number, number, number]
/** A loft station whose underside sits on y = base. */
const sat = (x: number, h: number, w: number, base: number): Station4 => [x, h, w, base + h]
/** Turns a prism along +Y to run along +X. */
const FORE: Vec3 = [0, 0, -Math.PI / 2]

/** The chevron's sweep, each arm back from straight across. */
const SWEEP = (30 * Math.PI) / 180
/** A fin's thickness. */
const FIN = 0.08
/** Each arm's length from the point, along the arm. */
const ARM = 0.52
/** The fins' points along the pack, aft to fore. */
const POINTS = Array.from({ length: 6 }, (_, i) => -0.45 + i * 0.21)
/**
 * A fin arm in section, along the arm from the chevron's point: three tiers
 * of branches, each undercut 34 degrees off vertical.
 */
const PROFILE: [number, number][] = [
  [0, 0.29],
  [0, 0.82],
  [0.17, 0.74],
  [0.17, 0.71],
  [0.13, 0.65],
  [0.33, 0.57],
  [0.33, 0.54],
  [0.29, 0.48],
  [ARM, 0.42],
  [ARM, 0.29],
]
/** The plinth's top, the header tank's crown. */
const BASE = 0.3
const TANK = 0.78

export const radiator: ModuleBuild = (kit, p) => {
  const { add, box, plate, prism, fin, m } = kit
  plate(p, [1.64, 0.08, 1.06], [0, 0.26, 0], m.dark)

  // The manifold the fins rise from.
  add(
    p,
    armoredSection([sat(-0.66, 0.05, 0.5, BASE - 0.03), sat(0.6, 0.05, 0.5, BASE - 0.03)]),
    m.dark
  )

  // The fins: each a chevron of two arms, their fore faces meeting at the
  // point; each arm's root runs into the other's.
  const [c, s] = [Math.cos(SWEEP), Math.sin(SWEEP)]
  for (const x of POINTS)
    for (const side of [-1, 1])
      fin(
        p,
        PROFILE.map(([a, y]): [number, number] => [side * a, y]),
        FIN,
        m.pale,
        [0, -Math.PI / 2 - side * SWEEP, 0]
      ).position.set(x - (FIN / 2) * c, 0, (-side * FIN * s) / 2)

  // The spine along the points, and a web closing the slot between the
  // first fin and the tank under it.
  box(p, [0.1, 0.46, 0.14], [-0.55, 0.53, 0], m.dark)
  add(p, armoredSection([sat(-0.66, 0.055, 0.05, 0.75), sat(0.56, 0.055, 0.05, 0.75)]), m.steel)

  // Two heat pipes threading the pack, header to header.
  for (const z of [-0.2, 0.2]) prism(p, 8, 0.045, 1.28, [-0.02, 0.5, z], m.copper, FORE)

  // The header tank aft, clamped in a steel band, the red telltale sunk
  // between steel lips in the band's crown.
  const tankH = (TANK - BASE + 0.03) / 2
  add(
    p,
    armoredSection([sat(-0.8, tankH, 0.5, BASE - 0.03), sat(-0.58, tankH, 0.5, BASE - 0.03)]),
    m.hull
  )
  add(
    p,
    armoredSection([
      sat(-0.74, tankH + 0.02, 0.52, BASE - 0.03),
      sat(-0.62, tankH + 0.02, 0.52, BASE - 0.03),
    ]),
    m.steel
  )
  box(p, [0.07, 0.06, 0.25], [-0.68, TANK + 0.03, 0], m.red)
  for (const z of [-0.15, 0.15]) box(p, [0.1, 0.08, 0.07], [-0.68, TANK + 0.05, z], m.steel)

  // The header forward, low, with a cyan gauge sunk between steel lips.
  add(
    p,
    armoredSection([
      sat(0.57, 0.145, 0.32, BASE - 0.03),
      sat(0.74, 0.145, 0.32, BASE - 0.03),
      sat(0.8, 0.105, 0.26, BASE - 0.03),
    ]),
    m.hull
  )
  const crown = BASE - 0.03 + 0.29
  plate(p, [0.12, 0.06, 0.26], [0.68, crown, 0], m.steel)
  box(p, [0.07, 0.06, 0.16], [0.68, crown + 0.03, 0], m.cyan)
  for (const z of [-0.105, 0.105]) box(p, [0.1, 0.09, 0.07], [0.68, crown + 0.055, z], m.steel)
}
