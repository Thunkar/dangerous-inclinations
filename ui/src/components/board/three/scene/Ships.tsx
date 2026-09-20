/**
 * Corvette miniatures, built from the observer's filtered visual specification.
 * Movement, banking, exhaust, impacts, and target rings retain the board's
 * existing animation clock and interaction model. +X points toward the bow.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  MathUtils,
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
} from 'three'
import { useFrame } from '@react-three/fiber'
import { SECTORS_PER_RING } from '@dangerous-inclinations/engine'
import { createShip } from '../../../../ships/model'
import { boardConfig, type ShipVisual } from '../../../../ships/visual'
import { MOUNTS } from '../../../../ships/config'
import { TABLE } from '../../../../theme'
import type { ShipToken } from '../../model'
import { crowdOffset, headingAtPoint, positionPoint, radialPoint } from '../../geometry'
import { sceneTime } from '../clock'
import { DASHED_RING_FRAGMENT, DASHED_RING_VERTEX } from '../shaders/dashedRing'
import { usePointerDrag } from '../usePointerDrag'
import {
  LAYER,
  elevationAt,
  facingYaw,
  interpolateWorld,
  positionWorld,
  toWorld,
  yawFromHeading,
} from '../world'
import { BoardTooltip } from './overlays/marks'
import { sampleImpact } from './effects/impacts'
import { countRender } from './effects/renders'
import { NO_RAYCAST } from './effects/resources'

/** Stable board envelope, independent of loadout and cosmetic choices. */
const LENGTH = 40
const WIDTH = 26
const HEIGHT = 10
/** How far the hull floats over the surface its rings are drawn on. */
const HOVER = 6

/** Marks on the surface under a hull, sized so neither crosses a neighbouring ring. */
const ACTIVE_RING = [18, 21] as const
const SELECT_RING = [24, 27] as const

const FLAT: [number, number, number] = [-Math.PI / 2, 0, 0]

/** How far a hull lays over, coming round a ring at full sweep. */
const BANK = 0.42
/** How long it wobbles after it has arrived. */
const SETTLE_MS = 320

/**
 * A jump: charge on the departure arc, cross, arrive. Fractions of the beat.
 *
 * The crossing is a straight line and it is flat. A transfer lane joins two
 * arcs that lie in the same plane — black hole ring 5 and a planet's ring 3 are
 * both the rim of their own well, at the height of the table — so there is
 * nothing to fly over, and the hull used to hop over a 200-unit parabola and
 * pitch up and back down along it for no reason anyone at the table could name.
 * What is left is the part that meant something: a hard shove off the departure
 * arc, a streak of exhaust the length of the lane, a flash at both ends, and a
 * hull that lays into the turn the way it does coming round a ring. The window
 * is tighter than it was, because a straight line reads as fast only if it is.
 */
const JUMP_CHARGE = 0.18
const JUMP_ARRIVE = 0.74
/** How far the hull lays over as it crosses. */
const JUMP_ROLL = 0.34
/** The warp flash left on the arc at each end. */
const FLASH_SIZE = 34

/** A hull that has just appeared — a respawn, a deployment — materialises. */
const BORN_MS = 340

/** Nozzle glow at rest, and how much more of it the engines make under way. */
const IDLE_GLOW = 2.4
const THRUST_GLOW = 5.5

type MoveKind = NonNullable<ShipToken['motion']>['kind']

/**
 * How hard each kind of move runs the engines. A coast is the ring carrying
 * the ship round and nothing else, so its engines stay dark; a burn and a jump
 * are thrust; a recoil is the ship being shoved by its own gun, which lights
 * the attitude jets and no more.
 */
const THRUST: Record<MoveKind, number> = {
  coast: 0,
  burn: 1,
  jump: 1,
  recoil: 0.12,
}

