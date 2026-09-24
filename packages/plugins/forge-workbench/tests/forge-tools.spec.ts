// Task 2.1 unit legs — the forge task tool family (AC-2 registration contract
// + tool-face semantics) and the host registration assembly:
//
//   AC-2 注册契约 — the eight flat-name tools (spike-1 §1.2: dot names are
//                   provider-rejected; underscore flat names are the landed
//                   form) register through a stub `tools` registry with
//                   strictly-typed parameter schemas (typed fields, enum'd
//                   status vocabulary) and declared output schemas; the
//                   taskKey board-address gate rejects invalid shapes BEFORE
//                   any bridge hop (T1: tool-face mirror, kernel re-validates).
//   AC-1/3/4 semantics through the real tool bodies — execute() threads the
//                   actor (`session:<id>`) from the exec context, returns
//                   kernel values / business rejections as canonical JSON
//                   values, and THROWS only for the bridge transport
//                   degradation (禁静默; spike-1 §3.3).
//
// The tool bodies are decorator-free (defineTool is a plain factory), so the
// whole family imports straight from src; the @Remote rpc shell has its own
// legs in host-half.spec.ts (decorator lowering through the tsc build).

import { describe, expect, it, vi } from 'vitest'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import {
  actorOf, createForgeTaskTools,
  TOOL_OUTPUT_SCHEMA, type ForgeTaskToolCallFn,
} from '../src/host/forge-tools/task-tools.ts'
import { isBoardTaskKeyAddress, type BridgeOutcome, type ForgeToolBridgeVerb } from '../src/host/forge-tools/bridge-core.ts'

/** The eight registered task-tool names, spike-1 flat form. */
const EXPECTED_TOOL_NAMES = [
  'forge_task_add', 'forge_task_claim', 'forge_task_transition', 'forge_task_submit',
  'forge_task_reopen', 'forge_task_get', 'forge_task_query', 'forge_task_list',
] as const

/**
 * The full registerForgeTools assembly: the 2.1 task family plus the 2.2
 * knowledge (D4) and feature-read families and the 3.1 pref family appended
 * on the same base.
 */
const ASSEMBLY_TOOL_NAMES = [
  ...EXPECTED_TOOL_NAMES,
  'forge_fact', 'forge_lesson', 'forge_research', 'forge_forensic',
  'forge_feature_list', 'forge_feature_status',
  'forge_pref_get',
  'forge_stage_summarize',
] as const

/** Minimal exec-context face the tool bodies read (spike-1 §1.1 exec 契约). */
function execOf(agent?: { id?: string; session?: { id?: string } }): Record<string, unknown> {
  return { callId: 'call-1', signal: new AbortController().signal, ...(agent === undefined ? {} : { agent }) }
}

/** Run one tool's execute through the defineTool-validated args path. */
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
function callSeam(result: BridgeOutcome | ((verb: ForgeToolBridgeVerb, args: Record<string, unknown>, actor: string) => BridgeOutcome)): {
  call: ForgeTaskToolCallFn
  invocations: Array<{ verb: ForgeToolBridgeVerb; args: Record<string, unknown>; actor: string }>
} {
  const invocations: Array<{ verb: ForgeToolBridgeVerb; args: Record<string, unknown>; actor: string }> = []
  const call: ForgeTaskToolCallFn = async (verb, args, actor) => {
    invocations.push({ verb, args, actor })
    return typeof result === 'function' ? result(verb, args, actor) : result
  }
  return { call, invocations }
}

function toolsOf(call: ForgeTaskToolCallFn): Map<string, ToolDefinition> {
  const registry = new Map<string, ToolDefinition>()
  for (const tool of createForgeTaskTools({ call })) registry.set(tool.name, tool)
  return registry
}

