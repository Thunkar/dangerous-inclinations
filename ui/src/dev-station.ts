/**
 * The station from the yard, with no server and no React:
 * `dev-station.html?view=iso` (views: iso, side, top, front, below). `ships=1`
 * moors a corvette on each berth at the board's scale, `planet=alpha|beta|gamma`
 * colours the deck, and `board=1` lays planet ring 2 under it, the sectors a
 * ship docks from tinted. The reference the printed station is drawn against.
 */
import {
  AmbientLight,
  Box3,
  BufferGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
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
import {
  createStation,
  RING_MM,
  SECTOR_ANGLE,
  STATION_BERTHS,
  STATION_REACH,
  UNITS_PER_MM,
} from './ships/station'
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

/** The ring under the station: drawn, but not what the camera frames. */
const board = new Group()
const station = createStation(wellColor(`planet-${planet}`))
scene.add(station.root)
if (params.get('board') === '1') {
  // Planet ring 2 round the station, a sector's floor a quad strip, walls as lines.
  const show = STATION_REACH + 2
  scene.add(board)
  const u = UNITS_PER_MM
  const at = (r: number, a: number): [number, number, number] => [
    r * Math.sin(a) * u,
    -0.02,
    (r * Math.cos(a) - RING_MM.radius) * u,
  ]
  const r0 = RING_MM.radius - RING_MM.width / 2
  const r1 = RING_MM.radius + RING_MM.width / 2
  const lines: number[] = []
  for (let k = -show; k <= show; k++) {
    const a0 = (k - 0.5) * SECTOR_ANGLE
    const a1 = (k + 0.5) * SECTOR_ANGLE
    const pos: number[] = []
    const steps = 6
    for (let i = 0; i < steps; i++) {
      const b0 = a0 + ((a1 - a0) * i) / steps
      const b1 = a0 + ((a1 - a0) * (i + 1)) / steps
      pos.push(
        ...at(r0, b0),
        ...at(r1, b0),
        ...at(r1, b1),
        ...at(r0, b0),
        ...at(r1, b1),
        ...at(r0, b1)
      )
      lines.push(...at(r0, b0), ...at(r0, b1), ...at(r1, b0), ...at(r1, b1))
    }
    lines.push(...at(r0, a0), ...at(r1, a0), ...at(r0, a1), ...at(r1, a1))
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    g.computeVertexNormals()
    const docks = Math.abs(k) <= STATION_REACH
    board.add(
      new Mesh(
        g,
        new MeshStandardMaterial({
          color: docks ? '#7a3a30' : '#2a2c30',
          roughness: 0.9,
          side: DoubleSide,
        })
      )
    )
  }
  const lg = new BufferGeometry()
  lg.setAttribute('position', new Float32BufferAttribute(lines, 3))
  board.add(new LineSegments(lg, new LineBasicMaterial({ color: '#8a8478' })))
}
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

const box = new Box3()
for (const child of scene.children) if (child !== board) box.expandByObject(child)
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
// `view=radiator` looks up at the prograde radiator from below, close.
if (view === 'radiator') {
  centre.set(3.2 * UNITS_PER_MM, 21.7 * UNITS_PER_MM, 0)
  directions.radiator = new Vector3(1, -0.55, 0.35)
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
