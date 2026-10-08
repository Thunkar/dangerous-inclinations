/**
 * Shared test helpers. Build small, explicit game states and actions.
 *
 * Defaults: two deployed players on black hole ring 3 (sectors 0 and 12),
 * default loadout, stations created, d10 pinned to 5 (a plain hit) via
 * `forcedRollValue`. Override anything you need per test.
 */
import { expect } from "vitest";
import type {
  BurnAction,
  BurnIntensity,
  CoastAction,
  PowerAction,
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
  RepairAction,
  DockSaleAction,
  EscortMarkAction,
  SalvageAction,
  SurveyAction,
  SeizeAction,
} from "../models/game.ts";
import { OPENING_ROUNDS, DEFAULT_LOADOUT, FIRST_TURN } from "../models/game.ts";
import type { Subsystem, SubsystemId, SubsystemType } from "../models/subsystems.ts";
import type { GameEvent, GameEventType } from "../models/events.ts";
import type {
  SurveyMission,
  DeliverCargoMission,
  DestroyShipMission,
  PiracyMission,
  TankerMission,
  EscortMission,
  SalvageMission,
  InterceptTransmissionMission,
  Mission,
  Cargo,
} from "../models/missions.ts";
import { DEFAULT_POINTS_TO_WIN } from "../models/missions.ts";
import { createInitialShipState, updateSubsystem } from "../game/ship.ts";
import { createInitialStations, getStationForPlanet } from "../game/stations.ts";
import { PLANET_OUTER_RING } from "../models/gravityWells.ts";
import { executeTurn, type TurnResult } from "../game/turns.ts";
import { ringVelocity, wrapSector } from "../game/geometry.ts";
import { isInWeaponRange } from "../game/targeting.ts";
import { cratesForMissions } from "../game/missions/missionDeck.ts";
import { createDeterminismFields } from "../utils/rng.ts";
import { viewFor } from "../game/view.ts";
import { analyzeSituation, botDecideActions } from "../ai/index.ts";
import { generateCandidates } from "../ai/planner.ts";
import { DEFAULT_BOT_PARAMETERS, type ActionPlan } from "../ai/types.ts";

export const BH = "blackhole";
export const ALPHA = "planet-alpha";
export const BETA = "planet-beta";
export const GAMMA = "planet-gamma";

/**
 * Black hole ring 3, sector 4: where a ship on sector 0 of that ring lands
 * after a coast, so a rival placed here is the one a coasting ship ends beside.
 */
export const LANDING: Position = { wellId: BH, ring: 3, sector: 4 };

/** A position on `wellId` (the black hole by default) at `ring`, `sector`. */
export const at = (ring: number, sector: number, wellId: string = BH): Position => ({
  wellId,
  ring,
  sector,
});

/** A ship on black hole `ring`, `sector`, facing `facing`: the shooter's seat in a weapons test. */
export const attackerAt = (
  ring: number,
  sector: number,
  facing: Facing = "prograde"
): Position & { facing: Facing } => ({ wellId: BH, ring, sector, facing });

// ---------------------------------------------------------------------------
// Loadouts
// ---------------------------------------------------------------------------

type Slot = SubsystemType | null;
const hull = (bow: Slot, s0: Slot, s1: Slot, s2: Slot, s3: Slot): ShipLoadout => ({
  forwardSlots: [bow],
  sideSlots: [s0, s1, s2, s3],
});

/**
 * Every hull a test flies, by what is in its slots (bow; side-0, side-1 port,
 * side-2, side-3 starboard). A test that needs a ship names one of these.
 */
