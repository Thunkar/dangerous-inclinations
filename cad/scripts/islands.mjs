// The separate bodies in an STL: `node scripts/islands.mjs out/part.stl`
// groups triangles that share a vertex and lists each body's box, largest
// first. A printed piece should be one body; anything else floats.
import { readFileSync } from "node:fs";

const t = readFileSync(process.argv[2], "utf8");
const vs = [...t.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
const ids = new Map();
const id = (p) => {
  const k = p.map((x) => x.toFixed(3)).join(",");
  if (!ids.has(k)) ids.set(k, ids.size);
  return ids.get(k);
};
const parent = [];
const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
const tri = [];
for (let i = 0; i + 2 < vs.length; i += 3) {
  const [a, b, c] = [id(vs[i]), id(vs[i + 1]), id(vs[i + 2])];
  for (const v of [a, b, c]) if (parent[v] === undefined) parent[v] = v;
  parent[find(b)] = find(a);
  parent[find(c)] = find(a);
  tri.push([a, vs[i], vs[i + 1], vs[i + 2]]);
}
const bodies = new Map();
for (const [a, ...pts] of tri) {
  const r = find(a);
  const b = bodies.get(r) ?? {
    lo: [Infinity, Infinity, Infinity],
    hi: [-Infinity, -Infinity, -Infinity],
    n: 0,
  };
  b.n++;
  for (const p of pts)
    for (let k = 0; k < 3; k++) {
      b.lo[k] = Math.min(b.lo[k], p[k]);
      b.hi[k] = Math.max(b.hi[k], p[k]);
    }
  bodies.set(r, b);
}
const list = [...bodies.values()].sort((a, b) => b.n - a.n);
console.log(`${list.length} bodies`);
for (const b of list)
  console.log(
    `${String(b.n).padStart(7)} tris  ${[0, 1, 2].map((k) => `${"xyz"[k]} ${b.lo[k].toFixed(1)}..${b.hi[k].toFixed(1)}`).join("  ")}`
  );
