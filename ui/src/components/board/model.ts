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
  getMissileStats,
  getSubsystemConfig,
  legalDeploymentsAgainst,
  placedShipPositions,
  projectMissilePath,
  samePosition,
  stationPosition,
} from '@dangerous-inclinations/engine'
import type { CameraShot, ShipMotion, TableEffect, WreckMotion } from '../../animation/beats'
import type { Ping } from '../../context/AnimationContext'
import { useAnimation } from '../../context/AnimationContext'
import { useGame } from '../../context/GameContext'
import { usePlanOptional } from '../../context/PlanContext'
import { useRoutePlanOptional } from '../../context/RoutePlanContext'
import { getPlayerColor } from '../../utils/playerColors'
import { TABLE } from '../../theme'
import { visualForPlayer, type ShipVisual } from '../../ships/visual'
import {
  crowdOffset,
  facingAngle,
  positionPoint,
  radialPoint,
  ringsOf,
  type Point,
  type WreckCrowd,
} from './geometry'

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
  /**
   * The Escort markers sitting on this ship, one per marking player, in seat
   * order: public, face-up on the table (RULES §Missions, Escort).
   */
  escorts: EscortBadge[]
  isActive: boolean
  isMe: boolean
  hitPoints: number
  maxHitPoints: number
  heat: number
}

export interface EscortBadge {
  playerId: string
  name: string
  color: string
}

/**
 * What a destroyed ship left behind, until a Salvage holder takes it. Public.
 * Several can share a sector, and share it with ships: `crowd` numbers them
 * and `geometry.wreckPoint` turns that into the place each board draws it.
 */
export interface WreckToken {
  id: string
  position: Position
  /** Set while the wreck drifts with the stations' step; renderers interpolate. */
  motion?: WreckMotion
  crowd: WreckCrowd
}

export interface HomeMarker {
  playerId: string
  name: string
  color: string
  position: Position
}

/** A station, where both boards draw it: the engine's `stationPosition`. */
export interface StationMarker {
  id: string
  planetId: string
  position: Position
}

export function stationMarkers(stations: readonly Station[]): StationMarker[] {
  return stations.map(station => ({
    id: station.id,
    planetId: station.planetId,
    position: stationPosition(station),
  }))
}

/**
 * A missile in flight, drawn the same on both boards: where it goes next (the
 * orbital drift first, then the flight steps, asked of the engine), which way
 * it points, and where it stands among the missiles sharing its sector.
 */
export interface MissileToken {
  id: string
  ownerId: string
  targetId: string
  position: Position
  color: string
  /** Empty when the target has left the board: a dart and nothing more. */
  path: Position[]
  /** Where the dart points, in board radians: at the first place its path takes it. */
  heading: number
  /**
   * The board point the dart is drawn on: its sector, stepped abreast of the
   * others in it, so a salvo of four is four darts side by side and not one
   * dart drawn four times. Abreast is square to each dart's own heading, so a
   * salvo diving inward does not line up nose to tail.
   */
  point: Point
  tooltip: string
}

/** A launch sitting in the plan, not yet submitted. */
export interface MissilePreview {
  id: string
  from: Position
  target: Position
  /** Where it would fly on its launch turn: no ride, only flight steps. */
  path: Position[]
  color: string
  label: string
}

/** How far apart missiles sharing a sector stand, in board units. */
const MISSILE_SPREAD = 9

/** The missile rules the tooltips quote, read off the engine once. */
const MISSILE = getMissileStats()
const MISSILE_TOOLTIP =
  `Rides its orbit, then flies up to ${MISSILE.fuelPerTurn} steps toward the target (rings first). ` +
  `On its launch turn it only flies, from where it was launched. ${MISSILE.maxMoves} flights max.`

/** The label a planned launch carries. */
export function missilePreviewLabel(targetName: string, count: number): string {
  return count > 1
    ? `Planned salvo of ${count} at ${targetName} · each flies up to ${MISSILE.fuelPerTurn} steps this turn`
    : `Planned missile at ${targetName} · flies up to ${MISSILE.fuelPerTurn} steps this turn`
}

/** A planned launch's flight: on its launch turn a missile flies from where it is fired, with no ride. */
export function previewPath(from: Position, target: Position): Position[] {
  return projectMissilePath({ ...from, movesMade: 0 }, target)
}

/** Where a dart points: at the first place its path takes it, or along its ring. */
function headingOf(at: Position, path: readonly Position[]): number {
  const next = path.find(step => !samePosition(step, at))
  if (!next || next.wellId !== at.wellId) return facingAngle(at, 'prograde')
  const here = positionPoint(at)
  const there = positionPoint(next)
  return Math.atan2(there.y - here.y, there.x - here.x)
}

/**
 * The missiles as both boards draw them. `targetAt` says where a target is
 * on the board, or null once it has left it; a missile at a target that has
 * gone has no path.
 */
