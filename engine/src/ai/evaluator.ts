/**
 * Candidate scoring. Each candidate is scored once on four axes; the
 * weights shift with aggressiveness so the same situation yields different
 * plans for different bot personalities.
 */
import type {
  ActionPlan,
  BotParameters,
  PlanScores,
  ScoredActionPlan,
  TacticalSituation,
} from "./types.ts";

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/** Points of offense per unit of denial value (see ActionPlan.denialValue). */
const DENIAL_SCALE = 12;
/** Denial value at which a volley counts as real interference in the race. */
const DENIAL_STEP = 1;

function offense(plan: ActionPlan, situation: TacticalSituation): number {
  // Damage that reaches the hull is what wins; damage a shield soaks still
  // strips cubes off the target (and heats it), so it is worth something.
  const soaked = Math.max(0, plan.expectedDamage - plan.expectedHullDamage);
  let score = plan.expectedHullDamage * 15 + soaked * 5;
  if (plan.targetId) {
    if (plan.killsTarget) score += 40;
    const missionTarget = situation.me.missions.some(
      (m) => !m.isCompleted && m.type === "destroy_ship" && m.targetPlayerId === plan.targetId
    );
    if (missionTarget) score += 15;
  }
  // Denial. A hit on a player one dock from the win costs them the
  // cargo and the tempo, which is worth more than the same hit on someone
  // who has nothing aboard — with no Destroy card needed to collect it.
  score += plan.denialValue * DENIAL_SCALE;
  return clamp(score);
}

/**
 * Points off per point of heat the plan leaves on the track. Small next to the
 * 25 a point of actual damage costs, because carried heat is a debt and not a
 * wound — but it is next turn's budget spent in advance, so between two plans
 * that do the same thing the cooler one wins, and a ship near the top of the
 * track will spend a turn shedding rather than bank one more point.
 */
const CARRIED_HEAT_PENALTY = 3;

/**
 * A cold turn is a whole turn spent doing nothing, so it has to beat every
 * other candidate on the defence axis to be chosen at all. Getting the engines,
 * thrusters or scoop back is worth more than a gun: a ship without them cannot
 * reach a station to be repaired properly, so the cold turn is the only way out
 * rather than a shortcut.
 */
const REPAIR_VALUE = 35;
const MOBILITY_REPAIR_VALUE = 90;
const MOBILITY: ReadonlySet<string> = new Set(["engines", "rotation", "scoop"]);

function defense(plan: ActionPlan, situation: TacticalSituation): number {
  let score = 60;
  score -= plan.heatDamage * 25;
  score -= plan.heatCarried * CARRIED_HEAT_PENALTY;
  if (plan.repairs !== undefined)
    score += MOBILITY.has(plan.repairs) ? MOBILITY_REPAIR_VALUE : REPAIR_VALUE;
  const threatened = situation.threats.length > 0 || situation.incomingMissiles > 0;
  const shieldsPowered =
    plan.actions.some(
      (a) =>
        a.type === "allocate_energy" &&
        situation.status.shields.some((s) => s.id === a.data.subsystemId)
    ) ||
    situation.status.shields.some(
      (s) =>
        s.allocatedEnergy > 0 &&
        !plan.actions.some((a) => a.type === "deallocate_energy" && a.data.subsystemId === s.id)
    );
  if (threatened) score += shieldsPowered ? 15 : -15;
  // Heading for repairs when the hull is low is defence too.
  if (situation.currentGoal?.missionId === "repair" && plan.followsGoal) score += 20;
  return clamp(score);
}

function missionProgress(plan: ActionPlan, situation: TacticalSituation): number {
  let score = 20;
  if (situation.currentGoal && plan.followsGoal) score += 45;
  if (plan.completesStep) score += 35;
  if (plan.scans) score += 10;
  // Taking a card off the leader is progress in the race even when no card
  // of ours says so: three points win, and they are three points closer.
  if (plan.denialValue >= DENIAL_STEP) score += 25;
  return clamp(score);
}

function resources(plan: ActionPlan, situation: TacticalSituation): number {
  let score = 60;
  score -= plan.massSpent * 5;
  const fuel = situation.status.reactionMass;
  const scooping = plan.actions.some((a) => a.type === "coast" && a.data.activateScoop);
  if (scooping) score += fuel < 5 ? 25 : 10;
  if (plan.massSpent > 0 && fuel - plan.massSpent < 3) score -= 15;
  return clamp(score);
}

export function evaluatePlan(
  plan: ActionPlan,
  situation: TacticalSituation,
  parameters: BotParameters
): ScoredActionPlan {
  const scores: PlanScores = {
    offense: offense(plan, situation),
    defense: defense(plan, situation),
    missionProgress: missionProgress(plan, situation),
    resources: resources(plan, situation),
  };
  const a = parameters.aggressiveness;
  const weights = {
    offense: 0.15 + 0.3 * a,
    missionProgress: 0.5 - 0.25 * a,
    defense: 0.2,
    resources: 0.1,
  };
  const totalScore =
    scores.offense * weights.offense +
    scores.missionProgress * weights.missionProgress +
    scores.defense * weights.defense +
    scores.resources * weights.resources;
  return { ...plan, scores, totalScore };
}

/** Highest score wins; ties keep the earlier candidate (goal before engage before hold). */
export function selectBest(plans: ScoredActionPlan[]): ScoredActionPlan {
  let best = plans[0];
  for (const plan of plans) if (plan.totalScore > best.totalScore) best = plan;
  return best;
}
