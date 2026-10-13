/**
 * One ship from the yard, with no server and no React: `dev-ship.html?hull=
 * corvette&view=iso` (views: iso, side, top, front, rear). The reference the
 * printed pieces in `cad/` are drawn against.
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
import { DEFAULT_SHIP_APPEARANCE, type Hull } from '@dangerous-inclinations/engine'
import { DEFAULT_CONFIG } from './ships/config'
import { createShip } from './ships/model'

const params = new URLSearchParams(location.search)
const hull = (params.get('hull') ?? 'corvette') as Hull
const view = params.get('view') ?? 'iso'

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

const ship = createShip({ ...DEFAULT_CONFIG, appearance: { ...DEFAULT_SHIP_APPEARANCE, hull } })
scene.add(ship.root)

const box = new Box3().setFromObject(ship.root)
const centre = box.getCenter(new Vector3())
const size = box.getSize(new Vector3()).length()
const directions: Record<string, Vector3> = {
  iso: new Vector3(1, 0.8, 1.2),
  side: new Vector3(0, 0, 1),
  top: new Vector3(0, 1, 0.0001),
  front: new Vector3(1, 0, 0),
  rear: new Vector3(-1, 0.25, 0.4),
}
const camera = new PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 200)
camera.position
  .copy(centre)
  .addScaledVector((directions[view] ?? directions.iso).normalize(), size * 1.9)
camera.lookAt(centre)
renderer.render(scene, camera)
document.title = `ready ${hull} ${view}`
