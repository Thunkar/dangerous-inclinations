/**
 * The modules built outside the ship's own file: the shield comb, the
 * missile box, the plasma projector and the ram compressor. Each is handed
 * the yard's tools and paints (`ModuleKit`) and the module's group, after the
 * shared shoe and base plate are on it. Module frame: +Y off the plate
 * (outboard on a flank, out of the nose on the bow), +X fore along the hull
 * on a flank and across the bow on the bow mount, Z across.
 */
import {
  Group,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Mesh,
  type MeshStandardMaterial,
} from 'three'
import type { SubsystemType } from '@dangerous-inclinations/engine'
import { armoredSection, hollowSection, type Station } from './loft'

type Vec3 = [number, number, number]
type Material = MeshStandardMaterial

/** The yard's tools and paints, handed to a module built outside this file. */
export interface ModuleKit {
  add: (p: Group, geometry: BufferGeometry, mat: Material, pos?: Vec3, rot?: Vec3) => Mesh
  box: (p: Group, size: Vec3, pos: Vec3, mat?: Material, rot?: Vec3) => Mesh
  plate: (p: Group, size: Vec3, pos: Vec3, mat?: Material, rot?: Vec3) => Mesh
  cylinder: (
    p: Group,
    r1: number,
    r2: number,
    h: number,
    pos: Vec3,
    mat?: Material,
    rot?: Vec3,
    segments?: number
  ) => Mesh
  ring: (p: Group, radius: number, tube: number, pos: Vec3, mat?: Material, rot?: Vec3) => Mesh
  pipe: (p: Group, from: Vec3, to: Vec3, radius: number, mat?: Material) => void
  prism: (
    p: Group,
    sides: number,
    radius: number,
    h: number,
    pos: Vec3,
    mat?: Material,
    rot?: Vec3,
    hole?: number
  ) => Mesh
  frustum: (
    p: Group,
    sides: number,
    bottom: number,
    top: number,
    h: number,
    pos: Vec3,
    mat?: Material,
    rot?: Vec3
  ) => Mesh
  fin: (p: Group, points: [number, number][], thickness: number, mat: Material, rot?: Vec3) => Mesh
  m: Record<'hull' | 'pale' | 'dark' | 'steel' | 'rubber' | 'copper' | 'cyan' | 'red', Material>
}
/** `forward` is the bow mount, whose +Y runs out of the nose and X across it. */
export type ModuleBuild = (kit: ModuleKit, p: Group, forward: boolean) => void

type Station4 = [number, number, number, number]
/** A loft station whose underside sits on y = base. */
const sat = (x: number, h: number, w: number, base: number): Station4 => [x, h, w, base + h]
/** A loft station whose belly sits on y = 0 (the loft lifted by its own half height). */
const flat = (x: number, h: number, w: number): Station => [x, h, w, h]
/** A loft station centred on the loft's axis. */
const axial = (x: number, r: number, w = r): Station => [x, r, w, 0]
/** Turns a loft along +X to run along +Y (its section's height then lies along -X). */
const UP: Vec3 = [0, 0, Math.PI / 2]
/** Turns a prism or frustum along +Y to run along +X. */
const FORE: Vec3 = [0, 0, -Math.PI / 2]
/** Turns a prism along +Y to run along Z. */
const ACROSS: Vec3 = [Math.PI / 2, 0, 0]

function loft(
  k: ModuleKit,
  p: Group,
  stations: Station[],
  mat: Material,
  pos: Vec3 = [0, 0, 0],
  rot: Vec3 = [0, 0, 0]
) {
  return k.add(p, armoredSection(stations), mat, pos, rot)
}

/** A faceted duct from one point to another: a prism, not a tube. */
function duct(
  k: ModuleKit,
  p: Group,
  sides: number,
  from: Vec3,
  to: Vec3,
  r: number,
  mat = k.m.steel
) {
  const a = new Vector3(...from)
  const b = new Vector3(...to)
  const mesh = k.prism(
    p,
    sides,
    r,
    a.distanceTo(b),
    a.clone().add(b).multiplyScalar(0.5).toArray() as Vec3,
    mat
  )
  mesh.quaternion.copy(
    new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), b.sub(a).normalize())
  )
  return mesh
}

/**
 * A field comb: a faceted spine along the hull with a ladder of projector
 * vanes standing off it, each with a cyan strip sunk between pale lips along
 * its edge, between two capacitor blocks.
 */
