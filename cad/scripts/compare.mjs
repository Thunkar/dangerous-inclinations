// How far one STL is from another: `node scripts/compare.mjs ours.stl reference.stl [samples]`
// samples points over each surface (and every vertex) and reports the distance to the
// other, both ways (max, 99th and 95th percentile, mean), with the volumes and boxes.
// `WORST=n` prints the n worst points each way. Triangle counts never match and are not compared.
import { readFileSync } from "node:fs";
function readStl(f) {
  const d = readFileSync(f);
  const tris = [];
  const ascii = d.subarray(0, 5).toString() === "solid" && d.toString("latin1", 0, 400).includes("facet");
  if (ascii) {
    const v = [...d.toString().matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
    for (let i = 0; i + 2 < v.length; i += 3) tris.push([v[i], v[i + 1], v[i + 2]]);
  } else {
    const n = d.readUInt32LE(80);
    for (let i = 0; i < n; i++) {
      const o = 84 + i * 50 + 12;
      const p = (k) => [d.readFloatLE(o + k * 12), d.readFloatLE(o + k * 12 + 4), d.readFloatLE(o + k * 12 + 8)];
      tris.push([p(0), p(1), p(2)]);
    }
  }
  return tris;
}
function info(tris) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  let vol = 0, area = 0;
  for (const [a, b, c] of tris) {
    for (const p of [a, b, c]) for (let j = 0; j < 3; j++) { mn[j] = Math.min(mn[j], p[j]); mx[j] = Math.max(mx[j], p[j]); }
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    area += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
  }
  // bodies by shared vertices
  const ids = new Map(); const parent = [];
  const id = (p) => { const k = p.map((x) => x.toFixed(3)).join(","); if (!ids.has(k)) { ids.set(k, ids.size); parent.push(ids.size - 1); } return ids.get(k); };
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const t of tris) { const [a, b, c] = t.map(id); parent[find(b)] = find(a); parent[find(c)] = find(a); }
  const roots = new Set(); for (let i = 0; i < parent.length; i++) roots.add(find(i));
  return { tris: tris.length, min: mn, max: mx, size: mx.map((x, j) => x - mn[j]), vol, area, bodies: roots.size };
}

function closest(p, [a, b, c]) {
  // Ericson, Real-Time Collision Detection 5.1.5
  const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const add = (u, v, s) => [u[0] + v[0] * s, u[1] + v[1] * s, u[2] + v[2] * s];
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, ab, d1 / (d1 - d3));
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6)));
  const denom = 1 / (va + vb + vc);
  return add(add(a, ab, vb * denom), ac, vc * denom);
}

function grid(tris, cell) {
  const g = new Map();
  const key = (i, j, k) => `${i},${j},${k}`;
  tris.forEach((t, n) => {
    const lo = [0, 1, 2].map((d) => Math.floor(Math.min(t[0][d], t[1][d], t[2][d]) / cell));
    const hi = [0, 1, 2].map((d) => Math.floor(Math.max(t[0][d], t[1][d], t[2][d]) / cell));
    for (let i = lo[0]; i <= hi[0]; i++)
      for (let j = lo[1]; j <= hi[1]; j++)
        for (let k = lo[2]; k <= hi[2]; k++) {
          const s = key(i, j, k);
          if (!g.has(s)) g.set(s, []);
          g.get(s).push(n);
        }
  });
  return {
    distance(p) {
      const c = p.map((x) => Math.floor(x / cell));
      let best = Infinity;
      for (let r = 0; r < 60; r++) {
        const seen = new Set();
        for (let i = -r; i <= r; i++)
          for (let j = -r; j <= r; j++)
            for (let k = -r; k <= r; k++) {
              if (Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) !== r) continue;
              for (const n of g.get(key(c[0] + i, c[1] + j, c[2] + k)) ?? []) {
                if (seen.has(n)) continue;
                seen.add(n);
                const q = closest(p, tris[n]);
                best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
              }
            }
        if (best <= r * cell) break;
      }
      return best;
    },
  };
}

function samples(tris, n) {
  const areas = tris.map(([a, b, c]) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
  });
  const total = areas.reduce((s, x) => s + x, 0);
  const pts = [];
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  tris.forEach((t, i) => {
    let k = (areas[i] / total) * n;
    let m = Math.floor(k) + (rnd() < k - Math.floor(k) ? 1 : 0);
    // Every vertex too, so sharp features are checked.
    pts.push(t[0]);
    for (; m > 0; m--) {
      let r1 = rnd(), r2 = rnd();
      if (r1 + r2 > 1) [r1, r2] = [1 - r1, 1 - r2];
      pts.push([0, 1, 2].map((d) => t[0][d] + (t[1][d] - t[0][d]) * r1 + (t[2][d] - t[0][d]) * r2));
    }
  });
  return pts;
}

function oneWay(from, to, n, label) {
  const g = grid(to, 2);
  const pts = samples(from, n);
  const raw = pts.map((p) => g.distance(p));
  if (process.env.WORST) {
    const idx = raw.map((d, i) => i).sort((a, b) => raw[b] - raw[a]).slice(0, +process.env.WORST);
    for (const i of idx) console.log(`  ${label} worst ${raw[i].toFixed(3)} at [${pts[i].map((x) => x.toFixed(2))}]`);
  }
  const d = raw.slice().sort((a, b) => a - b);
  const at = (q) => d[Math.min(d.length - 1, Math.floor(q * d.length))];
  return { max: d.at(-1), p95: at(0.95), p99: at(0.99), mean: d.reduce((s, x) => s + x, 0) / d.length };
}

const [A, B, N = 20000] = process.argv.slice(2);
const a = readStl(A), b = readStl(B);
const ia = info(a), ib = info(b);
const f = (x) => x.toFixed(3);
console.log(`volume ${ia.vol.toFixed(1)} vs ${ib.vol.toFixed(1)} (${(((ia.vol - ib.vol) / ib.vol) * 100).toFixed(3)}%), bodies ${ia.bodies} vs ${ib.bodies}`);
console.log(`bbox min diff [${ia.min.map((x, i) => f(x - ib.min[i]))}] max diff [${ia.max.map((x, i) => f(x - ib.max[i]))}]`);
const ab = oneWay(a, b, +N, "ours->ref"), ba = oneWay(b, a, +N, "ref->ours");
console.log(`ours->ref  max ${f(ab.max)} p99 ${f(ab.p99)} p95 ${f(ab.p95)} mean ${f(ab.mean)}`);
console.log(`ref->ours  max ${f(ba.max)} p99 ${f(ba.p99)} p95 ${f(ba.p95)} mean ${f(ba.mean)}`);
