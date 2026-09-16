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
 * A well's name is printed where the paper board prints it: on the floor of the
 * funnel, below the body and inside the innermost ring, in the one band of the
 * board where nothing else is ever drawn. Its size is solved from that band
 * rather than set, so a ten-letter name can no more overrun the ring 1 numbers
 * than a five-letter one can.
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
  funnelFloorRadius,
  plateRadius,
  sectorLabelBand,
  surfaceElevation,
  wellOuterRadius,
} from '../world'
import { BlackHole } from './BlackHole'
import { Planet } from './Planet'
import { RingLabels } from './RingLabels'

const RING_WIDTH = 2.8
/** Dash drift, in dashes per second per unit of ring velocity. Deliberately slow. */
const DRIFT_PER_VELOCITY = 0.18

/** The board's monospace face: 0.6 em per glyph, 0.72 em from baseline to cap. */
const GLYPH_ADVANCE = 0.6
const GLYPH_HEIGHT = 0.72
/** Space left between the name and both the body above it and the numbers below. */
const NAME_CLEARANCE = 3
const NAME_MAX = 20
const NAME_MIN = 8

interface Nameplate {
  size: number
  /** Distance below the well's centre, in board units. */
  offset: number
}

/**
 * The largest the name can be set and still sit inside the free band, which
 * runs from the edge of the body out to the inner edge of the ring 1 numbers.
 * The name is a straight strip inside a circle, so its corners are what bind.
 */
function nameplate(wellId: GravityWellId, text: string): Nameplate {
  const inner = bodyExtent(wellId) + NAME_CLEARANCE
  const outer =
    Math.min(sectorLabelBand(wellId, 1).inner, funnelFloorRadius(wellId)) - NAME_CLEARANCE
  const fits = (size: number) => {
    const halfWidth = (text.length * GLYPH_ADVANCE * size) / 2
    const halfHeight = (GLYPH_HEIGHT * size) / 2
    const offset = inner + halfHeight
    return Math.hypot(halfWidth, offset + halfHeight) <= outer
  }
  let low = NAME_MIN
  let high = NAME_MAX
  if (!fits(low)) return { size: low, offset: inner + (GLYPH_HEIGHT * low) / 2 }
  if (!fits(high)) {
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2
      if (fits(mid)) low = mid
      else high = mid
    }
  } else {
    low = high
  }
  return { size: low, offset: inner + (GLYPH_HEIGHT * low) / 2 }
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
        <ringGeometry args={[outer + PLATE_MARGIN - 1.6, outer + PLATE_MARGIN, 128]} />
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
        position={[center.x, surfaceElevation(well.id, 0) + LAYER.label, center.y + plate.offset]}
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
