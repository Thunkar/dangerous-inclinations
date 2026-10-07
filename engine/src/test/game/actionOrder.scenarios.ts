/**
 * Turns played in every order: the states and the action sets.
 *
 * Shared by the engine's order test (`actionOrder.test.ts`), the UI's
 * (`ui/src/plan/orderConsistency.test.ts`) and the seat builder's
 * (`agent.test.ts`), so the referee, the plan preview and the builder are
 * asked about exactly the same turns.
 *
 * Each table is a seeded state and a set of actions; every permutation of the
 * set is one turn, sequenced 1..n in that order.
 */
import type { BurnIntensity, GameState, GravityWellId, Position } from "../../models/game.ts";
import { oppositeFacing } from "../../models/game.ts";
import type { SubsystemId } from "../../models/subsystems.ts";
import { findJump, phasedJumpDestination } from "../../models/gravityWells.ts";
import type { executeTurnAs } from "../testUtils.ts";
import {
  ALPHA,
  BH,
  LOADOUTS,
  burn,
  coast,
  fire,
  jump,
  makeGameState,
  makePlayer,
  power,
  rotate,
  scan,
  withShip,
} from "../testUtils.ts";

export type Draft = Parameters<typeof executeTurnAs>[1];

/** One action of a turn, before it is given its place in the sequence. */
export type Item =
  | { kind: "power"; tile: SubsystemId; amount: number }
  | { kind: "rotate" }
  | { kind: "coast"; scoop: boolean }
  | { kind: "burn"; intensity: BurnIntensity }
  | { kind: "jump"; to: GravityWellId }
  | { kind: "fire"; tile: SubsystemId; target: string; compensate?: boolean; count?: number }
  | { kind: "scan"; target: string };

export function draftOf(item: Item, sequence: number): Draft {
  switch (item.kind) {
    case "power":
      return power(sequence, item.tile, item.amount);
    case "rotate":
      // The facing is filled in when the ordering is known: see `draftsOf`.
      return rotate(sequence, "prograde");
    case "coast":
      return coast(sequence, item.scoop);
    case "burn":
      return burn(sequence, item.intensity);
    case "jump":
      return jump(sequence, item.to);
    case "fire":
      return fire(sequence, item.tile, item.target, "engines", item.compensate, item.count);
    case "scan":
      return scan(sequence, item.target);
  }
}

/**
 * The actions an ordering is sent as, sequenced 1..n. A rotation names the
 * facing it turns to, which is the other one from the ship's at the start:
 * a turn holds one rotation.
 */
export function draftsOf(state: GameState, ordering: readonly Item[]): Draft[] {
  const facing = state.players[state.activePlayerIndex].ship.facing;
  return ordering.map((item, i) =>
    item.kind === "rotate" ? rotate(i + 1, oppositeFacing(facing)) : draftOf(item, i + 1)
  );
}

/** Every ordering of `items`, each one a permutation. */
export function orderings<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, i) =>
    orderings([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest])
  );
}

export const label = (ordering: readonly Item[]): string =>
  ordering
    .map((i) => {
      switch (i.kind) {
        case "power":
          return `power ${i.tile}`;
        case "coast":
          return i.scoop ? "scoop" : "coast";
        case "burn":
          return `${i.intensity} burn`;
        case "jump":
          return `jump ${i.to}`;
        case "fire":
          return `fire ${i.tile}@${i.target}${i.compensate ? " comp" : ""}`;
        case "scan":
          return `scan @${i.target}`;
        default:
          return i.kind;
      }
    })
    .join(" > ");

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

/**
 * A d10 pinned to 8: a hit, or a critical when a sensor has energy on it, so
 * every shot says which critical range it was rolled against.
 */
const PINNED_EIGHT = { forcedRollValue: 8 };

/**
 * p1 on black hole ring 3, sector 6, prograde, flying the brawler (railgun;
 * side-0 laser, side-1 rack, side-2 shields, side-3 missiles).
 *  - p2 two sectors ahead on the ring: the railgun's from the start, and only
 *    while p1 faces prograde and stays on ring 3.
 *  - p3 two sectors astern: the railgun's only facing retrograde.
 *  - p4 one ring out, a sector ahead: the port laser's while facing prograde,
 *    the rack's from anywhere a ring and a sector off.
 *  - p5 two sectors ahead of where a soft burn lands (ring 4, sector 10): the
 *    railgun's only after that burn.
 */
