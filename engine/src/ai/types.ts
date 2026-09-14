/**
 * Bot AI types.
 *
 * The bot decides from a {@link GameView}: its own player record in full,
 * opponents as public information (position, hull, heat, face-up tiles and
 * whatever its scans revealed). Nothing here reads a GameState.
 */
import type { Facing, Player, PlayerAction, Position, ShipState } from "../models/game.ts";
import type { Subsystem, SubsystemId, SubsystemType } from "../models/subsystems.ts";
import type { GameView, PlayerView, SlotView } from "../game/view.ts";
import type { MovementPlan } from "./movementPlanner/index.ts";

/**
 * A weapon slot on an opponent's ship as far as the bot knows it (face-up
 * or scanned).
 */
export interface KnownWeapon {
  slotId: SubsystemId;
  type: SubsystemType;
  isBroken: boolean;
  /** The tile holds at least the cubes it needs to fire. */
  isPowered: boolean;
  /** Whether it could hit the bot, right now, from the opponent's position. */
  inRange: boolean;
}

/**
 * What a slot's energy cubes suggest it holds. Produced by
 * `analyzer.suspectedWeapon`, which is the only place cube counts are
 * turned into an opinion.
 */
export interface SuspectedWeapon {
  type: SubsystemType;
  /** Damage it would do if it is that weapon. */
  damage: number;
  /** 0-1: how much of a harmless tile the cube count also fits. */
  confidence: number;
}

/**
 * A face-down slot, read through the cubes sitting on it. Energy allocation
 * is public, so the number of cubes narrows down what the tile can be:
 * 4 on the forward slot is a railgun, 2 anywhere could be missiles, and an
 * unpowered slot cannot fire at all this turn.
 */
export interface SuspectedSlot {
  slot: SlotView;
  /** The weapon the cubes suggest, or null when they rule every weapon out. */
  suspected: SuspectedWeapon | null;
  /** Whether that suspected weapon could reach the bot from where the opponent is. */
  inRange: boolean;
}

/**
 * How close an opponent is to winning the game, read from public
 * information alone, and where that puts them on the board. Produced by
 * `behaviors/danger.assessDanger`.
 */
export interface OpponentDanger {
  /** 0-1. Half their score out of three, half how soon the rest can land. */
  score: number;
  /** Cards already face-up in front of them. */
  completedMissions: number;
  /** Crates aboard: a Deliver in progress, and it ends at a station. */
  crates: number;
  /** Data chits aboard: an Intercept or Survey, deliverable at any station. */
  data: number;
  /** Stations the cargo could be going to, nearest first. Empty when the hold is. */
  predictedPlanets: string[];
  /** The station they are most likely making for, or null with an empty hold. */
  deliveryPosition: Position | null;
  /** Turns we think they need to reach it (Infinity with an empty hold). */
  turnsToDelivery: number;
  /** Turns we think they need to win the game. */
  turnsToWin: number;
  /** Two cards down and carrying the third: the one to stop. */
  oneDeliveryFromWinning: boolean;
}

/**
 * Danger at which a bot diverts from its own cards to interfere with an
 * opponent's, and at which it will accept hull damage to do it. Shared by
 * goal selection, target selection and scoring, so they all agree on who
 * "the leader" is.
 */
export const INTERDICT_DANGER = 0.6;
export const CRITICAL_DANGER = 0.8;

/**
 * A living, deployed opponent in the bot's view.
 */
export interface Opponent {
  player: PlayerView;
  position: Position;
  facing: Facing;
  hull: number;
  maxHull: number;
  sameWell: boolean;
  ringDistance: number;
  sectorDistance: number;
  /** Weapon tiles the bot has seen (face-up or scanned). */
  knownWeapons: KnownWeapon[];
  /** Face-down tiles the bot has not seen, read through their energy cubes. */
  unknownSlots: SuspectedSlot[];
  /**
   * Damage this ship's shields are expected to soak out of one turn's
   * volley: cubes on shield tiles the bot can see, plus a fraction of the
   * cubes on face-down side slots that might be shields.
   */
  shieldAbsorption: number;
  /**
   * Threat estimate 0..1: known, powered weapons in range weigh fully,
   * face-down slots that could reach the bot weigh by their confidence.
   */
  threat: number;
  /**
   * How close they are to winning, and where their cargo has to go. This is
   * the other reason to shoot someone: stopping a delivery is worth as much
   * as making one.
   */
  danger: OpponentDanger;
}

export type BotGoalType =
  | "hunt" // destroy: get weapons on the target
  | "interdict" // no card needed: stop the player who is about to win
  | "shadow" // intercept: get within scan range of the target
  | "dock" // deliver, deliver data, repair: end a turn on a station
  | "survey"; // end a turn on black hole ring SURVEY_RING

