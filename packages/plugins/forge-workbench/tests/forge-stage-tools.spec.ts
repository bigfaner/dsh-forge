// Task 4.1 unit legs — the stage tool family (forge_stage_summarize,
// tech-design §Interface 2「forge.stage.summarize」) and its client-bridge
// dispatch:
//
//   AC-1 注册契约 — the single flat-name tool registers through a stub
//                   registry with strictly-typed parameters (projectId /
//                   featureSlug / stage enum'd by the pipeline vocabulary /
//                   goal / summary) and the canonical string output schema.
//   AC-2 门联动    — the tool result carries the write-back gate verdict
//                   (kernel value passthrough); slug/vocab guards reject
//                   malformed input BEFORE any bridge hop (T1 mirror of the
//                   kernel ERR_STAGE_ASSET_INVALID gate).
//   AC-3 降级链    — a bridge transport failure THROWS
//                   ERR_TOOL_BRIDGE_UNAVAILABLE into the session (Story 9
//                   禁静默;same executor semantics as every family); business
//                   rejections fold into the value form.
//   dispatch legs — the client half maps stage_summarize frames onto the
//                   stageSummarize IPC member in the closed switch (T4);
//                   write frames still ride the actor-bearing call while the
//                   IPC face itself carries no author slot (asset files have
//                   none — knowledge-family precedent).

import { describe, expect, it } from 'vitest'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { createForgeStageTools, type ForgeStageToolDeps } from '../src/host/forge-tools/stage.ts'
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
  const tool = tools.get('forge_stage_summarize')
  if (tool === undefined) throw new Error('tool forge_stage_summarize not registered')
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

function toolsOf(deps: ForgeStageToolDeps): Map<string, ToolDefinition> {
  const registry = new Map<string, ToolDefinition>()
  for (const tool of createForgeStageTools(deps)) registry.set(tool.name, tool)
  return registry
}

describe('forge_stage_summarize: registration contract (AC-1)', () => {
  it('registers the single flat-name tool with a typed parameter schema (stage enum = pipeline vocabulary)', () => {
    const { call } = callSeam({ ok: true, value: {} })
    const registry = toolsOf({ call })
    expect([...registry.keys()]).toEqual(['forge_stage_summarize'])
    const tool = registry.get('forge_stage_summarize') as ToolDefinition
    expect(tool.output.schema).toEqual({ type: 'string' })
    expect(typeof tool.execute).toBe('function')
    expect(tool.description).toContain('stages/<stage>.md')

    const parameters = tool.parameters as {
      properties: Record<string, { type: string; enum?: string[] }>
      required: string[]
    }
    expect(parameters.required).toEqual(['projectId', 'featureSlug', 'stage', 'goal', 'summary'])
    expect(parameters.properties.stage).toMatchObject({
      type: 'string',
      enum: ['prd', 'design', 'tasks', 'in-progress', 'completed'],
    })
  })

  it('threads the session actor into the bridge frame and returns the kernel write result', async () => {
    const value = { stage: 'design', path: 'alpha/stages/design.md', generatedAt: '2026-09-24T00:00:00.000Z', featureStage: 'design', gateOpen: true }
    const { call, invocations } = callSeam({ ok: true, value })
    const registry = toolsOf({ call })
    const result = JSON.parse(await runTool(registry, {
      projectId: 'p-1', featureSlug: 'alpha', stage: 'design', goal: 'g', summary: 's',
    })) as { ok: boolean; result: typeof value }
    expect(result.ok).toBe(true)
    expect(result.result.gateOpen).toBe(true)
    expect(invocations).toEqual([{
      verb: 'stage_summarize',
      args: { projectId: 'p-1', featureSlug: 'alpha', stage: 'design', goal: 'g', summary: 's' },
      actor: 'session:s-42',
    }])
  })
})

