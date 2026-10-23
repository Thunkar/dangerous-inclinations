// A ship's hull, at 80 mm long for the corvette (the others at the same
// scale), printed in one piece belly down, its drive with it. It is the game's own ship:
// `createShip` builds it, every mesh is rebuilt as a solid (lib/kit.ts) and
// the solids are fused. What the print changes is only what printing needs,
// each said where it is done: parts thinner than a nozzle can draw are
// thickened, the modules and the mount shoes are left off (they print on
// their own), the bed is the hull's flat bottom, the mounts are cut to the
// printed interface with a slot up to each magnet from the bed (the magnet
// slides in from under the hull and a plug printed apart closes it), and the
// stand gets a socket. Anything that hangs below the bed prints as a piece
// of its own: the shrike's blade and the mantis's keel fin top their stands,
// and the mantis's arm fins print flat and slide into slits in the arms.
import { fuse, subtract } from "fluidcad/core";
import { Box3, Matrix4, Vector3, type Object3D } from "three";
import { DEFAULT_SHIP_APPEARANCE, type Hull } from "@dangerous-inclinations/engine";
import { createShip, type ShipModel } from "../../ui/src/ships/model.ts";
import { DEFAULT_CONFIG, MOUNTS as GAME_MOUNTS, type MountId } from "../../ui/src/ships/config.ts";
import { placedSolids, type PlacedSolid } from "../../ui/src/ships/solid.ts";
import { HULL_INFO } from "../../ui/src/ships/hulls.ts";
import { MANTIS_ARM_FIN, MANTIS_FIN } from "../../ui/src/ships/mantis.ts";
import { mountFace } from "../../ui/src/ships/mountShape.ts";
import { MOUNT, STAND, FDM, PRINT } from "../spec.ts";
import { printFrame, placeSolid, placeBuilt, uniteAlong } from "../lib/kit.ts";
import {
  block,
  disc,
  move,
  prism,
  section,
  taper,
  turn,
  type Point,
  type Solid,
  type Vec,
} from "../lib/solids.ts";
import {
  recessTool,
  pocketTool,
  plugTool,
  seatRise,
  socketBounds,
  type Mount,
} from "../lib/mount.ts";

const S = PRINT.mmPerUnit;

/**
 * Each hull's print: `bed` is its flat bottom (game y, `HULL_INFO.keel`);
 * `socket` where the stand's peg goes in (x), how wide the peg is and how
 * deep the socket, for a hull whose stand has a peg (`pieces/stand.ts`: the
 * mantis's grips its keel fin instead); `pins` the x of the filament pins
 * that locate a piece glued on below the bed (none where the piece is too
 * thin to take one); `carried` when the stand carries what hangs below
 * the bed itself (the shrike's blade), so the hull sits on it on filament
 * pins with no glue.
 */
export const HULL_PRINT: Record<
  Hull,
  {
    bed: number;
    socket: { x: number; peg: number; depth: number } | null;
    pins: number[];
    carried: boolean;
  }
> = {
  corvette: {
    bed: HULL_INFO.corvette.keel,
    socket: { x: -0.4, peg: STAND.peg, depth: STAND.depth },
    pins: [],
    carried: false,
  },
  // The blade is the stand's: the hull sits on it on the filament pins.
  shrike: { bed: HULL_INFO.shrike.keel, socket: null, pins: [-0.2, 0.9], carried: true },
  // The keel fin under the core is the stand's, as the shrike's blade is,
  // and the hull sits on it by the fin's tongue in a slit; the arm fins
  // slide into slits of their own and are glued (`slitFins`).
  mantis: {
    bed: HULL_INFO.mantis.keel,
    socket: null,
    pins: [],
    carried: true,
  },
};

export function shipModel(hull: Hull): ShipModel {
  return createShip({ ...DEFAULT_CONFIG, appearance: { ...DEFAULT_SHIP_APPEARANCE, hull } });
}

/**
 * What prints with the hull: not the modules (`module_<mount>_<type>`) or
 * the shipyard's mount highlights (a marker the yard lights when a mount is
 * picked, not part of the ship).
 */
const onHull = (p: PlacedSolid) =>
  p.material !== "highlight" && !p.path.some((n) => n.startsWith("module_"));

