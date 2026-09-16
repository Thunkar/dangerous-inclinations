/**
 * The printed board: every gravity well, its plate, its rings and its body.
 *
 * The plate is a surface displaced by the funnel from `world.ts`, so the black
 * hole is visibly a well and the planets visibly dimples; the rings are
 * emissive ribbons laid on that surface at their own elevation. Each ribbon
 * carries a faint dashed pattern drifting prograde at a speed proportional to
 * the ring's velocity — the movement rule, animated, and the only thing on the
 * board that moves when nobody is playing.
 *
 * A well's name is printed below the well in the widest empty band its plate
 * has, and its size is solved from that band rather than set, so a ten-letter
 * name can no more overrun a sector number than a five-letter one can. There
 * are two such bands: inside ring 1, between the body and ring 1's numbers,
 * which is where the paper board prints it; and outside the outermost ring,
 * between its numbers and the rim of the plate. A planet keeps the first — its
 * pit is nearly empty. The black hole's is not: its accretion disc reaches out
 * to ring 1's numbers, and reserving a lane for a ten-letter label on the one
 * body whose identity is never in doubt cost the disc a fifth of its radius.
 * So the black hole's name goes out to the rim, where it is printed larger than
 * it ever was and nothing has to make room for it.
 *
 * Nothing here reads game state: ring counts, velocities and radii all come
 * from the engine through `geometry.ts`.
 */
import { useMemo } from 'react'
import { Color, DoubleSide } from 'three'
import { Text } from '@react-three/drei'
import { BOARD_FONT } from '../fonts'
import type { GravityWell, GravityWellId } from '@dangerous-inclinations/engine'
import { SECTORS_PER_RING } from '@dangerous-inclinations/engine'
import { allWells, wellCenter } from '../../geometry'
import { bodyExtent } from '../bodies'
import { sceneTime } from '../clock'
import { BOARD_INK } from '../palette'
import { RIBBON_FRAGMENT, RIBBON_VERTEX } from '../shaders/ribbon'
import { arcRibbonGeometry, cachedSurface, funnelPlateGeometry } from '../surfaces'
import {
  LAYER,
  PLATE_MARGIN,
  PRINT_SCALE,
  funnelFloorRadius,
  plateRadius,
  sectorLabelBand,
  surfaceElevation,
  wellOuterRadius,
} from '../world'
import { BlackHole } from './BlackHole'
import { Planet } from './Planet'
import { RingLabels } from './RingLabels'

/**
 * The printed line a ring is drawn as: it scales with the board, as the type does.
 *
 * It was 2.8, which was a rule drawn at the weight of a border. A ring is a
 * position, not a wall, and the width of the line is the one thing on the board
 * that can be given back to the space between two rings without moving
 * anything: at 1.7 the gap is 47 line-widths across where it was 14, which is
 * most of what makes the well read as open.
 */
const RING_WIDTH = 1.7 * PRINT_SCALE
/** The hairline around the edge of a well's plate. */
const PLATE_EDGE_WIDTH = 1.6 * PRINT_SCALE
/** Dash drift, in dashes per second per unit of ring velocity. Deliberately slow. */
const DRIFT_PER_VELOCITY = 0.18

/** The board's monospace face: 0.6 em per glyph, 0.72 em from baseline to cap. */
const GLYPH_ADVANCE = 0.6
const GLYPH_HEIGHT = 0.72
/** Space left between the name and both the body above it and the numbers below. */
const NAME_CLEARANCE = 3 * PRINT_SCALE
const NAME_MAX = 20 * PRINT_SCALE
const NAME_MIN = 8 * PRINT_SCALE

interface Nameplate {
  size: number
  /** Distance below the well's centre, in board units. */
  offset: number
}

/**
 * The largest the name can be set and still sit in one free band, which runs
 * from `inner` out to `outer` straight below the well's centre. The name is a
 * straight strip inside a circle, so its corners are what bind. Size 0 means it
 * does not fit in this band at all.
 */
function fitName(text: string, inner: number, outer: number): Nameplate {
  const fits = (size: number) => {
    const halfWidth = (text.length * GLYPH_ADVANCE * size) / 2
    const halfHeight = (GLYPH_HEIGHT * size) / 2
    return Math.hypot(halfWidth, inner + 2 * halfHeight) <= outer
  }
  const plate = (size: number) => ({ size, offset: inner + (GLYPH_HEIGHT * size) / 2 })
  if (!fits(NAME_MIN)) return { size: 0, offset: 0 }
  if (fits(NAME_MAX)) return plate(NAME_MAX)
  let low = NAME_MIN
  let high = NAME_MAX
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2
    if (fits(mid)) low = mid
    else high = mid
  }
  return plate(low)
}

