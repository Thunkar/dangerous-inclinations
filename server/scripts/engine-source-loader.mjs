/**
 * Runs server scripts against the engine's TypeScript SOURCE instead of its
 * (possibly stale) `dist/` build:
 *
 *   node --experimental-transform-types --import ./scripts/engine-source-loader.mjs scripts/smoke.ts
 *
 * With STUB_AI=1 the engine's bot module is replaced by `scripts/stubAi.ts`.
 * That is an escape hatch for running the smoke test while engine/src/ai is
 * mid-rewrite and does not link; drop it as soon as the AI compiles, so the
 * smoke test exercises the real bots.
 */
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const ENGINE_INDEX = new URL("../../engine/src/index.ts", import.meta.url).href;
const ENGINE_AI_INDEX = new URL("../../engine/src/ai/index.ts", import.meta.url).href;
const STUB_AI = new URL("./stubAi.ts", import.meta.url).href;

const stubAi = process.env.STUB_AI === "1";
if (stubAi) {
  console.warn(`[engine-source-loader] STUB_AI=1: bots come from ${fileURLToPath(STUB_AI)}, not engine/src/ai`);
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@dangerous-inclinations/engine") {
      return { url: ENGINE_INDEX, shortCircuit: true };
    }
    const resolved = nextResolve(specifier, context);
    if (stubAi && resolved.url === ENGINE_AI_INDEX) {
      return { ...resolved, url: STUB_AI, shortCircuit: true };
    }
    return resolved;
  },
});
