/**
 * The ink every plan on the board is drawn with.
 *
 * A dashed track, a dot at the end of it, a ring around a destination, a field
 * of wedges you can click: the planning overlays and the missile tracks draw
 * the same five marks and they must read the same, so they are made once here.
 * Dashes drift, wedges breathe and hover lights move in `useFrame` against the
 * shared scene clock — React hears about a hover and nothing else.
 *
 * Nothing here knows what a mark means. The overlays decide that.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from 'react'
import type { LineBasicMaterial, MeshBasicMaterial, Vector3 } from 'three'
import { Html, Line } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import type { Position } from '@dangerous-inclinations/engine'
import { FONT_MONO, TABLE } from '../../../../../theme'
import { sceneTime } from '../../clock'
import { usePointerDrag } from '../../usePointerDrag'
import { LAYER, positionWorld } from '../../world'
import { NO_RAYCAST } from './paths'
import { wedgeFieldGeometry, wedgeGeometry, wedgeOutlineGeometry } from './wedges'

/** Flat on the surface, the way every printed mark on this board lies. */
const FLAT: [number, number, number] = [-Math.PI / 2, 0, 0]

/** The SVG board breathes a deployment wedge over 2.6 s; so does this one. */
const BREATH_SECONDS = 2.6
/** A lit wedge sits a hair above its field so it is never half-swallowed by it. */
const LIT_LIFT = 0.8
/** How far over the surface a wedge's tooltip floats, so it never covers it. */
const TOOLTIP_HEIGHT = 46

const TAU = Math.PI * 2

/**
 * Drei's own layout div, which would otherwise sit in front of the board.
 * `max-content` breaks its shrink-to-fit, which would otherwise squeeze a long
 * reminder into a column two words wide.
 */
const PASS_THROUGH: React.CSSProperties = { pointerEvents: 'none', width: 'max-content' }

/** A missile's reminder is a sentence, not a label, so the plate wraps. */
const TOOLTIP_STYLE: React.CSSProperties = {
  pointerEvents: 'none',
  width: 'max-content',
  maxWidth: 320,
  lineHeight: 1.45,
  background: TABLE.felt,
  color: TABLE.ink,
  border: `1px solid ${TABLE.plateEdge}`,
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: '0.8rem',
  fontFamily: FONT_MONO,
  transform: 'translateY(-20px)',
}

/**
 * The same plate the ships show on hover, so one table has one tooltip.
 *
 * The `style` is not decoration: drei lays the label out in a real div over the
 * canvas, and a tooltip standing between the pointer and the sector it names
 * swallows the click that would have picked it. Only `style` reaches that div —
 * `Html`'s own `pointerEvents` prop is read in transform mode alone — so the
 * rule goes there.
 */
export function BoardTooltip({
  position,
  children,
}: {
  position: Vector3 | [number, number, number]
  children: ReactNode
}) {
  return (
    <Html position={position} center zIndexRange={[20, 0]} style={PASS_THROUGH}>
      <div style={TOOLTIP_STYLE}>{children}</div>
    </Html>
  )
}

/**
 * The dark edge carried under a track and under the marks at its ends.
 *
 * A coloured line over a lit ring, an amber wedge or the rim of the accretion
 * disc is the same brightness as what it crosses, and reads as part of it. A
 * slightly wider run of the table's own felt underneath separates the two. The
 * line's width is in pixels, so the edge is too: it is ink, not board, and it
 * must not change when the board is rescaled.
 */
const EDGE_WIDTH = 2.4
const EDGE_OPACITY = 0.8
/** The same edge around a dot or a ring, as a share of the mark's own size. */
const EDGE_SHARE = 0.5

/**
 * Tracks are drawn after the wedge fields (`renderOrder` 0–3 in `WedgeField`),
 * so a planned path always reads over a shaded range rather than under it.
 */
const TRACK_ORDER = 4

/**
 * A line laid on the board. `dash` and `gap` are board units, as the SVG
 * board's dash arrays are; `speed` drifts the pattern along the line, which is
 * how a planned path reads as a direction rather than as a fence. `edge` lays
 * the same line in felt underneath, a little wider, which is what lets it read
 * over a ring or a wedge.
 */
