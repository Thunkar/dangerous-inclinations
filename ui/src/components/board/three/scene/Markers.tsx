/**
 * Loose tokens: the stations that orbit each planet and the players' Homes.
 *
 * A station is a hub, a ring and two spokes in its planet's colour, turning
 * slowly — enough structure to read as a place you dock at from any angle. A
 * Home is the same four landing-pad brackets the paper board prints, extruded
 * a little off the surface: a berth, not a hull outline, so a ship parked on
 * its Home sits inside them.
 */
import { useRef } from 'react'
import { Color, type Group } from 'three'
import { useFrame } from '@react-three/fiber'
import type { Station } from '@dangerous-inclinations/engine'
import { stationPosition } from '@dangerous-inclinations/engine'
import type { HomeMarker } from '../../model'
import { wellColor } from '../../geometry'
import { LAYER, positionWorld } from '../world'

const HOME_BRACKETS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const

/** Bracket arms, in board units, exactly where the SVG board draws them. */
const BRACKET_OUTER = 13
const BRACKET_INNER = 7
const BRACKET_THICKNESS = 1.8
const BRACKET_HEIGHT = 2.6

function StationToken({ station }: { station: Station }) {
  const structure = useRef<Group>(null)
  const color = wellColor(station.planetId)
  const at = positionWorld(stationPosition(station), LAYER.token)

  useFrame((_, delta) => {
    if (structure.current) structure.current.rotation.y += delta * 0.35
  })

  return (
    <group position={at}>
      <group ref={structure}>
        <mesh>
          <icosahedronGeometry args={[4.6, 0]} />
          <meshStandardMaterial
            color={color}
            emissive={new Color(color)}
            emissiveIntensity={0.5}
            roughness={0.5}
          />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[10, 1.1, 8, 36]} />
          <meshStandardMaterial
            color={color}
            emissive={new Color(color)}
            emissiveIntensity={0.35}
            roughness={0.6}
          />
        </mesh>
        {[0, Math.PI / 2].map(angle => (
          <mesh key={angle} rotation={[0, angle, 0]}>
            <boxGeometry args={[21, 1.2, 1.2]} />
            <meshStandardMaterial
              color={color}
              emissive={new Color(color)}
              emissiveIntensity={0.3}
              roughness={0.6}
            />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function HomePad({ home }: { home: HomeMarker }) {
  const at = positionWorld(home.position, LAYER.token)
  const span = BRACKET_OUTER - BRACKET_INNER + BRACKET_THICKNESS
  const mid = (BRACKET_OUTER + BRACKET_INNER) / 2
  return (
    <group position={at}>
      {HOME_BRACKETS.map(([sx, sz]) => (
        <group key={`${sx}${sz}`}>
          <mesh position={[sx * BRACKET_OUTER, BRACKET_HEIGHT / 2, sz * mid]}>
            <boxGeometry args={[BRACKET_THICKNESS, BRACKET_HEIGHT, span]} />
            <meshStandardMaterial
              color={home.color}
              emissive={new Color(home.color)}
              emissiveIntensity={0.45}
              roughness={0.7}
            />
          </mesh>
          <mesh position={[sx * mid, BRACKET_HEIGHT / 2, sz * BRACKET_OUTER]}>
            <boxGeometry args={[span, BRACKET_HEIGHT, BRACKET_THICKNESS]} />
            <meshStandardMaterial
              color={home.color}
              emissive={new Color(home.color)}
              emissiveIntensity={0.45}
              roughness={0.7}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}

export function Markers({
  stations,
  homes,
}: {
  stations: readonly Station[]
  homes: readonly HomeMarker[]
}) {
  return (
    <>
      {homes.map(home => (
        <HomePad key={`home-${home.playerId}`} home={home} />
      ))}
      {stations.map(station => (
        <StationToken key={station.id} station={station} />
      ))}
    </>
  )
}
