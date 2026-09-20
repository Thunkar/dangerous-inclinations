/**
 * The missile that flies across the board, built in the yard that builds the
 * corvettes and the stations: plated structure, bare steel, copper plumbing,
 * cyan for anything live, and the owner's colour spent only where the table
 * camera looks.
 *
 * It used to be a glowing cone, which read as a spark rather than as ordnance.
 * This is a body you can name the parts of at close range and still a dart at
 * table range, because the two things that carry — the fins and the band
 * behind the nose — are the owner's colour and the nozzle is lit.
 *
 * **Built in board units, not concept units.** A corvette is modelled small and
 * the board scales it by four; a missile exists nowhere but the board, so it is
 * modelled at the size it is drawn: nose at +X to match the heading the board
 * yaws it to, LENGTH along X, WIDTH across, centred on the origin so it drops
 * straight into the place the old cone held.
 */
import type { BufferGeometry } from 'three'
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three'
import { HULL_INK } from './palette'

/** The envelope the board gives a missile token, in board units. */
const LENGTH = 26
const WIDTH = 9

/** The airframe: slim enough that the fins are what sets the width. */
const BODY_RADIUS = 2.4
const NOSE_LENGTH = 6
/** Nose tip and tail plane, so every part can be placed against the envelope. */
const TIP = LENGTH / 2
const TAIL = -LENGTH / 2

export interface MissileModel {
  root: Group
  dispose: () => void
}

/**
 * One missile, in the owner's colour.
 *
 * Plain three.js: the caller memoises it, mounts `root` with `<primitive>` and
 * calls `dispose()` when it unmounts. Nothing here animates — the wake and the
 * flicker belong to the board.
 */