export function SurfaceLine({
  points,
  color,
  width = 2,
  opacity = 1,
  dash,
  gap,
  speed = 0,
  renderOrder = TRACK_ORDER,
  edge = true,
}: {
  points: readonly Vector3[]
  color: string
  width?: number
  opacity?: number
  dash?: number
  gap?: number
  speed?: number
  renderOrder?: number
  edge?: boolean
}) {
  const line = useRef<ComponentRef<typeof Line>>(null)
  const under = useRef<ComponentRef<typeof Line>>(null)

  useFrame(() => {
    if (speed === 0) return
    const offset = -sceneTime.value * speed
    const material = line.current?.material
    if (material) material.dashOffset = offset
    const edgeMaterial = under.current?.material
    if (edgeMaterial) edgeMaterial.dashOffset = offset
  })

  if (points.length < 2) return null

  const shared = {
    points: points as Vector3[],
    transparent: true,
    dashed: dash !== undefined,
    dashSize: dash ?? 1,
    gapSize: gap ?? 1,
    depthWrite: false,
    toneMapped: false,
    raycast: NO_RAYCAST,
  }

  return (
    <>
      {edge && (
        <Line
          ref={under}
          {...shared}
          color={TABLE.felt}
          lineWidth={width + EDGE_WIDTH}
          opacity={EDGE_OPACITY}
          renderOrder={renderOrder}
        />
      )}
      <Line
        ref={line}
        {...shared}
        color={color}
        lineWidth={width}
        opacity={opacity}
        renderOrder={renderOrder + 1}
      />
    </>
  )
}

