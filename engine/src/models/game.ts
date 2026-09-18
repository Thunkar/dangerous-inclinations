import type { ShipAppearance } from "./appearance.ts";
import type {
  Subsystem,
  SubsystemId,
  SubsystemType,
  ReactorState,
  HeatState,
} from "./subsystems.ts";
import type { Mission, Cargo } from "./missions.ts";

/**
 * Ship loadout: one forward slot and four side slots.
 * Fixed systems (engines, thrusters, scoop) are always present.
 */
export interface ShipLoadout {
  forwardSlots: [SubsystemType | null];
  sideSlots: [
    SubsystemType | null,
    SubsystemType | null,
    SubsystemType | null,
    SubsystemType | null,
  ];
}

export interface LoadoutValidation {
  valid: boolean;
  errors: string[];
}

export const DEFAULT_LOADOUT: ShipLoadout = {
  forwardSlots: ["railgun"],
  sideSlots: ["laser", "laser", "shields", "missiles"],
};

export const MIN_PLAYERS = 2;
/**
 * Six seats. The board holds them comfortably — everyone deploys on the black
 * hole's home ring, which is 24 sectors wide — but the table changes shape as
 * seats are added: each opponent puts another Destroy and another Intercept in
 * every deck, so a six-player game is a fight and a three-player game is a
 * trade route. Two seats is still legal and still thin.
 */
export const MAX_PLAYERS = 6;

/** Base critical hit chance in percentage points (10 = d10 roll of 10). */
export const BASE_CRITICAL_CHANCE = 10;

export const REACTOR_CAPACITY = 10;
export const MAX_REACTION_MASS = 10;
export const STARTING_REACTION_MASS = 10;
export const DEFAULT_DISSIPATION_CAPACITY = 5;
export const STARTING_HIT_POINTS = 10;

/**
 * The top of the heat track, and the reason there is a track at all.
 *
 * Heat used to reset to zero at every check, which made dissipation a spend
 * limit rather than a rate: under it everything was free and over it
 * everything was strictly dominated, so nobody ever crossed the line. Measured
 * on 18 Sept 2026 over 18,418 acting turns, 69% of turns ended with four or
 * more points of dissipation unused and only 1.5% went over at all — which is
 * also why a critical dumping a powered tile's cubes cost 0.21 hull a game
 * across four seats: there was nothing for it to land on.
 *
 * So heat carries. At a check the excess over MAX_HEAT is hull damage and the
 * track stops there; then the ship dissipates and keeps the rest
 * into the next turn. The long run is unchanged — a ship generating more than
 * it dissipates still pays the difference every turn once it saturates — but there
 * is now a buffer to spend, so running hot is a state you choose to enter and
 * have to climb out of. Ten to match the hull track: one cube, one track.
 */
export const MAX_HEAT = 10;

/**
 * Heat the defender takes per point of damage a shield absorbs. Two since
 * 15 Sept 2026: soaking a volley is a decision about how much heat to eat.
 */
export const SHIELD_HEAT_PER_POINT = 2;

/**
 * Rounds at the start of the game in which no weapon fires.
 *
 * Everyone deploys on the same ring, in a sector they picked while the board
 * was still empty, so before anyone has moved the table is a firing line: the
 * first seat opens on a neighbour who never had a turn, and point blank (RULES
 * §Firing) means the neighbour two sectors away is in range of everything.
 * Holding fire for one round costs the aggressor nothing it cannot get back
 * and gives every seat one turn to choose where it is standing.
 */
export const CEASEFIRE_ROUNDS = 1;

/**
 * The round a game starts play on. Deployment hands the board over at this
 * number (`game/deployment.ts`), so it is the first round anyone acts in —
 * not zero, which is the value a game carries while it is still being set up.
 */
export const FIRST_TURN = 1;

/** Whether weapons are live yet, given `state.turn`. */
export function weaponsAreLive(turn: number): boolean {
  return turn >= FIRST_TURN + CEASEFIRE_ROUNDS;
}

export type Facing = "prograde" | "retrograde";
export type BurnIntensity = "soft" | "medium" | "hard";

export type GravityWellId = string; // 'blackhole' | 'planet-alpha' | ...
export type GravityWellType = "blackhole" | "planet";

export interface Position {
  wellId: GravityWellId;
  ring: number;
  sector: number;
}

export interface RingConfig {
  ring: number;
  velocity: number; // sectors per turn
  sectors: number;
}

export interface GravityWell {
  id: GravityWellId;
  name: string;
  type: GravityWellType;
  rings: RingConfig[];
}

/**
 * A contiguous run of sectors on one ring that belongs to a transfer lane.
 */
export interface TransferArc {
  wellId: GravityWellId;
  ring: number;
  startSector: number;
  length: number;
}

/**
 * A two-way lane connecting an arc on the black hole's outer ring with an
 * arc on a planet's outer ring. Jumping keeps the ship's offset inside the arc.
 */
export interface TransferLane {
  id: string;
  planetId: GravityWellId;
  /**
   * Lanes are one-way: an outbound lane is jumped from its black hole arc to
   * its planet arc, an inbound lane from its planet arc back to the black hole.
   */
  direction: "outbound" | "inbound";
  blackHoleArc: TransferArc;
  planetArc: TransferArc;
}

/**
 * Missile in flight. Missiles are public tokens on the board.
 */
export interface Missile {
  id: string;
  ownerId: string;
  targetId: string;
  wellId: GravityWellId;
  ring: number;
  sector: number;
  turnFired: number;
  /** Times this missile has moved at the end of its owner's turn. Expires at maxMoves. */
  movesMade: number;
  /** Slot the warhead breaks on a critical hit. */
  criticalTarget: SubsystemId;
  /**
   * Launched after the ship had already moved this turn: it rode along with
   * the ship, so it does not drift again at the end of this turn.
   */
  launchedAfterMove: boolean;
}

