// Lets plain Node (with --experimental-strip-types) import the cad's
// TypeScript, which reaches the game's modules, written for Vite with
// extensionless imports: a relative import that names no file gets ".ts".
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    if (/^\\.{1,2}\\//.test(specifier) && !/\\.[a-z]+$/.test(specifier)) return next(specifier + ".ts", context);
    throw error;
  }
}`)
);
