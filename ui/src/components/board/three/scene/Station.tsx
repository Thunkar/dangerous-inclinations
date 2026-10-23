/**
 * The station that orbits each planet: the yard's model (`ships/station.ts`),
 * the same one the table prints, in the planet's colour.
 *
 * It stands on its sector turned the way a ship facing prograde is, so its
 * berths come round with it, and the moored ships ride on them
 * (`world.berthWorld`, which `Ships.tsx` stands each hull on). When the
 * stations make their step it slides along its ring as a drifting wreck does,
 * turning with the ring as it goes, and the riders keep their berths.
 *
 * The players it has bought from show as tiles in their colours round the
 * foot. Nothing re-renders per frame: the slide and the beacon's pulse are
 * written straight onto the objects.
 */
import { useEffect, useMemo, useRef } from 'react'
import { Color, Vector3, type Group, type Mesh, type MeshStandardMaterial } from 'three'
import { useFrame } from '@react-three/fiber'
import { sceneTime } from '../clock'
import { createStation, UNITS_PER_MM } from '../../../../ships/station'
import { driftProgress, headingAtPoint, wellColor } from '../../geometry'
import { LAYER, interpolateWorld, positionWorld, stationYaw, yawFromHeading } from '../world'
import type { StationMarker } from '../../model'

/** Seconds for one beacon cycle. */
const BEACON_PERIOD = 2.6
/** The sold-at tiles on the foot's top, board units: how far out, how far apart, how big. */
const SOLD_RADIUS = 5.6 * UNITS_PER_MM
const SOLD_STEP = 0.42
const SOLD_TILE: [number, number, number] = [2.2, 1, 2.2]
const FOOT_TOP = 1.6 * UNITS_PER_MM

export function StationToken({ station }: { station: StationMarker }) {
  const node = useRef<Group>(null)
  const identity = wellColor(station.planetId)
  const model = useMemo(() => createStation(identity), [identity])
  useEffect(() => () => model.dispose(), [model])
  const beacon = useMemo(
    () => model.root.getObjectByName('station_beacon') as Mesh | undefined,
    [model]
  )
  /** Off the board's clock, so the three stations do not blink together. */
  const offset = useMemo(
    () => [...station.id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 100,
    [station.id]
  )
  const at = useMemo(() => positionWorld(station.position, LAYER.token), [station.position])
  const yaw = useMemo(() => stationYaw(station.position), [station.position])
  const scratch = useMemo(() => new Vector3(), [])

  useFrame(() => {
    const group = node.current
    if (group) {
      const motion = station.motion
      const t = driftProgress(station, performance.now())
      if (motion && t < 1) {
        interpolateWorld(motion.from, station.position, t, LAYER.token, scratch)
        group.position.copy(scratch)
        group.rotation.y = yawFromHeading(
          headingAtPoint(station.position.wellId, { x: scratch.x, y: scratch.z }, 'prograde')
        )
      } else {
        group.position.copy(at)
        group.rotation.y = yaw
      }
    }
    if (beacon) {
      // Through the mesh's own material: the board writes animation onto the
      // objects it mounted, and nothing re-renders.
      const lamp = beacon.material as MeshStandardMaterial
      const phase = ((sceneTime.value + offset) / BEACON_PERIOD) % 1
      lamp.emissiveIntensity = 0.2 + 2.8 * Math.max(0, Math.sin(phase * Math.PI)) ** 8
    }
  })

  return (
    <group ref={node} name={`station-${station.planetId}`} position={at} rotation={[0, yaw, 0]}>
      <primitive object={model.root} dispose={null} />
      {/* A tile in the colour of each player this station has bought from:
          it buys one item from each, once. Round the foot, under the arms. */}
      {station.soldBy.map((seller, i) => {
        const angle = Math.PI / 2 + (i - (station.soldBy.length - 1) / 2) * SOLD_STEP
        return (
          <mesh
            key={seller.playerId}
            name={`station_sold_${seller.playerId}`}
            position={[
              Math.cos(angle) * SOLD_RADIUS,
              FOOT_TOP + SOLD_TILE[1] / 2,
              Math.sin(angle) * SOLD_RADIUS,
            ]}
            rotation={[0, -angle, 0]}
          >
            <boxGeometry args={SOLD_TILE} />
            <meshStandardMaterial
              color={seller.color}
              emissive={new Color(seller.color)}
              emissiveIntensity={0.6}
              roughness={0.6}
            />
          </mesh>
        )
      })}
    </group>
  )
}
