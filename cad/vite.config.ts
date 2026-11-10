// FluidCAD builds the parts through Vite, which reads this file: the parts
// import the engine's TypeScript source, as the cad's Node scripts do
// (scripts/ts-hooks.mjs), so no build of the engine is needed first.
import { fileURLToPath } from 'node:url'

export default {
  resolve: {
    alias: {
      '@dangerous-inclinations/engine': fileURLToPath(
        new URL('../engine/src/index.ts', import.meta.url)
      ),
    },
  },
}
