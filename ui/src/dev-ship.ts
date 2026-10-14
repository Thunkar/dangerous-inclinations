/**
 * One ship from the yard, with no server and no React: `dev-ship.html?hull=
 * corvette&view=iso` (views: iso, side, top, front, rear, bottom, below). The reference the
 * printed pieces in `cad/` are drawn against. `module=<subsystem>` fits it
 * in every mount that takes it (`module=none` empties them), `focus=<mount>`
 * (side-0, forward-0, ...) frames that mount close up instead of the whole
 * ship, and `zoom=<n>` brings the camera n times closer.
 */
import {
  AmbientLight,
  Box3,
  DirectionalLight,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import {
  DEFAULT_SHIP_APPEARANCE,
  canInstallInSlot,
  type Hull,
  type SubsystemType,
} from '@dangerous-inclinations/engine'
import { DEFAULT_CONFIG, MOUNTS, setModule, type MountId, type ShipConfig } from './ships/config'
import { createShip } from './ships/model'

const params = new URLSearchParams(location.search)
const hull = (params.get('hull') ?? 'corvette') as Hull
const view = params.get('view') ?? 'iso'
const fitted = params.get('module') as SubsystemType | 'none' | null
const focus = params.get('focus') as MountId | null
const zoom = Number(params.get('zoom') ?? 1)

const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(devicePixelRatio)
renderer.setSize(innerWidth, innerHeight)
document.body.appendChild(renderer.domElement)

const scene = new Scene()
scene.environment = new PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
scene.add(new AmbientLight(0xffffff, 0.4))
const sun = new DirectionalLight(0xffffff, 2)
sun.position.set(4, 8, 6)
scene.add(sun)

let config: ShipConfig = { ...DEFAULT_CONFIG, appearance: { ...DEFAULT_SHIP_APPEARANCE, hull } }
if (fitted && fitted !== 'none')
  for (const mount of MOUNTS)
    if (canInstallInSlot(fitted, mount.group)) config = setModule(config, mount.id, fitted)
if (fitted === 'none') for (const mount of MOUNTS) config = setModule(config, mount.id, null)
const ship = createShip(config)
scene.add(ship.root)
ship.root.updateMatrixWorld(true)

const frame = focus ? ship.mounts.get(focus)?.frame : undefined
const box = new Box3().setFromObject(frame ?? ship.root)
const centre = box.getCenter(new Vector3())
const size = frame ? 3.2 : box.getSize(new Vector3()).length()
const directions: Record<string, Vector3> = {
  iso: new Vector3(1, 0.8, 1.2),
  side: new Vector3(0, 0, 1),
  top: new Vector3(0, 1, 0.0001),
  front: new Vector3(1, 0, 0),
  rear: new Vector3(-1, 0.25, 0.4),
  bottom: new Vector3(0.0001, -1, 0),
  below: new Vector3(1, -0.8, 1.2),
}
// A focused mount is seen from outboard (its frame's +Y), turned by the view.
if (frame) {
  const out = new Vector3(0, 1, 0).transformDirection(frame.matrixWorld)
  const fore = new Vector3(1, 0, 0)
  const up = new Vector3(0, 1, 0)
  directions.iso = out
    .clone()
    .add(up.clone().multiplyScalar(0.7))
    .add(fore.clone().multiplyScalar(0.8))
  directions.side = out.clone()
  directions.front = out.clone().add(fore.clone().multiplyScalar(1.5))
  directions.rear = out
    .clone()
    .add(fore.clone().multiplyScalar(-1.5))
    .add(up.clone().multiplyScalar(0.4))
  directions.top = out.clone().add(up.clone().multiplyScalar(2))
  directions.below = out
    .clone()
    .add(up.clone().multiplyScalar(-0.7))
    .add(fore.clone().multiplyScalar(0.8))
}
const camera = new PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 200)
camera.position
  .copy(centre)
  .addScaledVector((directions[view] ?? directions.iso).normalize(), (size * 1.9) / zoom)
camera.lookAt(centre)
renderer.render(scene, camera)
document.title = `ready ${hull} ${view}`