export const LOADOUTS = {
  /** The default hull: railgun; laser, laser, shields, missiles. */
  gunship: DEFAULT_LOADOUT,
  /** Railgun; port laser, shields, starboard laser, missiles: a laser on each side. */
  starboardLaser: hull("railgun", "laser", "shields", "laser", "missiles"),
  /** Railgun; laser, rack, shields, missiles: every kind of gun, a port laser first. */
  brawler: hull("railgun", "laser", "ballistic_rack", "shields", "missiles"),
  /** Railgun; rack, laser, shields, missiles: every kind of gun, the rack on side-0. */
  railRack: hull("railgun", "ballistic_rack", "laser", "shields", "missiles"),
  /** Railgun; rack, laser, shields, laser: one rack and no launcher. */
  rack: hull("railgun", "ballistic_rack", "laser", "shields", "laser"),
  /** Railgun; rack, laser, rack, laser: two racks, one a side. */
  twoRacks: hull("railgun", "ballistic_rack", "laser", "ballistic_rack", "laser"),
  /** Railgun; rack, laser, rack, missiles: two racks and a launcher. */
  racksAndMissiles: hull("railgun", "ballistic_rack", "laser", "ballistic_rack", "missiles"),
  /** Railgun; rack, laser, shields, shields: a rack in front of two walls. */
  rackTwoShields: hull("railgun", "ballistic_rack", "laser", "shields", "shields"),
  /** Railgun; rack, radiator, shields, missiles: every gun aboard is one shields stop. */
  slugger: hull("railgun", "ballistic_rack", "radiator", "shields", "missiles"),
  /** Railgun; rack, radiator, shields, shields: off its ring only the rack bears. */
  railgunRack: hull("railgun", "ballistic_rack", "radiator", "shields", "shields"),
  /** Railgun; laser, rack, shields, radiator: the hunter the simulator's overrides name. */
  hunter: hull("railgun", "laser", "ballistic_rack", "shields", "radiator"),
  /** Railgun; laser, laser, shields, shields: two walls, no launcher. */
  twoShields: hull("railgun", "laser", "laser", "shields", "shields"),
  /** Railgun; four shields: more to light than a ship can cool. */
  fourShields: hull("railgun", "shields", "shields", "shields", "shields"),
  /** Railgun; radiator, laser, shields, laser: one radiator. */
  radiator: hull("railgun", "radiator", "laser", "shields", "laser"),
  /** Railgun; radiator, radiator, shields, laser: two radiators. */
  twoRadiators: hull("railgun", "radiator", "radiator", "shields", "laser"),
  /** Railgun; radiator, radiator, shields, shields: the railgun is the only gun. */
  railgunOnly: hull("railgun", "radiator", "radiator", "shields", "shields"),
  /** Railgun; missiles, radiator, shields, shields: a railgun and a launcher. */
  raider: hull("railgun", "missiles", "radiator", "shields", "shields"),
  /** Sensor; laser, laser, shields, missiles: the default hull with a sensor bow. */
  sensor: hull("sensor_array", "laser", "laser", "shields", "missiles"),
  /** Sensor; laser, plasma, shields, missiles: two port guns of different kinds. */
  sensorGuns: hull("sensor_array", "laser", "plasma_cannon", "shields", "missiles"),
  /** Sensor; radiator, laser, shields, missiles. */
  sensorRadiator: hull("sensor_array", "radiator", "laser", "shields", "missiles"),
  /** Sensor; laser, shields, radiator, missiles. */
  sensorLaserMissiles: hull("sensor_array", "laser", "shields", "radiator", "missiles"),
  /** Sensor; laser, missiles, shields, radiator: both port slots armed. */
  sensorPortGuns: hull("sensor_array", "laser", "missiles", "shields", "radiator"),
  /** Sensor; laser, shields, radiator, radiator: one port laser. */
  sensorPortLaser: hull("sensor_array", "laser", "shields", "radiator", "radiator"),
  /** Sensor; shields, radiator, radiator, laser: one starboard laser, 2 damage. */
  sensorStarboardLaser: hull("sensor_array", "shields", "radiator", "radiator", "laser"),
  /** Sensor; shields, radiator, radiator, rack: the only gun is one shields stop. */
  sensorRack: hull("sensor_array", "shields", "radiator", "radiator", "ballistic_rack"),
  /** Sensor; rack, laser, shields, radiator: a rack on side-0 and a wall on side-2. */
  sensorRackWall: hull("sensor_array", "ballistic_rack", "laser", "shields", "radiator"),
  /** Sensor; radiator, missiles, shields, rack: a launcher and a rack. */
  sensorMissilesRack: hull("sensor_array", "radiator", "missiles", "shields", "ballistic_rack"),
  /** Sensor; missiles, disruptor, shields, radiator: a salvo to strip a wall, then the EMP. */
  sensorMissilesDisruptor: hull("sensor_array", "missiles", "disruptor", "shields", "radiator"),
  /** Sensor; radiator, radiator, shields, shields: walls and nothing that shoots. */
  sensorWalls: hull("sensor_array", "radiator", "radiator", "shields", "shields"),
  /** Sensor; shields, shields, radiator, radiator: no weapon aboard. */
  unarmed: hull("sensor_array", "shields", "shields", "radiator", "radiator"),
  /** Sensor; plasma, shields, plasma, radiator: a plasma cannon each side. */
  plasma: hull("sensor_array", "plasma_cannon", "shields", "plasma_cannon", "radiator"),
  /** Disruptor; shields, shields, radiator, radiator: nothing else that shoots. */
  disruptor: hull("disruptor", "shields", "shields", "radiator", "radiator"),
  /** Disruptor; plasma, shields, radiator, radiator: plasma strips the wall the disruptor needs gone. */
  disruptorPlasma: hull("disruptor", "plasma_cannon", "shields", "radiator", "radiator"),
  /** Disruptor; laser, shields, radiator, radiator. */
  disruptorLaser: hull("disruptor", "laser", "shields", "radiator", "radiator"),
  /** Disruptor; disruptor, shields, radiator, radiator: one in the bow, one on side-0. */
  twoDisruptors: hull("disruptor", "disruptor", "shields", "radiator", "radiator"),
  /** Compressor; missiles, laser, shields, laser. */
  compressor: hull("fuel_compressor", "missiles", "laser", "shields", "laser"),
  /** Compressor; laser, laser, shields, radiator. */
  compressorLasers: hull("fuel_compressor", "laser", "laser", "shields", "radiator"),
  /** Compressor; shields, shields, radiator, laser: the hauler with no sensor. */
  hauler: hull("fuel_compressor", "shields", "shields", "radiator", "laser"),
  /** Missiles; missiles, missiles, radiator, shields: the missile boat that makes salvos fly. */
  missileBoat: hull("missiles", "missiles", "missiles", "radiator", "shields"),
  /** A launcher in the bow and four empty side slots. */
  missileBow: hull("missiles", null, null, null, null),
  /** An empty bow and one port laser: nothing else fires. */
  laserOnly: hull(null, "laser", null, null, null),
} satisfies Record<string, ShipLoadout>;

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
    points: 0,
    cargo: [],
    hasDeployed: true,
    hasSubmittedLoadout: true,
    home: { wellId: BH, ring: 4, sector: 0 },
    recovering: false,
    soldAt: [],
    intel: {},
    ...overrides,
    ...(overrides.ship ? { ship: { ...ship, ...overrides.ship } } : {}),
  };
}

