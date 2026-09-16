import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The authoring workshop loads its exporter on demand. Prebundle it with
  // the shared model helpers so opening a dev entry cannot invalidate Three's
  // dependency cache halfway through a design/export session.
  optimizeDeps: {
    include: [
      'three/examples/jsm/exporters/GLTFExporter.js',
      'three/addons/utils/BufferGeometryUtils.js',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        /*
         * three and its React bindings are several hundred kilobytes: they go
         * in their own chunk, reachable only through the lazy import of the
         * 3D board, so a table played on the flat board never fetches them.
         */
        manualChunks(id: string) {
          if (
            /[\\/]node_modules[\\/](three|@react-three[\\/][^\\/]+|postprocessing)[\\/]/.test(id)
          ) {
            return 'three'
          }
        },
      },
    },
  },
})
