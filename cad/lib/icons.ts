// The game's icons (ui/src/art/paths.ts: one filled path per icon on a 64 box,
// y down, traced from the artwork) as outlines a sketch can draw, so a printed
// piece carries the same marks as the board and the card.
import { sketch, plane, cut } from "fluidcad/core";
import { TRACED_PATHS } from "../../ui/src/art/paths.ts";
import { outline, type Point } from "./solids.ts";

export type IconName = keyof typeof TRACED_PATHS;

/** An icon's closed loops, `size` mm square, centred on the origin, y up; curves become 4 segments. */
export function iconLoops(name: IconName, size: number): Point[][] {
  const tokens = TRACED_PATHS[name].match(/[MLQZ]|-?\d*\.?\d+/g) ?? [];
  const k = size / 64;
  const at = (x: number, y: number): Point => [(x - 32) * k, (32 - y) * k];
  const loops: Point[][] = [];
  let loop: Point[] = [];
  let pen: [number, number] = [0, 0];
  let i = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const c = tokens[i++];
    if (c === "M") {
      if (loop.length > 2) loops.push(loop);
      pen = [num(), num()];
      loop = [at(...pen)];
    } else if (c === "L") {
      pen = [num(), num()];
      loop.push(at(...pen));
    } else if (c === "Q") {
      const [cx, cy, x, y] = [num(), num(), num(), num()];
      for (let t = 1; t <= 4; t++) {
        const u = t / 4;
        const px = (1 - u) ** 2 * pen[0] + 2 * (1 - u) * u * cx + u * u * x;
        const py = (1 - u) ** 2 * pen[1] + 2 * (1 - u) * u * cy + u * u * y;
        loop.push(at(px, py));
      }
      pen = [x, y];
    } else if (c === "Z") {
      if (loop.length > 2) loops.push(loop);
      loop = [];
    }
  }
  if (loop.length > 2) loops.push(loop);
  return loops;
}

/** Engrave an icon `depth` deep into whatever lies under it at height z, centred on (x, y). */
export function engrave(name: IconName, size: number, [x, y]: Point, z: number, depth = 0.6): void {
  sketch(plane("xy", { offset: z }), () => {
    for (const l of iconLoops(name, size)) outline(l.map(([u, v]): Point => [u + x, v + y]));
  });
  cut(depth);
}
