/**
 * Bot AI System - Main Entry Point
 *
 * This is an isolated library that ingests game state and outputs valid action sequences.
 * It has no dependencies on React or UI components, only game-logic types.
 *
 * Usage:
 *   const actions = botDecideActions(gameState, botPlayerId, parameters)
 *   // Execute actions using game engine
 */

import type { GameState, PlayerAction } from "../models/game.ts";
import type {
  BotParameters,
  BotDecision,
  BotDecisionLog,
  TacticalSituation,
  ScoredActionPlan,
} from "./types.ts";
import { DEFAULT_BOT_PARAMETERS } from "./types.ts";
import { analyzeTacticalSituation } from "./analyzer.ts";
import { generateActionCandidates } from "./planner.ts";
import { selectBestCandidate, evaluateActionPlan } from "./evaluator.ts";

/**
 * Main bot decision-making function
 */
export function botDecideActions(
  gameState: GameState,
  botPlayerId: string,
  parameters: BotParameters = DEFAULT_BOT_PARAMETERS,
): BotDecision {
  try {
    // Step 1: Analyze the tactical situation
    const situation = analyzeTacticalSituation(gameState, botPlayerId);

    // Step 2: Generate multiple candidate action sequences
    const plans = generateActionCandidates(situation, parameters);

    // Step 3: Evaluate all plans
    const scoredPlans = plans.map((plan) =>
      evaluateActionPlan(plan, situation, parameters),
    );

    // Step 4: Select the best plan
    const bestPlan = selectBestCandidate(plans, situation, parameters);

    // Step 5: Build decision log
    const log = buildDecisionLog(situation, scoredPlans, bestPlan, parameters);

    return {
      actions: bestPlan.actions,
      log,
    };
  } catch (error) {
    // Fallback: if bot AI fails, just coast. The error is captured in the
    // decision log so callers (server, sim) can surface it however they like;
    // we don't log here so the engine stays pure.
    const message = error instanceof Error ? error.message : String(error);
    return {
      actions: [
        {
          type: "coast",
          playerId: botPlayerId,
          sequence: 1,
          data: { activateScoop: false },
        },
      ],
      log: {
        timestamp: new Date().toISOString(),
        situation: {
          health: "Unknown",
          heat: "Unknown",
          energy: "Unknown",
          position: "Unknown",
          threatCount: 0,
          targetCount: 0,
        },
        threats: [],
        targets: [],
        reasoning: [`Error in decision-making — defaulting to coast: ${message}`],
        candidates: [],
        selectedCandidate: {
          description: "Emergency fallback",
          totalScore: 0,
          actionSummary: ["Coast"],
        },
      },
    };
  }
}

/**
 * Build a comprehensive decision log for UI display
 */
