/**
 * The 2D board: the printed table, drawn as SVG.
 *
 * Everything it draws arrives in one `BoardModel` (positions, previews,
 * ranges, the callbacks a click may fire) so this file knows no rule and no
 * context. What is left here is renderer business: the pan and zoom of the
 * map (a wheel, a drag, a pinch), the seven layers in the order they stack,
 * and the buttons in the corner.
 *
 * The only time this file keeps is the board clock: a rAF loop that runs
 * while an effect (a beam, a burst, a sliding token) is alive, and stops the
 * moment the table is still again.
 */
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { Box, IconButton, Tooltip } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong'
import FitScreenIcon from '@mui/icons-material/FitScreen'
import type { MovementPlan, Position } from '@dangerous-inclinations/engine'
import { TABLE } from '../../../design/tokens'
import { BOARD_TEXT } from '../../../text/board'
import type { BoardModel } from '../model'
import { useBoardClock } from '../useBoardClock'
import {
  BOARD_BOUNDS,
  BOARD_VIEWBOX,
  HOME_VIEW_RADIUS,
  positionPoint,
  type Point,
} from '../geometry'
import { trackPoints } from '../trajectory'
import { WellsLayer } from './layers/WellsLayer'
import { LanesLayer } from './layers/LanesLayer'
import { MarkersLayer } from './layers/MarkersLayer'
import { ShipsLayer } from './layers/ShipsLayer'
import { WrecksLayer } from './layers/WrecksLayer'
import { MissilesLayer } from './layers/MissilesLayer'
import {
  DeploymentSectors,
  PlannedPath,
  RangeOverlay,
  RouteOverlay,
  SectorPicker,
} from './layers/OverlaysLayer'
import { EffectsLayer } from './layers/EffectsLayer'

const MIN_ZOOM = 0.55
const MAX_ZOOM = 3.5
/** Pointer travel (px) before a press counts as a pan rather than a click. */
const DRAG_THRESHOLD = 4
/** The same for a finger, which wanders further on a tap than a mouse does. */
const TOUCH_DRAG_THRESHOLD = 10
/** Board units of margin round a framed route, so its ends are not on the edge. */
const FIT_MARGIN = 70

/**
 * Where the board opens, and it is not on the whole board.
 *
 * The viewBox is cut to the artwork, so at zoom 1 the four wells share the pane
 * between them and each gets a fifth of its height, which is how a black hole
 * with 24 numbers printed round its innermost ring ends up illegible on a
 * 1440-pixel screen. The game is played in the black hole's well, so that is
 * what the board opens on (`HOME_VIEW_RADIUS`), with the planets falling off
 * the edges until you pan to them. Zoom 1 and no pan is still the whole board,
 * and it is one click of the zoom-out button away.
 *
 * The zoom is solved from the viewBox rather than picked, so it frames the same
 * number of board units whatever shape the pane is and whatever the board is
 * next redrawn at. The pan puts the black hole in the middle of the pane: the
 * artwork is not centred on it, because Alpha sits straight above.
 */
const HOME_ZOOM = BOARD_BOUNDS.height / (2 * HOME_VIEW_RADIUS)
const HOME_PAN = {
  x: BOARD_BOUNDS.x + BOARD_BOUNDS.width / 2,
  y: BOARD_BOUNDS.y + BOARD_BOUNDS.height / 2,
}

/** The centre of the viewBox, which is the centre of the pane at any shape. */
const VIEW_CENTRE = HOME_PAN

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

/** Every point a route draws through, and the ship at its start. */
function routePoints(route: MovementPlan): Point[] {
  return [
    positionPoint(route.origin),
    ...route.steps.flatMap(step =>
      trackPoints([step.from, step.to], step.actionType === 'well_transfer' ? 'chord' : 'arc')
    ),
    positionPoint(route.destination),
  ]
}

/** The route's shape as a string, so the board frames it once per new route. */
const routeKey = (route: MovementPlan | null) =>
  route
    ? [route.origin, ...route.steps.map(step => step.to)]
        .map(p => `${p.wellId}:${p.ring}:${p.sector}`)
        .join('|')
    : ''

/**
 * `fitRoute` is the route planner tool's: the board opens framed on the
 * model's route (the ship, every leg, the arrival), frames each new route as
 * it comes, and carries a button that frames it again. The game's board does
 * not pass it and opens on the black hole.
 */
