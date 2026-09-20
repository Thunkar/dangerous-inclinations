/**
 * Goals. Each incomplete mission becomes a goal with a cheap turn estimate;
 * the cheapest (after urgency) is pursued and gets a real movement plan.
 * Six mission types, plus three standing goals that no card names:
 *
 *   destroy_ship               → hunt: get weapons on the target
 *   deliver_cargo              → dock at pickup, then at delivery
 *   intercept_transmission     → shadow (scan range), then dock at the card's station
 *   survey                     → dive to black hole ring 1, then dock anywhere to file the chit
 *   piracy                     → match orbits with a carrier in this well (or wait
 *                                on the lane arc they arrive through), then dock to sell
 *   tanker                     → no trip of its own: the fuel held back on every dock
 *                                plan, and the fast rings once the primary is in
 *   an opponent about to win    → interdict: meet them where their cargo must go
 *   broken systems / low hull  → dock at the nearest station (repairs)
 *   nothing at all             → dock at the nearest station (repairs, cargo)
 *
 * Interdiction is the one goal that is not about the bot's own hand. A race
 * for three points is also a race to stop whoever is ahead: a player two
 * points up with a crate aboard is one dock from the win, and their route
 * is public (see `danger.ts`). Shooting them there costs them the crate and
 * a turn whether or not anyone holds their Destroy card.
 */
import type { Player, Position } from "../../models/game.ts";
import type { Mission } from "../../models/missions.ts";
import {
  SCAN_SECTOR_RANGE,
  SURVEY_RING,
  TANKER_FUEL,
  isPrimaryType,
} from "../../models/missions.ts";
import {
  BLACKHOLE_RINGS,
  BLACK_HOLE_ID,
  BLACK_HOLE_OUTER_RING,
  PLANETS,
  PLANET_OUTER_RING,
  STATION_RING,
  isPlanet,
} from "../../models/gravityWells.ts";
import type { GameView } from "../../game/view.ts";
import { getStationForPlanet, isMooredAt } from "../../game/stations.ts";
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
  laneArrivalTarget,
  planInterception,
  stationPositionFor,
} from "./danger.ts";
import { hullPotential, volleyPotential, weaponRangeTarget } from "./combat.ts";

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
/**
 * Urgency on the first step of a two-point card, so starting the primary
 * outranks a secondary at the same distance.
 *
 * The table plays to three points or four, and a hand is one two-point primary
 * plus two one-point secondaries: the secondaries alone are two points, so
 * the primary is not optional and the game cannot be won without it. Its
 * first step — the Intercept's scan, the Deliver's pickup — carried no
 * urgency, so the cheapest-first ranking sent the bot to its short
 * secondaries and left the primary until last, when the target had wandered
 * and the hull was worse.
 */
const PRIMARY_START_URGENCY = 1;
/**
 * Fuel kept back for the run in to the station on a Tanker.
 *
 * The card hands in {@link TANKER_FUEL} on arrival, so the tank has to hold
 * that much when the ship makes port and the approach has to be paid for out
 * of what is left. Two is a soft burn and a phase — the estimate the goals are
 * ranked with counts turns, not fuel, so this is the margin rather than a
 * prediction.
 */
const TANKER_APPROACH_FUEL = 2;
/**
 * Sectors a coast has to be worth before a Tanker calls a ring a pump.
 *
 * The scoop takes the ring's velocity out of a coast, so a ring paying four a
 * turn fills an empty tank in three coasts and black hole ring 3 is one burn
 * off the lane ring the ship leaves by. The event horizon pays eight and
 * costs two more burns each way to reach and leave: ranked in turns the dive
 * read as cheap, which is how it became the first thing every seat did.
 */
const TANKER_FILL_VELOCITY = 4;
/**
 * Turns within which a carrier is worth dropping everything for.
 *
 * A seizure is matched orbits with a ship that is running for a station, so
 * the chase only ever works from close by; further out the goal is still
 * ranked, at no urgency, and happens when nothing else wants the turn.
 *
 * Five, not three: measured on 30 games a row, three left the card at 11
 * completions per 100 kept against the 15 it managed when every chase carried
 * the urgency, and five puts it at 16 without touching the length of a game
 * or any other card. Half a well is still a chase worth making; the far side
 * of one never was.
 */
const PIRACY_CHASE_TURNS = 5;
/**
 * Turns a Tanker's reserve may add to a dock trip before it stops being a
 * reserve and becomes a trip of its own.
 */
const TANKER_DETOUR_TURNS = 2;

export const REPAIR_GOAL_ID = "repair";
/** Goal of last resort: a station is always worth something (fuel, repairs, cargo). */
export const IDLE_GOAL_ID = "idle";
/** Standing goal: stop the player who is about to win. */
export const INTERDICT_GOAL_ID = "interdict";

