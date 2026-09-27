/**
 * Transfer lanes: the same pair of 4-sector arcs the paper board prints, in
 * the planet's colour, lettered at both ends.
 *
 * Lanes are one-way, so direction is shown by movement rather than by an
 * arrowhead: the departure arc is solid and its dashes run toward the arrival
 * arc, which is dashed and hollow-lettered. The arc you could jump from right
 * now is brighter and flows faster. No connector line crosses the map: the
 * letter is what tells you which arc comes out where. Hovering a lane names
 * it, with the words the flat board uses (`labels.ts`).
 */
import { useCallback, useMemo, useState } from 'react'
import { Color, DoubleSide } from 'three'
import { Billboard, Text } from '@react-three/drei'
import { BOARD_FONT } from '../fonts'
import type { TransferArc, TransferLane } from '@dangerous-inclinations/engine'
import { TRANSFER_LANES, laneDepartureArc } from '@dangerous-inclinations/engine'
import { TABLE } from '../../../../theme'
import { PRINT_SCALE, arcMidPoint, wellLineColor } from '../../geometry'
import { laneLabel, laneLetter } from '../../labels'
import { sceneTime } from '../clock'
import { RIBBON_FRAGMENT, RIBBON_VERTEX } from '../shaders/ribbon'
import { arcRibbonGeometry, cachedSurface } from '../surfaces'
import { LAYER, ringElevation } from '../world'
import { BoardTooltip } from './overlays/marks'

/** Offset of the A/B badge from its arc, as on the SVG board. */
const BADGE_OFFSET = 15 * PRINT_SCALE
/** How far the badge floats above the surface so it clears the ribbon. */
const BADGE_HEIGHT = 12 * PRINT_SCALE
const BADGE_RADIUS = 8.5 * PRINT_SCALE

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
  const width = (active ? 10 : departure ? 7 : 5) * PRINT_SCALE
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

/** Where a lane's badge floats over its arc. */
function badgeAt(arc: TransferArc): [number, number, number] {
  const mid = arcMidPoint(arc, BADGE_OFFSET)
  return [mid.x, ringElevation(arc.wellId, arc.ring) + LAYER.label + BADGE_HEIGHT, mid.y]
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
  return (
    <Billboard position={badgeAt(arc)}>
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
        <ringGeometry args={[BADGE_RADIUS, BADGE_RADIUS + (active ? 2 : 1.2) * PRINT_SCALE, 24]} />
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
        fontSize={10 * PRINT_SCALE}
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
  const color = wellLineColor(lane.planetId)
  const letter = laneLetter(lane.id)
  const departureArc = laneDepartureArc(lane)
  const [hovered, setHovered] = useState(false)
  const over = useCallback((event: { stopPropagation: () => void }) => {
    event.stopPropagation()
    setHovered(true)
  }, [])
  const out = useCallback(() => setHovered(false), [])
  const tip = useMemo(() => {
    const [x, y, z] = badgeAt(departureArc)
    return [x, y + BADGE_RADIUS * 2, z] as [number, number, number]
  }, [departureArc])
  return (
    <group onPointerOver={over} onPointerOut={out}>
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
      {hovered && <BoardTooltip position={tip}>{laneLabel(lane)}</BoardTooltip>}
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