const comb: ModuleBuild = (kit, p) => {
  const { add, box, plate, fin, m } = kit
  plate(p, [1.64, 0.08, 1.06], [0, 0.26, 0], m.dark)
  add(p, armoredSection([sat(-0.62, 0.1, 0.12, 0.3), sat(0.62, 0.1, 0.12, 0.3)]), m.hull)
  // Dark insulator collars where the spine leaves the capacitors.
  for (const x of [-0.53, 0.53])
    add(p, armoredSection([sat(x - 0.04, 0.13, 0.16, 0.3), sat(x + 0.04, 0.13, 0.16, 0.3)]), m.dark)
  // Capacitors at both ends, armoured on top, slatted on their faces.
  for (const side of [-1, 1]) {
    const cap = new Group()
    cap.name = `shields_capacitor_${side}`
    p.add(cap)
    const [a, b] = side < 0 ? [-0.86, -0.6] : [0.6, 0.86]
    add(cap, armoredSection([sat(a, 0.14, 0.36, 0.3), sat(b, 0.14, 0.36, 0.3)]), m.dark)
    plate(cap, [0.24, 0.04, 0.6], [(a + b) / 2, 0.59, 0], m.pale)
    for (let i = 0; i < 5; i++)
      box(cap, [0.03, 0.18, 0.04], [side * 0.865, 0.44, -0.24 + i * 0.12], m.steel)
    box(cap, [0.14, 0.025, 0.02], [(a + b) / 2, 0.5, 0.365], m.cyan)
  }
  const vanes = new Group()
  vanes.name = 'shields_vanes'
  p.add(vanes)
  for (let i = 0; i < 5; i++) {
    const x = -0.4 + i * 0.2
    const h = 0.36 + 0.06 * (1 - Math.abs(i - 2) / 2)
    // The clamp where the vane takes the spine.
    add(
      vanes,
      armoredSection([sat(x - 0.06, 0.12, 0.15, 0.3), sat(x + 0.06, 0.12, 0.15, 0.3)]),
      m.steel
    )
    // Each vane raked aft a little, so the comb leans like a row of teeth.
    const vane = new Group()
    vane.position.set(x, 0.31, 0)
    vane.rotation.z = 0.18
    vanes.add(vane)
    fin(
      vane,
      [
        [-0.3, 0],
        [0.3, 0],
        [0.48, 0.1],
        [0.48, h - 0.14],
        [0.34, h],
        [-0.34, h],
        [-0.48, h - 0.14],
        [-0.48, 0.1],
      ],
      0.08,
      m.pale,
      [0, Math.PI / 2, 0]
    )
    // A cyan strip along the edge in a steel cap, and a slit through the
    // blade under it.
    box(vane, [0.05, 0.03, 0.7], [0, h + 0.005, 0], m.steel)
    box(vane, [0.025, 0.02, 0.58], [0, h + 0.02, 0], m.cyan)
    box(vane, [0.1, 0.02, 0.42], [0, h - 0.07, 0], m.cyan)
  }
  // The ladder's rails, tying the vanes at both edges.
  for (const side of [-1, 1]) plate(vanes, [1.0, 0.07, 0.06], [0, 0.46, side * 0.44], m.steel)
}

/**
 * The launcher's box of four tubes, in its own frame: tubes along +X, the
 * face at the fore end a 2x2 of octagonal collars each holding a sunk seeker.
 */
function tubeBox(kit: ModuleKit, parent: Group) {
  const { add, box, prism, frustum, m } = kit
  const tubes = new Group()
  tubes.name = 'missiles_box'
  parent.add(tubes)
  add(
    tubes,
    armoredSection([
      [-0.5, 0.14, 0.27, 0],
      [-0.44, 0.17, 0.3, 0],
      [0.42, 0.17, 0.3, 0],
      [0.48, 0.16, 0.29, 0],
    ]),
    m.hull
  )
  // Steel armour bands round the box, a ready slit a round in the fore one.
  for (const x of [-0.3, 0.2])
    add(
      tubes,
      armoredSection([
        [x, 0.18, 0.31, 0],
        [x + 0.08, 0.18, 0.31, 0],
      ]),
      m.steel
    )
  for (const z of [-0.21, -0.07, 0.07, 0.21])
    box(tubes, [0.04, 0.012, 0.06], [0.24, 0.18, z], m.cyan)
  for (const y of [-0.084, 0.084])
    for (const z of [-0.15, 0.15]) {
      prism(tubes, 8, 0.092, 0.1, [0.52, y, z], m.steel, FORE, 0.066)
      prism(tubes, 8, 0.07, 0.02, [0.48, y, z], m.dark, FORE)
      frustum(tubes, 8, 0.058, 0.012, 0.06, [0.52, y, z], m.hull, FORE)
    }
  return tubes
}

