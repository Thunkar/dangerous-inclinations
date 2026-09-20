/**
 * The station that orbits each planet: a depot built in the same yard as the
 * corvettes, not a token.
 *
 * It used to be an icosahedron, a torus and two crossed spars, the whole thing
 * in the planet's colour: legible from the table and nothing at all close up,
 * which is the opposite of how the rest of the board is drawn (see
 * `Planet.tsx`: texture at range, a world when you fly to it). So it is built
 * out of the ship's own material vocabulary (plated structure, bare steel
 * truss, copper plumbing, cyan for anything live) and the planet's colour is
 * spent where the table camera actually looks: the deck's top face and a wide
 * identity band around the core.
 *
 * **A moored ship parks under it.** A hull floats HOVER over the token layer
 * and stands about five units to either side of that, so everything with mass
 * here begins above `DECK` and the berths reach back down to meet it. Docking
 * slides a corvette into the deck's shadow instead of through a lump.
 *
 * **It stays inside the board's envelope.** `BOARD_RELIEF` is how high the
 * camera expects the tallest thing on the board to stand, and the mast is the
 * tallest thing here: the whole station fits under it, and its span fits inside
 * one sector of the ring it orbits on.
 *
 * Geometry repeats across the three stations, so it is built once at module
 * scope and outlives any single board; only the materials differ per planet,
 * and those are disposed with the token. Nothing re-renders per frame: the
 * ring's spin and the beacon's pulse are written straight onto refs.
 */
import { useEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  MeshStandardMaterial,
  Shape,
  TorusGeometry,
  type Group,
  type Mesh,
} from 'three'
import { useFrame } from '@react-three/fiber'
import { sceneTime } from '../clock'
import type { Station } from '@dangerous-inclinations/engine'
import { stationPosition } from '@dangerous-inclinations/engine'
import { HULL_INK } from '../../../../ships/palette'
import { wellColor } from '../../geometry'
import { LAYER, positionWorld } from '../world'

/**
 * Heights in board units above the token layer, which is itself 8 over the
 * terrace. A corvette floats 6 above the token layer with about 5 of hull over
 * that, so its roof is at 11 here and the deck's underside clears it.
 */
const DECK = 12
/**
 * The deck is wider than the habitat ring on purpose: seen from the table the
 * ring would otherwise cover it, and the deck's face is where the planet's
 * colour lives, the one thing that has to carry at that distance.
 */
const DECK_RADIUS = 17
const DECK_THICKNESS = 2.4
/** Each level clears the one below it, so the silhouette reads as storeys. */
const WING_HEIGHT = 18
const RING_HEIGHT = 26
const CORE_TOP = 30
const MAST_TOP = 35
/** Inside the 50-unit sector arc the station has to sit in. */
const RING_RADIUS = 14.5
const WING_SPAN = 24

/** Radians a second: slow enough that you notice only if you watch for it. */
const SPIN = 0.22
/** Seconds for one beacon cycle. */
const BEACON_PERIOD = 2.6

/** An octagonal plate, cut the way the hull sections are. */
function octagon(radius: number, thickness: number) {
  const shape = new Shape()
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + Math.PI / 8
    const point: [number, number] = [Math.cos(angle) * radius, Math.sin(angle) * radius]
    if (i === 0) shape.moveTo(...point)
    else shape.lineTo(...point)
  }
  shape.closePath()
  const geometry = new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false })
  geometry.rotateX(-Math.PI / 2)
  geometry.translate(0, -thickness / 2, 0)
  return geometry
}

/** Built once for the page: three stations draw the same parts. */
const GEO = {
  deck: octagon(DECK_RADIUS, DECK_THICKNESS),
  deckFace: octagon(DECK_RADIUS * 0.78, 0.4),
  core: new CylinderGeometry(4.2, 5.8, CORE_TOP - DECK, 8),
  band: new TorusGeometry(5.6, 1.1, 6, 8),
  capBand: new TorusGeometry(4.3, 0.7, 6, 8),
  coreCap: new CylinderGeometry(3, 4.4, 2.4, 8),
  strut: new BoxGeometry(1, 6, 1),
  strake: new BoxGeometry(0.7, CORE_TOP - DECK - 5, 0.7),
  /** A berth: a keyed pad and its two magnets, facing down at a moored hull. */
  shoe: new BoxGeometry(4.6, 1, 3),
  magnet: new CylinderGeometry(0.7, 0.7, 1.2, 8),
  light: new BoxGeometry(3.6, 0.6, 0.3),
  rail: new TorusGeometry(RING_RADIUS, 0.45, 5, 40),
  spoke: new BoxGeometry(RING_RADIUS - 3, 0.7, 1.2),
  /** One habitat can, eight to the ring. */
  can: new BoxGeometry(6.8, 4, 4.4),
  canInset: new BoxGeometry(7, 1.8, 2.4),
  arm: new BoxGeometry(9, 1.2, 1.2),
  panel: new BoxGeometry(15, 0.5, 8.4),
  panelFace: new BoxGeometry(13.6, 0.12, 7),
  trace: new BoxGeometry(13, 0.2, 0.22),
  tank: new CylinderGeometry(2.2, 2.2, 7.2, 10),
  tankCap: new CylinderGeometry(2.5, 2.5, 0.7, 10),
  tankBand: new TorusGeometry(2.3, 0.28, 5, 12),
  saddle: new BoxGeometry(2, 2.3, 7.8),
  mast: new CylinderGeometry(0.5, 0.8, MAST_TOP - CORE_TOP, 6),
  beacon: new CylinderGeometry(1, 1, 1, 8),
  navLight: new CylinderGeometry(0.45, 0.45, 0.55, 6),
} as const

