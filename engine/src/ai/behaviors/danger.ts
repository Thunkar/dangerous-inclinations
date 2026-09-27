/**
 * Threat-to-win: how close every other player is to the three points, read
 * from public information only, and where to stand to stop them.
 *
 * A race for three secret objectives has a second source of value besides
 * your own progress: **denial**. What a player is carrying is public (crates
 * and data sit on the ship) and so is their score (completed cards are
 * face-up), so the table can always tell who is about to win and roughly
 * where they have to go:
 *
 * | Public fact                  | What it says                                   |
 * |------------------------------|------------------------------------------------|
 * | `completedMissionCount`      | their points: at two of three, any card wins    |
 * | `completedMissions`          | whether their primary is still to come          |
 * | `cargoAboard.crates` > 0     | a Deliver crate or Piracy loot; it ends at a station |
 * | `cargoAboard.data` > 0       | Intercept, Survey or Salvage data; it ends at a station |
 * | the well they are in         | a crate loaded there goes to the next planet round the circuit |
 *
 * Stations sit on planet ring 2 and drift 4 sectors a round, and the lanes
 * are the only way between wells, so "where will they be in five turns" is
 * a short list of places, which is exactly what makes shooting them
 * practical. Killing a carrier costs them the cargo (crates go back to their
 * pickup station, data is lost) and their next turn, so a kill next to a
 * delivery is worth several turns of their race.
 *
 * Nothing here reads a `GameState` or a hidden card; every input is a field
 * of {@link PlayerView} or a station position.
 */
import type {
  GravityWellId,
  Position,
  ShipState,
  Station,
  TransferArc,
  TransferLane,
} from "../../models/game.ts";
import type { Subsystem } from "../../models/subsystems.ts";
import { MISSION_POINTS, isPrimaryType } from "../../models/missions.ts";
import {
  BLACK_HOLE_OUTER_RING,
  PLANETS,
  PLANET_OUTER_RING,
  TRANSFER_LANES,
  arcSectors,
  isPlanet,
  laneArrivalArc,
  laneDepartureArc,
} from "../../models/gravityWells.ts";
import { forwardDistance, sectorDistance } from "../../game/geometry.ts";
import { getStationForPlanet, stationPosition } from "../../game/stations.ts";
import { circuitRoutes } from "../../game/missions/missionDeck.ts";
import type { PlayerView } from "../../game/view.ts";
import type { OpponentDanger } from "../types.ts";
import type { MovementPlan, PlannerTarget } from "../movementPlanner/index.ts";
import { nearDriftingShip, planFromShip, planShipToTarget } from "../movementPlanner/index.ts";
import { weaponRangeTarget } from "./combat.ts";

// ---------------------------------------------------------------------------
// Cheap distances
// ---------------------------------------------------------------------------

/** Average sectors per turn used by the cheap estimate. */
const AVERAGE_VELOCITY = 3;

/** A planet's lane in one direction: outbound from the black hole, or inbound back to it. */
export function planetLane(
  planetId: string,
  direction: TransferLane["direction"]
): TransferLane | undefined {
  return TRANSFER_LANES.find((l) => l.planetId === planetId && l.direction === direction);
}

interface PlanetLanes {
  /** Black hole ring 5 arc the jump *to* this planet leaves from. */
  departure: TransferArc;
  /** Planet ring 4 arc the jump *home* leaves from. */
  homeDeparture: TransferArc;
  /** Black hole ring 5 sector that jump home lands on. */
  homeArrival: number;
}

/** The two doors of every planet, read off the lane table once. */
const PLANET_LANES: Record<string, PlanetLanes> = {};
for (const planet of PLANETS) {
  const out = planetLane(planet.id, "outbound");
  const back = planetLane(planet.id, "inbound");
  if (!out || !back) continue;
  PLANET_LANES[planet.id] = {
    departure: laneDepartureArc(out),
    homeDeparture: laneDepartureArc(back),
    homeArrival: laneArrivalArc(back).startSector,
  };
}

const planetLanes = (wellId: GravityWellId): PlanetLanes | undefined => PLANET_LANES[wellId];