export function GameBoardSvg({
  model,
  fitRoute = false,
}: {
  model: BoardModel
  fitRoute?: boolean
}) {
  const [zoom, setZoom] = useState(HOME_ZOOM)
  const [pan, setPan] = useState(HOME_PAN)
  /** The view as last set, for the handlers that run between renders. */
  const viewRef = useRef({ zoom, pan })
  useLayoutEffect(() => {
    viewRef.current = { zoom, pan }
  }, [zoom, pan])
  const setView = useCallback((next: { zoom: number; pan: Point }) => {
    viewRef.current = next
    setZoom(next.zoom)
    setPan(next.pan)
  }, [])
  const [hoveredDeployment, setHoveredDeployment] = useState<Position | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<{
    x: number
    y: number
    panX: number
    panY: number
    moved: boolean
  } | null>(null)
  /** The pointers pressed on the board now: one pans, two pinch. */
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  /** A pinch: its fingers' first spread, the zoom then, and the board point between them. */
  const pinchRef = useRef<{ spread: number; zoom: number; board: Point } | null>(null)
  /** Set when a press turned into a pan, so the release does not also click. */
  const pannedRef = useRef(false)

  // A sliding token keeps a 'tween' effect alive, so this covers moves too.
  const now = useBoardClock(model.effects.length > 0)

  const deploying = model.deployment !== null

  // --- pan / zoom ----------------------------------------------------------

  const onWheel = useCallback((event: ReactWheelEvent<SVGSVGElement>) => {
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12
    setZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor)))
  }, [])

  /** Board units per screen pixel, so a drag moves the map under the cursor. */
  const unitsPerPixel = useCallback(() => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return 1
    return Math.max(BOARD_BOUNDS.width / rect.width, BOARD_BOUNDS.height / rect.height)
  }, [])

  /**
   * The recentre button: back to the view the board opened in.
   *
   * It used to go to the whole board, which is zoom 1 and no pan. That is one
   * click of the zoom-out button away and it is not what the word means: the 3D
   * board's Recentre restores its opening view, the two buttons look the same
   * and carry the same label, so they do the same thing.
   */
  const resetView = useCallback(() => {
    setZoom(HOME_ZOOM)
    setPan(HOME_PAN)
  }, [])

  /** A screen point in viewBox units, where `pan` and the drawn board live. */
  const toView = useCallback((x: number, y: number): Point | null => {
    const ctm = svgRef.current?.getScreenCTM()
    if (!ctm) return null
    const p = new DOMPoint(x, y).matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }, [])

  /** The two fingers of a pinch: their spread in pixels and the screen point between them. */
  const fingers = () => {
    const [a, b] = [...pointersRef.current.values()]
    return { spread: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }

  const startPinch = () => {
    const { spread, x, y } = fingers()
    const mid = toView(x, y)
    if (!mid || spread === 0) return
    const { zoom: z, pan: p } = viewRef.current
    pinchRef.current = { spread, zoom: z, board: { x: (mid.x - p.x) / z, y: (mid.y - p.y) / z } }
  }

  /** The board point that was between the fingers stays between them, at the new zoom. */
  const movePinch = () => {
    const pinch = pinchRef.current
    if (!pinch) return
    const { spread, x, y } = fingers()
    const mid = toView(x, y)
    if (!mid) return
    const z = clampZoom((pinch.zoom * spread) / pinch.spread)
    setView({ zoom: z, pan: { x: mid.x - z * pinch.board.x, y: mid.y - z * pinch.board.y } })
  }

  /** A pointer lifted or lost: a pinch down to one finger carries on as a pan. */
  const release = (event: ReactPointerEvent) => {
    const pointers = pointersRef.current
    pointers.delete(event.pointerId)
    if (pointers.size < 2) pinchRef.current = null
    if (pointers.size === 1 && dragRef.current === null) {
      const [rest] = [...pointers.values()]
      const { pan: p } = viewRef.current
      dragRef.current = { x: rest.x, y: rest.y, panX: p.x, panY: p.y, moved: true }
    } else if (pointers.size === 2) startPinch()
    if (pointers.size === 0) dragRef.current = null
  }

  /** Frame the route: the zoom and pan that fit its points in the pane, with a margin. */
  const fitToRoute = useCallback(() => {
    const route = model.route
    const rect = svgRef.current?.getBoundingClientRect()
    if (!route || !rect || rect.width === 0 || rect.height === 0) return
    const points = routePoints(route)
    const xs = points.map(p => p.x)
    const ys = points.map(p => p.y)
    const [minX, maxX, minY, maxY] = [
      Math.min(...xs),
      Math.max(...xs),
      Math.min(...ys),
      Math.max(...ys),
    ]
    const scale = unitsPerPixel()
    const z = clampZoom(
      Math.min(
        (rect.width * scale) / (maxX - minX + 2 * FIT_MARGIN),
        (rect.height * scale) / (maxY - minY + 2 * FIT_MARGIN)
      )
    )
    const centre = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
    setView({ zoom: z, pan: { x: VIEW_CENTRE.x - z * centre.x, y: VIEW_CENTRE.y - z * centre.y } })
  }, [model.route, unitsPerPixel, setView])

  // A new route is framed as it arrives; the same route redrawn is left where the player put it.
  const framed = fitRoute ? routeKey(model.route) : ''
  useLayoutEffect(() => {
    if (framed) fitToRoute()
    // Only a new route frames the board, not a new `fitToRoute`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framed])

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <Box
        component="svg"
        ref={svgRef}
        viewBox={BOARD_VIEWBOX}
        onWheel={onWheel}
        /*
         * Panning never captures the pointer: a captured pointer retargets the
         * click to the <svg> itself, which is what stopped sector wedges (and
         * ship tokens) from ever receiving one. Instead a press only becomes a
         * pan once it has travelled far enough, and a pan swallows the click
         * that would otherwise follow it.
         */
        onPointerDown={e => {
          if (e.pointerType === 'mouse' && e.button !== 0) return
          const pointers = pointersRef.current
          pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
          if (pointers.size === 1) {
            pannedRef.current = false
            dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y, moved: false }
          } else if (pointers.size === 2) {
            // A second finger: the press is a pinch now, and never a tap.
            pannedRef.current = true
            dragRef.current = null
            startPinch()
          }
        }}
        onPointerMove={e => {
          const pointers = pointersRef.current
          if (!pointers.has(e.pointerId)) return
          pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
          if (pinchRef.current) return movePinch()
          const drag = dragRef.current
          if (!drag) return
          const dx = e.clientX - drag.x
          const dy = e.clientY - drag.y
          const threshold = e.pointerType === 'mouse' ? DRAG_THRESHOLD : TOUCH_DRAG_THRESHOLD
          if (!drag.moved && Math.hypot(dx, dy) < threshold) return
          drag.moved = true
          pannedRef.current = true
          const scale = unitsPerPixel()
          setPan({ x: drag.panX + dx * scale, y: drag.panY + dy * scale })
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={e => {
          if (e.pointerType === 'mouse') release(e)
        }}
        onClickCapture={e => {
          if (!pannedRef.current) return
          pannedRef.current = false
          e.stopPropagation()
        }}
        sx={{
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: deploying ? 'default' : 'grab',
          touchAction: 'none',
          '&:active': { cursor: deploying ? 'default' : 'grabbing' },
        }}
      >
        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
          <WellsLayer />
          <LanesLayer highlightIds={model.activeLaneIds} />
          <RangeOverlay cells={model.rangeCells} />
          <MarkersLayer stations={model.stations} homes={model.homes} />
          <WrecksLayer wrecks={model.wrecks} now={now} />
          {model.route && <RouteOverlay route={model.route} />}
          {model.plannedPoints.length > 1 && (
            <PlannedPath points={model.plannedPoints} color={model.planColor} />
          )}
          <MissilesLayer missiles={model.missiles} previews={model.missilePreviews} />
          <ShipsLayer
            ships={model.ships}
            now={now}
            onSelect={model.onPickTarget ?? undefined}
            selectableIds={model.selectableIds}
          />
          {model.onPickDestination && <SectorPicker onPick={model.onPickDestination} />}
          {model.deployment && (
            <DeploymentSectors
              positions={model.deployment.positions}
              onPick={model.deployment.onPick}
              hovered={hoveredDeployment}
              onHover={setHoveredDeployment}
            />
          )}
          <EffectsLayer effects={model.effects} pointOf={model.pointOf} now={now} />
        </g>
      </Box>

      <Box
        sx={{
          position: 'absolute',
          right: 8,
          top: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
        }}
      >
        <BoardButton
          title={BOARD_TEXT.controls.zoomIn}
          onClick={() => setZoom(z => Math.min(MAX_ZOOM, z * 1.2))}
        >
          <AddIcon fontSize="small" />
        </BoardButton>
        <BoardButton
          title={BOARD_TEXT.controls.zoomOut}
          onClick={() => setZoom(z => Math.max(MIN_ZOOM, z / 1.2))}
        >
          <RemoveIcon fontSize="small" />
        </BoardButton>
        <BoardButton title={BOARD_TEXT.controls.recentre} onClick={resetView}>
          <CenterFocusStrongIcon fontSize="small" />
        </BoardButton>
        {fitRoute && model.route && (
          <BoardButton title={BOARD_TEXT.controls.fitRoute} onClick={fitToRoute}>
            <FitScreenIcon fontSize="small" />
          </BoardButton>
        )}
      </Box>
    </Box>
  )
}

function BoardButton({
  title,
  onClick,
  children,
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip title={title} placement="left">
      <IconButton
        size="small"
        onClick={onClick}
        aria-label={title}
        sx={{
          // A finger needs the 44px a mouse does not.
          '@media (pointer: coarse)': { width: 44, height: 44 },
          bgcolor: TABLE.plate,
          color: TABLE.inkSoft,
          borderRadius: 0,
          border: `1px solid ${TABLE.plateEdge}`,
          '&:hover': { bgcolor: TABLE.plate, color: TABLE.accent, borderColor: TABLE.accent },
        }}
      >
        {children}
      </IconButton>
    </Tooltip>
  )
}
