// Cut an exported STL with a plane and print the section's outline points:
// `node scripts/slice.mjs out/part.stl x 40` lists the (y, z) of every edge
// crossing x = 40, grouped into closed loops. A way to check a section by
// its numbers rather than by eye.
import { readFileSync } from "node:fs";

const [file, axis = "x", at = "0"] = process.argv.slice(2);
const k = { x: 0, y: 1, z: 2 }[axis];
const c = Number(at);
const others = [0, 1, 2].filter((i) => i !== k);
const text = readFileSync(file, "utf8");
const vs = [...text.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);

const segs = [];
for (let t = 0; t + 2 < vs.length; t += 3) {
  const tri = [vs[t], vs[t + 1], vs[t + 2]];
  const pts = [];
  for (let e = 0; e < 3; e++) {
    const [p, q] = [tri[e], tri[(e + 1) % 3]];
    const [dp, dq] = [p[k] - c, q[k] - c];
    if ((dp < 0 && dq >= 0) || (dp >= 0 && dq < 0)) {
      const s = dp / (dp - dq);
      pts.push(others.map((i) => +(p[i] + s * (q[i] - p[i])).toFixed(2)));
    }
  }
  if (pts.length === 2) segs.push(pts);
}

// Chain segments into loops by shared endpoints.
const key = (p) => p.join(",");
const loops = [];
const used = new Set();
for (let i = 0; i < segs.length; i++) {
  if (used.has(i)) continue;
  used.add(i);
  const loop = [...segs[i]];
  for (let grew = true; grew; ) {
    grew = false;
    for (let j = 0; j < segs.length; j++) {
      if (used.has(j)) continue;
      const [a, b] = segs[j];
      if (key(a) === key(loop.at(-1))) loop.push(b);
      else if (key(b) === key(loop.at(-1))) loop.push(a);
      else continue;
      used.add(j);
      grew = true;
    }
  }
  loops.push(loop);
}
const names = others.map((i) => "xyz"[i]);
for (const loop of loops) {
  // Keep the corners only: drop points on a straight run.
  const corners = loop.filter((p, i) => {
    const a = loop[(i - 1 + loop.length) % loop.length];
    const b = loop[(i + 1) % loop.length];
    const cross = (p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0]);
    return Math.abs(cross) > 1e-3;
  });
  console.log(`loop (${names.join(", ")}):`, corners.map((p) => `(${p.join(", ")})`).join(" "));
}