describe('forge task tools: registration contract (AC-2)', () => {
  it('registers exactly the eight flat-name tools with declared output schemas', () => {
    const { call } = callSeam({ ok: true, value: {} })
    const registry = toolsOf(call)
    expect([...registry.keys()].sort()).toEqual([...EXPECTED_TOOL_NAMES].sort())
    for (const tool of registry.values()) {
      // spike-1 §1.1: output declaration is mandatory at register time.
      expect(tool.output).toBeDefined()
      expect(tool.output.schema).toEqual(TOOL_OUTPUT_SCHEMA)
      expect(typeof tool.execute).toBe('function')
      expect(tool.description.length).toBeGreaterThan(0)
    }
  })

  it('declares strictly-typed parameter schemas: required ids, enum status vocabulary', () => {
    const { call } = callSeam({ ok: true, value: {} })
    const registry = toolsOf(call)
    // ToolDefinition.parameters = the COMPILED implicit open-object JSON Schema
    // (defineTool's projection of the per-property specs; spike-1 §1.1 契约)。
    const add = registry.get('forge_task_add')?.parameters as {
      properties: Record<string, { type: string; enum?: string[]; items?: { type: string } }>
      required: string[]
    }
    expect(add.properties.projectId).toMatchObject({ type: 'string' })
    expect(add.properties.featureSlug).toMatchObject({ type: 'string' })
    expect(add.properties.title).toMatchObject({ type: 'string' })
    expect(add.required).toEqual(['projectId', 'featureSlug', 'title'])
    expect(add.properties.taskKey.type).toBe('string')
    expect(add.required).not.toContain('taskKey')
    expect(add.properties.blockers).toMatchObject({ type: 'array', items: { type: 'string' } })

    const transition = registry.get('forge_task_transition')?.parameters as {
      properties: Record<string, { type: string; enum?: string[] }>
      required: string[]
    }
    expect(transition.properties.to).toMatchObject({
      type: 'string',
      enum: ['pending', 'in_progress', 'completed', 'blocked', 'suspended', 'skipped', 'rejected'],
    })
    expect(transition.required).toContain('to')

    const query = registry.get('forge_task_query')?.parameters as {
      properties: Record<string, { type: string; enum?: string[] }>
      required: string[]
    }
    expect(query.properties.projectId.type).toBe('string')
    expect(query.required).toEqual(['projectId'])
    expect(query.properties.status.enum).toHaveLength(7)
  })

  it('defineTool validation rejects arguments outside the declared schema (T1 strict types)', async () => {
    const { call } = callSeam({ ok: true, value: {} })
    const registry = toolsOf(call)
    await expect(runTool(registry, 'forge_task_claim', { projectId: 'p1', taskKey: 42 }))
      .rejects.toThrow(/invalid arguments/i)
    await expect(runTool(registry, 'forge_task_transition', { projectId: 'p1', taskKey: 'feat/1.3', to: 'done' }))
      .rejects.toThrow(/invalid arguments/i)
    await expect(runTool(registry, 'forge_task_get', { taskKey: 'feat/1.3' }))
      .rejects.toThrow(/invalid arguments/i)
  })
})

describe('forge task tools: tool-face taskKey gate (AC-2)', () => {
  it('rejects malformed taskKey shapes at the tool face without any bridge hop', async () => {
    const { call, invocations } = callSeam({ ok: true, value: {} })
    const registry = toolsOf(call)

    const result = JSON.parse(await runTool(registry, 'forge_task_claim', { projectId: 'p1', taskKey: '1.3' })) as {
      ok: boolean
      code?: string
    }
    expect(result.ok).toBe(false)
    expect(result.code).toBe('ERR_TASK_KEY_INVALID')
    expect(invocations).toHaveLength(0)
  })

  it('accepts phase keys like 5.gate as the localId segment (M2-proven dialect)', async () => {
    const { call, invocations } = callSeam({ ok: true, value: {} })
    const registry = toolsOf(call)
    const result = JSON.parse(await runTool(registry, 'forge_task_claim', { projectId: 'p1', taskKey: 'feat/5.gate' })) as { ok: boolean }
    expect(result.ok).toBe(true)
    expect(invocations[0]?.args).toEqual({ projectId: 'p1', taskKey: 'feat/5.gate' })
  })

  it('isBoardTaskKeyAddress mirrors the kernel board-address rule', () => {
    expect(isBoardTaskKeyAddress('feat/1.3')).toBe(true)
    expect(isBoardTaskKeyAddress('1.3')).toBe(false)
    expect(isBoardTaskKeyAddress('feat/1.3/x')).toBe(false)
  })
})

