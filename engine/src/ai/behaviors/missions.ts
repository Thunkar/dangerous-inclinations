/**
 * Goals. Each incomplete mission becomes a goal with a cheap turn estimate;
 * the cheapest (after urgency) is pursued and gets a real movement plan.
 * Four mission types, plus three standing goals that no card names:
 *
 *   destroy_ship               → hunt: get weapons on the target
 *   deliver_cargo              → dock at pickup, then at delivery
 *   intercept_transmission     → shadow (scan range), then dock anywhere
 *   survey                     → black hole ring 1, then dock anywhere
 *   an opponent about to win    → interdict: meet them where their cargo must go
 *   broken systems / low hull  → dock at the nearest station (repairs)
 *   nothing at all             → dock at the nearest station (fuel, cargo)
 *
 * Interdiction is the one goal that is not about the bot's own hand. A race
 * for three cards is also a race to stop whoever is ahead: a player two
 * cards down with a crate aboard is one dock from the win, and their route
 * is public (see `danger.ts`). Shooting them there costs them the crate and
 * a turn whether or not anyone holds their Destroy card.
 */
import type { Player, Position } from "../../models/game.ts";
import type { Mission } from "../../models/missions.ts";
import { SCAN_SECTOR_RANGE, SURVEY_RING } from "../../models/missions.ts";
import {
  BLACK_HOLE_ID,
  PLANETS,
  PLANET_OUTER_RING,
  STATION_RING,
} from "../../models/gravityWells.ts";
import type { GameView } from "../../game/view.ts";
import { getStationForPlanet } from "../../game/stations.ts";
import type { BotGoal, BotParameters, BotStatus, Opponent, OpponentDanger } from "../types.ts";
import {
  anySectorOnRing,
  nearDriftingShip,
  planFromShip,
  planShipToTarget,
  planStationMeetUp,
} from "../movementPlanner/index.ts";
import {
  CRITICAL_DANGER,
  INTERDICT_DANGER,
  cheapTurnEstimate,
  planInterception,
  stationPositionFor,
} from "./danger.ts";
import { volleyPotential, weaponRangeTarget } from "./combat.ts";

export { cheapTurnEstimate } from "./danger.ts";

/** Turns the chosen goal's plan may take. */
const PLAN_TURNS = 12;
const HUNT_PLAN_TURNS = 10;
/** Ambushes are set further ahead than a chase: the meeting point is fixed. */
const INTERDICT_PLAN_TURNS = 14;
/**
 * Turns of grace on an ambush. Arriving with the target is enough — the shot
 * happens on the way in — but arriving several turns after they have docked
 * is a wasted trip.
 */
const INTERDICT_SLACK = 2;
/** Ring plus sector distance at which an opponent is close enough to simply chase. */
const INTERDICT_CHASE_RANGE = 6;

export const REPAIR_GOAL_ID = "repair";
/** Goal of last resort: a station is always worth something (fuel, repairs, cargo). */
export const IDLE_GOAL_ID = "idle";
/** Standing goal: stop the player who is about to win. */
export const INTERDICT_GOAL_ID = "interdict";

/** Weapons that could actually be fired this trip (missiles need ammo). */
function usableWeapons(status: BotStatus) {
  return status.weapons.filter((w) => !w.isBroken && (w.type !== "missiles" || (w.ammo ?? 0) > 0));
}

function nearestPlanet(
  view: GameView,
  from: Position,
  candidates: string[]
): { planetId: string; turns: number } | null {
  let best: { planetId: string; turns: number } | null = null;
  for (const planetId of candidates) {
    const pos = stationPositionFor(view.stations, planetId);
    if (!pos) continue;
    const turns = cheapTurnEstimate(from, pos);
    if (!best || turns < best.turns) best = { planetId, turns };
  }
  return best;
}

function dockGoal(
  view: GameView,
  from: Position,
  mission: Pick<Mission, "id">,
  planetId: string,
  description: string,
  urgency: number
): BotGoal | null {
  const pos = stationPositionFor(view.stations, planetId);
  if (!pos) return null;
  return {
    type: "dock",
    missionId: mission.id,
    description,
    planetId,
    estimatedTurns: cheapTurnEstimate(from, pos),
    urgency,
  };
}

function dockAnywhereGoal(
  view: GameView,
  from: Position,
  mission: Mission,
  description: string,
  urgency: number
): BotGoal | null {
  const nearest = nearestPlanet(
    view,
    from,
    PLANETS.map((p) => p.id)
  );
  if (!nearest) return null;
  return {
    type: "dock",
    missionId: mission.id,
    description,
    planetId: nearest.planetId,
    estimatedTurns: nearest.turns,
    urgency,
  };
}

