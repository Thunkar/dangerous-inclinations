/**
 * The walk of a planned turn (game/walk.ts) from the acting seat's view,
 * against the referee: where the ship is as each action comes up, and a
 * refusal, by code and by action, exactly where `executeTurn` refuses.
 */
import { describe, expect, it } from 'vitest'
import type { GameState, PlayerAction } from '../../models/game.ts'
import { FIRST_TURN } from '../../models/game.ts'
import { executeTurn } from '../../game/turns.ts'
import { viewFor } from '../../game/view.ts'
import { walkTurn } from '../../game/walk.ts'
import type { RefusalCode } from '../../game/refusals.ts'
import {
  ALPHA,
  BETA,
  BH,
  LANDING,
  alongside,
  burn,
  coast,
  deliverMission,
  fire,
  jump,
  makeTwoPlayerGame,
  piracyMission,
  rotate,
  seize,
  survey,
  surveyMission,
  withMissions,
  withShip,
} from '../testUtils.ts'

type Draft = Omit<PlayerAction, 'playerId'>

/** The walk of `drafts` for the active seat, and whether the referee refuses them. */
function judge(state: GameState, drafts: Draft[]) {
  const id = state.players[state.activePlayerIndex].id
  const actions = drafts.map(a => ({ ...a, playerId: id }) as PlayerAction)
  const walk = walkTurn(viewFor(state, id), actions)
  const refused = executeTurn(structuredClone(state), actions).errors !== undefined
  return { walk, refused }
}

/** p1 (the default gunship) on BH R3 S0 prograde, p2 two sectors ahead in the railgun's box. */
const ahead = (): GameState => makeTwoPlayerGame({}, { ring: 3, sector: 2 })
/** p1 at a lane mouth to Alpha. */
const atLane = (facing: 'prograde' | 'retrograde'): GameState =>
  makeTwoPlayerGame({ ring: 5, sector: 17, facing })

describe('walkTurn refuses what the referee refuses, at the action that owes it', () => {
  it.each<[string, () => GameState, Draft[], Array<[RefusalCode, number | null]>]>([
    ['a coast', ahead, [coast(1)], []],
    ['a jump facing retrograde', () => atLane('retrograde'), [jump(1, ALPHA)], [['jumpFacing', 0]]],
    [
      'a jump after a rotation to prograde',
      () => atLane('retrograde'),
      [rotate(1, 'prograde'), jump(2, ALPHA)],
      [],
    ],
    [
      'a compensated railgun, then a burn: the engines go once',
      ahead,
      [fire(1, 'forward-0', 'p2', 'engines', true), burn(2, 'soft')],
      [['enginesUsed', 1]],
    ],
    [
      'a burn on an empty tank',
      () => withShip(ahead(), 'p1', { reactionMass: 0 }),
      [burn(1, 'soft')],
      [['burnFuel', 0]],
    ],
    [
      'a laser at a ship twelve sectors off',
      makeTwoPlayerGame,
      [fire(1, 'side-0', 'p2')],
      [['outOfRange', 0]],
    ],
    [
      'a railgun in the first round',
      () => ({ ...ahead(), turn: FIRST_TURN }),
      [fire(1, 'forward-0', 'p2')],
      [['openingNoFire', 0]],
    ],
    [
      'a railgun after a rotation turns it away',
      ahead,
      [rotate(1, 'retrograde'), fire(2, 'forward-0', 'p2')],
      [['outOfRange', 1]],
    ],
    [
      'two surveys with two cards',
      () =>
        withMissions(makeTwoPlayerGame({ ring: 1 }), 'p1', [
          surveyMission('survey-1'),
          surveyMission('survey-2'),
        ]),
      [survey(1), survey(2), coast(3)],
      [['surveyTwice', 1]],
    ],
  ])('%s', (_label, build, drafts, expected) => {
    const { walk, refused } = judge(build(), drafts)
    expect(walk.refusals.map(r => [r.code, r.step])).toEqual(expected)
    expect(refused).toBe(expected.length > 0)
  })
})

describe('walkTurn moves the ship as the turn does', () => {
  it('turns, burns and spends, and says where each action starts', () => {
    const state = ahead()
    const { walk, refused } = judge(state, [rotate(1, 'retrograde'), burn(2, 'soft')])
    expect(refused).toBe(false)
    const fuel = state.players[0].ship.reactionMass
    expect(walk.at.map(p => [p.facing, p.position.ring, p.fuel])).toEqual([
      ['prograde', 3, fuel],
      ['retrograde', 3, fuel],
    ])
    // Ring 3 drifts four, and a retrograde burn drops a ring.
    expect(walk.end).toEqual({
      position: { wellId: BH, ring: 2, sector: 4 },
      facing: 'retrograde',
      fuel: fuel - 1,
    })
  })

  it('coasts a turn that names no move, after everything else', () => {
    const { walk } = judge(ahead(), [fire(1, 'side-0', 'p2')])
    expect(walk.end.position).toEqual({ wellId: BH, ring: 3, sector: 4 })
  })

  it('scoops fuel in, up to the tank', () => {
    const state = withShip(ahead(), 'p1', { reactionMass: 0 })
    const { walk } = judge(state, [coast(1, true)])
    expect(walk.end.fuel).toBe(4)
  })
})

describe('walkTurn warns of what the dice may undo, and refuses none of it', () => {
  it('a seizure after a shot at the same ship', () => {
    const state = withShip(
      alongside([piracyMission()], [deliverMission(ALPHA, BETA, 'deliver-p2')]),
      'p1',
      LANDING
    )
    const cargoId = viewFor(state, 'p1').players.find(p => p.id === 'p2')!.hold[0].cargoId
    const { walk, refused } = judge(state, [
      fire(1, 'side-0', 'p2'),
      seize(2, 'p2', cargoId),
      coast(3),
    ])
    expect(refused).toBe(false)
    expect(walk.refusals).toEqual([])
    expect(walk.warnings.map(w => [w.code, w.step])).toEqual([['seizeAfterShot', 1]])
  })
})