/**
 * Box launcher: an armoured box of four tubes canted up on trunnions in a
 * saddle that runs the bay, a feed block in the saddle aft loading it. On the
 * bow the box stands in the collar on its trunnions and fires out of the nose.
 */
const launcher: ModuleBuild = (kit, p, forward) => {
  const { add, plate, prism, fin, pipe, m } = kit
  plate(p, [1.64, 0.08, 1.06], [0, 0.26, 0], m.dark)
  if (forward) {
    // Bow: the box stands along +Y and fires out of the nose, broad across
    // the bow, on trunnions in two cheeks at its ends over a breech block.
    const pivot = 0.62
    const cradle = new Group()
    cradle.name = 'missiles_bow_cradle'
    p.add(cradle)
    add(cradle, armoredSection([sat(-0.52, 0.05, 0.26, 0.3), sat(0.52, 0.05, 0.26, 0.3)]), m.dark)
    for (const side of [-1, 1]) {
      add(
        cradle,
        armoredSection([
          [0.3, 0.07, 0.3, 0],
          [0.36, 0.09, 0.34, 0],
          [0.66, 0.09, 0.34, 0],
          [0.8, 0.06, 0.2, 0],
        ]),
        m.pale,
        [side * 0.62, 0, 0],
        UP
      )
      prism(cradle, 8, 0.1, 0.24, [side * 0.6, pivot, 0], m.steel, FORE)
      prism(cradle, 6, 0.055, 0.03, [side * 0.73, pivot, 0], m.dark, FORE)
      // Gussets from the breech block up the cheek's inner face.
      for (const z of [-0.2, 0.2])
        fin(
          cradle,
          [
            [0, 0.36],
            [0.1, 0.36],
            [0, 0.5],
          ],
          0.03,
          m.steel,
          [0, side < 0 ? Math.PI : 0, 0]
        ).position.set(side * 0.53, 0, z)
    }
    // Turned so the tubes run out of the nose and the box lies broad across it.
    const turn = new Group()
    turn.rotation.y = Math.PI / 2
    p.add(turn)
    const tubes = tubeBox(kit, turn)
    tubes.rotation.z = Math.PI / 2
    // Short, so the face stands just proud of the collar's lip.
    tubes.position.y = pivot
    tubes.scale.set(0.62, 1.6, 1.6)
    return
  }
  const pivot: [number, number] = [0.06, 0.6]
  // The saddle: two chamfered cheeks along the bay, rising to the trunnions.
  const saddle = new Group()
  saddle.name = 'missiles_saddle'
  p.add(saddle)
  for (const side of [-1, 1]) {
    add(
      saddle,
      armoredSection([
        sat(-0.84, 0.06, 0.08, 0.3),
        sat(-0.5, 0.09, 0.08, 0.3),
        sat(-0.12, 0.17, 0.08, 0.3),
        sat(0.24, 0.17, 0.08, 0.3),
        sat(0.5, 0.05, 0.08, 0.3),
      ]),
      m.pale,
      [0, 0, side * 0.41]
    )
    // The trunnion through the cheek, capped outside.
    prism(saddle, 8, 0.1, 0.18, [pivot[0], pivot[1], side * 0.42], m.steel, ACROSS)
    prism(saddle, 6, 0.055, 0.03, [pivot[0], pivot[1], side * 0.52], m.dark, ACROSS)
    // Gussets bracing the cheek's fore slope.
    for (const z of [0.38, 0.47])
      fin(
        saddle,
        [
          [0.24, 0.3],
          [0.56, 0.3],
          [0.24, 0.6],
        ],
        0.03,
        m.steel
      ).position.z = side * z
  }
  const tubes = tubeBox(kit, p)
  tubes.position.set(pivot[0], pivot[1], 0)
  tubes.rotation.z = 0.2
  // The feed block in the saddle aft, its lid and conduits into the box.
  const feed = new Group()
  feed.name = 'missiles_feed'
  p.add(feed)
  add(
    feed,
    armoredSection([
      sat(-0.84, 0.08, 0.28, 0.3),
      sat(-0.8, 0.11, 0.31, 0.3),
      sat(-0.5, 0.11, 0.31, 0.3),
      sat(-0.46, 0.08, 0.28, 0.3),
    ]),
    m.dark
  )
  plate(feed, [0.3, 0.04, 0.44], [-0.65, 0.53, 0], m.hull)
  plate(feed, [0.18, 0.03, 0.2], [-0.65, 0.56, 0], m.steel)
  for (const z of [-0.16, 0.16]) pipe(feed, [-0.5, 0.46, z], [-0.38, 0.46, z], 0.03, m.copper)
}

