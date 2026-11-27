/**
 * The orbital windows, worked out from the engine: where the stations can be,
 * and how many turns a trip takes for every reading of the station clock.
 *
 * The map is symmetric: every planet has the same rings and the same two lane
 * arcs, and the circuit's three legs are one leg turned round. So one planet
 * and one leg are planned, and what they say holds for all three. Planning is
 * the game's own route planner (`planMovementToTarget`), run after first paint
 * (see `useWindowTables`), because three dozen searches are a noticeable pause.
 */
import { useEffect, useState } from 'react'
import {
  MAX_REACTION_MASS,
  PLANETS,
  SECTORS_PER_RING,
  STATION_RING,
  TANKER_FUEL,
  TRANSFER_LANES,
  circuitRoutes,
  dockingAvoidance,
  inDockingReach,
  planMovementToTarget,
  stationSectors,
  stationTarget,
} from '@dangerous-inclinations/engine'
import type { OrbitalPosition } from '@dangerous-inclinations/engine'

const PLANET_IDS = PLANETS.map(planet => planet.id)

export const planetName = (id: string) => PLANETS.find(planet => planet.id === id)?.name ?? id

/**
 * The station clock: every sector a station's centre can stand on, in the
 * order it reaches them. All three start together and step together, so one
 * list is every station. A station also spans the sectors either side of its
 * centre (`berths`).
 */
export const CLOCK: number[] = stationSectors()

/** The Deliver routes, as the deck prints them. */
export const CIRCUIT = circuitRoutes(PLANET_IDS)

/** The planet every figure and table is worked on (the others are the same). */
const SAMPLE = PLANET_IDS[0]
const SAMPLE_OUT = TRANSFER_LANES.find(l => l.planetId === SAMPLE && l.direction === 'outbound')!
const SAMPLE_IN = TRANSFER_LANES.find(l => l.planetId === SAMPLE && l.direction === 'inbound')!

/** On a planet: the ring-4 arc you arrive on from the black hole, and the one you leave from. */
export const PLANET_ARRIVE = SAMPLE_OUT.planetArc
export const PLANET_LEAVE = SAMPLE_IN.planetArc

/**
 * Turns on one clock reading: the fewest and the most over the sectors the
 * trip may start from (a moored ship may be on any of its station's), or
 * null where no route fits.
 */
export type Cell = { low: number; high: number } | null

/** One cell for each station reading, in `CLOCK` order. */
export type Row = Cell[]

export interface WindowTables {
  /** From the lane mouth to docked. */
  approach: Row
  /** The same, docking with a Tanker's fuel aboard. */
  tanker: Row
  tankerCompressed: Row
  /** From moored at the pickup station, on any of its sectors, to docked at the next one round the circuit. */
  leg: Row
}

type Job = { row: keyof WindowTables; index: number; run: () => number | null }

/**
 * Every sector of a station centred on `centre`: its docking reach, where a
 * ship that arrives docks and then rides.
 */
export function berths(wellId: string, centre: number): OrbitalPosition[] {
  const station = { wellId, ring: STATION_RING, sector: centre }
  return Array.from({ length: SECTORS_PER_RING }, (_, sector) => ({ ...station, sector })).filter(
    at => inDockingReach(station, at)
  )
}

/** The fewest turns from `origin` to the planet's station, centred on `sector` now. */
function turnsTo(
  origin: OrbitalPosition,
  planetId: string,
  sector: number,
  compressor: boolean,
  arrivalMass: number
): number | null {
  // Every station is centred on the same sector, and a turn ending on any of
  // a station's sectors docks there: the route stops on one only to arrive.
  const stations = PLANETS.map(planet => ({
    id: `station-${planet.id}`,
    planetId: planet.id,
    ring: STATION_RING,
    sector,
  }))
  // The planner seeds both facings itself: rotating before the first move is free.
  const plan = planMovementToTarget(
    { ...origin, facing: 'prograde' },
    stationTarget({ planetId, ring: STATION_RING, sector }),
    {
      mode: 'fastest',
      availableMass: MAX_REACTION_MASS,
      maxFuelCapacity: MAX_REACTION_MASS,
      hasFuelScoop: true,
      hasFuelCompressor: compressor,
      maxTurns: SECTORS_PER_RING,
      arrivalMass,
      allowWellTransfers: true,
      avoid: dockingAvoidance(stations, origin),
    }
  )
  return plan ? plan.totalTurns : null
}

