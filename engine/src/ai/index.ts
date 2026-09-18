/**
 * Bot AI. Decides from a {@link GameView}: the bot sees exactly what a
 * human in its seat would see. Three entry points cover the three phases a
 * bot acts in:
 *
 *   botChooseLoadout(offers, { playerCount })   loadout phase
 *   botChooseDeployment(view, pick)             deployment phase
 *   botDecideActions(view, parameters)          active phase
 *
 * All three are deterministic; any randomness comes from the `pick`
 * function the caller wires to the game's seeded RNG.
 */
import type { PlayerAction, ShipLoadout } from "../models/game.ts";
import type { Mission } from "../models/missions.ts";
import type { GameView } from "../game/view.ts";
import { missionsMissingRequirements } from "../game/loadout.ts";
import type {
  BotDecision,
  BotDecisionLog,
  BotParameters,
  ScoredActionPlan,
  TacticalSituation,
} from "./types.ts";
import { DEFAULT_BOT_PARAMETERS, INTERDICT_DANGER } from "./types.ts";
import { analyzeSituation } from "./analyzer.ts";
import { generateCandidates } from "./planner.ts";
import { evaluatePlan, selectBest } from "./evaluator.ts";
import { selectBotLoadout, selectBotMissions } from "./behaviors/loadout.ts";
import { chooseDeployment } from "./behaviors/deployment.ts";

/**
 * Decide the bot's actions for its turn. A destroyed bot returns no actions:
 * the engine spends its turn respawning.
 */
export function botDecideActions(
  view: GameView,
  parameters: BotParameters = DEFAULT_BOT_PARAMETERS
): BotDecision {
  const me = view.me;
  if (!me || !me.hasDeployed || me.ship.hitPoints <= 0) {
    return {
      actions: [],
      log: emptyLog(me ? "Destroyed: waiting to respawn" : "No player in view"),
    };
  }

  try {
    const situation = analyzeSituation(view, parameters);
    const candidates = generateCandidates(situation, parameters);
    const scored = candidates.map((c) => evaluatePlan(c, situation, parameters));
    const best = selectBest(scored);
    return { actions: best.actions, log: buildDecisionLog(situation, scored, best) };
  } catch (error) {
    // Never let a bug in the AI stall the game: coasting is always valid.
    const message = error instanceof Error ? error.message : String(error);
    return {
      actions: [{ type: "coast", playerId: me.id, sequence: 1, data: { activateScoop: false } }],
      log: emptyLog(`Error in decision-making, coasting: ${message}`),
    };
  }
}

/**
 * Loadout phase: keep 3 of the offered missions and pick a hull for them.
 */
export function botChooseLoadout(
  offers: Mission[],
  context: {
    playerCount: number;
    hull?: ShipLoadout;
    primaries?: number;
    /** Chooses among the flyable hands; wire it to the game's seeded RNG. */
    pick?: (n: number) => number;
  }
): { missionIds: string[]; loadout: ShipLoadout } {
  const missions = selectBotMissions(
    offers,
    context.playerCount,
    context.hull,
    context.primaries,
    context.pick
  );
  // A hand and a mat are one choice: a kept Intercept or Survey needs the
  // sensor array and a kept Destroy needs a gun. `hull` is a mat the
  // simulator is measuring on this seat; it
  // is kept only if the trio the bot ended up with can actually fly it, so a
  // bot never hands the engine a submission it must refuse.
  const imposed =
    context.hull && missionsMissingRequirements(missions, context.hull).length === 0
      ? context.hull
      : undefined;
  return {
    missionIds: missions.map((m) => m.id),
    loadout: imposed ?? selectBotLoadout(missions),
  };
}

/**
 * Deployment phase: a planet and a free sector on its outer ring.
 * `pick(n)` must return an integer in [0, n) from the game's seeded RNG.
 */
export function botChooseDeployment(
  view: GameView,
  pick: (n: number) => number
): { wellId: string; sector: number } {
  return chooseDeployment(view, pick);
}