/** Turns of drift from `sector` prograde onto the nearest sector of `arc`. */
function turnsToArc(sector: number, arc: TransferArc): number {
  const ahead = Math.min(...arcSectors(arc).map((s) => forwardDistance(sector, s)));
  return Math.ceil(ahead / AVERAGE_VELOCITY);
}

/**
 * Planner-free estimate of turns from `from` to `to`, for ranking goals and
 * for guessing how long an opponent needs to reach their delivery. Biased
 * toward overestimating: mis-ranking a hard goal as harder only nudges the
 * bot toward easier ones.
 *
 * It has to know the circuit, or every "any station" is Alpha. Lanes are
 * one-way four-sector arcs at fixed sectors, so which planet is near depends
 * on where you are standing: from black hole ring 5 sector 0 the door to Beta
 * is underfoot and Alpha's is sixteen sectors of drift away, and from Alpha
 * the way home lands you next to Gamma's door, not Beta's. An estimate that
 * only counted rings and a flat jump overhead tied all three planets, so the
 * first one in `PLANETS` won every tie and the bots delivered to Alpha.
 *
 * So a cross-well trip is priced leg by leg: rings out to the lane ring, the
 * prograde drift onto the departure arc at {@link AVERAGE_VELOCITY} sectors a
 * turn, one turn for the jump, and the same again for a second well. Sectors
 * are aligned across rings (a burn lands on the sector it left), so the
 * current sector is the right one to measure the drift from.
 */
export function cheapTurnEstimate(from: Position, to: Position): number {
  if (from.wellId === to.wellId) {
    return (
      Math.abs(from.ring - to.ring) +
      Math.ceil(sectorDistance(from.sector, to.sector) / AVERAGE_VELOCITY)
    );
  }

  // Leaving a planet is always the same trip: out to the lane ring, round to
  // the inbound arc, jump, and you are on black hole ring 5 at a known sector.
  let turns = 0;
  let sector = from.sector;
  const home = planetLanes(from.wellId);
  if (home) {
    turns += Math.abs(from.ring - PLANET_OUTER_RING) + turnsToArc(from.sector, home.homeDeparture);
    turns += 1;
    sector = home.homeArrival;
  } else {
    turns += Math.abs(from.ring - BLACK_HOLE_OUTER_RING);
  }

  const destination = planetLanes(to.wellId);
  if (!destination) return turns + Math.abs(to.ring - BLACK_HOLE_OUTER_RING);
  return (
    turns + turnsToArc(sector, destination.departure) + 1 + Math.abs(to.ring - PLANET_OUTER_RING)
  );
}

export function stationPositionFor(stations: Station[], planetId: string): Position | null {
  const station = getStationForPlanet(stations, planetId);
  return station ? stationPosition(station) : null;
}

// ---------------------------------------------------------------------------
// Danger
// ---------------------------------------------------------------------------

/** Turns a player typically needs for one card, start to finish. */
const TYPICAL_MISSION_TURNS = 12;
/** What a primary card scores (Destroy, Deliver and Intercept score alike). */
const PRIMARY_POINTS = MISSION_POINTS.deliver_cargo;
/** What a secondary card scores (all five score alike). */
const SECONDARY_POINTS = MISSION_POINTS.survey;
/** Turns of a delivery run left after a pickup, for a player not carrying yet. */
const PICKUP_TO_DELIVERY_TURNS = 8;
/** A turns-to-win of this many turns or more reads as no danger at all. */
const DANGER_HORIZON = 30;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Where a Deliver crate loaded at each planet goes: the next planet round the circuit. */
const CIRCUIT_NEXT = new Map(circuitRoutes(PLANETS.map((p) => p.id)));

/**
 * Planets a carrier could be docking at, most likely first.
 *
 * Data is filed at any station (an Intercept's at the one its card names,
 * which is not public), so every planet is a candidate, nearest first. A
 * crate in a planet's well may have been loaded there: the Deliver deck
 * prints only the circuit routes, so that crate goes to the next planet round
 * the circuit, and that planet comes first. The rest follow nearest first: a
 * crate loaded elsewhere is delivered where it is, and loot sells anywhere.
 * (A ship carrying both is heading somewhere it can drop the data.)
 */
