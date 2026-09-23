// Task 3.1 unit legs — the pref tool family (forge_pref_get, tech-design
// §Interface 2「forge.pref.get」) and its client-bridge dispatch:
//
//   AC-1 注册契约 — the single flat-name tool registers through a stub
//                   registry with optional typed parameters (projectId /
//                   featureSlug) and the canonical string output schema.
//   AC-2 tier 寻址 — actor (`session:<id>`) threads into the bridge frame;
//                   tier guards reject featureSlug-without-projectId and
//                   malformed slugs BEFORE any bridge hop (T1 mirror of the
//                   kernel ERR_PREF_SCOPE_INVALID gate).
//   AC-3 降级链    — a bridge transport failure THROWS
//                   ERR_TOOL_BRIDGE_UNAVAILABLE into the session (Story 9
//                   禁静默;same executor semantics as the task family).
//   dispatch legs — the client half composes the three tiers (global /
//                   { project } / { feature: '<projectId>/<featureSlug>' })
//                   onto the getPrefs IPC member in the closed switch (T4).

import { describe, expect, it } from 'vitest'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { createForgePrefTools, type ForgePrefToolDeps } from '../src/host/forge-tools/pref.ts'
import type { ForgeTaskToolCallFn } from '../src/host/forge-tools/task-tools.ts'
import type { BridgeOutcome, ForgeToolBridgeVerb } from '../src/host/forge-tools/bridge-core.ts'
import { dispatchToolBridgeCall } from '../src/client/ipc/tool-bridge.ts'
import type { WorkbenchIpcBridge } from '../src/client/ipc/workbench.ts'

function execOf(agent?: { id?: string; session?: { id?: string } }): Record<string, unknown> {
  return { callId: 'call-1', signal: new AbortController().signal, ...(agent === undefined ? {} : { agent }) }
}

async function runTool(
  tools: Map<string, ToolDefinition>,
  args: Record<string, unknown>,
  exec: Record<string, unknown> = execOf({ id: 's-42' }),
): Promise<string> {
  const tool = tools.get('forge_pref_get')
  if (tool === undefined) throw new Error('tool forge_pref_get not registered')
  return await tool.execute(args, exec as never) as string
}

function callSeam(result: BridgeOutcome | ((verb: ForgeToolBridgeVerb) => BridgeOutcome)): {
  call: ForgeTaskToolCallFn
  invocations: Array<{ verb: ForgeToolBridgeVerb; args: Record<string, unknown>; actor: string }>
} {
  const invocations: Array<{ verb: ForgeToolBridgeVerb; args: Record<string, unknown>; actor: string }> = []
  const call: ForgeTaskToolCallFn = async (verb, args, actor) => {
    invocations.push({ verb, args, actor })
    return typeof result === 'function' ? result(verb) : result
  }
  return { call, invocations }
}

function toolsOf(deps: ForgePrefToolDeps): Map<string, ToolDefinition> {
  const registry = new Map<string, ToolDefinition>()
  for (const tool of createForgePrefTools(deps)) registry.set(tool.name, tool)
  return registry
}

