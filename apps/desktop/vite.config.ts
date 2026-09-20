import { defineConfig } from 'vite'

// Electron shell build. Main/preload build as separate node-oriented bundles;
// the renderer payload (upstream client UI) arrives with the vendored host
// integration in later tasks — only the main/preload pipeline is wired here.
export default defineConfig({
  build: {
    outDir: 'dist',
    lib: {
      entry: {
        main: 'src/main/index.ts',
        preload: 'src/preload/index.ts',
      },
      formats: ['cjs'],
    },
    rollupOptions: {
      external: ['electron', /^node:/],
    },
  },
})
