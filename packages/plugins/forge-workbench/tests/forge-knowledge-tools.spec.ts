// Task 2.2 unit legs — the knowledge + feature-read tool families (D4 data
// plane) and their client-bridge dispatch:
//
//   AC-1 注册契约 — the six flat-name tools (forge_fact / forge_lesson /
//                   forge_research / forge_forensic / forge_feature_list /
//                   forge_feature_status) register through a stub registry
//                   with strictly-typed parameter schemas (action enums,
//                   fact vocabularies) and declared output schemas.
//   AC-1/2 语义    — read/write main paths thread the actor
//                   (`session:<id>`) into the bridge frame, return kernel
//                   values / business rejections as canonical JSON values;
//                   out-of-bound names (traversal / separators) are rejected
//                   BEFORE any bridge hop (T1 mirror of the kernel gate).
//   AC-3 降级链    — a bridge transport failure THROWS
//                   ERR_TOOL_BRIDGE_UNAVAILABLE up into the session
//                   (Story 9 禁静默 — same executor semantics as the task
//                   family, 2.1).
//   dispatch legs — the client half routes the six new verbs onto the
//                   whitelist IPC members in a closed switch (T4), forensic /
//                   feature reads never carrying an actor argument.

import { describe, expect, it } from 'vitest'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import {
  createForgeKnowledgeTools, type ForgeKnowledgeToolDeps,
} from '../src/host/forge-tools/knowledge.ts'
import { createForgeFeatureReadTools } from '../src/host/forge-tools/feature-read.ts'
import { actorOf, type ForgeTaskToolCallFn } from '../src/host/forge-tools/task-tools.ts'
import type { BridgeOutcome, ForgeToolBridgeVerb } from '../src/host/forge-tools/bridge-core.ts'
import { dispatchToolBridgeCall } from '../src/client/ipc/tool-bridge.ts'
import type { WorkbenchIpcBridge } from '../src/client/ipc/workbench.ts'

/** The six task-2.2 tool names, spike-1 flat form. */
const EXPECTED_TOOL_NAMES = [
  'forge_fact', 'forge_lesson', 'forge_research', 'forge_forensic',
  'forge_feature_list', 'forge_feature_status',
] as const

function execOf(agent?: { id?: string; session?: { id?: string } }): Record<string, unknown> {
  return { callId: 'call-1', signal: new AbortController().signal, ...(agent === undefined ? {} : { agent }) }
}

async function runTool(
  tools: Map<string, ToolDefinition>,
  name: string,
  args: Record<string, unknown>,
  exec: Record<string, unknown> = execOf({ id: 's-42' }),
): Promise<string> {
  const tool = tools.get(name)
  if (tool === undefined) throw new Error(`tool ${name} not registered`)
  return await tool.execute(args, exec as never) as string
}

/** A call seam recording every (verb, args, actor) the tools emit. */
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

function toolsOf(deps: ForgeKnowledgeToolDeps): Map<string, ToolDefinition> {
  const registry = new Map<string, ToolDefinition>()
  for (const tool of [
    ...createForgeKnowledgeTools(deps),
    ...createForgeFeatureReadTools({ call: deps.call }),
  ]) registry.set(tool.name, tool)
  return registry
}

describe('knowledge + feature tools: registration contract (AC-1)', () => {
  it('registers exactly the six flat-name tools with declared output schemas', () => {
    const { call } = callSeam({ ok: true, value: {} })
    const registry = toolsOf({ call })
    expect([...registry.keys()].sort()).toEqual([...EXPECTED_TOOL_NAMES].sort())
    for (const tool of registry.values()) {
      expect(tool.output).toBeDefined()
      expect(tool.output.schema).toEqual({ type: 'string' })
      expect(typeof tool.execute).toBe('function')
      expect(tool.description.length).toBeGreaterThan(0)
    }
  })

  it('declares strictly-typed parameter schemas: action enums + fact vocabularies', () => {
    const { call } = callSeam({ ok: true, value: {} })
    const registry = toolsOf({ call })
    const fact = registry.get('forge_fact')?.parameters as {
      properties: Record<string, { type: string; enum?: string[] }>
      required: string[]
    }
    expect(fact.properties.action).toMatchObject({ type: 'string', enum: ['list', 'get', 'summary', 'add'] })
    expect(fact.properties.source.enum).toEqual(['static', 'runtime', 'manual'])
    expect(fact.properties.confidence.enum).toEqual(['confirmed', 'inferred', 'assumed'])
    expect(fact.properties.entry.type).toBe('object')
    expect(fact.required).toEqual(['projectId', 'action'])

    const lesson = registry.get('forge_lesson')?.parameters as {
      properties: Record<string, { type: string; enum?: string[]; items?: { type: string } }>
      required: string[]
    }
    expect(lesson.properties.action.enum).toEqual(['list', 'get', 'add'])
    expect(lesson.properties.tags).toMatchObject({ type: 'array', items: { type: 'string' } })

    const forensic = registry.get('forge_forensic')?.parameters as {
      properties: Record<string, { type: string; enum?: string[] }>
      required: string[]
    }
    expect(forensic.properties.action.enum).toEqual(['search', 'extract', 'subagents'])
    expect(forensic.required).toEqual(['action']) // 机器全局源:无 projectId

    const status = registry.get('forge_feature_status')?.parameters as { required: string[] }
    expect(status.required).toEqual(['projectId', 'featureSlug'])
  })
})

