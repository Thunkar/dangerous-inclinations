/**
 * The jump drive, built from the yard's kit (see `../modules.ts` for the
 * frame and the kit): a fold-field projector, the same module in every
 * mount.
 *
 * A low faceted housing lies along the bay on a dark plinth, held by two
 * steel clamp collars bolted down to it. From its top rise two thick pale
 * blades, one dorsal and one ventral, mirror images of each other. Each lies
 * along the hull, leans out from the housing and is raked back: it rises
 * from the housing at the fore end, where the two meet under a steel clamp,
 * to its peak aft. Seen from the side the pair makes a chevron pointing
 * fore. Each blade's crest carries a cyan edge sunk between two steel rails.
 * In the gap between the blades a steel spine runs along the housing with
 * cyan along its top, and a row of steel rungs stands across the gap from
 * blade to blade, each rising nearly to the crests.
 *
 * It prints upright on its base plate. The blades lean out 10 degrees, so
 * their outer faces stand at 80 degrees, and their roots and lower chamfers
 * are sunk in the housing. Each rung is an upright plate with its ends sunk
 * in the blades, so nothing bridges. At print scale the blades are 2.8 mm
 * thick, the rails 1 mm wide and the rungs 1.1 mm thick.
 */
import { Group } from 'three'
import { armoredSection } from '../loft'
import type { ModuleBuild } from '../modules'

type Station4 = [number, number, number, number]

/** A loft station whose underside sits on y = base. */
const sat = (x: number, h: number, w: number, base: number): Station4 => [x, h, w, base + h]

/** The plinth's top, and the housing's top. */
const PLINTH = 0.3
const HOUSING_TOP = 0.5
/** The housing: aft and fore ends, half height, half width aft and at the fore end. */
const HOUSING = { aft: -0.8, fore: 0.72, h: 0.115, w: 0.46, foreW: 0.24 }
/** The blades' roots, sunk below the housing's top. */
const ROOT = 0.44
/** Half a blade's thickness. */
const HALF = 0.15
/** How far each blade leans out from upright. */
const LEAN = (10 * Math.PI) / 180
/** Where each blade's root lies across the bay, fore and aft (x, z). */
const FORE_ROOT: [number, number] = [0.66, 0.04]
const AFT_ROOT: [number, number] = [-0.7, 0.3]
/** A blade's crest, aft to fore, in its own frame: [x along it, height above its root]. */
const CREST: [number, number][] = [
  [-0.68, 0.27],
  [-0.44, 0.49],
  [0.68, 0.08],
]
/** The rungs' thickness, their x along the bay, and how far below the crests they stop. */
const RUNG = { thick: 0.115, at: [-0.56, -0.4, -0.24, -0.08], under: 0.05 }