describe('forge_stage_summarize: guards + degradation (AC-2/AC-3)', () => {
  it('rejects malformed slugs and out-of-vocabulary stages before the bridge (T1 mirror)', async () => {
    const { call, invocations } = callSeam({ ok: true, value: {} })
    const registry = toolsOf({ call })
    // slug 段形态(schema 只约束 type:string)→ 工具体白名单拒绝 = 业务载荷。
    for (const args of [
      { projectId: 'p-1', featureSlug: 'a/b', stage: 'design', goal: 'g', summary: 's' },
      { projectId: 'p-1', featureSlug: '', stage: 'design', goal: 'g', summary: 's' },
    ]) {
      const rejected = JSON.parse(await runTool(registry, args)) as { ok: boolean; code: string }
      expect(rejected).toMatchObject({ ok: false, code: 'ERR_STAGE_ASSET_INVALID' })
    }
    // 阶段词表:编译 schema 的 enum 校验先于工具体(参数面拒绝,仍零桥跳)。
    await expect(runTool(registry, { projectId: 'p-1', featureSlug: 'alpha', stage: 'shipped', goal: 'g', summary: 's' }))
      .rejects.toThrow(/"stage" must be one of/)
    expect(invocations).toHaveLength(0) // 零桥跳
  })

  it('folds business rejections into the value form and throws transport failures (Story 9)', async () => {
    const rejected = callSeam({ ok: false, code: 'ERR_STAGE_GATE_UNSATISFIED', message: 'gate unsatisfied', detail: 'write stages/design.md first' })
    const payload = JSON.parse(await runTool(toolsOf({ call: rejected.call }), {
      projectId: 'p-1', featureSlug: 'alpha', stage: 'design', goal: 'g', summary: 's',
    })) as { ok: boolean; code: string; detail?: string }
    expect(payload).toMatchObject({ ok: false, code: 'ERR_STAGE_GATE_UNSATISFIED' })
    expect(payload.detail).toContain('stages/design.md')

    const transport = callSeam({ ok: false, code: 'ERR_TOOL_BRIDGE_UNAVAILABLE', message: 'bridge down' })
    await expect(runTool(toolsOf({ call: transport.call }), {
      projectId: 'p-1', featureSlug: 'alpha', stage: 'design', goal: 'g', summary: 's',
    })).rejects.toThrow('ERR_TOOL_BRIDGE_UNAVAILABLE')
  })
})

// ---------------------------------------------------------------------------
// Client dispatch legs (T4 closed switch: stage_summarize → stageSummarize)
// ---------------------------------------------------------------------------

/** Minimal stub bridge recording member calls (forge-pref-tools.spec 同款形态). */
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

describe('tool bridge client dispatch: stage_summarize mapping (T4)', () => {
  const frame = (args: Record<string, unknown>) => ({
    callId: 'c-1', verb: 'stage_summarize' as const, args, actor: 'session:s-1',
  })

  it('maps the frame onto the stageSummarize member with the write payload', async () => {
    const { bridge, calls } = stubBridge()
    const answer = await dispatchToolBridgeCall(bridge, frame({
      projectId: 'p-1', featureSlug: 'alpha', stage: 'design', goal: 'g', summary: 's',
    }))
    expect(answer).toMatchObject({ callId: 'c-1', ok: true })
    expect(calls).toEqual([{
      member: 'stageSummarize',
      args: [{ projectId: 'p-1', featureSlug: 'alpha', stage: 'design', goal: 'g', summary: 's' }],
    }])
  })

  it('folds kernel gate rejections into the envelope answer (business codes ride back to the host)', async () => {
    const { bridge } = stubBridge({
      stageSummarize: new Error('Error invoking remote method \'dsh-forge:workbench-stage-summarize\': WorkbenchIpcError: {"code":"ERR_STAGE_GATE_UNSATISFIED","message":"stage gate unsatisfied"}'),
    })
    const answer = await dispatchToolBridgeCall(bridge, frame({
      projectId: 'p-1', featureSlug: 'alpha', stage: 'design', goal: 'g', summary: 's',
    }))
    expect(answer).toMatchObject({ callId: 'c-1', ok: false, code: 'ERR_STAGE_GATE_UNSATISFIED' })
  })
})
