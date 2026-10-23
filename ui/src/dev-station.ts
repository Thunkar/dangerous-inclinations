/**
 * The station from the yard, with no server and no React:
 * `dev-station.html?view=iso` (views: iso, side, top, front, below). `ships=1`
 * moors a corvette on each berth at the board's scale, `planet=alpha|beta|gamma`
 * colours the deck. The reference the printed station is drawn against.
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
import { DEFAULT_SHIP_APPEARANCE } from '@dangerous-inclinations/engine'
import { DEFAULT_CONFIG } from './ships/config'
import { HULL_INFO } from './ships/hulls'
import { createShip } from './ships/model'
import { createStation, STATION_BERTHS, UNITS_PER_MM } from './ships/station'
import { wellColor } from './components/board/geometry'

const params = new URLSearchParams(location.search)
const view = params.get('view') ?? 'iso'
const planet = params.get('planet') ?? 'alpha'
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

const station = createStation(wellColor(`planet-${planet}`))
scene.add(station.root)
if (params.get('ships') === '1') {
  const fit = HULL_INFO.corvette.board
  for (const berth of STATION_BERTHS) {
    const ship = createShip({
      ...DEFAULT_CONFIG,
      appearance: { ...DEFAULT_SHIP_APPEARANCE, hull: 'corvette' },
    })
    ship.root.scale.setScalar(fit.scale)
    ship.root.position.set(berth.x, berth.y + 4 + fit.lift, berth.z)
    ship.root.rotation.y = -berth.heading
    scene.add(ship.root)
  }
}
scene.updateMatrixWorld(true)

const box = new Box3().setFromObject(scene)
const centre = box.getCenter(new Vector3())
const size = box.getSize(new Vector3()).length()
const directions: Record<string, Vector3> = {
  iso: new Vector3(1, 0.8, 1.2),
  low: new Vector3(1, 0.3, 1.1),
  under: new Vector3(0.5, -0.45, 1.1),
  side: new Vector3(0.0001, 0.1, 1),
  top: new Vector3(0.0001, 1, 0.0001),
  front: new Vector3(1, 0.1, 0.0001),
  below: new Vector3(1, -0.5, 1.2),
}
// `view=radiator` looks up at the radiator across the ring from below, close.
if (view === 'radiator') {
  centre.set(0, 13.6 * UNITS_PER_MM, -4.6 * UNITS_PER_MM)
  directions.radiator = new Vector3(0.35, -0.55, -1)
}
const camera = new PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 2000)
camera.position
  .copy(centre)
  .addScaledVector(
    (directions[view] ?? directions.iso).normalize(),
    ((view === 'radiator' ? 0.55 : 1) * size * 1.9) / zoom
  )
camera.lookAt(centre)
renderer.render(scene, camera)
document.title = `ready station ${view}`