const QUARTERS = [0, 1, 2, 3]
const CANS = 8
const TRACES = [-1.9, -0.65, 0.65, 1.9]

export function StationToken({ station }: { station: Station }) {
  const ring = useRef<Group>(null)
  const beacon = useRef<Mesh>(null)
  const identity = wellColor(station.planetId)
  const at = positionWorld(stationPosition(station), LAYER.token)
  /** Off the board's clock, so the three stations do not blink together. */
  const offset = useMemo(
    () => [...station.id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 100,
    [station.id]
  )

  /** One set per station: only the identity colour differs between them. */
  const mat = useMemo(() => {
    const make = (color: string, metalness: number, emissive = 0) =>
      new MeshStandardMaterial({
        color,
        roughness: 0.52,
        metalness,
        emissive: new Color(color),
        emissiveIntensity: emissive,
      })
    return {
      hull: make(HULL_INK.paint, 0.35),
      dark: make(HULL_INK.dark, 0.65),
      steel: make(HULL_INK.steel, 0.75),
      copper: make(HULL_INK.copper, 0.72),
      cyan: make(HULL_INK.cyan, 0.3, 1.4),
      /**
       * The yard's orange, kept to one band on the core: Beta's identity red
       * is close enough to it that spending it freely muddies that station.
       */
      accent: make(HULL_INK.accent, 0.4),
      beacon: make(HULL_INK.warn, 0.1, 1),
      /** The planet's colour, lit so it still carries at table range. */
      identity: make(identity, 0.3, 0.85),
    }
  }, [identity])

  useEffect(() => () => Object.values(mat).forEach(material => material.dispose()), [mat])

  useFrame((_, delta) => {
    if (ring.current) ring.current.rotation.y += delta * SPIN
    if (beacon.current) {
      // Through the mesh's own material, not the memo: the board writes
      // animation onto the objects it mounted, and nothing re-renders.
      const lamp = beacon.current.material as MeshStandardMaterial
      const phase = ((sceneTime.value + offset) / BEACON_PERIOD) % 1
      const flash = Math.max(0, Math.sin(phase * Math.PI))
      lamp.emissiveIntensity = 0.2 + 2.8 * flash ** 8
    }
  })

  return (
    <group name={`station-${station.planetId}`} position={at}>
      {/* The deck: the coloured face the table camera looks down on. */}
      <group name="station_deck" position={[0, DECK, 0]}>
        <mesh geometry={GEO.deck} material={mat.dark} />
        <mesh
          geometry={GEO.deckFace}
          material={mat.identity}
          position={[0, DECK_THICKNESS / 2, 0]}
        />
        {QUARTERS.map(i => {
          const angle = (i / 4) * Math.PI * 2
          return (
            <mesh
              key={i}
              geometry={GEO.light}
              material={mat.cyan}
              position={[
                Math.cos(angle) * (DECK_RADIUS - 1.5),
                DECK_THICKNESS / 2 + 0.2,
                Math.sin(angle) * (DECK_RADIUS - 1.5),
              ]}
              rotation={[0, -angle, 0]}
            />
          )
        })}
        {/* Four berths, reaching down to where a moored hull floats. */}
        {QUARTERS.map(i => {
          const angle = (i / 4) * Math.PI * 2 + Math.PI / 4
          return (
            <group
              key={i}
              position={[
                Math.cos(angle) * (DECK_RADIUS - 3.6),
                -1.3,
                Math.sin(angle) * (DECK_RADIUS - 3.6),
              ]}
              rotation={[0, -angle, 0]}
            >
              <mesh geometry={GEO.shoe} material={mat.steel} />
              {[-1.3, 1.3].map(offset => (
                <mesh
                  key={offset}
                  geometry={GEO.magnet}
                  material={mat.copper}
                  position={[offset, -0.8, 0]}
                />
              ))}
            </group>
          )
        })}
      </group>

      {/* The core the deck hangs off, with the identity band. */}
      <group name="station_core">
        <mesh geometry={GEO.core} material={mat.hull} position={[0, (DECK + CORE_TOP) / 2, 0]} />
        <mesh
          geometry={GEO.band}
          material={mat.identity}
          position={[0, DECK + 5, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        <mesh
          geometry={GEO.capBand}
          material={mat.accent}
          position={[0, CORE_TOP - 3, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        <mesh geometry={GEO.coreCap} material={mat.steel} position={[0, CORE_TOP, 0]} />
        {QUARTERS.map(i => {
          const angle = (i / 4) * Math.PI * 2 + Math.PI / 4
          return (
            <mesh
              key={i}
              geometry={GEO.strake}
              material={mat.steel}
              position={[Math.cos(angle) * 4.7, (DECK + CORE_TOP) / 2 + 1, Math.sin(angle) * 4.7]}
            />
          )
        })}
        {QUARTERS.map(i => {
          const angle = (i / 4) * Math.PI * 2
          return (
            <mesh
              key={i}
              geometry={GEO.strut}
              material={mat.steel}
              position={[Math.cos(angle) * 6, DECK + 3, Math.sin(angle) * 6]}
            />
          )
        })}
      </group>

      {/* The habitat ring: eight cans on a rail, turning. */}
      <group ref={ring} name="station_habitat" position={[0, RING_HEIGHT, 0]}>
        <mesh geometry={GEO.rail} material={mat.steel} rotation={[-Math.PI / 2, 0, 0]} />
        {QUARTERS.map(i => {
          const angle = (i / 4) * Math.PI * 2
          return (
            <mesh
              key={i}
              geometry={GEO.spoke}
              material={mat.steel}
              position={[
                Math.cos(angle) * (RING_RADIUS / 2 + 1.5),
                0,
                Math.sin(angle) * (RING_RADIUS / 2 + 1.5),
              ]}
              rotation={[0, -angle, 0]}
            />
          )
        })}
        {Array.from({ length: CANS }, (_, i) => {
          const angle = (i / CANS) * Math.PI * 2
          return (
            <group
              key={i}
              position={[Math.cos(angle) * RING_RADIUS, 0, Math.sin(angle) * RING_RADIUS]}
              rotation={[0, -angle + Math.PI / 2, 0]}
            >
              <mesh geometry={GEO.can} material={mat.hull} />
              <mesh geometry={GEO.canInset} material={mat.dark} position={[0, 0.35, 0]} />
              <mesh geometry={GEO.light} material={mat.cyan} position={[0, 0.35, 2.32]} />
            </group>
          )
        })}
      </group>

      {/* Radiator wings: the ship's radiator module, grown up. */}
      {[-1, 1].map(side => (
        <group key={side} name={`station_radiator_${side}`} position={[0, WING_HEIGHT, 0]}>
          <mesh geometry={GEO.arm} material={mat.copper} position={[side * 8, 0, 0]} />
          <group position={[side * (WING_SPAN - 7.5), 0, 0]} rotation={[side * 0.18, 0, 0]}>
            <mesh geometry={GEO.panel} material={mat.steel} />
            {[-0.28, 0.28].map(face => (
              <mesh
                key={face}
                geometry={GEO.panelFace}
                material={mat.dark}
                position={[0, face, 0]}
              />
            ))}
            {TRACES.map(z => (
              <mesh key={z} geometry={GEO.trace} material={mat.copper} position={[0, 0.3, z]} />
            ))}
          </group>
          <mesh
            geometry={GEO.navLight}
            material={mat.cyan}
            position={[side * WING_SPAN, 0, 0]}
            rotation={[0, 0, Math.PI / 2]}
          />
        </group>
      ))}

      {/* Tankage in saddles, flanged and banded. */}
      {[-1, 1].map(side => (
        <group key={side} name={`station_tank_${side}`} position={[0, DECK + 3.2, side * 8.6]}>
          <mesh geometry={GEO.saddle} material={mat.dark} />
          <mesh
            geometry={GEO.tank}
            material={mat.hull}
            position={[0, 1.2, 0]}
            rotation={[Math.PI / 2, 0, 0]}
          />
          {[-3.6, 3.6].map(z => (
            <mesh
              key={z}
              geometry={GEO.tankCap}
              material={mat.steel}
              position={[0, 1.2, z]}
              rotation={[Math.PI / 2, 0, 0]}
            />
          ))}
          <mesh geometry={GEO.tankBand} material={mat.copper} position={[0, 1.2, 0]} />
        </group>
      ))}

      {/* Mast and beacon. */}
      <mesh geometry={GEO.mast} material={mat.steel} position={[0, (CORE_TOP + MAST_TOP) / 2, 0]} />
      <mesh ref={beacon} geometry={GEO.beacon} material={mat.beacon} position={[0, MAST_TOP, 0]} />
    </group>
  )
}