/**
 * Twin-coil projector: two short coil pods lie along the bay, armoured in
 * pale sleeves with their windings bared amidships, and between them they
 * feed a flared slot nozzle that opens outboard, a long letterbox mouth with
 * a heavy rim and the plasma in bars across its throat. A capacitor block bridges their after ends.
 */
const twinCoil: ModuleBuild = (k, p) => {
  const { add, box, plate, m } = k
  plate(p, [1.6, 0.06, 0.92], [0, 0.25, 0], m.dark)
  const axis = 0.45
  for (const side of [-1, 1]) {
    const pod = new Group()
    pod.name = `plasma_coil_${side < 0 ? 0 : 1}`
    pod.position.set(0, axis, side * 0.29)
    p.add(pod)
    loft(k, pod, [axial(-0.5, 0.12), axial(0.6, 0.12)], m.dark)
    // Sleeves aft and fore, the fore one tapering to a nose.
    loft(k, pod, [axial(-0.52, 0.165, 0.145), axial(-0.14, 0.165, 0.145)], m.hull)
    loft(
      k,
      pod,
      [axial(0.34, 0.165, 0.145), axial(0.56, 0.165, 0.145), axial(0.7, 0.1, 0.09)],
      m.hull
    )
    // The windings: steel plates on the dark core.
    for (let i = 0; i < 6; i++) {
      const x = -0.1 + i * 0.075
      loft(k, pod, [axial(x, 0.15, 0.13), axial(x + 0.035, 0.15, 0.13)], m.steel)
    }
    // A steel saddle under each sleeve.
    for (const x of [-0.33, 0.45]) box(p, [0.12, 0.1, 0.22], [x, 0.31, side * 0.29], m.steel)
  }
  // The nozzle: a flared clipped-octagon slot, long along the hull, its
  // axis turned outboard.
  const nozzle = new Group()
  nozzle.name = 'plasma_nozzle'
  nozzle.position.x = 0.12
  nozzle.rotation.z = Math.PI / 2
  p.add(nozzle)
  add(
    nozzle,
    hollowSection(0.3, 0.8, [0.21, 0.12, 0], [0.3, 0.17, 0], [0.15, 0.07, 0], [0.26, 0.13, 0]),
    m.pale
  )
  // A heavy steel lip round the mouth, and a dark liner down the throat.
  add(
    nozzle,
    hollowSection(0.76, 0.89, [0.36, 0.23, 0], [0.36, 0.23, 0], [0.26, 0.13, 0], [0.26, 0.13, 0]),
    m.steel
  )
  add(
    nozzle,
    hollowSection(
      0.62,
      0.885,
      [0.254, 0.125, 0],
      [0.254, 0.125, 0],
      [0.24, 0.11, 0],
      [0.24, 0.11, 0]
    ),
    m.dark
  )
  // Its floor in the throat, with the plasma across it in bars.
  loft(k, nozzle, [axial(0.3, 0.2, 0.1), axial(0.7, 0.25, 0.12)], m.dark)
  for (const y of [-0.16, -0.08, 0, 0.08, 0.16])
    box(nozzle, [0.014, 0.03, 0.19], [0.705, y, 0], m.cyan)
  // The capacitor block bridging the pods aft, with bus bars into them.
  loft(k, p, [flat(-0.88, 0.13, 0.4), flat(-0.52, 0.13, 0.4)], m.dark, [0, 0.28, 0])
  plate(p, [0.3, 0.05, 0.62], [-0.7, 0.56, 0], m.steel)
  box(p, [0.18, 0.02, 0.04], [-0.7, 0.59, 0], m.cyan)
  for (const z of [-0.29, 0.29]) box(p, [0.1, 0.06, 0.08], [-0.5, 0.58, z], m.copper)
}

/**
 * A ram intake facing down the nose: a pale compressor casing clamped to a
 * saddle, then a cowl tapering to a pale lip round a dark-lined mouth, vanes
 * across the mouth and the compressor face recessed behind them. Bleed valves
 * on the casing's flanks duct the charge down into the hull.
 */