/** Ease with no corner at either end — the shape of a jump, not of a slide. */
function smoother(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

/** The pieces of a hull this component drives per frame, by reference. */
interface HullParts {
  nozzle: MeshStandardMaterial | null
  plume: Mesh | null
  shell: Mesh | null
  exhaustX?: number
}

function Hull({
  color,
  isMe,
  partsRef,
  visual,
}: {
  color: string
  isMe: boolean
  visual?: ShipVisual
  partsRef: { current: HullParts }
}) {
  // JSON captures only the filtered visual spec, not positions or per-frame motion.
  const key = JSON.stringify({ visual, color })
  const model = useMemo(() => {
    const { visual: spec, color: accent } = JSON.parse(key) as {
      visual?: ShipVisual
      color: string
    }
    return createShip(boardConfig(spec, accent), false, {
      detail: 'board',
      slots:
        spec?.slots ??
        (Object.fromEntries(
          MOUNTS.map(m => [m.id, { type: null, unknown: true, broken: false }])
        ) as NonNullable<ShipVisual>['slots']),
    })
  }, [key])
  useEffect(() => () => model.dispose(), [model])
  useLayoutEffect(() => {
    const current = partsRef.current
    current.nozzle = model.engineGlow
    current.exhaustX = Math.min(...model.nozzles.map(n => n.x)) * 4
    return () => {
      current.nozzle = null
    }
  }, [model, partsRef])
  return (
    <group position={[0, HOVER, 0]}>
      <primitive object={model.root} scale={4} dispose={null} />
      <mesh
        ref={node => {
          partsRef.current.plume = node
        }}
        rotation={[0, 0, Math.PI / 2]}
        visible={false}
        raycast={NO_RAYCAST}
      >
        <coneGeometry args={[0.5, 1, 8, 1, true]} />
        <meshBasicMaterial
          color="#98e8ff"
          transparent
          opacity={0}
          blending={AdditiveBlending}
          side={DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh
        ref={node => {
          partsRef.current.shell = node
        }}
        visible={false}
        raycast={NO_RAYCAST}
      >
        <boxGeometry args={[LENGTH * 1.04, HEIGHT * 1.15, WIDTH * 0.8]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          blending={AdditiveBlending}
          side={DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {isMe && (
        <mesh position={[0, HEIGHT * 0.65, 0]}>
          <sphereGeometry args={[HEIGHT * 0.16, 10, 8]} />
          <meshBasicMaterial color={TABLE.ink} toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}

/** The warp flash a jump leaves on the arc it left and the one it arrives on. */
function JumpFlash({ color, nodeRef }: { color: string; nodeRef: { current: Group | null } }) {
  return (
    <group ref={nodeRef} visible={false}>
      <mesh rotation={FLAT} raycast={NO_RAYCAST} renderOrder={6}>
        <ringGeometry args={[0.55, 1, 40]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0}
          blending={AdditiveBlending}
          side={DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0.3, 0]} raycast={NO_RAYCAST} renderOrder={6}>
        <sphereGeometry args={[0.36, 14, 10]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

/** Place, size and light a flash from its phase through its own window. */
function setFlash(node: Group | null, at: Vector3, phase: number) {
  if (!node) return
  if (phase <= 0 || phase >= 1) {
    node.visible = false
    return
  }
  const intensity = phase < 0.22 ? phase / 0.22 : (1 - phase) / 0.78
  node.visible = true
  node.position.copy(at)
  node.scale.setScalar(FLASH_SIZE * (0.3 + 1.05 * phase))
  for (let i = 0; i < node.children.length; i++) {
    const material = (node.children[i] as Mesh).material as MeshBasicMaterial
    material.opacity = Math.max(0, intensity) * (i === 0 ? 0.95 : 0.85)
  }
}

function SurfaceRing({
  radii,
  color,
  dashes,
  pulse,
  opacity,
}: {
  radii: readonly [number, number]
  color: string
  dashes: number
  pulse: number
  opacity: number
}) {
  const uniforms = useMemo(
    () => ({
      uColor: { value: new Color(color) },
      uTime: sceneTime,
      uDashes: { value: dashes },
      uDuty: { value: 0.6 },
      uPulse: { value: pulse },
      uOpacity: { value: opacity },
    }),
    [color, dashes, pulse, opacity]
  )
  return (
    <mesh rotation={FLAT}>
      <ringGeometry args={[radii[0], radii[1], 64]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={DASHED_RING_VERTEX}
        fragmentShader={DASHED_RING_FRAGMENT}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}

function ShipMesh({
  ship,
  selectable,
  onPick,
  wasDrag,
}: {
  ship: ShipToken
  selectable: boolean
  onPick?: (playerId: string) => void
  wasDrag: () => boolean
}) {
  const group = useRef<Group>(null)
  const yaw = useRef<Group>(null)
  const bank = useRef<Group>(null)
  const departure = useRef<Group>(null)
  const arrival = useRef<Group>(null)
  const parts = useRef<HullParts>({ nozzle: null, plume: null, shell: null })
  const settle = useRef({ moving: false, at: 0, powered: false })
  // A token only mounts when its ship arrives on the board: the first frames
  // of its life are the hull coming into being over its Home.
  const born = useRef(0)
  const [hovered, setHovered] = useState(false)
  const scratch = useMemo(() => new Vector3(), [])

  /**
   * Where the hull stands at rest: its sector, moved out along the radius by
   * its share of the crowd standing in that sector. `crowdOffset` is the flat
   * board's too, so two hulls part by the same amount on either board.
   */
  const resting = useMemo(
    () =>
      toWorld(
        radialPoint(ship.position, crowdOffset(ship.crowd)),
        elevationAt(ship.position) + LAYER.token
      ),
    [ship.position, ship.crowd]
  )
  /**
   * That nudge on its own, so a slide can ease into its slot over the beat it
   * is already sliding for rather than start the turn standing in it. It is
   * horizontal: a crowd never changes which terrace a hull is on.
   */
  const slot = useMemo(
    () => new Vector3().subVectors(resting, positionWorld(ship.position, LAYER.token)),
    [resting, ship.position]
  )
  const restingYaw = useMemo(
    () => facingYaw(ship.position, ship.facing),
    [ship.position, ship.facing]
  )

  /**
   * Everything about the move that does not change while it plays: what kind
   * of move it is, which way it crosses, and how hard the hull lays over — a
   * one-sector nudge is not a four-sector sweep. The inboard wing is the one
   * that drops, which is the other wing when the ship is flying backwards.
   *
   * A jump is the one move that leaves the well it started in, so the kind and
   * the well comparison always agree; the kind is what is read.
   */
  const move = useMemo(() => {
    const motion = ship.motion
    if (!motion) return null
    const jump = motion.kind === 'jump'
    const from = positionPoint(motion.from)
    const to = positionPoint(ship.position)
    const swept =
      (((ship.position.sector - motion.from.sector) % SECTORS_PER_RING) + SECTORS_PER_RING) %
      SECTORS_PER_RING
    return {
      jump,
      thrust: THRUST[motion.kind],
      heading: Math.atan2(to.y - from.y, to.x - from.x),
      departure: positionWorld(motion.from, LAYER.token),
      // The arriving flash goes off around the hull, which may be standing off
      // the centre of its sector; the departing one stays on the arc it left.
      arrival: resting,
      bank:
        Math.min(1, 0.3 + swept * 0.22) * (ship.facing === 'prograde' ? 1 : -1) * (jump ? 0 : 1),
    }
  }, [ship.motion, ship.position, ship.facing, resting])

  useFrame(() => {
    const node = group.current
    const heading = yaw.current
    const roll = bank.current
    if (!node || !heading || !roll) return

    const now = performance.now()
    if (born.current === 0) born.current = now
    const motion = ship.motion
    const raw = motion ? MathUtils.clamp((now - motion.start) / motion.duration, 0, 1) : 1
    const moving = !!motion && !!move && raw < 1

    let lean = 0
    let thrust = 0
    let streak = 0

    if (moving && motion && move) {
      if (move.jump) {
        // Straight down the lane, in the plane both arcs lie in: the two ends
        // are the rims of their own wells and are the same height, so the track
        // is a line and nothing lifts it off the table. Facing follows the
        // crossing, not the ring.
        const crossing = smoother(
          MathUtils.clamp((raw - JUMP_CHARGE) / (JUMP_ARRIVE - JUMP_CHARGE), 0, 1)
        )
        interpolateWorld(motion.from, ship.position, crossing, LAYER.token, scratch)
        node.position.copy(scratch).addScaledVector(slot, crossing)
        heading.rotation.y = yawFromHeading(move.heading)
        const speed = Math.sin(Math.PI * crossing) ** 0.6
        lean = JUMP_ROLL * Math.sin(Math.PI * crossing)
        thrust = (raw < JUMP_CHARGE ? raw / JUMP_CHARGE : Math.max(0.4, speed)) * move.thrust
        streak = speed
      } else {
        // The same ease-in-out-quad the SVG board slides tokens with.
        const t = raw < 0.5 ? 2 * raw * raw : 1 - (-2 * raw + 2) ** 2 / 2
        interpolateWorld(motion.from, ship.position, t, LAYER.token, scratch)
        node.position.copy(scratch).addScaledVector(slot, t)
        heading.rotation.y = yawFromHeading(
          headingAtPoint(ship.position.wellId, { x: scratch.x, y: scratch.z }, ship.facing)
        )
        lean = BANK * move.bank * Math.sin(Math.PI * raw)
        thrust = Math.sin(Math.PI * raw) ** 0.5 * move.thrust
      }
    } else {
      node.position.copy(resting)
      heading.rotation.y = restingYaw
    }

    // Arriving is a moment of its own: the hull rocks level and the engines
    // fall back to idle over a few tenths of a second.
    if (moving !== settle.current.moving) {
      settle.current.at = moving ? 0 : now
      settle.current.moving = moving
      if (moving) settle.current.powered = (move?.thrust ?? 0) > 0.5
    }
    if (settle.current.at > 0) {
      const u = (now - settle.current.at) / SETTLE_MS
      if (u >= 1) settle.current.at = 0
      else {
        const damping = Math.exp(-5 * u)
        lean += damping * Math.sin(u * 16) * 0.14
        node.position.y += damping * Math.sin(u * 13) * 2.6
        if (settle.current.powered) thrust = Math.max(thrust, damping * 0.3)
      }
    }

    // A mark that names this ship is something that just happened to it: the
    // hull shudders and lights up in that mark's colour. The sector it is
    // anchored to is not consulted — two hulls can share one, and a shot can
    // shove its target out of the sector its own numbers hang over.
    const impact = sampleImpact(ship.playerId, now)
    if (impact.shake > 0.001) {
      const shiver = Math.sin(now * 0.09) * impact.shake
      roll.position.set(0, shiver * 1.8, Math.cos(now * 0.071) * impact.shake * 1.8)
      lean += shiver * 0.07
    } else if (roll.position.lengthSq() > 0) {
      roll.position.set(0, 0, 0)
    }
    // Roll only: nothing on this board ever pitches, because nothing on it ever
    // changes height.
    roll.rotation.set(lean, 0, 0)

    const age = now - born.current
    if (age < BORN_MS) roll.scale.setScalar(0.2 + 0.8 * smoother(age / BORN_MS))
    else if (roll.scale.x !== 1) roll.scale.setScalar(1)

    const nozzle = parts.current.nozzle
    if (nozzle)
      nozzle.emissiveIntensity = ship.visual?.driveBroken ? 0 : IDLE_GLOW + THRUST_GLOW * thrust
    const plume = parts.current.plume
    if (plume) {
      plume.visible = thrust > 0.02 && !ship.visual?.driveBroken
      if (plume.visible) {
        const length = LENGTH * (0.3 + 0.7 * thrust + 5.5 * streak)
        const width = WIDTH * 0.4 * (0.7 + 0.5 * thrust)
        plume.scale.set(width, length, width)
        plume.position.x = (parts.current.exhaustX ?? -LENGTH * 0.49) - length * 0.5
        const material = plume.material as MeshBasicMaterial
        material.opacity = 0.14 + 0.45 * thrust
      }
    }
    const shell = parts.current.shell
    if (shell) {
      shell.visible = impact.flash > 0.01
      if (shell.visible) {
        const material = shell.material as MeshBasicMaterial
        material.color.set(impact.color)
        // A tint, not a white-out: the shell is additive over a hull that is
        // already lit, and the player's colour has to survive being hit.
        material.opacity = Math.min(0.34, impact.flash * 0.3)
      }
    }

    if (moving && move?.jump) {
      // One flash burns down as the hull leaves, the other lights as it lands.
      setFlash(departure.current, move.departure, raw / (JUMP_CHARGE + 0.22))
      setFlash(arrival.current, move.arrival, (raw - (JUMP_ARRIVE - 0.1)) / 0.34)
    } else {
      if (departure.current) departure.current.visible = false
      if (arrival.current) arrival.current.visible = false
    }
  })

  const pick = useCallback(
    (event: { stopPropagation: () => void }) => {
      if (!selectable || !onPick) return
      // A press that travelled is a camera drag; it must not also fire a click.
      if (wasDrag()) return
      event.stopPropagation()
      onPick(ship.playerId)
    },
    [selectable, onPick, wasDrag, ship.playerId]
  )

  return (
    <>
      <group ref={group} position={resting}>
        {ship.isActive && (
          <SurfaceRing radii={ACTIVE_RING} color={ship.color} dashes={1} pulse={0} opacity={0.8} />
        )}
        {selectable && (
          <SurfaceRing
            radii={SELECT_RING}
            color={TABLE.accent}
            dashes={12}
            pulse={1}
            opacity={0.95}
          />
        )}
        <group
          ref={yaw}
          rotation={[0, restingYaw, 0]}
          onClick={pick}
          onPointerOver={event => {
            event.stopPropagation()
            setHovered(true)
            if (selectable && onPick) document.body.style.cursor = 'pointer'
          }}
          onPointerOut={() => {
            setHovered(false)
            document.body.style.cursor = ''
          }}
        >
          <group ref={bank}>
            <Hull color={ship.color} isMe={ship.isMe} partsRef={parts} visual={ship.visual} />
          </group>
        </group>

        {hovered && (
          <BoardTooltip position={[0, HOVER + HEIGHT + 26, 0]}>
            {`${ship.name} — hull ${ship.hitPoints}/${ship.maxHitPoints}, heat ${ship.heat}, facing ${ship.facing}`}
          </BoardTooltip>
        )}
      </group>

      {/* The two ends of a jump stay where they are while the hull crosses. */}
      <JumpFlash color={ship.color} nodeRef={departure} />
      <JumpFlash color={TABLE.accent} nodeRef={arrival} />
    </>
  )
}

export function Ships({
  ships,
  selectableIds = [],
  onPickTarget,
}: {
  ships: readonly ShipToken[]
  selectableIds?: readonly string[]
  onPickTarget?: ((playerId: string) => void) | null
}) {
  countRender('Ships')
  const wasDrag = usePointerDrag()
  return (
    <>
      {ships.map(ship => (
        <ShipMesh
          key={ship.playerId}
          ship={ship}
          selectable={selectableIds.includes(ship.playerId)}
          onPick={onPickTarget ?? undefined}
          wasDrag={wasDrag}
        />
      ))}
    </>
  )
}