describe('knowledge + feature tools: semantics through the real bodies (AC-1/AC-2/AC-3)', () => {
  it('main read paths bridge with the action payload and value-ize the kernel result', async () => {
    const lessons = { total: 1, lessons: [{ name: 'gotcha-x', category: 'gotcha' }] }
    const { call, invocations } = callSeam(_verb => ({ ok: true, value: lessons }))
    const registry = toolsOf({ call })

    const out = await runTool(registry, 'forge_lesson', { projectId: 'p-1', action: 'list' })
    expect(JSON.parse(out)).toEqual({ ok: true, result: lessons })
    expect(invocations).toEqual([{
      verb: 'knowledge_lesson',
      args: { projectId: 'p-1', action: 'list' },
      actor: 'session:s-42', // 审计主体随帧走(executeVia actorOf)
    }])
  })

  it('write actions ride the same frame (actor) and business rejections return as values, not throws', async () => {
    const { call, invocations } = callSeam(() => ({
      ok: false, code: 'ERR_KNOWLEDGE_ENTRY_EXISTS', message: 'lesson "x" already exists',
    }))
    const registry = toolsOf({ call })

    const out = await runTool(registry, 'forge_lesson', { projectId: 'p-1', action: 'add', name: 'x', body: 'b' })
    expect(JSON.parse(out)).toMatchObject({ ok: false, code: 'ERR_KNOWLEDGE_ENTRY_EXISTS' })
    expect(invocations[0]?.verb).toBe('knowledge_lesson')
    expect(invocations[0]?.actor).toBe('session:s-42')
    expect(invocations[0]?.args).toMatchObject({ action: 'add', name: 'x' })
  })

  it('transport failure throws ERR_TOOL_BRIDGE_UNAVAILABLE after the in-bridge retry (AC-3, 禁静默)', async () => {
    const { call } = callSeam(() => ({
      ok: false,
      code: 'ERR_TOOL_BRIDGE_UNAVAILABLE',
      message: 'forge tool bridge knowledge_fact: no renderer bridge stream attached within the 1000ms connect grace (renderer bridge unavailable; Story 9 degradation)',
    }))
    const registry = toolsOf({ call })

    await expect(runTool(registry, 'forge_fact', { projectId: 'p-1', action: 'summary' }))
      .rejects.toThrow('ERR_TOOL_BRIDGE_UNAVAILABLE')
    await expect(runTool(registry, 'forge_forensic', { action: 'search', keyword: 'k' }))
      .rejects.toThrow('ERR_TOOL_BRIDGE_UNAVAILABLE')
    await expect(runTool(registry, 'forge_feature_list', { projectId: 'p-1' }))
      .rejects.toThrow('ERR_TOOL_BRIDGE_UNAVAILABLE')
  })

  it('out-of-bound names are rejected BEFORE any bridge hop (T1 mirror; no frame emitted)', async () => {
    const { call, invocations } = callSeam({ ok: true, value: {} })
    const registry = toolsOf({ call })

    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['forge_lesson', { projectId: 'p-1', action: 'add', name: '../escape', body: 'b' }, 'ERR_KNOWLEDGE_PATH_INVALID'],
      ['forge_lesson', { projectId: 'p-1', action: 'add', name: 'a/b', body: 'b' }, 'ERR_KNOWLEDGE_PATH_INVALID'],
      ['forge_research', { projectId: 'p-1', action: 'add', slug: '..\\evil', body: 'b' }, 'ERR_KNOWLEDGE_PATH_INVALID'],
      ['forge_feature_status', { projectId: 'p-1', featureSlug: 'a/b' }, 'ERR_KNOWLEDGE_PATH_INVALID'],
      ['forge_fact', { projectId: 'p-1', action: 'get' }, 'ERR_KNOWLEDGE_INPUT_INVALID'],
      ['forge_fact', { projectId: 'p-1', action: 'add', entry: { subject: 's', kind: 'nonsense', value: 1 } }, 'ERR_KNOWLEDGE_INPUT_INVALID'],
      ['forge_fact', { projectId: 'p-1', action: 'add', entry: { subject: '', kind: 'signature', value: 1 } }, 'ERR_KNOWLEDGE_INPUT_INVALID'],
      ['forge_lesson', { projectId: 'p-1', action: 'add', name: 'ok', body: '   ' }, 'ERR_KNOWLEDGE_INPUT_INVALID'],
      ['forge_forensic', { action: 'extract' }, 'ERR_KNOWLEDGE_INPUT_INVALID'],
      ['forge_forensic', { action: 'subagents' }, 'ERR_KNOWLEDGE_INPUT_INVALID'],
    ]
    for (const [name, args, code] of cases) {
      const out = await runTool(registry, name, args)
      expect(JSON.parse(out)).toMatchObject({ ok: false, code })
    }
    expect(invocations).toHaveLength(0) // 桥前拒绝:零帧发出
  })

  it('feature read main paths bridge to the feature verbs', async () => {
    const features = [{ slug: 'alpha', status: 'tasks', completed: 1, total: 3 }]
    const { call, invocations } = callSeam(_verb => ({ ok: true, value: features }))
    const registry = toolsOf({ call })

    const list = await runTool(registry, 'forge_feature_list', { projectId: 'p-1' })
    expect(JSON.parse(list)).toEqual({ ok: true, result: features })
    const status = await runTool(registry, 'forge_feature_status', { projectId: 'p-1', featureSlug: 'alpha' })
    expect(JSON.parse(status)).toEqual({ ok: true, result: features })

    expect(invocations.map(entry => entry.verb)).toEqual(['feature_list', 'feature_status'])
    expect(invocations[1]?.args).toEqual({ projectId: 'p-1', featureSlug: 'alpha' })
  })

  it('audit discipline: a missing session identity fails closed before the bridge', async () => {
    const { call, invocations } = callSeam({ ok: true, value: {} })
    const registry = toolsOf({ call })
    await expect(runTool(registry, 'forge_fact', { projectId: 'p-1', action: 'summary' }, execOf()))
      .rejects.toThrow('audit discipline')
    expect(invocations).toHaveLength(0)
    expect(actorOf(execOf({ session: { id: 'abc' } }) as never)).toBe('session:abc')
  })
})

