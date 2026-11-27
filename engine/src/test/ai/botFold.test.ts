import { describe, it, expect } from 'vitest'
import { foldFuel } from '../../game/fold.ts'
import type { FoldAction, GameState, PlayerAction, Position } from '../../models/game.ts'
import { oppositeFacing } from '../../models/game.ts'
import { legalMoves, projectPosition } from '../../game/movement.ts'
import { wrapSector } from '../../game/geometry.ts'
import { planFold } from '../../ai/behaviors/fold.ts'
import { generateCandidates } from '../../ai/planner.ts'
import { DEFAULT_BOT_PARAMETERS } from '../../ai/types.ts'
import { executeTurn } from '../../game/turns.ts'
import { viewFor } from '../../game/view.ts'
import { getStationForPlanet } from '../../game/stations.ts'
import { botDecideActions } from '../../ai/index.ts'
import { isInWeaponRange } from '../../game/targeting.ts'
import { planStationMeetUp } from '../../ai/movementPlanner/index.ts'
import { buildTurn, type TurnIntent } from '../../agent/index.ts'
import {
  ALPHA,
  BH,
  GAMMA,
  LOADOUTS,
  coastAs,
  crateOf,
  deliverMission,
  destroyMission,
  eventsOf,
  getShip,
  makeTwoPlayerGame,
  mustExecute,
  shortOfStation,
  situationOf,
  withMissions,
  withPlayer,
  withShip,
  withSub,
} from '../testUtils.ts'

/** Where p1 starts its haul. */
const BH_START: Position = { wellId: BH, ring: 3, sector: 0 }

/** Alpha's crate for Gamma, aboard p1. */
const CARD = deliverMission(ALPHA, GAMMA, 'deliver-p1')

/**
 * p1 flies the jump drive with Alpha's crate for Gamma aboard, from `from`;
 * p2 sits where it is put, far off unless a test says otherwise.
 */
const hauling = (
  from: Position = { wellId: BH, ring: 3, sector: 0 },
  p2: Position = { wellId: BH, ring: 1, sector: 12 }
): GameState => {
  const state = withMissions(
    makeTwoPlayerGame({ ...from, loadout: LOADOUTS.jumpDrive }, p2),
    'p1',
    [CARD]
  )
  return withPlayer(state, 'p1', { cargo: [crateOf(CARD)] })
}

const foldsOf = (actions: PlayerAction[]) =>
  actions.filter((a): a is FoldAction => a.type === 'fold')

describe('bots fold with the jump drive', () => {
  it('folds when the station is far, onto a sector its next move reaches the station from', () => {
    const state = hauling()
    const actions = botDecideActions(viewFor(state, 'p1')).actions
    const [fold] = foldsOf(actions)
    expect(fold?.data.wellId).toBe(GAMMA)
    const result = executeTurn(state, actions)
    expect(result.errors).toBeUndefined()
    // The round ends with p2's turn, and the stations move on: from where the
    // fold left it, p1 meets Gamma's station with at most one more move.
    const next = mustExecute(result.gameState, coastAs('p2'))
    const station = getStationForPlanet(next.stations, GAMMA)!
    const meet = planStationMeetUp(getShip(next, 'p1'), station)
    expect(meet).not.toBeNull()
    expect(1 + meet!.totalTurns).toBeLessThanOrEqual(2)
  })

  it.each<[string, (s: GameState) => GameState]>([
    ['a station one coast away', s => shortOfStation(s, 'p1', GAMMA)],
    ['a broken drive', s => withSub(s, 'p1', 'side-2', { isBroken: true })],
  ])('does not fold with %s, and its turn is accepted', (_label, setUp) => {
    // The same table with neither: the bot folds there (the case above).
    expect(foldsOf(botDecideActions(viewFor(hauling(), 'p1')).actions)).toHaveLength(1)
    const state = setUp(hauling())
    const actions = botDecideActions(viewFor(state, 'p1')).actions
    expect(foldsOf(actions)).toHaveLength(0)
    expect(executeTurn(state, actions).errors).toBeUndefined()
  })

  it('takes the shot it has where it lands after the fold, as after a burn', () => {
    // A hunt in another well is a long way by the lanes, so the bot folds
    // into its prey's reach with the fold's fuel and no more.
    const prey: Position = { wellId: GAMMA, ring: 3, sector: 12 }
    let state = withMissions(
      makeTwoPlayerGame({ wellId: BH, ring: 5, sector: 0, loadout: LOADOUTS.jumpDrive }, prey),
      'p1',
      [destroyMission('p2')]
    )
    state = withShip(state, 'p1', { reactionMass: foldFuel(getShip(state, 'p1')) })
    const actions = botDecideActions(viewFor(state, 'p1')).actions
    const [fold] = foldsOf(actions)
    expect(fold).toBeDefined()
    // Where it lands, a gun aboard bears on the prey; from the black hole none does.
    const ship = getShip(state, 'p1')
    const landed = { ...fold.data, facing: ship.facing }
    const guns = ship.subsystems.filter(s => s.type === 'laser')
    expect(guns.some(g => isInWeaponRange(g, landed, prey))).toBe(true)
    expect(guns.some(g => isInWeaponRange(g, ship, prey))).toBe(false)
    const shots = actions.filter(a => a.type === 'fire_weapon')
    expect(shots.length).toBeGreaterThan(0)
    expect(shots.every(a => a.sequence! > fold.sequence!)).toBe(true)
    const result = executeTurn(state, actions)
    expect(result.errors).toBeUndefined()
    expect(eventsOf(result.events, 'weapon_fired').map(e => e.targetId)).toContain('p2')
  })
})

