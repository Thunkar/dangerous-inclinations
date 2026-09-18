import type {
  GravityWell,
  GravityWellId,
  RingConfig,
  TransferArc,
  TransferLane,
  Position,
} from "./game.ts";
import { SECTORS_PER_RING } from "./rings.ts";

/**
 * Black hole: 5 rings. Inner rings are much faster.
 */
export const BLACKHOLE_RINGS: RingConfig[] = [
  { ring: 1, velocity: 8, sectors: SECTORS_PER_RING },
  { ring: 2, velocity: 6, sectors: SECTORS_PER_RING },
  { ring: 3, velocity: 4, sectors: SECTORS_PER_RING },
  { ring: 4, velocity: 2, sectors: SECTORS_PER_RING },
  { ring: 5, velocity: 1, sectors: SECTORS_PER_RING },
];

/**
 * Planets: 4 rings each. Ring 2 holds the station; ring 4 holds the lanes.
 *
 * Ring 1 is the reason there are four. With the station on the innermost ring
 * every ring a ship could sit on was slower than it, so a ship that arrived
 * behind the station could never gain: the fastest route to a dock was to burn
 * back and forth between the outer two rings until the phase came round, which
 * is a wait dressed up as a manoeuvre. A ring inside the station turns that
 * into a slingshot — dive, let the faster orbit carry you round, burn out onto
 * the station on the turn you choose.
 *
 * The velocities are the black hole's own sequence (8/6/4/2/1) minus its
 * innermost ring, so a planet reads like a smaller version of the same thing
 * rather than a second set of numbers to learn.
 */
export const PLANET_RINGS: RingConfig[] = [
  { ring: 1, velocity: 6, sectors: SECTORS_PER_RING },
  { ring: 2, velocity: 4, sectors: SECTORS_PER_RING },
  { ring: 3, velocity: 2, sectors: SECTORS_PER_RING },
  { ring: 4, velocity: 1, sectors: SECTORS_PER_RING },
];

export const BLACK_HOLE_ID: GravityWellId = "blackhole";
export const BLACK_HOLE: GravityWell = {
  id: BLACK_HOLE_ID,
  name: "Black Hole",
  type: "blackhole",
  rings: BLACKHOLE_RINGS,
};

export const PLANET_ALPHA: GravityWell = {
  id: "planet-alpha",
  name: "Alpha",
  type: "planet",
  rings: PLANET_RINGS,
};
export const PLANET_BETA: GravityWell = {
  id: "planet-beta",
  name: "Beta",
  type: "planet",
  rings: PLANET_RINGS,
};
export const PLANET_GAMMA: GravityWell = {
  id: "planet-gamma",
  name: "Gamma",
  type: "planet",
  rings: PLANET_RINGS,
};

/** Index 0 is the black hole, followed by the planets at 120° intervals. */
export const GRAVITY_WELLS: GravityWell[] = [BLACK_HOLE, PLANET_ALPHA, PLANET_BETA, PLANET_GAMMA];
export const PLANETS: GravityWell[] = GRAVITY_WELLS.filter((w) => w.type === "planet");

/** Everyone deploys together on this ring of the black hole; your sector becomes your Home. */
export const HOME_WELL_ID: GravityWellId = "blackhole";
export const HOME_RING = 4;
/** Ring stations orbit on (planets only). Ring 1 is faster, and is the way in. */
export const STATION_RING = 2;
/** Black hole ring where a survey is taken. */
export const BLACK_HOLE_OUTER_RING = 5;
export const PLANET_OUTER_RING = 4;

export const TRANSFER_ARC_LENGTH = 4;

function arc(wellId: GravityWellId, ring: number, startSector: number): TransferArc {
  return { wellId, ring, startSector, length: TRANSFER_ARC_LENGTH };
}

/**
 * Transfer lanes, one-way. The whole of black hole ring 5 is lanes; reading
 * clockwise: out to Beta (0–3), in from Alpha (4–7), out to Gamma (8–11), in
 * from Beta (12–15), out to Alpha (16–19), in from Gamma (20–23). Every
 * arrival arc is followed clockwise by the departure arc for the next planet,
 * so Alpha → Gamma → Beta → Alpha is the cheap circuit. Each planet's ring 3
 * has two arcs (4–7 and 16–19): one you arrive on, one you leave from.
 */
export const TRANSFER_LANES: TransferLane[] = [
  {
    id: "beta-a",
    planetId: "planet-beta",
    direction: "outbound",
    blackHoleArc: arc(BLACK_HOLE_ID, 5, 0),
    planetArc: arc("planet-beta", PLANET_OUTER_RING, 4),
  },
  {
    id: "alpha-a",
    planetId: "planet-alpha",
    direction: "inbound",
    blackHoleArc: arc(BLACK_HOLE_ID, 5, 4),
    planetArc: arc("planet-alpha", PLANET_OUTER_RING, 16),
  },
  {
    id: "gamma-a",
    planetId: "planet-gamma",
    direction: "outbound",
    blackHoleArc: arc(BLACK_HOLE_ID, 5, 8),
    planetArc: arc("planet-gamma", PLANET_OUTER_RING, 4),
  },
  {
    id: "beta-b",
    planetId: "planet-beta",
    direction: "inbound",
    blackHoleArc: arc(BLACK_HOLE_ID, 5, 12),
    planetArc: arc("planet-beta", PLANET_OUTER_RING, 16),
  },
  {
    id: "alpha-b",
    planetId: "planet-alpha",
    direction: "outbound",
    blackHoleArc: arc(BLACK_HOLE_ID, 5, 16),
    planetArc: arc("planet-alpha", PLANET_OUTER_RING, 4),
  },
  {
    id: "gamma-b",
    planetId: "planet-gamma",
    direction: "inbound",
    blackHoleArc: arc(BLACK_HOLE_ID, 5, 20),
    planetArc: arc("planet-gamma", PLANET_OUTER_RING, 16),
  },
];

