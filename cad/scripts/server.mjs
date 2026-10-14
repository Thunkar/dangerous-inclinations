// A FluidCAD server of our own for one entry. `fluidcad export` exports the
// scene a server shows (its workspace's active tab, which a running server
// follows even after it started), so every run works in a workspace of its
// own: a temporary directory of links to the cad files, with its own editor
// state. Runs in parallel, and the designer's viewer open on cad/, never see
// each other's tabs.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, relative, resolve } from "node:path";

const CAD = resolve(import.meta.dirname, "..");
const RUNS = join(CAD, ".runs");
/** What a workspace is made of: everything in cad/ but the outputs and other runs. */
const SKIP = new Set([".runs", ".fluidcad", "out", ".gitignore"]);

function workspace() {
  mkdirSync(RUNS, { recursive: true });
  const dir = mkdtempSync(join(RUNS, "run-"));
  for (const entry of readdirSync(CAD)) {
    if (SKIP.has(entry)) continue;
    symlinkSync(join(CAD, entry), join(dir, entry));
  }
  return dir;
}

export async function withServer(entry, run) {
  const dir = workspace();
  const tab = relative(CAD, resolve(entry));
  mkdirSync(join(dir, ".fluidcad"));
  writeFileSync(
    join(dir, ".fluidcad/editor-state.json"),
    JSON.stringify({ openTabs: [tab], activeTab: tab })
  );

  const port = String(await freePort());
  const server = spawn("npx", ["fluidcad", "serve", "--no-open", "-w", dir, "-p", port], {
    cwd: dir,
    stdio: "ignore",
    detached: true,
  });
  const clean = () => {
    try {
      process.kill(-server.pid);
    } catch {
      // already gone
    }
    rmSync(dir, { recursive: true, force: true });
  };
  process.on("exit", clean);
  try {
    // Up, and showing the entry: the summary names the file once it has rendered.
    for (let i = 0; ; i++) {
      try {
        const res = await fetch(`http://localhost:${port}/api/scene/summary`);
        const file = res.ok ? (await res.json())?.file : null;
        if (typeof file === "string" && relative(dir, file) === tab) break;
      } catch {
        // not up yet
      }
      if (i > 2400) throw new Error(`FluidCAD server did not render ${entry}`);
      await new Promise((r) => setTimeout(r, 250));
    }
    return await run(port, join(dir, tab));
  } finally {
    process.off("exit", clean);
    clean();
  }
}

/** A port nothing is listening on, from the OS. */
function freePort() {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.on("error", fail);
    probe.listen(0, () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });
}