/** An object's matrix relative to the ship's root. */
function inShip(object: Object3D, root: Object3D): Matrix4 {
  root.updateMatrixWorld(true);
  return root.matrixWorld.clone().invert().multiply(object.matrixWorld);
}

/**
 * The printed mount's frame (x forward, y dorsal, z outboard, z = 0 the face,
 * in mm) as a matrix into the print. The game's mount frame is +X forward, +Y
 * outboard, +Z dorsal; the printed one maps onto it by a rotation (its dorsal
 * to the game's ventral, which the foot's symmetry allows).
 */
function mountFrame(model: ShipModel, frame: Matrix4, id: MountId): Matrix4 {
  const toGame = new Matrix4().makeBasis(
    new Vector3(1, 0, 0),
    new Vector3(0, 0, -1),
    new Vector3(0, 1, 0)
  );
  return frame
    .clone()
    .multiply(inShip(model.mounts.get(id)!.frame, model.root))
    .multiply(new Matrix4().makeTranslation(0, mountFace(id === "forward-0"), 0))
    .multiply(toGame)
    .multiply(new Matrix4().makeScale(1 / S, 1 / S, 1 / S));
}

/** A magnet's centre in the print (mm), behind its mount's recess floor. */
function magnetAt(m: Matrix4, mount: Mount = MOUNT): Vector3 {
  const t = mount.magnet.thickness + mount.magnetClearance;
  return new Vector3(0, 0, -mount.recessDepth - mount.skin - t / 2).applyMatrix4(m);
}

/**
 * Where each magnet's slot opens in the bed (mm, the print's x and y): the
 * magnet's outline seen from below, as wide as the slot is cut.
 */
function magnetSlots(hull: Hull, mount: Mount = MOUNT): Box3[] {
  const model = shipModel(hull);
  const frame = printFrame(HULL_PRINT[hull].bed);
  const a = (mount.magnet.diameter + mount.magnetClearance) / 2;
  const b = (mount.magnet.thickness + mount.magnetClearance) / 2;
  const z = -mount.recessDepth - mount.skin - b;
  return GAME_MOUNTS.map(({ id }) => {
    const m = mountFrame(model, frame, id);
    const box = new Box3();
    for (const x of [-a, a])
      for (const dz of [-b, b]) box.expandByPoint(new Vector3(x, 0, z + dz).applyMatrix4(m));
    box.min.z = -FAR;
    box.max.z = FAR;
    return box;
  });
}

/** What closes a hull's magnet slots, bottom up in each: a plug from the bed, then a spacer between two magnets in one slot. */
export interface Plug {
  length: number;
  spacer: boolean;
}

/**
 * The plugs and spacers a hull's slots take. Magnets whose slots run up
 * the same line (the shrike's two flank mounts a side) share one slot: the
 * top magnet seats in its roof and each below it stands on what is under it.
 */
export function plugsOf(hull: Hull, mount: Mount = MOUNT): Plug[] {
  const model = shipModel(hull);
  const frame = printFrame(HULL_PRINT[hull].bed);
  const columns = new Map<string, number[]>();
  for (const { id } of GAME_MOUNTS) {
    const c = magnetAt(mountFrame(model, frame, id), mount);
    const key = `${c.x.toFixed(1)},${c.y.toFixed(1)}`;
    columns.set(key, [...(columns.get(key) ?? []), c.z]);
  }
  const r = mount.magnet.diameter / 2;
  const plugs: Plug[] = [];
  for (const heights of columns.values()) {
    const zs = [...heights].sort((a, b) => a - b);
    zs[zs.length - 1] += seatRise(mount);
    let under = 0;
    zs.forEach((z, i) => {
      plugs.push({ length: +(z - r - under - mount.plugFit.length).toFixed(2), spacer: i > 0 });
      under = z + r;
    });
  }
  plugs.sort((a, b) => a.length - b.length);
  // Lengths a hair apart are one length: each takes the shortest of its run.
  for (const kind of [false, true]) {
    let base: number | undefined;
    for (const p of plugs.filter((p) => p.spacer === kind)) {
      if (base === undefined || p.length - base > mount.plugFit.share) base = p.length;
      p.length = base;
    }
  }
  return plugs;
}

/** The plugs' names for a part's title: how many of each length. */
export function plugNames(hull: Hull): string {
  const count = new Map<string, number>();
  for (const { length, spacer } of plugsOf(hull)) {
    const name = `${length.toFixed(1)} mm${spacer ? " spacer" : ""}`;
    count.set(name, (count.get(name) ?? 0) + 1);
  }
  return [...count].map(([name, n]) => `${n}x ${name}`).join(", ");
}