describe('forge task tools: actor derivation + result semantics (AC-1/AC-3/AC-4)', () => {
  it('threads the exec agent identity as session:<id> into every write call', async () => {
    const { call, invocations } = callSeam({ ok: true, value: { key: 'feat/1.3' } })
    const registry = toolsOf(call)
    await runTool(registry, 'forge_task_claim', { projectId: 'p1', taskKey: 'feat/1.3' }, execOf({ session: { id: 's-7' } }))
    await runTool(registry, 'forge_task_submit', { projectId: 'p1', taskKey: 'feat/1.3' }, execOf({ id: 's-8' }))
    expect(invocations.map(entry => entry.actor)).toEqual(['session:s-7', 'session:s-8'])
  })

  it('fails closed when the tool call carries no agent identity (audit discipline)', async () => {
    const { call } = callSeam({ ok: true, value: {} })
    const registry = toolsOf(call)
    await expect(runTool(registry, 'forge_task_claim', { projectId: 'p1', taskKey: 'feat/1.3' }, execOf(undefined)))
      .rejects.toThrow(/no agent session identity/i)
  })

  it('returns kernel values as canonical ok:true JSON and business rejections as ok:false envelopes', async () => {
    const summary = { key: 'feat/1.3', status: 'completed' }
    const { call } = callSeam(verb => verb === 'task_submit'
      ? { ok: true, value: summary }
      : { ok: false, code: 'ERR_TASK_NOT_AUTHORITATIVE', message: 'use the forge CLI' })
    const registry = toolsOf(call)

    expect(JSON.parse(await runTool(registry, 'forge_task_submit', { projectId: 'p1', taskKey: 'feat/1.3' })))
      .toEqual({ ok: true, result: summary })
    expect(JSON.parse(await runTool(registry, 'forge_task_claim', { projectId: 'p1', taskKey: 'feat/1.3' })))
      .toEqual({ ok: false, code: 'ERR_TASK_NOT_AUTHORITATIVE', message: 'use the forge CLI' })
  })

  it('throws the transport degradation explicitly — never a silent value (AC-4 禁静默)', async () => {
    const { call } = callSeam({ ok: false, code: 'ERR_TOOL_BRIDGE_UNAVAILABLE', message: 'renderer bridge unavailable' })
    const registry = toolsOf(call)
    await expect(runTool(registry, 'forge_task_get', { projectId: 'p1', taskKey: 'feat/1.3' }))
      .rejects.toThrow('ERR_TOOL_BRIDGE_UNAVAILABLE')
  })

  it('maps task_list onto the unfiltered query verb and drops the actor for reads', async () => {
    const { call, invocations } = callSeam({ ok: true, value: [] })
    const registry = toolsOf(call)
    await runTool(registry, 'forge_task_list', { projectId: 'p1' })
    await runTool(registry, 'forge_task_query', { projectId: 'p1', status: 'blocked' })
    expect(invocations.map(entry => entry.verb)).toEqual(['task_list', 'task_query'])
    expect(invocations[0]?.args).toEqual({ projectId: 'p1' })
    expect(invocations[1]?.args).toEqual({ projectId: 'p1', status: 'blocked' })
    expect(invocations.every(entry => entry.actor === 'session:s-42')).toBe(true)
  })

  it('forwards transition (with optional reason) and reopen through their verbs', async () => {
    const { call, invocations } = callSeam({ ok: true, value: {} })
    const registry = toolsOf(call)
    await runTool(registry, 'forge_task_transition', { projectId: 'p1', taskKey: 'feat/1.3', to: 'blocked', reason: 'waiting' })
    await runTool(registry, 'forge_task_transition', { projectId: 'p1', taskKey: 'feat/1.3', to: 'skipped' })
    await runTool(registry, 'forge_task_reopen', { projectId: 'p1', taskKey: 'feat/1.3' })
    expect(invocations).toEqual([
      { verb: 'task_transition', args: { projectId: 'p1', taskKey: 'feat/1.3', to: 'blocked', reason: 'waiting' }, actor: 'session:s-42' },
      { verb: 'task_transition', args: { projectId: 'p1', taskKey: 'feat/1.3', to: 'skipped' }, actor: 'session:s-42' },
      { verb: 'task_reopen', args: { projectId: 'p1', taskKey: 'feat/1.3' }, actor: 'session:s-42' },
    ])
  })

  it('rejects a malformed add payload (featureSlug segment / blocker segment / explicit taskKey) at the tool face', async () => {
    const { call, invocations } = callSeam({ ok: true, value: {} })
    const registry = toolsOf(call)
    const slug = JSON.parse(await runTool(registry, 'forge_task_add', { projectId: 'p1', featureSlug: 'feat/x', title: 'T' })) as { ok: boolean; code?: string }
    expect(slug).toMatchObject({ ok: false, code: 'ERR_TASK_KEY_INVALID' })
    const blocker = JSON.parse(await runTool(registry, 'forge_task_add', { projectId: 'p1', featureSlug: 'feat', title: 'T', blockers: ['up/stream'] })) as { ok: boolean; code?: string }
    expect(blocker).toMatchObject({ ok: false, code: 'ERR_TASK_KEY_INVALID' })
    const key = JSON.parse(await runTool(registry, 'forge_task_add', { projectId: 'p1', featureSlug: 'feat', title: 'T', taskKey: 'other/1.1' })) as { ok: boolean }
    // 'other/1.1' IS a valid board-address SHAPE — the featureSlug-prefix
    // consistency invariant is kernel-owned (task-service ERR_TASK_KEY_INVALID),
    // so the tool face forwards it and the kernel rejects semantics.
    expect(key.ok).toBe(true)
    expect(invocations).toHaveLength(1)
    expect(invocations[0]?.args).toEqual({ projectId: 'p1', featureSlug: 'feat', title: 'T', taskKey: 'other/1.1' })
  })
})

