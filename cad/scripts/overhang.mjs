// Find what would need support: `node scripts/overhang.mjs out/part.stl`
// lists every patch of downward-facing surface steeper than the FDM limit
// (spec.ts, 45 degrees from vertical), off the bed, with its area and box.
// Bridges show up too (a slot's ceiling, a socket's roof): read the boxes.
// A face with plastic under it is left out: the kernel sometimes leaves a
// solid's face inside another it overlaps unmerged, and that face faces
// down without hanging over anything (a slicer fills it).
import { readFileSync } from "node:fs";

const [file, limit = "45"] = process.argv.slice(2);
const cos = Math.cos(((90 - Number(limit)) * Math.PI) / 180);
const text = readFileSync(file, "utf8");
const vs = [...text.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);

const all = [];
for (let t = 0; t + 2 < vs.length; t += 3) {
  const [a, b, c] = [vs[t], vs[t + 1], vs[t + 2]];
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const nz = u[0] * v[1] - u[1] * v[0];
  const xs = [a[0], b[0], c[0]];
  const ys = [a[1], b[1], c[1]];
  all.push({ a, b, c, nz, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
}
/** The height of triangle T over (x, y), if (x, y) is inside its plan. */
function heightOf(T, x, y) {
  const { a, b, c } = T;
  const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(d) < 1e-12) return null;
  const w1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d;
  const w2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d;
  const w3 = 1 - w1 - w2;
  if (w1 < -1e-9 || w2 < -1e-9 || w3 < -1e-9) return null;
  return w1 * a[2] + w2 * b[2] + w3 * c[2];
}
/** Is there air under (x, y, z): the first surface below faces up (or there is none)? */
function airUnder(x, y, z, self) {
  let best = -Infinity;
  let up = true;
  for (const T of all) {
    if (T === self || x < T.x0 || x > T.x1 || y < T.y0 || y > T.y1) continue;
    const h = heightOf(T, x, y);
    if (h === null || h > z || h <= best) continue;
    best = h;
    up = T.nz > 0;
  }
  return best === -Infinity || (up && z - best > 0.05);
}

const down = [];
for (let t = 0; t + 2 < vs.length; t += 3) {
  const [a, b, c] = [vs[t], vs[t + 1], vs[t + 2]];
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const len = Math.hypot(...n);
  if (!len) continue;
  const nz = n[2] / len;
  const zMax = Math.max(a[2], b[2], c[2]);
  if (!(nz < -cos && zMax > 0.05)) continue;
  // Sampled at its centre and towards each corner: most of it must have air under it.
  const samples = [
    [1 / 3, 1 / 3, 1 / 3],
    [2 / 3, 1 / 6, 1 / 6],
    [1 / 6, 2 / 3, 1 / 6],
    [1 / 6, 1 / 6, 2 / 3],
  ];
  const self = all[t / 3];
  const air = samples.filter(([p, q, r]) =>
    airUnder(
      p * a[0] + q * b[0] + r * c[0],
      p * a[1] + q * b[1] + r * c[1],
      p * a[2] + q * b[2] + r * c[2] - 0.02,
      self
    )
  ).length;
  if (air >= 2) down.push({ tri: [a, b, c], area: len / 2 });
}

// Group triangles that share a vertex into patches.
const key = (p) => p.map((x) => x.toFixed(3)).join(",");
const parent = down.map((_, i) => i);
const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
const seen = new Map();
down.forEach((d, i) =>
  d.tri.forEach((p) => {
    const k = key(p);
    if (seen.has(k)) parent[find(i)] = find(seen.get(k));
    else seen.set(k, i);
  })
);
const patches = new Map();
down.forEach((d, i) => {
  const r = find(i);
  const p = patches.get(r) ?? {
    area: 0,
    lo: [Infinity, Infinity, Infinity],
    hi: [-Infinity, -Infinity, -Infinity],
  };
  p.area += d.area;
  for (const q of d.tri)
    for (let k = 0; k < 3; k++) {
      p.lo[k] = Math.min(p.lo[k], q[k]);
      p.hi[k] = Math.max(p.hi[k], q[k]);
    }
  patches.set(r, p);
});
const list = [...patches.values()].sort((a, b) => b.area - a.area);
const f = (x) => x.toFixed(1);
console.log(
  `${list.length} patches, ${f(list.reduce((s, p) => s + p.area, 0))} mm2 facing down past ${limit} degrees`
);
for (const p of list)
  console.log(
    `${f(p.area).padStart(7)} mm2  x ${f(p.lo[0])}..${f(p.hi[0])}  y ${f(p.lo[1])}..${f(p.hi[1])}  z ${f(p.lo[2])}..${f(p.hi[2])}`
  );
