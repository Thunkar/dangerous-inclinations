// A FluidCAD server of our own for one entry. `fluidcad export` exports the
// scene the server shows (the editor's active tab), and attaches to any
// server already running for the workspace, so the scripts never share the
// viewer's: they open the entry in the editor state, start a server on a
// spare port and put the designer's open tabs back afterwards.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { relative, resolve } from "node:path";

const STATE = ".fluidcad/editor-state.json";

export async function withServer(entry, run) {
  const saved = existsSync(STATE) ? readFileSync(STATE, "utf8") : null;
  const tab = relative(".", resolve(entry));
  mkdirSync(".fluidcad", { recursive: true });
  writeFileSync(STATE, JSON.stringify({ openTabs: [tab], activeTab: tab }));

  const port = String(await freePort());
  const server = spawn("npx", ["fluidcad", "serve", "--no-open", "-w", ".", "-p", port], {
    stdio: "ignore",
    detached: true,
  });
  const stop = () => {
    try {
      process.kill(-server.pid);
    } catch {
      // already gone
    }
  };
  process.on("exit", stop);
  try {
    // Up, and showing the entry: the summary names the file once it has rendered.
    for (let i = 0; ; i++) {
      try {
        const res = await fetch(`http://localhost:${port}/api/scene/summary`);
        const file = res.ok ? (await res.json())?.file : null;
        if (typeof file === "string" && resolve(file) === resolve(entry)) break;
      } catch {
        // not up yet
      }
      if (i > 480) throw new Error(`FluidCAD server did not render ${entry}`);
      await new Promise((r) => setTimeout(r, 250));
    }
    return await run(port);
  } finally {
    stop();
    if (saved !== null) writeFileSync(STATE, saved);
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
