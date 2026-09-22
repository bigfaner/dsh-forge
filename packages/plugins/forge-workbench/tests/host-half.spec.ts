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

// Task 3.2 shipped the host half deliberately 空载 (empty-load); task 4.1
// fills its first face: apply(ctx) now registers the ForgeBridge remote
// service (service key `forgeBridge`). The dual-half channel availability is
// still verified by loading BOTH real artifacts through their real channels:
// the node half as an ES module (the host Loader's channel) and the browser
// half through a minimal __ModuleLoader__ whose require table answers exactly
// the module-table baseline — the resolution surface every later client→host
// exchange rides.

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Minimal Context face the cordis Service base needs at registration time. */
function fakeHostContext(): { ctx: Context; provide: ReturnType<typeof vi.fn> } {
  const provide = vi.fn()
  return { ctx: { reflect: { provide } } as unknown as Context, provide }
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

describe('forge-workbench host half: apply registers the ForgeBridge service (4.1)', () => {
  it('exports apply as the sole host export and registering it provides the forgeBridge service', async () => {
    const module = await import('../lib/index.js')
    expect(Object.keys(module)).toEqual(['apply'])
    const { ctx, provide } = fakeHostContext()
    expect(hostApply(ctx)).toBeUndefined()
    expect(provide).toHaveBeenCalledTimes(1)
    expect(provide.mock.calls[0][0]).toBe('forgeBridge')
    const instance = provide.mock.calls[0][1] as object
    // The Gateway's source-mode discovery face: @Remote-marked methods become
    // the wire endpoints forgeBridge/resolveCli and forgeBridge/getTaskPrompt.
    expect(remoteMethods(instance).map(marker => marker.exportName ?? marker.method).sort())
      .toEqual(['getTaskPrompt', 'resolveCli'])
  })

  it('ships no stub/not-implemented markers in the host half source', () => {
    const source = readFileSync(join(pkgRoot, 'src', 'host', 'index.ts'), 'utf8')
    expect(source).not.toMatch(/not implemented|TODO|throw new Error/i)
  })
})

describe('forge-workbench host half: project-roots env transport (fail closed)', () => {
  const ENV_KEY = 'DSH_FORGE_PROJECT_ROOTS'
  const CLI_KEY = 'DSH_FORGE_CLI_PATH'
  const saved = process.env[ENV_KEY]
  const savedCli = process.env[CLI_KEY]
  const savedPath = process.env.PATH

  afterEach(() => {
    if (saved === undefined) delete process.env[ENV_KEY]
    else process.env[ENV_KEY] = saved
    if (savedCli === undefined) delete process.env[CLI_KEY]
    else process.env[CLI_KEY] = savedCli
    if (savedPath === undefined) delete process.env.PATH
    else process.env.PATH = savedPath
    vi.restoreAllMocks()
  })

  it('rejects spawn for an unregistered root when the transport carries a valid list (parse ok, no warn)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env[ENV_KEY] = JSON.stringify(['Z:/workbench/registered-a'])
    const { ctx, provide } = fakeHostContext()
    hostApply(ctx)
    const instance = provide.mock.calls[0][1] as {
      getTaskPrompt(input: { projectRoot: string; taskKey: string }): Promise<{ available: boolean; reasonCode?: string; detail?: string }>
    }
    const result = await instance.getTaskPrompt({ projectRoot: 'Z:/workbench/somewhere-else', taskKey: '4.1' })
    expect(result).toMatchObject({ available: false, reasonCode: 'ERR_NO_PROMPT' })
    expect((result as { detail?: string }).detail).toContain('not a registered project')
    expect(warn).not.toHaveBeenCalled()
  })

  it('closes the allowlist on invalid JSON transport (warn + reject)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env[ENV_KEY] = '{not json'
    const { ctx, provide } = fakeHostContext()
    hostApply(ctx)
    const instance = provide.mock.calls[0][1] as {
      getTaskPrompt(input: { projectRoot: string; taskKey: string }): Promise<{ available: boolean; reasonCode?: string; detail?: string }>
    }
    const result = await instance.getTaskPrompt({ projectRoot: 'Z:/workbench/registered-a', taskKey: '4.1' })
    expect(result).toMatchObject({ available: false, reasonCode: 'ERR_NO_PROMPT' })
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('closes the allowlist when the transport is absent (secure default)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    delete process.env[ENV_KEY]
    const { ctx, provide } = fakeHostContext()
    hostApply(ctx)
    const instance = provide.mock.calls[0][1] as {
      getTaskPrompt(input: { projectRoot: string; taskKey: string }): Promise<{ available: boolean; reasonCode?: string }>
    }
    expect(await instance.getTaskPrompt({ projectRoot: 'Z:/workbench/anywhere', taskKey: '4.1' }))
      .toMatchObject({ available: false, reasonCode: 'ERR_NO_PROMPT' })
  })

  it('feeds DSH_FORGE_CLI_PATH into the resolution chain (explicit stage, both-path diagnostics)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    // A PATH pinned empty keeps the chain hermetic: the explicit candidate is
    // a real file that nonetheless cannot execute (a data file), so the probe
    // fails and the PATH stage finds nothing — ERR_FORGE_CLI_UNAVAILABLE with
    // BOTH stage diagnostics, and no real forge is ever reached.
    process.env[CLI_KEY] = join(pkgRoot, 'tsdown.config.ts')
    process.env.PATH = ''
    process.env[ENV_KEY] = JSON.stringify(['Z:/workbench/registered-a'])
    const { ctx, provide } = fakeHostContext()
    hostApply(ctx)
    const instance = provide.mock.calls[0][1] as {
      getTaskPrompt(input: { projectRoot: string; taskKey: string }): Promise<{ available: boolean; reasonCode?: string; detail?: string }>
    }
    const result = await instance.getTaskPrompt({ projectRoot: 'Z:/workbench/registered-a', taskKey: '4.1' })
    expect(result).toMatchObject({ available: false, reasonCode: 'ERR_FORGE_CLI_UNAVAILABLE' })
    expect((result as { detail?: string }).detail).toContain('explicit path')
    expect((result as { detail?: string }).detail).toContain('PATH')
  })
})

describe('forge-workbench dual-half artifacts: both load through their channels (AC3)', () => {
  it('the node-half artifact (lib/index.js) registers the ForgeBridge service when applied', async () => {
    const nodeHalf = await import(join(pkgRoot, 'lib', 'index.js'))
    expect(Object.keys(nodeHalf)).toEqual(['apply'])
    const { ctx, provide } = fakeHostContext()
    expect((nodeHalf.apply as (ctx: Context) => void)(ctx)).toBeUndefined()
    expect(provide).toHaveBeenCalledTimes(1)
    expect(provide.mock.calls[0][0]).toBe('forgeBridge')
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
