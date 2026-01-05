import type {
  Subsystem,
  SubsystemType,
  ReactorState,
  HeatState,
} from "./subsystems";

import type { Mission, Cargo } from "./missions";

/**
 * Ship loadout - defines which subsystems are installed in each slot
 * Fixed subsystems (engines, rotation) are always present and not part of loadout
 */
export interface ShipLoadout {
  forwardSlots: [SubsystemType | null, SubsystemType | null];
  sideSlots: [
    SubsystemType | null,
    SubsystemType | null,
    SubsystemType | null,
    SubsystemType | null,
  ];
}

/**
 * Result of loadout validation
 */
export interface LoadoutValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Default loadout for backwards compatibility
 * Matches the original fixed loadout before the loadout system was added
 */
export const DEFAULT_LOADOUT: ShipLoadout = {
  forwardSlots: ["scoop", "railgun"],
  sideSlots: ["laser", "laser", "shields", "missiles"],
};

/**
 * Base critical hit chance (10%)
 * Expressed as percentage points (10 = 10%, 30 = 30%)
 * Can be increased by sensor array subsystem (+20 per sensor array)
 */
export const BASE_CRITICAL_CHANCE = 10;

export const ENERGY_PER_TURN = 10;
export const MAX_REACTION_MASS = 10;
export const STARTING_REACTION_MASS = 10;
export const DEFAULT_DISSIPATION_CAPACITY = 5;

export type Facing = "prograde" | "retrograde";

export type BurnIntensity = "soft" | "medium" | "hard";

export type ActionType = "well_transfer" | "coast" | "burn";

// Tactical action types for sequencing
export type TacticalActionType =
  | "rotate"
  | "move"
  | "fire_laser"
  | "fire_railgun"
  | "fire_missiles"
  | "well_transfer";

export interface TacticalAction {
  id: string; // unique identifier for this action instance
  type: TacticalActionType;
  sequence: number;
  targetPlayerId?: string; // For weapon actions
  destinationWellId?: string; // For well transfer actions
  criticalTarget?: SubsystemType; // For weapon actions - subsystem to break on critical hit
}

// Identifier for which gravity well a ship is in
export type GravityWellId = string; // e.g., 'blackhole', 'planet-alpha', 'planet-beta'

export type GravityWellType = "blackhole" | "planet";

// Orbital velocity for planets (currently all static with velocity = 0)
// Transfer sectors are fixed and hardcoded, so angle/distance not needed for game logic
export interface OrbitalPosition {
  velocity: number; // Angular velocity in degrees per turn (game logic for potential planet drift)
}

export interface GravityWell {
  id: GravityWellId;
  name: string;
  type: GravityWellType;
  rings: RingConfig[]; // Ring configuration for this gravity well (game logic only: ring, velocity, sectors)
  orbitalPosition?: OrbitalPosition; // Only for planets - velocity for potential orbit updates
}

export interface TransferPoint {
  fromWellId: GravityWellId;
  toWellId: GravityWellId;
  fromRing: number; // 4 for blackhole, 3 for planets
  toRing: number; // 4 for blackhole, 3 for planets
  fromSector: number; // Launch sector (fixed per planet)
  toSector: number; // Arrival sector (fixed per planet)
  requiredEngineLevel: number; // Engine level required for transfer (e.g., 3 for elliptic transfers)
}

export interface TransferState {
  destinationRing: number;
  destinationWellId?: GravityWellId; // If transferring between gravity wells
  destinationSector?: number; // For well transfers, the exact destination sector
  sectorAdjustment: number; // -1, 0, or +1 sector adjustment from natural mapping
  isWellTransfer?: boolean; // true if transferring between gravity wells
}

/**
 * Missile entity in flight
 */
export interface Missile {
  id: string; // Unique identifier (e.g., "missile-player1-1")
  ownerId: string; // Player who fired it
  targetId: string; // Target player ID
  wellId: GravityWellId; // Current gravity well
  ring: number; // Current ring position
  sector: number; // Current sector position
  turnFired: number; // Game turn when missile was launched
  turnsAlive: number; // How many turns missile has been alive (0-2, explodes at 3)
  skipOrbitalThisTurn?: boolean; // Skip orbital movement this turn (set when fired after ship movement)
}

