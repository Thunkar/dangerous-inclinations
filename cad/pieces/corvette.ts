// The corvette's hull, at 80 mm bow to bells, printed in one piece belly
// down. Its massing comes from the game's own numbers
// (ui/src/ships/corvetteShape.ts); what the print changes is said where it
// is changed.
//
// The five mounts stand on raised plates (the flank between the chamfers is
// lower than a foot), each recess floor on the hull's own surface and its 6x2
// magnet sealed 0.7 behind it. All five magnets sit at mid-height, so one
// pause seals every one: insert a pause before the layer named in the part.
// The bells print separately (parts/bells.part.js) and plug into the thrust plate.
import { subtract, fuse } from "fluidcad/core";
import type { Axis, Solid, Vec } from "../lib/solids.ts";
import { CORVETTE } from "../../ui/src/ships/corvetteShape.ts";
import { MOUNT, STAND, FDM } from "../spec.ts";
import { S, BED, at, armored, onBed } from "../lib/hull.ts";
import { block, move, turn, disc } from "../lib/solids.ts";
import { socketTools, padSolid } from "../lib/mount.ts";

const ENGINES = 3;
const C = CORVETTE;
const { keelY, keelWidth, tiles } = C.armor;
const D = C.drive;
const H = D.sternHeight[ENGINES] + D.blockAdds[0];
const W = D.sternWidth[ENGINES] + D.blockAdds[1];
const o = D.origin;

/** Mid-height, where every mount's magnet centre sits, and the pause above it. */
const CENTRE = -BED * S;
const PAUSE =
  Math.ceil((CENTRE + (MOUNT.magnet.diameter + MOUNT.magnetClearance) / 2) / FDM.layer) * FDM.layer;
export const PAUSE_BEFORE = +(PAUSE + FDM.layer).toFixed(2);
const RISE = PAUSE - CENTRE;

/**
 * The mounts, as [x, y, z] of the plate's face in mm, the turn from the mount
 * frame (x forward, y dorsal, z outboard) to the print, and which way the
 * print's up runs in the mount frame.
 */
const flank = C.core[2][2] * S + MOUNT.recessDepth;
const bow = C.core[C.core.length - 1][0] * S;
interface MountAt {
  at: Vec;
  turns: [Axis, number][];
  up: 1 | -1;
}

const MOUNTS: MountAt[] = [
  ...[C.mounts.fore, C.mounts.aft].flatMap((x): MountAt[] => [
    // Port: outboard to -y, dorsal up.
    { at: [x * S, -flank, CENTRE], turns: [["x", 90]], up: 1 },
    // Starboard: the same module rolled over (it is symmetric dorsal to
    // ventral), so its frame's dorsal side is down.
    { at: [x * S, flank, CENTRE], turns: [["x", -90]], up: -1 },
  ]),
  // The bow: the foot's long axis across the beam, outboard forward.
  {
    at: [bow + MOUNT.recessDepth, 0, CENTRE],
    turns: [
      ["y", 90],
      ["x", 90],
    ],
    up: 1,
  },
];

const place = (solid: Solid, mount: MountAt): Solid =>
  move(
    mount.turns.reduce((s, [axis, deg]) => turn(s, axis, deg), solid),
    ...mount.at
  );

export interface CorvetteOptions {
  keelToBow: boolean;
  /** The mount, for trying other feet; the spec's by default. */
  mount?: typeof MOUNT;
  /** Stand the flank mounts on plates; without, the recess is sunk in the flank. */
  flankPlates?: boolean;
}

export function buildCorvette({
  keelToBow,
  mount = MOUNT,
  flankPlates = false,
}: CorvetteOptions): void {
  let hull: Solid = fuse(
    armored(C.core),
    // The afterbody: the drive block held aft, flaring into the core.
    armored([[o + D.block[0], H, W], [o + D.block[1], H, W], ...C.afterbody.joins]),
    // The shroud carries the block's section on aft of the thrust plate.
    armored([
      [o + D.shroud.aft, H, W],
      [o + D.block[0] + 0.01, H, W],
    ])
  );

  // The keel plating, one slab per tile as the game lays it (seams later),
  // and carried aft to the drive block so the afterbody's flare does not
  // hang over the bed. With `keelToBow` it runs on under the bow to the
  // bow plate, which the bow needs to print without support.
  const keelTop = (keelY - BED) * S + 0.01;
  const half = (keelWidth / 2) * S;
  const [lastX, lastLength] = tiles[tiles.length - 1];
  const last = lastX + lastLength / 2;
  const keelFrom = (o + D.block[1]) * S;
  const keelTo = keelToBow ? bow : last * S;
  hull = fuse(hull, block([keelFrom, -half, 0], [keelTo, half, keelTop]));
  if (keelToBow) {
    // Under the bow the core rises off the plating, so the keel stands up to
    // meet it.
    hull = fuse(hull, block([last * S - 1, -half * 0.75, 0], [keelTo, half * 0.75, CENTRE]));
  }

  // The mount plates, then their recesses and sealed magnet slots.
  for (const m of MOUNTS) {
    const onFlank = m.at[0] !== MOUNTS[MOUNTS.length - 1].at[0];
    if (onFlank && !flankPlates) continue;
    hull = fuse(hull, place(padSolid(mount), m));
  }
  for (const m of MOUNTS) {
    const sunk = !flankPlates && m.at[0] !== MOUNTS[MOUNTS.length - 1].at[0];
    const { recess, pocket } = socketTools(mount, m.up * RISE);
    if (sunk) {
      // No plate: the face is the flank itself, so the recess goes in by its depth.
      const inward = {
        ...m,
        at: [m.at[0], m.at[1] - Math.sign(m.at[1]) * mount.recessDepth, m.at[2]] as Vec,
      };
      hull = subtract(hull, place(recess, inward));
      hull = subtract(hull, place(pocket, inward));
      continue;
    }
    hull = subtract(hull, place(recess, m));
    hull = subtract(hull, place(pocket, m));
  }

  // The shroud's bay: open aft, back to the thrust plate.
  const bay = armored([
    [o + D.shroud.aft - 0.2, H - D.shroud.skin, W - D.shroud.skin],
    [o + D.thrustPlate, H - D.shroud.skin, W - D.shroud.skin],
  ]);
  hull = subtract(hull, bay);

  // A socket in the thrust plate for each bell's chamber, which reaches
  // 0.09 + 0.12 x scale forward of the plate face.
  const plate = (o + D.thrustPlate) * S;
  for (const [y, z, scale] of C.bells[ENGINES]) {
    const [, py, pz] = at([0, y, z]);
    const r = 0.3 * scale * S + MOUNT.clearance;
    const deep = (0.09 + 0.12 * scale) * S;
    hull = subtract(hull, move(turn(disc(2 * r, deep + 0.5), "y", 90), plate - 0.5, py, pz));
  }

  // The stand's socket, up from the keel.
  const side = STAND.peg + 2 * STAND.clearance;
  hull = subtract(
    hull,
    block([-0.4 * S - side / 2, -side / 2, -1], [-0.4 * S + side / 2, side / 2, STAND.depth])
  );

  // The drive block stands lower than the keel; the bed is the keel.
  onBed(hull);
}