export function brawlerState(): GameState {
  return makeGameState(
    [
      makePlayer("p1", { wellId: BH, ring: 3, sector: 6 }, LOADOUTS.brawler),
      makePlayer("p2", { wellId: BH, ring: 3, sector: 8 }),
      makePlayer("p3", { wellId: BH, ring: 3, sector: 4 }),
      makePlayer("p4", { wellId: BH, ring: 4, sector: 7 }),
      makePlayer("p5", { wellId: BH, ring: 4, sector: 12 }),
    ],
    PINNED_EIGHT
  );
}

/**
 * p1 on black hole ring 3, sector 6, prograde, a sensor bow with two port
 * guns (side-0 laser, side-1 plasma, side-2 shields, side-3 missiles).
 *  - p2 two sectors astern on the ring: in scan range from the start, out of
 *    it after any move.
 *  - p3 one ring out, a sector ahead: the port laser's and the port plasma's
 *    while facing prograde from the start.
 *  - p4 one ring out at sector 11: in scan range only after a soft burn
 *    (ring 4, sector 10), in the port guns' box only after a coast (ring 3,
 *    sector 10).
 */
export function sensorState(): GameState {
  return makeGameState(
    [
      makePlayer("p1", { wellId: BH, ring: 3, sector: 6 }, LOADOUTS.sensorGuns),
      makePlayer("p2", { wellId: BH, ring: 3, sector: 4 }),
      makePlayer("p3", { wellId: BH, ring: 4, sector: 7 }),
      makePlayer("p4", { wellId: BH, ring: 4, sector: 11 }),
    ],
    PINNED_EIGHT
  );
}

/** Where a jump from black hole ring 5, sector 17 to Alpha lands unphased. */
export function alphaLanding(): Position {
  return phasedJumpDestination(findJump({ wellId: BH, ring: 5, sector: 17 }, ALPHA)!, 0)!;
}

/**
 * p1 on the lane ring at the Alpha departure arc (black hole ring 5, sector
 * 17), facing retrograde, so a jump needs a rotation first.
 *  - p2 two sectors ahead facing retrograde: the railgun's before a rotation,
 *    but an uncompensated shot from ring 5 facing retrograde recoils off the
 *    rings, and facing prograde it recoils to ring 4, off the lane.
 *  - p3 at Alpha two sectors ahead of the landing: the railgun's after the
 *    jump, the missiles' only once p1 is in Alpha's well.
 */
export function laneState(): GameState {
  const landing = alphaLanding();
  return makeGameState(
    [
      makePlayer("p1", { wellId: BH, ring: 5, sector: 17, facing: "retrograde" }, LOADOUTS.brawler),
      makePlayer("p2", { wellId: BH, ring: 5, sector: 15 }),
      makePlayer("p3", { ...landing, sector: (landing.sector + 2) % 24 }),
    ],
    PINNED_EIGHT
  );
}

/**
 * p1 one ring inside the lane ring at the departure sector (black hole ring
 * 4, sector 17), facing retrograde, with p2 two sectors ahead: an
 * uncompensated railgun shot recoils it outward onto the lane, and only then
 * is the jump there to take.
 */
export function belowLaneState(): GameState {
  return makeGameState(
    [
      makePlayer("p1", { wellId: BH, ring: 4, sector: 17, facing: "retrograde" }, LOADOUTS.brawler),
      makePlayer("p2", { wellId: BH, ring: 4, sector: 15 }),
    ],
    PINNED_EIGHT
  );
}

/**
 * p1 on Alpha's ring 3, sector 22, prograde, a railgun in the bow: a rotation
 * and a soft burn inward drift it two sectors and drop it onto the station
 * (ring 2, sector 0). A ship is not moored until it docks at the end of the
 * turn (RULES §Stations, Moored), so it fires after arriving.
 *  - p2 one sector past the station on its ring: the rack's from the
 *    station's sector, and from nowhere else this turn reaches.
 */
export function stationState(): GameState {
  return makeGameState(
    [
      makePlayer("p1", { wellId: ALPHA, ring: 3, sector: 22 }, LOADOUTS.brawler),
      makePlayer("p2", { wellId: ALPHA, ring: 2, sector: 1 }),
    ],
    PINNED_EIGHT
  );
}