/** A hull's plugs and spacers as one print: lying side by side, 3 mm apart. */
export function buildPlugs(hull: Hull, mount: Mount = MOUNT): void {
  const pitch = mount.magnet.diameter + mount.magnetClearance + 3;
  plugsOf(hull, mount).forEach(({ length }, i) => move(plugTool(mount, length), 0, i * pitch, 0));
}

/** Something to cut, where it can reach in the print (mm). */
interface Cut {
  box: Box3;
  make: () => Solid;
  /** Would this cut take all of a piece in `box`? Then the piece is left out, not cut to nothing. */
  swallows?: (box: Box3) => boolean;
}

const boxOf = ([lo, hi]: [Vec, Vec], m: Matrix4) =>
  new Box3(new Vector3(...lo), new Vector3(...hi)).applyMatrix4(m);

const FAR = 300;
const ABOVE: [Vec, Vec] = [
  [-FAR, -FAR, 0],
  [FAR, FAR, FAR],
];
const BELOW: [Vec, Vec] = [
  [-FAR, -FAR, -FAR],
  [FAR, FAR, 0],
];
/** The pins that locate a glued piece: 1.75 mm filament in 1.9 mm holes, 3 mm each way. */
const PIN = { diameter: 1.9, depth: 3 };

/** A piece of the hull: where it is, where it may reach once grown and thickened, how to make it. */
interface Piece {
  box: Box3;
  reach: Box3;
  make: () => Solid | null;
  /** The drive's pair this piece belongs to (`intake_<n>`), fused on its own first. */
  pair?: string;
}

function piecesOf(model: ShipModel, frame: Matrix4): Piece[] {
  return placedSolids(model.root)
    .filter(onHull)
    .map((p) => {
      const box = boxOf(p.bounds, frame);
      return {
        box,
        reach: box.clone().expandByScalar(1),
        make: () => placeSolid(p, frame, { min: FDM.minFeature, grow: FDM.join }),
        pair: p.path.find((n) => /^intake_\d+$/.test(n)),
      };
    });
}

/** The stand's socket at x: a square for the peg, `depth` deep, its roof rising to a point at 45 degrees. */
function socketCuts(x: number, peg: number, depth: number): Cut[] {
  const cuts: Cut[] = [];
  const side = peg + 2 * STAND.clearance;
  const stand: [Vec, Vec] = [
    [x - side / 2, -side / 2, -1],
    [x + side / 2, side / 2, depth],
  ];
  cuts.push({ box: boxOf(stand, new Matrix4()), make: () => block(...stand) });
  // Its roof rises to a point at 45 degrees rather than closing flat over the peg.
  const roof: [Vec, Vec] = [
    [x - side / 2, -side / 2, depth - 0.01],
    [x + side / 2, side / 2, depth + side / 2],
  ];
  cuts.push({
    box: boxOf(roof, new Matrix4()),
    make: () =>
      move(
        taper(
          [
            [-side / 2, -side / 2],
            [side / 2, -side / 2],
            [side / 2, side / 2],
            [-side / 2, side / 2],
          ],
          side / 2 - 0.05
        ),
        x,
        0,
        depth - 0.01
      ),
  });
  return cuts;
}

/**
 * Cut each piece where a cut reaches it, then fuse what is left, anchored on
 * the biggest, in runs along the hull (`uniteAlong`).
 */
function cutAndUnite(pieces: Piece[], cuts: Cut[]): Solid {
  const made = pieces
    .filter((p) => !cuts.some((c) => c.swallows?.(p.reach)))
    .map((p) => {
      let s = p.make();
      if (!s) return null;
      for (const c of cuts) if (c.box.intersectsBox(p.reach)) s = subtract(s, c.make());
      return { s, box: p.box, pair: p.pair };
    })
    .filter((p): p is { s: Solid; box: Box3; pair: string | undefined } => p !== null);
  // Each of the drive's pairs fused on its own first: a pair is a couple of
  // hundred small pieces lying in and on each other, which one fuse with the
  // rest of the hull takes minutes over and a fuse of their own a second.
  const pairs = new Map<string, { s: Solid; box: Box3 }[]>();
  const loose: { s: Solid; box: Box3 }[] = [];
  for (const p of made) {
    if (p.pair) pairs.set(p.pair, [...(pairs.get(p.pair) ?? []), p]);
    else loose.push(p);
  }
  for (const group of pairs.values())
    loose.push({
      s: fuse(...group.map((p) => p.s)),
      box: group.reduce((b, p) => b.union(p.box), new Box3()),
    });
  const volume = (b: Box3) =>
    b
      .getSize(new Vector3())
      .toArray()
      .reduce((a, n) => a * n, 1);
  const core = loose.reduce(
    (best, p, i) => (volume(p.box) > volume(loose[best].box) ? i : best),
    0
  );
  return uniteAlong(loose, core);
}

