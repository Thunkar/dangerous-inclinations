import { describe, it, expect } from 'vitest'
import { STATION_RING } from '../../models/gravityWells.ts'
import type { Position, ShipLoadout } from '../../models/game.ts'
import { validateLoadout } from '../../game/loadout.ts'
import { foldFuel } from '../../game/fold.ts'
import { getStationForPlanet, stationPosition } from '../../game/stations.ts'
import {
  ALPHA,
  BETA,
  BH,
  GAMMA,
  LOADOUTS,
  burn,
  crateOf,
  deliverMission,
  eventsOf,
  executeTurnAs,
  expectRefusedUnless,
  fire,
  fold,
  getPlayer,
  getShip,
  getSub,
  makeTwoPlayerGame,
  scan,
  withPlayer,
  withShip,
  withSub,
} from '../testUtils.ts'

/** The drive's slot in `LOADOUTS.jumpDrive`. */
const DRIVE = 'side-2'

/** p1 flies the jump drive from `from` (black hole R3 S0); p2 is far away. */
const drive = (from: Partial<Position> = {}) =>
  makeTwoPlayerGame(
    { ring: 3, sector: 0, ...from, loadout: LOADOUTS.jumpDrive },
    { ring: 5, sector: 12 }
  )

const alphaRing3: Position = { wellId: ALPHA, ring: 3, sector: 10 }