export function createBotParameters(difficulty: "easy" | "medium" | "hard"): BotParameters {
  switch (difficulty) {
    case "easy":
      return {
        aggressiveness: 0.3,
        targetPreference: "closest",
        repairHullThreshold: 6,
        lowFuelThreshold: 7,
        conserveAmmo: true,
        scanUnknowns: false,
      };
    case "medium":
      return DEFAULT_BOT_PARAMETERS;
    case "hard":
      return {
        aggressiveness: 0.8,
        targetPreference: "mission",
        repairHullThreshold: 4,
        lowFuelThreshold: 5,
        conserveAmmo: false,
        scanUnknowns: true,
      };
  }
}

function emptyLog(reason: string): BotDecisionLog {
  return {
    situation: {
      health: "-",
      heat: "-",
      energy: "-",
      fuel: "-",
      position: "-",
      threatCount: 0,
      targetCount: 0,
    },
    threats: [],
    targets: [],
    reasoning: [reason],
    candidates: [],
    selectedCandidate: { description: "None", totalScore: 0, actionSummary: [] },
  };
}

function summarizeAction(action: PlayerAction): string {
  switch (action.type) {
    case "allocate_energy":
      return `Allocate ${action.data.amount} to ${action.data.subsystemId}`;
    case "deallocate_energy":
      return `Deallocate ${action.data.amount} from ${action.data.subsystemId}`;
    case "rotate":
      return `Rotate to ${action.data.targetFacing}`;
    case "coast":
      return `Coast${action.data.activateScoop ? " (scoop)" : ""}`;
    case "burn":
      return `Burn ${action.data.burnIntensity} (${action.data.sectorAdjustment >= 0 ? "+" : ""}${action.data.sectorAdjustment})`;
    case "fire_weapon":
      return `Fire ${action.data.subsystemId} at ${action.data.targetPlayerId}${action.data.compensateRecoil ? " (compensate recoil)" : ""}`;
    case "scan":
      return `Scan ${action.data.targetPlayerId} (${action.data.peekSlot})`;
    case "well_transfer": {
      const phase = action.data.sectorAdjustment ?? 0;
      return `Jump to ${action.data.destinationWellId}${phase ? ` (${phase > 0 ? "+" : ""}${phase})` : ""}`;
    }
    case "repair":
      return `Repair ${action.data.subsystemId} if cold`;
    case "deploy_ship":
      return `Deploy at ${action.data.wellId} S${action.data.sector}`;
  }
}

