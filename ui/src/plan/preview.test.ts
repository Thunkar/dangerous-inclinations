/**
 * The preview and the referee agree.
 *
 * Every turn the bots take in a few real games is read back as a plan, the
 * way the UI would hold it, and the preview must find nothing wrong with it;
 * the actions the UI would send for it must then pass `executeTurn`. On top of
 * those, a set of mutations of the same turns (off the rings, out of range, at
 * a berth, out of fuel, broken tiles, quiet turns...) is run through both, and
 * the preview must call a plan illegal exactly when the engine refuses the
 * actions built from it. Only legal against illegal is compared, never the
 * wording.
 */
import { describe, expect, it } from 'vitest'
import type {
  GameConfig,
  GameState,
  Player,
  PlayerAction,
  SubsystemId,
} from '@dangerous-inclinations/engine'
import {
  executeTurn,
  getAdjustmentRange,
  getJumpAdjustmentRange,
  getJumpOptions,
  needsRespawn,
  requestedDraw,
  ringVelocity,
  runGame,
  viewFor,
} from '@dangerous-inclinations/engine'
import {
  moveReadiness,
  planActions,
  previewPlan,
  type MoveChoice,
  type PlanExtras,
  type PlanStep,
} from './preview'

interface Plan {
  steps: PlanStep[]
  powers: Record<SubsystemId, number>
  extras: PlanExtras
}

let ids = 0
const id = () => `t-${++ids}`

/** A bot's actions as the plan the UI would hold for them. */
function planOf(player: Player, actions: PlayerAction[]): Plan {
  const steps: PlanStep[] = []
  const powers: Record<SubsystemId, number> = {}
  const extras: PlanExtras = { repair: null, dockJob: null, escorts: [] }
  const ordered = [...actions].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
  for (const action of ordered) {
    switch (action.type) {
      case 'power': {
        const sub = player.ship.subsystems.find(s => s.id === action.data.subsystemId)!
        powers[sub.id] = requestedDraw(sub.type, action.data.amount)
        break
      }
      case 'rotate':
        steps.push({ id: id(), kind: 'rotate' })
        break
      case 'coast':
        steps.push({
          id: id(),
          kind: 'move',
          move: { kind: 'coast', scoop: action.data.activateScoop },
        })
        break
      case 'burn':
        steps.push({
          id: id(),
          kind: 'move',
          move: {
            kind: 'burn',
            intensity: action.data.burnIntensity,
            adjustment: action.data.sectorAdjustment,
          },
        })
        break
      case 'well_transfer':
        steps.push({
          id: id(),
          kind: 'move',
          move: {
            kind: 'jump',
            destinationWellId: action.data.destinationWellId,
            adjustment: action.data.sectorAdjustment,
          },
        })
        break
      case 'fire_weapon':
        steps.push({
          id: id(),
          kind: 'fire',
          subsystemId: action.data.subsystemId,
          targetId: action.data.targetPlayerId,
          criticalTarget: action.data.criticalTarget,
          compensateRecoil: action.data.compensateRecoil ?? false,
          count: action.data.count ?? 1,
        })
        break
      case 'scan':
        steps.push({
          id: id(),
          kind: 'scan',
          targetId: action.data.targetPlayerId,
          peekSlot: action.data.peekSlot,
        })
        break
      case 'repair':
        extras.repair = action.data.subsystemId
        break
      case 'dock_job':
        extras.dockJob = action.data.job
        break
      case 'escort_mark':
        extras.escorts = [...extras.escorts, action.data.carrierId]
        break
    }
  }
  // The engine coasts a turn that names no move, after everything else: the
  // plan always holds one, so it goes last.
  if (!steps.some(s => s.kind === 'move'))
    steps.push({ id: id(), kind: 'move', move: { kind: 'coast', scoop: false } })
  return { steps, powers, extras }
}

/** What each side says about a plan on a state: the preview's issues and the engine's refusal. */
function judge(state: GameState, plan: Plan) {
  const active = state.players[state.activePlayerIndex]
  const view = viewFor(state, active.id)
  const me = view.me!
  const preview = previewPlan(view, me, plan.steps, plan.powers)
  const actions = planActions(me, plan.steps, preview, plan.extras)
  const result = executeTurn(structuredClone(state), actions)
  // A shot or a scan at a ship an earlier shot destroyed this turn is skipped,
  // not refused: the dice decide it, and no preview can.
  const skipped = result.events.some(e => e.type === 'action_skipped')
  return { issues: preview.issues, errors: result.errors ?? [], actions, skipped }
}

interface Turn {
  state: GameState
  actions: PlayerAction[]
}

