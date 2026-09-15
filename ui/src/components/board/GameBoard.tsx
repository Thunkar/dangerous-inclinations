/**
 * The board in the middle of the table.
 *
 * It renders the current `GameView` — or, while a turn is playing, the
 * overlay AnimationContext builds from that turn's events. Planning overlays
 * (weapon range, the path your turn will take) come from PlanContext, and are
 * computed with pure engine functions.
 */
import { useCallback, useMemo, useRef, useState, type WheelEvent as ReactWheelEvent } from 'react'
import { Box, IconButton, Tooltip } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong'
import type { Position } from '@dangerous-inclinations/engine'
import { deploymentPositions, getJumpOptions, samePosition } from '@dangerous-inclinations/engine'
import { useGame } from '../../context/GameContext'
import { useAnimation } from '../../context/AnimationContext'
import { usePlanOptional } from '../../context/PlanContext'
import { getPlayerColor } from '../../utils/playerColors'
import {
  BOARD_BOUNDS,
  BOARD_VIEWBOX,
  headingAtPoint,
  interpolatePositions,
  type Point,
} from './geometry'
import { WellsLayer } from './layers/WellsLayer'
import { LanesLayer } from './layers/LanesLayer'
import { MarkersLayer, type HomeMarker } from './layers/MarkersLayer'
import { ShipsLayer, type ShipToken } from './layers/ShipsLayer'
import { MissilesLayer, type MissilePreview } from './layers/MissilesLayer'
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

interface GameBoardProps {
  /** Deployment phase: clicking a free Black Hole ring-4 sector places your ship and Home. */
  onDeploy?: (position: Position) => void
  deploymentEnabled?: boolean
}

