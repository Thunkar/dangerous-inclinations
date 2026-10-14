// Where a part's build time goes: `node scripts/timing.mjs <file.part.js> [top]`
// prints the wall time to build, the features' own build time summed by
// kind and by profiler category, and the slowest features one by one (read
// from the scene the server pushes to its viewer, which carries the timings).
import WebSocket from "ws";
import { withServer } from "./server.mjs";

const [entry, top = "15"] = process.argv.slice(2);
const started = Date.now();
await withServer(entry, async (port) => {
  const built = (Date.now() - started) / 1000;
  const scene = await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    ws.on("message", (data) => {
      const msg = JSON.parse(String(data));
      if (msg.type === "scene-rendered") {
        ws.close();
        resolve(msg);
      }
    });
    ws.on("error", reject);
  });
  const objects = scene.result;
  const ms = (o) => o.buildDurationMs ?? 0;
  const total = objects.reduce((s, o) => s + ms(o), 0);
  console.log(`${objects.length} features, built in ${built.toFixed(0)} s, ${(total / 1000).toFixed(1)} s in features`);
  const sum = (key) => {
    const m = new Map();
    for (const o of objects) {
      const k = key(o);
      const e = m.get(k) ?? { n: 0, ms: 0 };
      e.n++;
      e.ms += ms(o);
      m.set(k, e);
    }
    return [...m].sort((a, b) => b[1].ms - a[1].ms);
  };
  for (const [kind, e] of sum((o) => o.type ?? o.kind ?? o.uniqueType ?? "?").slice(0, 12))
    console.log(`${(e.ms / 1000).toFixed(1).padStart(8)} s  ${String(e.n).padStart(5)}  ${kind}`);
  const cats = new Map();
  for (const o of objects)
    for (const c of o.profileCategories ?? []) cats.set(c.category, (cats.get(c.category) ?? 0) + c.durationMs);
  console.log("profiler:");
  for (const [c, d] of [...cats].sort((a, b) => b[1] - a[1]).slice(0, 10))
    console.log(`${(d / 1000).toFixed(1).padStart(8)} s  ${c}`);
  console.log("slowest:");
  for (const o of [...objects].sort((a, b) => ms(b) - ms(a)).slice(0, Number(top)))
    console.log(`${(ms(o) / 1000).toFixed(1).padStart(8)} s  #${o.index ?? "?"} ${o.type ?? o.kind ?? "?"} ${o.name ?? ""}`);
});