export interface ShipState {
  wellId: GravityWellId;
  ring: number;
  sector: number;
  facing: Facing;
  /**
   * Fuel aboard. Public (RULES §Hidden information): the cubes sit on the mat
   * where anyone can count them. A tank was private and a spent pile public
   * for a day, which fooled nobody — every ship starts with the same ten and
   * every burn is announced, so the arithmetic was there for the doing.
   */
  reactionMass: number;
  hitPoints: number;
  maxHitPoints: number;
  subsystems: Subsystem[];
  reactor: ReactorState;
  heat: HeatState;
  loadout: ShipLoadout;
}

interface BaseAction {
  playerId: string;
  /** Tactical actions (rotate/move/fire/scan/jump) execute in sequence order. */
  sequence?: number;
}

export interface CoastAction extends BaseAction {
  type: "coast";
  data: { activateScoop: boolean };
}

export interface BurnAction extends BaseAction {
  type: "burn";
  data: { burnIntensity: BurnIntensity; sectorAdjustment: number };
}

export interface RotateAction extends BaseAction {
  type: "rotate";
  data: { targetFacing: Facing };
}

export interface AllocateEnergyAction extends BaseAction {
  type: "allocate_energy";
  data: { subsystemId: SubsystemId; amount: number };
}

export interface DeallocateEnergyAction extends BaseAction {
  type: "deallocate_energy";
  data: { subsystemId: SubsystemId; amount: number };
}

export interface FireWeaponAction extends BaseAction {
  type: "fire_weapon";
  data: {
    subsystemId: SubsystemId; // which weapon fires
    targetPlayerId: string;
    /** Slot to break if the shot is a critical hit. */
    criticalTarget: SubsystemId;
    /** Railgun only: engines cancel the recoil (1 mass, engine heat). */
    compensateRecoil?: boolean;
  };
}

export interface ScanAction extends BaseAction {
  type: "scan";
  data: {
    targetPlayerId: string;
    /** Face-down slot of the target to look at. */
    peekSlot: SubsystemId;
  };
}

export interface WellTransferAction extends BaseAction {
  type: "well_transfer";
  data: {
    destinationWellId: GravityWellId;
    /**
     * Phasing, as on a burn: sectors to shift the arrival for 1 fuel each,
     * bounded by the arrival arc. Absent = land on the matching sector.
     */
    sectorAdjustment?: number;
  };
}

/** Deployment phase: place your ship and Home marker on a planet's outer ring. */
export interface DeployShipAction extends BaseAction {
  type: "deploy_ship";
  data: { wellId: GravityWellId; sector: number };
}

/**
 * A standing order for the turn, not a tactical action: name the tile the crew
 * will get to if the ship is cold at its heat check. It has no sequence because
 * it does not happen at a point in the turn — it happens at the end of it, and
 * only if nothing on the mat made heat.
 */
export interface RepairAction extends BaseAction {
  type: "repair";
  data: { subsystemId: SubsystemId };
}

export type MovementAction = CoastAction | BurnAction | WellTransferAction;

export type TacticalAction =
  | RotateAction
  | CoastAction
  | BurnAction
  | WellTransferAction
  | FireWeaponAction
  | ScanAction;

export type PlayerAction =
  | TacticalAction
  | AllocateEnergyAction
  | DeallocateEnergyAction
  | RepairAction
  | DeployShipAction;

export const TACTICAL_ACTION_TYPES: ReadonlySet<PlayerAction["type"]> = new Set([
  "rotate",
  "coast",
  "burn",
  "well_transfer",
  "fire_weapon",
  "scan",
]);

export function isTacticalAction(action: PlayerAction): action is TacticalAction {
  return TACTICAL_ACTION_TYPES.has(action.type);
}

export interface Player {
  /** Optional for compatibility with historical recordings. */
  appearance?: ShipAppearance;
  id: string;
  name: string;
  ship: ShipState;
  /** Offered during loadout; the player keeps MISSIONS_PER_PLAYER of them. */
  missionOffers: Mission[];
  missions: Mission[];
  completedMissionCount: number;
  cargo: Cargo[];
  hasDeployed: boolean;
  hasSubmittedLoadout: boolean;
  /** Where the ship deployed; destroyed ships return here. */
  home: Position | null;
  /** Turns still to sit out after respawning (a destroyed ship loses the respawn turn and the next). */
  skipTurns: number;
  /**
   * Face-down slots of other players this player has seen through scans.
   * Private knowledge; the table only sees face-up tiles.
   */
  intel: Record<string, SubsystemId[]>;
}

export type GamePhase = "lobby" | "setup" | "loadout" | "deployment" | "active" | "ended";

export interface Station {
  id: string;
  planetId: GravityWellId;
  ring: number;
  sector: number;
}

/**
 * Dynamic game state. Static data (wells, lanes, configs) lives in constants.
 * The state carries no log: `executeTurn` returns the events of each turn and
 * callers (server, sim, recording) keep the history.
 */
export interface GameState {
  turn: number;
  activePlayerIndex: number;
  players: Player[];
  missiles: Missile[];
  stations: Station[];
  phase: GamePhase;
  winnerId?: string;
  /**
   * Someone has reached MISSIONS_TO_WIN: the round is played out so every
   * seat gets the same number of turns, then the standings decide.
   */
  finalRound?: boolean;
  // Determinism
  rngSeed: number;
  rngState: number;
  nextEntityId: number;
  /** Test-only override for d10 rolls. */
  forcedRollValue?: number;
}