function testDeterminismDefaults(seed = 0xdeadbeef) {
  return { ...createDeterminismFields(seed), forcedRollValue: 5 };
}

export function makeGameState(players: Player[], overrides: Partial<GameState> = {}): GameState {
  return {
    // The first round weapons are live in, because that is the ordinary case:
    // a test about the opening round's ceasefire passes `turn: FIRST_TURN`.
    turn: FIRST_TURN + OPENING_ROUNDS,
    activePlayerIndex: 0,
    players,
    missiles: [],
    wrecks: [],
    stations: createInitialStations(),
    phase: "active",
    pointsToWin: DEFAULT_POINTS_TO_WIN,
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

/**
 * Directly put energy on a subsystem (test setup shortcut; bypasses actions).
 * It is what the tile would carry between turns: the active player's own
 * loadout is cleared when their turn starts, so this is for a player who is
 * not about to act (a target's shields, a rack that will intercept).
 */
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
      const ship = updateSubsystem(p.ship, subsystemId, {
        allocatedEnergy: energy,
      });
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

/**
 * The player's engines broken, so every move it has is a coast from where it
 * was put, and a cube of heat on the track, so running cold to repair them is
 * not on offer: what a bot does then is shoot.
 */
export function grounded(state: GameState, playerId = "p1"): GameState {
  return withShip(withSub(state, playerId, "engines", { isBroken: true }), playerId, {
    heat: { currentHeat: 1 },
  });
}

/** Give a player missions and the crates those missions imply. */
export function withMissions(state: GameState, playerId: string, missions: Mission[]): GameState {
  return withPlayer(state, playerId, { missions, cargo: cratesForMissions(missions) });
}

/** Cubes sitting on the loadout: what the ship will pay in heat at its check. */
export function cubesOnLoadout(ship: ShipState): number {
  return ship.subsystems.reduce((sum, s) => sum + s.allocatedEnergy, 0);
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

/** Where `planetId`'s station is now: its berth. */
export function berthOf(state: GameState, planetId: string): Position {
  const station = getStationForPlanet(state.stations, planetId);
  if (!station) throw new Error(`no station at ${planetId}`);
  return { wellId: planetId, ring: station.ring, sector: station.sector };
}

/** `playerId` moved onto `planetId`'s station ring, one coast short of the station. */
export function shortOfStation(state: GameState, playerId: string, planetId: string): GameState {
  const { ring } = berthOf(state, planetId);
  return withShip(state, playerId, {
    wellId: planetId,
    ring,
    sector: approachSector(state, planetId),
  });
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
    movesMade: 0,
    criticalTarget: "engines",
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
  id = `intercept-${targetPlayerId}`,
  deliveryPlanetId: string = ALPHA
): InterceptTransmissionMission => ({
  id,
  type: "intercept_transmission",
  isCompleted: false,
  targetPlayerId,
  deliveryPlanetId,
  dataCargoId: `data-${id}`,
});
export const surveyMission = (id = "survey-1"): SurveyMission => ({
  id,
  type: "survey",
  isCompleted: false,
  dataCargoId: `data-${id}`,
});

export const piracyMission = (id = "piracy-1"): PiracyMission => ({
  id,
  type: "piracy",
  isCompleted: false,
  cargoId: `loot-${id}`,
});

export const tankerMission = (id = "tanker-1"): TankerMission => ({
  id,
  type: "tanker",
  isCompleted: false,
});

export const escortMission = (
  id = "escort-1",
  markedPlayerId: string | null = null
): EscortMission => ({
  id,
  type: "escort",
  isCompleted: false,
  markedPlayerId,
});

export const salvageMission = (id = "salvage-1"): SalvageMission => ({
  id,
  type: "salvage",
  isCompleted: false,
  cargoId: `salvage-${id}`,
});

// ---------------------------------------------------------------------------
// Cargo
// ---------------------------------------------------------------------------

/** A Deliver crate, aboard unless `isPickedUp` is false; its card is {@link deliverMission}'s id. */
export const crateCargo = (pickup: string, delivery: string, isPickedUp = true): Cargo => ({
  id: `crate-${pickup}-${delivery}`,
  missionId: `deliver-${pickup}-${delivery}`,
  kind: "crate",
  pickupPlanetId: pickup,
  deliveryPlanetId: delivery,
  isPickedUp,
});

/** A crate aboard that sells at any station: Piracy's loot. */
export const lootCargo = (id: string, missionId: string): Cargo => ({
  id,
  missionId,
  kind: "crate",
  deliveryPlanetId: "any",
  isPickedUp: true,
});

/** Data aboard, filed at any station: a Survey's dive or a wreck's black box. */
export const dataCargo = (id = "data-1", missionId = "survey-1"): Cargo => ({
  id,
  missionId,
  kind: "data",
  deliveryPlanetId: "any",
  isPickedUp: true,
});

/** The data an Intercept's scan or a Survey's dive puts aboard, filed where the card says. */
export const takenData = (mission: InterceptTransmissionMission | SurveyMission): Cargo => ({
  id: mission.dataCargoId,
  missionId: mission.id,
  kind: "data",
  deliveryPlanetId: mission.type === "intercept_transmission" ? mission.deliveryPlanetId : "any",
  isPickedUp: true,
});

/** The Deliver card's own crate (its id is the card's `cargoId`), aboard unless `isPickedUp` is false. */
export const crateOf = (mission: DeliverCargoMission, isPickedUp = true): Cargo => ({
  ...cratesForMissions([mission])[0],
  isPickedUp,
});

/** The loot a Piracy card's seizure is sold as, aboard. */
export const lootOf = (mission: PiracyMission): Cargo => lootCargo(mission.cargoId, mission.id);

/** The black box a Salvage card takes from a wreck, aboard. */
export const blackBoxOf = (mission: SalvageMission): Cargo =>
  dataCargo(mission.cargoId, mission.id);

/** The same items, every one of them aboard. */
export const cratesAboard = (cargo: Cargo[]): Cargo[] =>
  cargo.map((c) => ({ ...c, isPickedUp: true }));

/**
 * p1 holds `pirate` and sits one coast short of `at`; p2 holds `victim` at
 * `at` with everything those cards imply aboard (the crates picked up, a
 * Survey's or an Intercept's data taken), so p1's coast ends beside it. A
 * `bystander` hand puts p3 at `at` too, loaded the same way.
 */
export function alongside(
  pirate: Mission[],
  victim: Mission[],
  at: Position = LANDING,
  bystander?: Mission[]
): GameState {
  let state = makeGameState([
    makePlayer("p1", { ...at, sector: wrapSector(at.sector - ringVelocity(at.wellId, at.ring)) }),
    makePlayer("p2", at),
    ...(bystander ? [makePlayer("p3", at)] : []),
  ]);
  state = withMissions(state, "p1", pirate);
  const loaded: Array<[string, Mission[]]> = [["p2", victim]];
  if (bystander) loaded.push(["p3", bystander]);
  for (const [id, missions] of loaded) {
    state = withMissions(state, id, missions);
    const data = missions.flatMap((m) =>
      m.type === "survey" || m.type === "intercept_transmission" ? [takenData(m)] : []
    );
    state = withPlayer(state, id, {
      cargo: [...cratesAboard(getPlayer(state, id).cargo), ...data],
    });
  }
  return state;
}

/** What a station reads off an arriving ship: its hold, its hand, its tank and where it has sold. */
export function dockingShip(state: GameState, playerId: string) {
  const p = getPlayer(state, playerId);
  return {
    cargo: p.cargo,
    missions: p.missions,
    reactionMass: p.ship.reactionMass,
    soldAt: p.soldAt,
  };
}

// ---------------------------------------------------------------------------
// Actions (playerId is filled in by executeTurnAs)
// ---------------------------------------------------------------------------

type Draft<A extends PlayerAction> = Omit<A, "playerId">;

/** Power a shield, rack or sensor with `amount` cubes (absent: the tile's minimum). */
export const power = (
  sequence: number,
  subsystemId: SubsystemId,
  amount?: number
): Draft<PowerAction> => ({
  type: "power",
  sequence,
  data: amount === undefined ? { subsystemId } : { subsystemId, amount },
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
  compensateRecoil?: boolean,
  /** Missiles only: how many rounds the salvo puts in the air. */
  count?: number
): Draft<FireWeaponAction> => ({
  type: "fire_weapon",
  sequence,
  data: { subsystemId, targetPlayerId, criticalTarget, compensateRecoil, count },
});
/** Name the tile a cold ship's crew will fix (no sequence: it is not tactical). */
export const repair = (subsystemId: SubsystemId): Draft<RepairAction> => ({
  type: "repair",
  data: { subsystemId },
});
/** Name what a visit sells if the turn arrives at a station: a cargo id, "fuel" or "none" (no sequence either). */
export const dockSale = (sale: string): Draft<DockSaleAction> => ({
  type: "dock_sale",
  data: { sale },
});
/** Put an Escort marker on a carrier on your ring, at this point in the sequence. */
export const escortMark = (sequence: number, carrierId: string): Draft<EscortMarkAction> => ({
  type: "escort_mark",
  sequence,
  data: { carrierId },
});
/** Take a Survey's data on Black Hole Ring 1, at this point in the sequence. */
export const survey = (sequence: number): Draft<SurveyAction> => ({
  type: "survey",
  sequence,
  data: {},
});
/**
 * Take a wreck's black box in your sector, at this point in the sequence:
 * the one named, or with no id the first wreck there at that point.
 */
export const salvage = (sequence: number, wreckId?: string): Draft<SalvageAction> => ({
  type: "salvage",
  sequence,
  data: wreckId === undefined ? {} : { wreckId },
});
/** Take an item off a ship in your sector, at this point in the sequence. */
export const seize = (
  sequence: number,
  victimId: string,
  cargoId: string
): Draft<SeizeAction> => ({
  type: "seize",
  sequence,
  data: { victimId, cargoId },
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
export const jump = (
  sequence: number,
  destinationWellId: string,
  sectorAdjustment = 0
): Draft<WellTransferAction> => ({
  type: "well_transfer",
  sequence,
  data: { destinationWellId, sectorAdjustment },
});

/** A coast with `playerId` already stamped on it, for `executeTurn` called directly. */
export const coastAs = (playerId: string): PlayerAction => ({ ...coast(1), playerId });

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

/** The engine refused the turn and nothing moved. */
export function expectRefused(result: TurnResult, before: GameState): void {
  expect(result.errors?.length).toBeGreaterThan(0);
  expect(result.gameState).toBe(before);
}

/**
 * The engine refuses `refused` and accepts `accepted`, which differs from it
 * in one thing: that thing is why the first was refused, whatever the message
 * says.
 */
export function expectRefusedUnless(refused: TurnResult, accepted: TurnResult): void {
  expect(refused.errors?.length).toBeGreaterThan(0);
  expect(accepted.errors).toBeUndefined();
}

/**
 * Run `check` on every case in turn. The first case that fails stops the loop
 * and its assertion carries the case's label, so one test can walk a table of
 * hundreds of turns and still say which one broke.
 */
export function checkEach<T>(
  cases: readonly T[],
  label: (c: T) => string,
  check: (c: T) => void
): void {
  for (const c of cases) {
    try {
      check(c);
    } catch (error) {
      if (error instanceof Error) error.message = `${label(c)}: ${error.message}`;
      throw error;
    }
  }
}

/** Execute and throw on validation errors (for setup steps). */
export function mustExecute(state: GameState, ...actions: Array<Draft<PlayerAction>>): GameState {
  const result = executeTurnAs(state, ...actions);
  if (result.errors?.length) throw new Error(result.errors.join("; "));
  return result.gameState;
}

// ---------------------------------------------------------------------------
// Bot turns
// ---------------------------------------------------------------------------

/** What `viewerId`'s bot (p1's by default) reads off the board from its own view. */
export function situationOf(state: GameState, viewerId = "p1") {
  return analyzeSituation(viewFor(state, viewerId), DEFAULT_BOT_PARAMETERS);
}

/** The engine accepts the turn `botId`'s bot decides on. */
export function expectBotTurnAccepted(state: GameState, botId: string): void {
  expect(
    executeTurn(state, botDecideActions(viewFor(state, botId)).actions).errors
  ).toBeUndefined();
}

/** The shots `botId`'s bot would take this turn. */
export function shotsOf(state: GameState, botId: string): FireWeaponAction[] {
  return botDecideActions(viewFor(state, botId)).actions.filter(
    (a): a is FireWeaponAction => a.type === "fire_weapon"
  );
}

/** The plan that shoots at `targetId`, as `botId`'s planner builds it. */
export function planAgainst(state: GameState, botId: string, targetId: string): ActionPlan {
  const plan = generateCandidates(situationOf(state, botId), DEFAULT_BOT_PARAMETERS).find(
    (c) => c.targetId === targetId
  );
  if (!plan) throw new Error(`no candidate shooting at ${targetId}`);
  return plan;
}

/**
 * Play turns until `done` or the budget runs out. The bot decides from its
 * own view; every other player coasts. `before` sees each of the bot's turns
 * before it is played, `after` every state the table reaches.
 */
export function playUntil(
  start: GameState,
  botId: string,
  done: (state: GameState) => boolean,
  maxTurns = 60,
  hooks: {
    before?: (state: GameState, actions: PlayerAction[]) => void;
    after?: (state: GameState, turn: number) => void;
  } = {}
): GameState {
  let state = start;
  for (let i = 0; i < maxTurns && state.phase === "active" && !done(state); i++) {
    const active = state.players[state.activePlayerIndex];
    const mine = active.id === botId;
    const actions = mine ? botDecideActions(viewFor(state, botId)).actions : [coastAs(active.id)];
    if (mine) hooks.before?.(state, actions);
    const result = executeTurn(state, actions);
    expect(result.errors, `turn ${i} by ${active.id}`).toBeUndefined();
    state = result.gameState;
    hooks.after?.(state, i);
  }
  return state;
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
    }
  );
  const p2 = makePlayer(
    "p2",
    { wellId: BH, ring: 3, sector: 2, facing: "retrograde" },
    DEFAULT_LOADOUT,
    {
      home: { wellId: BETA, ring: PLANET_OUTER_RING, sector: 0 },
    }
  );
  const state = makeGameState([p1, p2], {
    ...createDeterminismFields(seed),
    forcedRollValue: undefined,
  });
  // Nothing to pre-power: the shot powers the railgun and the compensation
  // powers the engines, and both are dark again by the next turn.
  return state;
}

function scriptedActions(state: GameState): PlayerAction[] {
  const active = state.players[state.activePlayerIndex];
  const target = state.players.find((p) => p.id !== active.id)!;
  const railgun = active.ship.subsystems.find((s) => s.id === "forward-0")!;
  const canFire =
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
