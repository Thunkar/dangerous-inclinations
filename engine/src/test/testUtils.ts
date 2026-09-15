/**
 * Shared test helpers. Build small, explicit game states and actions.
 *
 * Defaults: two deployed players on black hole ring 3 (sectors 0 and 12),
 * default loadout, stations created, d10 pinned to 5 (a plain hit) via
 * `forcedRollValue`. Override anything you need per test.
 */
import type {
  AllocateEnergyAction,
  BurnAction,
  BurnIntensity,
  CoastAction,
  DeallocateEnergyAction,
  Facing,
  FireWeaponAction,
  GameState,
  Missile,
  Player,
  PlayerAction,
  Position,
  RotateAction,
  ScanAction,
  ShipLoadout,
  ShipState,
  WellTransferAction,
} from "../models/game.ts";
import { DEFAULT_LOADOUT } from "../models/game.ts";
import type { Subsystem, SubsystemId } from "../models/subsystems.ts";
import type { GameEvent, GameEventType } from "../models/events.ts";
import type {
  DeliverCargoMission,
  DestroyShipMission,
  InterceptTransmissionMission,
  Mission,
  SurveyMission,
} from "../models/missions.ts";
import { createInitialShipState, updateSubsystem } from "../game/ship.ts";
import { createInitialStations, getStationForPlanet } from "../game/stations.ts";
import { executeTurn, type TurnResult } from "../game/turns.ts";
import { ringVelocity, wrapSector } from "../game/geometry.ts";
import { isInWeaponRange } from "../game/targeting.ts";
import { cratesForMissions } from "../game/missions/missionDeck.ts";
import { createDeterminismFields } from "../utils/rng.ts";

export const BH = "blackhole";
export const ALPHA = "planet-alpha";
export const BETA = "planet-beta";
export const GAMMA = "planet-gamma";

export function makePlayer(
  id: string,
  position: Position & { facing?: Facing } = { wellId: BH, ring: 3, sector: 0 },
  loadout: ShipLoadout = DEFAULT_LOADOUT,
  overrides: Partial<Player> = {}
): Player {
  const facing = position.facing ?? "prograde";
  const ship = createInitialShipState({ ...position, facing }, loadout, overrides.ship);
  return {
    id,
    name: id,
    ship,
    missionOffers: [],
    missions: [],
    completedMissionCount: 0,
    cargo: [],
    hasDeployed: true,
    hasSubmittedLoadout: true,
    home: { wellId: BH, ring: 4, sector: 0 },
    skipTurns: 0,
    intel: {},
    ...overrides,
    ...(overrides.ship ? { ship: { ...ship, ...overrides.ship } } : {}),
  };
}

export function testDeterminismDefaults(seed = 0xdeadbeef) {
  return { ...createDeterminismFields(seed), forcedRollValue: 5 };
}

export function makeGameState(players: Player[], overrides: Partial<GameState> = {}): GameState {
  return {
    turn: 1,
    activePlayerIndex: 0,
    players,
    missiles: [],
    stations: createInitialStations(),
    phase: "active",
    ...testDeterminismDefaults(),
    ...overrides,
  };
}

/** Two players on BH ring 3, sectors 0 and 12, player "p1" active. */
export function makeTwoPlayerGame(
  p1: Partial<Position & { facing: Facing; loadout: ShipLoadout }> = {},
  p2: Partial<Position & { facing: Facing; loadout: ShipLoadout }> = {},
  overrides: Partial<GameState> = {}
): GameState {
  const a = makePlayer("p1", { wellId: BH, ring: 3, sector: 0, ...p1 }, p1.loadout);
  const b = makePlayer("p2", { wellId: BH, ring: 3, sector: 12, ...p2 }, p2.loadout);
  return makeGameState([a, b], overrides);
}

export function getPlayer(state: GameState, id: string): Player {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new Error(`no player ${id}`);
  return p;
}

export function getShip(state: GameState, id: string): ShipState {
  return getPlayer(state, id).ship;
}

export function getSub(state: GameState, playerId: string, subsystemId: SubsystemId) {
  const sub = getShip(state, playerId).subsystems.find((s) => s.id === subsystemId);
  if (!sub) throw new Error(`no subsystem ${subsystemId} on ${playerId}`);
  return sub;
}

/** Directly power a subsystem (test setup shortcut; bypasses actions). */
export function withPower(
  state: GameState,
  playerId: string,
  subsystemId: SubsystemId,
  energy: number
): GameState {
  return {
    ...state,
    players: state.players.map((p) => {
      if (p.id !== playerId) return p;
      const current = p.ship.subsystems.find((s) => s.id === subsystemId)?.allocatedEnergy ?? 0;
      let ship = updateSubsystem(p.ship, subsystemId, {
        allocatedEnergy: energy,
        isPowered: energy > 0,
      });
      ship = {
        ...ship,
        reactor: {
          ...ship.reactor,
          availableEnergy: ship.reactor.availableEnergy + current - energy,
        },
      };
      return { ...p, ship };
    }),
  };
}

