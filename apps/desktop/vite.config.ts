import { copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

// Copy the shell-ui overlay bootstrap (renderer-side plain script, no bundle
// processing — it must stay a classic <script> injectable at document.body end)
// next to the main/preload outputs so the main process can serve it inside
// the dsh-app:// origin from `dist/shell-ui.js`.
function copyShellUi(): Plugin {
  return {
    name: 'copy-shell-ui',
    closeBundle() {
      copyFileSync(join(__dirname, 'src/shell-ui/shell-ui.js'), join(__dirname, 'dist/shell-ui.js'))
    },
  }
}

// Electron shell build. Main/preload build as separate node-oriented bundles;
// the renderer payload (upstream client UI) is served over dsh-app:// from the
// vendored web frontend dist, with the shell-ui overlay injected at body end.
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
      plugins: [copyShellUi()],
    },
  },
})
