// The sheet of the print plates: `yarn plates` (this, under the TypeScript
// hooks, since the colours are read from the game's code) packs the
// plates (plates.mjs), reads each 3MF back with three.js's loader, draws it
// on an MK4S bed in its colour and writes shots/plates/plates.png. A plate
// printed in each player's colour is drawn once a colour.
import { createServer } from "node:http";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, extname } from "node:path";
import { chromium } from "playwright";
import { BED } from "../plates.mjs";
import { COLOUR, PLAYER_COLOURS } from "../colours.ts";
import { buildPlates, counts } from "./plates.mjs";

const ROOT = resolve("..");
const TYPES = { ".js": "text/javascript", ".html": "text/html", ".3mf": "application/octet-stream", ".png": "image/png" };

const PAGE = `<!doctype html><html><body style="margin:0;background:#1e1e1e">
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from "three";
import { ThreeMFLoader } from "three/addons/loaders/3MFLoader.js";
const q = new URLSearchParams(location.search);
const [W, H] = [${BED.x}, ${BED.y}];
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(800, 640);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#1e1e1e");
// Build-plate frame: x right, y back, z up (the 3MF's), drawn with z up.
const camera = new THREE.PerspectiveCamera(30, 800 / 640, 1, 5000);
camera.up.set(0, 0, 1);
camera.position.set(W / 2, -165, 345);
camera.lookAt(W / 2, H / 2 - 4, 0);
scene.add(new THREE.HemisphereLight("#ffffff", "#404040", 1.6));
const sun = new THREE.DirectionalLight("#ffffff", 2.2);
sun.position.set(W * 0.2, -H * 0.6, 400);
sun.target.position.set(W / 2, H / 2, 0);
sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -250, right: 250, top: 250, bottom: -250, near: 1, far: 1200 });
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun, sun.target);
const bed = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ color: "#a08a5c", roughness: 0.85 }));
bed.position.set(W / 2, H / 2, -0.05);
bed.receiveShadow = true;
scene.add(bed);
const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(W, H)), new THREE.LineBasicMaterial({ color: "#d8c79a" }));
edge.position.copy(bed.position);
scene.add(edge);
const group = await new ThreeMFLoader().loadAsync(q.get("file"));
const material = new THREE.MeshStandardMaterial({ color: q.get("color"), roughness: 0.55, metalness: 0 });
group.traverse((o) => {
  if (o.isMesh) {
    o.material = material;
    o.castShadow = o.receiveShadow = true;
  }
});
// The loader turns the model to three's y-up; undo that, the scene is z-up.
group.rotation.set(0, 0, 0);
group.updateMatrixWorld(true);
scene.add(group);
renderer.render(scene, camera);
window.done = true;
</script></body></html>`;

function serve() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/plate.html") return res.writeHead(200, { "content-type": "text/html" }).end(PAGE);
    const file = resolve(ROOT, "." + decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT) || !existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, () => ok(server)));
}

const written = buildPlates();
mkdirSync("shots/plates", { recursive: true });
const server = await serve();
const port = server.address().port;
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const cards = [];
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 640 } });
  page.on("pageerror", (e) => console.error("page:", e.message));
  for (const w of written) {
    const name = w.file.split("/").pop().replace(".3mf", "");
    // A seat's plate once in each seat's colour, as [label, colour].
    const colours = w.plate.colour === "player" ? PLAYER_COLOURS.map((c, k) => [`seat ${k + 1}`, c]) : [[w.plate.colour, COLOUR[w.plate.colour]]];
    const shots = [];
    for (const [label, hex] of colours) {
      await page.goto(`http://localhost:${port}/plate.html?file=/cad/${w.file}&color=${encodeURIComponent(hex)}`);
      await page.waitForFunction(() => window.done, null, { timeout: 120000 });
      const png = `${name}${colours.length > 1 ? `-${label.replace(" ", "-")}` : ""}.png`;
      await page.locator("canvas").screenshot({ path: `shots/plates/${png}` });
      shots.push({ png, label, hex });
    }
    cards.push({ name, w, shots });
  }
  const swatch = (label, hex) => `<span class=sw style="background:${hex}"></span>${label} ${hex}`;
  const html = `<html><body style="margin:0;background:#1e1e1e;color:#e8dfc8;font:15px Inter,system-ui,sans-serif;width:1640px">
<style>h1{margin:14px 16px 4px;font-size:28px}h2{background:#2a2a2a;color:#f07860;margin:10px 0 0;padding:6px 16px;font-size:18px}
.grid{display:flex;flex-wrap:wrap;gap:14px;padding:12px 16px}.card{width:524px;background:#262626}.card.wide{width:100%}
.card h2{margin:0}.r{display:flex;flex-wrap:wrap;gap:8px;padding:6px 10px 10px}.r figure{margin:0}.r img{width:504px;display:block}.wide .r img{width:516px}
figcaption{color:#ccc;margin-top:3px}.sw{display:inline-block;width:12px;height:12px;margin-right:5px;vertical-align:-1px;border:1px solid #666}
.list{color:#bbb;margin:6px 10px 0;min-height:2.5em}h1+.list{margin:0 16px}</style>
<h1>Print plates for a table of six (Prusa MK4S, ${BED.x} x ${BED.y} mm)</h1>
<p class=list>One 3MF a bed, in cad/out/plates/. Each plate is one colour, the game's where it draws the piece: print it in the nearest filament.</p>
<div class=grid>${cards
  .map(
    ({ name, w, shots }) => `<div class="card${shots.length > 1 ? " wide" : ""}"><h2>${name}: ${w.plate.title}</h2>
<p class=list>${w.pieces} pieces: ${counts(w.plate).map(([p, n]) => `${n} ${p.split("/").pop()}`).join(", ")}</p>
<div class=r>${shots.map(({ png, label, hex }) => `<figure><img src="${png}"><figcaption>${swatch(label, hex)}</figcaption></figure>`).join("")}</div></div>`
  )
  .join("\n")}</div>
</body></html>`;
  writeFileSync("shots/plates/index.html", html);
  await page.setViewportSize({ width: 1640, height: 900 });
  await page.goto(`http://localhost:${port}/cad/shots/plates/index.html`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "shots/plates/plates.png", fullPage: true });
  console.log("shots/plates/plates.png");
} finally {
  await browser.close();
  server.close();
}
