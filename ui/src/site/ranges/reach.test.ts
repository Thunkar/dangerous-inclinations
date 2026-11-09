import { describe, expect, it } from 'vitest'
import { isOneSided, reach, recoils, type RangeCardType } from './reach'

const cellsOf = (type: RangeCardType) =>
  reach(type)
    .filter(c => c.wellwide !== true || c.steps !== undefined)
    .map(c => `${c.port},${c.ahead}`)
    .sort()

describe('range cards', () => {
  it.each<[RangeCardType, boolean, boolean]>([
    // type, one-sided, recoil
    ['railgun', false, true],
    ['laser', true, false],
    ['plasma_cannon', true, false],
    ['ballistic_rack', false, false],
    ['disruptor', false, false],
    ['missiles', false, false],
    ['sensor_array', false, false],
  ])('%s: one-sided %s, recoil %s', (type, oneSided, recoil) => {
    expect(isOneSided(type)).toBe(oneSided)
    expect(recoils(type)).toBe(recoil)
  })

  it('draws the railgun along its own ring, five ahead', () => {
    expect(cellsOf('railgun')).toEqual(['0,1', '0,2', '0,3', '0,4', '0,5'])
  })

  it('fires a port laser outward and a starboard one inward, never along its ring', () => {
    const cells = reach('laser')
    expect(cells.every(c => c.port !== 0)).toBe(true)
    expect(cells.filter(c => c.port > 0).every(c => c.zone === 'port')).toBe(true)
    expect(cells.filter(c => c.port < 0).every(c => c.zone === 'starboard')).toBe(true)
  })

  it("counts a missile's first flight in steps, ring and sector alike", () => {
    const steps = reach('missiles').filter(c => c.steps !== undefined)
    expect(steps.every(c => c.steps === Math.abs(c.port) + Math.abs(c.ahead))).toBe(true)
    expect(Math.max(...steps.map(c => c.steps!))).toBe(3)
  })
})