function pinCuts(hull: Hull, up: boolean): Cut[] {
  return HULL_PRINT[hull].pins.map((x) => {
    const lo: Vec = [x * S - PIN.diameter, -PIN.diameter, up ? -0.01 : -PIN.depth];
    const hi: Vec = [x * S + PIN.diameter, PIN.diameter, up ? PIN.depth : 0.01];
    return {
      box: boxOf([lo, hi], new Matrix4()),
      make: () => move(disc(PIN.diameter, PIN.depth + 0.01), x * S, 0, up ? -0.01 : -PIN.depth),
    };
  });
}

/**
 * A flat fin that hangs below the bed and slides into a slit in the hull:
 * its outline in the game's (x, y), its thickness, its cant (radians about
 * x, through y = 0) and its z, as the yard draws it. It prints with a
 * tongue along its root that reaches up into the slit.
 */
export interface SlitFin {
  points: [number, number][];
  thick: number;
  cant: number;
  z: number;
  /** How far its tongue reaches up into the hull (mm), the room its slit leaves round the fin's thickness, and the tongue's own play in it. */
  deep: number;
  room: number;
  play: number;
}

/**
 * A fin's tongue (how deep it reaches and the room round it are the fin's
 * own: a glued fin's are looser than one the hull only sits on): how far
 * into the fin it starts, how far short of the fin's
 * ends at the bed it stops, the slit roof's half-angle off the fin's plane
 * (steep enough that a canted fin's slit still has a roof that prints), the
 * wall it leaves round a magnet's slot (the tongue steps over the plug, and
 * the fin is glued across the plug's foot), and its shortest run.
 */
const TONGUE = { into: 0.5, end: 0.8, roof: 30, clear: 1.2, shortest: 3 };

/** The fins that slide into slits: under the arms (glued) and the keel (the stand's). */
export function slitFins(hull: Hull): { arms: SlitFin[]; keel: SlitFin | null } {
  if (hull !== "mantis") return { arms: [], keel: null };
  const { points, thick, cant, z } = MANTIS_ARM_FIN;
  const { root, bottom, fore, lead, trail, aft } = MANTIS_FIN;
  return {
    // Glued: a loose slit takes the glue.
    arms: [-1, 1].map((s) => ({ points, thick, cant: -s * cant, z: s * z, deep: 3, room: 0.1, play: 0.1 })),
    keel: {
      points: [
        [fore, root],
        [lead, bottom],
        [trail, bottom],
        [aft, root],
      ],
      // The slit is the one printed hulls have, cut for a fin 0.09 thick;
      // the fin under it is the stand's and as thick as the game draws it,
      // and the hull sits on its root. Its tongue plays less in the slit
      // than a glued fin's.
      thick: 0.09,
      cant: 0,
      z: 0,
      deep: 3,
      room: 0.1,
      play: 0.05,
    },
  };
}

/** A fin's own frame, in mm (x along the ship, y up its plane, z through it), into the hull's print. */
function finFrame(hull: Hull, f: SlitFin): Matrix4 {
  return printFrame(HULL_PRINT[hull].bed)
    .multiply(new Matrix4().makeTranslation(0, 0, f.z))
    .multiply(new Matrix4().makeRotationX(f.cant))
    .multiply(new Matrix4().makeScale(1 / S, 1 / S, 1 / S));
}

/**
 * Where a fin meets the hull, in its own frame (mm): the bed's height up its
 * plane, the height its tongue starts at (inside the fin, which may stop a
 * hair under the bed), the tongue's ends along it and the fin's printed
 * thickness.
 */