/**
 * The black hole ring a Tanker fills at: the nearest one whose coast is worth
 * {@link TANKER_FILL_VELOCITY} fuel, read off the ring table rather than
 * named. A ship in a planet well comes back through the outer ring, so that
 * is the ring it measures from.
 */
function tankerFillRing(from: Position): number {
  const ring = from.wellId === BLACK_HOLE_ID ? from.ring : BLACK_HOLE_OUTER_RING;
  const rings = BLACKHOLE_RINGS.filter((r) => r.velocity >= TANKER_FILL_VELOCITY).map(
    (r) => r.ring
  );
  return rings.sort((a, b) => Math.abs(a - ring) - Math.abs(b - ring) || a - b)[0] ?? SURVEY_RING;
}

/** The two-point card somebody else set this seat, while it is still open. */
function primaryOutstanding(me: Player): boolean {
  return me.missions.some((m) => !m.isCompleted && isPrimaryType(m.type));
}

/** A Tanker still to pump: every station this seat reaches wants the fuel aboard. */
function holdsTanker(me: Player): boolean {
  return me.missions.some((m) => !m.isCompleted && m.type === "tanker");
}

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
  const weapons = usableWeapons(status);
  if (volleyPotential(weapons) <= 0) return null;
  let best: Opponent | null = null;
  for (const opponent of opponents) {
    if (opponent.danger.score < INTERDICT_DANGER) continue;
    if (myDanger.turnsToWin <= opponent.danger.turnsToWin) continue;
    if (hullPotential(weapons, opponent.shieldAbsorption) <= 0) continue;
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
        // The hold takes one crate (RULES §Missions): while another route's
        // crate is aboard there is nothing to fetch, and the trip to its
        // station would be a trip to watch it stay on the dock.
        const holdFull = me.cargo.some((c) => c.kind === "crate" && c.isPickedUp);
        if (!inHand && holdFull) break;
        const planetId = inHand ? mission.deliveryPlanetId : mission.pickupPlanetId;
        const goal = dockGoal(
          view,
          from,
          mission,
          planetId,
          inHand ? `Deliver crate to ${planetId}` : `Pick up crate at ${planetId}`,
          inHand ? 2 : PRIMARY_START_URGENCY
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
            urgency: PRIMARY_START_URGENCY,
          });
        } else {
          // The card names the station the transmission is filed at.
          const goal = dockGoal(
            view,
            from,
            mission,
            mission.deliveryPlanetId,
            `File the transmission at ${mission.deliveryPlanetId}`,
            2
          );
          if (goal) goals.push(goal);
        }
        break;
      }
      case "piracy": {
        // The seized crate sells at any station, like a chit that happens to
        // fill the hold.
        const loot = me.cargo.find((c) => c.missionId === mission.id);
        if (loot?.isPickedUp) {
          const goal = dockAnywhereGoal(view, from, mission, "Sell the loot", 2);
          if (goal) goals.push(goal);
          break;
        }
        // The hold takes one crate: a pirate carrying freight of its own
        // seizes nothing, so there is no trip to make yet.
        if (me.cargo.some((c) => c.kind === "crate" && c.isPickedUp)) break;
        // Who is carrying is public (`PlayerView.cargoAboard`) — a chit counts,
        // it is loot like any other — and a moored ship neither loses cargo nor
        // takes any.
        const carriers = opponents.filter(
          (o) =>
            o.player.cargoAboard.crates + o.player.cargoAboard.data > 0 &&
            !isMooredAt(view.stations, o.position)
        );
        // Only a carrier in the same well is a chase. The lanes are one-way
        // and the crate is already running for a station, so a chase that
        // starts a jump away arrives where somebody used to be: aimed at a
        // carrier's current sector anywhere on the map, it never closed.
        const prey = carriers
          .filter((o) => o.sameWell)
          .sort(
            (a, b) => cheapTurnEstimate(from, a.position) - cheapTurnEstimate(from, b.position)
          )[0];
        if (prey) {
          const turns = cheapTurnEstimate(from, prey.position) + 1;
          goals.push({
            type: "pirate",
            missionId: mission.id,
            description: `Take ${prey.player.name}'s cargo`,
            targetPlayerId: prey.player.id,
            estimatedTurns: turns,
            // Ranked with the chit's filing while the seizure is a turn or two
            // off — the window shuts the moment the carrier docks — and at no
            // urgency past that, so a crate on the far side of the well never
            // drags the bot off the card it has to finish.
            urgency: turns <= PIRACY_CHASE_TURNS ? 2 : 0,
          });
          break;
        }
        // Nobody in this well to chase. Once the primary is in, the pirate
        // goes and stands where the cargo has to arrive: a planet's outbound
        // lane lands on one four-sector arc and there is no other door.
        if (primaryOutstanding(me)) break;
        const ambush = nearestPlanet(
          view,
          from,
          carriers
            .map(
              (o) =>
                o.danger.predictedPlanets[0] ??
                (isPlanet(o.position.wellId) ? o.position.wellId : null)
            )
            .filter((id): id is string => id !== null)
        );
        if (!ambush) break;
        goals.push({
          type: "pirate",
          missionId: mission.id,
          description: `Wait for a carrier at ${ambush.planetId}`,
          planetId: ambush.planetId,
          estimatedTurns: ambush.turns,
          urgency: 0,
        });
        break;
      }
      case "tanker": {
        // No trip of its own while the primary is open. The pumping happens on
        // *any* arrival with the fuel aboard (RULES §Stations), so the card is not
        // a destination — it is a reserve carried on the trips the seat is
        // making anyway, which `attachPlanToGoal` plans for below. A dock goal
        // of its own was a wasted journey: 10 arrivals in 118 held the fuel.
        if (primaryOutstanding(me)) break;
        // The fuel is handed in on arrival, so the tank has to still hold it
        // when the ship gets there: below that, the trip is to the fast rings
        // and the scoop (the planner takes the fuel out of a coast).
        if (status.reactionMass < TANKER_FUEL + TANKER_APPROACH_FUEL) {
          goals.push({
            type: "tanker",
            missionId: mission.id,
            description: "Fill the tank at the fast rings",
            estimatedTurns: cheapTurnEstimate(from, {
              wellId: BLACK_HOLE_ID,
              ring: tankerFillRing(from),
              sector: from.sector,
            }),
            urgency: 0,
          });
          break;
        }
        const goal = dockAnywhereGoal(view, from, mission, "Pump the fuel in", 2);
        if (goal) goals.push(goal);
        break;
      }
      case "survey": {
        if (mission.acquired) {
          // A chit is filed at whatever station comes next.
          const goal = dockAnywhereGoal(view, from, mission, "File the chit", 2);
          if (goal) goals.push(goal);
          break;
        }
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

  // A station the ship is already moored at is not a destination: docking
  // resolved the moment it arrived, and it keeps resolving every turn it
  // holds the berth. Sending it "there" would be a goal satisfied by sitting
  // still, which is how a bot with no affordable primary left used to hold a
  // berth for the rest of the game.
  const elsewhere = PLANETS.map((p) => p.id).filter((id) => !(status.moored && id === from.wellId));

  // Repair: docking fixes every broken tile, restores hull and reloads.
  if (status.brokenSubsystems.length > 0 || status.hull <= parameters.repairHullThreshold) {
    const nearest = nearestPlanet(view, from, elsewhere);
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

  // Never stand still: with nothing else to chase, a station is worth a trip
  // for the repairs and whatever cargo turns up there — and it has to be a
  // trip, since a dock resolves on arrival and the berth underneath the ship
  // has already given everything it has (RULES §Stations).
  if (goals.length === 0) {
    const nearest = nearestPlanet(view, from, elsewhere);
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
      // A seat holding a Tanker arrives with the fuel if there is any route
      // that does: the card is paid on arrival whatever brought the ship in,
      // so the reserve rides on the trip rather than costing one. The fastest
      // route burns the tank down to two and pumps nothing; the same search
      // with the fuel held back coasts in instead. Fastest when no such route
      // exists, which is the old behaviour for every other seat.
      const reserve = holdsTanker(me) ? TANKER_FUEL : 0;
      const fastest = planStationMeetUp(ship, station, PLAN_TURNS);
      const fuelled = reserve > 0 ? planStationMeetUp(ship, station, PLAN_TURNS, reserve) : null;
      const meet =
        fuelled && (!fastest || fuelled.totalTurns <= fastest.totalTurns + TANKER_DETOUR_TURNS)
          ? fuelled
          : fastest;
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
    // A tanker fills where a coast is worth enough fuel to be worth the trip,
    // which is not the survey's dive: the scoop takes a ring's velocity out of
    // a coast, and the climb back out of the event horizon costs more turns
    // than the faster ring saves.
    case "tanker":
      return planned(
        planShipToTarget(
          ship,
          anySectorOnRing(BLACK_HOLE_ID, tankerFillRing(status.position)),
          PLAN_TURNS
        )
      );
    case "pirate": {
      // No carrier in the well: wait on the arrival arc every crate bound for
      // this planet has to come through. A coast, not a berth — a moored ship
      // seizes nothing.
      if (!goal.targetPlayerId && goal.planetId) {
        return planned(planShipToTarget(ship, laneArrivalTarget(goal.planetId), PLAN_TURNS));
      }
      // The same sector, not near it: a seizure is matched orbits. Their ship
      // drifts while we close, so it is planned as a moving target.
      const prey = opponents.find((o) => o.player.id === goal.targetPlayerId);
      if (!prey) return goal;
      return planned(planShipToTarget(ship, nearDriftingShip(prey.position, 0), PLAN_TURNS));
    }
    case "tour":
      // Into the well is enough; the lanes arrive on its outer ring.
      return planned(
        planShipToTarget(ship, anySectorOnRing(goal.planetId!, PLANET_OUTER_RING), PLAN_TURNS)
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