/**
 * A goal derived from a mission (or from the need to repair). The bot
 * pursues one goal per turn; `plan`, when present, is the movement that
 * gets there.
 */
export interface BotGoal {
  type: BotGoalType;
  /** Mission id, or one of the standing goal ids ("repair", "interdict", "idle"). */
  missionId: string;
  description: string;
  targetPlayerId?: string;
  /** For dock goals: the planet whose station to reach. */
  planetId?: string;
  /** Cheap estimate used for ranking; the chosen goal gets a real plan. */
  estimatedTurns: number;
  /** Ranking bonus for goals that finish a mission step this trip. */
  urgency: number;
  plan?: MovementPlan;
}

/**
 * The bot's own ship, digested.
 */
export interface BotStatus {
  hull: number;
  maxHull: number;
  heat: number;
  dissipation: number;
  /** Heat the ship can still take this turn without hull damage. */
  heatBudget: number;
  availableEnergy: number;
  reactionMass: number;
  maxReactionMass: number;
  position: Position;
  facing: Facing;
  engines: Subsystem;
  rotation: Subsystem;
  scoop: Subsystem;
  weapons: Subsystem[];
  sensors: Subsystem[];
  shields: Subsystem[];
  racks: Subsystem[];
  brokenSubsystems: Subsystem[];
  hasCompressor: boolean;
}

export interface TacticalSituation {
  view: GameView;
  me: Player;
  ship: ShipState;
  status: BotStatus;
  /** The bot's own place in the race, scored the same way as every opponent's. */
  myDanger: OpponentDanger;
  opponents: Opponent[];
  /** Opponents in the same well, most threatening first. */
  threats: Opponent[];
  /** Missiles in flight aimed at the bot, in its well. */
  incomingMissiles: number;
  goals: BotGoal[];
  currentGoal: BotGoal | null;
}

/**
 * Unscored action sequence candidate.
 */
export interface ActionPlan {
  actions: PlayerAction[];
  description: string;
  /** Damage the volley delivers before shields, assuming every shot lands. */
  expectedDamage: number;
  /** `expectedDamage` less the shield cubes the bot can see on each target. */
  expectedHullDamage: number;
  /** Whether the volley is expected to destroy `targetId`. */
  killsTarget: boolean;
  /** The main target the plan fires at, if any. */
  targetId?: string;
  /** Whether the movement follows the current goal's plan. */
  followsGoal: boolean;
  /** Whether the plan scans someone. */
  scans: boolean;
  /** Hull damage the bot will take from heat at the end of the turn. */
  heatDamage: number;
  /** Reaction mass spent. */
  massSpent: number;
  /** Whether the plan finishes a mission step (dock, survey, scan, kill). */
  completesStep: boolean;
  /**
   * Denial: hull damage weighted by how close each victim is to winning,
   * plus a premium for a kill (it costs them their cargo and their next
   * turn). Damage on a player one delivery from the win is worth several
   * times the same damage on a bystander.
   */
  denialValue: number;
}

export interface PlanScores {
  offense: number;
  defense: number;
  missionProgress: number;
  resources: number;
}

export interface ScoredActionPlan extends ActionPlan {
  scores: PlanScores;
  totalScore: number;
}

/**
 * Bot decision-making parameters (tuned per difficulty).
 */
export interface BotParameters {
  /** 0-1: weight of dealing damage versus mission progress and safety. */
  aggressiveness: number;
  /** Which opponent to shoot when several are in range. */
  targetPreference: "closest" | "weakest" | "mission";
  /** Hull at or below which the bot heads for a station to repair. */
  repairHullThreshold: number;
  /** Reaction mass below which the bot scoops while coasting. */
  lowFuelThreshold: number;
  /** Hold missiles unless the shot is likely to land or matters for a mission. */
  conserveAmmo: boolean;
  /** Spend heat and energy on scanning unknown enemy tiles when adjacent. */
  scanUnknowns: boolean;
}

export const DEFAULT_BOT_PARAMETERS: BotParameters = {
  aggressiveness: 0.6,
  targetPreference: "mission",
  repairHullThreshold: 5,
  lowFuelThreshold: 6,
  conserveAmmo: false,
  scanUnknowns: true,
};

/**
 * Human-readable record of a decision, for the UI and for sim diagnostics.
 * Deterministic: no timestamps.
 */
export interface BotDecisionLog {
  situation: {
    health: string;
    heat: string;
    energy: string;
    fuel: string;
    position: string;
    threatCount: number;
    targetCount: number;
    currentGoal?: string;
  };
  threats: string[];
  targets: string[];
  reasoning: string[];
  candidates: Array<{ description: string; scores: PlanScores; totalScore: number }>;
  selectedCandidate: { description: string; totalScore: number; actionSummary: string[] };
}

export interface BotDecision {
  actions: PlayerAction[];
  log: BotDecisionLog;
}
