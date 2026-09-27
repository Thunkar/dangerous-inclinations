/**
 * The orbital windows, worked out from the engine: where the stations can be,
 * which lanes ring the black hole, and how many turns a trip takes for every
 * reading of the station clock.
 *
 * The map is symmetric: every planet has the same rings and the same two lane
 * arcs, and the circuit's three legs are one leg turned round. So one planet
 * and one leg are planned, and what they say holds for all three. Planning is
 * the game's own route planner (`planMovementToTarget`), run after first paint
 * (see `useWindowTables`), because thirty searches are a noticeable pause.
 */
import { useEffect, useState } from 'react'
import {
  BLACK_HOLE_OUTER_RING,
  MAX_REACTION_MASS,
  PLANETS,
  SECTORS_PER_RING,
  STATION_INITIAL_SECTOR,
  STATION_RING,
  TANKER_FUEL,
  TRANSFER_LANES,
  circuitRoutes,
  planMovementToTarget,
  stationTarget,
  wrapSector,
} from '@dangerous-inclinations/engine'
import type { OrbitalPosition } from '@dangerous-inclinations/engine'
import { STATION_DRIFT } from '../turn'

export type Lane = (typeof TRANSFER_LANES)[number]

const PLANET_IDS = PLANETS.map(planet => planet.id)

export const planetName = (id: string) => PLANETS.find(planet => planet.id === id)?.name ?? id

/**
 * The station clock: every sector a station can stand on, in the order it
 * reaches them. All three start together and step together, so one list is
 * every station.
 */
export const CLOCK: number[] = (() => {
  const seen: number[] = []
  let sector = STATION_INITIAL_SECTOR
  while (!seen.includes(sector)) {
    seen.push(sector)
    sector = wrapSector(sector + STATION_DRIFT)
  }
  return seen
})()

/** Black hole ring 5, all lanes, clockwise from sector 0. */
export const RING_LANES: Lane[] = TRANSFER_LANES.filter(
  lane => lane.blackHoleArc.ring === BLACK_HOLE_OUTER_RING
).sort((a, b) => a.blackHoleArc.startSector - b.blackHoleArc.startSector)

/** The lanes out to each planet: where you jump from, and the lane mouth. */
export const OUTBOUND = RING_LANES.filter(lane => lane.direction === 'outbound')

/** The Deliver routes, as the deck prints them. */
export const CIRCUIT = circuitRoutes(PLANET_IDS)

/** The planets in circuit order, each route's delivery the next one's pickup. */
export const CIRCUIT_ORDER: string[] = (() => {
  const order = [CIRCUIT[0][0]]
  for (;;) {
    const next = CIRCUIT.find(([from]) => from === order[order.length - 1])?.[1]
    if (!next || order.includes(next)) return order
    order.push(next)
  }
})()

/** The planet every figure and table is worked on (the others are the same). */
const SAMPLE = PLANET_IDS[0]
const SAMPLE_OUT = TRANSFER_LANES.find(l => l.planetId === SAMPLE && l.direction === 'outbound')!
const SAMPLE_IN = TRANSFER_LANES.find(l => l.planetId === SAMPLE && l.direction === 'inbound')!

/** On a planet: the ring-4 arc you arrive on from the black hole, and the one you leave from. */
export const PLANET_ARRIVE = SAMPLE_OUT.planetArc
export const PLANET_LEAVE = SAMPLE_IN.planetArc

/** Turns to each station reading, in `CLOCK` order; null where no route fits. */
export type Row = Array<number | null>

export interface WindowTables {
  /** From the lane mouth to docked. */
  approach: Row
  /** The same, docking with a Tanker's fuel aboard. */
  tanker: Row
  tankerCompressed: Row
  /** From moored at the pickup station to docked at the next one round the circuit. */
  leg: Row
  legCompressed: Row
}

type Job = { row: keyof WindowTables; index: number; run: () => number | null }

/** The fewest turns from `origin` to the planet's station, standing on `sector` now. */
function turnsTo(
  origin: OrbitalPosition,
  planetId: string,
  sector: number,
  compressor: boolean,
  arrivalMass: number
): number | null {
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
    const moored: OrbitalPosition = { wellId: pickup, ring: STATION_RING, sector }
    out.push(
      { row: 'approach', index, run: () => turnsTo(mouth, SAMPLE, sector, false, 0) },
      { row: 'tanker', index, run: () => turnsTo(mouth, SAMPLE, sector, false, TANKER_FUEL) },
      {
        row: 'tankerCompressed',
        index,
        run: () => turnsTo(mouth, SAMPLE, sector, true, TANKER_FUEL),
      },
      { row: 'leg', index, run: () => turnsTo(moored, delivery, sector, false, 0) },
      { row: 'legCompressed', index, run: () => turnsTo(moored, delivery, sector, true, 0) }
    )
  })
  return out
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
    const blank = (): Row => CLOCK.map(() => null)
    const work: WindowTables = {
      approach: blank(),
      tanker: blank(),
      tankerCompressed: blank(),
      leg: blank(),
      legCompressed: blank(),
    }
    const queue = jobs()
    const idle = typeof window.requestIdleCallback === 'function'
    let handle = 0
    const schedule = () => {
      handle = idle ? window.requestIdleCallback(step) : window.setTimeout(step, 0)
    }
    function step() {
      const job = queue.shift()
      if (job) {
        work[job.row][job.index] = job.run()
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

/** The clock readings a row is quickest on (all of them, when it ties). */
export function bestClocks(row: Row): number[] {
  const values = row.filter((v): v is number => v !== null)
  const low = Math.min(...values)
  return CLOCK.filter((_, i) => row[i] === low)
}

export const lowest = (row: Row) => Math.min(...row.filter((v): v is number => v !== null))
export const highest = (row: Row) => Math.max(...row.filter((v): v is number => v !== null))

/** The turns a row gives on one clock reading. */
export const at = (row: Row, clock: number) => row[CLOCK.indexOf(clock)]

/** The reading one round after `clock`. */
export const nextClock = (clock: number) => CLOCK[(CLOCK.indexOf(clock) + 1) % CLOCK.length]

/** "0", "0 or 4", "4, 8 or 20" (or "and"). */
export function either(values: Array<number | string>, word = 'or'): string {
  if (values.length < 2) return values.join('')
  return `${values.slice(0, -1).join(', ')} ${word} ${values[values.length - 1]}`
}

/** "5" or "4–6". */
export const span = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`)
