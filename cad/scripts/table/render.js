// The table renderer: loads cad/shots/table/scene.json (layout.ts) and the
// STLs it names from cad/out, and renders one named view at a time on
// request (window.renderView), returning a PNG as a data URL. Served from
// the repo root by run.mjs, so /node_modules and /cad/out resolve.
//
// Film mode (film.mjs): `?scene=<url>` lays out the first state and
// `?film=<url>,<url>` adds the pieces of the others that differ, keyed by
// their id (layout.ts); window.renderFrame then sets each piece's matrix and
// the camera, and returns a JPEG.
import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";

const params = new URLSearchParams(location.search);
const W = Number(params.get("w") ?? 1920);
const H = Number(params.get("h") ?? 1080);
/** Supersampling: render this many times larger, then scale down. */
const SS = Number(params.get("ss") ?? 2);

const scene = await (await fetch(params.get("scene") ?? "/cad/shots/table/scene.json")).json();
const extraScenes = await Promise.all(
  (params.get("film") ?? "").split(",").filter(Boolean).map(async (url) => (await fetch(url)).json())
);

// ---- Geometry ---------------------------------------------------------------------

const loader = new STLLoader();
const raw = new Map();
async function stl(path) {
  if (!raw.has(path))
    raw.set(
      path,
      fetch(`/cad/out/${path}`)
        .then((r) => {
          if (!r.ok) throw new Error(`${path}: ${r.status}`);
          return r.arrayBuffer();
        })
        .then((b) => loader.parse(b))
    );
  return raw.get(path);
}

/** Triangle centroids of a non-indexed geometry, as a flat array. */
function centroids(g) {
  const p = g.attributes.position.array;
  const out = new Float32Array(p.length / 3);
  for (let t = 0; t < p.length / 9; t++)
    for (let k = 0; k < 3; k++) out[3 * t + k] = (p[9 * t + k] + p[9 * t + 3 + k] + p[9 * t + 6 + k]) / 3;
  return out;
}