/** Every turn of a real game that is played rather than respawned, with the state it began on. */
function playedTurns(config: GameConfig): Turn[] {
  const game = runGame({ ...config, maxTurns: 90, record: true })
  const recording = game.recording!
  const out: Turn[] = []
  let state = recording.initialState
  for (const turn of recording.turns) {
    const active = state.players[state.activePlayerIndex]
    if (state.phase === 'active' && !needsRespawn(active))
      out.push({ state, actions: turn.actions })
    state = turn.resultingStateSnapshot
  }
  return out
}

/**
 * Natural games at three sizes, and one with a missile boat dealt Destroy:
 * no hull a bot picks for itself carries a launcher, and salvos need one.
 */
const GAMES: GameConfig[] = [
  { seed: 1, botCount: 3 },
  { seed: 2, botCount: 4 },
  { seed: 3, botCount: 2 },
  {
    seed: 4,
    botCount: 3,
    seatLoadouts: {
      'bot-1': {
        forwardSlots: ['missiles'],
        sideSlots: ['missiles', 'missiles', 'radiator', 'shields'],
      },
    },
    seatHands: { 'bot-1': 'destroy_ship' },
  },
]
const TURNS = GAMES.flatMap(playedTurns)

const replaceMove = (steps: PlanStep[], move: MoveChoice): PlanStep[] =>
  steps.map(s => (s.kind === 'move' ? { ...s, move } : s))

const withShip = (state: GameState, change: (player: Player) => Player): GameState => {
  const next = structuredClone(state)
  next.players[next.activePlayerIndex] = change(next.players[next.activePlayerIndex])
  return next
}

const breakTile =
  (tile: SubsystemId) =>
  (player: Player): Player => ({
    ...player,
    ship: {
      ...player.ship,
      subsystems: player.ship.subsystems.map(s => (s.id === tile ? { ...s, isBroken: true } : s)),
    },
  })

type Mutation = (turn: Turn, plan: Plan) => Array<{ state: GameState; plan: Plan }>

/**
 * Plans the bots would never make, most of them illegal. Each returns every
 * variant it can build on the turn, or none where it does not apply.
 */
