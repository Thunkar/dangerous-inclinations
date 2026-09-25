/**
 * The board model: everything either renderer draws, derived once.
 *
 * `useBoardModel()` reads GameContext (the view), AnimationContext (the turn
 * overlay and its effects) and PlanContext (previews of the turn being
 * built) and returns plain data plus the callbacks a click may fire. The SVG
 * board and the 3D board both consume it, so a range, a path or a target can
 * never differ between the two. No renderer computes anything rule-shaped.
 *
 * Time is not in here: a sliding token carries its `motion`, an effect its
 * `start` and `duration`, and each renderer reads its own clock.
 */
import { useCallback, useMemo } from 'react'
import type {
  Facing,
  Missile,
  MovementPlan,
  Position,
  Station,
  Subsystem,
} from '@dangerous-inclinations/engine'
import {
  SECTORS_PER_RING,
  getJumpOptions,
  canEngage,
  getSubsystemConfig,
  legalDeploymentsAgainst,
  placedShipPositions,
  projectMissilePath,
  samePosition,
} from '@dangerous-inclinations/engine'
import type { CameraShot, Ping, ShipMotion, TableEffect } from '../../context/AnimationContext'
import { useAnimation } from '../../context/AnimationContext'
import { useGame } from '../../context/GameContext'
import { usePlanOptional } from '../../context/PlanContext'
import { getPlayerColor } from '../../utils/playerColors'
import { visualForPlayer, type ShipVisual } from '../../ships/visual'
import { crowdOffset, radialPoint, ringsOf, type Point } from './geometry'

export interface ShipToken {
  visual?: ShipVisual
  playerId: string
  name: string
  color: string
  position: Position
  facing: Facing
  /** Set while the token slides from its previous sector; renderers interpolate. */
  motion?: ShipMotion
  /**
   * Where this ship stands among the live ships sharing its sector, so that
   * neither renderer draws two hulls in the same place: `count` is how many are
   * on it and `index` is this one's place in seat order, which is the same at
   * every seat and on both boards. Alone is `{ index: 0, count: 1 }`.
   * `geometry.crowdOffset` turns it into the radial nudge each board applies.
   */
  crowd: { index: number; count: number }
  isActive: boolean
  isMe: boolean
  hitPoints: number
  maxHitPoints: number
  heat: number
}

export interface HomeMarker {
  playerId: string
  name: string
  color: string
  position: Position
}

/** A launch sitting in the plan, not yet submitted. */
export interface MissilePreview {
  id: string
  from: Position
  target: Position
  color: string
  label: string
}

/** The weapon whose range is drawn, from where it would be fired. */
export interface FocusWeapon {
  weapon: Subsystem
  from: Position
  facing: Facing
}

export interface BoardModelOptions {
  /** Deployment phase: clicking a legal Black Hole ring-3 or ring-4 sector places your ship and Home. */
  onDeploy?: (position: Position) => void
  deploymentEnabled?: boolean
}

export interface BoardModel {
  ships: ShipToken[]
  homes: HomeMarker[]
  stations: Station[]
  missiles: Missile[]
  missilePreviews: MissilePreview[]
  /** The sectors the turn being built passes through, start included. */
  plannedPoints: Position[]
  /** The route planner's chosen route, when one is in view and no turn is playing. */
  route: MovementPlan | null
  focusWeapon: FocusWeapon | null
  /** Every sector the focus weapon reaches from where it would be fired; empty without one. */
  rangeCells: Position[]
  /**
   * Where each missile goes next, by missile id and by preview id: the
   * orbital drift first, then the flight steps. Asked of the engine once,
   * here, so neither board draws a path of its own invention.
   */
  missilePaths: Record<string, Position[]>
  /** Ships that can be targeted right now. */
  selectableIds: string[]
  /** Lanes that can be jumped from where the move starts. */
  activeLaneIds: string[]
  /** Non-null while a destination sector is being chosen for the route planner. */
  onPickDestination: ((position: Position) => void) | null
  /** Non-null when clicking a selectable ship aims the step being edited at it. */
  onPickTarget: ((playerId: string) => void) | null
  /** Non-null while this seat is placing its ship: the free sectors and what a click does. */
  deployment: { positions: Position[]; onPick: (position: Position) => void } | null
  /** True while a turn is being played back over the board. */
  animating: boolean
  /** Transient effects pushed by the animator; each carries `start` and `duration`. */
  effects: TableEffect[]
  /**
   * A ship the player asked to be shown. The rings are already in `effects`;
   * this is here for the renderers that can do more: the 3D board swings its
   * camera to the well. Its `id` changes on every ping, so asking for the same
   * ship twice answers twice.
   */
  ping: Ping | null
  /** What the 3D board's auto camera should frame while a turn plays; the flat board ignores it. */
  shot: CameraShot | null
  /** This seat's colour, or null for a spectator. */
  myColor: string | null
  colorOf: (playerId: string) => string
  nameOf: (playerId: string) => string
  /** Where a player's ship is drawn right now (overlay first), or null if absent. */
  positionOf: (playerId: string) => Position | null
  /**
   * The board point that ship's hull is drawn on: its sector, plus the radial
   * step it takes among the ships sharing it. A sector is a cell and a beam
   * aimed at the cell misses a hull standing beside its centre, so an effect
   * that knows whose it is asks here and only falls back to the sector when
   * the ship has left the table.
   */
  pointOf: (playerId: string) => Point | null
}

