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
  GameEventType,
  GameState,
  GameView,
  Player,
  PlayerAction,
  SubsystemId,
} from '@dangerous-inclinations/engine'
import {
  FIRST_TURN,
  SURVEY_RING,
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
  placementIndex,
  type MoveChoice,
  type PlanExtras,
  type PlanPreview,
  type PlanStep,
} from './preview'
import {
  ALPHA,
  BETA,
  BH,
  LANDING,
  LOADOUTS,
  alongside,
  berthOf,
  deliverMission,
  escortMission,
  makeGameState,
  makePlayer,
  piracyMission,
  salvageMission,
  surveyMission,
  tankerMission,
  withPlayer,
  withShip,
  withSub,
} from '../../../engine/src/test/testUtils.ts'

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
  const extras: PlanExtras = { repair: null, dockSale: null }
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
      case 'dock_sale':
        extras.dockSale = action.data.sale
        break
      case 'seize':
        steps.push({
          id: id(),
          kind: 'seize',
          victimId: action.data.victimId,
          cargoId: action.data.cargoId,
        })
        break
      case 'escort_mark':
        steps.push({ id: id(), kind: 'mark', carrierId: action.data.carrierId })
        break
      case 'survey':
        steps.push({ id: id(), kind: 'survey' })
        break
      case 'salvage':
        steps.push({
          id: id(),
          kind: 'salvage',
          wreckId: action.data.wreckId ?? null,
          victimId: null,
        })
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
    seatLoadouts: { 'bot-1': LOADOUTS.missileBoat },
    seatHands: { 'bot-1': 'destroy_ship' },
  },
]
const TURNS = GAMES.flatMap(playedTurns)

const replaceMove = (steps: PlanStep[], move: MoveChoice): PlanStep[] =>
  steps.map(s => (s.kind === 'move' ? { ...s, move } : s))

/** The player whose turn it is. */
const active = (state: GameState): string => state.players[state.activePlayerIndex].id