export function predictedDeliveryPlanets(
  carrier: Position,
  crates: number,
  data: number,
  stations: Station[]
): string[] {
  if (crates <= 0 && data <= 0) return [];
  const crateOnly = crates > 0 && data <= 0 && isPlanet(carrier.wellId);
  const circuit = crateOnly ? CIRCUIT_NEXT.get(carrier.wellId) : undefined;
  return PLANETS.map((p) => p.id)
    .map((id) => ({ id, position: stationPositionFor(stations, id) }))
    .filter((c): c is { id: string; position: Position } => c.position !== null)
    .map((c) => ({ id: c.id, turns: cheapTurnEstimate(carrier, c.position) }))
    .sort(
      (a, b) =>
        Number(b.id === circuit) - Number(a.id === circuit) ||
        a.turns - b.turns ||
        (a.id < b.id ? -1 : 1)
    )
    .map((c) => c.id);
}

/**
 * How close a player is to winning, and where they have to go to do it.
 *
 * Two halves, weighted equally:
 *
 * - **progress**: points already face-up, out of the points that win.
 * - **imminence**: how soon the cards still missing can land, counting the
 *   one in progress at its real distance and every later one at
 *   {@link TYPICAL_MISSION_TURNS}.
 *
 * So a player on two points carrying a crate four turns from its station is
 * near 1; the same player with an empty hold and the nearest station half a
 * map away is around half; a player on no points is near 0 whatever they
 * carry.
 *
 * Cards are priced by their points. What a hold is worth is not public (data
 * may be an Intercept's or a secondary's), so while a player's primary is
 * still face-down the card in progress is priced as the primary and every
 * later one as a secondary; once the primary is face-up every card left is a
 * secondary.
 */
export function assessDanger(
  player: Pick<PlayerView, "cargoAboard" | "completedMissionCount" | "completedMissions">,
  position: Position,
  stations: Station[],
  /** What this game plays to (`view.pointsToWin`). */
  pointsToWin: number
): OpponentDanger {
  const crates = player.cargoAboard.crates;
  const data = player.cargoAboard.data;
  const points = player.completedMissionCount;
  const carrying = crates + data > 0;
  const primaryDone = player.completedMissions.some((m) => isPrimaryType(m.type));

  const predictedPlanets = predictedDeliveryPlanets(position, crates, data, stations);
  const nearestPlanets = carrying
    ? predictedPlanets
    : predictedDeliveryPlanets(position, 0, 1, stations);
  const deliveryPosition = carrying
    ? (stationPositionFor(stations, predictedPlanets[0] ?? "") ?? null)
    : null;
  const nearestStation = stationPositionFor(stations, nearestPlanets[0] ?? "");
  const turnsToStation = nearestStation ? cheapTurnEstimate(position, nearestStation) : Infinity;
  const turnsToDelivery = deliveryPosition
    ? cheapTurnEstimate(position, deliveryPosition)
    : Infinity;

  // The card in progress, then one typical card for every further card they
  // still need. A player with an empty hold has to reach a station before
  // anything can start, so their next card costs the trip plus the run.
  const legTurns = carrying ? turnsToDelivery : turnsToStation + PICKUP_TO_DELIVERY_TURNS;
  const legPoints = primaryDone ? SECONDARY_POINTS : PRIMARY_POINTS;
  const pointsLeft = Math.max(0, pointsToWin - points - legPoints);
  const cardsLeft = Math.ceil(pointsLeft / SECONDARY_POINTS);
  const turnsToWin = legTurns + cardsLeft * TYPICAL_MISSION_TURNS;

  const progress = points / pointsToWin;
  const imminence = clamp01(1 - turnsToWin / DANGER_HORIZON);

  return {
    score: clamp01(0.5 * progress + 0.5 * imminence),
    points,
    crates,
    data,
    predictedPlanets,
    deliveryPosition,
    turnsToDelivery,
    turnsToWin,
  };
}

