import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

// Assemble the shell-ui overlay payload (renderer-side plain scripts, no
// bundle processing — they must stay classic <script> injectable at
// document.body end) next to the main/preload outputs so the main process can
// serve the concatenation inside the dsh-app:// origin from `dist/shell-ui.js`.
// Order matters: bootstrap (root mount + onMount registry) first, then the
// UF3 update banner which registers via __DSH_FORGE_SHELL_UI__.onMount.
function copyShellUi(): Plugin {
  return {
    name: 'copy-shell-ui',
    closeBundle() {
      const sources = [
        'src/shell-ui/shell-ui.js',
        'src/shell-ui/update-banner.js',
      ].map((rel) => readFileSync(join(__dirname, rel), 'utf8'))
      writeFileSync(join(__dirname, 'dist/shell-ui.js'), sources.join('\n'))
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