export function withShip(state: GameState, playerId: string, patch: Partial<ShipState>): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, ship: { ...p.ship, ...patch } } : p
    ),
  };
}

export function withPlayer(state: GameState, playerId: string, patch: Partial<Player>): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, ...patch } : p)),
  };
}

/** Directly patch one subsystem (isBroken, usedThisTurn, ammo, isRevealed...). */
export function withSub(
  state: GameState,
  playerId: string,
  subsystemId: SubsystemId,
  patch: Partial<Subsystem>
): GameState {
  return withShip(state, playerId, updateSubsystem(getShip(state, playerId), subsystemId, patch));
}

/** Give a player missions and the crates those missions imply. */
export function withMissions(state: GameState, playerId: string, missions: Mission[]): GameState {
  return withPlayer(state, playerId, { missions, cargo: cratesForMissions(missions) });
}

/** Reactor energy plus everything allocated: must always equal the reactor capacity. */
export function totalEnergy(ship: ShipState): number {
  return (
    ship.reactor.availableEnergy + ship.subsystems.reduce((sum, s) => sum + s.allocatedEnergy, 0)
  );
}

export function eventsOf<T extends GameEventType>(
  events: GameEvent[],
  type: T
): Array<Extract<GameEvent, { type: T }>> {
  return events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
}

export function eventTypes(events: GameEvent[]): GameEventType[] {
  return events.map((e) => e.type);
}

/** Sector on a planet's station ring from which a single coast lands on the station. */
export function approachSector(state: GameState, planetId: string): number {
  const station = getStationForPlanet(state.stations, planetId);
  if (!station) throw new Error(`no station at ${planetId}`);
  return wrapSector(station.sector - ringVelocity(planetId, station.ring));
}

/** p1 on `planet` ring 1, one coast short of the station; p2 parked far away. */
export function approachingStation(planetId: string, loadout?: ShipLoadout): GameState {
  const stations = createInitialStations();
  const sector = wrapSector(
    getStationForPlanet(stations, planetId)!.sector - ringVelocity(planetId, 1)
  );
  return makeGameState([
    makePlayer("p1", { wellId: planetId, ring: 1, sector }, loadout),
    makePlayer("p2", { wellId: BH, ring: 5, sector: 12 }),
  ]);
}

// ---------------------------------------------------------------------------
// Board tokens
// ---------------------------------------------------------------------------

export function makeMissile(overrides: Partial<Missile> = {}): Missile {
  return {
    id: "m-1",
    ownerId: "p1",
    targetId: "p2",
    wellId: BH,
    ring: 3,
    sector: 0,
    turnFired: 1,
    movesMade: 0,
    criticalTarget: "engines",
    launchedAfterMove: false,
    ...overrides,
  };
}

export function withMissile(state: GameState, overrides: Partial<Missile> = {}): GameState {
  return { ...state, missiles: [...state.missiles, makeMissile(overrides)] };
}

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

export const destroyMission = (
  targetPlayerId: string,
  id = `destroy-${targetPlayerId}`
): DestroyShipMission => ({
  id,
  type: "destroy_ship",
  isCompleted: false,
  targetPlayerId,
});
export const deliverMission = (
  pickupPlanetId: string,
  deliveryPlanetId: string,
  id = `deliver-${pickupPlanetId}-${deliveryPlanetId}`
): DeliverCargoMission => ({
  id,
  type: "deliver_cargo",
  isCompleted: false,
  pickupPlanetId,
  deliveryPlanetId,
  cargoId: `crate-${id}`,
});
export const interceptMission = (
  targetPlayerId: string,
  id = `intercept-${targetPlayerId}`
): InterceptTransmissionMission => ({
  id,
  type: "intercept_transmission",
  isCompleted: false,
  targetPlayerId,
  scanAcquired: false,
  dataCargoId: `data-${id}`,
});
export const surveyMission = (id = "survey-1", deliveryPlanetId = ALPHA): SurveyMission => ({
  id,
  type: "survey",
  isCompleted: false,
  deliveryPlanetId,
  surveyTurns: 0,
  surveyAcquired: false,
  dataCargoId: `data-${id}`,
});

// ---------------------------------------------------------------------------
// Actions (playerId is filled in by executeTurnAs)
// ---------------------------------------------------------------------------

type Draft<A extends PlayerAction> = Omit<A, "playerId">;

