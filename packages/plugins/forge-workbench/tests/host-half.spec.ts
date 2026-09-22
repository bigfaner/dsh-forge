import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { apply as hostApply } from '../src/host/index.ts'

// Task 3.2 AC3: the host half is deliberately 空载 (empty-load) — apply()
// returns void with zero unimplemented references (ForgeBridge, session
// launch, and FORGE_ACTOR passthrough are M2 4.x; a stub verb here would be an
// unimplemented reference). The dual-half channel availability is verified at
// the scaffold stage by loading BOTH real artifacts through their real
// channels: the node half as an ES module (the host Loader's channel) and the
// browser half through a minimal __ModuleLoader__ whose require table answers
// exactly the module-table baseline — the resolution surface every later
// client→host exchange rides.

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The module-table baseline the host SPA answers (hello-world / template contract). */
const MODULE_TABLE_BASELINE = new Set([
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
  '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])

/**
 * Minimal stand-ins for the baseline externals. The bundle's definition-time
 * surface only touches these members (context creation + hook presence
// checks); render-time behavior belongs to the real host SPA modules.
 */
function baselineShims(): Record<string, unknown> {
  const reactShim = {
    __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {},
    createContext: () => ({ Provider: { displayName: 'Provider' }, Consumer: { displayName: 'Consumer' } }),
    createElement: () => null,
    Fragment: Symbol('fragment'),
    forwardRef: (fn: unknown) => fn,
    memo: (fn: unknown) => fn,
    useCallback: (fn: unknown) => fn,
    useContext: () => null,
    useDebugValue: () => undefined,
    useEffect: () => undefined,
    useLayoutEffect: () => undefined,
    useMemo: (factory: () => unknown) => factory(),
    useRef: () => ({ current: null }),
    useState: (initial: unknown) => [initial, () => undefined] as const,
    useSyncExternalStore: () => null,
  }
  return {
    'react': reactShim,
    'react/jsx-runtime': { Fragment: Symbol('fragment'), jsx: () => null, jsxs: () => null },
    'react-dom': {},
    'react-dom/client': {},
    '@deepseek-ai/cordis': {},
    '@deepseek-ai/dsh-client-store': {},
    '@deepseek-ai/dsh-client-ui-slots': {},
    '@deepseek-ai/dsh-client-ui-primitives': { IconBranchOutline16: () => null },
    '@deepseek-ai/dsh-client-ui-dockkit': {},
  }
}

describe('forge-workbench host half: empty apply, no unimplemented references (AC3)', () => {
  it('exports apply as a void no-op and nothing else', async () => {
    const module = await import('../src/host/index.ts')
    expect(Object.keys(module)).toEqual(['apply'])
    expect(hostApply()).toBeUndefined()
  })

  it('ships no stub/not-implemented markers in the host half source', () => {
    const source = readFileSync(join(pkgRoot, 'src', 'host', 'index.ts'), 'utf8')
    expect(source).not.toMatch(/not implemented|TODO|throw new Error/i)
  })
})

describe('forge-workbench dual-half artifacts: both load through their channels (AC3)', () => {
  it('the node-half artifact (lib/index.js) imports and exports the empty apply', async () => {
    const nodeHalf = await import(join(pkgRoot, 'lib', 'index.js'))
    expect(Object.keys(nodeHalf)).toEqual(['apply'])
    expect(nodeHalf.apply()).toBeUndefined()
  })

  it('the browser-half artifact (lib/client.js) executes through the module-table loader channel', () => {
    const code = readFileSync(join(pkgRoot, 'lib', 'client.js'), 'utf8')
    expect(code.startsWith('window.__ModuleLoader__.load({')).toBe(true)

    const shims = baselineShims()
    const requested: string[] = []
    const requireFace = (specifier: string): unknown => {
      requested.push(specifier)
      if (!MODULE_TABLE_BASELINE.has(specifier)) throw new Error(`module table cannot answer ${specifier}`)
      return shims[specifier]
    }
    const loaded: string[] = []
    const window = {
      __ModuleLoader__: {
        load(entry: { id: string; factory: (req: (s: string) => unknown) => unknown }): void {
          expect(entry.id).toBe('@dsh-forge/plugin-forge-workbench')
          const exported = entry.factory(requireFace) as { apply?: unknown; inject?: unknown }
          // The registered module is the client plugin: the apply body and the
          // service-inject declaration, exactly what the loader hands the
          // browser runtime when it boots the plugin.
          expect(exported.apply).toBeTypeOf('function')
          expect(exported.inject).toEqual(['slots', 'locale'])
          loaded.push(entry.id)
        },
      },
    }
    const evaluate = new Function('window', `"use strict"; return (() => {${code}\n})()`) as (w: unknown) => void
    evaluate(window)
    expect(loaded).toEqual(['@dsh-forge/plugin-forge-workbench'])
    // Every external request stays inside the baseline — the artifact ships
    // nothing the host module table cannot answer.
    expect(requested.length).toBeGreaterThan(0)
    for (const specifier of requested) expect(MODULE_TABLE_BASELINE.has(specifier), `non-baseline require: ${specifier}`).toBe(true)
  })
})