export function missileTokens(
  missiles: readonly Missile[],
  targetAt: (playerId: string) => Position | null,
  colorOf: (playerId: string) => string,
  nameOf: (playerId: string) => string
): MissileToken[] {
  return missiles.map(missile => {
    const position: Position = {
      wellId: missile.wellId,
      ring: missile.ring,
      sector: missile.sector,
    }
    const target = targetAt(missile.targetId)
    const path = target ? projectMissilePath(missile, target) : []
    const heading = headingOf(position, path)
    const sharing = missiles.filter(other => samePosition(other, missile))
    const step = (sharing.indexOf(missile) - (sharing.length - 1) / 2) * MISSILE_SPREAD
    const centre = positionPoint(position)
    return {
      id: missile.id,
      ownerId: missile.ownerId,
      targetId: missile.targetId,
      position,
      color: colorOf(missile.ownerId),
      path,
      heading,
      point: {
        x: centre.x + Math.cos(heading + Math.PI / 2) * step,
        y: centre.y + Math.sin(heading + Math.PI / 2) * step,
      },
      tooltip: `${nameOf(missile.ownerId)}'s missile → ${nameOf(missile.targetId)} · ${
        MISSILE.maxMoves - missile.movesMade
      } flight(s) left. ${MISSILE_TOOLTIP}`,
    }
  })
}

/** The weapon whose range is drawn, from where it would be fired. */
interface FocusWeapon {
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
  wrecks: WreckToken[]
  homes: HomeMarker[]
  stations: StationMarker[]
  missiles: MissileToken[]
  missilePreviews: MissilePreview[]
  /** The sectors the turn being built passes through, start included. */
  plannedPoints: Position[]
  /** The route planner's chosen route, when one is in view and no turn is playing. */
  route: MovementPlan | null
  /** Every sector the focus weapon reaches from where it would be fired; empty without one. */
  rangeCells: Position[]
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
  /**
   * The colour the plan being built is drawn in: the table's cream. A plan is
   * a projection, not a ship, so it never wears a seat colour.
   */
  planColor: string
  colorOf: (playerId: string) => string
  nameOf: (playerId: string) => string
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
  const routePlan = useRoutePlanOptional()

  const colorOf = useCallback(
    (playerId: string) => getPlayerColor(view.players.findIndex(p => p.id === playerId)),
    [view.players]
  )

  /**
   * A token per living ship: where it is, and (while a turn is playing) the
   * slide it is in the middle of. The slide itself is not resolved here; a
   * renderer reads its own clock against `motion`.
   */
  const ships = useMemo<ShipToken[]>(() => {
    const escortsOf = (playerId: string): EscortBadge[] => {
      const ids =
        overlay?.escorts[playerId] ?? view.players.find(p => p.id === playerId)?.escortedBy ?? []
      return view.players.flatMap((p, index) =>
        ids.includes(p.id) ? [{ playerId: p.id, name: p.name, color: getPlayerColor(index) }] : []
      )
    }
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
          escorts: escortsOf(player.id),
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

  /**
   * A token per wreck, numbered among the wrecks on its sector and told how
   * many ships stand there, so the wrecks take their own band and never sit on
   * a hull. Read off resting positions, like the ships' crowd.
   */
  const wrecks = useMemo<WreckToken[]>(() => {
    const live =
      overlay?.wrecks ??
      view.wrecks.map(w => ({
        id: w.id,
        position: { wellId: w.wellId, ring: w.ring, sector: w.sector },
      }))
    return live.map(wreck => {
      const sharing = live.filter(other => samePosition(other.position, wreck.position))
      return {
        ...wreck,
        crowd: {
          index: sharing.indexOf(wreck),
          count: sharing.length,
          ships: ships.filter(ship => samePosition(ship.position, wreck.position)).length,
        },
      }
    })
  }, [view.wrecks, overlay, ships])

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

  const liveStations = overlay?.stations ?? view.stations
  const stations = useMemo(() => stationMarkers(liveStations), [liveStations])
  const liveMissiles = overlay?.missiles ?? view.missiles
  /**
   * A missile in flight rides its orbit and then flies at its target. The
   * path is asked of the engine here, once, so neither board draws a path of
   * its own invention.
   */
  const missiles = useMemo(
    () => missileTokens(liveMissiles, positionOf, colorOf, nameOf),
    [liveMissiles, positionOf, colorOf, nameOf]
  )

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
      const from = plan.stepStart[index]?.position ?? plan.finalPosition.position
      return [
        {
          id: step.id,
          from,
          target: target.position,
          path: previewPath(from, target.position),
          color: colorOf(plan.me.id),
          label: missilePreviewLabel(nameOf(target.id), step.count),
        },
      ]
    })
  }, [plan, overlay, colorOf, nameOf])

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
    plan && routePlan && plan.isMyTurn && plan.picking?.kind === 'destination' && !overlay
      ? routePlan.setRouteDestination
      : null
  const onPickTarget = plan ? plan.pickTarget : null
  const route = routePlan && !overlay ? routePlan.route : null

  return useMemo(
    () => ({
      ships,
      wrecks,
      homes,
      stations,
      missiles,
      missilePreviews,
      plannedPoints,
      route,
      rangeCells,
      selectableIds,
      activeLaneIds,
      onPickDestination,
      onPickTarget,
      deployment,
      animating: overlay !== null,
      effects,
      ping: pinged,
      shot,
      planColor: TABLE.ink,
      colorOf,
      nameOf,
      pointOf,
    }),
    [
      ships,
      wrecks,
      homes,
      stations,
      missiles,
      missilePreviews,
      plannedPoints,
      route,
      rangeCells,
      selectableIds,
      activeLaneIds,
      onPickDestination,
      onPickTarget,
      deployment,
      overlay,
      effects,
      pinged,
      shot,
      colorOf,
      nameOf,
      pointOf,
    ]
  )
}