/**
 * The opponent worth diverting for, if any.
 *
 * Conditions, all from public information:
 *
 * - they are close enough to the win to score {@link INTERDICT_DANGER};
 * - the bot is not itself winning the race — if its own turns-to-win is no
 *   worse than theirs, racing beats fighting;
 * - its guns can actually beat the shield cubes it can see on them (a shield
 *   tile absorbs four damage a turn and is refilled for free, so a smaller
 *   volley never reaches their hull however often it lands);
 * - and it can be where they have to be before they get there. Arriving two
 *   turns after the delivery is a trip for nothing.
 *
 * Ties break on the player id so the choice is deterministic.
 */
export function interdictionTarget(
  opponents: Opponent[],
  from: Position,
  status: BotStatus,
  myDanger: OpponentDanger
): Opponent | null {
  const potential = volleyPotential(usableWeapons(status));
  if (potential <= 0) return null;
  let best: Opponent | null = null;
  for (const opponent of opponents) {
    if (opponent.danger.score < INTERDICT_DANGER) continue;
    if (myDanger.turnsToWin <= opponent.danger.turnsToWin) continue;
    if (potential <= opponent.shieldAbsorption) continue;
    const meet = opponent.danger.deliveryPosition ?? opponent.position;
    const nearby =
      opponent.sameWell && opponent.ringDistance + opponent.sectorDistance <= INTERDICT_CHASE_RANGE;
    if (
      !nearby &&
      cheapTurnEstimate(from, meet) > opponent.danger.turnsToDelivery + INTERDICT_SLACK
    ) {
      continue;
    }
    if (
      !best ||
      opponent.danger.score > best.danger.score ||
      (opponent.danger.score === best.danger.score && opponent.player.id < best.player.id)
    ) {
      best = opponent;
    }
  }
  return best;
}

export function computeGoals(
  view: GameView,
  me: Player,
  status: BotStatus,
  opponents: Opponent[],
  myDanger: OpponentDanger,
  parameters: BotParameters
): BotGoal[] {
  const goals: BotGoal[] = [];
  const from = status.position;
  const opponent = (id: string) => opponents.find((o) => o.player.id === id);

  for (const mission of me.missions) {
    if (mission.isCompleted) continue;
    switch (mission.type) {
      case "destroy_ship": {
        const target = opponent(mission.targetPlayerId);
        if (!target || usableWeapons(status).length === 0) break;
        // A target with cargo aboard has to dock, and everyone can see where:
        // the hunt is a wait at a known place rather than a search.
        const meet = target.danger.deliveryPosition ?? target.position;
        const predictable = target.danger.deliveryPosition !== null;
        goals.push({
          type: "hunt",
          missionId: mission.id,
          description: `Destroy ${target.player.name}`,
          targetPlayerId: target.player.id,
          estimatedTurns: cheapTurnEstimate(from, meet) + (predictable ? 2 : 4),
          urgency: target.danger.score >= INTERDICT_DANGER ? 3 : predictable ? 1 : 0,
        });
        break;
      }
      case "deliver_cargo": {
        const crate = me.cargo.find((c) => c.missionId === mission.id);
        const inHand = crate?.isPickedUp ?? false;
        const planetId = inHand ? mission.deliveryPlanetId : mission.pickupPlanetId;
        const goal = dockGoal(
          view,
          from,
          mission,
          planetId,
          inHand ? `Deliver crate to ${planetId}` : `Pick up crate at ${planetId}`,
          inHand ? 2 : 0
        );
        if (goal) goals.push(goal);
        break;
      }
      case "intercept_transmission": {
        if (!mission.scanAcquired) {
          const target = opponent(mission.targetPlayerId);
          if (!target || status.sensors.every((s) => s.isBroken)) break;
          goals.push({
            type: "shadow",
            missionId: mission.id,
            description: `Scan ${target.player.name}`,
            targetPlayerId: target.player.id,
            estimatedTurns: cheapTurnEstimate(from, target.position) + 1,
            urgency: 0,
          });
        } else {
          const goal = dockAnywhereGoal(view, from, mission, "Deliver scan data", 2);
          if (goal) goals.push(goal);
        }
        break;
      }
      case "survey": {
        if (!mission.surveyAcquired) {
          goals.push({
            type: "survey",
            missionId: mission.id,
            description: "Survey the event horizon",
            estimatedTurns: cheapTurnEstimate(from, {
              wellId: BLACK_HOLE_ID,
              ring: SURVEY_RING,
              sector: from.sector,
            }),
            urgency: 0,
          });
        } else {
          const goal = dockAnywhereGoal(view, from, mission, "Deliver survey data", 2);
          if (goal) goals.push(goal);
        }
        break;
      }
    }
  }

  // Interdiction: no card names this, the scoreboard does. A player two
  // cards down with cargo aboard wins on their next dock unless someone
  // meets them there. It is only worth the detour while the detour is no
  // longer than the bot's own next card — a turn spent away from a delivery
  // that was about to land is a turn given to everyone else at the table.
  const prey = interdictionTarget(opponents, from, status, myDanger);
  const hunting = me.missions.some(
    (m) => !m.isCompleted && m.type === "destroy_ship" && m.targetPlayerId === prey?.player.id
  );
  if (prey && !hunting) {
    const meet = prey.danger.deliveryPosition ?? prey.position;
    const detour = cheapTurnEstimate(from, meet);
    const ownNext = goals.reduce((best, g) => Math.min(best, g.estimatedTurns), Infinity);
    if (detour <= ownNext + INTERDICT_SLACK) {
      goals.push({
        type: "interdict",
        missionId: INTERDICT_GOAL_ID,
        description: `Interdict ${prey.player.name} (${prey.danger.completedMissions} cards, ${prey.danger.crates + prey.danger.data} aboard)`,
        targetPlayerId: prey.player.id,
        estimatedTurns: detour,
        urgency: prey.danger.score >= CRITICAL_DANGER ? 4 : 2,
      });
    }
  }

  // Repair: docking fixes every broken tile, restores hull and reloads.
  if (status.brokenSubsystems.length > 0 || status.hull <= parameters.repairHullThreshold) {
    const nearest = nearestPlanet(
      view,
      from,
      PLANETS.map((p) => p.id)
    );
    if (nearest) {
      goals.push({
        type: "dock",
        missionId: REPAIR_GOAL_ID,
        description: `Repair at ${nearest.planetId}`,
        planetId: nearest.planetId,
        estimatedTurns: nearest.turns,
        urgency:
          status.brokenSubsystems.length > 0 && status.hull <= parameters.repairHullThreshold
            ? 4
            : 3,
      });
    }
  }

  // Never stand still: with nothing else to chase, a station is worth a
  // trip for the fuel, the repairs and whatever cargo turns up there.
  if (goals.length === 0) {
    const nearest = nearestPlanet(
      view,
      from,
      PLANETS.map((p) => p.id)
    );
    if (nearest) {
      goals.push({
        type: "dock",
        missionId: IDLE_GOAL_ID,
        description: `Resupply at ${nearest.planetId}`,
        planetId: nearest.planetId,
        estimatedTurns: nearest.turns,
        urgency: 0,
      });
    }
  }

  return goals.sort((a, b) => goalPriority(a) - goalPriority(b));
}