function tongueOf(hull: Hull, f: SlitFin) {
  const pts = f.points.map(([x, y]): Point => [x * S, y * S]);
  const bed = (HULL_INFO[hull].keel * S) / Math.cos(f.cant);
  const top = Math.max(...pts.map(([, y]) => y));
  const at = Math.min(bed, top - 0.01);
  const xs: number[] = [];
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length];
    if ((a[1] - at) * (b[1] - at) <= 0 && a[1] !== b[1])
      xs.push(a[0] + ((at - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
  });
  const thick = f.thick * S + 2 * FDM.join;
  // Along the root, less the stretches where a magnet's slot opens under
  // the slit (with a wall round it).
  const slit = new Box3()
    .expandByPoint(new Vector3(-FAR, bed, -thick / 2 - 1).applyMatrix4(finFrame(hull, f)))
    .expandByPoint(
      new Vector3(FAR, bed + f.deep, thick / 2 + 1).applyMatrix4(finFrame(hull, f))
    );
  let spans: [number, number][] = [[Math.min(...xs) + TONGUE.end, Math.max(...xs) - TONGUE.end]];
  for (const slot of magnetSlots(hull)) {
    if (slot.max.y < slit.min.y || slot.min.y > slit.max.y) continue;
    const [lo, hi] = [slot.min.x - TONGUE.clear, slot.max.x + TONGUE.clear];
    spans = spans.flatMap(([a, b]): [number, number][] =>
      hi <= a || lo >= b
        ? [[a, b]]
        : (
            [
              [a, lo],
              [hi, b],
            ] as [number, number][]
          ).filter(([p, q]) => q > p)
    );
  }
  spans = spans.filter(([a, b]) => b - a >= TONGUE.shortest);
  return { pts, bed, from: at - TONGUE.into, spans, thick };
}

/** The tongue, in the fin's own frame: strips along the root from inside the fin up into the hull, filling its slit but for the tongue's play. */
function tongueSolids(hull: Hull, f: SlitFin): Solid[] {
  const t = tongueOf(hull, f);
  const grow = f.room - f.play;
  const half = t.thick / 2 + grow;
  return t.spans.map(([x0, x1]) => block([x0 - grow, t.from, -half], [x1 + grow, t.bed + f.deep + grow, half]));
}

/** The slits a fin's tongue slides into, cut in the hull: each strip and its room, open at the bed, its roof a V. */
function slitCuts(hull: Hull, f: SlitFin): Cut[] {
  const t = tongueOf(hull, f);
  const w = t.thick / 2 + f.room;
  const [lo, hi] = [t.bed - 1.5, t.bed + f.deep + f.room];
  const apex = hi + w / Math.tan((TONGUE.roof * Math.PI) / 180);
  const m = finFrame(hull, f);
  return t.spans.map(([a, b]) => {
    const [x0, x1] = [a - f.room, b + f.room];
    return {
      box: boxOf(
        [
          [x0, lo, -w],
          [x1, apex, w],
        ],
        m
      ),
      make: () =>
        placeBuilt(
          move(
            section(
              [
                [lo, -w],
                [hi, -w],
                [apex, 0],
                [hi, w],
                [lo, w],
              ],
              x1 - x0
            ),
            x0,
            0,
            0
          ),
          m
        ),
    };
  });
}

/** The keel fin under the hull as the stand carries it: the game's fin, band and all, below the bed, and its tongue. */
export function buildKeelFin(hull: Hull): Solid | null {
  const fin = slitFins(hull).keel;
  if (!fin) return null;
  const frame = printFrame(HULL_PRINT[hull].bed);
  const pieces = piecesOf(shipModel(hull), frame).filter(
    (p) => p.box.max.z < 0.5 && p.box.min.z < -2 && Math.abs((p.box.min.y + p.box.max.y) / 2) < 5
  );
  const blade = cutAndUnite(pieces, [
    {
      box: boxOf(ABOVE, new Matrix4()),
      make: () => block(...ABOVE),
      swallows: (b) => b.min.z >= -1.3,
    },
  ]);
  return fuse(blade, ...tongueSolids(hull, fin).map((s) => placeBuilt(s, finFrame(hull, fin))));
}

/** A fin cut at the bed with its tongue, lying flat in its own frame (the fin's plane on the bed). */
function flatFin(hull: Hull, f: SlitFin): Solid {
  const t = tongueOf(hull, f);
  const plate = subtract(
    move(prism(t.pts, t.thick), 0, 0, -t.thick / 2),
    block([-200, t.bed, -10], [200, 200, 10])
  );
  return fuse(plate, ...tongueSolids(hull, f));
}

