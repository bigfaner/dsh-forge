import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
// apply is loaded through the built node half (same source): the host entry
// transitively imports the @Remote-decorated service class, and this
// workspace's test transform does not lower standard decorators while the
// tsc --build step (the suite's existing prereq — the artifact legs gate on
// lib/) does.
import { apply as hostApply } from '../lib/index.js'

// M3 task 6.1 (ForgeBridge 退役): the M2 forgeBridge/sessionLaunch services
// are deleted — apply(ctx) now registers the THREE M3 faces (forgeToolBridge
// stream + the dispatchLaunch/approvalBridge orchestration pair). The
// dual-half channel availability is still verified by loading BOTH real
// artifacts through their real channels:
// the node half as an ES module (the host Loader's channel) and the browser
// half through a minimal __ModuleLoader__ whose require table answers exactly
// the module-table baseline — the resolution surface every later client→host
// exchange rides.

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Minimal Context face the cordis Service base needs at registration time. */
function fakeHostContext(): { ctx: Context; provide: ReturnType<typeof vi.fn> } {
  const provide = vi.fn()
  return {
    ctx: {
      reflect: { provide },
      // M3 task 3.5: apply() also attaches the approval-bridge's waterfall
      // listeners (approval/request + tools/pre-execute) — the minimal event
      // surface a host context carries for the attach (each on() returns its
      // detach; the rebuilt bundle exercises the real attach since 3.9's
      // lib refresh unmasked the stale-artifact gap).
      on: vi.fn(() => () => {}),
    } as unknown as Context,
    provide,
  }
}

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
 * checks); render-time behavior belongs to the real host SPA modules.
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

describe('forge-workbench host half: apply registers the ForgeToolBridge + dispatchLaunch + approvalBridge services (2.1/3.5)', () => {
  it('exports apply as the sole host export and registering it provides all three remote services', async () => {
    const module = await import('../lib/index.js')
    expect(Object.keys(module)).toEqual(['apply'])
    const { ctx, provide } = fakeHostContext()
    expect(hostApply(ctx)).toBeUndefined()
    // Since 6.1 (ForgeBridge 退役) apply registers THREE remote services: the
    // tool bridge plus the orchestration pair (dispatchLaunch +
    // approvalBridge); the M2 forgeBridge/sessionLaunch faces are gone.
    expect(provide).toHaveBeenCalledTimes(3)
    expect(provide.mock.calls.map(call => call[0])).toEqual([
      'forgeToolBridge', 'dispatchLaunch', 'approvalBridge',
    ])
    // The Gateway's source-mode discovery face: @Remote-marked methods become
    // the wire endpoints forgeToolBridge/{calls,answer} (2.1 — calls is the
    // stream-mode subscription face, spike-1 §2'), dispatchLaunch/launch
    // (3.5), and approvalBridge/answer (3.5, the decideApproval 下行腿).
    const toolBridge = provide.mock.calls[0][1] as object
    const toolMarkers = remoteMethods(toolBridge)
    expect(toolMarkers.map(marker => marker.exportName ?? marker.method).sort()).toEqual(['answer', 'calls'])
    expect(toolMarkers.find(marker => (marker.exportName ?? marker.method) === 'calls')?.mode).toBe('stream')
    const dispatchLauncher = provide.mock.calls[1][1] as object
    expect(remoteMethods(dispatchLauncher).map(marker => marker.exportName ?? marker.method)).toEqual(['launch'])
  })

  it('ships no stub/not-implemented markers in the host half source', () => {
    const source = readFileSync(join(pkgRoot, 'src', 'host', 'index.ts'), 'utf8')
    expect(source).not.toMatch(/not implemented|TODO|throw new Error/i)
  })
})

describe('forge-workbench dual-half artifacts: both load through their channels (AC3)', () => {
  it('the node-half artifact (lib/index.js) registers all three M3 host services when applied', async () => {
    const nodeHalf = await import(join(pkgRoot, 'lib', 'index.js'))
    expect(Object.keys(nodeHalf)).toEqual(['apply'])
    const { ctx, provide } = fakeHostContext()
    expect((nodeHalf.apply as (ctx: Context) => void)(ctx)).toBeUndefined()
    // Since 6.1 the artifact registers the M3 faces only (the M2
    // forgeBridge/sessionLaunch services retired with the spawn chain).
    expect(provide).toHaveBeenCalledTimes(3)
    expect(provide.mock.calls.map(call => call[0])).toEqual([
      'forgeToolBridge', 'dispatchLaunch', 'approvalBridge',
    ])
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
