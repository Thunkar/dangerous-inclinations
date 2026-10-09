/**
 * A slot is named for the hull of the ship it sits in: the corvette and the
 * mantis carry each flank's two mounts one ahead of the other, the shrike one
 * above the other. The fixed systems read the same on every hull.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_SHIP_APPEARANCE, HULLS, getSubsystemConfig } from '@dangerous-inclinations/engine'
import type { Hull, ShipAppearance, SubsystemId } from '@dangerous-inclinations/engine'
import { mountLabel, type MountId } from '../ships/mounts'
import { hullOf, slotLabel, slotWithSubsystem } from './slots'

describe('slot names follow the hull', () => {
  it.each<[Hull, MountId, string]>([
    ['corvette', 'forward-0', 'Forward'],
    ['corvette', 'side-0', 'Port fore'],
    ['corvette', 'side-1', 'Port aft'],
    ['corvette', 'side-2', 'Starboard fore'],
    ['corvette', 'side-3', 'Starboard aft'],
    ['mantis', 'forward-0', 'Forward'],
    ['mantis', 'side-0', 'Port fore'],
    ['mantis', 'side-1', 'Port aft'],
    ['mantis', 'side-2', 'Starboard fore'],
    ['mantis', 'side-3', 'Starboard aft'],
    ['shrike', 'forward-0', 'Forward'],
    ['shrike', 'side-0', 'Port upper'],
    ['shrike', 'side-1', 'Port lower'],
    ['shrike', 'side-2', 'Starboard upper'],
    ['shrike', 'side-3', 'Starboard lower'],
  ])('%s %s is %s', (hull, id, name) => {
    expect(mountLabel(id, hull)).toBe(name)
    expect(slotLabel(id, hull)).toBe(name)
  })

  it.each<[Hull, SubsystemId, string]>([
    ['corvette', 'side-1', 'Port aft'],
    ['shrike', 'side-1', 'Port lower'],
    ['mantis', 'side-2', 'Starboard fore'],
    ['shrike', 'side-2', 'Starboard upper'],
  ])('a %s names %s with what sits in it: %s', (hull, id, slot) => {
    expect(slotWithSubsystem(id, 'laser', hull)).toBe(
      `${slot} (${getSubsystemConfig('laser').name})`
    )
  })

  it.each<[SubsystemId]>([['engines'], ['rotation'], ['scoop']])(
    'the fixed system %s has one name on every hull',
    id => {
      const names = HULLS.map(hull => slotLabel(id, hull))
      expect(new Set(names).size).toBe(1)
    }
  )

  it('a face-down slot is the slot alone', () => {
    expect(slotWithSubsystem('side-3', null, 'shrike')).toBe('Starboard lower')
  })

  it.each<[string, { appearance?: ShipAppearance } | undefined, Hull]>([
    ['a shrike', { appearance: { ...DEFAULT_SHIP_APPEARANCE, hull: 'shrike' } }, 'shrike'],
    ['a mantis', { appearance: { ...DEFAULT_SHIP_APPEARANCE, hull: 'mantis' } }, 'mantis'],
    ['an unpainted ship', {}, 'corvette'],
    ['no ship', undefined, 'corvette'],
  ])('%s flies the %s', (_, player, hull) => {
    expect(hullOf(player)).toBe(hull)
  })
})
