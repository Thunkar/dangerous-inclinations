/**
 * The 2D board: the printed table, drawn as SVG.
 *
 * Everything it draws arrives in one `BoardModel` — positions, previews,
 * ranges, the callbacks a click may fire — so this file knows no rule and no
 * context. What is left here is renderer business: the pan and zoom of the
 * map, the seven layers in the order they stack, and the three buttons in the
 * corner.
 *
 * The only time this file keeps is the board clock: a rAF loop that runs
 * while an effect (a beam, a burst, a sliding token) is alive, and stops the
 * moment the table is still again.
 */
import { useCallback, useRef, useState, type WheelEvent as ReactWheelEvent } from 'react'
import { Box, IconButton, Tooltip } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong'
import type { Position } from '@dangerous-inclinations/engine'
import { TABLE } from '../../../theme'
import type { BoardModel } from '../model'
import { useBoardClock } from '../useBoardClock'
import { BOARD_BOUNDS, BOARD_VIEWBOX, HOME_VIEW_RADIUS } from '../geometry'
import { WellsLayer } from './layers/WellsLayer'
import { LanesLayer } from './layers/LanesLayer'
import { MarkersLayer } from './layers/MarkersLayer'
import { ShipsLayer } from './layers/ShipsLayer'
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

/**
 * Where the board opens, and it is not on the whole board.
 *
 * The viewBox is cut to the artwork, so at zoom 1 the four wells share the pane
 * between them and each gets a fifth of its height — which is how a black hole
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

export function GameBoardSvg({ model }: { model: BoardModel }) {
  const [zoom, setZoom] = useState(HOME_ZOOM)
  const [pan, setPan] = useState(HOME_PAN)
  const [hoveredDeployment, setHoveredDeployment] = useState<Position | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<{
    x: number
    y: number
    panX: number
    panY: number
    moved: boolean
  } | null>(null)
  /** Set when a press turned into a pan, so the release does not also click. */
  const pannedRef = useRef(false)

  // A sliding token keeps a 'tween' effect alive, so this covers moves too.
  const now = useBoardClock(model.effects.length > 0)

  /** Your own colour: the only thing drawn in it is your own plan. */
  const planColor = model.myColor ?? TABLE.accent
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
          if (e.button !== 0) return
          pannedRef.current = false
          dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y, moved: false }
        }}
        onPointerMove={e => {
          const drag = dragRef.current
          if (!drag) return
          const dx = e.clientX - drag.x
          const dy = e.clientY - drag.y
          if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
          drag.moved = true
          pannedRef.current = true
          const scale = unitsPerPixel()
          setPan({ x: drag.panX + dx * scale, y: drag.panY + dy * scale })
        }}
        onPointerUp={() => {
          dragRef.current = null
        }}
        onPointerLeave={() => {
          dragRef.current = null
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
        <defs>
          <radialGradient id="bh-halo">
            <stop offset="40%" stopColor="#ffb445" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#ffb445" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="planet-shade" cx="35%" cy="30%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.62" />
          </radialGradient>
        </defs>

        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
          <WellsLayer />
          <LanesLayer highlightIds={model.activeLaneIds} />
          <RangeOverlay cells={model.rangeCells} />
          <MarkersLayer stations={model.stations} homes={model.homes} />
          {model.route && <RouteOverlay route={model.route} />}
          {model.plannedPoints.length > 1 && (
            <PlannedPath points={model.plannedPoints} color={planColor} />
          )}
          <MissilesLayer
            missiles={model.missiles}
            colorOf={model.colorOf}
            nameOf={model.nameOf}
            previews={model.missilePreviews}
            paths={model.missilePaths}
          />
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
          <EffectsLayer effects={model.effects} now={now} />
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
        <BoardButton title="Zoom in" onClick={() => setZoom(z => Math.min(MAX_ZOOM, z * 1.2))}>
          <AddIcon fontSize="small" />
        </BoardButton>
        <BoardButton title="Zoom out" onClick={() => setZoom(z => Math.max(MIN_ZOOM, z / 1.2))}>
          <RemoveIcon fontSize="small" />
        </BoardButton>
        <BoardButton title="Recentre the board" onClick={resetView}>
          <CenterFocusStrongIcon fontSize="small" />
        </BoardButton>
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
        sx={{
          bgcolor: 'rgba(18,25,36,0.8)',
          color: '#93a6bc',
          borderRadius: 1,
          border: '1px solid rgba(126,165,205,0.2)',
          '&:hover': { color: '#ffb445', borderColor: '#ffb445' },
        }}
      >
        {children}
      </IconButton>
    </Tooltip>
  )
}
