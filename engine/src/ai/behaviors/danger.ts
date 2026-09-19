/**
 * Threat-to-win: how close every other player is to the three points, read
 * from public information only, and where to stand to stop them.
 *
 * A race for three secret objectives has a second source of value besides
 * your own progress: **denial**. What a player is carrying is public (crates
 * and data chits sit on the ship) and so is their score (completed cards are
 * face-up), so the table can always tell who is about to win and roughly
 * where they have to go:
 *
 * | Public fact                  | What it says                                   |
 * |------------------------------|------------------------------------------------|
 * | `completedMissionCount` = 2  | one card from the win, whichever card it is    |
 * | `cargoAboard.crates` > 0     | a Deliver is in progress; it ends at a station  |
 * | `cargoAboard.data` > 0       | an Intercept or Survey chit, deliverable at any station |
 * | the well they are in         | a crate cannot be delivered where it was loaded |
 *
 * Stations sit on planet ring 1 and drift 4 sectors a round, and the lanes
 * are the only way between wells, so "where will they be in five turns" is
 * a short list of places — which is exactly what makes shooting them
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
} from "../../models/game.ts";
import type { Subsystem } from "../../models/subsystems.ts";
import { MISSION_POINTS } from "../../models/missions.ts";
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
import { getStationForPlanet } from "../../game/stations.ts";
import type { PlayerView } from "../../game/view.ts";
import type { OpponentDanger } from "../types.ts";
import type { MovementPlan, PlannerTarget } from "../movementPlanner/index.ts";
import { nearDriftingShip, planFromShip, planShipToTarget } from "../movementPlanner/index.ts";
import { weaponRangeTarget } from "./combat.ts";

/** The thresholds live with the types so combat scoring can read them too. */
export { CRITICAL_DANGER, INTERDICT_DANGER } from "../types.ts";

// ---------------------------------------------------------------------------
// Cheap distances
// ---------------------------------------------------------------------------

/** Average sectors per turn used by the cheap estimate. */
const AVERAGE_VELOCITY = 3;

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
  const out = TRANSFER_LANES.find((l) => l.planetId === planet.id && l.direction === "outbound");
  const back = TRANSFER_LANES.find((l) => l.planetId === planet.id && l.direction === "inbound");
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
 * are aligned across rings — a burn lands on the sector it left — so the
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
  return station ? { wellId: station.planetId, ring: station.ring, sector: station.sector } : null;
}

// ---------------------------------------------------------------------------
// Danger
// ---------------------------------------------------------------------------

/** Turns a player typically needs for one card, start to finish (sim median). */
export const TYPICAL_MISSION_TURNS = 12;
/**
 * Points a card in progress is assumed to be worth. Every card but Survey
 * scores two, so counting cards by points rather than one-a-piece is what
 * keeps "how close are they?" honest.
 */
const POINTS_PER_CARD = Math.max(...Object.values(MISSION_POINTS));
/** Turns of a delivery run left after a pickup, for a player not carrying yet. */
export const PICKUP_TO_DELIVERY_TURNS = 8;
/** A turns-to-win of this many turns or more reads as no danger at all. */
export const DANGER_HORIZON = 30;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Planets a carrier could be docking at, nearest first.
 *
 * A data chit (a scan or a survey) is delivered at *any* station, so every
 * planet is a candidate. A crate was loaded at one station and its route
 * ends at a different planet, so the well they are orbiting right now is the
 * one place that crate cannot be going — the pickup is excluded. (A ship
 * carrying both is heading somewhere it can drop the chit, which includes
 * where it is.)
 */
export function predictedDeliveryPlanets(
  carrier: Position,
  crates: number,
  data: number,
  stations: Station[]
): string[] {
  if (crates <= 0 && data <= 0) return [];
  const excluded = crates > 0 && data <= 0 && isPlanet(carrier.wellId) ? carrier.wellId : null;
  return PLANETS.map((p) => p.id)
    .filter((id) => id !== excluded)
    .map((id) => ({ id, position: stationPositionFor(stations, id) }))
    .filter((c): c is { id: string; position: Position } => c.position !== null)
    .map((c) => ({ id: c.id, turns: cheapTurnEstimate(carrier, c.position) }))
    .sort((a, b) => a.turns - b.turns || (a.id < b.id ? -1 : 1))
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
 * So a player on two cards carrying a crate four turns from its station is
 * near 1; the same player with an empty hold and the nearest station half a
 * map away is around half; a player on no cards is near 0 whatever they
 * carry.
 */
export function assessDanger(
  player: Pick<PlayerView, "cargoAboard" | "completedMissionCount">,
  position: Position,
  stations: Station[],
  /** What this table plays to (`view.pointsToWin`), three or four. */
  pointsToWin: number
): OpponentDanger {
  const crates = player.cargoAboard.crates;
  const data = player.cargoAboard.data;
  const completed = player.completedMissionCount;
  const carrying = crates + data > 0;

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
  const pointsLeft = Math.max(0, pointsToWin - completed - POINTS_PER_CARD);
  const cardsLeft = Math.ceil(pointsLeft / POINTS_PER_CARD);
  const turnsToWin = legTurns + cardsLeft * TYPICAL_MISSION_TURNS;

  const progress = completed / pointsToWin;
  const imminence = clamp01(1 - turnsToWin / DANGER_HORIZON);

  return {
    score: clamp01(0.5 * progress + 0.5 * imminence),
    completedMissions: completed,
    crates,
    data,
    predictedPlanets,
    deliveryPosition,
    turnsToDelivery,
    turnsToWin,
    // One dock from the win: what is in the hold finishes the game.
    oneDeliveryFromWinning: completed + POINTS_PER_CARD >= pointsToWin && carrying,
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
  const sectors = new Set<number>();
  for (const lane of TRANSFER_LANES) {
    if (lane.planetId !== planetId || lane.direction !== "outbound") continue;
    for (const sector of arcSectors(lane.planetArc)) sectors.add(sector);
  }
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
 * 1. **chase** — weapon range of the target's own drifting orbit. Taken
 *    outright when it lands within {@link IMMEDIATE_ENGAGE_TURNS}; otherwise
 *    it carries {@link CHASE_PENALTY} turns, because a chase only works if
 *    the target obligingly coasts.
 * 2. **station** — weapon range of the station they are carrying cargo to.
 *    Stations drift 4 sectors a round, which the planner's moving-target
 *    search already lines up.
 * 3. **lane** — the arrival arcs of that planet, when they still have a well
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