/** A filled dot lying on the surface — the end of a track, an impact point. */
export function SurfaceDot({
  position,
  color,
  radius,
  opacity = 1,
  edge = true,
}: {
  position: Vector3
  color: string
  radius: number
  opacity?: number
  edge?: boolean
}) {
  return (
    <group position={position} rotation={FLAT}>
      {edge && (
        <mesh raycast={NO_RAYCAST} renderOrder={TRACK_ORDER}>
          <circleGeometry args={[radius * (1 + EDGE_SHARE), 20]} />
          <meshBasicMaterial
            color={TABLE.felt}
            transparent
            opacity={EDGE_OPACITY}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
      <mesh raycast={NO_RAYCAST} renderOrder={TRACK_ORDER + 1}>
        <circleGeometry args={[radius, 20]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

/**
 * An open ring lying on the surface: where a move ends, or where a launch you
 * have not sent yet would leave the rail. `corners` makes it a diamond.
 */
export function SurfaceRing({
  position,
  color,
  radius,
  thickness,
  opacity = 1,
  corners = 24,
  edge = true,
}: {
  position: Vector3
  color: string
  radius: number
  thickness: number
  opacity?: number
  corners?: number
  edge?: boolean
}) {
  const bleed = thickness * EDGE_SHARE
  return (
    <group position={position} rotation={FLAT}>
      {edge && (
        <mesh raycast={NO_RAYCAST} renderOrder={TRACK_ORDER}>
          <ringGeometry args={[radius - bleed, radius + thickness + bleed, corners]} />
          <meshBasicMaterial
            color={TABLE.felt}
            transparent
            opacity={EDGE_OPACITY}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
      <mesh raycast={NO_RAYCAST} renderOrder={TRACK_ORDER + 1}>
        <ringGeometry args={[radius, radius + thickness, corners]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

export interface WedgeFieldProps {
  cells: readonly Position[]
  /** Half-width of the band each wedge covers. */
  band: number
  color: string
  /** Fill alpha at rest — the SVG board's `fill-opacity`. */
  fillOpacity: number
  /** Edge alpha at rest; zero draws no edge. */
  edgeOpacity?: number
  /**
   * When given, both alphas are multiplied by a breath running between these
   * two over 2.6 s — the SVG board animates the whole element's opacity, and a
   * sector you are being asked to click has to be asking. */
  breathe?: readonly [number, number]
  /** The wedge under the pointer, drawn at full strength. */
  litColor?: string
  litFillOpacity?: number
  cursor?: string
  /** Tooltip for the sector under the pointer; without it the field is silent. */
  label?: (cell: Position) => string
  onPick?: (cell: Position) => void
}

/**
 * A field of sector wedges in one mesh, hover-lit and clickable.
 *
 * The whole field is one buffer and one material, and the cell under the
 * pointer is read back from the triangle the raycast hit, so a pointer moving
 * across three hundred sectors costs one hover state and one small geometry.
 * A press that travelled is a camera drag and fires nothing, exactly as on the
 * flat board.
 */
export function WedgeField({
  cells,
  band,
  color,
  fillOpacity,
  edgeOpacity = 0,
  breathe,
  litColor,
  litFillOpacity = 0,
  cursor = 'pointer',
  label,
  onPick,
}: WedgeFieldProps) {
  const wasDrag = usePointerDrag()
  const [hovered, setHovered] = useState<number | null>(null)
  const fill = useRef<MeshBasicMaterial>(null)
  const edge = useRef<LineBasicMaterial>(null)

  const field = useMemo(() => wedgeFieldGeometry(cells, band), [cells, band])
  useEffect(() => () => field.geometry.dispose(), [field])

  const edges = useMemo(
    () => (edgeOpacity > 0 ? wedgeOutlineGeometry(cells, band) : null),
    [edgeOpacity, cells, band]
  )
  useEffect(() => () => edges?.dispose(), [edges])

  const litCell = hovered === null ? null : (cells[hovered] ?? null)
  const lit = useMemo(
    () => (litCell ? wedgeGeometry(litCell, band, LAYER.wedge + LIT_LIFT) : null),
    [litCell, band]
  )
  useEffect(() => () => lit?.dispose(), [lit])

  const litEdges = useMemo(
    () => (litCell ? wedgeOutlineGeometry([litCell], band, LAYER.wedge + LIT_LIFT) : null),
    [litCell, band]
  )
  useEffect(() => () => litEdges?.dispose(), [litEdges])

  useFrame(() => {
    if (!breathe) return
    const [low, high] = breathe
    const breath =
      low + (high - low) * (0.5 - 0.5 * Math.cos((sceneTime.value * TAU) / BREATH_SECONDS))
    if (fill.current) fill.current.opacity = fillOpacity * breath
    if (edge.current) edge.current.opacity = edgeOpacity * breath
  })

  const cellAt = useCallback(
    (faceIndex: number | null | undefined): number | null => {
      if (faceIndex == null || field.trianglesPerCell === 0) return null
      const index = Math.floor(faceIndex / field.trianglesPerCell)
      return index >= 0 && index < cells.length ? index : null
    },
    [field, cells]
  )

  const over = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation()
      const index = cellAt(event.faceIndex)
      setHovered(current => (current === index ? current : index))
      document.body.style.cursor = cursor
    },
    [cellAt, cursor]
  )

  const out = useCallback(() => {
    setHovered(null)
    document.body.style.cursor = ''
  }, [])

  // A field can go away under the pointer (a turn submitted, a plan cleared);
  // the cursor it set must not outlive it.
  useEffect(() => () => void (document.body.style.cursor = ''), [])

  const click = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      if (!onPick) return
      // A press that travelled is a camera drag; it must not also fire a click.
      if (wasDrag()) return
      const index = cellAt(event.faceIndex)
      if (index === null) return
      event.stopPropagation()
      onPick(cells[index])
    },
    [onPick, wasDrag, cellAt, cells]
  )

  if (cells.length === 0) return null

  // A field nobody can click or question is ink: it must not take the pointer.
  const pointer =
    onPick || label
      ? { onPointerMove: over, onPointerOut: out, onClick: click }
      : { raycast: NO_RAYCAST }

  return (
    <group>
      <mesh geometry={field.geometry} {...pointer} renderOrder={0}>
        <meshBasicMaterial
          ref={fill}
          color={color}
          transparent
          opacity={fillOpacity}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {edges && (
        <lineSegments geometry={edges} raycast={NO_RAYCAST} renderOrder={1}>
          <lineBasicMaterial
            ref={edge}
            color={color}
            transparent
            opacity={edgeOpacity}
            depthWrite={false}
            toneMapped={false}
          />
        </lineSegments>
      )}

      {lit && litColor && (
        <mesh geometry={lit} raycast={NO_RAYCAST} renderOrder={2}>
          <meshBasicMaterial
            color={litColor}
            transparent
            opacity={litFillOpacity}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}

      {litEdges && litColor && (
        <lineSegments geometry={litEdges} raycast={NO_RAYCAST} renderOrder={3}>
          <lineBasicMaterial color={litColor} depthWrite={false} toneMapped={false} />
        </lineSegments>
      )}

      {litCell && label && (
        <BoardTooltip position={positionWorld(litCell, LAYER.token + TOOLTIP_HEIGHT)}>
          {label(litCell)}
        </BoardTooltip>
      )}
    </group>
  )
}
