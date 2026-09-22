import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Task 3.2 AC4: the dependency-tree engine enters through THIS plugin's
// bundle — @xyflow/react code lands in lib/client.js — while React stays a
// module-table external (single React instance via host-profile unified
// module resolution: no React copy is inlined into the plugin, the shell, or
// the host SPA's delivery).

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const clientPath = join(pkgRoot, 'lib', 'client.js')

/** Every module-table baseline word (the apps/web platform seed). */
const MODULE_TABLE_BASELINE = new Set([
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
  '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])

describe('forge-workbench client bundle: engine in, single React out (AC4)', () => {
  it('is built (run pnpm build:plugins — the gate demands artifacts anyway)', () => {
    expect(existsSync(clientPath), 'lib/client.js missing — run pnpm build:plugins').toBe(true)
  })

  it('contains @xyflow/react code — the engine travels inside the plugin bundle', () => {
    const code = readFileSync(clientPath, 'utf8')
    // Distinctive xyflow strings/identifiers that survive the non-minified build.
    expect(code).toContain('@xyflow/react')
    expect(code).toContain('ReactFlowProvider')
  })

  it('keeps every external require inside the module-table baseline', () => {
    const code = readFileSync(clientPath, 'utf8')
    const specifiers = [...code.matchAll(/require\(\s*(['"])([^'"]+)\1\s*\)/g)].map(match => match[2])
    expect(specifiers.length).toBeGreaterThan(0)
    for (const specifier of specifiers) {
      expect(MODULE_TABLE_BASELINE.has(specifier), `non-baseline external require: ${specifier}`).toBe(true)
    }
  })

  it('resolves React through the module table — no React/react-dom copy is inlined', () => {
    const code = readFileSync(clientPath, 'utf8')
    // React must appear ONLY as external requires — the module table answers
    // with the host SPA's single instance.
    expect(code).toMatch(/require\(\s*['"]react['"]\s*\)/)
    expect(code).toMatch(/require\(\s*['"]react\/jsx-runtime['"]\s*\)/)
    expect(code).toMatch(/require\(\s*['"]react-dom['"]\s*\)/)
    // React's production markers (symbol descriptions its internals register)
    // must NOT appear — an inlined React copy would carry them.
    expect(code).not.toContain('react.element')
    expect(code).not.toContain('react.fragment')
    expect(code).not.toContain('react.portal')
    expect(code).not.toContain('react.strict_mode')
  })

  it('registers through the loader banner with the plugin identity', () => {
    const code = readFileSync(clientPath, 'utf8')
    expect(code.startsWith('window.__ModuleLoader__.load({')).toBe(true)
    expect(code).toContain('"@dsh-forge/plugin-forge-workbench"')
    // The sourcemap comment trails the footer; strip it for the tail check
    // (the closer is printer-formatted across lines — assert it closes out).
    const withoutMap = code.replace(/\/\/# sourceMappingURL=\S+\s*$/u, '')
    expect(withoutMap).toContain('return module.exports;')
    expect(withoutMap.trimEnd().endsWith('});')).toBe(true)
  })
})
