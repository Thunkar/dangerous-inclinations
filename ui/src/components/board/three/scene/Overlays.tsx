/**
 * What the turn you are building would do: the sectors your weapon reaches,
 * the path your move takes, the route the planner found, the sector you are
 * about to pick and the sectors you may deploy into.
 *
 * Every answer is already in the model; this only draws it. Five marks, each
 * the one the paper board prints — amber for a weapon's reach and for anything
 * you are being asked to click, your own colour for your move, a cool cyan for
 * the planner — laid on the surface at the layer that keeps them off the rings
 * and out of the way of the tokens.
 */
import { memo, useMemo } from 'react'
import type { Vector3 } from 'three'
import { Billboard, Text } from '@react-three/drei'
import type { MovementPlan, Position } from '@dangerous-inclinations/engine'
import { SECTORS_PER_RING, getWellName } from '@dangerous-inclinations/engine'
import { TABLE } from '../../../../theme'
import { allWells } from '../../geometry'
import type { BoardModel } from '../../model'
import { BOARD_FONT } from '../fonts'
import { EDGE_HUE } from '../palette'
import { LAYER, positionWorld } from '../world'
import { SurfaceDot, SurfaceLine, SurfaceRing, WedgeField } from './overlays/marks'
import { NO_RAYCAST, arcPoints, chordSamples } from './overlays/paths'
import { DEPLOY_BAND, WEDGE_BAND } from './overlays/wedges'

/** The one accent for a weapon's reach and for anything you may click. */
const ACCENT = TABLE.accent
/** The planner's cool cyan, so a route never reads as a lane or a weapon. */
const ROUTE = TABLE.energy

/** Dash drift, in board units a second. Slow enough to read as direction. */
const DASH_SPEED = 9

/** The SVG board breathes a deployment wedge's whole opacity between these. */
const BREATH = [0.35, 0.8] as const

/** Radius of the numbered pip at the end of a route step. */
const PIP_RADIUS = 8.5
/** How far a pip floats over the surface so it clears the ring under it. */
const PIP_HEIGHT = 14

// ---------------------------------------------------------------------------
// Weapon range
// ---------------------------------------------------------------------------

/** The sectors the focus weapon reaches — asked of the engine in the model. */
const RangeWedges = memo(function RangeWedges({ cells }: { cells: readonly Position[] }) {
  return (
    <WedgeField
      cells={cells}
      band={WEDGE_BAND}
      color={ACCENT}
      fillOpacity={0.14}
      edgeOpacity={0.4}
    />
  )
})

// ---------------------------------------------------------------------------
// The move you are building
// ---------------------------------------------------------------------------

const PlannedPath = memo(function PlannedPath({
  points,
  color,
}: {
  points: readonly Position[]
  color: string
}) {
  const track = useMemo(() => arcPoints(points, LAYER.path), [points])
  const end = useMemo(
    () => (points.length > 0 ? positionWorld(points[points.length - 1], LAYER.path) : null),
    [points]
  )
  if (points.length < 2 || !end) return null
  return (
    <group>
      <SurfaceLine
        points={track}
        color={color}
        width={2.6}
        opacity={0.9}
        dash={7}
        gap={5}
        speed={DASH_SPEED}
      />
      <SurfaceRing position={end} color={color} radius={8} thickness={2.5} opacity={0.95} />
      <SurfaceDot position={end} color={color} radius={3} />
    </group>
  )
})

// ---------------------------------------------------------------------------
// Route planner
// ---------------------------------------------------------------------------

function RoutePip({ position, ordinal }: { position: Vector3; ordinal: number }) {
  return (
    <Billboard position={position}>
      <mesh raycast={NO_RAYCAST}>
        <circleGeometry args={[PIP_RADIUS, 24]} />
        <meshBasicMaterial color={TABLE.felt} transparent opacity={0.92} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.1]} raycast={NO_RAYCAST}>
        <ringGeometry args={[PIP_RADIUS, PIP_RADIUS + 1.3, 24]} />
        <meshBasicMaterial color={ROUTE} transparent opacity={0.95} toneMapped={false} />
      </mesh>
      <Text
        font={BOARD_FONT}
        position={[0, 0, 0.4]}
        fontSize={9.5}
        color={ROUTE}
        anchorX="center"
        anchorY="middle"
      >
        {String(ordinal)}
      </Text>
    </Billboard>
  )
}