export function useBoardModel({ onDeploy, deploymentEnabled }: BoardModelOptions): BoardModel {
  const { view, nameOf } = useGame()
  const { overlay, effects, pinged, shot } = useAnimation()
  const plan = usePlanOptional()

  const colorOf = useCallback(
    (playerId: string) => getPlayerColor(view.players.findIndex(p => p.id === playerId)),
    [view.players]
  )

  const myColor = useMemo(() => {
    const index = view.players.findIndex(p => p.isMe)
    return index >= 0 ? getPlayerColor(index) : null
  }, [view.players])

  /**
   * A token per living ship: where it is, and (while a turn is playing) the
   * slide it is in the middle of. The slide itself is not resolved here; a
   * renderer reads its own clock against `motion`.
   */
  const ships = useMemo<ShipToken[]>(() => {
    const tokens = view.players.flatMap<Omit<ShipToken, 'crowd'>>((player, index) => {
      const live = overlay?.ships[player.id]
      const publicShip = player.ship
      if (!live && !publicShip) return []
      if (live && !live.alive) return []
      if (!live && publicShip?.isDestroyed) return []
      const position: Position = live
        ? live.position
        : { wellId: publicShip!.wellId, ring: publicShip!.ring, sector: publicShip!.sector }
      return [
        {
          playerId: player.id,
          name: player.name,
          color: getPlayerColor(index),
          visual: visualForPlayer(player),
          position,
          facing: live?.facing ?? publicShip!.facing,
          motion: live?.motion,
          isActive: player.isActive,
          isMe: player.isMe,
          hitPoints: publicShip?.hitPoints ?? 0,
          maxHitPoints: publicShip?.maxHitPoints ?? 10,
          heat: publicShip?.heat ?? 0,
        },
      ]
    })
    // Sharing is read off the resting positions, never off a slide: a token
    // half-way round the ring still belongs to the sector it is heading for.
    return tokens.map(token => {
      const sharing = tokens.filter(other => samePosition(other.position, token.position))
      return { ...token, crowd: { index: sharing.indexOf(token), count: sharing.length } }
    })
  }, [view.players, overlay])

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

  const pointOf = useCallback(
    (playerId: string): Point | null => {
      const token = ships.find(s => s.playerId === playerId)
      return token ? radialPoint(token.position, crowdOffset(token.crowd)) : null
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

  const focusWeapon = useMemo<FocusWeapon | null>(() => {
    if (!plan || !plan.isMyTurn || overlay || !plan.focusWeaponId) return null
    const weapon = plan.pendingSubsystems.find(s => s.id === plan.focusWeaponId)
    if (!weapon) return null
    const stepIndex = plan.steps.findIndex(
      s => s.kind === 'fire' && s.subsystemId === plan.focusWeaponId
    )
    const at = stepIndex >= 0 ? plan.stepStart[stepIndex] : plan.finalPosition
    return { weapon, from: at.position, facing: at.facing }
  }, [plan, overlay])

  /**
   * The range is the engine's answer, sector by sector: the UI never
   * re-implements a rule, and both boards shade exactly the same wedges.
   *
   * `canEngage`, not the bare range rule: a missile may legally be launched at
   * anyone in the well, so the rule alone would shade every sector of it and
   * say nothing. What the player needs to see is where a missile would
   * actually run a coasting ship down before it expires.
   */
  const rangeCells = useMemo<Position[]>(() => {
    if (!focusWeapon) return []
    const { weapon, from, facing } = focusWeapon
    if (!getSubsystemConfig(weapon.type).weaponStats) return []
    const attacker = { wellId: from.wellId, ring: from.ring, sector: from.sector, facing }
    const cells: Position[] = []
    for (const ring of ringsOf(from.wellId)) {
      for (let sector = 0; sector < SECTORS_PER_RING; sector++) {
        const cell: Position = { wellId: from.wellId, ring: ring.ring, sector }
        if (canEngage(weapon, attacker, cell)) cells.push(cell)
      }
    }
    return cells
  }, [focusWeapon])

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
   * fired: on its launch turn a missile flies from there with no ride.
   */
  const missilePreviews = useMemo<MissilePreview[]>(() => {
    if (!plan || !plan.isMyTurn || overlay) return []
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
          color: colorOf(plan.me.id),
          label:
            step.count > 1
              ? `Planned salvo of ${step.count} at ${nameOf(target.id)} · each flies up to 3 steps this turn`
              : `Planned missile at ${nameOf(target.id)} · flies up to 3 steps this turn`,
        },
      ]
    })
  }, [plan, overlay, colorOf, nameOf])

  /**
   * A missile in flight rides its orbit and then flies at its target; a
   * planned launch only flies, from where it would be fired, because the
   * launch turn has no ride. Missiles whose target has left the board have no
   * path at all.
   */
  const missilePaths = useMemo<Record<string, Position[]>>(() => {
    const paths: Record<string, Position[]> = {}
    for (const missile of missiles) {
      const target = positionOf(missile.targetId)
      if (target) paths[missile.id] = projectMissilePath(missile, target)
    }
    for (const preview of missilePreviews) {
      paths[preview.id] = projectMissilePath({ ...preview.from, movesMade: 0 }, preview.target)
    }
    return paths
  }, [missiles, missilePreviews, positionOf])

  const activeLaneIds = useMemo(() => {
    if (!plan || !plan.isMyTurn) return []
    return getJumpOptions(plan.moveFrom.position).map(o => o.lane.id)
  }, [plan])

  // Exactly where the rules would let this ship go (RULES §Deployment): both
  // rings, three sectors clear of every ship already placed: the engine's own
  // answer, so the board cannot offer a cell the server would refuse.
  const legalDeployments = useMemo<Position[]>(
    () => (deploymentEnabled ? legalDeploymentsAgainst(placedShipPositions(view)) : []),
    [deploymentEnabled, view]
  )

  const deployment = useMemo(
    () =>
      deploymentEnabled && onDeploy ? { positions: legalDeployments, onPick: onDeploy } : null,
    [deploymentEnabled, onDeploy, legalDeployments]
  )

  // A destination is only picked on your own turn, and never over a turn that
  // is still playing out.
  const onPickDestination =
    plan && plan.isMyTurn && plan.picking?.kind === 'destination' && !overlay
      ? plan.setRouteDestination
      : null
  const onPickTarget = plan ? plan.pickTarget : null
  const route = plan && !overlay ? plan.route : null

  return useMemo(
    () => ({
      ships,
      homes,
      stations,
      missiles,
      missilePreviews,
      plannedPoints,
      route,
      focusWeapon,
      rangeCells,
      missilePaths,
      selectableIds,
      activeLaneIds,
      onPickDestination,
      onPickTarget,
      deployment,
      animating: overlay !== null,
      effects,
      ping: pinged,
      shot,
      myColor,
      colorOf,
      nameOf,
      positionOf,
      pointOf,
    }),
    [
      ships,
      homes,
      stations,
      missiles,
      missilePreviews,
      plannedPoints,
      route,
      focusWeapon,
      rangeCells,
      missilePaths,
      selectableIds,
      activeLaneIds,
      onPickDestination,
      onPickTarget,
      deployment,
      overlay,
      effects,
      pinged,
      shot,
      myColor,
      colorOf,
      nameOf,
      positionOf,
      pointOf,
    ]
  )
}