/**
 * p1 on Alpha's ring 3 at the station's sector (0), prograde: an
 * uncompensated railgun shot recoils it inward onto the station's sector,
 * which moors nothing: it may still fire, and a coast drifts it off at ring
 * 2's speed (RULES §Stations, Moored).
 *  - p2 two sectors ahead on ring 3: the railgun's from the start, and point
 *    blank after a coast.
 *  - p3 one sector past the station on its ring: the rack's from the start,
 *    from the station's sector and after a coast, not from where a coast
 *    leaves the recoiled ship.
 */
export function stationRecoilState(): GameState {
  return makeGameState(
    [
      makePlayer("p1", { wellId: ALPHA, ring: 3, sector: 0 }, LOADOUTS.brawler),
      makePlayer("p2", { wellId: ALPHA, ring: 3, sector: 2 }),
      makePlayer("p3", { wellId: ALPHA, ring: 2, sector: 1 }),
    ],
    PINNED_EIGHT
  );
}

/**
 * p1 moored at Alpha's station (ring 2, sector 0), prograde: it fires at
 * nobody until it leaves the sector, and a coast holds the berth.
 *  - p2 on Alpha's ring 3, sector 8: the missiles' from anywhere in the well.
 */
export function berthState(): GameState {
  return makeGameState(
    [
      makePlayer("p1", { wellId: ALPHA, ring: 2, sector: 0 }, LOADOUTS.brawler),
      makePlayer("p2", { wellId: ALPHA, ring: 3, sector: 8 }),
    ],
    PINNED_EIGHT
  );
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export interface OrderTable {
  name: string;
  build: () => GameState;
  items: Item[];
  /** What every ordering comes to: all accepted, all refused, or some of each. */
  outcome: "accepted" | "refused" | "mixed";
}

const R: Item = { kind: "rotate" };
const COAST: Item = { kind: "coast", scoop: false };
const SCOOP: Item = { kind: "coast", scoop: true };
const SOFT: Item = { kind: "burn", intensity: "soft" };
const rail = (target: string, compensate = false): Item => ({
  kind: "fire",
  tile: "forward-0",
  target,
  compensate,
});
const gun = (tile: SubsystemId, target: string): Item => ({ kind: "fire", tile, target });
const salvo = (target: string, count = 2): Item => ({
  kind: "fire",
  tile: "side-3",
  target,
  count,
});
const powerOn = (tile: SubsystemId, amount: number): Item => ({ kind: "power", tile, amount });
const scanAt = (target: string): Item => ({ kind: "scan", target });

export const ORDER_TABLES: OrderTable[] = [
  // The railgun's facing and recoil against a rotation, a laser and the move.
  ...[COAST, SOFT].flatMap((move) =>
    [false, true].map(
      (compensate): OrderTable => ({
        name: `brawler: rotate, railgun ahead${compensate ? " compensated" : ""}, laser, ${label([move])}`,
        build: () => brawlerState(),
        items: [R, rail("p2", compensate), gun("side-0", "p4"), move],
        outcome: compensate && move === SOFT ? "refused" : "mixed",
      })
    )
  ),
  // The railgun astern needs the rotation first; the rack and a salvo fire from anywhere.
  ...[COAST, SOFT].map(
    (move): OrderTable => ({
      name: `brawler: rotate, railgun astern, rack, salvo, ${label([move])}`,
      build: () => brawlerState(),
      items: [R, rail("p3"), gun("side-1", "p4"), salvo("p5"), move],
      outcome: "mixed",
    })
  ),
  {
    name: "brawler: a rack powered and fired, a wall, a coast",
    build: () => brawlerState(),
    items: [powerOn("side-1", 2), gun("side-1", "p4"), powerOn("side-2", 2), COAST],
    outcome: "refused",
  },
  {
    name: "brawler: a target only the burn brings into the railgun's arc",
    build: () => brawlerState(),
    items: [SOFT, rail("p5"), R],
    outcome: "mixed",
  },
  // No move: the coast comes after every shot.
  ...[false, true].map(
    (compensate): OrderTable => ({
      name: `brawler: no move, railgun${compensate ? " compensated" : ""}, rack, half wall`,
      build: () => brawlerState(),
      items: [rail("p2", compensate), gun("side-1", "p4"), powerOn("side-2", 1)],
      // The rack reaches p4 from ring 3, not from the ring the recoil leaves the ship on.
      outcome: compensate ? "accepted" : "mixed",
    })
  ),
  {
    name: "brawler dry: a scoop pays for the railgun's compensation",
    // An empty tank, and p2 five sectors ahead of the start: one ahead of the coast's end.
    build: () =>
      withShip(withShip(brawlerState(), "p1", { reactionMass: 0 }), "p2", { sector: 11 }),
    items: [SCOOP, rail("p2", true)],
    outcome: "mixed",
  },
  // The sensor: a scan or a power widens only the shots after it.
  ...[COAST, SOFT].map(
    (move): OrderTable => ({
      name: `sensor: scan, laser, plasma, ${label([move])}`,
      build: sensorState,
      items: [scanAt("p2"), gun("side-0", "p3"), gun("side-1", "p3"), move],
      outcome: "mixed",
    })
  ),
  {
    name: "sensor: a sensor powered and scanned with",
    build: sensorState,
    items: [powerOn("forward-0", 2), scanAt("p2"), gun("side-0", "p3"), COAST],
    outcome: "refused",
  },
  ...[COAST, SOFT].map(
    (move): OrderTable => ({
      name: `sensor: rotate, scan, laser, salvo, ${label([move])}`,
      build: sensorState,
      items: [R, scanAt("p2"), gun("side-0", "p3"), salvo("p4"), move],
      outcome: "mixed",
    })
  ),
  {
    name: "sensor: powered sensor, laser, plasma, rotate",
    build: sensorState,
    items: [powerOn("forward-0", 2), gun("side-0", "p3"), gun("side-1", "p3"), R],
    outcome: "mixed",
  },
  {
    name: "sensor: a scan only the burn reaches, and a laser only the start does",
    build: sensorState,
    items: [scanAt("p4"), SOFT, gun("side-0", "p3")],
    outcome: "mixed",
  },
  {
    name: "sensor: no move, scan, laser, plasma",
    build: sensorState,
    items: [scanAt("p2"), gun("side-0", "p3"), gun("side-1", "p3")],
    outcome: "accepted",
  },
  // Lanes: a jump needs prograde facing and the lane under it.
  ...[false, true].map(
    (compensate): OrderTable => ({
      name: `lane: rotate, jump, railgun at Alpha${compensate ? " compensated" : ""}, salvo`,
      build: laneState,
      items: [R, { kind: "jump", to: ALPHA }, rail("p3", compensate), salvo("p3")],
      outcome: compensate ? "refused" : "mixed",
    })
  ),
  {
    // Facing retrograde the recoil leaves the rings; facing prograde p2 is astern,
    // and after the jump p2 is in another well.
    name: "lane: rotate, jump, railgun on the lane ring",
    build: laneState,
    items: [R, { kind: "jump", to: ALPHA }, rail("p2")],
    outcome: "refused",
  },
  {
    name: "below the lane: the recoil puts the ship on the lane",
    build: belowLaneState,
    items: [rail("p2"), R, { kind: "jump", to: ALPHA }],
    outcome: "mixed",
  },
  // The station: arriving is not being moored, until the turn docks.
  ...[SOFT, SCOOP].map(
    (move): OrderTable => ({
      name: `station: wall, rotate, ${label([move])}`,
      build: stationState,
      items: [powerOn("side-2", 2), R, move],
      outcome: "accepted",
    })
  ),
  {
    name: "station: rotate, a soft burn onto the station, the rack after arriving",
    build: stationState,
    items: [R, SOFT, gun("side-1", "p2")],
    outcome: "mixed",
  },
  ...[[COAST], []].map(
    (move): OrderTable => ({
      name: `station: railgun recoil onto the station, rack${move.length ? ", coast" : ", no move"}`,
      build: stationRecoilState,
      items: [rail("p2"), gun("side-1", "p3"), ...move],
      outcome: move.length ? "mixed" : "accepted",
    })
  ),
  ...[SOFT, COAST].map(
    (move): OrderTable => ({
      name: `berth: salvo, ${label([move])}`,
      build: berthState,
      items: [salvo("p2"), move],
      outcome: move === SOFT ? "mixed" : "refused",
    })
  ),
];
