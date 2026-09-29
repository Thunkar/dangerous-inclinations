/**
 * RoutePlanContext: the route planner's state.
 *
 * A destination (a sector, or a station held by id), the routes the engine
 * finds to it from where the ship is now, and the one in view. Only the route
 * planner and the board read it. It sits inside the plan, because picking a
 * destination shares the plan's `picking` with aiming a shot or a scan, and
 * taking a route's first step is setting this turn's move.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type {
  Facing,
  MovementPlan,
  MovementStep,
  Position,
  Station,
} from '@dangerous-inclinations/engine'
import {
  getStationAt,
  hasWorkingCompressor,
  planMovementAlternatives,
  planMovementToTarget,
  planStationMeetUp,
  samePosition,
  staticTarget,
  stationPosition,
  stationTarget,
} from '@dangerous-inclinations/engine'
import { useGame } from './GameContext'
import { usePlan } from './PlanContext'
import type { MoveChoice } from '../plan/preview'
import { ROUTE_SEARCH_TURNS } from '../utils/route'

/**
 * What "go there" means when the destination is a station.
 *
 * A station is not a place, it is a thing on a circuit: it advances 4 sectors
 * at the end of every round. Planning to the sector it is on today lands the
 * ship where it used to be, which is never what anyone clicking a station
 * wanted, so a station destination means `meet` unless you say otherwise.
 */
export type RouteMode = 'meet' | 'sector'

interface RoutePlanContextValue {
  /** A destination sector, the routes the engine finds, and the one in view. */
  routeDestination: Position | null
  /**
   * The station the destination was picked on, if any: held by id, because a
   * station drifts 4 sectors every round and the sector you clicked stops
   * being the one it is on.
   */
  routeStation: Station | null
  /**
   * `meet` aims at where the station will be when the ship gets there; `sector`
   * aims at the fixed sector. Only a station destination can be `meet`.
   */
  routeMode: RouteMode
  setRouteMode: (mode: RouteMode) => void
  /**
   * Fuel the route must still have aboard when it arrives: a Tanker's card,
   * or a margin for the trip after. The route may not spend it.
   */
  routeReserve: number
  setRouteReserve: (fuel: number) => void
  routes: MovementPlan[]
  route: MovementPlan | null
  routeIndex: number
  setRouteDestination: (position: Position | null) => void
  selectRoute: (index: number) => void
  /** Turn the route's first step into this turn's move (rotation included). */
  applyRouteStep: () => void
}

const RoutePlanContext = createContext<RoutePlanContextValue | undefined>(undefined)

/** The move a route step is, as the plan's move control would set it. */
export function moveOfRouteStep(step: MovementStep): MoveChoice {
  return step.actionType === 'coast'
    ? { kind: 'coast', scoop: step.massCost < 0 }
    : step.actionType === 'well_transfer'
      ? { kind: 'jump', destinationWellId: step.to.wellId, adjustment: step.sectorAdjustment }
      : { kind: 'burn', intensity: step.burnIntensity ?? 'soft', adjustment: step.sectorAdjustment }
}

/** Prograde burns outward, retrograde inward: the step says which way, so it says the facing. */
function facingOfRouteStep(step: MovementStep): Facing | null {
  // A jump is a burn out of the well, so it needs prograde facing too.
  return step.actionType === 'burn_prograde' || step.actionType === 'well_transfer'
    ? 'prograde'
    : step.actionType === 'burn_retrograde'
      ? 'retrograde'
      : null
}

