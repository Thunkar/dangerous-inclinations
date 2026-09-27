/**
 * Goals. Each incomplete mission becomes a goal with a cheap turn estimate;
 * the cheapest (after urgency) is pursued and gets a real movement plan.
 * Eight mission types, plus three standing goals that no card names:
 *
 *   destroy_ship               → hunt: get weapons on the target
 *   deliver_cargo              → dock at pickup, then at delivery
 *   intercept_transmission     → shadow (scan range), then dock at the card's station
 *   survey                     → dive to black hole ring 1, then dock anywhere to file the data
 *   piracy                     → match orbits with a carrier in this well (or wait
 *                                on the lane arc they arrive through), then dock to sell
 *   tanker                     → no trip of its own: the fuel held back on every dock
 *                                plan, and the fast rings once the primary is in
 *   salvage                    → end a turn on a wreck (planned where it will have
 *                                drifted to) for its black box, then dock anywhere to file it
 *   escort                     → match orbits with a carrier in this well, as the
 *                                pirate does, and let them deliver
 *   an opponent about to win    → interdict: meet them where their cargo must go
 *   broken systems / low hull  → dock at the nearest station (repairs)
 *   nothing at all             → patrol the black hole ring where the rivals are
 *
 * Interdiction is the one goal that is not about the bot's own hand. A race
 * for three points is also a race to stop whoever is ahead: a player two
 * points up with a crate aboard is one dock from the win, and their route
 * is public (see `danger.ts`). Shooting them there costs them the crate and
 * a turn whether or not anyone holds their Destroy card.
 */
import type { Player, Position } from "../../models/game.ts";
import type { DockJob, Mission, SalvageMission } from "../../models/missions.ts";
import {
  SALE_RULES,
  SCAN_SECTOR_RANGE,
  SURVEY_RING,
  TANKER_FUEL,
  crateAboard,
  dataAboard,
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
  laneArrivalArc,
} from "../../models/gravityWells.ts";
import type { GameView } from "../../game/view.ts";
import { getStationForPlanet, isMooredAt } from "../../game/stations.ts";
import { positionOf, ringVelocity, sectorDistance } from "../../game/geometry.ts";
import { markedBy } from "../../game/escort.ts";
import { cratesLoadedOnArrival, dockJobsOnArrival } from "../../game/docking.ts";
import { saleAllowedAt, saleBlocked } from "./sales.ts";
import type { BotGoal, BotParameters, BotStatus, Opponent, OpponentDanger } from "../types.ts";
import {
  anySectorOnRing,
  nearDriftingShip,
  orbitingTarget,
  planFromShip,
  planShipToTarget,
  planStationMeetUp,
} from "../movementPlanner/index.ts";
import { CRITICAL_DANGER, INTERDICT_DANGER } from "../types.ts";
import {
  cheapTurnEstimate,
  laneArrivalTarget,
  planInterception,
  planetLane,
  stationPositionFor,
} from "./danger.ts";
import {
  destroyTargetIds,
  isWeaponReady,
  volleyPotential,
  weaponRangeTarget,
} from "./combat.ts";

/** Turns the chosen goal's plan may take. */
const PLAN_TURNS = 12;
const HUNT_PLAN_TURNS = 10;
/** Ambushes are set further ahead than a chase: the meeting point is fixed. */
const INTERDICT_PLAN_TURNS = 14;
/**
 * Turns of grace on an ambush. Arriving with the target is enough (the shot
 * happens on the way in), but arriving several turns after they have docked
 * is a wasted trip.
 */
const INTERDICT_SLACK = 2;
/** Ring plus sector distance at which an opponent is close enough to simply chase. */
const INTERDICT_CHASE_RANGE = 6;
/**
 * Urgency on the first step of a two-point card, so starting the primary
 * outranks a secondary at the same distance.
 *
 * The table plays to three points, and a hand is one two-point primary plus
 * two one-point secondaries: the secondaries alone are two points, so
 * the primary is not optional and the game cannot be won without it. Its
 * first step (the Intercept's scan, the Deliver's pickup) carried no
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
 * of what is left. One is a phase on the final burn: the estimate the goals
 * are ranked with counts turns, not fuel, so this is a margin rather than a
 * prediction; the reserve on the dock plan does the real accounting.
 */