export function GameBoard({ onDeploy, deploymentEnabled }: GameBoardProps) {
  const { view, nameOf } = useGame()
  const { overlay, effects, now } = useAnimation()
  const plan = usePlanOptional()

  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
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

  const colorOf = useCallback(
    (playerId: string) => getPlayerColor(view.players.findIndex(p => p.id === playerId)),
    [view.players]
  )

  const ships = useMemo<ShipToken[]>(() => {
    return view.players.flatMap((player, index) => {
      const live = overlay?.ships[player.id]
      const publicShip = player.ship
      if (!live && !publicShip) return []
      if (live && !live.alive) return []
      if (!live && publicShip?.isDestroyed) return []
      const position: Position = live
        ? live.position
        : { wellId: publicShip!.wellId, ring: publicShip!.ring, sector: publicShip!.sector }
      const facing = live?.facing ?? publicShip!.facing
      // Mid-slide: draw the token along the ring between its old and new sector.
      let point: Point | undefined
      let heading: number | undefined
      if (live?.motion) {
        const raw = Math.min(1, Math.max(0, (now - live.motion.start) / live.motion.duration))
        if (raw < 1) {
          const t = raw < 0.5 ? 2 * raw * raw : 1 - (-2 * raw + 2) ** 2 / 2
          point = interpolatePositions(live.motion.from, position, t)
          heading =
            live.motion.from.wellId === position.wellId
              ? headingAtPoint(position.wellId, point, facing)
              : undefined
        }
      }
      return [
        {
          playerId: player.id,
          name: player.name,
          color: getPlayerColor(index),
          position,
          point,
          heading,
          facing,
          isActive: player.isActive,
          isMe: player.isMe,
          hitPoints: publicShip?.hitPoints ?? 0,
          maxHitPoints: publicShip?.maxHitPoints ?? 10,
          heat: publicShip?.heat ?? 0,
        },
      ]
    })
  }, [view.players, overlay, now])

  const homes = useMemo<HomeMarker[]>(
    () =>
      view.players.flatMap((player, index) =>
        player.home
          ? [
              {
                playerId: player.id,
                name: player.name,
                color: getPlayerColor(index),
                position: player.home,
              },
            ]
          : []
      ),
    [view.players]
  )

  const positionOf = useCallback(
    (playerId: string): Position | null => {
      const token = ships.find(s => s.playerId === playerId)
      return token ? token.position : null
    },
    [ships]
  )

  const stations = overlay?.stations ?? view.stations
  const missiles = overlay?.missiles ?? view.missiles

  // --- planning overlays ---------------------------------------------------

  const plannedPoints = useMemo<Position[]>(() => {
    if (!plan || !plan.isMyTurn || overlay) return []
    const points = [...plan.stepStart.map(s => s.position), plan.finalPosition.position]
    return points.filter((p, i) => i === 0 || !samePosition(p, points[i - 1]))
  }, [plan, overlay])

  const focusWeapon = useMemo(() => {
    if (!plan || !plan.isMyTurn || overlay || !plan.focusWeaponId) return null
    const weapon = plan.pendingSubsystems.find(s => s.id === plan.focusWeaponId)
    if (!weapon) return null
    const stepIndex = plan.steps.findIndex(
      s => s.kind === 'fire' && s.subsystemId === plan.focusWeaponId
    )
    const at = stepIndex >= 0 ? plan.stepStart[stepIndex] : plan.finalPosition
    return { weapon, from: at.position, facing: at.facing }
  }, [plan, overlay])

  const selectableIds = useMemo(() => {
    if (!plan || !plan.isMyTurn || overlay) return []
    const ids = new Set<string>()
    for (const step of plan.steps) {
      if (step.kind !== 'fire' && step.kind !== 'scan') continue
      for (const target of plan.targetsInRange(step)) ids.add(target.id)
    }
    return [...ids]
  }, [plan, overlay])

  /**
   * A launch you have queued but not yet sent, drawn from where it would be
   * fired. Order matters: a missile launched after the move rode along with
   * the ship, so it does not drift again this turn.
   */
  const missilePreviews = useMemo<MissilePreview[]>(() => {
    if (!plan || !plan.isMyTurn || overlay) return []
    const moveIndex = plan.steps.findIndex(s => s.kind === 'move')
    return plan.steps.flatMap((step, index) => {
      if (step.kind !== 'fire' || !step.targetId) return []
      const weapon = plan.pendingSubsystems.find(s => s.id === step.subsystemId)
      if (!weapon || weapon.type !== 'missiles') return []
      const target = plan.targets.find(t => t.id === step.targetId)
      if (!target) return []
      return [
        {
          id: step.id,
          from: plan.stepStart[index]?.position ?? plan.finalPosition.position,
          target: target.position,
          launchedAfterMove: moveIndex >= 0 && index > moveIndex,
          color: colorOf(plan.me.id),
          label: `Planned missile at ${nameOf(target.id)} — rides its orbit, then flies up to 3 steps`,
        },
      ]
    })
  }, [plan, overlay, colorOf, nameOf])

  const activeLaneIds = useMemo(() => {
    if (!plan || !plan.isMyTurn) return []
    return getJumpOptions(plan.moveFrom.position).map(o => o.lane.id)
  }, [plan])

  const freeDeploymentSectors = useMemo<Position[]>(() => {
    if (!deploymentEnabled) return []
    const taken = view.players.flatMap(p =>
      p.ship ? [{ wellId: p.ship.wellId, ring: p.ship.ring, sector: p.ship.sector }] : []
    )
    return deploymentPositions().filter(position => !taken.some(t => samePosition(t, position)))
  }, [deploymentEnabled, view.players])

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

  const resetView = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
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
          cursor: deploymentEnabled ? 'default' : 'grab',
          touchAction: 'none',
          '&:active': { cursor: deploymentEnabled ? 'default' : 'grabbing' },
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
          <LanesLayer highlightIds={activeLaneIds} />
          {focusWeapon && (
            <RangeOverlay
              weapon={focusWeapon.weapon}
              from={focusWeapon.from}
              facing={focusWeapon.facing}
            />
          )}
          <MarkersLayer stations={stations} homes={homes} />
          {plan?.route && !overlay && (
            <RouteOverlay route={plan.route} color={colorOf(plan.me.id)} />
          )}
          {plannedPoints.length > 1 && plan && (
            <PlannedPath points={plannedPoints} color={colorOf(plan.me.id)} />
          )}
          <MissilesLayer
            missiles={missiles}
            positionOf={positionOf}
            colorOf={colorOf}
            nameOf={nameOf}
            previews={missilePreviews}
          />
          <ShipsLayer ships={ships} onSelect={plan?.pickTarget} selectableIds={selectableIds} />
          {plan?.isMyTurn && plan.picking?.kind === 'destination' && !overlay && (
            <SectorPicker onPick={plan.setRouteDestination} />
          )}
          {deploymentEnabled && onDeploy && (
            <DeploymentSectors
              positions={freeDeploymentSectors}
              onPick={onDeploy}
              hovered={hoveredDeployment}
              onHover={setHoveredDeployment}
            />
          )}
          <EffectsLayer effects={effects} now={now} />
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
