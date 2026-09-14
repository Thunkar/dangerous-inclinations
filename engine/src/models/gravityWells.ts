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
 * Planets: 3 rings each. Ring 1 holds the station; ring 3 holds the lanes
 * and is where players deploy their Home.
 */
export const PLANET_RINGS: RingConfig[] = [
  { ring: 1, velocity: 4, sectors: SECTORS_PER_RING },
  { ring: 2, velocity: 2, sectors: SECTORS_PER_RING },
  { ring: 3, velocity: 1, sectors: SECTORS_PER_RING },
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

/** Ring players deploy on and return to after destruction (planets only). */
export const HOME_RING = 3;
/** Ring stations orbit on (planets only). */
export const STATION_RING = 1;
/** Black hole ring where a survey is taken. */
export const BLACK_HOLE_OUTER_RING = 5;
export const PLANET_OUTER_RING = 3;

export const TRANSFER_ARC_LENGTH = 4;

function arc(wellId: GravityWellId, ring: number, startSector: number): TransferArc {
  return { wellId, ring, startSector, length: TRANSFER_ARC_LENGTH };
}

/**
 * Transfer lanes. The whole of black hole ring 5 is lanes: reading clockwise
 * the order is Beta, Alpha, Gamma, Beta, Alpha, Gamma, so the next planet
 * clockwise from any arrival is always the cheap one. Each planet's ring 3
 * has two arcs (4–7 and 16–19).
 */
export const TRANSFER_LANES: TransferLane[] = [
  {
    id: "beta-a",
    planetId: "planet-beta",
    blackHoleArc: arc(BLACK_HOLE_ID, 5, 0),
    planetArc: arc("planet-beta", 3, 4),
  },
  {
    id: "alpha-a",
    planetId: "planet-alpha",
    blackHoleArc: arc(BLACK_HOLE_ID, 5, 4),
    planetArc: arc("planet-alpha", 3, 16),
  },
  {
    id: "gamma-a",
    planetId: "planet-gamma",
    blackHoleArc: arc(BLACK_HOLE_ID, 5, 8),
    planetArc: arc("planet-gamma", 3, 4),
  },
  {
    id: "beta-b",
    planetId: "planet-beta",
    blackHoleArc: arc(BLACK_HOLE_ID, 5, 12),
    planetArc: arc("planet-beta", 3, 16),
  },
  {
    id: "alpha-b",
    planetId: "planet-alpha",
    blackHoleArc: arc(BLACK_HOLE_ID, 5, 16),
    planetArc: arc("planet-alpha", 3, 4),
  },
  {
    id: "gamma-b",
    planetId: "planet-gamma",
    blackHoleArc: arc(BLACK_HOLE_ID, 5, 20),
    planetArc: arc("planet-gamma", 3, 16),
  },
];

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
 * Jumps available from a position: at most one per lane whose arc contains
 * the position. Arrival keeps the offset inside the arc.
 */
export function getJumpOptions(position: Position): JumpOption[] {
  const options: JumpOption[] = [];
  for (const lane of TRANSFER_LANES) {
    const fromBH = arcOffset(lane.blackHoleArc, position);
    if (fromBH >= 0) {
      const to = lane.planetArc;
      options.push({
        lane,
        destination: {
          wellId: to.wellId,
          ring: to.ring,
          sector: (to.startSector + fromBH) % SECTORS_PER_RING,
        },
      });
      continue;
    }
    const fromPlanet = arcOffset(lane.planetArc, position);
    if (fromPlanet >= 0) {
      const to = lane.blackHoleArc;
      options.push({
        lane,
        destination: {
          wellId: to.wellId,
          ring: to.ring,
          sector: (to.startSector + fromPlanet) % SECTORS_PER_RING,
        },
      });
    }
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
 * Flat per-sector view of the lanes: one entry per (sector, direction).
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
  const points: TransferPoint[] = [];
  for (let i = 0; i < TRANSFER_ARC_LENGTH; i++) {
    const bh = (lane.blackHoleArc.startSector + i) % SECTORS_PER_RING;
    const pl = (lane.planetArc.startSector + i) % SECTORS_PER_RING;
    points.push({
      laneId: lane.id,
      fromWellId: lane.blackHoleArc.wellId,
      toWellId: lane.planetArc.wellId,
      fromRing: lane.blackHoleArc.ring,
      toRing: lane.planetArc.ring,
      fromSector: bh,
      toSector: pl,
    });
    points.push({
      laneId: lane.id,
      fromWellId: lane.planetArc.wellId,
      toWellId: lane.blackHoleArc.wellId,
      fromRing: lane.planetArc.ring,
      toRing: lane.blackHoleArc.ring,
      fromSector: pl,
      toSector: bh,
    });
  }
  return points;
});
