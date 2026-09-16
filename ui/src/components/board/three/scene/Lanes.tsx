/**
 * Transfer lanes: the same pair of 4-sector arcs the paper board prints, in
 * the planet's colour, lettered at both ends.
 *
 * Lanes are one-way, so direction is shown by movement rather than by an
 * arrowhead: the departure arc is solid and its dashes run toward the arrival
 * arc, which is dashed and hollow-lettered. The arc you could jump from right
 * now is brighter and flows faster. No connector line crosses the map — the
 * letter is what tells you which arc comes out where.
 */
import { useMemo } from 'react'
import { Color, DoubleSide } from 'three'
import { Billboard, Text } from '@react-three/drei'
import { BOARD_FONT } from '../fonts'
import type { TransferArc, TransferLane } from '@dangerous-inclinations/engine'
import { TRANSFER_LANES, laneDepartureArc } from '@dangerous-inclinations/engine'
import { TABLE } from '../../../../theme'
import { arcMidPoint, wellColor } from '../../geometry'
import { sceneTime } from '../clock'
import { RIBBON_FRAGMENT, RIBBON_VERTEX } from '../shaders/ribbon'
import { arcRibbonGeometry, cachedSurface } from '../surfaces'
import { LAYER, ringElevation } from '../world'

/** Offset of the A/B badge from its arc, as on the SVG board. */
const BADGE_OFFSET = 15
/** How far the badge floats above the surface so it clears the ribbon. */
const BADGE_HEIGHT = 12
const BADGE_RADIUS = 8.5

/** "beta-a" → "A": the two lanes to a planet are told apart by their letter. */
function laneLetter(laneId: string): string {
  return laneId.slice(-1).toUpperCase()
}

function LaneArc({
  arc,
  color,
  departure,
  active,
}: {
  arc: TransferArc
  color: string
  departure: boolean
  active: boolean
}) {
  const width = active ? 10 : departure ? 7 : 5
  const uniforms = useMemo(
    () => ({
      uColor: { value: new Color(color) },
      uTime: sceneTime,
      uSpeed: { value: active ? 0.85 : 0.3 },
      uDashes: { value: departure ? 6 : 10 },
      // An arrival arc is dashed for real: its gaps go to nothing, as they do
      // on the SVG board, so a lane's direction reads without an arrowhead.
      uBase: { value: departure ? (active ? 0.9 : 0.6) : active ? 0.12 : 0.06 },
      uDash: { value: departure ? 0.14 : active ? 0.85 : 0.5 },
      uDuty: { value: departure ? 0.5 : 0.45 },
      uAlongArc: { value: 1 },
    }),
    [color, departure, active]
  )
  return (
    <mesh
      geometry={cachedSurface(`lane:${arc.wellId}:${arc.ring}:${arc.startSector}:${width}`, () =>
        arcRibbonGeometry(
          arc.wellId,
          arc.ring,
          arc.startSector,
          arc.startSector + arc.length,
          width,
          LAYER.lane
        )
      )}
    >
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={RIBBON_VERTEX}
        fragmentShader={RIBBON_FRAGMENT}
        transparent
        depthWrite={false}
        side={DoubleSide}
        toneMapped={false}
      />
    </mesh>
  )
}

function LaneBadge({
  arc,
  color,
  letter,
  departure,
  active,
}: {
  arc: TransferArc
  color: string
  letter: string
  departure: boolean
  active: boolean
}) {
  const mid = arcMidPoint(arc, BADGE_OFFSET)
  const y = ringElevation(arc.wellId, arc.ring) + LAYER.label + BADGE_HEIGHT
  return (
    <Billboard position={[mid.x, y, mid.y]}>
      <mesh>
        <circleGeometry args={[BADGE_RADIUS, 24]} />
        <meshBasicMaterial
          color={departure ? color : TABLE.felt}
          transparent
          opacity={active ? 1 : 0.9}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0, 0.1]}>
        <ringGeometry args={[BADGE_RADIUS, BADGE_RADIUS + (active ? 2 : 1.2), 24]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={active ? 1 : 0.85}
          toneMapped={false}
        />
      </mesh>
      <Text
        font={BOARD_FONT}
        position={[0, 0, 0.4]}
        fontSize={10}
        color={departure ? TABLE.felt : color}
        anchorX="center"
        anchorY="middle"
      >
        {letter}
      </Text>
    </Billboard>
  )
}

function Lane({ lane, active }: { lane: TransferLane; active: boolean }) {
  const color = wellColor(lane.planetId)
  const letter = laneLetter(lane.id)
  const departureArc = laneDepartureArc(lane)
  return (
    <group>
      {[lane.blackHoleArc, lane.planetArc].map(arc => {
        const departure = arc === departureArc
        return (
          <group key={`${arc.wellId}-${arc.startSector}`}>
            <LaneArc arc={arc} color={color} departure={departure} active={active} />
            <LaneBadge
              arc={arc}
              color={color}
              letter={letter}
              departure={departure}
              active={active}
            />
          </group>
        )
      })}
    </group>
  )
}

export function Lanes({ activeLaneIds = [] }: { activeLaneIds?: readonly string[] }) {
  return (
    <>
      {TRANSFER_LANES.map(lane => (
        <Lane key={lane.id} lane={lane} active={activeLaneIds.includes(lane.id)} />
      ))}
    </>
  )
}