const ramIntake: ModuleBuild = (k, p) => {
  const { add, box, plate, prism, frustum, fin, m } = k
  plate(p, [1.5, 0.06, 1.0], [0, 0.25, 0], m.dark)
  const intake = new Group()
  intake.name = 'compressor_intake'
  p.add(intake)
  const back = 0.28
  const joint = 0.42
  const front = 0.54
  const casing: Vec3 = [0.6, 0.44, 0]
  const nose: Vec3 = [0.5, 0.34, 0]
  const bore = (grow: number): Vec3 => [0.4 + grow, 0.23 + grow, 0]
  const face = joint + 0.01
  // The casing, then the cowl from the joint to the lip, both hollow round
  // the bore; the lining stands a hair clear of it.
  add(
    intake,
    hollowSection(back, joint, casing, casing, bore(0.02), bore(0.02)),
    m.pale,
    [0, 0, 0],
    UP
  )
  add(
    intake,
    hollowSection(joint, front, casing, nose, bore(0.02), bore(0.02)),
    m.hull,
    [0, 0, 0],
    UP
  )
  const lip: Vec3 = [nose[0] + 0.02, nose[1] + 0.02, 0]
  add(
    intake,
    hollowSection(front, front + 0.045, lip, lip, bore(0.02), bore(0.02)),
    m.pale,
    [0, 0, 0],
    UP
  )
  add(
    intake,
    hollowSection(face, front + 0.05, bore(0), bore(0), bore(-0.025), bore(-0.025)),
    m.dark,
    [0, 0, 0],
    UP
  )
  // The compressor face: a dark disc at the back of a short bore, a ring of
  // pitched steel blades and a hex hub with a faceted nose cone.
  add(
    intake,
    armoredSection([
      [face - 0.05, 0.39, 0.22],
      [face - 0.01, 0.39, 0.22],
    ]),
    m.dark,
    [0, 0, 0],
    UP
  )
  const rotor = new Group()
  rotor.name = 'compressor_rotor'
  rotor.position.y = face + 0.025
  intake.add(rotor)
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 + Math.PI / 10
    const reach = Math.min(0.36 / Math.abs(Math.cos(a)), 0.2 / Math.abs(Math.sin(a)))
    const arm = new Group()
    arm.rotation.y = a
    rotor.add(arm)
    box(arm, [reach - 0.08, 0.03, 0.07], [0.08 + (reach - 0.08) / 2, 0, 0], m.steel, [0.6, 0, 0])
  }
  prism(intake, 6, 0.1, 0.06, [0, face + 0.04, 0], m.steel)
  frustum(intake, 6, 0.085, 0.025, 0.07, [0, face + 0.105, 0], m.pale)
  // Stator vanes running from the face to the lip, as in the mantis's
  // nacelle intakes, either side of the nose cone.
  for (const x of [-0.2, 0.2])
    box(intake, [0.024, front - face - 0.02, 0.44], [x, (front + face) / 2 + 0.005, 0], m.steel)
  // The clamp band at the joint, bolted down to the saddle by its feet.
  add(
    intake,
    armoredSection([
      [joint - 0.05, casing[0] + 0.005, casing[1] + 0.005],
      [joint - 0.035, casing[0] + 0.03, casing[1] + 0.03],
      [joint + 0.015, casing[0] + 0.03, casing[1] + 0.03],
      [joint + 0.03, casing[0] + 0.005, casing[1] + 0.005],
    ]),
    m.steel,
    [0, 0, 0],
    UP
  )
  for (const x of [-0.42, 0.42])
    for (const z of [-0.47, 0.47]) {
      box(p, [0.1, 0.1, 0.05], [x, 0.33, z], m.steel)
      prism(p, 6, 0.03, 0.03, [x, 0.395, z * 1.02], m.dark)
    }
  // A gauge block on the casing above and below, a cyan slit in its face.
  for (const s of [-1, 1]) {
    plate(p, [0.26, 0.1, 0.06], [s * -0.22, 0.34, s * 0.475], m.dark)
    box(p, [0.17, 0.012, 0.022], [s * -0.22, 0.392, s * 0.475], m.cyan)
  }
  // A bleed valve on each flank of the casing, ducted down into the hull,
  // with gussets from the saddle up the flank either side of it.
  for (const s of [-1, 1]) {
    prism(p, 6, 0.08, 0.1, [s * 0.65, 0.36, 0], m.dark, [0, 0, Math.PI / 2])
    duct(k, p, 6, [s * 0.68, 0.36, 0], [s * 0.8, 0.24, 0], 0.05)
    prism(p, 6, 0.08, 0.04, [s * 0.8, 0.235, 0], m.dark)
    for (const z of [-0.26, 0.26])
      fin(
        p,
        [
          [0.6, 0.27],
          [0.76, 0.27],
          [0.6, 0.4],
        ],
        0.05,
        m.steel,
        [0, s < 0 ? Math.PI : 0, 0]
      ).position.z = z
  }
}

export const MODULE_BUILDS: Partial<Record<SubsystemType, ModuleBuild>> = {
  shields: comb,
  missiles: launcher,
  plasma_cannon: twinCoil,
  fuel_compressor: ramIntake,
}