/** The arc a lane is jumped from. */
export function laneDepartureArc(lane: TransferLane): TransferArc {
  return lane.direction === "outbound" ? lane.blackHoleArc : lane.planetArc;
}

/** The arc a lane lands on. */
export function laneArrivalArc(lane: TransferLane): TransferArc {
  return lane.direction === "outbound" ? lane.planetArc : lane.blackHoleArc;
}

export function getGravityWell(wellId: GravityWellId): GravityWell | undefined {
  return GRAVITY_WELLS.find((w) => w.id === wellId);
}

export function getRingConfig(wellId: GravityWellId, ring: number): RingConfig | undefined {
  return getGravityWell(wellId)?.rings.find((r) => r.ring === ring);
}

export function getWellName(wellId: GravityWellId): string {
  return getGravityWell(wellId)?.name ?? wellId;
}

/** Number of rings in a well (the outermost ring number). */
export function getMaxRing(wellId: GravityWellId): number {
  return getGravityWell(wellId)?.rings.length ?? 1;
}

export function isPlanet(wellId: GravityWellId): boolean {
  return getGravityWell(wellId)?.type === "planet";
}

/** Offset of `sector` inside `arc`, or -1 if the position is not in the arc. */
export function arcOffset(arc: TransferArc, position: Position): number {
  if (position.wellId !== arc.wellId || position.ring !== arc.ring) return -1;
  const offset = (position.sector - arc.startSector + SECTORS_PER_RING) % SECTORS_PER_RING;
  return offset < arc.length ? offset : -1;
}

export function arcSectors(arc: TransferArc): number[] {
  return Array.from({ length: arc.length }, (_, i) => (arc.startSector + i) % SECTORS_PER_RING);
}

export interface JumpOption {
  lane: TransferLane;
  destination: Position;
}

/**
 * Jumps available from a position: at most one per lane whose departure arc
 * contains the position. Arrival keeps the offset inside the arc.
 */
export function getJumpOptions(position: Position): JumpOption[] {
  const options: JumpOption[] = [];
  for (const lane of TRANSFER_LANES) {
    const offset = arcOffset(laneDepartureArc(lane), position);
    if (offset < 0) continue;
    const to = laneArrivalArc(lane);
    options.push({
      lane,
      destination: {
        wellId: to.wellId,
        ring: to.ring,
        sector: (to.startSector + offset) % SECTORS_PER_RING,
      },
    });
  }
  return options;
}

export function findJump(
  position: Position,
  destinationWellId: GravityWellId
): JumpOption | undefined {
  return getJumpOptions(position).find((o) => o.destination.wellId === destinationWellId);
}

/**
 * How far a jump may be phased, in sectors. A jump lands on the arrival arc
 * and may be shifted inside it for 1 fuel a sector, never out of it: from the
 * arc's first sector you may only go forward, from its last only back. Every
 * departure sector therefore reaches all {@link TRANSFER_ARC_LENGTH} sectors
 * of the arc.
 */
export function getJumpAdjustmentRange(option: JumpOption): { min: number; max: number } {
  const arc = laneArrivalArc(option.lane);
  const offset = arcOffset(arc, option.destination);
  return { min: -offset, max: arc.length - 1 - offset };
}

/**
 * Where a phased jump lands, or undefined when the shift would leave the
 * arrival arc.
 */
export function phasedJumpDestination(
  option: JumpOption,
  sectorAdjustment: number
): Position | undefined {
  const arc = laneArrivalArc(option.lane);
  const offset = arcOffset(arc, option.destination) + sectorAdjustment;
  const sector = arcSectors(arc)[offset];
  return sector === undefined ? undefined : { wellId: arc.wellId, ring: arc.ring, sector };
}

/**
 * Flat per-sector view of the lanes: one entry per departure sector.
 * Convenient for path planners that think in individual transfer points.
 */
export interface TransferPoint {
  laneId: string;
  fromWellId: GravityWellId;
  toWellId: GravityWellId;
  fromRing: number;
  toRing: number;
  fromSector: number;
  toSector: number;
}

export const TRANSFER_POINTS: TransferPoint[] = TRANSFER_LANES.flatMap((lane) => {
  const from = laneDepartureArc(lane);
  const to = laneArrivalArc(lane);
  return Array.from({ length: TRANSFER_ARC_LENGTH }, (_, i) => ({
    laneId: lane.id,
    fromWellId: from.wellId,
    toWellId: to.wellId,
    fromRing: from.ring,
    toRing: to.ring,
    fromSector: (from.startSector + i) % SECTORS_PER_RING,
    toSector: (to.startSector + i) % SECTORS_PER_RING,
  }));
});