/** Lower is pursued first. */
function goalPriority(goal: BotGoal): number {
  return goal.estimatedTurns - goal.urgency * 3;
}

export function selectCurrentGoal(goals: BotGoal[]): BotGoal | null {
  return goals[0] ?? null;
}

/**
 * Give the chosen goal a real movement plan. Falls back to coarser targets
 * when the precise one is out of reach within the planning horizon, so the
 * bot still moves in the right direction.
 */
export function attachPlanToGoal(
  goal: BotGoal,
  me: Player,
  view: GameView,
  opponents: Opponent[],
  status: BotStatus
): BotGoal {
  const ship = me.ship;
  const planned = (plan: ReturnType<typeof planFromShip>): BotGoal =>
    plan ? { ...goal, plan, estimatedTurns: plan.totalTurns } : goal;

  switch (goal.type) {
    case "dock": {
      const station = getStationForPlanet(view.stations, goal.planetId!);
      if (!station) return goal;
      const meet = planStationMeetUp(ship, station, PLAN_TURNS);
      if (meet) return planned(meet.plan);
      return planned(
        planShipToTarget(ship, anySectorOnRing(station.planetId, STATION_RING), PLAN_TURNS) ??
          planShipToTarget(ship, anySectorOnRing(station.planetId, PLANET_OUTER_RING), PLAN_TURNS)
      );
    }
    case "survey":
      return planned(
        planShipToTarget(ship, anySectorOnRing(BLACK_HOLE_ID, SURVEY_RING), PLAN_TURNS)
      );
    case "shadow": {
      const target = opponents.find((o) => o.player.id === goal.targetPlayerId);
      if (!target) return goal;
      return planned(
        planShipToTarget(
          ship,
          nearDriftingShip(target.position, SCAN_SECTOR_RANGE),
          HUNT_PLAN_TURNS
        ) ?? planFromShip(ship, target.position, "fastest", PLAN_TURNS)
      );
    }
    case "hunt":
    case "interdict": {
      const target = opponents.find((o) => o.player.id === goal.targetPlayerId);
      if (!target) return goal;
      const weapons = usableWeapons(status);
      const horizon = goal.type === "interdict" ? INTERDICT_PLAN_TURNS : HUNT_PLAN_TURNS;
      const interception = planInterception(ship, weapons, target.position, target.danger, horizon);
      if (interception) {
        return {
          ...goal,
          plan: interception.plan,
          estimatedTurns: interception.plan.totalTurns,
          description: `${goal.description} [${interception.kind}]`,
        };
      }
      return planned(
        planShipToTarget(ship, weaponRangeTarget(weapons, target.position), horizon) ??
          planFromShip(ship, target.position, "fastest", PLAN_TURNS)
      );
    }
  }
}
