/**
 * A route followed with Done has to end where the planner said it would: on
 * the station when the station is there, riding it from the sector it docked
 * on, on a fixed sector otherwise, with the fuel the plan counted. Each Done moves the ship and the stations one turn
 * on, so the kept route is checked against the engine's own station target
 * after every step, not only at the end.
 */
import { describe, expect, it } from 'vitest'
import type { Facing, MovementPlan, Position, Station } from '@dangerous-inclinations/engine'
import {
  MAX_REACTION_MASS,
  SECTORS_PER_RING,
  STATION_DRIFT,
  createInitialStations,
  dockingAvoidance,
  inDockingReach,
  planAlternativesToTarget,
  planMovementAlternatives,
  samePosition,
  staticTarget,
  stationPosition,
  stationSectors,
  stationTarget,
  stopsInside,
  wrapSector,
} from '@dangerous-inclinations/engine'
import { ROUTE_SEARCH_TURNS } from '../../utils/route'
import { edit, hasArrived, markDone, startTrip, undoDone, type Trip } from './routeProgress'

const options = (fuel: number) => ({
  availableMass: fuel,
  hasFuelScoop: true,
  maxFuelCapacity: MAX_REACTION_MASS,
  hasFuelCompressor: false,
  allowWellTransfers: true,
  maxTurns: ROUTE_SEARCH_TURNS,
  arrivalMass: 0,
})

const place = (p: Position): Position => ({ wellId: p.wellId, ring: p.ring, sector: p.sector })

function stationsAt(sector: number): Station[] {
  return createInitialStations().map(s => ({ ...s, sector }))
}

/** Follow `route` to its end with Done, checking the kept route after each one. */
function follow(trip: Trip, route: MovementPlan, check: (trip: Trip) => void): Trip {
  let current = trip
  let shown = route
  for (let k = 0; k < route.steps.length; k++) {
    current = markDone(current, shown)
    shown = current.kept!
    expect(shown.steps).toEqual(route.steps.slice(k + 1))
    expect(shown.totalTurns).toBe(route.steps.length - k - 1)
    expect(shown.totalMassCost).toBe(
      route.steps.slice(k + 1).reduce((sum, step) => sum + step.massCost, 0)
    )
    if (shown.steps.length > 0) {
      // The next step starts where the ship now is.
      expect(place(shown.steps[0].from)).toEqual(current.ship.at)
    }
    check(current)
  }
  return current
}

