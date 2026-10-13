// Find what would need support: `node scripts/overhang.mjs out/part.stl`
// lists every patch of downward-facing surface steeper than the FDM limit
// (spec.ts, 45 degrees from vertical), off the bed, with its area and box.
// Bridges show up too (a slot's ceiling, a socket's roof): read the boxes.
import { readFileSync } from "node:fs";

const [file, limit = "45"] = process.argv.slice(2);
const cos = Math.cos(((90 - Number(limit)) * Math.PI) / 180);
const text = readFileSync(file, "utf8");
const vs = [...text.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);

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
  if (nz < -cos && zMax > 0.05) down.push({ tri: [a, b, c], area: len / 2 });
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