/**
 * Where a well's name goes: the band below it that sets it largest.
 *
 * *Inside ring 1* the band runs from whatever the body reaches out to ring 1's
 * own ink, bounded by the floor of the funnel as well so the name never runs up
 * the wall. This is where the paper board prints it and where a planet keeps
 * it: a planet's pit is nearly all empty.
 *
 * *Below the plate* the band starts a clearance outside the rim and is allowed
 * one more plate margin of room. It is the only other place on the board that
 * is provably empty — the outermost ring carries the transfer lanes' ribbons,
 * and their A/B badges sit a badge's width outside it again, so the strip
 * between the last ring and the rim is not free even though it looks it. The
 * black hole ends up here, because its accretion disc reaches the ring 1
 * numbers and there is no band left inside.
 */
function nameplate(wellId: GravityWellId, text: string): Nameplate {
  const inside = fitName(
    text,
    bodyExtent(wellId) + NAME_CLEARANCE,
    Math.min(sectorLabelBand(wellId, 1).inner, funnelFloorRadius(wellId)) - NAME_CLEARANCE
  )
  const rim = plateRadius(wellId)
  const below = fitName(text, rim + NAME_CLEARANCE, rim + PLATE_MARGIN)
  if (below.size > inside.size) return below
  if (inside.size > 0) return inside
  return { size: NAME_MIN, offset: rim + NAME_CLEARANCE }
}

function RingRibbon({
  wellId,
  ring,
  velocity,
}: {
  wellId: GravityWellId
  ring: number
  velocity: number
}) {
  const uniforms = useMemo(
    () => ({
      uColor: { value: new Color(BOARD_INK.ring) },
      uTime: sceneTime,
      uSpeed: { value: velocity * DRIFT_PER_VELOCITY },
      uDashes: { value: SECTORS_PER_RING },
      uBase: { value: BOARD_INK.ringOpacity },
      uDash: { value: BOARD_INK.ringDash },
      uDuty: { value: 0.55 },
      uAlongArc: { value: 0 },
    }),
    [velocity]
  )
  return (
    <mesh
      geometry={cachedSurface(`ring:${wellId}:${ring}`, () =>
        arcRibbonGeometry(wellId, ring, 0, SECTORS_PER_RING, RING_WIDTH, LAYER.ring)
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

function Well({ well, onFocus }: { well: GravityWell; onFocus?: (wellId: GravityWellId) => void }) {
  const center = wellCenter(well.id)
  const outer = wellOuterRadius(well.id)
  const name = well.name.toUpperCase()
  const plate = nameplate(well.id, name)
  const focus = onFocus
    ? (event: { stopPropagation: () => void }) => {
        event.stopPropagation()
        onFocus(well.id)
      }
    : undefined

  return (
    <group>
      {/* The plate the well is printed on, shaped by its own gravity. */}
      <mesh
        geometry={cachedSurface(`plate:${well.id}`, () =>
          funnelPlateGeometry(well.id, plateRadius(well.id))
        )}
        receiveShadow={false}
      >
        {/* A little sheen, so the key light models the slope of the funnel
            instead of leaving it a flat dark disc — and a vertex shade by depth
            under it, so a terrace reads as a step even where no light falls. */}
        <meshStandardMaterial
          color={BOARD_INK.plate}
          vertexColors
          roughness={0.62}
          metalness={0.15}
        />
      </mesh>
      <mesh position={[center.x, LAYER.ring, center.y]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[outer + PLATE_MARGIN - PLATE_EDGE_WIDTH, outer + PLATE_MARGIN, 128]} />
        <meshBasicMaterial
          color={BOARD_INK.plateEdge}
          transparent
          opacity={0.16}
          depthWrite={false}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>

      {well.rings.map(ring => (
        <RingRibbon key={ring.ring} wellId={well.id} ring={ring.ring} velocity={ring.velocity} />
      ))}

      {well.type === 'blackhole' ? (
        <BlackHole onDoubleClick={focus} />
      ) : (
        <Planet wellId={well.id} onDoubleClick={focus} />
      )}

      <Text
        font={BOARD_FONT}
        position={[
          center.x,
          // On the surface at its own radius: below the plate that is the
          // table's own height, not the floor of the funnel.
          surfaceElevation(well.id, plate.offset) + LAYER.label,
          center.y + plate.offset,
        ]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={plate.size}
        color={BOARD_INK.name}
        fillOpacity={1}
        anchorX="center"
        anchorY="middle"
        outlineWidth={plate.size * 0.12}
        outlineColor={BOARD_INK.labelOutline}
        outlineOpacity={1}
      >
        {name}
      </Text>

      <RingLabels well={well} />
    </group>
  )
}

export function Wells({ onFocusWell }: { onFocusWell?: (wellId: GravityWellId) => void }) {
  return (
    <>
      {allWells().map(well => (
        <Well key={well.id} well={well} onFocus={onFocusWell} />
      ))}
    </>
  )
}