describe('following a route with Done', () => {
  it.each<[Position, Facing, number, string, number]>([
    [{ wellId: 'blackhole', ring: 3, sector: 0 }, 'prograde', 10, 'planet-alpha', 0],
    [{ wellId: 'blackhole', ring: 2, sector: 7 }, 'retrograde', 6, 'planet-beta', 12],
    [{ wellId: 'blackhole', ring: 5, sector: 19 }, 'prograde', 4, 'planet-gamma', 8],
    [{ wellId: 'planet-alpha', ring: 4, sector: 3 }, 'retrograde', 10, 'planet-alpha', 20],
  ])(
    'meets the station from %o facing %s on %i fuel (%s, clock %i)',
    (at, facing, fuel, planetId, clock) => {
      expect(stationSectors()).toContain(clock)
      const stations = stationsAt(clock)
      const station = stations.find(s => s.planetId === planetId)!
      // As the tool plans it: a route stops on a station only to arrive.
      const alternatives =
        planAlternativesToTarget({ ...at, facing }, stationTarget(station), {
          ...options(fuel),
          avoid: dockingAvoidance(stations, at),
        })?.alternatives ?? []
      expect(alternatives.length).toBeGreaterThan(0)

      for (const route of alternatives) {
        const arrival = stationTarget(station).positionAt(route.totalTurns)
        const docked = place(route.steps[route.steps.length - 1].to)
        expect(inDockingReach(arrival, docked)).toBe(true)
        // Moored on the sector it arrived on, the ship rides the station's
        // step at the round's end, keeping its place on the station.
        const berth = { ...docked, sector: wrapSector(docked.sector + STATION_DRIFT) }
        const end = follow(startTrip({ at, facing, fuel }, stations), route, trip => {
          const moved = trip.stations.find(s => s.planetId === planetId)!
          // The kept route still meets the station where the first plan met it.
          if (trip.kept!.totalTurns > 0)
            expect(stationTarget(moved).positionAt(trip.kept!.totalTurns)).toEqual(arrival)
          // Every station stays on the clock and they move together.
          expect(stationSectors()).toContain(moved.sector)
          expect(new Set(trip.stations.map(s => s.sector)).size).toBe(1)
          expect(trip.ship.fuel).toBeLessThanOrEqual(MAX_REACTION_MASS)
          expect(trip.ship.fuel).toBeGreaterThanOrEqual(0)
        })
        const moved = end.stations.find(s => s.planetId === planetId)!
        expect(hasArrived(end)).toBe(true)
        // After k Dones the station has drifted k times, and the ship is on it
        // where it docked, one drift on.
        expect(moved.sector).toBe((clock + route.totalTurns * STATION_DRIFT) % SECTORS_PER_RING)
        expect(inDockingReach(stationPosition(moved), end.ship.at)).toBe(true)
        expect(end.ship.at).toEqual(berth)
        expect(samePosition(docked, berth)).toBe(false)
        expect(end.ship.fuel).toBe(fuel - route.totalMassCost)
      }
    }
  )

  it.each<[Position, Facing, number, Position]>([
    [
      { wellId: 'blackhole', ring: 3, sector: 0 },
      'prograde',
      10,
      { wellId: 'planet-beta', ring: 3, sector: 5 },
    ],
    [
      { wellId: 'planet-gamma', ring: 1, sector: 10 },
      'retrograde',
      7,
      { wellId: 'blackhole', ring: 1, sector: 0 },
    ],
  ])('reaches the sector from %o facing %s on %i fuel', (at, facing, fuel, to) => {
    // As the tool plans it: a reverse route that would stop on a station on
    // the way is planned forward instead, stopping on one only to arrive.
    const avoid = dockingAvoidance(stationsAt(0), at)
    const fixed = planMovementAlternatives({ ...at, facing }, to, options(fuel))?.alternatives ?? []
    const alternatives = fixed.some(route => stopsInside(route, avoid))
      ? (planAlternativesToTarget({ ...at, facing }, staticTarget(to), { ...options(fuel), avoid })
          ?.alternatives ?? [])
      : fixed
    expect(alternatives.length).toBeGreaterThan(0)
    for (const route of alternatives) {
      const end = follow(startTrip({ at, facing, fuel }, stationsAt(0)), route, () => {})
      expect(hasArrived(end)).toBe(true)
      expect(samePosition(end.ship.at, to)).toBe(true)
      expect(end.ship.fuel).toBe(fuel - route.totalMassCost)
    }
  })

  it('caps a scoop at a full tank', () => {
    const route: MovementPlan = {
      origin: { wellId: 'blackhole', ring: 1, sector: 0, facing: 'prograde' },
      destination: { wellId: 'blackhole', ring: 1, sector: 6 },
      steps: [
        {
          from: { wellId: 'blackhole', ring: 1, sector: 0, facing: 'prograde' },
          to: { wellId: 'blackhole', ring: 1, sector: 6 },
          actionType: 'coast',
          sectorAdjustment: 0,
          requiresRotation: false,
          massCost: -6,
        },
      ],
      totalMassCost: -6,
      totalTurns: 1,
      crossesWells: false,
      mode: 'fastest',
    }
    const trip = markDone(
      startTrip(
        { at: route.origin, facing: 'prograde', fuel: MAX_REACTION_MASS - 2 },
        stationsAt(0)
      ),
      route
    )
    expect(trip.ship.fuel).toBe(MAX_REACTION_MASS)
  })
})

describe('undo and edits', () => {
  const at: Position = { wellId: 'blackhole', ring: 3, sector: 0 }
  const stations = stationsAt(0)
  const alpha = stations.find(s => s.planetId === 'planet-alpha')!
  const route = planAlternativesToTarget(
    { ...at, facing: 'prograde' },
    stationTarget(alpha),
    options(10)
  )!.alternatives[0]
  const start = startTrip({ at, facing: 'prograde', fuel: 10 }, stations)

  it('takes back each Done in turn', () => {
    const one = markDone(start, route)
    const two = markDone(one, one.kept!)
    expect(undoDone(two)).toEqual(one)
    expect(undoDone(undoDone(two))).toEqual(start)
    expect(undoDone(start)).toEqual(start)
  })

  it('drops the kept route and the history on an edit', () => {
    const one = markDone(start, route)
    const edited = edit(one, { ship: { ...one.ship, fuel: 3 } })
    expect(edited.kept).toBeNull()
    expect(edited.history).toEqual([])
    expect(edited.ship.fuel).toBe(3)
    expect(edited.stations).toEqual(one.stations)
  })
})
