/**
 * The orbital windows are the engine's route planner run against stations
 * three sectors long: a trip docks on whichever of a station's sectors it
 * reaches first, and a trip from a station starts on whichever sector the
 * ship is moored on. The tables are pinned, so a rule change that moves a
 * window shows up here, and the reading of them (the best clock, a range) is
 * checked on rows made by hand.
 */
import { describe, expect, it } from 'vitest'
import { DOCKING_REACH, SECTORS_PER_RING, inDockingReach } from '@dangerous-inclinations/engine'
import type { Cell, Row } from './windows'
import { CLOCK, bestClocks, berths, cellText, highest, lowest, windowTables } from './windows'

const one = (turns: number): Cell => ({ low: turns, high: turns })
const range = (low: number, high: number): Cell => ({ low, high })

describe('berths', () => {
  it.each([
    [0, [0, 1, 23]],
    [4, [3, 4, 5]],
    [20, [19, 20, 21]],
    [23, [0, 22, 23]],
  ])('a station centred on %i covers %j', (centre, sectors) => {
    const covered = berths('planet-alpha', centre)
    expect(covered.map(b => b.sector).sort((a, b) => a - b)).toEqual(sectors)
    expect(covered).toHaveLength(2 * DOCKING_REACH + 1)
  })

  it.each(CLOCK)('every sector the engine docks on, and no other, at clock %i', centre => {
    const station = { wellId: 'planet-alpha', ring: 2, sector: centre }
    const docks = Array.from({ length: SECTORS_PER_RING }, (_, sector) => sector).filter(sector =>
      inDockingReach(station, { ...station, sector })
    )
    expect(
      berths('planet-alpha', centre)
        .map(b => b.sector)
        .sort((a, b) => a - b)
    ).toEqual(docks)
  })
})

describe('windowTables', () => {
  const tables = windowTables()

  // Clock reading, then turns: from the lane mouth, the same arriving with a
  // Tanker's fuel without and with a compressor, and the circuit leg from
  // the fastest and the slowest of the pickup station's three sectors.
  it.each([
    [0, 2, 2, 2, 8, 8],
    [4, 2, 4, 2, 7, 7],
    [8, 4, 4, 4, 9, 10],
    [12, 4, 5, 4, 8, 9],
    [16, 4, 5, 4, 7, 9],
    [20, 3, 4, 3, 9, 9],
  ])(
    'on clock %i: approach %i, tanker %i, compressed %i, leg %i to %i',
    (clock, approach, tanker, compressed, legLow, legHigh) => {
      const i = CLOCK.indexOf(clock)
      expect(tables.approach[i]).toEqual(one(approach))
      expect(tables.tanker[i]).toEqual(one(tanker))
      expect(tables.tankerCompressed[i]).toEqual(one(compressed))
      expect(tables.leg[i]).toEqual(range(legLow, legHigh))
    }
  )

  it.each([
    ['approach', [0, 4]],
    ['tanker', [0]],
    ['tankerCompressed', [0, 4]],
    ['leg', [4]],
  ] as const)('%s is quickest on %j', (row, best) => {
    expect(bestClocks(tables[row])).toEqual(best)
  })
})

describe('reading a row', () => {
  const row = (...cells: Cell[]): Row => cells

  it.each([
    ['the lowest', row(one(5), one(3), one(4), one(6), one(5), one(4)), [4]],
    ['every tie', row(one(3), one(3), one(4), one(6), one(5), one(3)), [0, 4, 20]],
    [
      'the quickest worst case among ties',
      row(range(3, 5), range(3, 3), one(4), one(6), range(3, 4), one(5)),
      [4],
    ],
    ['past a missing route', row(null, one(4), null, one(4), one(5), one(6)), [4, 12]],
  ])('the best clock is %s', (_, cells, best) => {
    expect(bestClocks(cells)).toEqual(best)
  })

  it.each([
    [row(range(7, 9), one(6), null, range(8, 12), one(7), one(9)), 6, 12],
    [row(one(2), one(2), one(2), one(2), one(2), one(2)), 2, 2],
  ])('lowest and highest of %j', (cells, low, high) => {
    expect(lowest(cells)).toBe(low)
    expect(highest(cells)).toBe(high)
  })

  it.each([
    [one(5), '5'],
    [range(7, 9), '7–9'],
    [null, '–'],
  ])('cell %j prints as %s', (cell, text) => {
    expect(cellText(cell)).toBe(text)
  })
})