/** A new geometry of the triangles `keep(t, cx, cy, cz)` accepts, each vertex moved by `move(x, y, z, t)` if given. */
function subset(g, keep, move) {
  const p = g.attributes.position.array;
  const c = centroids(g);
  const out = [];
  for (let t = 0; t < p.length / 9; t++) {
    if (!keep(t, c[3 * t], c[3 * t + 1], c[3 * t + 2])) continue;
    for (let v = 0; v < 3; v++) {
      const [x, y, z] = [p[9 * t + 3 * v], p[9 * t + 3 * v + 1], p[9 * t + 3 * v + 2]];
      out.push(...(move ? move(x, y, z, t) : [x, y, z]));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
  return geo;
}

/** Board numbers laid out as ring 1's, moved out along each sector's middle to another ring. */
function numbersAt(g, { from, to }) {
  const sector = (x, y) => {
    const a = (Math.atan2(y, x) * 180) / Math.PI;
    return (((Math.round((90 - a) / 15 - 0.5) % 24) + 24) % 24);
  };
  const c = centroids(g);
  const shift = (t) => {
    const mid = ((90 - (sector(c[3 * t], c[3 * t + 1]) + 0.5) * 15) * Math.PI) / 180;
    return [(to - from) * Math.cos(mid), (to - from) * Math.sin(mid)];
  };
  return subset(
    g,
    () => true,
    (x, y, z, t) => {
      const [dx, dy] = shift(t);
      return [x + dx, y + dy, z];
    }
  );
}

/** One of the die's ten inlays, laid flat in two rows of five at a 14 mm pitch, 1 to 10. */
function dieNumber(g, v) {
  return subset(g, (t, x, y) => Math.round(-y / 14) * 5 + Math.round(x / 14) + 1 === v);
}

/** The mantis's arm fins print side by side, 14 mm apart: fin k. */
function fin(g, k) {
  return subset(g, (t, x, y) => (y < 12.9 ? 0 : 1) === k);
}

/** Connected components of a non-indexed geometry: a component index per triangle. */
function components(g) {
  const p = g.attributes.position.array;
  const n = p.length / 9;
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const seen = new Map();
  for (let t = 0; t < n; t++)
    for (let v = 0; v < 3; v++) {
      const o = 9 * t + 3 * v;
      const key = `${Math.round(p[o] * 1e3)},${Math.round(p[o + 1] * 1e3)},${Math.round(p[o + 2] * 1e3)}`;
      const other = seen.get(key);
      if (other === undefined) seen.set(key, t);
      else parent[find(t)] = find(other);
    }
  return Int32Array.from({ length: n }, (_, t) => find(t));
}

/**
 * The base prints with its doors open, lying on the bed beyond the deck's
 * edge. Each listed bay's door (every separate body beyond its hinge) is
 * turned shut about the hinge (pieces/bay.ts: bayDoor).
 */
function closeBays(g, { closeBays: bays, bay }) {
  const comp = components(g);
  const p = g.attributes.position.array;
  const n = p.length / 9;
  // Each component's box centre.
  const box = new Map();
  for (let t = 0; t < n; t++) {
    const b = box.get(comp[t]) ?? { lo: [1e9, 1e9, 1e9], hi: [-1e9, -1e9, -1e9] };
    for (let v = 0; v < 9; v++) {
      const k = v % 3;
      b.lo[k] = Math.min(b.lo[k], p[9 * t + v]);
      b.hi[k] = Math.max(b.hi[k], p[9 * t + v]);
    }
    box.set(comp[t], b);
  }
  const turnOf = new Map();
  for (const at of bays) {
    const frame = new THREE.Matrix4().makeTranslation(at.x, at.y, 0).multiply(new THREE.Matrix4().makeRotationZ((at.turn * Math.PI) / 180));
    const inv = frame.clone().invert();
    const hinge = new THREE.Matrix4()
      .makeTranslation(0, bay.axis.y, bay.axis.z)
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
      .multiply(new THREE.Matrix4().makeTranslation(0, -bay.axis.y, -bay.axis.z));
    const shut = frame.clone().multiply(hinge).multiply(inv);
    for (const [c, b] of box) {
      const centre = new THREE.Vector3((b.lo[0] + b.hi[0]) / 2, (b.lo[1] + b.hi[1]) / 2, (b.lo[2] + b.hi[2]) / 2).applyMatrix4(inv);
      if (Math.abs(centre.x) < bay.half + 0.5 && centre.y > bay.axis.y + 0.5) turnOf.set(c, shut);
    }
  }
  const v = new THREE.Vector3();
  return subset(
    g,
    () => true,
    (x, y, z, t) => {
      const m = turnOf.get(comp[t]);
      if (!m) return [x, y, z];
      v.set(x, y, z).applyMatrix4(m);
      return [v.x, v.y, v.z];
    }
  );
}

/** A die's inlay set: below its two rows of numbers, the stand's icon at x 0 to 9, and the fuel stand's 0 beyond it. */
function inlay(g, which) {
  return subset(g, (t, x, y) => y < -22 && (which === "icon" ? x < 11.5 : x >= 11.5));
}

const processed = new Map();
async function geometryOf(inst) {
  const key = inst.stl + JSON.stringify(inst.op ?? {});
  if (processed.has(key)) return processed.get(key);
  const promise = (async () => {
    if (inst.stl === "@card") return [new THREE.BoxGeometry(...inst.op.card.size)];
    if (inst.stl === "@cube") {
      const s = scene.cube;
      const g = new THREE.BoxGeometry(s, s, s, 1, 1, 1);
      return [g];
    }
    let g = await stl(inst.stl);
    const op = inst.op ?? {};
    let parts = [g];
    if (op.numbers) parts = [numbersAt(g, op.numbers)];
    else if (op.dieNumber) parts = [dieNumber(g, op.dieNumber)];
    else if (op.fin !== undefined) parts = [fin(g, op.fin)];
    else if (op.closeBays) parts = [closeBays(g, op)];
    else if (op.inlay) parts = [inlay(g, op.inlay)];
    return parts.map((part) => {
      part.deleteAttribute("normal");
      const smooth = toCreasedNormals(part, (32 * Math.PI) / 180);
      smooth.computeBoundingSphere();
      return smooth;
    });
  })();
  processed.set(key, promise);
  return promise;
}

// ---- Materials ---------------------------------------------------------------------

/** Card stock: matte paper with a faint sheen, its print on top and its back below. */
const textures = new Map();
function cardTexture(path) {
  if (!textures.has(path)) {
    const t = new THREE.TextureLoader().load(`/cad/shots/table/${path}`);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 16;
    textures.set(path, t);
  }
  return textures.get(path);
}
function paper(map, color) {
  return new THREE.MeshPhysicalMaterial({
    map,
    color: map ? "#ffffff" : color,
    roughness: 0.75,
    metalness: 0,
    specularIntensity: 0.3,
    sheen: 0.12,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color("#ffffff"),
  });
}
const cardMaterials = new Map();
function cardMaterial({ front, back }, edge) {
  const key = `${front}|${back}`;
  if (!cardMaterials.has(key)) {
    const side = paper(null, edge);
    // BoxGeometry's groups: +x, -x, +y, -y, +z (the face), -z (the back).
    cardMaterials.set(key, [side, side, side, side, paper(cardTexture(front)), paper(cardTexture(back))]);
  }
  return cardMaterials.get(key);
}

const materials = new Map();
function plastic(color, kind) {
  const key = `${color}|${kind}`;
  if (materials.has(key)) return materials.get(key);
  let m;
  if (kind === "cube") {
    // Painted wooden cubes.
    m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.62, clearcoat: 0.05 });
  } else {
    const c = new THREE.Color(color);
    const dark = c.getHSL({}).l < 0.25;
    m = new THREE.MeshPhysicalMaterial({
      color,
      roughness: dark ? 0.42 : 0.48,
      metalness: 0,
      clearcoat: dark ? 0.25 : 0.15,
      clearcoatRoughness: 0.4,
      specularIntensity: 0.6,
    });
  }
  materials.set(key, m);
  return m;
}