describe('agent seat: a fold intent', () => {
  const to: Position = { wellId: GAMMA, ring: 3, sector: 5 }
  const move = { kind: 'fold' as const, ...to }
  it.each<[string, TurnIntent]>([
    ['a bare fold', { move }],
    ['a fold with a wall up and a rotation', { move, power: { 'forward-0': 1 }, rotate: true }],
    // p2 sits one ring out abeam: the port laser bears now, so it fires before the fold.
    ['a fold after a shot', { move, fire: [{ weapon: 'side-0', target: 'p2' }] }],
  ])('builds %s, legal', (_label, intent) => {
    const state = hauling({ wellId: BH, ring: 3, sector: 0 }, { wellId: BH, ring: 4, sector: 0 })
    const built = buildTurn(viewFor(state, 'p1'), intent)
    expect(foldsOf(built.actions)).toHaveLength(1)
    expect(built.actions.filter(a => a.type === 'fire_weapon')).toHaveLength(
      intent.fire?.length ?? 0
    )
    const result = executeTurn(state, built.actions)
    expect(result.errors).toBeUndefined()
    expect(getShip(result.gameState, 'p1')).toMatchObject(to)
  })

  it('puts a shot only the landing has after the fold, and it fires from there', () => {
    // p2 sits one ring out abeam of the landing, in Gamma: out of reach from the black hole.
    const state = hauling({ wellId: BH, ring: 3, sector: 0 }, { wellId: GAMMA, ring: 4, sector: 5 })
    const built = buildTurn(viewFor(state, 'p1'), {
      move,
      fire: [{ weapon: 'side-0', target: 'p2' }],
    })
    const [fold] = foldsOf(built.actions)
    const shot = built.actions.find(a => a.type === 'fire_weapon')
    expect(shot!.sequence!).toBeGreaterThan(fold.sequence!)
    const result = executeTurn(state, built.actions)
    expect(result.errors).toBeUndefined()
    expect(eventsOf(result.events, 'weapon_fired')[0]).toMatchObject({ targetId: 'p2' })
  })
})

/**
 * Every pose `playerId` could fire from on its next turn, by the engine's own
 * move set: where it is, after a coast, after every legal burn and jump at
 * every phasing, facing either way.
 */
function nextTurnPoses(state: GameState, playerId: string) {
  const ship = getShip(state, playerId)
  const spots: Position[] = [ship, projectPosition(ship)]
  const { burns, jumps } = legalMoves(ship)
  for (const b of burns) {
    for (let shift = b.adjustment.min; shift <= b.adjustment.max; shift++) {
      spots.push(
        projectPosition(ship, b.facing, {
          kind: 'burn',
          burnIntensity: b.intensity,
          sectorAdjustment: shift,
        })
      )
    }
  }
  for (const j of jumps) {
    for (let shift = j.adjustment.min; shift <= j.adjustment.max; shift++) {
      spots.push({ ...j.destination, sector: wrapSector(j.destination.sector + shift) })
    }
  }
  return spots.flatMap(p => [
    { ...p, facing: ship.facing },
    { ...p, facing: oppositeFacing(ship.facing) },
  ])
}