const MUTATIONS: Record<string, Mutation> = {
  'every burn, either facing': ({ state }, plan) =>
    (['soft', 'medium', 'hard'] as const).flatMap(intensity =>
      [false, true].map(rotate => {
        const steps = replaceMove(
          plan.steps.filter(s => s.kind !== 'rotate'),
          { kind: 'burn', intensity, adjustment: 0 }
        )
        if (rotate) steps.unshift({ id: id(), kind: 'rotate' })
        return { state, plan: { ...plan, steps } }
      })
    ),
  'phasing past the ring': ({ state }, plan) => {
    const me = state.players[state.activePlayerIndex].ship
    const range = getAdjustmentRange(ringVelocity(me.wellId, me.ring))
    return [range.min - 1, range.max + 1, range.max].map(adjustment => ({
      state,
      plan: {
        ...plan,
        steps: replaceMove(
          plan.steps.filter(s => s.kind !== 'rotate'),
          { kind: 'burn', intensity: 'soft', adjustment }
        ),
      },
    }))
  },
  'a jump from anywhere': ({ state }, plan) =>
    ['blackhole', 'planet-alpha', 'planet-beta', 'planet-gamma'].map(destinationWellId => ({
      state,
      plan: {
        ...plan,
        steps: replaceMove(plan.steps, { kind: 'jump', destinationWellId, adjustment: 0 }),
      },
    })),
  'a jump phased out of its arc': ({ state }, plan) => {
    const me = state.players[state.activePlayerIndex].ship
    return getJumpOptions(me).flatMap(option => {
      const range = getJumpAdjustmentRange(option)
      return [range.min - 1, range.max + 1].map(adjustment => ({
        state,
        plan: {
          ...plan,
          steps: replaceMove(
            plan.steps.filter(s => s.kind !== 'rotate'),
            { kind: 'jump', destinationWellId: option.destination.wellId, adjustment }
          ),
        },
      }))
    })
  },
  'an empty tank': ({ state }, plan) => [
    { state: withShip(state, p => ({ ...p, ship: { ...p.ship, reactionMass: 0 } })), plan },
  ],
  'one fuel': ({ state }, plan) => [
    {
      state: withShip(state, p => ({ ...p, ship: { ...p.ship, reactionMass: 1 } })),
      plan: {
        ...plan,
        steps: replaceMove(plan.steps, { kind: 'burn', intensity: 'soft', adjustment: 1 }),
      },
    },
  ],
  'broken engines': ({ state }, plan) => [{ state: withShip(state, breakTile('engines')), plan }],
  'broken thrusters, rotating': ({ state }, plan) => [
    {
      state: withShip(state, breakTile('rotation')),
      plan: plan.steps.some(s => s.kind === 'rotate')
        ? plan
        : { ...plan, steps: [{ id: id(), kind: 'rotate' }, ...plan.steps] },
    },
  ],
  'broken scoop, scooping': ({ state }, plan) => [
    {
      state: withShip(state, breakTile('scoop')),
      plan: { ...plan, steps: replaceMove(plan.steps, { kind: 'coast', scoop: true }) },
    },
  ],
  'every weapon at every rival': ({ state }, plan) => {
    const me = state.players[state.activePlayerIndex]
    const weapons = me.ship.subsystems.filter(
      s =>
        s.type === 'railgun' ||
        s.type === 'laser' ||
        s.type === 'missiles' ||
        s.type === 'ballistic_rack'
    )
    return weapons.flatMap(weapon =>
      state.players
        .filter(p => p.id !== me.id)
        .flatMap(rival =>
          [false, true].map(compensateRecoil => ({
            state,
            plan: {
              ...plan,
              powers: {},
              steps: [
                ...plan.steps.filter(s => s.kind !== 'fire' || s.subsystemId !== weapon.id),
                {
                  id: id(),
                  kind: 'fire' as const,
                  subsystemId: weapon.id,
                  targetId: rival.id,
                  criticalTarget: 'engines' as SubsystemId,
                  compensateRecoil,
                  count: 1,
                },
              ],
            },
          }))
        )
    )
  },
  'a salvo bigger than the magazine': ({ state }, plan) => {
    const me = state.players[state.activePlayerIndex]
    const launcher = me.ship.subsystems.find(s => s.type === 'missiles')
    const rival = state.players.find(p => p.id !== me.id)
    if (!launcher || !rival) return []
    return [(launcher.ammo ?? 0) + 1, 0].map(count => ({
      state,
      plan: {
        ...plan,
        steps: [
          ...plan.steps.filter(s => s.kind !== 'fire'),
          {
            id: id(),
            kind: 'fire' as const,
            subsystemId: launcher.id,
            targetId: rival.id,
            criticalTarget: 'engines' as SubsystemId,
            compensateRecoil: false,
            count,
          },
        ],
      },
    }))
  },
  'a scan at every rival': ({ state }, plan) => {
    const me = state.players[state.activePlayerIndex]
    return state.players
      .filter(p => p.id !== me.id)
      .map(rival => ({
        state,
        plan: {
          ...plan,
          powers: {},
          steps: [
            ...plan.steps.filter(s => s.kind !== 'scan'),
            {
              id: id(),
              kind: 'scan' as const,
              targetId: rival.id,
              peekSlot: 'forward-0' as SubsystemId,
            },
          ],
        },
      }))
  },
  'a scan with a broken sensor': ({ state }, plan) => {
    const me = state.players[state.activePlayerIndex]
    const sensor = me.ship.subsystems.find(s => s.type === 'sensor_array')
    const rival = state.players.find(p => p.id !== me.id)
    if (!sensor || !rival) return []
    return [
      {
        state: withShip(state, breakTile(sensor.id)),
        plan: {
          ...plan,
          steps: [
            ...plan.steps.filter(s => s.kind !== 'scan'),
            {
              id: id(),
              kind: 'scan' as const,
              targetId: rival.id,
              peekSlot: 'forward-0' as SubsystemId,
            },
          ],
        },
      },
    ]
  },
  'a launch at, and from, a berth': ({ state }, plan) => {
    // A missile reaches anyone in its well, so only the berth decides these.
    const me = state.players[state.activePlayerIndex]
    const launcher = me.ship.subsystems.find(s => s.type === 'missiles' && (s.ammo ?? 0) > 0)
    const rival = state.players.find(p => p.id !== me.id && !p.recovering && p.ship.hitPoints > 0)
    if (!launcher || !rival) return []
    const fire: PlanStep = {
      id: id(),
      kind: 'fire',
      subsystemId: launcher.id,
      targetId: rival.id,
      criticalTarget: 'engines',
      compensateRecoil: false,
      count: 1,
    }
    const planned = {
      ...plan,
      powers: {},
      steps: [...plan.steps.filter(s => s.kind !== 'fire'), fire],
    }
    type Spot = { ring: number; sector: number }
    return state.stations.flatMap(station => {
      const place = (mine: Spot, theirs: Spot) => {
        const next = structuredClone(state)
        const ship = next.players[next.activePlayerIndex]
        const target = next.players.find(p => p.id === rival.id)!
        ship.ship = { ...ship.ship, wellId: station.planetId, ...mine }
        target.ship = { ...target.ship, wellId: station.planetId, ...theirs }
        return { state: next, plan: planned }
      }
      const berth = { ring: station.ring, sector: station.sector }
      const beside = { ring: station.ring, sector: (station.sector + 1) % 24 }
      const across = { ring: 3, sector: (station.sector + 12) % 24 }
      return [place(across, berth), place(across, beside), place(berth, across)]
    })
  },
  'a railgun compensated beside a burn': ({ state }, plan) => {
    const me = state.players[state.activePlayerIndex]
    const railgun = me.ship.subsystems.find(s => s.type === 'railgun')
    const rival = state.players.find(p => p.id !== me.id)
    if (!railgun || !rival) return []
    return [
      {
        state,
        plan: {
          ...plan,
          steps: [
            ...replaceMove(
              plan.steps.filter(s => s.kind !== 'fire'),
              { kind: 'burn', intensity: 'soft', adjustment: 0 }
            ),
            {
              id: id(),
              kind: 'fire' as const,
              subsystemId: railgun.id,
              targetId: rival.id,
              criticalTarget: 'engines' as SubsystemId,
              compensateRecoil: true,
              count: 1,
            },
          ],
        },
      },
    ]
  },
}

