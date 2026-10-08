/**
 * Bot AI. Decides from a {@link GameView}: the bot sees exactly what a
 * human in its seat would see. Three entry points cover the three phases a
 * bot acts in:
 *
 *   botChooseLoadout(offers, context)           loadout phase
 *   botChooseDeployment(view, pick)             deployment phase
 *   botDecideActions(view, parameters)          active phase
 *
 * All three are deterministic; any randomness comes from the `pick`
 * function the caller wires to the game's seeded RNG.
 */
import type { PlayerAction, ShipLoadout } from "../models/game.ts";
import { MAX_HEAT } from "../models/game.ts";
import type { Mission, MissionType } from "../models/missions.ts";
import { saleBlocked } from "./behaviors/sales.ts";
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
import type { DeploymentChoice } from "./behaviors/deployment.ts";

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
 * Loadout phase: keep one primary and two secondaries, then pick a hull for
 * them. The hand chooses the loadout, never the other way round.
 */
export function botChooseLoadout(
  offers: Mission[],
  context: {
    hull?: ShipLoadout;
    /** Experiment only: force the kind of primary this seat keeps. */
    primary?: MissionType;
    /** Chooses among the flyable hands; wire it to the game's seeded RNG. */
    pick?: (n: number) => number;
  } = {}
): { missionIds: string[]; loadout: ShipLoadout } {
  const missions = selectBotMissions(offers, context.hull, context.primary, context.pick);
  // A hand and a loadout are one choice: a kept Intercept needs the sensor array
  // and a kept Destroy needs a gun. `hull` is a loadout the simulator is measuring
  // on this seat; it is kept only if the hand the bot ended up with can
  // actually fly it, so a bot never hands the engine a submission it must
  // refuse.
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
 * Deployment phase: a legal ring and sector of the black hole's deployment rings.
 * `pick(n)` must return an integer in [0, n) from the game's seeded RNG.
 */
export function botChooseDeployment(
  view: GameView,
  pick: (n: number) => number
): DeploymentChoice {
  return chooseDeployment(view, pick);
}

function emptyLog(reason: string): BotDecisionLog {
  return {
    situation: {
      health: "-",
      heat: "-",
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
    case "power":
      return `Power ${action.data.subsystemId}${action.data.amount !== undefined ? ` at ${action.data.amount}` : ""}`;
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
      const phase = action.data.sectorAdjustment;
      return `Jump to ${action.data.destinationWellId}${phase ? ` (${phase > 0 ? "+" : ""}${phase})` : ""}`;
    }
    case "repair":
      return `Repair ${action.data.subsystemId} if cold`;
    case "dock_sale":
      return `At the dock: sell ${action.data.sale}`;
    case "escort_mark":
      return `Mark ${action.data.carrierId} with an Escort marker`;
    case "seize":
      return `Seize ${action.data.cargoId} from ${action.data.victimId}`;
    case "survey":
      return "Survey: take the data";
    case "salvage":
      return action.data.wreckId === undefined
        ? "Salvage the wreck in the sector, if there is one"
        : `Salvage ${action.data.wreckId}`;
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
        : `${threats[0].player.name} is close with ${threats[0].unknownSlots.length} unknown subsystems`
    );
  }
  const leader = [...opponents].sort((a, b) => b.danger.score - a.danger.score)[0];
  if (leader && leader.danger.score >= INTERDICT_DANGER) {
    reasoning.push(
      `${leader.player.name} is ${leader.danger.points}/${situation.view.pointsToWin} with ` +
        `${leader.danger.crates} crates, ${leader.danger.data} data (danger ${leader.danger.score.toFixed(2)}` +
        `${leader.danger.predictedPlanets[0] ? `, heading for ${leader.danger.predictedPlanets[0]}` : ""})`
    );
  }
  if (best.expectedDamage > 0)
    reasoning.push(`Expecting ${best.expectedDamage} damage on ${best.targetId}`);
  if (best.denialValue > 0) reasoning.push(`Denial value ${best.denialValue.toFixed(1)}`);
  if (best.heatDamage > 0) reasoning.push(`Accepting ${best.heatDamage} heat damage`);
  if (status.hull <= 5) reasoning.push(`Hull low (${status.hull}/${status.maxHull})`);
  // A card no station will buy for is dropped, and says so.
  for (const m of situation.me.missions) {
    const blocked = saleBlocked(situation.me, m);
    if (blocked === "dead") reasoning.push(`Card dead: ${m.type}, no station left to sell at`);
    if (blocked === "waiting")
      reasoning.push(`Card waiting: ${m.type}, the stations left are kept for the primary`);
  }

  return {
    situation: {
      health: `${status.hull}/${status.maxHull}`,
      heat: `${status.heat}/${MAX_HEAT}, dissipates ${status.dissipation}`,
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

// What the UI, the server, the simulator and the tests read. The rest of the
// bot is internal.
export { DEFAULT_BOT_PARAMETERS, INTERDICT_DANGER } from "./types.ts";
export type { BotParameters, ActionPlan, Opponent } from "./types.ts";
export { assessDanger, cheapTurnEstimate, predictedDeliveryPlanets } from "./behaviors/danger.ts";
export {
  classifyPreset,
  BOT_PRESET_LOADOUTS,
  BOT_ROLES,
  PRESETS_BY_ROLE,
  PRESET_NAMES,
  presetRole,
} from "./behaviors/loadout.ts";
export type { BotPresetId, BotRole } from "./behaviors/loadout.ts";
export { analyzeSituation, shieldAbsorption, suspectedWeapon } from "./analyzer.ts";
export { chooseDeployment, placedShipPositions } from "./behaviors/deployment.ts";
export type { DeploymentChoice } from "./behaviors/deployment.ts";

// Movement planner
export {
  planMovement,
  planMovementAlternatives,
  planAlternativesToTarget,
  planMovementToTarget,
  isReachable,
  getReachablePositions,
  getPredecessors,
  staticTarget,
  orbitingTarget,
  planFromShip,
  planStationMeetUp,
  stationTarget,
} from "./movementPlanner/index.ts";
export type {
  OrbitalPosition,
  OrientedPosition,
  MovementStep,
  MovementPlan,
} from "./movementPlanner/index.ts";