/**
 * The turns of a planned route: one dashed leg per step, a numbered pip where
 * each turn ends and a diamond on the destination. A jump between wells is the
 * straight line the SVG board draws — there is no arc to follow between them.
 */
const RouteOverlay = memo(function RouteOverlay({ route }: { route: MovementPlan }) {
  const legs = useMemo(
    () =>
      route.steps.map(step => ({
        jump: step.actionType === 'well_transfer',
        points:
          step.actionType === 'well_transfer'
            ? chordSamples(step.from, step.to, 2, LAYER.path)
            : arcPoints([step.from, step.to], LAYER.path),
        pip: positionWorld(step.to, LAYER.label + PIP_HEIGHT),
      })),
    [route]
  )
  const destination = useMemo(
    () => positionWorld(route.destination, LAYER.path),
    [route.destination]
  )
  return (
    <group>
      {legs.map((leg, index) => (
        <group key={index}>
          <SurfaceLine
            points={leg.points}
            color={ROUTE}
            width={2}
            opacity={0.75}
            dash={leg.jump ? 4 : 3}
            gap={leg.jump ? 8 : 5}
            speed={DASH_SPEED}
          />
          <RoutePip position={leg.pip} ordinal={index + 1} />
        </group>
      ))}
      <SurfaceRing
        position={destination}
        color={ROUTE}
        radius={11}
        thickness={2.4}
        opacity={0.95}
        corners={4}
      />
    </group>
  )
})

// ---------------------------------------------------------------------------
// Sector picker
// ---------------------------------------------------------------------------

/**
 * Every sector of every ring of every well, as the SVG picker does. This is
 * the one enumeration the board makes for itself, and it still makes it out of
 * the engine's own wells and rings.
 */
function everySector(): Position[] {
  return allWells().flatMap(well =>
    well.rings.flatMap(ring =>
      Array.from({ length: SECTORS_PER_RING }, (_, sector) => ({
        wellId: well.id,
        ring: ring.ring,
        sector,
      }))
    )
  )
}

const SectorPicker = memo(function SectorPicker({
  onPick,
}: {
  onPick: (position: Position) => void
}) {
  const cells = useMemo(() => everySector(), [])
  return (
    <WedgeField
      cells={cells}
      band={WEDGE_BAND}
      color={EDGE_HUE}
      fillOpacity={0.04}
      litColor={ROUTE}
      litFillOpacity={0.5}
      cursor="crosshair"
      label={cell => `Route to ${getWellName(cell.wellId)} R${cell.ring} S${cell.sector}`}
      onPick={onPick}
    />
  )
})

// ---------------------------------------------------------------------------
// Deployment
// ---------------------------------------------------------------------------

const DeploymentWedges = memo(function DeploymentWedges({
  positions,
  onPick,
}: {
  positions: readonly Position[]
  onPick: (position: Position) => void
}) {
  return (
    <WedgeField
      cells={positions}
      band={DEPLOY_BAND}
      color={ACCENT}
      fillOpacity={0.22}
      edgeOpacity={1}
      breathe={BREATH}
      litColor={ACCENT}
      litFillOpacity={0.55}
      label={cell =>
        `Place your ship here — ${getWellName(cell.wellId)} R${cell.ring} S${cell.sector}. This sector becomes your Home.`
      }
      onPick={onPick}
    />
  )
})

export const Overlays = memo(function Overlays({ model }: { model: BoardModel }) {
  return (
    <>
      <RangeWedges cells={model.rangeCells} />
      {model.myColor && <PlannedPath points={model.plannedPoints} color={model.myColor} />}
      {model.route && <RouteOverlay route={model.route} />}
      {model.onPickDestination && <SectorPicker onPick={model.onPickDestination} />}
      {model.deployment && (
        <DeploymentWedges positions={model.deployment.positions} onPick={model.deployment.onPick} />
      )}
    </>
  )
})