// ---- The table ----------------------------------------------------------------------

/** A procedural oak top: planks along x, each with its own tone and grain. */
function woodTexture(size = 4096, mm = 2400) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  const hash = (i) => {
    const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const noise1 = (x, seed) => {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return hash(i + seed * 57) * (1 - u) + hash(i + 1 + seed * 57) * u;
  };
  const plank = 165; // mm
  const px = mm / size;
  for (let j = 0; j < size; j++) {
    const ymm = j * px;
    const k = Math.floor(ymm / plank);
    const yin = ymm - k * plank;
    const tone = 0.85 + 0.25 * hash(k * 3.1);
    const offset = hash(k * 7.7) * 3000;
    const seam = Math.min(yin, plank - yin) < 0.6;
    for (let i = 0; i < size; i++) {
      const xmm = i * px + offset;
      // Grain: long stretched lines, wavering along the plank.
      const wave = noise1(xmm / 260, k) * 9 + noise1(xmm / 40, k + 3) * 1.2;
      const g = yin + wave;
      const line = 0.5 + 0.5 * Math.sin(g * 1.9 + noise1(g * 0.7, k + 9) * 4);
      const fine = noise1(xmm / 3 + g * 13, k + 5);
      let v = 0.86 * tone * (0.78 + 0.16 * line * line + 0.06 * fine);
      if (seam) v *= 0.55;
      const o = 4 * (j * size + i);
      img.data[o] = Math.min(255, 196 * v);
      img.data[o + 1] = Math.min(255, 148 * v);
      img.data[o + 2] = Math.min(255, 98 * v);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  return tex;
}

// ---- Scene ---------------------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
renderer.setPixelRatio(1);
renderer.setSize(W * SS, H * SS, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);
renderer.domElement.style.width = `${W}px`;
renderer.domElement.style.height = `${H}px`;

const world = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
world.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
world.environmentIntensity = 0.3;
// The room round the table: the same room, out of focus and dim.
world.background = world.environment;
world.backgroundBlurriness = 0.6;
world.backgroundIntensity = 0.12;

// The table top, its edge, and a floor far below.
const T = scene.table;
const margin = 70;
const [tw, td] = [T.x1 - T.x0 + 2 * margin, T.y1 - T.y0 + 2 * margin];
const [tcx, tcy] = [(T.x0 + T.x1) / 2, (T.y0 + T.y1) / 2];
const wood = woodTexture();
wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
wood.repeat.set(tw / 2400, td / 2400);
const tableMat = new THREE.MeshPhysicalMaterial({ map: wood, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.3 });
const top = new THREE.Mesh(new THREE.BoxGeometry(tw, td, 30), tableMat);
top.position.set(tcx, tcy, -15);
top.receiveShadow = true;
world.add(top);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000), new THREE.MeshStandardMaterial({ color: "#2a2520", roughness: 0.9 }));
floor.position.z = -760;
world.add(floor);