function buildDecisionLog(
  situation: TacticalSituation,
  scored: ScoredActionPlan[],
  best: ScoredActionPlan
): BotDecisionLog {
  const { status, threats, opponents, currentGoal } = situation;
  const targets = opponents.filter((o) => o.sameWell);
  const reasoning: string[] = [];
  if (currentGoal) {
    reasoning.push(
      `Goal: ${currentGoal.description} (~${currentGoal.estimatedTurns} turns${currentGoal.plan ? "" : ", no route yet"})`
    );
  }
  if (threats[0]) {
    const known = threats[0].knownWeapons.filter((w) => w.inRange).map((w) => w.type);
    reasoning.push(
      known.length > 0
        ? `${threats[0].player.name} has ${known.join(", ")} in range`
        : `${threats[0].player.name} is close with ${threats[0].unknownSlots.length} unknown tiles`
    );
  }
  const leader = [...opponents].sort((a, b) => b.danger.score - a.danger.score)[0];
  if (leader && leader.danger.score >= INTERDICT_DANGER) {
    reasoning.push(
      `${leader.player.name} is ${leader.danger.completedMissions}/3 with ` +
        `${leader.danger.crates} crates, ${leader.danger.data} data (danger ${leader.danger.score.toFixed(2)}` +
        `${leader.danger.predictedPlanets[0] ? `, heading for ${leader.danger.predictedPlanets[0]}` : ""})`
    );
  }
  if (best.expectedDamage > 0)
    reasoning.push(`Expecting ${best.expectedDamage} damage on ${best.targetId}`);
  if (best.denialValue > 0) reasoning.push(`Denial value ${best.denialValue.toFixed(1)}`);
  if (best.heatDamage > 0) reasoning.push(`Accepting ${best.heatDamage} heat damage`);
  if (status.hull <= 5) reasoning.push(`Hull low (${status.hull}/${status.maxHull})`);

  return {
    situation: {
      health: `${status.hull}/${status.maxHull}`,
      heat: `${status.heat}/${status.dissipation}`,
      energy: `${status.availableEnergy} free`,
      fuel: `${status.reactionMass}/${status.maxReactionMass}`,
      position: `${status.position.wellId} R${status.position.ring} S${status.position.sector} (${status.facing})`,
      threatCount: threats.length,
      targetCount: targets.length,
      currentGoal: currentGoal?.description,
    },
    threats: threats
      .slice(0, 3)
      .map(
        (t) =>
          `${t.player.name}: threat ${t.threat.toFixed(2)}, ${t.ringDistance}R ${t.sectorDistance}S`
      ),
    targets: targets
      .slice(0, 3)
      .map(
        (t) =>
          `${t.player.name}: hull ${t.hull}/${t.maxHull}, ${t.ringDistance}R ${t.sectorDistance}S`
      ),
    reasoning,
    candidates: scored.map((p) => ({
      description: p.description,
      scores: p.scores,
      totalScore: Math.round(p.totalScore * 10) / 10,
    })),
    selectedCandidate: {
      description: best.description,
      totalScore: Math.round(best.totalScore * 10) / 10,
      actionSummary: best.actions.map(summarizeAction),
    },
  };
}

export { DEFAULT_BOT_PARAMETERS } from "./types.ts";
export type {
  BotParameters,
  BotDecision,
  BotDecisionLog,
  TacticalSituation,
  ActionPlan,
  ScoredActionPlan,
  BotGoal,
  BotGoalType,
  BotStatus,
  Opponent,
  OpponentDanger,
  KnownWeapon,
  SuspectedSlot,
  SuspectedWeapon,
} from "./types.ts";
export { INTERDICT_DANGER, CRITICAL_DANGER } from "./types.ts";
export {
  assessDanger,
  cheapTurnEstimate,
  laneArrivalTarget,
  planInterception,
  predictedDeliveryPlanets,
} from "./behaviors/danger.ts";
export type { InterceptionPlan } from "./behaviors/danger.ts";
export { computeGoals, interdictionTarget, INTERDICT_GOAL_ID } from "./behaviors/missions.ts";
export {
  selectBotLoadout,
  selectBotMissions,
  classifyArchetype,
  classifyRole,
  classifyVariant,
  BOT_LOADOUT_TEMPLATES,
  BOT_ROLES,
  HULL_VARIANTS,
} from "./behaviors/loadout.ts";
export type { BotArchetype, BotRole, HullVariant } from "./behaviors/loadout.ts";
export { analyzeSituation, shieldAbsorption, suspectedWeapon } from "./analyzer.ts";
export { chooseDeployment } from "./behaviors/deployment.ts";
export type { DeploymentChoice } from "./behaviors/deployment.ts";

// Movement planner
export {
  planMovement,
  planMovementAlternatives,
  planMovementToTarget,
  isReachable,
  getReachablePositions,
  getPredecessors,
  getSuccessors,
  staticTarget,
  orbitingTarget,
  nearDriftingShip,
  anySectorOnRing,
  positionKey,
  planFromShip,
  planShipToTarget,
  planStationMeetUp,
  getFirstAction,
  estimateTurnsToTarget,
} from "./movementPlanner/index.ts";
export type {
  OrbitalPosition,
  OrientedPosition,
  MovementStep,
  MovementPlan,
  MovementAlternatives,
  PlannerOptions,
  PlannerMode,
  MovementActionType,
  PredecessorInfo,
  PlannerTarget,
  StationMeetPlan,
} from "./movementPlanner/index.ts";