const TANKER_APPROACH_FUEL = 1;
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
const TANKER_DETOUR_TURNS = 3;
/**
 * Turns within which a wreck is worth a trip while the primary is open. The
 * pirate's number: a secondary may borrow half a well from the card the seat
 * cannot win without, and no more. Past the primary any wreck on the board
 * is a goal. Unlike a carrier a wreck does not run for a station, so it is
 * ranked at no urgency: the window only shuts if another salvager gets there
 * first.
 */
const SALVAGE_CHASE_TURNS = PIRACY_CHASE_TURNS;

/** Standing goal: a station for repairs, hull and a reload. */
export const REPAIR_GOAL_ID = "repair";
/** Goal of last resort: go where the rivals are in the black hole. */
export const PATROL_GOAL_ID = "patrol";
/** The ring a patrol prefers on a tie, and heads for with no rival in the black hole. */
const PATROL_RING = 3;
/** Standing goal: stop the player who is about to win. */
const INTERDICT_GOAL_ID = "interdict";

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

/** A Survey still to dive for: undone, and its data not aboard. */
export function surveyToDive(me: Player, m: Mission): boolean {
  return m.type === "survey" && !m.isCompleted && !dataAboard(me, m);
}

/** Whether this Salvage card's black box is in the hold. */
export function blackBoxAboard(me: Player, m: SalvageMission): boolean {
  return me.cargo.some((c) => c.id === m.cargoId && c.isPickedUp);
}

/** The players an undone Intercept still has to scan (not for a dead card, under the one-sale experiment). */
export function interceptTargetIds(me: Player): Set<string> {
  return new Set(
    me.missions.flatMap((m) =>
      m.type === "intercept_transmission" &&
      !m.isCompleted &&
      !dataAboard(me, m) &&
      !(SALE_RULES.oneSalePerStation && saleBlocked(me, m) === "dead")
        ? [m.targetPlayerId]
        : []
    )
  );
}