export interface ShipState {
  wellId: GravityWellId; // Which gravity well the ship is currently in
  ring: number;
  sector: number;
  facing: Facing;
  reactionMass: number;
  hitPoints: number;
  maxHitPoints: number;
  transferState: TransferState | null;
  // Subsystem-based energy/heat system
  subsystems: Subsystem[]; // Note: missiles subsystem has ammo field for inventory
  reactor: ReactorState;
  heat: HeatState;
  dissipationCapacity: number; // Base heat dissipation per turn (see DEFAULT_DISSIPATION_CAPACITY, can be increased by radiators)
  // Loadout system
  loadout: ShipLoadout; // The chosen loadout for this ship
  criticalChance: number; // Base 0.1, can be increased by sensor array
}

/**
 * Base action properties shared by all action types
 */
interface BaseAction {
  playerId: string;
  sequence?: number; // For tactical actions (rotate/move/fire), determines execution order
}

/**
 * Movement Actions (mutually exclusive per turn)
 */

export interface CoastAction extends BaseAction {
  type: "coast";
  data: {
    activateScoop: boolean;
  };
}

export interface BurnAction extends BaseAction {
  type: "burn";
  data: {
    burnIntensity: BurnIntensity;
    sectorAdjustment: number;
  };
}

export interface RotateAction extends BaseAction {
  type: "rotate";
  data: {
    targetFacing: Facing;
  };
}

/**
 * Resource Management Actions
 */

export interface AllocateEnergyAction extends BaseAction {
  type: "allocate_energy";
  data: {
    subsystemType: SubsystemType;
    amount: number;
  };
}

export interface DeallocateEnergyAction extends BaseAction {
  type: "deallocate_energy";
  data: {
    subsystemType: SubsystemType;
    amount: number; // Amount of energy to return to reactor (limited by maxReturnRate)
  };
}

/**
 * Combat Actions
 */

export interface FireWeaponAction extends BaseAction {
  type: "fire_weapon";
  data: {
    weaponType: "laser" | "railgun" | "missiles";
    targetPlayerIds: string[]; // Array for multi-target weapons like lasers
    criticalTarget: SubsystemType; // REQUIRED: Declared subsystem to break if critical hit (roll=10) occurs
  };
}

export interface WellTransferAction extends BaseAction {
  type: "well_transfer";
  data: {
    destinationWellId: GravityWellId;
    // destinationSector is determined automatically by transfer points
  };
}

/**
 * Deploy ship action - used during deployment phase
 */
export interface DeployShipAction extends BaseAction {
  type: "deploy_ship";
  data: {
    sector: number; // BH Ring 4 sector to deploy to
  };
}

/**
 * Movement action type
 */
export type MovementAction = CoastAction | BurnAction;

/**
 * Discriminated union of all player actions
 */
export type PlayerAction =
  | CoastAction
  | BurnAction
  | RotateAction
  | AllocateEnergyAction
  | DeallocateEnergyAction
  | FireWeaponAction
  | WellTransferAction
  | DeployShipAction;

export interface Player {
  id: string;
  name: string;
  ship: ShipState;
  // Mission system fields
  missions: Mission[];
  completedMissionCount: number;
  cargo: Cargo[];
  hasDeployed: boolean;
  hasSubmittedLoadout: boolean;
}

export interface TurnLogEntry {
  turn: number;
  playerId: string;
  playerName: string;
  action: string;
  result: string;
}

export interface TurnHistoryEntry {
  turn: number;
  playerId: string;
  playerName: string;
  actions: PlayerAction[];
}

/**
 * Game phases in order of progression
 * - lobby: Players joining and readying up
 * - setup: Missions being dealt
 * - loadout: Players selecting ship loadout (after seeing missions)
 * - deployment: Players deploying ships to starting positions
 * - active: Game in progress
 * - ended: Game finished
 */
export type GamePhase =
  | "lobby"
  | "setup"
  | "loadout"
  | "deployment"
  | "active"
  | "ended";

/**
 * Dynamic game state - changes every turn
 * Static data (gravityWells, transferPoints) is accessed via constants directly
 */
export interface GameState {
  turn: number;
  activePlayerIndex: number;
  players: Player[];
  turnLog: TurnLogEntry[];
  missiles: Missile[]; // All missiles currently in flight
  winnerId?: string; // ID of the winning player (if status is victory or defeat)
  // Mission system fields
  phase: GamePhase;
  stations: Station[];
}

export interface RingConfig {
  ring: number; // Ring number (1-5 for blackhole, 1-3 for planets)
  velocity: number; // Movement speed in sectors per turn (game logic)
  sectors: number; // Number of sectors in this ring (game logic)
}

/**
 * Orbital station that orbits around a planet
 * Ships can dock to pick up or deliver cargo
 */
export interface Station {
  id: string;
  planetId: GravityWellId;
  ring: number; // Always Ring 1 for planets
  sector: number; // Starts at 0, moves with orbital velocity
}