export const jumpDrive: ModuleBuild = (k, p) => {
  const { add, box, fin, plate, prism, m } = k
  plate(p, [1.64, 0.08, 1.06], [0, 0.26, 0], m.dark)

  // The housing: a faceted block along the bay, its belly sunk in the
  // plinth so its lower chamfers do not hang, narrowing fore as the blades
  // close in.
  const housing = new Group()
  housing.name = 'jump_housing'
  p.add(housing)
  const bed = HOUSING_TOP - 2 * HOUSING.h
  const waist = -0.5
  const widthAt = (x: number) =>
    HOUSING.w - (HOUSING.w - HOUSING.foreW) * Math.max(0, (x - waist) / (HOUSING.fore - waist))
  add(
    housing,
    armoredSection([
      sat(HOUSING.aft, HOUSING.h, HOUSING.w, bed),
      sat(waist, HOUSING.h, HOUSING.w, bed),
      sat(HOUSING.fore, HOUSING.h, HOUSING.foreW, bed),
    ]),
    m.hull
  )
  // Two clamp collars round it, footed to the plinth and bolted through.
  for (const x of [-0.62, 0.3]) {
    add(
      housing,
      armoredSection([
        sat(x - 0.06, HOUSING.h + 0.025, widthAt(x - 0.06) + 0.03, bed),
        sat(x + 0.06, HOUSING.h + 0.025, widthAt(x + 0.06) + 0.03, bed),
      ]),
      m.steel
    )
    const foot = Math.min(widthAt(x) + 0.07, 0.49)
    for (const side of [-1, 1]) {
      box(housing, [0.1, 0.12, 0.08], [x, PLINTH + 0.06, side * foot], m.steel)
      prism(housing, 6, 0.035, 0.03, [x, PLINTH + 0.13, side * foot], m.dark)
    }
  }

  // The blades, mirror images about z = 0.
  const [fx, fz] = FORE_ROOT
  const [ax, az] = AFT_ROOT
  const yaw = Math.atan2(az - fz, fx - ax)
  const mid = (fx + ax) / 2
  for (const side of [-1, 1]) {
    const blade = new Group()
    blade.name = `jump_blade_${side < 0 ? 0 : 1}`
    blade.position.set(mid, ROOT, (side * (fz + az)) / 2)
    // Yawed so its aft end lies outboard, then leant out about its own length.
    blade.rotation.set(side * LEAN, side * yaw, 0, 'YXZ')
    p.add(blade)
    add(blade, armoredSection(CREST.map(([x, h]) => sat(x, h / 2, HALF, 0))), m.pale)
    // The edge: cyan sunk between two steel rails along the crest.
    for (const z of [-0.08, 0.08])
      add(blade, armoredSection(CREST.map(([x, h]) => sat(x, 0.0325, 0.055, h - 0.04))), m.steel, [
        0,
        0,
        z,
      ])
    add(blade, armoredSection(CREST.map(([x, h]) => sat(x, 0.0125, 0.022, h - 0.015))), m.cyan)
  }
  // The clamp where the blades meet fore, over both their roots.
  add(
    housing,
    armoredSection([
      sat(0.42, 0.075, 0.22, HOUSING_TOP - 0.03),
      sat(0.7, 0.05, 0.17, HOUSING_TOP - 0.03),
    ]),
    m.steel
  )
  prism(housing, 6, 0.035, 0.03, [0.56, HOUSING_TOP + 0.13, 0], m.dark)

  // Where a blade's inner face is, as |z| at module x and height y, and the
  // height of its crest at module x.
  const rootZ = (x: number) => fz + ((az - fz) * (fx - x)) / (fx - ax)
  const innerZ = (x: number, y: number) =>
    rootZ(x) +
    (y - ROOT - HALF * Math.sin(LEAN)) * Math.tan(LEAN) -
    (HALF * Math.cos(LEAN)) / Math.cos(yaw)
  const crestY = (x: number) => {
    const along = x - mid
    const i = CREST.findIndex(([cx]) => cx >= along)
    const [[x0, h0], [x1, h1]] = [CREST[i - 1], CREST[i]]
    return ROOT + (h0 + ((h1 - h0) * (along - x0)) / (x1 - x0)) * Math.cos(LEAN)
  }

  // The spine along the housing between the blades, cyan along its top.
  const spine = new Group()
  spine.name = 'jump_spine'
  p.add(spine)
  const [aft, fore] = [-0.66, 0.0]
  const top = 0.68
  const belly = HOUSING_TOP - 0.02
  add(
    spine,
    armoredSection([
      sat(aft, (top - belly) / 2, 0.075, belly),
      sat(fore, (top - belly) / 2, 0.075, belly),
    ]),
    m.steel
  )
  add(
    spine,
    armoredSection([
      sat(aft + 0.02, 0.012, 0.04, top - 0.014),
      sat(fore - 0.02, 0.012, 0.04, top - 0.014),
    ]),
    m.cyan
  )
  // The rungs across the gap, each nearly as high as the crests there, its
  // ends sunk in both blades.
  for (const x of RUNG.at) {
    const rungTop = crestY(x) - RUNG.under
    const into = 0.04
    const [z0, z1] = [innerZ(x, belly) + into, innerZ(x, rungTop) + into]
    fin(
      spine,
      [
        [-z0, belly],
        [z0, belly],
        [z1, rungTop],
        [-z1, rungTop],
      ],
      RUNG.thick,
      m.steel,
      [0, Math.PI / 2, 0]
    ).position.x = x
  }
}