// The key light, warm, from the south-west and high; a cool fill from the other side.
const sun = new THREE.DirectionalLight("#fff1dc", 3.6);
sun.position.set(tcx - 900, tcy + 600, 2200);
sun.target.position.set(tcx, tcy, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(8192, 8192);
sun.shadow.bias = -0.00015;
sun.shadow.normalBias = 0.15;
sun.shadow.radius = 4;
sun.shadow.blurSamples = 16;
world.add(sun, sun.target);
const fill = new THREE.DirectionalLight("#dfe8ff", 0.45);
fill.position.set(tcx + 1200, tcy + 900, 1400);
world.add(fill);
world.add(new THREE.HemisphereLight("#fff8ee", "#3a2f25", 0.12));

/** Fit the key light's shadow box round a region: the table, or a close-up's few hundred mm. */
function shadowBox(cx, cy, half) {
  const dir = new THREE.Vector3(-950, -650, 1250).normalize();
  sun.target.position.set(cx, cy, 0);
  sun.position.set(cx + dir.x * 3000, cy + dir.y * 3000, dir.z * 3000);
  const c = sun.shadow.camera;
  c.left = c.bottom = -half;
  c.right = c.top = half;
  c.near = 1000;
  c.far = 5000;
  c.updateProjectionMatrix();
  sun.shadow.map?.dispose();
  sun.shadow.map = null;
}

// The pieces.
const groups = { board: [], token: [], piece: [], cube: [] };
/** A piece the film moves, by `id|stl|op`: one mesh per printed form it takes in any state. */
const filmed = new Map();
const keyOf = (inst) => `${inst.id}|${inst.stl}|${JSON.stringify(inst.op ?? {})}`;
async function addInstance(inst, visible) {
  const parts = await geometryOf(inst);
  parts.forEach((g) => {
    const material = inst.op?.card ? cardMaterial(inst.op.card, inst.color) : plastic(inst.color, inst.kind);
    const mesh = new THREE.Mesh(g, material);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.fromArray(inst.matrix);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = visible;
    world.add(mesh);
    (groups[inst.kind] ?? groups.piece).push(mesh);
    if (inst.id) filmed.set(keyOf(inst), [...(filmed.get(keyOf(inst)) ?? []), mesh]);
  });
}
await Promise.all(scene.instances.map((inst) => addInstance(inst, true)));
// The other states' forms of the filmed pieces, hidden until a frame shows them.
const extras = new Map();
for (const other of extraScenes)
  for (const inst of other.instances) if (inst.id && !filmed.has(keyOf(inst))) extras.set(keyOf(inst), inst);
await Promise.all([...extras.values()].map((inst) => addInstance(inst, false)));

// ---- Views ----------------------------------------------------------------------------

const camera = new THREE.PerspectiveCamera(40, W / H, 5, 12000);
camera.up.set(0, 0, 1);
const composer = new EffectComposer(renderer);
composer.setPixelRatio(1);
composer.setSize(W * SS, H * SS);
const renderPass = new RenderPass(world, camera);
const gtao = new GTAOPass(world, camera, W * SS, H * SS);
gtao.output = GTAOPass.OUTPUT.Default;
gtao.blendIntensity = 1.0;
const bokeh = new BokehPass(world, camera, { focus: 500, aperture: 0.00002, maxblur: 0.006 });
const output = new OutputPass();
composer.addPass(renderPass);
composer.addPass(gtao);
composer.addPass(bokeh);
composer.addPass(output);

function aim(c) {
  camera.fov = c.fov;
  camera.position.set(...c.position);
  camera.up.set(...(c.up ?? [0, 0, 1]));
  camera.lookAt(new THREE.Vector3(...c.target));
  const far = camera.position.distanceTo(new THREE.Vector3(...c.target));
  camera.near = Math.max(4, far / 60);
  camera.far = far * 4 + 3000;
  camera.updateProjectionMatrix();
  return c;
}

/** The output size of a view: its own, or the page's. */
function resize([w, h]) {
  renderer.setSize(w * SS, h * SS, false);
  composer.setSize(w * SS, h * SS);
  camera.aspect = w / h;
}

window.renderView = async (view, override) => {
  const conf = { ...scene.cameras[view], ...(override ?? {}) };
  const [w, h] = conf.size ?? [W, H];
  resize([w, h]);
  const c = aim(conf);
  // AO in the scene's millimetres: a few mm round the small pieces, more from far away.
  const dist = camera.position.distanceTo(new THREE.Vector3(...c.target));
  gtao.updateGtaoMaterial({ radius: Math.max(4, dist / 160), distanceExponent: 1.6, thickness: Math.max(2, dist / 300), scale: 1.0, samples: 24 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  if (c.dof) {
    camera.updateMatrixWorld();
    const f = new THREE.Vector3(...c.focus);
    const viewZ = f.clone().applyMatrix4(camera.matrixWorldInverse).z;
    bokeh.uniforms.focus.value = -viewZ;
    bokeh.uniforms.aperture.value = c.aperture ?? 0.00003;
    bokeh.uniforms.maxblur.value = c.maxblur ?? 0.008;
    bokeh.enabled = true;
  } else bokeh.enabled = false;
  if (view === "closeup") shadowBox(c.target[0], c.target[1], 320);
  else shadowBox(tcx, tcy, Math.max(tw, td) / 2 + 40);
  camera.clearViewOffset();
  composer.render();
  // Scale the supersampled frame down to the output size.
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(renderer.domElement, 0, 0, w, h);
  return out.toDataURL("image/png");
};

/**
 * One frame of the film: `pieces` maps a filmed piece's key to its matrix,
 * or null to hide it (a key left out keeps its last matrix); `camera` is a
 * view as in scene.cameras, plus `shift`, the fraction of the frame's width
 * the picture moves left so the subject clears the card beside it; `shadow`
 * is [x, y, half] of the key light's box, kept while it does not change.
 */
let lastShadow = "";
window.renderFrame = ({ camera: c, pieces, shadow, quality = 0.95 }) => {
  for (const [key, m] of Object.entries(pieces)) {
    for (const mesh of filmed.get(key) ?? []) {
      mesh.visible = m !== null;
      if (m) mesh.matrix.fromArray(m);
    }
  }
  const [w, h] = c.size ?? [W, H];
  if (renderer.domElement.width !== w * SS || renderer.domElement.height !== h * SS) resize([w, h]);
  aim(c);
  if (c.shift) camera.setViewOffset(w, h, c.shift * w, 0, w, h);
  else camera.clearViewOffset();
  const dist = camera.position.distanceTo(new THREE.Vector3(...c.target));
  gtao.updateGtaoMaterial({ radius: Math.max(4, dist / 160), distanceExponent: 1.6, thickness: Math.max(2, dist / 300), scale: 1.0, samples: 24 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  if (c.focus) {
    camera.updateMatrixWorld();
    const viewZ = new THREE.Vector3(...c.focus).applyMatrix4(camera.matrixWorldInverse).z;
    bokeh.uniforms.focus.value = -viewZ;
    bokeh.uniforms.aperture.value = c.aperture ?? 0.00003;
    bokeh.uniforms.maxblur.value = c.maxblur ?? 0.008;
    bokeh.enabled = true;
  } else bokeh.enabled = false;
  const box = JSON.stringify(shadow ?? [tcx, tcy, Math.max(tw, td) / 2 + 40]);
  if (box !== lastShadow) {
    shadowBox(...JSON.parse(box));
    lastShadow = box;
  }
  composer.render();
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(renderer.domElement, 0, 0, w, h);
  return out.toDataURL("image/jpeg", quality);
};

const gl = renderer.getContext();
const info = gl.getExtension("WEBGL_debug_renderer_info");
window.gpu = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
window.triangles = scene.instances.length;
// Wait for the card textures before saying ready.
await new Promise((resolve) => {
  const check = () => (textures.size === 0 || [...textures.values()].every((t) => t.image?.complete) ? resolve() : setTimeout(check, 50));
  check();
});
document.title = "ready";