/** The active ship with one tile broken. */
const breakTile = (state: GameState, tile: SubsystemId): GameState =>
  withSub(state, active(state), tile, { isBroken: true })

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
    { state: withShip(state, active(state), { reactionMass: 0 }), plan },
  ],
  'one fuel': ({ state }, plan) => [
    {
      state: withShip(state, active(state), { reactionMass: 1 }),
      plan: {
        ...plan,
        steps: replaceMove(plan.steps, { kind: 'burn', intensity: 'soft', adjustment: 1 }),
      },
    },
  ],
  'broken engines': ({ state }, plan) => [{ state: breakTile(state, 'engines'), plan }],
  'broken thrusters, rotating': ({ state }, plan) => [
    {
      state: breakTile(state, 'rotation'),
      plan: plan.steps.some(s => s.kind === 'rotate')
        ? plan
        : { ...plan, steps: [{ id: id(), kind: 'rotate' }, ...plan.steps] },
    },
  ],
  'broken scoop, scooping': ({ state }, plan) => [
    {
      state: breakTile(state, 'scoop'),
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
        state: breakTile(state, sensor.id),
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
  it('finds nothing wrong with any turn a bot takes, and the engine takes what it sends', () => {
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
    const noExtras: PlanExtras = { repair: null, dockSale: null }
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
        // A jump's button puts a rotation to prograde in first, as a click does.
        const turn = move.kind === 'jump' && me.ship.facing !== 'prograde'
        const steps: PlanStep[] = [
          ...(turn ? [{ id: id(), kind: 'rotate' } as const] : []),
          { id: id(), kind: 'move', move },
        ]
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

/**
 * Whether a plan ends with a stop at a station is the preview's alone to say
 * (the order tables hold the rest of these two turns to the engine): it must
 * offer the stop exactly when the engine docks.
 */
describe('the preview offers a dock exactly when the engine docks (RULES §Stations, Moored)', () => {
  /** Railgun bow; side-0 the rack. A Tanker card, so arriving at a station has a sale to offer. */
  const seat = (
    sector: number,
    ring: number,
    facing: 'prograde' | 'retrograde',
    rival: { ring: number; sector: number }
  ): GameState =>
    makeGameState([
      makePlayer('p1', { wellId: ALPHA, ring, sector, facing }, LOADOUTS.railRack, {
        missions: [tankerMission()],
      }),
      makePlayer('p2', { wellId: ALPHA, ...rival }),
    ])
  const shot = (subsystemId: SubsystemId): PlanStep => ({
    id: id(),
    kind: 'fire',
    subsystemId,
    targetId: 'p2',
    criticalTarget: 'engines',
    compensateRecoil: false,
    count: 1,
  })
  const NO_EXTRAS: PlanExtras = { repair: null, dockSale: null }

  it.each<[string, () => GameState, () => PlanStep[], boolean]>([
    [
      // Ring 3, sector 22, retrograde: a soft burn drifts two and drops onto the station.
      'a soft burn onto the station, then the rack',
      () => seat(22, 3, 'retrograde', { ring: 2, sector: 1 }),
      () => [
        { id: id(), kind: 'move', move: { kind: 'burn', intensity: 'soft', adjustment: 0 } },
        shot('side-0'),
      ],
      true,
    ],
    [
      // Ring 3, sector 0, prograde: the railgun's recoil drops it onto the station's
      // sector, and a coast at ring 2's speed carries it off.
      'the railgun recoiling onto the station, then a coast',
      () => seat(0, 3, 'prograde', { ring: 3, sector: 2 }),
      () => [shot('forward-0'), { id: id(), kind: 'move', move: { kind: 'coast', scoop: false } }],
      false,
    ],
  ])('%s', (_label, build, plan, docks) => {
    const state = build()
    const steps = plan()
    const view = viewFor(state, 'p1')
    const me = view.me!
    const preview = previewPlan(view, me, steps, {})
    const result = executeTurn(state, planActions(me, steps, preview, NO_EXTRAS))
    expect(result.errors).toBeUndefined()
    expect(preview.dockOffer !== null).toBe(docks)
    expect(result.events.filter(e => e.type === 'docked')).toHaveLength(docks ? 1 : 0)
  })
})

/**
 * Piracy is a step in the sequence: the offer says whether the item is there
 * before the move (the ship shares the start's sector) or after it (the move
 * ends there), the step goes in where that holds, and the engine takes the
 * item the plan sends.
 */
describe('a seizure is offered where it can be taken, and placed there', () => {
  const coastStep = (): PlanStep => ({
    id: id(),
    kind: 'move',
    move: { kind: 'coast', scoop: false },
  })
  const NO_EXTRAS: PlanExtras = { repair: null, dockSale: null }

  it.each<[string, boolean, number]>([
    ['sharing the sector at the start: first, before the move', true, 0],
    ['one coast short: right after the move', false, 1],
  ])('%s', (_label, together, index) => {
    const base = alongside([piracyMission()], [deliverMission(ALPHA, BETA, 'deliver-p2')])
    const state = together ? withShip(base, 'p1', LANDING) : base
    const view = viewFor(state, 'p1')
    const me = view.me!
    const steps = [coastStep()]
    const offer = previewPlan(view, me, steps, {}).seizeOffer!
    expect(offer.items.map(i => i.before)).toEqual([together])

    const placed = [...steps]
    placed.splice(placementIndex(steps, offer.items[0]), 0, {
      id: id(),
      kind: 'seize',
      victimId: offer.items[0].victimId,
      cargoId: offer.items[0].cargoId,
    })
    expect(placed.findIndex(s => s.kind === 'seize')).toBe(index)
    const preview = previewPlan(view, me, placed, {})
    expect(preview.issues).toEqual([])
    const result = executeTurn(state, planActions(me, placed, preview, NO_EXTRAS))
    expect(result.errors).toBeUndefined()
    expect(result.events.filter(e => e.type === 'cargo_seized')).toHaveLength(1)

    // The other side of the move: the ship is not in the sector there.
    const wrong = [...placed].reverse()
    expect(previewPlan(view, me, wrong, {}).issues).toHaveLength(1)
    expect(
      executeTurn(state, planActions(me, wrong, previewPlan(view, me, wrong, {}), NO_EXTRAS)).errors
    ).toBeDefined()
  })

  // A quiet turn reaches nobody: the opening round, and a ship's turn back from Home.
  it.each<[string, (state: GameState) => GameState]>([
    ['in the first round', state => ({ ...state, turn: FIRST_TURN })],
    ['on the turn back from Home', state => withPlayer(state, 'p1', { recovering: true })],
  ])('nothing is offered %s, and a seizure sent anyway is refused', (_label, quiet) => {
    const state = quiet(
      withShip(
        alongside([piracyMission()], [deliverMission(ALPHA, BETA, 'deliver-p2')]),
        'p1',
        LANDING
      )
    )
    const view = viewFor(state, 'p1')
    const me = view.me!
    const coast = coastStep()
    expect(previewPlan(view, me, [coast], {}).seizeOffer).toBeNull()
    const cargoId = view.players.find(p => p.id === 'p2')!.hold[0].cargoId
    const steps: PlanStep[] = [{ id: id(), kind: 'seize', victimId: 'p2', cargoId }, coast]
    const preview = previewPlan(view, me, steps, {})
    expect(preview.issues).toHaveLength(1)
    expect(executeTurn(state, planActions(me, steps, preview, NO_EXTRAS)).errors).toBeDefined()
  })
})

/**
 * A survey, a salvage and an Escort marker are steps in the sequence, as a
 * seizure is: each is offered before the move when it holds where the turn
 * starts and after it when it holds where the move ends, goes in where that
 * holds, is sent with its place in the sequence, and is refused on the other
 * side of the move by both the preview and the engine.
 */
describe('a survey, a salvage and a marker are offered where they hold, and placed there', () => {
  const NO_EXTRAS: PlanExtras = { repair: null, dockSale: null }
  const SOFT: MoveChoice = { kind: 'burn', intensity: 'soft', adjustment: 0 }
  const COAST: MoveChoice = { kind: 'coast', scoop: false }
  const FAR = { wellId: BH, ring: 5, sector: 12 }
  type Kind = 'survey' | 'salvage' | 'mark'
  const ACTION: Record<Kind, PlayerAction['type']> = {
    survey: 'survey',
    salvage: 'salvage',
    mark: 'escort_mark',
  }
  const EVENT: Record<Kind, GameEventType> = {
    survey: 'data_acquired',
    salvage: 'wreck_salvaged',
    mark: 'escort_marked',
  }

  /** What the preview offers for a kind, each option with the step it puts in. */
  function offered(preview: PlanPreview, kind: Kind): Array<{ before: boolean; step: PlanStep }> {
    switch (kind) {
      case 'survey':
        return preview.surveyOffer
          ? [{ before: preview.surveyOffer.before, step: { id: id(), kind: 'survey' } }]
          : []
      case 'salvage':
        return (preview.salvageOffer?.wrecks ?? []).map(w => ({
          before: w.before,
          step: { id: id(), kind: 'salvage', wreckId: w.id, victimId: null },
        }))
      case 'mark':
        return (preview.markOffer?.carriers ?? []).map(c => ({
          before: c.before,
          step: { id: id(), kind: 'mark', carrierId: c.carrierId },
        }))
    }
  }

  /** A Salvage holder on the landing sector, and a wreck where `steps` leave it (or there). */
  const wreckFor = (move: MoveChoice | null): GameState => {
    const state = makeGameState([
      makePlayer('p1', LANDING, undefined, { missions: [salvageMission()] }),
      makePlayer('p2', FAR),
    ])
    const view = viewFor(state, 'p1')
    const where = move
      ? previewPlan(view, view.me!, [{ id: id(), kind: 'move', move }], {}).finalPosition.position
      : LANDING
    return { ...state, wrecks: [{ id: 'wreck-1', ...where }] }
  }
  const surveyor = (ring: number, facing: 'prograde' | 'retrograde'): GameState =>
    makeGameState([
      makePlayer('p1', { wellId: BH, ring, sector: 0, facing }, undefined, {
        missions: [surveyMission()],
      }),
      makePlayer('p2', FAR),
    ])
  const escorting = (): GameState =>
    alongside([escortMission()], [deliverMission(ALPHA, BETA, 'deliver-p2')])

  it.each<[string, () => GameState, MoveChoice, Kind, boolean]>([
    [
      'survey on the ring at the start: first',
      () => surveyor(SURVEY_RING, 'prograde'),
      SOFT,
      'survey',
      true,
    ],
    [
      'survey once a burn drops onto the ring: after the move',
      () => surveyor(SURVEY_RING + 1, 'retrograde'),
      SOFT,
      'survey',
      false,
    ],
    ['salvage the wreck on the start sector: first', () => wreckFor(null), SOFT, 'salvage', true],
    [
      'salvage the wreck the coast reaches: after the move',
      () => wreckFor(COAST),
      COAST,
      'salvage',
      false,
    ],
    ['mark a carrier on the start ring: first', escorting, SOFT, 'mark', true],
    [
      'mark a carrier the burn reaches: after the move',
      () => withShip(escorting(), 'p1', { ring: 2 }),
      SOFT,
      'mark',
      false,
    ],
    [
      'mark from a berth: only after the burn off it',
      () => {
        const state = escorting()
        const moored = withShip(state, 'p1', { ...berthOf(state, ALPHA), facing: 'prograde' })
        return withShip(moored, 'p2', { wellId: ALPHA, ring: 3, sector: 5 })
      },
      SOFT,
      'mark',
      false,
    ],
  ])('%s', (_label, build, move, kind, before) => {
    const state = build()
    const view = viewFor(state, 'p1')
    const me = view.me!
    const steps: PlanStep[] = [{ id: id(), kind: 'move', move }]
    const options = offered(previewPlan(view, me, steps, {}), kind)
    expect(options.map(o => o.before)).toEqual([before])

    const placed = [...steps]
    placed.splice(placementIndex(steps, options[0]), 0, options[0].step)
    expect(placed.findIndex(s => s.kind === kind)).toBe(before ? 0 : 1)
    const preview = previewPlan(view, me, placed, {})
    expect(preview.issues).toEqual([])
    const actions = planActions(me, placed, preview, NO_EXTRAS)
    const sequenced = actions.filter(a => a.sequence !== undefined)
    expect(sequenced.map(a => a.sequence)).toEqual(sequenced.map((_, i) => i + 1))
    expect(sequenced.findIndex(a => a.type === ACTION[kind])).toBe(before ? 0 : 1)
    const result = executeTurn(structuredClone(state), actions)
    expect(result.errors).toBeUndefined()
    expect(result.events.filter(e => e.type === EVENT[kind])).toHaveLength(1)

    // The other side of the move: it no longer holds there.
    const wrong = [...placed].reverse()
    const wrongPreview = previewPlan(view, me, wrong, {})
    expect(wrongPreview.issues).toHaveLength(1)
    expect(
      executeTurn(structuredClone(state), planActions(me, wrong, wrongPreview, NO_EXTRAS)).errors
    ).toBeDefined()
  })

  it.each<[string, () => GameState, Kind, boolean, (view: GameView) => PlanStep[]]>([
    [
      'a marker on a carrier just back from Home',
      () => withPlayer(escorting(), 'p2', { recovering: true }),
      'mark',
      false,
      () => [{ id: id(), kind: 'mark', carrierId: 'p2' }],
    ],
    [
      'two markers on one carrier',
      () =>
        alongside(
          [escortMission('escort-1'), escortMission('escort-2')],
          [deliverMission(ALPHA, BETA, 'deliver-p2')]
        ),
      'mark',
      true,
      () => [
        { id: id(), kind: 'mark', carrierId: 'p2' },
        { id: id(), kind: 'mark', carrierId: 'p2' },
      ],
    ],
    [
      'more marks than markers in hand',
      () =>
        alongside([escortMission()], [deliverMission(ALPHA, BETA, 'deliver-p2')], LANDING, [
          deliverMission(BETA, ALPHA, 'deliver-p3'),
        ]),
      'mark',
      true,
      () => [
        { id: id(), kind: 'mark', carrierId: 'p2' },
        { id: id(), kind: 'mark', carrierId: 'p3' },
      ],
    ],
    [
      'a marker on a carrier a seizure has just emptied',
      () =>
        withShip(
          alongside(
            [escortMission(), piracyMission()],
            [deliverMission(ALPHA, BETA, 'deliver-p2')]
          ),
          'p1',
          LANDING
        ),
      'mark',
      true,
      view => [
        {
          id: id(),
          kind: 'seize',
          victimId: 'p2',
          cargoId: view.players.find(p => p.id === 'p2')!.hold[0].cargoId,
        },
        { id: id(), kind: 'mark', carrierId: 'p2' },
      ],
    ],
    [
      'a survey off the survey ring',
      () => surveyor(SURVEY_RING + 2, 'prograde'),
      'survey',
      false,
      () => [{ id: id(), kind: 'survey' }],
    ],
    [
      'two surveys in a turn, with two cards',
      () =>
        withPlayer(surveyor(SURVEY_RING, 'prograde'), 'p1', {
          missions: [surveyMission('survey-1'), surveyMission('survey-2')],
        }),
      'survey',
      true,
      () => [
        { id: id(), kind: 'survey' },
        { id: id(), kind: 'survey' },
      ],
    ],
    [
      'a salvage with no Salvage card',
      () => withPlayer(wreckFor(null), 'p1', { missions: [] }),
      'salvage',
      false,
      () => [{ id: id(), kind: 'salvage', wreckId: 'wreck-1', victimId: null }],
    ],
    [
      'two salvages in a turn, with two cards',
      () => {
        const state = withPlayer(wreckFor(null), 'p1', {
          missions: [salvageMission('salvage-1'), salvageMission('salvage-2')],
        })
        return { ...state, wrecks: [...state.wrecks, { id: 'wreck-2', ...LANDING }] }
      },
      'salvage',
      true,
      () => [
        { id: id(), kind: 'salvage', wreckId: 'wreck-1', victimId: null },
        { id: id(), kind: 'salvage', wreckId: 'wreck-2', victimId: null },
      ],
    ],
  ])('%s: the preview objects and the engine refuses', (_label, build, kind, offers, stepsOf) => {
    const state = build()
    const view = viewFor(state, 'p1')
    const me = view.me!
    const coast: PlanStep = { id: id(), kind: 'move', move: COAST }
    expect(offered(previewPlan(view, me, [coast], {}), kind).length > 0).toBe(offers)
    const steps = [...stepsOf(view), coast]
    const preview = previewPlan(view, me, steps, {})
    expect(preview.issues).toHaveLength(1)
    expect(
      executeTurn(structuredClone(state), planActions(me, steps, preview, NO_EXTRAS)).errors
    ).toBeDefined()
  })
})

/**
 * A ship is settled the moment it dies, so a shot at a ship in the sector the
 * ship is in after the shot can leave a wreck for a salvage right after it.
 * The preview offers that salvage, naming no wreck, places it after the shot
 * and reports no issue: whether the shot kills is the dice's. The engine takes
 * the black box if it does and skips the salvage if it does not.
 */
describe('a salvage that counts on a kill', () => {
  const NO_EXTRAS: PlanExtras = { repair: null, dockSale: null }
  const COAST: PlanStep = { id: 'move', kind: 'move', move: { kind: 'coast', scoop: false } }
  const SHOT: PlanStep = {
    id: 'shot',
    kind: 'fire',
    subsystemId: 'side-0',
    targetId: 'p2',
    criticalTarget: 'engines',
    compensateRecoil: false,
    count: 1,
  }
  /** p1 (holding `missions`) and p2 (on `hull`) share the landing sector; a coast takes p1 off it. */
  const pointBlank = (hull: number, missions = [salvageMission()]): GameState =>
    withShip(
      makeGameState([
        makePlayer('p1', LANDING, undefined, { missions }),
        makePlayer('p2', LANDING),
      ]),
      'p2',
      { hitPoints: hull }
    )

  it.each<[string, () => GameState, boolean, GameEventType | null]>([
    [
      'after a shot that kills, the black box is taken',
      () => pointBlank(1),
      true,
      'wreck_salvaged',
    ],
    [
      'after a shot the ship survives, nothing is taken',
      () => pointBlank(10),
      true,
      'action_skipped',
    ],
    ['with no Salvage card, it is not offered', () => pointBlank(1, []), false, null],
  ])('%s', (_label, build, offers, event) => {
    const state = build()
    const view = viewFor(state, 'p1')
    const me = view.me!
    const kills = previewPlan(view, me, [SHOT, COAST], {}).salvageOffer?.kills ?? []
    if (!offers) {
      expect(kills).toEqual([])
      return
    }
    expect(kills).toEqual([{ victimId: 'p2', index: 1 }])
    const steps: PlanStep[] = [
      SHOT,
      { id: id(), kind: 'salvage', wreckId: null, victimId: 'p2' },
      COAST,
    ]
    const preview = previewPlan(view, me, steps, {})
    expect(preview.issues).toEqual([])
    const result = executeTurn(structuredClone(state), planActions(me, steps, preview, NO_EXTRAS))
    expect(result.errors).toBeUndefined()
    expect(result.events.map(e => e.type)).toContain(event)
  })

  it('moved before the shot, the preview objects: there is no wreck there yet', () => {
    const state = pointBlank(1)
    const view = viewFor(state, 'p1')
    const steps: PlanStep[] = [
      { id: id(), kind: 'salvage', wreckId: null, victimId: 'p2' },
      SHOT,
      COAST,
    ]
    expect(previewPlan(view, view.me!, steps, {}).issues).toHaveLength(1)
  })
})