/** Weapons that could actually be fired this trip (missiles need ammo). */
function usableWeapons(status: BotStatus) {
  return status.weapons.filter(isWeaponReady);
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

/** What a dock goal knows about the ship: its hand, its hold, its tank and its berth. */
interface DockingSeat {
  me: Player;
  status: BotStatus;
}

/**
 * Whether a visit to `planetId`'s station is worth a trip for `job`.
 *
 * A berth the ship already holds is never a destination: docking happens only
 * on arrival (RULES §Stations), so a goal "there" would be satisfied by sitting
 * still. And a visit does one job, so it is only a trip for `job` if the visit
 * would offer it (`dockJobsOnArrival`, read with the tank as it is now).
 *
 * Under the one-sale experiment a trip for a sale is a trip only to a station
 * that would buy that item from this seat (`saleAllowedAt`), and a pickup
 * (no job) is a trip only if a crate would load there.
 */
function worthVisiting(
  seat: DockingSeat,
  planetId: string,
  job?: DockJob,
  missionId?: string,
  cargoId?: string
): boolean {
  const { me, status } = seat;
  if (status.moored && planetId === status.position.wellId) return false;
  if (!job) return true;
  const ship = {
    cargo: me.cargo,
    missions: me.missions,
    reactionMass: status.reactionMass,
    soldAt: me.soldAt,
  };
  const offer = dockJobsOnArrival(ship, planetId);
  if (SALE_RULES.oneSalePerStation) {
    if (missionId !== undefined && !saleAllowedAt(me, planetId, missionId)) return false;
    return offer.jobs.some((o) => o.job === job && (cargoId === undefined || o.cargoId === cargoId));
  }
  return offer.jobs.some((o) => o.job === job);
}

/** One-sale experiment: a Deliver pickup is a trip if a crate would load there. */
function worthPickingUp(seat: DockingSeat, planetId: string): boolean {
  const { me, status } = seat;
  if (status.moored && planetId === status.position.wellId) return false;
  return (
    cratesLoadedOnArrival(
      { cargo: me.cargo, missions: me.missions, reactionMass: status.reactionMass },
      planetId
    ) > 0
  );
}

function dockGoal(
  view: GameView,
  seat: DockingSeat,
  missionId: string,
  planetId: string,
  description: string,
  urgency: number,
  dockJob?: DockJob,
  cargoId?: string
): BotGoal | null {
  if (!worthVisiting(seat, planetId, dockJob, missionId, cargoId)) return null;
  const pos = stationPositionFor(view.stations, planetId);
  if (!pos) return null;
  return {
    type: "dock",
    missionId,
    description,
    planetId,
    dockJob,
    ...(cargoId !== undefined ? { dockCargoId: cargoId } : {}),
    estimatedTurns: cheapTurnEstimate(seat.status.position, pos),
    urgency,
  };
}

/** The nearest station worth a trip for `dockJob`, whichever planet it orbits. */
function dockAnywhereGoal(
  view: GameView,
  seat: DockingSeat,
  missionId: string,
  describe: (planetId: string) => string,
  urgency: number,
  dockJob?: DockJob,
  cargoId?: string
): BotGoal | null {
  const candidates = PLANETS.map((p) => p.id).filter((id) =>
    worthVisiting(seat, id, dockJob, missionId, cargoId)
  );
  const nearest = nearestPlanet(view, seat.status.position, candidates);
  if (!nearest) return null;
  return {
    type: "dock",
    missionId,
    description: describe(nearest.planetId),
    planetId: nearest.planetId,
    dockJob,
    ...(cargoId !== undefined ? { dockCargoId: cargoId } : {}),
    estimatedTurns: nearest.turns,
    urgency,
  };
}

/** Undocked opponents with anything aboard: prey for a pirate, a mark for an escort. */
function undockedCarriers(view: GameView, opponents: Opponent[]): Opponent[] {
  // Who is carrying is public (`PlayerView.cargoAboard`), and a moored ship
  // neither loses cargo nor takes a marker.
  return opponents.filter(
    (o) =>
      o.player.cargoAboard.crates + o.player.cargoAboard.data > 0 &&
      !isMooredAt(view.stations, o.position)
  );
}

/**
 * Matched orbits with a carrier: the pirate's chase, which the escort flies
 * too. A carrier in this well is chased (at urgency while it is close enough
 * to catch, see {@link PIRACY_CHASE_TURNS}); with nobody in the well and the
 * primary in, the bot waits on the lane arc the nearest carrier's cargo has
 * to come through. `order` breaks ties between carriers the same distance
 * off; the nearest is always first.
 */
function carrierChaseGoal(
  view: GameView,
  from: Position,
  me: Player,
  mission: Mission,
  type: "pirate" | "escort",
  carriers: Opponent[],
  describe: (name: string) => string,
  order: (a: Opponent, b: Opponent) => number = () => 0
): BotGoal | null {
  // Only a carrier in the same well is a chase. The lanes are one-way
  // and the crate is already running for a station, so a chase that
  // starts a jump away arrives where somebody used to be: aimed at a
  // carrier's current sector anywhere on the map, it never closed.
  const prey = carriers
    .filter((o) => o.sameWell)
    .sort(
      (a, b) =>
        cheapTurnEstimate(from, a.position) - cheapTurnEstimate(from, b.position) || order(a, b)
    )[0];
  if (prey) {
    const turns = cheapTurnEstimate(from, prey.position) + 1;
    return {
      type,
      missionId: mission.id,
      description: describe(prey.player.name),
      targetPlayerId: prey.player.id,
      estimatedTurns: turns,
      // Ranked with the data's filing while the meeting is a turn or two
      // off (the window shuts the moment the carrier docks) and at no
      // urgency past that, so a crate on the far side of the well never
      // drags the bot off the card it has to finish.
      urgency: turns <= PIRACY_CHASE_TURNS ? 2 : 0,
    };
  }
  // Nobody in this well to chase. Once the primary is in, the bot goes and
  // stands where the cargo has to arrive: a planet's outbound lane lands on
  // one four-sector arc and there is no other door.
  if (primaryOutstanding(me)) return null;
  const ambush = nearestPlanet(
    view,
    from,
    carriers
      .map(
        (o) =>
          o.danger.predictedPlanets[0] ?? (isPlanet(o.position.wellId) ? o.position.wellId : null)
      )
      .filter((id): id is string => id !== null)
  );
  if (!ambush) return null;
  return {
    type,
    missionId: mission.id,
    description: `Wait for a carrier at ${ambush.planetId}`,
    planetId: ambush.planetId,
    estimatedTurns: ambush.turns,
    urgency: 0,
  };
}

/**
 * The opponent worth diverting for, if any.
 *
 * Conditions, all from public information:
 *
 * - they are close enough to the win to score {@link INTERDICT_DANGER};
 * - the bot is not itself winning the race: if its own turns-to-win is no
 *   worse than theirs, racing beats fighting;
 * - it has a gun that can fire this trip (a volley their shields soak still
 *   strips the cubes, heats them and can land a critical that breaks what it
 *   names);
 * - and it can be where they have to be before they get there. Arriving two
 *   turns after the delivery is a trip for nothing.
 *
 * Ties break on the player id so the choice is deterministic.
 */
function interdictionTarget(
  opponents: Opponent[],
  from: Position,
  status: BotStatus,
  myDanger: OpponentDanger,
  /** Ships carrying this seat's own Escort markers: never shot at. */
  escorting: ReadonlySet<string> = new Set()
): Opponent | null {
  const weapons = usableWeapons(status);
  if (volleyPotential(weapons) <= 0) return null;
  let best: Opponent | null = null;
  for (const opponent of opponents) {
    if (escorting.has(opponent.player.id)) continue;
    // At a berth with nowhere it has to go next: nothing to meet or shoot.
    if (opponent.safeAtBerth && opponent.danger.deliveryPosition === null) continue;
    if (opponent.danger.score < INTERDICT_DANGER) continue;
    if (myDanger.turnsToWin <= opponent.danger.turnsToWin) continue;
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

/**
 * Where a bot with nothing to do goes: the black hole ring holding the most
 * rivals (ties to {@link PATROL_RING}, then the ring nearest it, then the
 * lower), at the sector of a rival on it with the most rivals within scan
 * range (ties to the one nearest the bot, then the lower sector). With no
 * rival in the black hole, ring {@link PATROL_RING} at the sector the nearest
 * rival's way home lands on, or under the bot if there is no rival at all.
 */
function patrolTarget(from: Position, opponents: Opponent[]): Position {
  const inHole = opponents.filter((o) => o.position.wellId === BLACK_HOLE_ID);
  if (inHole.length === 0) {
    const nearest = [...opponents].sort(
      (a, b) =>
        cheapTurnEstimate(from, a.position) - cheapTurnEstimate(from, b.position) ||
        (a.player.id < b.player.id ? -1 : 1)
    )[0];
    const lane = nearest ? planetLane(nearest.position.wellId, "inbound") : undefined;
    const sector = lane ? laneArrivalArc(lane).startSector : from.sector;
    return { wellId: BLACK_HOLE_ID, ring: PATROL_RING, sector };
  }
  const onRing = (ring: number) => inHole.filter((o) => o.position.ring === ring);
  const ring = [...new Set(inHole.map((o) => o.position.ring))].sort(
    (a, b) =>
      onRing(b).length - onRing(a).length ||
      Math.abs(a - PATROL_RING) - Math.abs(b - PATROL_RING) ||
      a - b
  )[0];
  const rivals = onRing(ring);
  const within = (sector: number) =>
    rivals.filter((o) => sectorDistance(o.position.sector, sector) <= SCAN_SECTOR_RANGE).length;
  const sector = rivals
    .map((o) => o.position.sector)
    .sort(
      (a, b) =>
        within(b) - within(a) ||
        sectorDistance(from.sector, a) - sectorDistance(from.sector, b) ||
        a - b
    )[0];
  return { wellId: BLACK_HOLE_ID, ring, sector };
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
  const seat: DockingSeat = { me, status };
  const opponent = (id: string) => opponents.find((o) => o.player.id === id);

  for (const mission of me.missions) {
    if (mission.isCompleted) continue;
    // One-sale experiment: a card with no station left to sell at is dead,
    // and a secondary whose only stations left are the primary's waits.
    if (SALE_RULES.oneSalePerStation && saleBlocked(me, mission) !== null) continue;
    switch (mission.type) {
      case "destroy_ship": {
        const target = opponent(mission.targetPlayerId);
        if (!target || usableWeapons(status).length === 0) break;
        // A target with cargo aboard has to dock, and everyone can see where:
        // the hunt is a wait at a known place rather than a search.
        const meet = target.danger.deliveryPosition ?? target.position;
        const predictable = target.danger.deliveryPosition !== null;
        // A ship at a berth cannot be fired at (RULES §Stations): with nowhere
        // it has to go next, the hunt is no hurry until it casts off.
        const sheltered = target.safeAtBerth && !predictable;
        goals.push({
          type: "hunt",
          missionId: mission.id,
          description: `Destroy ${target.player.name}`,
          targetPlayerId: target.player.id,
          estimatedTurns: cheapTurnEstimate(from, meet) + (predictable ? 2 : 4),
          urgency: sheltered
            ? 0
            : target.danger.score >= INTERDICT_DANGER
              ? 3
              : predictable
                ? 1
                : 0,
        });
        break;
      }
      case "deliver_cargo": {
        const crate = me.cargo.find((c) => c.missionId === mission.id);
        const inHand = crate?.isPickedUp ?? false;
        // The hold takes one crate (RULES §Missions): while another route's
        // crate is aboard there is nothing to fetch, and the trip to its
        // station would be a trip to watch it stay on the dock.
        const holdFull = crateAboard(me.cargo);
        if (!inHand && holdFull) break;
        const planetId = inHand ? mission.deliveryPlanetId : mission.pickupPlanetId;
        // One-sale experiment: loading is not a sale, so a pickup names no job.
        if (SALE_RULES.oneSalePerStation && !inHand) {
          if (!worthPickingUp(seat, planetId)) break;
          const pickup = dockGoal(
            view,
            seat,
            mission.id,
            planetId,
            `Pick up crate at ${planetId}`,
            PRIMARY_START_URGENCY
          );
          if (pickup) goals.push(pickup);
          break;
        }
        const goal = dockGoal(
          view,
          seat,
          mission.id,
          planetId,
          inHand ? `Deliver crate to ${planetId}` : `Pick up crate at ${planetId}`,
          inHand ? 2 : PRIMARY_START_URGENCY,
          "crates",
          inHand ? mission.cargoId : undefined
        );
        if (goal) goals.push(goal);
        break;
      }
      case "intercept_transmission": {
        if (!dataAboard(me, mission)) {
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
            seat,
            mission.id,
            mission.deliveryPlanetId,
            `File the transmission at ${mission.deliveryPlanetId}`,
            2,
            "data",
            mission.dataCargoId
          );
          if (goal) goals.push(goal);
        }
        break;
      }
      case "piracy": {
        // Loot rides as a crate whatever was seized, fills the hold and sells
        // at any station by the crates job.
        const loot = me.cargo.find((c) => c.missionId === mission.id);
        if (loot?.isPickedUp) {
          const goal = dockAnywhereGoal(
            view,
            seat,
            mission.id,
            (planetId) => `Sell the loot at ${planetId}`,
            2,
            "crates",
            loot.id
          );
          if (goal) goals.push(goal);
          break;
        }
        // The hold takes one crate: a pirate carrying freight of its own
        // seizes nothing, so there is no trip to make yet.
        if (crateAboard(me.cargo)) break;
        // Data counts: it is loot like any other.
        const goal = carrierChaseGoal(
          view,
          from,
          me,
          mission,
          "pirate",
          undockedCarriers(view, opponents),
          (name) => `Take ${name}'s cargo`
        );
        if (goal) goals.push(goal);
        break;
      }
      case "tanker": {
        // No trip of its own while the primary is open. The fuel job is one a
        // visit may do when it has nothing else to do (a repair stop), so the
        // reserve rides on those trips (`attachPlanToGoal`);
        // a visit for crates or data does that job instead.
        if (primaryOutstanding(me)) break;
        // The fuel is pumped on arrival, so the tank has to still hold it
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
        const goal = dockAnywhereGoal(
          view,
          seat,
          mission.id,
          (planetId) => `Pump the fuel in at ${planetId}`,
          2,
          "fuel"
        );
        if (goal) goals.push(goal);
        break;
      }
      case "survey": {
        if (dataAboard(me, mission)) {
          // Data is filed at whatever station comes next.
          const goal = dockAnywhereGoal(
            view,
            seat,
            mission.id,
            (planetId) => `File the data at ${planetId}`,
            2,
            "data",
            mission.dataCargoId
          );
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
      case "salvage": {
        // The black box is data for any station, filed like a Survey's.
        if (blackBoxAboard(me, mission)) {
          const goal = dockAnywhereGoal(
            view,
            seat,
            mission.id,
            (planetId) => `File the black box at ${planetId}`,
            2,
            "data",
            mission.cargoId
          );
          if (goal) goals.push(goal);
          break;
        }
        // Any wreck will do, a moored ship's included: the box rides free
        // beside whatever is in the hold.
        const wreck = view.wrecks
          .map((w) => ({ wreck: w, turns: cheapTurnEstimate(from, positionOf(w)) }))
          .filter((w) => !primaryOutstanding(me) || w.turns <= SALVAGE_CHASE_TURNS)
          .sort((a, b) => a.turns - b.turns || (a.wreck.id < b.wreck.id ? -1 : 1))[0];
        if (!wreck) break;
        goals.push({
          type: "salvage",
          missionId: mission.id,
          description: `Salvage the wreck at ${wreck.wreck.wellId} R${wreck.wreck.ring}`,
          wreckId: wreck.wreck.id,
          estimatedTurns: wreck.turns,
          urgency: 0,
        });
        break;
      }
      case "escort": {
        // A marker on a ship stays until that ship delivers or dies: nothing
        // to do while it is out.
        if (mission.markedPlayerId !== null) break;
        // Each Escort marks a different ship, and a ship this seat means to
        // destroy is no escort: the bot never shoots a ship it escorts.
        const escorting = markedBy(me);
        const prey = destroyTargetIds(me);
        const carriers = undockedCarriers(view, opponents).filter(
          (o) => !escorting.has(o.player.id) && !prey.has(o.player.id)
        );
        // Nearest first, as the pirate; between two as near, the one whose
        // cargo is closer to its station, since that is when the card pays.
        const goal = carrierChaseGoal(
          view,
          from,
          me,
          mission,
          "escort",
          carriers,
          (name) => `Escort ${name}`,
          (a, b) =>
            a.danger.turnsToDelivery - b.danger.turnsToDelivery ||
            (a.player.id < b.player.id ? -1 : 1)
        );
        if (goal) goals.push(goal);
        break;
      }
    }
  }

  // Interdiction: no card names this, the scoreboard does. A player one
  // card from the win with cargo aboard wins on their next dock unless someone
  // meets them there. It is only worth the detour while the detour is no
  // longer than the bot's own next card: a turn spent away from a delivery
  // that was about to land is a turn given to everyone else at the table.
  const prey = interdictionTarget(opponents, from, status, myDanger, markedBy(me));
  if (prey && !destroyTargetIds(me).has(prey.player.id)) {
    const meet = prey.danger.deliveryPosition ?? prey.position;
    const detour = cheapTurnEstimate(from, meet);
    const ownNext = goals.reduce((best, g) => Math.min(best, g.estimatedTurns), Infinity);
    if (detour <= ownNext + INTERDICT_SLACK) {
      goals.push({
        type: "interdict",
        missionId: INTERDICT_GOAL_ID,
        description: `Interdict ${prey.player.name} (${prey.danger.points} points, ${prey.danger.crates + prey.danger.data} aboard)`,
        targetPlayerId: prey.player.id,
        estimatedTurns: detour,
        urgency: prey.danger.score >= CRITICAL_DANGER ? 4 : 2,
      });
    }
  }

  // Repair: docking fixes every broken subsystem, restores hull and reloads.
  if (status.brokenSubsystems.length > 0 || status.hull <= parameters.repairHullThreshold) {
    const goal = dockAnywhereGoal(
      view,
      seat,
      REPAIR_GOAL_ID,
      (planetId) => `Repair at ${planetId}`,
      status.brokenSubsystems.length > 0 && status.hull <= parameters.repairHullThreshold ? 4 : 3
    );
    if (goal) goals.push(goal);
  }

  // Nothing else to do: go where the rivals are. A station visit would do
  // nothing here (repairs and every cargo job have goals of their own), and
  // the black hole is where carriers, wrecks and targets turn up.
  if (goals.length === 0) {
    goals.push({
      type: "patrol",
      missionId: PATROL_GOAL_ID,
      description: "Patrol the black hole",
      estimatedTurns: cheapTurnEstimate(from, patrolTarget(from, opponents)),
      urgency: 0,
    });
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
      // that does, on a trip whose visit may do the fuel job: the Tanker's own
      // trip, or a repair stop, which takes the job worth most. A trip
      // for crates or data does that job instead, so a reserve there would
      // never pump. The fastest route burns the tank down and pumps nothing;
      // the same search with the fuel held back coasts in instead. Fastest
      // when no such route exists.
      const fuelVisit = goal.dockJob === undefined || goal.dockJob === "fuel";
      // One-sale experiment: and only to a station that would buy the fuel.
      const tanker = me.missions.find((m) => m.type === "tanker" && !m.isCompleted);
      const fuelSells =
        !SALE_RULES.oneSalePerStation ||
        (tanker !== undefined && saleAllowedAt(me, goal.planetId!, tanker.id));
      const reserve = holdsTanker(me) && fuelVisit && fuelSells ? TANKER_FUEL : 0;
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
    case "salvage": {
      // Wrecks drift once a round with the stations, by their ring's speed,
      // so the wreck is planned for as a station is: where it will be.
      const wreck = view.wrecks.find((w) => w.id === goal.wreckId);
      if (!wreck) return goal;
      const start = positionOf(wreck);
      return planned(
        planShipToTarget(
          ship,
          orbitingTarget(start, ringVelocity(start.wellId, start.ring)),
          PLAN_TURNS
        ) ?? planShipToTarget(ship, anySectorOnRing(start.wellId, start.ring), PLAN_TURNS)
      );
    }
    case "pirate":
    case "escort": {
      // No carrier in the well: wait on the arrival arc every crate bound for
      // this planet has to come through. A coast, not a berth: a moored ship
      // seizes nothing and marks nothing.
      if (!goal.targetPlayerId && goal.planetId) {
        return planned(planShipToTarget(ship, laneArrivalTarget(goal.planetId), PLAN_TURNS));
      }
      // The same sector, not near it: a seizure is matched orbits. Their ship
      // drifts while we close, so it is planned as a moving target.
      const prey = opponents.find((o) => o.player.id === goal.targetPlayerId);
      if (!prey) return goal;
      return planned(planShipToTarget(ship, nearDriftingShip(prey.position, 0), PLAN_TURNS));
    }
    case "patrol": {
      // On the patrol ring already: a coast keeps the goal, and no sector is
      // asked for, since phasing to one means leaving the ring and coming back.
      const target = patrolTarget(status.position, opponents);
      const onRing = anySectorOnRing(BLACK_HOLE_ID, target.ring);
      const here = status.position.wellId === BLACK_HOLE_ID && status.position.ring === target.ring;
      if (here) return planned(planShipToTarget(ship, onRing, PLAN_TURNS));
      return planned(
        planShipToTarget(ship, nearDriftingShip(target, SCAN_SECTOR_RANGE), PLAN_TURNS) ??
          planShipToTarget(ship, onRing, PLAN_TURNS)
      );
    }
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