describe('forge task tools: actorOf identity precedence', () => {
  it('prefers agent.session.id and falls back to agent.id (both are the SessionId)', () => {
    expect(actorOf(execOf({ session: { id: 's-a' }, id: 's-b' }) as never)).toBe('session:s-a')
    expect(actorOf(execOf({ id: 's-b' }) as never)).toBe('session:s-b')
  })

  it('rejects non-string/empty identities rather than misattributing the audit', () => {
    expect(() => actorOf(execOf({}) as never)).toThrow(/no agent session identity/i)
    expect(() => actorOf(execOf({ id: '' }) as never)).toThrow(/no agent session identity/i)
    expect(() => actorOf(execOf(undefined) as never)).toThrow(/no agent session identity/i)
  })
})

describe('registerForgeTools assembly (host half)', () => {
  it('registers the tool family through the tools service and stays silent without it', async () => {
    vi.resetModules()
    // The registration face transitively imports the @Remote-decorated service
    // class, so this leg loads through the tsc-lowered build output (the
    // suite's established decorator prereq; forge-bridge.spec precedent).
    const { registerForgeTools } = await import('../lib/types/host/forge-tools/index.js')
    const registered: string[] = []
    const fiberDispose = vi.fn()
    const provide = vi.fn()
    const ctx = {
      reflect: { provide },
      inject: (names: string[], body: (ctx: unknown) => void) => {
        expect(names).toEqual(['tools'])
        body({ tools: { register: (tool: ToolDefinition): (() => void) => {
          registered.push(tool.name)
          return () => registered.splice(registered.indexOf(tool.name), 1)
        } } })
        return { dispose: fiberDispose }
      },
    }
    const assembly = registerForgeTools(ctx as never)
    expect(registered.sort()).toEqual([...ASSEMBLY_TOOL_NAMES].sort())
    // The bridge rpc service self-registers under the forgeToolBridge key.
    expect(provide).toHaveBeenCalledTimes(1)
    expect(provide.mock.calls[0]?.[0]).toBe('forgeToolBridge')
    assembly.dispose()
    expect(registered).toHaveLength(0)
    expect(fiberDispose).toHaveBeenCalled()

    // No inject surface (minimal context): the registration degrades to a no-op.
    const bare = registerForgeTools({ reflect: { provide: vi.fn() } } as never)
    expect(() => bare.dispose()).not.toThrow()
  })
})
