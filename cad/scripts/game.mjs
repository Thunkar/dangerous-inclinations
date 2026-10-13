// Photograph the game's own ship: `node scripts/game.mjs <out-dir> <query> [query ...]`
// writes one PNG per query of ui/dev-ship.html (e.g. "hull=corvette&view=iso",
// "hull=shrike&module=laser&focus=side-0&view=iso"), named after the query.
// Uses a Vite already serving ui/ on 5179, or starts one of its own.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const [outDir, ...queries] = process.argv.slice(2);
if (!outDir || !queries.length) {
  console.error("usage: node scripts/game.mjs <out-dir> <query> [query ...]");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const up = async (url) => {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
};
let port = 5179;
let vite = null;
if (!(await up(`http://localhost:${port}/dev-ship.html`))) {
  port = 5300 + Math.floor(Math.random() * 400);
  vite = spawn("npx", ["vite", "--port", String(port), "--strictPort"], {
    cwd: resolve(import.meta.dirname, "../../ui"),
    stdio: "ignore",
    detached: true,
  });
  for (let i = 0; !(await up(`http://localhost:${port}/dev-ship.html`)); i++) {
    if (i > 120) throw new Error("Vite did not start");
    await new Promise((r) => setTimeout(r, 250));
  }
}
const browser = await chromium.launch({
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 650 } });
  page.on("pageerror", (e) => console.error("page:", e.message));
  for (const q of queries) {
    await page.goto(`http://localhost:${port}/dev-ship.html?${q}`);
    await page.waitForFunction(() => document.title.startsWith("ready"), null, { timeout: 60000 });
    const out = join(outDir, `${q.replace(/[&=]/g, "-")}.png`);
    await page.screenshot({ path: out });
    console.log(out);
  }
} finally {
  await browser.close();
  if (vite) process.kill(-vite.pid);
}