describe('forge_pref_get: registration contract (AC-1/AC-4)', () => {
  it('registers the single flat-name tool with an optional typed parameter schema', () => {
    const { call } = callSeam({ ok: true, value: [] })
    const registry = toolsOf({ call })
    expect([...registry.keys()]).toEqual(['forge_pref_get'])
    const tool = registry.get('forge_pref_get') as ToolDefinition
    expect(tool.output.schema).toEqual({ type: 'string' })
    expect(typeof tool.execute).toBe('function')
    expect(tool.description).toContain('three-tier')
  })

  it('threads the session actor into the bridge frame and returns kernel values', async () => {
    const rows = [{ key: 'auto.gitPush', value: false, source: 'default', override: false, localValue: null, defaultValue: false }]
    const { call, invocations } = callSeam({ ok: true, value: rows })
    const registry = toolsOf({ call })
    const result = JSON.parse(await runTool(registry, { projectId: 'p-1', featureSlug: 'alpha' })) as {
      ok: boolean
      result: typeof rows
    }
    expect(result.ok).toBe(true)
    expect(result.result[0]?.key).toBe('auto.gitPush')
    expect(invocations).toEqual([{
      verb: 'pref_get',
      args: { projectId: 'p-1', featureSlug: 'alpha' },
      actor: 'session:s-42',
    }])
  })

  it('rejects tier-combination and slug-shape violations before the bridge (T1 mirror)', async () => {
    const { call, invocations } = callSeam({ ok: true, value: [] })
    const registry = toolsOf({ call })
    // featureSlug 无 projectId = 组合错(业务拒绝载荷,非 transport 失败)
    const noProject = JSON.parse(await runTool(registry, { featureSlug: 'alpha' })) as { ok: boolean; code: string }
    expect(noProject).toMatchObject({ ok: false, code: 'ERR_PREF_SCOPE_INVALID' })
    // 段形态:多段 / 控制字符 / 空串
    for (const slug of ['a/b', 'bad\\slug', '']) {
      const bad = JSON.parse(await runTool(registry, { projectId: 'p-1', featureSlug: slug })) as { ok: boolean; code: string }
      expect(bad).toMatchObject({ ok: false, code: 'ERR_PREF_SCOPE_INVALID' })
    }
    expect(invocations).toHaveLength(0) // 零桥跳
  })

  it('folds business rejections into the value form and throws transport failures (Story 9)', async () => {
    const { call } = callSeam({ ok: false, code: 'ERR_PROJECT_NOT_FOUND', message: 'project nope does not exist' })
    const rejected = JSON.parse(await runTool(toolsOf({ call }), { projectId: 'nope' })) as { ok: boolean; code: string }
    expect(rejected).toMatchObject({ ok: false, code: 'ERR_PROJECT_NOT_FOUND' })

    const transport = callSeam({ ok: false, code: 'ERR_TOOL_BRIDGE_UNAVAILABLE', message: 'bridge down' })
    await expect(runTool(toolsOf({ call: transport.call }), {})).rejects.toThrow('ERR_TOOL_BRIDGE_UNAVAILABLE')
  })
})

// ---------------------------------------------------------------------------
// Client dispatch legs (T4 closed switch: tier composition onto getPrefs)
// ---------------------------------------------------------------------------

/** Minimal stub bridge recording member calls (tool-bridge-core.spec 同款形态). */
function stubBridge(results: Partial<Record<string, unknown>> = {}): {
  bridge: WorkbenchIpcBridge
  calls: Array<{ member: string; args: unknown[] }>
} {
  const calls: Array<{ member: string; args: unknown[] }> = []
  const record = (member: string) => (...args: unknown[]): Promise<unknown> => {
    calls.push({ member, args })
    const outcome = results[member]
    if (outcome instanceof Error) return Promise.reject(outcome)
    return Promise.resolve(outcome ?? {})
  }
  const bridge = new Proxy({} as Record<string, unknown>, {
    get: (target, prop) => {
      if (prop === 'onEvents') return () => () => {}
      if (typeof prop !== 'string') return undefined
      if (!(prop in target)) target[prop] = record(prop)
      return target[prop]
    },
  })
  return { bridge: bridge as unknown as WorkbenchIpcBridge, calls }
}

describe('tool bridge client dispatch: pref_get tier composition (AC-4)', () => {
  const frame = (args: Record<string, unknown>) => ({
    callId: 'c-1', verb: 'pref_get' as const, args, actor: 'session:s-1',
  })

  it('composes the three tiers onto the getPrefs member', async () => {
    const { bridge, calls } = stubBridge()
    await dispatchToolBridgeCall(bridge, frame({}))
    await dispatchToolBridgeCall(bridge, frame({ projectId: 'p-1' }))
    await dispatchToolBridgeCall(bridge, frame({ projectId: 'p-1', featureSlug: 'alpha' }))
    expect(calls.map(entry => entry.member)).toEqual(['getPrefs', 'getPrefs', 'getPrefs'])
    expect(calls.map(entry => entry.args[0])).toEqual([
      'global',
      { project: 'p-1' },
      { feature: 'p-1/alpha' }, // 限定地址组合(防跨项目同 slug 碰撞的 scope_id 方言)
    ])
    // 读动词不携带 actor(知识系/feature 读族同口径)
    for (const entry of calls) expect(entry.args).toHaveLength(1)
  })

  it('folds IPC rejections into the envelope answer (business codes ride back to the host)', async () => {
    const { bridge } = stubBridge({
      getPrefs: new Error('Error invoking remote method \'dsh-forge:workbench-get-prefs\': WorkbenchIpcError: {"code":"ERR_PROJECT_NOT_FOUND","message":"project nope does not exist"}'),
    })
    const answer = await dispatchToolBridgeCall(bridge, frame({ projectId: 'nope' }))
    expect(answer).toMatchObject({ callId: 'c-1', ok: false, code: 'ERR_PROJECT_NOT_FOUND' })
  })
})
