/**
 * Docking. A ship that **arrives** on a station's sector is docked: broken
 * systems are repaired, the hull is restored and missiles are reloaded, and
 * the visit does one job (RULES §Stations).
 *
 * One job a visit: your crates, your data or your fuel, and if more than one
 * is on offer you choose. Crates unload every crate bound here and then load
 * what waits here (a seized crate is a crate); data files everything that can
 * be filed here; fuel is a Tanker pumping its load. Whatever the job not done
 * would have moved stays where it was: crates aboard, crates on the dock, data
 * in the hold. A player who names no job (or one this visit cannot do) gets
 * the one that scores most on the visit, ties to crates, then data, then fuel.
 *
 * The hold takes one crate (RULES §Missions), so a second route waits: a
 * crate whose station this is stays on the dock until the hold is free.
 *
 * Arriving, not sitting. A docked ship stays moored until it burns away, and
 * for a while the whole dock re-resolved every turn it held the berth: a free
 * repair shop for anyone content to park in one. A visit is an event now: the
 * berth afterwards is worth the ride the station gives you and the fuel your
 * scoop skims, and nothing else. Come back for more and it is a trip.
 */
import type { GameState } from "../models/game.ts";
import type { EventDraft } from "../models/events.ts";
import type { Cargo, DockJob, Mission } from "../models/missions.ts";
import {
  CARGO_HOLD_CRATES,
  DOCK_JOBS,
  TANKER_FUEL,
  aboard,
  missionPoints,
} from "../models/missions.ts";
import { positionOf } from "./geometry.ts";
import { getStationAt } from "./stations.ts";
import { isDestroyed, reloadMissiles, repairAllSubsystems } from "./ship.ts";

/** What a visit reads off the ship: the hold, the hand and the tank. */
interface DockingShip {
  cargo: readonly Cargo[];
  missions: readonly Mission[];
  reactionMass: number;
}

interface DockJobOption {
  job: DockJob;
  /** Mission points the job completes on this visit. Loading a crate scores nothing. */
  points: number;
}

export interface DockJobs {
  /** The jobs this visit can do, in {@link DOCK_JOBS} order. */
  jobs: DockJobOption[];
  /** The job done when the player names none: the most points, ties in {@link DOCK_JOBS} order. */
  default: DockJob | null;
}

/** Everything each job would move at this station. */
interface VisitWork {
  /** Crates aboard that are delivered here. */
  unloaded: Cargo[];
  /** Crates waiting here that the hold has room for once the unloading is done. */
  loaded: Cargo[];
  /** Data aboard that is filed here. */
  filed: Cargo[];
  /** A Tanker with its load in the tank. */
  pumps: boolean;
}

const deliversHere = (item: Cargo, planetId: string) =>
  item.deliveryPlanetId === "any" || item.deliveryPlanetId === planetId;

function visitWork(ship: DockingShip, planetId: string): VisitWork {
  const held = aboard(ship.cargo);
  const unloaded = held.filter((c) => c.kind === "crate" && deliversHere(c, planetId));
  const filed = held.filter((c) => c.kind === "data" && deliversHere(c, planetId));

  // Unload first, then load: a crate delivered here frees the hold for one
  // waiting at the same station, which is what makes a chained route one trip
  // instead of two. A seized crate has no dock of its own, so nothing
  // reloads it.
  let room = CARGO_HOLD_CRATES - held.filter((c) => c.kind === "crate").length + unloaded.length;
  const loaded: Cargo[] = [];
  for (const item of ship.cargo) {
    if (item.isPickedUp || item.kind !== "crate" || room <= 0) continue;
    if (item.pickupPlanetId !== planetId) continue;
    loaded.push(item);
    room--;
  }

  const pumps =
    ship.missions.some((m) => m.type === "tanker" && !m.isCompleted) &&
    ship.reactionMass >= TANKER_FUEL;
  return { unloaded, loaded, filed, pumps };
}

/** Points for handing items in: each scores its card, if the card is in hand and undone. */
function pointsFor(items: readonly Cargo[], missions: readonly Mission[]): number {
  let points = 0;
  for (const item of items) {
    const mission = missions.find((m) => m.id === item.missionId && !m.isCompleted);
    if (mission) points += missionPoints(mission.type);
  }
  return points;
}

function jobsFor(work: VisitWork, missions: readonly Mission[]): DockJobs {
  const jobs: DockJobOption[] = [];
  if (work.unloaded.length > 0 || work.loaded.length > 0)
    jobs.push({ job: "crates", points: pointsFor(work.unloaded, missions) });
  if (work.filed.length > 0) jobs.push({ job: "data", points: pointsFor(work.filed, missions) });
  if (work.pumps) jobs.push({ job: "fuel", points: missionPoints("tanker") });

  let best: DockJobOption | null = null;
  for (const option of jobs) if (!best || option.points > best.points) best = option;
  return { jobs, default: best?.job ?? null };
}