// ---------------------------------------------------------------------------
// Where to wait
// ---------------------------------------------------------------------------

/**
 * The lane arc a ship has to land on to enter `planetId` from the black
 * hole. Fixed geometry: the four-sector arc of the planet's outbound lane
 * on its outer ring, the only door into the well.
 */
export function laneArrivalTarget(planetId: string): PlannerTarget {
  const lane = planetLane(planetId, "outbound");
  const sectors = new Set<number>(lane ? arcSectors(lane.planetArc) : []);
  const first = [...sectors].sort((a, b) => a - b)[0] ?? 0;
  return {
    positionAt: () => ({ wellId: planetId, ring: PLANET_OUTER_RING, sector: first }),
    isMatch: (pos) =>
      pos.wellId === planetId && pos.ring === PLANET_OUTER_RING && sectors.has(pos.sector),
    period: 1,
    describe: () => `${planetId} lane arcs`,
  };
}

/** A shot this turn or next beats any ambush; take the chase when it is that close. */
const IMMEDIATE_ENGAGE_TURNS = 2;
/**
 * Turns added to a chase across open rings when it is compared with an
 * ambush. Standing where the target must come is worth a few turns of
 * waiting: the chase assumes they keep coasting, the ambush does not.
 */
const CHASE_PENALTY = 3;

export interface InterceptionPlan {
  plan: MovementPlan;
  /** Where the bot decided to meet them. */
  kind: "chase" | "station" | "lane";
}

/**
 * Where to go to get `weapons` onto a target, preferring places the target
 * has to come to over a chase around the rings.
 *
 * Three candidates, all planned with the same forward search so they are
 * comparable in turns:
 *
 * 1. **chase**: weapon range of the target's own drifting orbit. Taken
 *    outright when it lands within {@link IMMEDIATE_ENGAGE_TURNS}; otherwise
 *    it carries {@link CHASE_PENALTY} turns, because a chase only works if
 *    the target obligingly coasts.
 * 2. **station**: weapon range of the station they are carrying cargo to.
 *    Stations drift 4 sectors a round, which the planner's moving-target
 *    search already lines up.
 * 3. **lane**: the arrival arcs of that planet, when they still have a well
 *    to cross. Fixed sectors, and they cannot get in any other way.
 */
export function planInterception(
  ship: ShipState,
  weapons: Subsystem[],
  target: Position,
  danger: OpponentDanger,
  maxTurns: number
): InterceptionPlan | null {
  if (weapons.length === 0) return null;
  const chase = planShipToTarget(ship, weaponRangeTarget(weapons, target), maxTurns);
  if (chase && chase.totalTurns <= IMMEDIATE_ENGAGE_TURNS) return { plan: chase, kind: "chase" };

  const candidates: Array<{ plan: MovementPlan; kind: InterceptionPlan["kind"]; cost: number }> =
    [];
  if (chase)
    candidates.push({ plan: chase, kind: "chase", cost: chase.totalTurns + CHASE_PENALTY });

  const destination = danger.deliveryPosition;
  if (destination) {
    const station = planShipToTarget(ship, weaponRangeTarget(weapons, destination), maxTurns);
    if (station) candidates.push({ plan: station, kind: "station", cost: station.totalTurns });
    if (destination.wellId !== target.wellId) {
      const lane = planShipToTarget(ship, laneArrivalTarget(destination.wellId), maxTurns);
      if (lane) candidates.push({ plan: lane, kind: "lane", cost: lane.totalTurns });
    }
  }

  // Deterministic: ties fall to the earlier kind (chase, station, lane).
  let best: (typeof candidates)[number] | null = null;
  for (const candidate of candidates) if (!best || candidate.cost < best.cost) best = candidate;
  if (best) return { plan: best.plan, kind: best.kind };

  const fallback =
    planShipToTarget(ship, nearDriftingShip(target, 1), maxTurns) ??
    planFromShip(ship, target, "fastest", maxTurns);
  return fallback ? { plan: fallback, kind: "chase" } : null;
}
