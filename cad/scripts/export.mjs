// Export every printable: `yarn export [file.part.js ...]` writes
// out/<file>.step (PrusaSlicer opens STEP, exact geometry) and out/<file>.stl
// for each part file, all of coupons/ and parts/ when none is named. Each
// file gets a server of its own (server.mjs), so an open viewer is safe.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { withServer } from "./server.mjs";

const named = process.argv.slice(2);
const files = named.length
  ? named
  : ["coupons", "parts"]
      .filter((d) => existsSync(d))
      .flatMap((d) =>
        readdirSync(d)
          .filter((f) => f.endsWith(".part.js"))
          .map((f) => join(d, f))
      );
mkdirSync("out", { recursive: true });
for (const file of files) {
  const name = basename(file, ".part.js");
  await withServer(file, async (port) => {
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
          file,
          "-p",
          port,
          "-o",
          `out/${name}.${format}`,
          ...extra,
        ],
        { stdio: ["ignore", "ignore", "inherit"] }
      );
    }
  });
  console.log(`out/${name}.step, out/${name}.stl`);
}
