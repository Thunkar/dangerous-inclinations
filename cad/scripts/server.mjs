// A FluidCAD server of our own for one entry. `fluidcad export` exports the
// scene the server shows (the editor's active tab), and attaches to any
// server already running for the workspace, so the scripts never share the
// viewer's: they open the entry in the editor state, start a server on a
// spare port and put the designer's open tabs back once it has rendered.
// The editor state is one file, and a running server follows it (it renders
// whatever tab the state names, even after it started), so runs in parallel
// take turns: each holds a lock directory for its whole run.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { relative, resolve } from "node:path";

const STATE = ".fluidcad/editor-state.json";
const LOCK = ".fluidcad/lock";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function lock() {
  mkdirSync(".fluidcad", { recursive: true });
  for (;;) {
    try {
      mkdirSync(LOCK);
      return;
    } catch {
      // Someone else's turn; a lock older than half an hour is a dead run's.
      try {
        if (Date.now() - statSync(LOCK).mtimeMs > 1_800_000) rmSync(LOCK, { recursive: true });
      } catch {
        // gone already
      }
      await sleep(250);
    }
  }
}

export async function withServer(entry, run) {
  await lock();
  let locked = true;
  const unlock = () => {
    if (locked) rmSync(LOCK, { recursive: true, force: true });
    locked = false;
  };
  const saved = existsSync(STATE) ? readFileSync(STATE, "utf8") : null;
  // Put the tabs back once, before the lock is let go.
  const restore = () => {
    if (locked && saved !== null) writeFileSync(STATE, saved);
  };
  const tab = relative(".", resolve(entry));
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
      if (i > 2400) throw new Error(`FluidCAD server did not render ${entry}`);
      await sleep(250);
    }
    return await run(port);
  } finally {
    process.off("exit", stop);
    stop();
    restore();
    unlock();
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
