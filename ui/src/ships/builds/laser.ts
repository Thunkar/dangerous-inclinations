/**
 * The broadside laser, built from the yard's kit (see `../modules.ts` for the
 * frame and the kit): a focused beam, so a long resonator lies along the bay
 * in a clamped saddle, pumped from a block aft, its gain channel showing cyan
 * down its spine between steel lips, and fore of it a tight stepped focusing
 * stack stands outboard, each stage narrower than the one below and clamped
 * by a steel collar, to a small deep aperture with the cyan lens sunk in its
 * steel crown. The old turret's lens in a collar, faceted and narrowed.
 */
import { Group } from 'three'
import { armoredSection, hollowSection } from '../loft'
import type { ModuleBuild } from '../modules'

type Station4 = [number, number, number, number]
type Vec3 = [number, number, number]
/** A loft station whose underside sits on y = base. */
const sat = (x: number, h: number, w: number, base: number): Station4 => [x, h, w, base + h]
/** A loft station centred on the loft's axis, `r` across both ways. */
const axial = (x: number, r: number, w = r): Station4 => [x, r, w, 0]
/** Turns a loft along +X to run along +Y (its section's height then lies along -X). */
const UP: Vec3 = [0, 0, Math.PI / 2]
/** Turns a prism along +Y to run along +X. */
const FORE: Vec3 = [0, 0, -Math.PI / 2]
/** FORE, then a quarter of a square's turn about its new axis: a diamond facing +X. */
const PORT: Vec3 = [Math.PI / 4, 0, FORE[2]]

export const laser: ModuleBuild = (k, p) => {
  const { add, box, plate, prism, m } = k
  // The plinth across the bay, the resonator's bed.
  plate(p, [1.64, 0.08, 1.06], [0, 0.26, 0], m.dark)
  const bed = 0.29
  const head = 0.42
  // The saddle: two chamfered cheeks along the bay, low aft and rising to
  // clamp the focusing stack's base between them, falling away fore.
  for (const side of [-1, 1]) {
    add(
      p,
      armoredSection([
        sat(-0.7, 0.1, 0.1, 0.22),
        sat(-0.08, 0.1, 0.1, 0.22),
        sat(0.08, 0.2, 0.1, 0.22),
        sat(0.62, 0.2, 0.1, 0.22),
        sat(0.7, 0.13, 0.1, 0.22),
      ]),
      m.pale,
      [0, 0, side * 0.42]
    )
  }

  // The resonator: a long faceted housing flat on the bed, running into the
  // stack's base.
  const res = new Group()
  res.name = 'laser_resonator'
  p.add(res)
  const rh = 0.11
  const rw = 0.2
  add(res, armoredSection([sat(-0.66, rh, rw, bed), sat(head, rh, rw, bed)]), m.hull)
  const top = bed + 2 * rh
  // The gain channel down its spine: cyan between two steel lips.
  for (const z of [-0.08, 0.08]) box(res, [0.78, 0.08, 0.07], [-0.25, top + 0.01, z], m.steel)
  box(res, [0.74, 0.06, 0.1], [-0.25, top, 0], m.cyan)
  // Two clamp bands round it, footed to the cheeks and bolted through.
  for (const x of [-0.52, -0.2]) {
    add(
      res,
      armoredSection([
        sat(x - 0.05, rh + 0.035, rw + 0.035, bed),
        sat(x + 0.05, rh + 0.035, rw + 0.035, bed),
      ]),
      m.steel
    )
    for (const side of [-1, 1]) {
      box(res, [0.08, 0.14, 0.12], [x, bed + 0.07, side * 0.28], m.steel)
      prism(res, 6, 0.045, 0.04, [x, bed + 0.15, side * 0.28], m.dark)
    }
  }

  // The pump block aft: dark, slatted down its flanks, a steel lid with a
  // cyan slit, and copper bus bars into the resonator.
  const pump = new Group()
  pump.name = 'laser_pump'
  p.add(pump)
  add(pump, armoredSection([sat(-0.82, 0.16, 0.27, bed), sat(-0.58, 0.16, 0.27, bed)]), m.dark)
  plate(pump, [0.2, 0.08, 0.42], [-0.7, bed + 0.33, 0], m.steel)
  box(pump, [0.12, 0.03, 0.04], [-0.7, bed + 0.37, 0], m.cyan)
  for (const side of [-1, 1]) {
    for (const x of [-0.78, -0.7, -0.62])
      box(pump, [0.07, 0.16, 0.04], [x, bed + 0.12, side * 0.27], m.steel)
    box(pump, [0.1, 0.06, 0.07], [-0.55, top + 0.01, side * 0.13], m.copper)
  }

  // The focusing stack, outboard along +Y: a base block clamped in the
  // saddle, then a dark core through a stack of steel lens rings, each
  // narrower than the one below and undercut to the next, converging on the
  // muzzle.
  const stack = new Group()
  stack.name = 'laser_stack'
  stack.position.x = head
  p.add(stack)
  const stage = (stations: Station4[], mat = m.steel) =>
    add(stack, armoredSection(stations), mat, [0, 0, 0], UP)
  // Base block: hull, chamfering in at its top.
  stage([axial(0.27, 0.3, 0.32), axial(0.56, 0.3, 0.32), axial(0.62, 0.25, 0.26)], m.hull)
  const crown = 1.0
  stage([axial(0.58, 0.15, 0.15), axial(crown, 0.15, 0.15)], m.dark)
  // The rings: each flares out from the core under 45 degrees, stands, and
  // chamfers in at its top.
  for (let i = 0; i < 4; i++) {
    const y = 0.6 + i * 0.09
    const r = 0.245 - i * 0.02
    stage([axial(y, r - 0.04), axial(y + 0.05, r), axial(y + 0.08, r), axial(y + 0.1, r - 0.025)])
  }
  // The muzzle: a deep pale sleeve with a steel lip, the lens sunk at the
  // bottom of its bore on the dark core.
  const bore: Vec3 = [0.09, 0.09, 0]
  // The lip's bore a hair inside the sleeve's, so the two walls are not one face.
  const lip: Vec3 = [0.085, 0.085, 0]
  add(
    stack,
    hollowSection(0.95, 1.08, [0.175, 0.175, 0], [0.17, 0.17, 0], bore, bore),
    m.pale,
    [0, 0, 0],
    UP
  )
  add(
    stack,
    hollowSection(1.05, 1.12, [0.165, 0.165, 0], [0.16, 0.16, 0], lip, lip),
    m.steel,
    [0, 0, 0],
    UP
  )
  prism(stack, 8, 0.095, 0.06, [0, crown + 0.03, 0], m.cyan)
  // A sight port in the base's fore face: cyan in a steel collar, set as a
  // diamond so its lower faces print at 45 degrees.
  prism(stack, 4, 0.13, 0.06, [0.3, 0.44, 0], m.steel, PORT, 0.075)
  prism(stack, 4, 0.08, 0.05, [0.3, 0.44, 0], m.cyan, PORT)
}