export function createMissile(color: string): MissileModel {
  const root = new Group()
  root.name = 'missile'
  root.userData = { units: 'board units' }

  const geometries = new Set<BufferGeometry>()
  const materials = new Set<MeshStandardMaterial>()

  function material(base: string, metalness: number, emissive = 0): MeshStandardMaterial {
    const made = new MeshStandardMaterial({
      color: base,
      roughness: 0.52,
      metalness,
      emissive: new Color(base),
      emissiveIntensity: emissive,
    })
    materials.add(made)
    return made
  }

  /**
   * The airframe's plating, and the reason it is paint rather than bare steel:
   * a cylinder five units across shows the camera its flanks, not its crown,
   * and there is no environment map out here, so the yard's steel at 0.75
   * metalness rendered the whole body black on the board. Steel stays where a
   * frame would actually be bare — the shroud, the fin seats, the strapping.
   */
  const paint = material(HULL_INK.paint, 0.2)
  const steel = material(HULL_INK.steel, 0.3)
  const dark = material(HULL_INK.dark, 0.65)
  const copper = material(HULL_INK.copper, 0.72)
  const cyan = material(HULL_INK.cyan, 0.3, 1.6)
  const glow = material(HULL_INK.glow, 0.2, 3.2)
  /**
   * The owner's colour, lit a little harder than a station's identity band: a
   * station is 34 units across and this is 9, and whose missile it is has to
   * carry from the far side of the table.
   */
  const identity = material(color, 0.3, 1.1)

  const add = (
    geometry: BufferGeometry,
    mat: MeshStandardMaterial,
    position: [number, number, number],
    rotation: [number, number, number] = [0, 0, -Math.PI / 2],
    parent: Group = root
  ) => {
    geometries.add(geometry)
    const mesh = new Mesh(geometry, mat)
    mesh.position.set(...position)
    mesh.rotation.set(...rotation)
    parent.add(mesh)
    return mesh
  }

  /**
   * Every lathe part is modelled about +Y and laid down along +X, which is the
   * default rotation above: one axis convention for the whole airframe.
   */
  const noseBase = TIP - NOSE_LENGTH
  const nozzleFront = TAIL + 2.4

  // Airframe: plated, very slightly tapered so the tail reads as the tail, with
  // two bare steel straps where the sections are strapped together.
  add(new CylinderGeometry(BODY_RADIUS, BODY_RADIUS * 1.06, noseBase - nozzleFront, 12), paint, [
    (noseBase + nozzleFront) / 2,
    0,
    0,
  ])
  for (const x of [2.4, -6.2])
    add(new CylinderGeometry(BODY_RADIUS * 1.04, BODY_RADIUS * 1.04, 1.1, 12), steel, [x, 0, 0])

  // Nose: a dark cone, with a cyan seeker window at the tip.
  add(new ConeGeometry(BODY_RADIUS, NOSE_LENGTH, 12), dark, [noseBase + NOSE_LENGTH / 2, 0, 0])
  add(new CylinderGeometry(0.62, 0.62, 0.7, 8), cyan, [TIP - 0.2, 0, 0])

  // The identity band, sitting in a dark seat right behind the nose: the one
  // piece of the owner's colour that faces the camera whichever way it flies.
  add(new CylinderGeometry(BODY_RADIUS * 1.02, BODY_RADIUS * 1.02, 2.6, 12), dark, [
    noseBase - 1.3,
    0,
    0,
  ])
  add(new CylinderGeometry(BODY_RADIUS * 1.12, BODY_RADIUS * 1.12, 1.5, 12), identity, [
    noseBase - 1.3,
    0,
    0,
  ])

  // Plating: a panel gap down each upper flank and a copper feed line down the
  // lower one — the plumbing every other thing in this yard wears. Both are
  // kept off the crown, because the crown is the face the table camera looks
  // at and a dark stripe straight down it swallowed the whole airframe.
  const spine = noseBase - nozzleFront
  for (const side of [-1, 1]) {
    const gap = new Group()
    gap.rotation.x = side * 0.7
    const panel = new Mesh(new BoxGeometry(spine - 3, 0.4, 0.7), dark)
    geometries.add(panel.geometry)
    panel.position.set((noseBase + nozzleFront) / 2, BODY_RADIUS * 0.95, 0)
    gap.add(panel)
    root.add(gap)

    const feed = new Group()
    feed.rotation.x = side * 2.35
    const line = new Mesh(new CylinderGeometry(0.3, 0.3, spine - 5, 6), copper)
    geometries.add(line.geometry)
    line.rotation.z = -Math.PI / 2
    line.position.set((noseBase + nozzleFront) / 2, BODY_RADIUS * 0.93, 0)
    feed.add(line)
    root.add(feed)
  }
  // A copper seam where the warhead section bolts to the motor.
  add(new CylinderGeometry(BODY_RADIUS * 1.06, BODY_RADIUS * 1.06, 0.8, 12), copper, [-1.5, 0, 0])

  // Four straight fins at the tail, in the owner's colour: at table range this
  // and the band are the whole read.
  const fin = new BoxGeometry(7, 0.55, 2.4)
  const finRoot = new BoxGeometry(2.2, 0.9, 1.4)
  geometries.add(fin)
  geometries.add(finRoot)
  for (let i = 0; i < 4; i++) {
    const blade = new Group()
    blade.rotation.x = (i / 4) * Math.PI * 2
    const spar = new Mesh(fin, identity)
    spar.position.set(nozzleFront + 2.6, 0, WIDTH / 2 - 1.2)
    blade.add(spar)
    const seat = new Mesh(finRoot, steel)
    seat.position.set(nozzleFront + 2.6, 0, BODY_RADIUS * 0.9)
    blade.add(seat)
    root.add(blade)
  }

  // Motor: a steel shroud and a lit nozzle, the same thrust colour a hull's
  // engine burns.
  add(new CylinderGeometry(BODY_RADIUS * 1.1, BODY_RADIUS * 0.92, 1.6, 12), steel, [
    nozzleFront - 0.2,
    0,
    0,
  ])
  // A bell: narrow at the throat, open at the exit.
  add(new CylinderGeometry(BODY_RADIUS * 0.5, BODY_RADIUS * 0.9, 2.2, 12), glow, [TAIL + 1.1, 0, 0])

  return {
    root,
    dispose: () => {
      geometries.forEach(geometry => geometry.dispose())
      materials.forEach(mat => mat.dispose())
    },
  }
}