/** The arm fins under the hull where they are glued, tongues in their slits: for the viewer. */
export function placeArmFins(hull: Hull): Solid[] {
  return slitFins(hull).arms.map((f) => placeBuilt(flatFin(hull, f), finFrame(hull, f)));
}

/** The arm fins as they print: lying flat side by side, tongue and all. */
export function buildArmFins(hull: Hull): Solid[] {
  return slitFins(hull).arms.map((f, i) => {
    const t = tongueOf(hull, f);
    // Flat: its own z (the thickness) up from the bed.
    return move(flatFin(hull, f), 0, i * 14 - Math.min(...t.pts.map(([, y]) => y)), t.thick / 2);
  });
}

export function buildHull(hull: Hull, mount: Mount = MOUNT): Solid {
  const model = shipModel(hull);
  const frame = printFrame(HULL_PRINT[hull].bed);
  const pieces = piecesOf(model, frame);

  // The cuts: each mount's recess and sealed magnet slot, the stand's
  // socket, the pins for a piece
  // glued on below, and the bed (whatever hangs below it prints on its own).
  const cuts: Cut[] = [];
  for (const { id } of GAME_MOUNTS) {
    const m = mountFrame(model, frame, id);
    // The slot runs down to the bed and 1 mm past it, whichever way the
    // mount frame's y points in the print.
    const up = Math.sign(new Vector3(0, 1, 0).transformDirection(m).z) || 1;
    const drop = -up * (magnetAt(m, mount).z + 1);
    const box = boxOf(socketBounds(mount, drop), m);
    // A piece inside the recess's box, seen in the mount's own frame.
    const local = m.clone().invert();
    const recess = new Box3(
      new Vector3(-mount.halfLength, -mount.halfHeight, -mount.recessDepth),
      new Vector3(mount.halfLength, mount.halfHeight, mount.recessReach + 1)
    );
    // The bow's recess is cut again a sag higher: its roof prints as a bridge.
    const sag = id === "forward-0" ? mount.bowSag : 0;
    cuts.push({
      box: box.clone().expandByVector(new Vector3(0, 0, sag)),
      make: () => {
        const cut = placeBuilt(recessTool(mount), m);
        return sag ? fuse(cut, move(placeBuilt(recessTool(mount), m), 0, 0, sag)) : cut;
      },
      swallows: (b) => recess.containsBox(b.clone().applyMatrix4(local)),
    });
    cuts.push({ box, make: () => placeBuilt(pocketTool(mount, drop), m) });
  }
  const socket = HULL_PRINT[hull].socket;
  if (socket) cuts.push(...socketCuts(socket.x * S, socket.peg, socket.depth));
  cuts.push(...pinCuts(hull, true));
  const { arms, keel } = slitFins(hull);
  for (const fin of [...arms, ...(keel ? [keel] : [])]) cuts.push(...slitCuts(hull, fin));
  cuts.push({
    box: boxOf(BELOW, new Matrix4()),
    make: () => block(...BELOW),
    // `reach` is a piece grown by 1 mm: one that would leave at most 0.3 mm above the bed goes.
    swallows: (b) => b.max.z <= 1.3,
  });
  return cutAndUnite(pieces, cuts);
}

/**
 * What hangs below the hull's bed, as a piece of its own: cut at the bed and
 * turned over to print standing on the cut, with holes for the pins that
 * locate it. Only what reaches well below the bed (2 mm) belongs to it; the
 * slivers of the drive block and the like under the bed are simply cut off.
 */
export function buildBelow(hull: Hull): Solid | null {
  const model = shipModel(hull);
  const frame = printFrame(HULL_PRINT[hull].bed);
  const pieces = piecesOf(model, frame).filter((p) => p.box.min.z < -2);
  const cuts: Cut[] = [
    {
      box: boxOf(ABOVE, new Matrix4()),
      make: () => block(...ABOVE),
      swallows: (b) => b.min.z >= -1.3,
    },
    ...pinCuts(hull, false),
  ];
  // Built below the bed, then turned over about x: the cut is the bed.
  return pieces.length ? turn(cutAndUnite(pieces, cuts), "x", 180) : null;
}