describe('jump drive: a fold', () => {
  it('puts the ship where it names, with no drift, for its fuel', () => {
    const before = drive()
    const result = executeTurnAs(before, fold(1, alphaRing3))
    expect(result.errors).toBeUndefined()
    const ship = getShip(result.gameState, 'p1')
    expect(ship).toMatchObject(alphaRing3)
    expect(ship.facing).toBe(getShip(before, 'p1').facing)
    expect(ship.reactionMass).toBe(getShip(before, 'p1').reactionMass - foldFuel())
    expect(getSub(result.gameState, 'p1', DRIVE)).toMatchObject({
      isBroken: false,
      isRevealed: true,
      allocatedEnergy: 3,
    })
    expect(eventsOf(result.events, 'folded')[0]).toMatchObject({
      playerId: 'p1',
      to: alphaRing3,
      massSpent: foldFuel(),
      heat: 6,
    })
    expect(getSub(result.gameState, 'p1', 'engines')).toMatchObject({ allocatedEnergy: 3 })
  })

  it('puts 3 energy on the drive and 3 on the engines, heat at the check like any', () => {
    const result = executeTurnAs(drive(), fold(1, alphaRing3))
    expect(eventsOf(result.events, 'subsystem_broken')).toHaveLength(0)
    expect(eventsOf(result.events, 'heat_check')[0]).toMatchObject({ heat: 6, cubes: 6 })
  })

  it.each<[string, Position, Position]>([
    [
      'within the black hole',
      { wellId: BH, ring: 3, sector: 0 },
      { wellId: BH, ring: 1, sector: 7 },
    ],
    [
      'within a planet',
      { wellId: ALPHA, ring: 4, sector: 0 },
      { wellId: ALPHA, ring: 1, sector: 9 },
    ],
    [
      'black hole to a planet',
      { wellId: BH, ring: 3, sector: 0 },
      { wellId: GAMMA, ring: 3, sector: 5 },
    ],
    [
      'planet to the black hole',
      { wellId: ALPHA, ring: 4, sector: 0 },
      { wellId: BH, ring: 2, sector: 5 },
    ],
  ])('reaches %s', (_label, from, to) => {
    const result = executeTurnAs(drive(from), fold(1, to))
    expect(result.errors).toBeUndefined()
    expect(getShip(result.gameState, 'p1')).toMatchObject(to)
  })

  it('never goes from one planet to another', () => {
    const atAlpha = drive({ wellId: ALPHA, ring: 4, sector: 0 })
    expectRefusedUnless(
      executeTurnAs(atAlpha, fold(1, { wellId: BETA, ring: 3, sector: 5 })),
      executeTurnAs(atAlpha, fold(1, { wellId: BH, ring: 3, sector: 5 }))
    )
  })

  it('is the turn move: no second move', () => {
    expectRefusedUnless(
      executeTurnAs(drive(), burn(1, 'soft'), fold(2, alphaRing3)),
      executeTurnAs(drive(), fold(1, alphaRing3))
    )
  })

  it('is a move like any: a laser fired after it fires from where it lands', () => {
    const state = makeTwoPlayerGame(
      { ring: 3, sector: 0, loadout: LOADOUTS.jumpDrive },
      { wellId: ALPHA, ring: 4, sector: 10 }
    )
    // From the black hole the port laser cannot reach Alpha; one ring in from p2, it bears.
    const after = executeTurnAs(state, fold(1, alphaRing3), fire(2, 'side-0', 'p2'))
    expectRefusedUnless(executeTurnAs(state, fire(1, 'side-0', 'p2'), fold(2, alphaRing3)), after)
    // The default dice are a plain hit: the laser's 2 damage lands.
    expect(eventsOf(after.events, 'weapon_fired')[0]).toMatchObject({ targetId: 'p2' })
    expect(getShip(after.gameState, 'p2').hitPoints).toBe(getShip(state, 'p2').hitPoints - 2)
  })

  it('is a move like any: a scan after it scans from where it lands', () => {
    const prey: Position = { wellId: ALPHA, ring: 3, sector: 12 }
    const state = makeTwoPlayerGame({ ring: 3, sector: 0, loadout: LOADOUTS.sensorJumpDrive }, prey)
    // A scan reaches the scanner's own sector, so land on p2's.
    const after = executeTurnAs(state, fold(1, prey), scan(2, 'p2'))
    expectRefusedUnless(executeTurnAs(state, scan(1, 'p2'), fold(2, prey)), after)
    expect(eventsOf(after.events, 'scanned')[0]).toMatchObject({ scannerId: 'p1', targetId: 'p2' })
  })

  // The station spans its centre and a sector either side: two sectors off is open water.
  it.each([
    ["the station's centre", 0],
    ['a sector past the centre', 1],
    ['a sector short of it', 23],
  ])('is refused onto a station: %s', (_label, offset) => {
    const state = drive()
    const station = stationPosition(getStationForPlanet(state.stations, ALPHA)!)
    expect(station.ring).toBe(STATION_RING)
    expectRefusedUnless(
      executeTurnAs(state, fold(1, { ...station, sector: (station.sector + offset) % 24 })),
      executeTurnAs(state, fold(1, { ...station, sector: (station.sector + 2) % 24 }))
    )
  })

  it.each<[string, Position]>([
    ['a ring the well does not have', { wellId: ALPHA, ring: 5, sector: 0 }],
    ['a sector off the ring', { wellId: BH, ring: 3, sector: 24 }],
    ['where the ship already is', { wellId: BH, ring: 3, sector: 0 }],
  ])('is refused onto %s', (_label, to) => {
    expectRefusedUnless(
      executeTurnAs(drive(), fold(1, to)),
      executeTurnAs(drive(), fold(1, alphaRing3))
    )
  })

  it('needs the fuel', () => {
    const dry = withShip(drive(), 'p1', { reactionMass: foldFuel() - 1 })
    const fuelled = withShip(drive(), 'p1', { reactionMass: foldFuel() })
    expectRefusedUnless(
      executeTurnAs(dry, fold(1, alphaRing3)),
      executeTurnAs(fuelled, fold(1, alphaRing3))
    )
  })

  it('carries the hold', () => {
    const card = deliverMission(ALPHA, GAMMA, 'deliver-p1')
    const crate = crateOf(card)
    const loaded = withPlayer(drive(), 'p1', { cargo: [crate] })
    const result = executeTurnAs(loaded, fold(1, { wellId: GAMMA, ring: 3, sector: 5 }))
    expect(result.errors).toBeUndefined()
    expect(getPlayer(result.gameState, 'p1').cargo).toEqual([crate])
  })

  it('needs a drive aboard, and unbroken', () => {
    const none = makeTwoPlayerGame({ ring: 3, sector: 0 }, { ring: 5, sector: 12 })
    expectRefusedUnless(
      executeTurnAs(none, fold(1, alphaRing3)),
      executeTurnAs(drive(), fold(1, alphaRing3))
    )
    // A critical breaks a jump drive as it breaks anything.
    const broken = withSub(drive(), 'p1', DRIVE, { isBroken: true })
    expectRefusedUnless(
      executeTurnAs(broken, fold(1, alphaRing3)),
      executeTurnAs(drive(), fold(1, alphaRing3))
    )
  })

  it("folds again on the owner's next turn, with the fuel", () => {
    const after = executeTurnAs(drive(), fold(1, alphaRing3)).gameState
    const next = { ...after, activePlayerIndex: 0 }
    const onward: Position = { wellId: ALPHA, ring: 1, sector: 4 }
    const refuelled = withShip(next, 'p1', { reactionMass: foldFuel() })
    const again = executeTurnAs(refuelled, fold(1, onward))
    expect(again.errors).toBeUndefined()
    expect(getShip(again.gameState, 'p1')).toMatchObject(onward)
    // Without the fuel for a second fold, it is refused.
    const dry = withShip(next, 'p1', { reactionMass: foldFuel() - 1 })
    expect(executeTurnAs(dry, fold(1, onward)).errors).toBeDefined()
  })
})

describe('jump drive: the loadout', () => {
  const loadout = (
    bow: ShipLoadout['forwardSlots'][number],
    side0: ShipLoadout['sideSlots'][number]
  ): ShipLoadout => ({
    forwardSlots: [bow],
    sideSlots: [side0, 'laser', 'shields', 'radiator'],
  })
  it('fits the bow or a side slot', () => {
    expect(validateLoadout(loadout('jump_drive', 'laser')).valid).toBe(true)
    expect(validateLoadout(loadout('railgun', 'jump_drive')).valid).toBe(true)
  })
})
