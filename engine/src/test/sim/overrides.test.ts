/**
 * The simulator's tile, hull and bot channels: what `--tiles=`, `--loadouts=`,
 * `--seats=`, `--hands=` and `--bot=` parse to, and what they refuse. One row
 * per shape a parser reads or refuses.
 */
import { describe, it, expect } from 'vitest'
import { SUBSYSTEM_CONFIGS, damagingWeaponTypes } from '../../models/subsystems.ts'
import { missionRequirements } from '../../models/missions.ts'
import { landsOnLaunch } from '../../game/missiles.ts'
import {
  applyTileOverrides,
  describeTileOverrides,
  parseTileOverrides,
  type TileOverrides,
} from '../../sim/tileOverrides.ts'
import {
  describeLoadoutOverrides,
  describeSeatHands,
  describeSeatLoadouts,
  parseLoadoutOverrides,
  parseSeatHands,
  parseSeatLoadouts,
} from '../../sim/loadoutOverrides.ts'
import { parseBotOverrides } from '../../sim/botOverrides.ts'
import {
  describeOverrides,
  parseOverrideFlag,
  splitFlag,
  type Overrides,
} from '../../sim/overrides.ts'
import { BH, LOADOUTS } from '../testUtils.ts'

describe('parseTileOverrides', () => {
  it.each<[string, string, TileOverrides]>([
    ["a weapon's number", 'laser.damage=3', { laser: { damage: 3 } }],
    ['a weapon flag', 'laser.ignoresShields=false', { laser: { ignoresShields: false } }],
    ['a slot group', 'fuel_compressor.slotType=side', { fuel_compressor: { slotType: 'side' } }],
    ['a passive effect', 'radiator.dissipationBonus=3', { radiator: { dissipationBonus: 3 } }],
    [
      'two tiles at once',
      'ballistic_rack.damage=3,shields.maxEnergy=6',
      { ballistic_rack: { damage: 3 }, shields: { maxEnergy: 6 } },
    ],
  ])('parses %s', (_label, text, expected) => {
    expect(parseTileOverrides(text)).toEqual(expected)
    // What the pages stamp reads back as the same overrides.
    expect(parseTileOverrides(describeTileOverrides(expected))).toEqual(expected)
  })

  it.each([
    ['an unknown tile', 'phaser.damage=3'],
    ['an unknown field', 'laser.colour=3'],
    ['no field', 'laser=3'],
    ['no value', 'laser.damage'],
  ])('refuses %s', (_label, text) => {
    expect(() => parseTileOverrides(text)).toThrow()
  })

  it('reaches every firing stat any weapon carries, so no second channel is needed', () => {
    const fields = new Set(
      Object.values(SUBSYSTEM_CONFIGS).flatMap(c => Object.keys(c.weaponStats ?? {}))
    )
    expect(fields.size).toBeGreaterThan(0)
    for (const field of fields) {
      expect(() => parseTileOverrides(`laser.${field}=1`), field).not.toThrow()
    }
  })

  it('applies a firing stat to the configuration the games read', () => {
    const before = SUBSYSTEM_CONFIGS.laser.weaponStats!.damage
    try {
      applyTileOverrides(parseTileOverrides(`laser.damage=${before + 1}`))
      expect(SUBSYSTEM_CONFIGS.laser.weaponStats!.damage).toBe(before + 1)
    } finally {
      SUBSYSTEM_CONFIGS.laser.weaponStats!.damage = before
    }
  })
})

// The games read the configuration when they play, not when a module loads:
// the override is applied after every module of the run is imported.
describe('a tile override reaches the rules that read the configuration', () => {
  /** Apply one override, run `check`, and put the configuration back. */
  function under(text: string, check: () => void) {
    const before = structuredClone(SUBSYSTEM_CONFIGS)
    try {
      applyTileOverrides(parseTileOverrides(text))
      check()
    } finally {
      // In place: a module holding one config object keeps holding it.
      for (const type of Object.keys(before) as Array<keyof typeof SUBSYSTEM_CONFIGS>) {
        const { weaponStats, passiveEffect, ...rest } = before[type]
        const config = SUBSYSTEM_CONFIGS[type]
        Object.assign(config, rest)
        if (weaponStats) Object.assign(config.weaponStats!, weaponStats)
        if (passiveEffect) Object.assign(config.passiveEffect!, passiveEffect)
      }
    }
  }
  const from = { wellId: BH, ring: 3, sector: 0 }
  const fourAway = { wellId: BH, ring: 3, sector: 4 }

  it('a missile flies as many steps as missiles.stepsPerMove says', () => {
    const steps = SUBSYSTEM_CONFIGS.missiles.weaponStats!.stepsPerMove!
    expect(landsOnLaunch(from, fourAway)).toBe(steps >= 4)
    under(`missiles.stepsPerMove=4`, () => expect(landsOnLaunch(from, fourAway)).toBe(true))
    under(`missiles.stepsPerMove=1`, () => expect(landsOnLaunch(from, fourAway)).toBe(false))
  })

  it('a weapon whose damage goes to 0 stops counting for a Destroy card', () => {
    const weapon = () => missionRequirements('destroy_ship')[0].anyOf
    expect(weapon()).toContain('laser')
    under('laser.damage=0', () => {
      expect(damagingWeaponTypes()).not.toContain('laser')
      expect(weapon()).not.toContain('laser')
    })
  })
})