// ---------------------------------------------------------------------------
// Client dispatch legs (T4 closed switch over the extended verb set)
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

describe('tool bridge client dispatch: knowledge + feature verbs (T4 closed set)', () => {
  it('routes each knowledge/feature frame onto its whitelist IPC member', async () => {
    const { bridge, calls } = stubBridge()
    const frame = (verb: ForgeToolBridgeVerb, args: Record<string, unknown>, actor = 'session:s-1') => ({
      callId: `c-${String(calls.length)}`, verb, args, actor,
    })

    await dispatchToolBridgeCall(bridge, frame('knowledge_fact', { projectId: 'p-1', action: 'list' }))
    await dispatchToolBridgeCall(bridge, frame('knowledge_lesson', { projectId: 'p-1', action: 'get', name: 'x' }))
    await dispatchToolBridgeCall(bridge, frame('knowledge_research', { projectId: 'p-1', action: 'add', slug: 's', body: 'b' }))
    await dispatchToolBridgeCall(bridge, frame('knowledge_forensic', { action: 'search', keyword: 'k' }))
    await dispatchToolBridgeCall(bridge, frame('feature_list', { projectId: 'p-1' }))
    await dispatchToolBridgeCall(bridge, frame('feature_status', { projectId: 'p-1', featureSlug: 'alpha' }))

    expect(calls.map(entry => entry.member)).toEqual([
      'knowledgeFact', 'knowledgeLesson', 'knowledgeResearch', 'knowledgeForensic', 'featureList', 'featureStatus',
    ])
    // 知识系/feature IPC 面不携带 actor 参数(forge 文件数据面无作者槽,审计随帧不留内核)。
    for (const entry of calls) {
      expect(entry.args).toHaveLength(1)
    }
    expect(calls[5]?.args[0]).toEqual({ projectId: 'p-1', featureSlug: 'alpha' })
  })

  it('folds IPC rejections into the envelope answer (business codes ride back to the host)', async () => {
    const { bridge } = stubBridge({ knowledgeFact: new Error('Error invoking remote method \'dsh-forge:workbench-knowledge-fact\': WorkbenchIpcError: {"code":"ERR_PROJECT_NOT_FOUND","message":"project nope does not exist"}') })
    const answer = await dispatchToolBridgeCall(bridge, {
      callId: 'c-1', verb: 'knowledge_fact', args: { projectId: 'nope', action: 'list' }, actor: 'session:s-1',
    })
    expect(answer).toMatchObject({ callId: 'c-1', ok: false, code: 'ERR_PROJECT_NOT_FOUND' })
  })
})