export const allocate = (
  subsystemId: SubsystemId,
  amount: number
): Draft<AllocateEnergyAction> => ({
  type: "allocate_energy",
  data: { subsystemId, amount },
});
export const deallocate = (
  subsystemId: SubsystemId,
  amount: number
): Draft<DeallocateEnergyAction> => ({
  type: "deallocate_energy",
  data: { subsystemId, amount },
});
export const coast = (sequence: number, activateScoop = false): Draft<CoastAction> => ({
  type: "coast",
  sequence,
  data: { activateScoop },
});
export const burn = (
  sequence: number,
  burnIntensity: BurnIntensity,
  sectorAdjustment = 0
): Draft<BurnAction> => ({
  type: "burn",
  sequence,
  data: { burnIntensity, sectorAdjustment },
});
export const rotate = (sequence: number, targetFacing: Facing): Draft<RotateAction> => ({
  type: "rotate",
  sequence,
  data: { targetFacing },
});
export const fire = (
  sequence: number,
  subsystemId: SubsystemId,
  targetPlayerId: string,
  criticalTarget: SubsystemId = "engines",
  compensateRecoil?: boolean
): Draft<FireWeaponAction> => ({
  type: "fire_weapon",
  sequence,
  data: { subsystemId, targetPlayerId, criticalTarget, compensateRecoil },
});
export const scan = (
  sequence: number,
  targetPlayerId: string,
  peekSlot: SubsystemId = "forward-0"
): Draft<ScanAction> => ({
  type: "scan",
  sequence,
  data: { targetPlayerId, peekSlot },
});
export const jump = (sequence: number, destinationWellId: string): Draft<WellTransferAction> => ({
  type: "well_transfer",
  sequence,
  data: { destinationWellId },
});

/** Execute a turn for the active player, stamping their id onto every action. */
export function executeTurnAs(
  state: GameState,
  ...actions: Array<Draft<PlayerAction>>
): TurnResult {
  const active = state.players[state.activePlayerIndex];
  return executeTurn(
    state,
    actions.map((a) => ({ ...a, playerId: active.id }) as PlayerAction)
  );
}

/** Execute and throw on validation errors (for setup steps). */
export function mustExecute(state: GameState, ...actions: Array<Draft<PlayerAction>>): GameState {
  const result = executeTurnAs(state, ...actions);
  if (result.errors?.length) throw new Error(result.errors.join("; "));
  return result.gameState;
}

// ---------------------------------------------------------------------------
// Scripted games (determinism / recording)
// ---------------------------------------------------------------------------

export interface ScriptedTurn {
  playerId: string;
  actions: PlayerAction[];
  state: GameState;
  events: GameEvent[];
}

/**
 * Two ships on black hole ring 3 two sectors apart, facing each other with
 * railguns, using the real d10. Each turn the active player fires (recoil
 * compensated) whenever the target is alive and in range, otherwise coasts.
 * The dice decide how the game unfolds, so runs only match when the seed does.
 */
export function scriptedGameStart(seed: number): GameState {
  const p1 = makePlayer(
    "p1",
    { wellId: BH, ring: 3, sector: 0, facing: "prograde" },
    DEFAULT_LOADOUT,
    {
      home: { wellId: BH, ring: 4, sector: 0 },
      skipTurns: 0,
    }
  );
  const p2 = makePlayer(
    "p2",
    { wellId: BH, ring: 3, sector: 2, facing: "retrograde" },
    DEFAULT_LOADOUT,
    {
      home: { wellId: BETA, ring: 3, sector: 0 },
    }
  );
  let state = makeGameState([p1, p2], {
    ...createDeterminismFields(seed),
    forcedRollValue: undefined,
  });
  for (const id of ["p1", "p2"]) {
    state = withPower(state, id, "forward-0", 4);
    state = withPower(state, id, "engines", 1);
  }
  return state;
}

export function scriptedActions(state: GameState): PlayerAction[] {
  const active = state.players[state.activePlayerIndex];
  const target = state.players.find((p) => p.id !== active.id)!;
  const railgun = active.ship.subsystems.find((s) => s.id === "forward-0")!;
  const canFire =
    railgun.isPowered &&
    !railgun.isBroken &&
    target.ship.hitPoints > 0 &&
    active.ship.reactionMass >= 1 &&
    isInWeaponRange(railgun, active.ship, {
      wellId: target.ship.wellId,
      ring: target.ship.ring,
      sector: target.ship.sector,
    });
  const actions: PlayerAction[] = [];
  if (canFire) {
    actions.push({
      type: "fire_weapon",
      playerId: active.id,
      sequence: 1,
      data: {
        subsystemId: "forward-0",
        targetPlayerId: target.id,
        criticalTarget: "side-2",
        compensateRecoil: true,
      },
    });
  }
  actions.push({
    type: "coast",
    playerId: active.id,
    sequence: actions.length + 1,
    data: { activateScoop: false },
  });
  return actions;
}

/** Play `turnCount` scripted turns from `start`, throwing on any rejected turn. */
export function playScripted(start: GameState, turnCount: number): ScriptedTurn[] {
  const turns: ScriptedTurn[] = [];
  let state = start;
  for (let i = 0; i < turnCount && state.phase === "active"; i++) {
    const playerId = state.players[state.activePlayerIndex].id;
    const actions = scriptedActions(state);
    const result = executeTurn(state, actions);
    if (result.errors?.length)
      throw new Error(`scripted turn ${i} rejected: ${result.errors.join("; ")}`);
    state = result.gameState;
    turns.push({ playerId, actions, state, events: result.events });
  }
  return turns;
}

/** Recursive canonical JSON: keys sorted at every level. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (v as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return v;
  });
}