/** Whether any face-up gun of `playerId`'s reaches `at` from anywhere it could fire next turn. */
function inReachOf(state: GameState, playerId: string, at: Position): boolean {
  const guns = getShip(state, playerId).subsystems.filter(s => s.type === 'laser' && s.isRevealed)
  return nextTurnPoses(state, playerId).some(pose => guns.some(g => isInWeaponRange(g, pose, at)))
}

describe('bots fold out of fire', () => {
  /**
   * p1 flies the jump drive with no card to fold for, at `hull`, on BH R3
   * S0; p2 sits a ring in with its port laser face-up, which reaches p1's
   * ring wherever p1 coasts to, or face-down and unread.
   */
  const underFire = (hull: number, laserShown: boolean, heat = 0): GameState => {
    let state = makeTwoPlayerGame(
      { wellId: BH, ring: 3, sector: 0, loadout: LOADOUTS.jumpDrive },
      { wellId: BH, ring: 2, sector: 0, loadout: LOADOUTS.laserOnly }
    )
    state = withShip(state, 'p1', {
      hitPoints: hull,
      heat: { ...getShip(state, 'p1').heat, currentHeat: heat },
    })
    return laserShown ? withSub(state, 'p2', 'side-0', { isRevealed: true }) : state
  }

  it('folds out of a lethal laser to a sector no move of the rival reaches', () => {
    const state = underFire(2, true)
    // Where it coasts to, the laser reaches it: the threat is real.
    expect(inReachOf(state, 'p2', projectPosition(getShip(state, 'p1')))).toBe(true)
    const actions = botDecideActions(viewFor(state, 'p1')).actions
    const [fold] = foldsOf(actions)
    expect(fold).toBeDefined()
    expect(inReachOf(state, 'p2', fold.data)).toBe(false)
    const result = executeTurn(state, actions)
    expect(result.errors).toBeUndefined()
    expect(getShip(result.gameState, 'p1')).toMatchObject(fold.data)
  })

  it.each<[string, GameState]>([
    ['a laser it cannot see', underFire(2, false)],
    ['a full hull the laser only scratches', underFire(10, true)],
  ])('does not fold with %s and no turns to save', (_label, state) => {
    expect(foldsOf(botDecideActions(viewFor(underFire(2, true), 'p1')).actions)).toHaveLength(1)
    const actions = botDecideActions(viewFor(state, 'p1')).actions
    expect(foldsOf(actions)).toHaveLength(0)
    expect(executeTurn(state, actions).errors).toBeUndefined()
  })

  it('stays when the heat of the fold would cost more hull than the laser', () => {
    // At 7 heat the fold's 6 is 3 hull at the check, which leaves a ship of
    // 6; the laser takes 2, which would leave 4 and so is worth a fold when cold.
    expect(foldsOf(botDecideActions(viewFor(underFire(6, true), 'p1')).actions)).toHaveLength(1)
    const state = underFire(6, true, 7)
    // Not offered at all, so no score has to talk the bot out of it.
    const offered = generateCandidates(situationOf(state), DEFAULT_BOT_PARAMETERS)
    expect(offered.flatMap(c => foldsOf(c.actions))).toHaveLength(0)
    const actions = botDecideActions(viewFor(state, 'p1')).actions
    expect(foldsOf(actions)).toHaveLength(0)
    expect(executeTurn(state, actions).errors).toBeUndefined()
  })
})

describe('a goal fold lands out of reach', () => {
  it('skips the landing a hunter covers for a safe one nearly as quick', () => {
    const open = planFold(situationOf(hauling()))
    expect(open?.kind).toBe('goal')
    // A hunter with Destroy on p1 waits on that landing, its laser face-up.
    let state = withMissions(hauling(BH_START, open!.to), 'p2', [destroyMission('p1')])
    state = withSub(state, 'p2', 'side-0', { isRevealed: true })
    expect(inReachOf(state, 'p2', open!.to)).toBe(true)
    const guarded = planFold(situationOf(state))
    expect(guarded?.kind).toBe('goal')
    if (guarded?.kind !== 'goal' || open?.kind !== 'goal') return
    expect(guarded.to).not.toEqual(open.to)
    expect(inReachOf(state, 'p2', guarded.to)).toBe(false)
    expect(guarded.turns).toBeLessThanOrEqual(open.turns + 1)
    const actions = botDecideActions(viewFor(state, 'p1')).actions
    expect(foldsOf(actions)[0]?.data).toEqual(guarded.to)
    expect(executeTurn(state, actions).errors).toBeUndefined()
  })
})
