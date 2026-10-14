// Photograph a part: `yarn shot <file.part.js> [view ...]` writes
// out/<file>-<view>.png for each view (default iso-ftr and iso-btl).
//
// FluidCAD renders a PNG in a browser attached to its server, so this starts
// a server of its own (server.mjs), attaches a headless Chromium (SwiftShader
// WebGL) and exports.
import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import { chromium } from "playwright";
import { withServer } from "./server.mjs";

const [entry, ...asked] = process.argv.slice(2);
if (!entry) {
  console.error("usage: yarn shot <file.part.js> [view ...]");
  process.exit(1);
}
const views = asked.length ? asked : ["iso-ftr", "iso-btl"];
const name = basename(entry).replace(/\.(part|assembly)\.js$/, "");

await withServer(entry, async (port, served) => {
  const browser = await chromium.launch({
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
    ],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    page.on("pageerror", (e) => console.error("viewer:", e.message));
    await page.goto(`http://localhost:${port}/`);
    for (const view of views) {
      const out = `out/${name}-${view}.png`;
      execFileSync(
        "npx",
        ["fluidcad", "export", "png", "-e", served, "-p", port, "--view", view, "-o", out],
        { stdio: ["ignore", "ignore", "inherit"] }
      );
      console.log(out);
    }
  } finally {
    await browser.close();
  }
});
