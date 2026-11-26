/**
 * Following a route at the table, one turn at a time.
 *
 * A player who has made the route's first step presses Done. The ship moves
 * to where that step ends, every station takes its round's step, and the
 * route is kept: the steps left are the same steps, not a fresh search that
 * might pick another alternative. The kept route still meets a moving
 * station, because the planner's station target puts the station `k - 1`
 * drifts on at the ship's `k`-th move, and one Done moves both the ship and
 * the stations one turn on.
 *
 * A ship whose step ends on a station's sector is moored, and the station
 * carries it when it steps. That is the arrival at a station; a route that
 * only passes over a berth on the way is dropped there and planned afresh,
 * since the planner did not count the ride.
 *
 * Any edit to the inputs drops the kept route (the tool plans afresh), and
 * the history with it. Undo puts back the table as it was before the last
 * Done. Pure: the component only calls these.
 */
import type {
  Facing,
  MovementPlan,
  MovementStep,
  Position,
  Station,
} from '@dangerous-inclinations/engine'
import {
  MAX_REACTION_MASS,
  STATION_DRIFT,
  samePosition,
  stationPosition,
  wrapSector,
} from '@dangerous-inclinations/engine'

/** The ship as the tool knows it: where it is, which way it faces, its fuel. */
export interface Ship {
  at: Position
  facing: Facing
  fuel: number
}

/** The table before one Done. */
interface Before {
  ship: Ship
  stations: Station[]
  kept: MovementPlan | null
}

export interface Trip {
  ship: Ship
  stations: Station[]
  /** The route being followed once a step of it is done; null plans afresh. */
  kept: MovementPlan | null
  /** The tables before each Done, the latest last. */
  history: Before[]
}

/** How many Dones Undo can take back. */
const HISTORY = 20

export const startTrip = (ship: Ship, stations: Station[]): Trip => ({
  ship,
  stations,
  kept: null,
  history: [],
})

/** The ship after a step: at its end, facing the way it was made, the fuel spent or scooped. */
export function afterStep(ship: Ship, step: MovementStep): Ship {
  const { wellId, ring, sector } = step.to
  return {
    at: { wellId, ring, sector },
    facing: step.from.facing,
    fuel: Math.min(MAX_REACTION_MASS, ship.fuel - step.massCost),
  }
}

/** The route without its first step, from where the ship now is, its totals recounted. */
export function remainingRoute(route: MovementPlan, ship: Ship): MovementPlan {
  const steps = route.steps.slice(1)
  return {
    ...route,
    origin: { ...ship.at, facing: ship.facing },
    steps,
    totalTurns: steps.length,
    totalMassCost: steps.reduce((sum, step) => sum + step.massCost, 0),
    crossesWells: steps.some(step => step.actionType === 'well_transfer'),
  }
}

/** Every station one round on: they all step together, so they stay on the station clock. */
export const advanceStations = (stations: Station[]): Station[] =>
  stations.map(station => ({ ...station, sector: wrapSector(station.sector + STATION_DRIFT) }))

/** The route's first step done: `route` is the one on screen, kept or fresh. */
export function markDone(trip: Trip, route: MovementPlan): Trip {
  const [step] = route.steps
  if (!step) return trip
  const stepped = afterStep(trip.ship, step)
  const stations = advanceStations(trip.stations)
  const berth = trip.stations.findIndex(s => samePosition(stationPosition(s), stepped.at))
  const ship = berth < 0 ? stepped : { ...stepped, at: stationPosition(stations[berth]) }
  const rest = remainingRoute(route, ship)
  const before: Before = { ship: trip.ship, stations: trip.stations, kept: trip.kept }
  return {
    ship,
    stations,
    kept: berth >= 0 && rest.steps.length > 0 ? null : rest,
    history: [...trip.history, before].slice(-HISTORY),
  }
}

/** Back to the table before the last Done. */
export function undoDone(trip: Trip): Trip {
  const before = trip.history[trip.history.length - 1]
  if (!before) return trip
  return { ...before, history: trip.history.slice(0, -1) }
}

/** An input changed by hand: the kept route and its history go, and the tool plans afresh. */
export function edit(trip: Trip, change: Partial<Pick<Trip, 'ship' | 'stations'>> = {}): Trip {
  return { ...trip, ...change, kept: null, history: [] }
}

/** Every step of the kept route is done. */
export const hasArrived = (trip: Trip): boolean =>
  trip.kept !== null && trip.kept.steps.length === 0
