// Export every printable: `yarn export [file.part.js ...]` writes
// out/<path>.step (PrusaSlicer opens STEP, exact geometry) and out/<path>.stl
// for each part file under parts/ (out/corvette/corvette-hull.stl for
// parts/corvette/corvette-hull.part.js: a folder per hull, the base, the
// modules, the board and the tokens) and under coupons/ (out/coupons/), one
// piece a file; the `.view.part.js` files lay several out for the viewer and
// are skipped. Out holds printables only: pictures go to shots/.
// Each file gets a server of its own (server.mjs), so an open viewer is safe.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { withServer } from "./server.mjs";

const named = process.argv.slice(2);
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return walk(p);
    return f.endsWith(".part.js") && !f.endsWith(".view.part.js") ? [p] : [];
  });
if (!named.length) {
  execFileSync("node", ["scripts/pieces.mjs"], { stdio: "inherit" });
  execFileSync("node", ["--experimental-strip-types", "--no-warnings", "--import", "./scripts/ts-hooks.mjs", "scripts/board.ts"], {
    stdio: "inherit",
  });
}
const files = named.length
  ? named
  : ["coupons", "parts"].filter((d) => existsSync(d)).flatMap(walk);
for (const file of files) {
  const out = join(
    "out",
    relative(".", file)
      .replace(/^parts\//, "")
      .replace(/\.part\.js$/, "")
  );
  mkdirSync(dirname(out), { recursive: true });
  await withServer(file, async (port, served) => {
    for (const [format, extra] of [
      ["step", []],
      ["stl", ["--resolution", "fine"]],
    ]) {
      execFileSync(
        "npx",
        [
          "fluidcad",
          "export",
          format,
          "-e",
          served,
          "-p",
          port,
          "-o",
          `${out}.${format}`,
          "--timeout",
          "600",
          ...extra,
        ],
        { stdio: ["ignore", "ignore", "inherit"] }
      );
    }
  });
  console.log(`${out}.step, ${out}.stl`);
}
