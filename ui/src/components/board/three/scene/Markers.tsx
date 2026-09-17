/**
 * Loose tokens: the stations that orbit each planet and the players' Homes.
 *
 * A Home is the same four landing-pad brackets the paper board prints,
 * extruded a little off the surface: a berth, not a hull outline, so a ship
 * parked on its Home sits inside them. The station is a model of its own and
 * lives in `Station.tsx`.
 */
import { Color } from 'three'
import type { Station } from '@dangerous-inclinations/engine'
import type { HomeMarker } from '../../model'
import { LAYER, positionWorld } from '../world'
import { StationToken } from './Station'

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