/**
 * The jobs a visit to `planetId`'s station would offer a ship arriving with
 * this hold, hand and tank, with what each scores and the one done by default.
 * Pure: the referee docks by it and the table previews the choice with it.
 */
export function dockJobsOnArrival(ship: DockingShip, planetId: string): DockJobs {
  return jobsFor(visitWork(ship, planetId), ship.missions);
}

/** The job the visit does: the one named, if the visit can do it, or the default. */
export function chosenDockJob(offer: DockJobs, named?: DockJob): DockJob | null {
  if (named && offer.jobs.some((o) => o.job === named)) return named;
  return offer.default;
}

interface DockingResult {
  state: GameState;
  events: EventDraft[];
  /** Planet docked at, if any. */
  planetId?: string;
}

/**
 * @param arriving false when the ship was already moored when its turn began:
 *   it is holding a berth it already holds, which is not a visit.
 * @param named the job the player named for the visit, if any (a `dock_job`
 *   action).
 */
export function processDocking(
  state: GameState,
  playerIndex: number,
  arriving = true,
  named?: DockJob
): DockingResult {
  const player = state.players[playerIndex];
  if (isDestroyed(player.ship)) return { state, events: [] };
  if (!arriving) return { state, events: [] };
  const station = getStationAt(state.stations, positionOf(player.ship));
  if (!station) return { state, events: [] };

  const planetId = station.planetId;
  const shipOnArrival: DockingShip = {
    cargo: player.cargo,
    missions: player.missions,
    reactionMass: player.ship.reactionMass,
  };
  const work = visitWork(shipOnArrival, planetId);
  const job = chosenDockJob(jobsFor(work, player.missions), named);
  const events: EventDraft[] = [];

  const cargo = cargoAfter(player.cargo, work, job);
  const handedIn = job === "crates" ? work.unloaded : job === "data" ? work.filed : [];
  for (const item of player.cargo) {
    if (!handedIn.includes(item)) continue;
    events.push({
      type: "cargo_delivered",
      playerId: player.id,
      cargoId: item.id,
      kind: item.kind,
      planetId,
    });
  }
  if (job === "crates") {
    for (const item of work.loaded) {
      events.push({
        type: "cargo_picked_up",
        playerId: player.id,
        cargoId: item.id,
        kind: item.kind,
        planetId,
      });
    }
  }

  // Repairs, whatever the job.
  const repaired = repairAllSubsystems(player.ship);
  const reloaded = reloadMissiles(repaired.ship);
  // A dock puts the ship back to full hull. Capping it at 2 was measured on
  // 17 Sept 2026: a quarter more kills, but the no-weapon hull it was aimed at
  // did not budge (+13 to +12), because that hull was never healing anyway.
  const hullRestored = reloaded.ship.maxHitPoints - reloaded.ship.hitPoints;
  let ship = { ...reloaded.ship, hitPoints: reloaded.ship.hitPoints + hullRestored };

  events.push({
    type: "docked",
    playerId: player.id,
    planetId,
    hullRestored,
    repaired: repaired.repaired,
    missilesReloaded: reloaded.reloaded,
    job,
  });

  // Tanker: the card's fuel goes into the drums and the card is done.
  if (job === "fuel") {
    ship = { ...ship, reactionMass: ship.reactionMass - TANKER_FUEL };
    events.push({ type: "fuel_sold", playerId: player.id, amount: TANKER_FUEL, planetId });
  }

  const players = [...state.players];
  players[playerIndex] = { ...player, ship, cargo };
  return { state: { ...state, players }, events, planetId };
}

/**
 * The hold after the visit. What the job done hands in is gone and what it
 * loads is aboard. The rest is kept in a fixed order: the hold, then what
 * waits on a dock, then the items the visit could have worked and did not
 * (crates, then data), each group in the order it was carried.
 */
function cargoAfter(cargo: readonly Cargo[], work: VisitWork, job: DockJob | null): Cargo[] {
  const crateWork = new Set([...work.unloaded, ...work.loaded]);
  const dataWork = new Set(work.filed);
  const untouched = (c: Cargo) => !crateWork.has(c) && !dataWork.has(c);
  const kept: Cargo[] = [
    ...cargo.filter((c) => c.isPickedUp && untouched(c)),
    ...cargo
      .filter((c) => !c.isPickedUp && (untouched(c) || (job === "crates" && crateWork.has(c))))
      .map((c) => (crateWork.has(c) ? { ...c, isPickedUp: true } : c)),
  ];
  if (job !== "crates") kept.push(...cargo.filter((c) => crateWork.has(c)));
  if (job !== "data") kept.push(...cargo.filter((c) => dataWork.has(c)));
  return kept;
}
