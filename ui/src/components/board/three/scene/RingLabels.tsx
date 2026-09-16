/**
 * Sector ticks and every sector number, laid flat on the ring they belong to.
 *
 * The paper board prints all 24 numbers on all of its rings, so this one does
 * too: an inner ring prints its numbers smaller — by the same rule the SVG
 * board uses, a number is never wider than a share of the arc it names — and
 * fades them up as the camera comes closer, but never drops one. A number you
 * have to count around to is no number at all.
 *
 * The fade is a legibility rule, not a distance one: a label knows how many
 * pixels tall it is landing on screen and dims when that falls below what an
 * eye can read, so the full board is not a wall of digits and flying at a well
 * brings its inner rings up. Type is laid in the surface (rotated flat, reading
 * the way it reads from above) rather than billboarded, so the board still
 * looks printed.
 */
import { useMemo, useRef } from 'react'
import { MathUtils, PerspectiveCamera, Vector3 } from 'three'
import type { Group } from 'three'
import { Text } from '@react-three/drei'
import { BOARD_FONT } from '../fonts'
import { useFrame } from '@react-three/fiber'
import type { GravityWell } from '@dangerous-inclinations/engine'
import { SECTORS_PER_RING } from '@dangerous-inclinations/engine'
import { polar, ringRadius, sectorAngle, wellCenter } from '../../geometry'
import { BOARD_INK } from '../palette'
import { cachedSurface, sectorTicksGeometry } from '../surfaces'
import {
  GLYPH_HEIGHT,
  LAYER,
  SECTOR_TICK_LENGTH,
  ZERO_TICK_LENGTH,
  ringElevation,
  sectorLabelBand,
  surfaceElevation,
} from '../world'

/** Ticks: faint and short, sector 0 twice as long and amber, as on paper. */
const TICK_WIDTH = 1.6
const ZERO_TICK_WIDTH = 3.2

/** The R{n} · v{v} caption, printed outside its ring as on the paper board. */
const CAPTION_SIZE = 15
const CAPTION_OFFSET = 12

/**
 * On-screen heights, in pixels, between which a number fades up to full ink.
 * The full-board presets land every ring above `FADE_TO`, so what the fade
 * catches is a camera pulled back past them, or an inner ring of a well on the
 * far side of the table; flying at a well brings its numbers all the way up.
 */
const FADE_FROM = 3.5
const FADE_TO = 7.5
const FADE_FLOOR = 0.45

/** Flat on the surface, reading left to right when seen from above. */
const FLAT: [number, number, number] = [-Math.PI / 2, 0, 0]

/**
 * The 24 numbers of one ring, plus its caption, sharing one opacity: the fade
 * is evaluated on the camera rather than in React, so the scene never
 * re-renders for it.
 */
function SectorNumbers({
  well,
  ring,
  velocity,
}: {
  well: GravityWell
  ring: number
  velocity: number
}) {
  const center = wellCenter(well.id)
  const band = sectorLabelBand(well.id, ring)
  const elevation = ringElevation(well.id, ring)
  /*
   * The caption is printed outside its ring, as on the paper board, which puts
   * it on the ramp up to the next terrace: it sits at the height of its own
   * outer edge so it rests on the slope instead of sinking into it.
   */
  const captionRadius = ringRadius(well.id, ring) + CAPTION_OFFSET
  const captionElevation =
    surfaceElevation(well.id, captionRadius + (CAPTION_SIZE * GLYPH_HEIGHT) / 2) + LAYER.label
  const group = useRef<Group>(null)
  const applied = useRef(-1)
  const anchor = useMemo(
    () => new Vector3(center.x, elevation, center.y),
    [center.x, center.y, elevation]
  )

  useFrame(({ camera, size }) => {
    if (!(camera instanceof PerspectiveCamera)) return
    // How tall this ring's digits are landing, in pixels.
    const halfFrame = size.height / (2 * Math.tan(MathUtils.degToRad(camera.fov) / 2))
    const distance = Math.max(1, camera.position.distanceTo(anchor))
    const pixels = (band.size * GLYPH_HEIGHT * halfFrame) / distance
    const opacity = MathUtils.clamp((pixels - FADE_FROM) / (FADE_TO - FADE_FROM), FADE_FLOOR, 1)
    if (Math.abs(opacity - applied.current) < 0.01) return
    applied.current = opacity
    group.current?.traverse(child => {
      const text = child as unknown as {
        fillOpacity?: number
        outlineOpacity?: number
        userData: { baseOpacity?: number }
      }
      if (typeof text.fillOpacity !== 'number') return
      const base = text.userData.baseOpacity ?? 1
      text.fillOpacity = opacity * base
      text.outlineOpacity = opacity
    })
  })

  return (
    <group ref={group}>
      {/* Straight up in board space, exactly where the SVG board prints it. */}
      <Text
        font={BOARD_FONT}
        position={[center.x, captionElevation, center.y - captionRadius]}
        rotation={FLAT}
        fontSize={CAPTION_SIZE}
        color={BOARD_INK.caption}
        anchorX="center"
        anchorY="middle"
        outlineWidth={CAPTION_SIZE * 0.07}
        outlineColor={BOARD_INK.labelOutline}
        outlineOpacity={0.85}
        userData={{ baseOpacity: 0.9 }}
      >
        {`R${ring} · v${velocity}`}
      </Text>

      {Array.from({ length: SECTORS_PER_RING }, (_, sector) => {
        const at = polar(center, band.radius, sectorAngle(well.id, sector))
        return (
          <Text
            font={BOARD_FONT}
            key={sector}
            position={[at.x, elevation + LAYER.label, at.y]}
            rotation={FLAT}
            fontSize={band.size}
            color={sector === 0 ? BOARD_INK.zero : BOARD_INK.label}
            fillOpacity={sector === 0 ? 1 : BOARD_INK.labelOpacity}
            userData={{ baseOpacity: sector === 0 ? 1 : BOARD_INK.labelOpacity }}
            anchorX="center"
            anchorY="middle"
            outlineWidth={band.size * 0.1}
            outlineColor={BOARD_INK.labelOutline}
            outlineOpacity={1}
          >
            {sector}
          </Text>
        )
      })}
    </group>
  )
}

export function RingLabels({ well }: { well: GravityWell }) {
  const sectors = useMemo(() => Array.from({ length: SECTORS_PER_RING }, (_, sector) => sector), [])
  return (
    <group>
      {well.rings.map(ring => (
        <group key={ring.ring}>
          <mesh
            geometry={cachedSurface(`ticks:${well.id}:${ring.ring}`, () =>
              sectorTicksGeometry(
                well.id,
                ring.ring,
                sectors.filter(sector => sector !== 0),
                SECTOR_TICK_LENGTH,
                TICK_WIDTH,
                LAYER.ring
              )
            )}
          >
            <meshBasicMaterial
              color={BOARD_INK.tick}
              transparent
              opacity={BOARD_INK.tickOpacity}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <mesh
            geometry={cachedSurface(`zerotick:${well.id}:${ring.ring}`, () =>
              sectorTicksGeometry(
                well.id,
                ring.ring,
                [0],
                ZERO_TICK_LENGTH,
                ZERO_TICK_WIDTH,
                LAYER.ring
              )
            )}
          >
            <meshBasicMaterial
              color={BOARD_INK.zero}
              transparent
              opacity={0.95}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <SectorNumbers well={well} ring={ring.ring} velocity={ring.velocity} />
        </group>
      ))}
    </group>
  )
}