function jobs(): Job[] {
  const mouth: OrbitalPosition = {
    wellId: SAMPLE_OUT.blackHoleArc.wellId,
    ring: SAMPLE_OUT.blackHoleArc.ring,
    sector: SAMPLE_OUT.blackHoleArc.startSector,
  }
  const [pickup, delivery] = CIRCUIT[0]
  const out: Job[] = []
  CLOCK.forEach((sector, index) => {
    out.push(
      { row: 'approach', index, run: () => turnsTo(mouth, SAMPLE, sector, false, 0) },
      { row: 'tanker', index, run: () => turnsTo(mouth, SAMPLE, sector, false, TANKER_FUEL) },
      {
        row: 'tankerCompressed',
        index,
        run: () => turnsTo(mouth, SAMPLE, sector, true, TANKER_FUEL),
      },
      // The ship rides the station from the sector it docked on, so the leg
      // is planned from each of them.
      ...berths(pickup, sector).map(moored => ({
        row: 'leg' as const,
        index,
        run: () => turnsTo(moored, delivery, sector, false, 0),
      }))
    )
  })
  return out
}

const blank = (): WindowTables => {
  const row = (): Row => CLOCK.map(() => null)
  return { approach: row(), tanker: row(), tankerCompressed: row(), leg: row() }
}

/** One job's answer, widening its cell. */
function record(tables: WindowTables, job: Job) {
  const turns = job.run()
  if (turns === null) return
  const cell = tables[job.row][job.index]
  tables[job.row][job.index] = cell
    ? { low: Math.min(cell.low, turns), high: Math.max(cell.high, turns) }
    : { low: turns, high: turns }
}

/** Every table at once: for tests, which can wait. */
export function windowTables(): WindowTables {
  const tables = blank()
  for (const job of jobs()) record(tables, job)
  return tables
}

/** Worked out once a session: the rules do not change while the page is open. */
let cached: WindowTables | null = null

/**
 * The tables, or null until they are ready. One search per idle slice, so the
 * page paints first and never stalls while they fill.
 */
export function useWindowTables(): WindowTables | null {
  const [tables, setTables] = useState<WindowTables | null>(cached)
  useEffect(() => {
    if (cached) return
    const work = blank()
    const queue = jobs()
    const idle = typeof window.requestIdleCallback === 'function'
    let handle = 0
    const schedule = () => {
      handle = idle ? window.requestIdleCallback(step) : window.setTimeout(step, 0)
    }
    function step() {
      const job = queue.shift()
      if (job) {
        record(work, job)
        schedule()
        return
      }
      cached = work
      setTables(work)
    }
    schedule()
    return () => (idle ? window.cancelIdleCallback(handle) : window.clearTimeout(handle))
  }, [])
  return tables
}

const filled = (row: Row) => row.filter((cell): cell is NonNullable<Cell> => cell !== null)

/**
 * The clock readings a row is quickest on: the fewest turns, and of those
 * the readings whose slowest start is quickest too (all of them, when it ties).
 */
export function bestClocks(row: Row): number[] {
  const low = lowest(row)
  const high = Math.min(
    ...filled(row)
      .filter(cell => cell.low === low)
      .map(cell => cell.high)
  )
  return CLOCK.filter((_, i) => row[i]?.low === low && row[i]?.high === high)
}

export const lowest = (row: Row) => Math.min(...filled(row).map(cell => cell.low))
export const highest = (row: Row) => Math.max(...filled(row).map(cell => cell.high))

/** The turns a row gives on one clock reading. */
export const at = (row: Row, clock: number) => row[CLOCK.indexOf(clock)]

/** A cell as it is printed: "5", "7–9", or a dash where no route fits. */
export const cellText = (cell: Cell) => (cell ? span(cell.low, cell.high) : '–')

/** "0", "0 or 4", "4, 8 or 20" (or "and"). */
export function either(values: Array<number | string>, word = 'or'): string {
  if (values.length < 2) return values.join('')
  return `${values.slice(0, -1).join(', ')} ${word} ${values[values.length - 1]}`
}

/** "5" or "4–6". */
export const span = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`)
