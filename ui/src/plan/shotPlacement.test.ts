/**
 * Where a new shot goes in the sequence. A coast on black hole ring 1 carries
 * the ship 8 sectors, out of every arc its laser had at the start of the turn:
 * a shot left after the move reaches nobody, and one before it does.
 */
import { describe, expect, it } from 'vitest'
import { viewFor } from '@dangerous-inclinations/engine'
import {
  LOADOUTS,
  at,
  makeGameState,
  makePlayer,
} from '../../../engine/src/test/testUtils.ts'
import { reachesOnlyBeforeMove, shotIndex, type PlanStep } from './preview'

/** The starboard laser: it bears inward facing prograde. */
const LASER = 'side-2'

/** p1 on black hole ring 1 sector 22, prograde, a laser in side-2; p2 on ring 2 sector 23. */
const table = () =>
  makeGameState([
    makePlayer('p1', at(1, 22), LOADOUTS.starboardLaser),
    makePlayer('p2', at(2, 23)),
  ])

const rotate: PlanStep = { id: 'rotate', kind: 'rotate' }
const coast: PlanStep = { id: 'move', kind: 'move', move: { kind: 'coast', scoop: false } }
const shot: PlanStep = {
  id: 'shot',
  kind: 'fire',
  subsystemId: LASER,
  targetId: null,
  criticalTarget: 'engines',
  compensateRecoil: false,
  count: 1,
}

describe('where a new shot goes', () => {
  const state = table()
  const view = viewFor(state, state.players[0].id)
  const me = view.me!
  const loadout = me.ship.subsystems

  it.each<[string, PlanStep[], number]>([
    ['rotated, it goes before the coast that would carry the ship out of range', [rotate, coast], 1],
    ['facing the wrong way it reaches nobody either way, so it goes last', [coast], 1],
  ])('%s', (_label, steps, index) => {
    expect(shotIndex(view, me, steps, shot, loadout)).toBe(index)
  })

  it.each<[string, PlanStep[], boolean]>([
    ['a shot after the coast offers to fire before it', [rotate, coast, shot], true],
    ['a shot already before the coast does not', [rotate, shot, coast], false],
    ['nor one that reaches nobody from either place', [coast, shot], false],
  ])('%s', (_label, steps, offered) => {
    expect(reachesOnlyBeforeMove(view, me, steps, shot, loadout)).toBe(offered)
  })
})