const HUNTER = 'railgun/laser,ballistic_rack,shields,radiator'
const HAULER = 'fuel_compressor/shields,shields,radiator,laser'
describe('parseLoadoutOverrides', () => {
  it.each([
    [
      'two presets, ; between',
      `gunship=${HUNTER};freighter=${HAULER}`,
      { gunship: LOADOUTS.hunter, freighter: LOADOUTS.hauler },
    ],
  ])('parses %s', (_label, text, expected) => {
    expect(parseLoadoutOverrides(text)).toEqual(expected)
    expect(parseLoadoutOverrides(describeLoadoutOverrides(parseLoadoutOverrides(text)))).toEqual(
      expected
    )
  })

  it.each([
    // Retired presets and role names land here too.
    ['an unknown preset', `gunboat=${HUNTER}`],
    ['no preset', HUNTER],
    ['three side tiles', 'gunship=railgun/laser,shields,radiator'],
    ['no forward tile', 'gunship=/laser,ballistic_rack,shields,radiator'],
  ])('refuses %s', (_label, text) => {
    expect(() => parseLoadoutOverrides(text)).toThrow()
  })
})

describe('parseSeatLoadouts', () => {
  it.each([
    [
      'two seats',
      `bot-1=${HUNTER};bot-3=${HAULER}`,
      { 'bot-1': LOADOUTS.hunter, 'bot-3': LOADOUTS.hauler },
    ],
  ])('parses %s', (_label, text, expected) => {
    expect(parseSeatLoadouts(text)).toEqual(expected)
    expect(parseSeatLoadouts(describeSeatLoadouts(parseSeatLoadouts(text)))).toEqual(expected)
  })

  // The hull is read by the same parser as `--loadouts=`, which refuses bad hulls above.
  it('refuses a hull with no seat', () => {
    expect(() => parseSeatLoadouts(HUNTER)).toThrow()
  })
})

describe('parseSeatHands', () => {
  it.each([
    ["a card's own type", 'bot-2=intercept_transmission', { 'bot-2': 'intercept_transmission' }],
    [
      'two seats by short name',
      'bot-1=deliver,bot-3=intercept',
      { 'bot-1': 'deliver_cargo', 'bot-3': 'intercept_transmission' },
    ],
  ])('parses %s', (_label, text, expected) => {
    expect(parseSeatHands(text)).toEqual(expected)
    expect(parseSeatHands(describeSeatHands(parseSeatHands(text)))).toEqual(expected)
  })

  it.each([
    ['a secondary', 'bot-1=survey'],
    ['no card', 'bot-1'],
    ['no seat', '=destroy'],
  ])('refuses %s: only a primary is dealt', (_label, text) => {
    expect(() => parseSeatHands(text)).toThrow()
  })
})

describe('parseBotOverrides', () => {
  it.each([
    [
      'targetPreference=closest,aggressiveness=0.8',
      { targetPreference: 'closest', aggressiveness: 0.8 },
    ],
    ['conserveAmmo=true', { conserveAmmo: true }],
  ])('reads %s', (text, expected) => {
    expect(parseBotOverrides(text)).toEqual(expected)
  })

  it.each([
    ['targetPreferenc=weakest'], // an unknown parameter
    ['targetPreference=bravest'], // not one of the parameter's words
    ['aggressiveness=lots'], // not a number
    ['conserveAmmo=yes'], // not a boolean
    ['targetPreference'], // no value at all
  ])('refuses %s', text => {
    expect(() => parseBotOverrides(text)).toThrow()
  })
})

// One parser behind `yarn sim`, `yarn bench` and `yarn balance`.
describe('parseOverrideFlag', () => {
  it.each<[string, Overrides]>([
    ['--tiles=laser.damage=3', { tiles: { laser: { damage: 3 } } }],
    ['--rules=pointsToWin=4', { rules: { pointsToWin: 4 } }],
    ['--bot=aggressiveness=0.8', { bot: { aggressiveness: 0.8 } }],
    [`--loadouts=gunship=${HUNTER}`, { loadouts: { gunship: LOADOUTS.hunter } }],
  ])('reads %s into its channel, and stamps it back', (raw, expected) => {
    const { key, value } = splitFlag(raw)!
    const into: Overrides = {}
    expect(parseOverrideFlag(key, value, into)).toBe(true)
    expect(into).toEqual(expected)
    expect(describeOverrides(into).map(([flag, text]) => `--${flag}=${text}`)).toEqual([raw])
  })

  it.each([['--games=10'], ['--quick'], ['--missionsToWin=4']])('leaves %s to the command', raw => {
    const { key, value } = splitFlag(raw)!
    const into: Overrides = {}
    expect(parseOverrideFlag(key, value, into)).toBe(false)
    expect(into).toEqual({})
  })

  it('refuses the retired rule name', () => {
    expect(() => parseOverrideFlag('rules', 'missionsToWin=4', {})).toThrow()
  })
})
