// Lets plain Node (with --experimental-strip-types) import the cad's
// TypeScript, which reaches the game's modules, written for Vite with
// extensionless imports: a relative import that names no file gets ".ts".
// The engine is its TypeScript source, as in the FluidCAD viewer
// (vite.config.ts), so no build of it is needed first.
import { register } from 'node:module'

const ENGINE = new URL('../../engine/src/index.ts', import.meta.url).href

register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === "@dangerous-inclinations/engine") return { url: ${JSON.stringify(ENGINE)}, shortCircuit: true };
  try {
    return await next(specifier, context);
  } catch (error) {
    if (/^\\.{1,2}\\//.test(specifier) && !/\\.[a-z]+$/.test(specifier)) return next(specifier + ".ts", context);
    throw error;
  }
}`)
)