describe('the plan preview against the engine', () => {
  it('has real turns to read', () => {
    expect(TURNS.length).toBeGreaterThan(100)
    // The opening round, a turn back from Home and a moored ship are all in there.
    expect(TURNS.some(t => t.state.turn === 1)).toBe(true)
    expect(TURNS.some(t => t.state.players[t.state.activePlayerIndex].recovering)).toBe(true)
    expect(
      TURNS.some(t =>
        t.state.players.some(p =>
          t.state.stations.some(
            s =>
              s.planetId === p.ship.wellId && s.ring === p.ship.ring && s.sector === p.ship.sector
          )
        )
      )
    ).toBe(true)
  })

  it('finds nothing wrong with any turn a bot takes, and the engine takes what it sends', () => {
    const disagreements = TURNS.flatMap(turn => {
      const active = turn.state.players[turn.state.activePlayerIndex]
      const plan = planOf(active, turn.actions)
      const { issues, errors } = judge(turn.state, plan)
      return issues.length > 0 || errors.length > 0
        ? [{ turn: turn.state.turn, player: active.id, issues, errors }]
        : []
    })
    expect(disagreements).toEqual([])
  })

  it.each(Object.entries(MUTATIONS))('agrees on %s', (_name, mutate) => {
    let judged = 0
    let refused = 0
    const disagreements: unknown[] = []
    TURNS.forEach((turn, index) => {
      // Every third turn keeps the run short; the games are long enough to cover the cases.
      if (index % 3 !== 0 && turn.state.turn !== 1) return
      const active = turn.state.players[turn.state.activePlayerIndex]
      for (const variant of mutate(turn, planOf(active, turn.actions))) {
        const { issues, errors, actions, skipped } = judge(variant.state, variant.plan)
        if (skipped) continue
        judged++
        if (errors.length > 0) refused++
        if (issues.length > 0 !== errors.length > 0)
          disagreements.push({
            turn: turn.state.turn,
            player: active.id,
            issues,
            errors,
            actions: actions.map(a => `${a.type} ${JSON.stringify(a.data)}`),
          })
      }
    })
    expect(disagreements).toEqual([])
    expect(judged).toBeGreaterThan(0)
    expect(refused).toBeGreaterThan(0)
  })

  it('offers a move button exactly when the engine would take that move', () => {
    // The move buttons read `moveReadiness`: a burn or a jump it calls ready
    // must be one the engine takes, and one it blocks one the engine refuses.
    let offered = 0
    let blocked = 0
    const noExtras: PlanExtras = { repair: null, dockJob: null, escorts: [] }
    TURNS.forEach(({ state }) => {
      const view = viewFor(state, state.players[state.activePlayerIndex].id)
      const me = view.me!
      const moves: MoveChoice[] = [
        ...(['soft', 'medium', 'hard'] as const).map(
          intensity => ({ kind: 'burn', intensity, adjustment: 0 }) as const
        ),
        ...getJumpOptions(me.ship).map(
          option =>
            ({ kind: 'jump', destinationWellId: option.destination.wellId, adjustment: 0 }) as const
        ),
      ]
      for (const move of moves) {
        const steps: PlanStep[] = [{ id: id(), kind: 'move', move }]
        const preview = previewPlan(view, me, steps, {})
        const ready = moveReadiness(me, preview.loadout, preview.moveFrom, move)
        const button = move.kind === 'burn' ? ready.burnReady[move.intensity] : ready.jumpReady
        const result = executeTurn(
          structuredClone(state),
          planActions(me, steps, preview, noExtras)
        )
        expect(button.ok).toBe((result.errors ?? []).length === 0)
        if (button.ok) offered++
        else blocked++
      }
    })
    expect(offered).toBeGreaterThan(0)
    expect(blocked).toBeGreaterThan(0)
  })
})
