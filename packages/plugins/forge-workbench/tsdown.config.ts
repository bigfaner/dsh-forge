/**
 * Build faces of the forge-workbench plugin (mirrors the upstream
 * client-plugin artifact contract; same form as packages/plugins/hello-world —
 * the workspace replica of the packages/templates/plugin contract):
 *
 * 1. node half — lib/index.js, the (currently empty) host body consumed by the
 *    host cordis Loader (self-contained ESM, nothing external). The source
 *    lives at src/host/ per the tech-design layer placement; the artifact name
 *    stays lib/index.js — the build/stage channel contract requires it.
 * 2. browser half — lib/client.js, a closure-factory artifact registering
 *    through window.__ModuleLoader__.load({id, factory}); externals resolve
 *    through the loader module table (the apps/web baseline seed). This is
 *    where @xyflow/react inlines (never the shell, never the host SPA's React:
 *    react stays a module-table external — single React instance by
 *    host-profile unified module resolution).
 */
import { defineConfig } from 'tsdown'

const id = '@dsh-forge/plugin-forge-workbench'

/**
 * Module-table baseline every client bundle may require (the apps/web platform
 * seed: react family, cordis, and the immediately-tier client core). Anything
 * outside this set inlines — a require() the table cannot answer is a
 * guaranteed runtime throw, so the externals list stays the request list.
 * @xyflow/react is deliberately NOT here: it bundles into the plugin.
 */
const MODULE_TABLE_BASELINE = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])

export default defineConfig([
  {
    name: id,
    entry: { index: 'lib/types/host/index.js' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    // ESM output keeps the .js extension (the exports map pins lib/index.js).
    fixedExtension: false,
    dts: false,
    clean: false,
    deps: { neverBundle: () => true, alwaysBundle: () => false },
  },
  {
    name: `${id}/client`,
    entry: { client: 'lib/types/client/index.js' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2024',
    dts: false,
    clean: false,
    sourcemap: true,
    deps: {
      neverBundle: (specifier: string) => MODULE_TABLE_BASELINE.has(specifier),
      alwaysBundle: (specifier: string) => !MODULE_TABLE_BASELINE.has(specifier),
    },
    // @xyflow/react's inlined code branches on process.env.NODE_ENV (dev
    // warnings); the browser runtime has no `process` — pin the shipped
    // artifact to production semantics at build time (the upstream
    // tsdown.client preset does the same for SPA-side bundles).
    define: { 'process.env.NODE_ENV': '"production"' },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      footer: 'return module.exports; } });',
    },
  },
])
