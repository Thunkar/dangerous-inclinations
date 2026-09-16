import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