export function RoutePlanProvider({ children }: { children: ReactNode }) {
  const { view } = useGame()
  const { me, picking, setPicking, applyMove } = usePlan()
  const [routeDestination, setRouteDestinationState] = useState<Position | null>(null)
  const [routeStationId, setRouteStationId] = useState<string | null>(null)
  const [routeMode, setRouteMode] = useState<RouteMode>('meet')
  const [routeReserve, setRouteReserve] = useState(0)
  const [routeIndex, setRouteIndex] = useState(0)

  /** The station the destination was picked on, found again by id as it drifts. */
  const routeStation = useMemo<Station | null>(
    () => (routeStationId ? (view.stations.find(s => s.id === routeStationId) ?? null) : null),
    [routeStationId, view.stations]
  )

  // From where the ship is now: the first step is this turn's move.
  const routes = useMemo<MovementPlan[]>(() => {
    // Fuel to arrive with. The route may run lower on the way and scoop back
    // up; only the forward search knows the fuel at every step, so a route
    // that has to arrive with some is one plan from it.
    const reserve = Math.min(routeReserve, me.ship.reactionMass)
    const scoop = me.ship.subsystems.find(s => s.id === 'scoop')
    const origin = {
      wellId: me.ship.wellId,
      ring: me.ship.ring,
      sector: me.ship.sector,
      facing: me.ship.facing,
    }
    const options = {
      availableMass: me.ship.reactionMass,
      hasFuelScoop: Boolean(scoop && !scoop.isBroken),
      maxFuelCapacity: view.myStats?.maxReactionMass ?? me.ship.reactionMass,
      hasFuelCompressor: hasWorkingCompressor(me.ship),
      allowWellTransfers: true,
      maxTurns: ROUTE_SEARCH_TURNS,
      arrivalMass: reserve,
    }
    // Meeting a station is a forward search against a moving target, so it
    // yields the one plan that arrives when the station does, not a set of
    // alternatives to a fixed sector.
    if (routeStation && routeMode === 'meet') {
      if (samePosition(me.ship, stationPosition(routeStation))) return []
      if (reserve > 0) {
        const plan = planMovementToTarget(origin, stationTarget(routeStation), options)
        return plan ? [plan] : []
      }
      const meet = planStationMeetUp(me.ship, routeStation, ROUTE_SEARCH_TURNS)
      return meet ? [meet.plan] : []
    }
    if (!routeDestination || samePosition(me.ship, routeDestination)) return []
    if (reserve > 0) {
      const plan = planMovementToTarget(origin, staticTarget(routeDestination), options)
      return plan ? [plan] : []
    }
    return planMovementAlternatives(origin, routeDestination, options)?.alternatives ?? []
  }, [routeDestination, routeStation, routeMode, routeReserve, me.ship, view.myStats])
  const route = routes[Math.min(routeIndex, Math.max(0, routes.length - 1))] ?? null

  // Arrived: the route has done its job. Meeting a station ends when the ship
  // is on the station, wherever the two of them got to.
  useEffect(() => {
    const arrived =
      routeStation && routeMode === 'meet'
        ? samePosition(me.ship, stationPosition(routeStation))
        : routeDestination !== null && samePosition(me.ship, routeDestination)
    if (arrived) {
      setRouteDestinationState(null)
      setRouteStationId(null)
    }
  }, [routeDestination, routeStation, routeMode, me.ship])

  const setRouteDestination = useCallback(
    (position: Position | null) => {
      setRouteDestinationState(position)
      // Click a station and you meant the station, not the sector under it.
      const station = position ? getStationAt(view.stations, position) : undefined
      setRouteStationId(station?.id ?? null)
      setRouteMode(station ? 'meet' : 'sector')
      setRouteIndex(0)
      if (picking?.kind === 'destination') setPicking(null)
    },
    [view.stations, picking, setPicking]
  )

  const selectRoute = useCallback((index: number) => setRouteIndex(index), [])

  const applyRouteStep = useCallback(() => {
    const step = route?.steps[0]
    if (step) applyMove(moveOfRouteStep(step), facingOfRouteStep(step))
  }, [route, applyMove])

  const value = useMemo<RoutePlanContextValue>(
    () => ({
      routeDestination,
      routeStation,
      routeMode,
      setRouteMode,
      routeReserve,
      setRouteReserve,
      routes,
      route,
      routeIndex,
      setRouteDestination,
      selectRoute,
      applyRouteStep,
    }),
    [
      routeDestination,
      routeStation,
      routeMode,
      routeReserve,
      routes,
      route,
      routeIndex,
      setRouteDestination,
      selectRoute,
      applyRouteStep,
    ]
  )

  return <RoutePlanContext.Provider value={value}>{children}</RoutePlanContext.Provider>
}

export function useRoutePlan(): RoutePlanContextValue {
  const context = useContext(RoutePlanContext)
  if (!context) throw new Error('useRoutePlan must be used within a RoutePlanProvider')
  return context
}

/** For the board, which also renders where nobody is planning. */
export function useRoutePlanOptional(): RoutePlanContextValue | null {
  return useContext(RoutePlanContext) ?? null
}