function buildDecisionLog(
  situation: TacticalSituation,
  scoredPlans: ScoredActionPlan[],
  bestPlan: ScoredActionPlan,
  parameters: BotParameters,
): BotDecisionLog {
  const { status, threats, targets, primaryThreat, primaryTarget, currentGoal } = situation;

  // Format situation
  const maxHp = status.healthPercent > 0 ? Math.round(status.health / status.healthPercent) : 0;
  const situationSummary = {
    health: `${Math.round(status.healthPercent * 100)}% HP (${status.health}/${maxHp})`,
    heat: `${Math.round(status.heatPercent * 100)}% Heat (${status.heat}/10)`,
    energy: `${status.availableEnergy} available`,
    position: `${status.wellId} R${status.ring}S${status.sector} (${status.facing})`,
    threatCount: threats.length,
    targetCount: targets.length,
    currentGoal: currentGoal ? `${currentGoal.type} (${currentGoal.estimatedTurns} turns)` : undefined,
  };

  // Format threats
  const threatDescriptions = threats.slice(0, 3).map((threat) => {
    const weapons = threat.weaponsInRange
      .filter((w) => w.inRange)
      .map((w) => w.weaponType)
      .join(", ");
    if (weapons) {
      return `${threat.player.name} has ${weapons} in range (${threat.ringDistance}R ${threat.sectorDistance}S away)`;
    }
    return `${threat.player.name} at distance ${threat.ringDistance}R ${threat.sectorDistance}S`;
  });

  // Format targets
  const targetDescriptions = targets.slice(0, 3).map((target) => {
    const healthPercent = Math.round(
      (target.player.ship.hitPoints / target.player.ship.maxHitPoints) * 100,
    );
    const weaponNames: string[] = [];
    for (const [idx, solution] of target.firingSolutions.entries()) {
      if (solution.inRange) {
        const sub = situation.botPlayer.ship.subsystems[idx];
        if (sub) weaponNames.push(sub.type);
      }
    }
    const weapons = weaponNames.join(", ");
    if (weapons) {
      return `${target.player.name} (${healthPercent}% HP) - ${weapons} in range`;
    }
    return `${target.player.name} (${healthPercent}% HP) at distance ${target.distance}`;
  });

  // Build reasoning
  const reasoning: string[] = [];

  if (currentGoal) {
    reasoning.push(`Current goal: ${currentGoal.type} (est. ${currentGoal.estimatedTurns} turns)`);
  }

  if (status.heatPercent >= parameters.heatThreshold) {
    reasoning.push(
      `Heat at ${Math.round(status.heatPercent * 100)}% - need to vent`,
    );
  }

  if (primaryThreat) {
    const weapons = primaryThreat.weaponsInRange
      .filter((w) => w.inRange)
      .map((w) => w.weaponType)
      .join(", ");
    if (weapons) {
      reasoning.push(
        `Under threat from ${primaryThreat.player.name}'s ${weapons}`,
      );
    }
  }

  if (primaryTarget) {
    reasoning.push(
      `Targeting ${primaryTarget.player.name} (priority ${Math.round(primaryTarget.priority)})`,
    );
  }

  if (status.healthPercent < 0.3 && parameters.useWellTransfers) {
    reasoning.push(
      `Critical health (${Math.round(status.healthPercent * 100)}%) - considering escape`,
    );
  }

  // Format candidates
  const candidateSummaries = scoredPlans.map((plan) => ({
    description: plan.description,
    scores: plan.scores,
    totalScore: Math.round(plan.totalScore * 10) / 10,
  }));

  // Summarize selected actions
  const actionSummary: string[] = bestPlan.actions.map(
    (action: PlayerAction) => {
      switch (action.type) {
        case "allocate_energy":
          return `Allocate ${action.data.amount} energy to ${action.data.subsystemType}`;
        case "deallocate_energy":
          return `Deallocate ${action.data.amount} energy from ${action.data.subsystemType}`;
        case "rotate":
          return `Rotate to face ${action.data.targetFacing}`;
        case "coast":
          return `Coast${action.data.activateScoop ? " with scoop" : ""}`;
        case "burn":
          return `Burn ${action.data.burnIntensity} (${action.data.sectorAdjustment >= 0 ? "+" : ""}${action.data.sectorAdjustment} sectors)`;
        case "fire_weapon":
          return `Fire ${action.data.weaponType} at ${action.data.targetPlayerIds.join(", ")}`;
        case "well_transfer":
          return `Transfer to ${action.data.destinationWellId}`;
        case "deploy_ship":
          return `Deploy to sector ${action.data.sector}`;
        default:
          return `Unknown action`;
      }
    },
  );

  return {
    timestamp: new Date().toISOString(),
    situation: situationSummary,
    threats: threatDescriptions,
    targets: targetDescriptions,
    reasoning,
    candidates: candidateSummaries,
    selectedCandidate: {
      description: bestPlan.description,
      totalScore: Math.round(bestPlan.totalScore * 10) / 10,
      actionSummary,
    },
  };
}

/**
 * Create bot parameters for different difficulty levels
 */
export function createBotParameters(
  difficulty: "easy" | "medium" | "hard",
): BotParameters {
  switch (difficulty) {
    case "easy":
      return {
        aggressiveness: 0.4,
        targetPreference: "closest",
        heatThreshold: 0.5,
        panicHeatThreshold: 0.7,
        preferredRingRange: { min: 1, max: 4 },
        useWellTransfers: false,
        energyReserve: 3,
        conserveAmmo: true,
        missionStrategy: "auto",
      };

    case "medium":
      return DEFAULT_BOT_PARAMETERS;

    case "hard":
      return {
        aggressiveness: 0.8,
        targetPreference: "weakest",
        heatThreshold: 0.8,
        panicHeatThreshold: 0.95,
        preferredRingRange: { min: 2, max: 3 },
        useWellTransfers: true,
        energyReserve: 1,
        conserveAmmo: false,
        missionStrategy: "auto",
      };
  }
}

// Bot loadout selection
export { selectBotLoadout, BOT_LOADOUT_TEMPLATES } from "./behaviors/loadout.ts";

// Re-export types for consumers
export type {
  BotParameters,
  TacticalSituation,
  ActionPlan,
  ScoredActionPlan,
  BotDecision,
  BotDecisionLog,
} from "./types.ts";

// Movement Planner - Multi-turn path planning
// Note: Import directly from './movementPlanner/index.ts' to access types to avoid name collisions
export {
  planMovement,
  planMovementAlternatives,
  isReachable,
  getReachablePositions,
  comparePlans,
  getPredecessors,
  getVelocityAtPosition,
  getMaxRingForWell,
  positionKey,
  orbitalPositionKey,
  positionsMatch,
  planFromShip,
  getFirstAction,
  canReachTarget,
  estimateTurnsToTarget,
} from "./movementPlanner/index.ts";

// Re-export movement planner types
export type {
  OrbitalPosition,
  OrientedPosition,
  MovementStep,
  MovementPlan,
  MovementAlternatives,
  PlannerOptions,
  PlannerMode,
  MovementActionType,
  SlingshotAnalysis,
  PredecessorInfo,
} from "./movementPlanner/index.ts";
