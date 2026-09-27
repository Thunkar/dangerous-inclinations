/**
 * Runs server scripts against the engine's TypeScript SOURCE instead of its
 * (possibly stale) `dist/` build:
 *
 *   node --experimental-transform-types --import ./scripts/engine-source-loader.mjs scripts/smoke.ts
 */
import { registerHooks } from "node:module";

const ENGINE_INDEX = new URL("../../engine/src/index.ts", import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@dangerous-inclinations/engine") {
      return { url: ENGINE_INDEX, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
