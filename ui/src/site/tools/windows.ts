/**
 * The orbital windows, worked out from the engine: where the stations can be,
 * and how many turns a trip takes for every reading of the station clock.
 *
 * The map is symmetric: every planet has the same rings and the same two lane
 * arcs, and the circuit's three legs are one leg turned round. So one planet
 * and one leg are planned, and what they say holds for all three. Planning is
 * the game's own route planner (`planMovementToTarget`), run after first paint
 * (see `useWindowTables`), because two dozen searches are a noticeable pause.
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
  planMovementToTarget,
  stationSectors,
  stationTarget,
} from '@dangerous-inclinations/engine'
import type { OrbitalPosition } from '@dangerous-inclinations/engine'

const PLANET_IDS = PLANETS.map(planet => planet.id)

export const planetName = (id: string) => PLANETS.find(planet => planet.id === id)?.name ?? id

/**
 * The station clock: every sector a station can stand on, in the order it
 * reaches them. All three start together and step together, so one list is
 * every station.
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
      { row: 'leg', index, run: () => turnsTo(moored, delivery, sector, false, 0) }
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

/** "0", "0 or 4", "4, 8 or 20" (or "and"). */
export function either(values: Array<number | string>, word = 'or'): string {
  if (values.length < 2) return values.join('')
  return `${values.slice(0, -1).join(', ')} ${word} ${values[values.length - 1]}`
}

/** "5" or "4–6". */
export const span = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`)
