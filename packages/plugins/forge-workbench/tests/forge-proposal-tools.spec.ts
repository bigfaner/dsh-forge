// Task 5.3 unit legs — the proposal tool family (forge_proposal_list /
// forge_proposal_show, tech-design §Interface 2「forge.proposal.list / show」)
// and its client-bridge dispatch:
//
//   AC-4 注册契约 — the two flat-name read-only tools register through a stub
//                   registry (spike-① underscore naming) with typed
//                   parameters and the canonical string output schema; the
//                   family carries ZERO write verbs (只读硬约束 structural).
//   桥前断言      — slug segment shape and the kind vocabulary reject BEFORE
//                   any bridge hop (T1 mirror of the kernel
//                   ERR_PROPOSAL_PATH_INVALID gate).
//   结果语义      — kernel values fold into the canonical JSON value form;
//                   a bridge transport failure THROWS
//                   ERR_TOOL_BRIDGE_UNAVAILABLE into the session (Story 9
//                   禁静默;same executor semantics as every family).
//   dispatch legs — the client half maps proposal_list/proposal_show onto
//                   the getProposalBoard/readProposalDoc IPC members in the
//                   closed switch (T4), kind defaulting to 'proposal'.

import { describe, expect, it } from 'vitest'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { createForgeProposalTools, type ForgeProposalToolDeps } from '../src/host/forge-tools/proposal.ts'
import type { ForgeTaskToolCallFn } from '../src/host/forge-tools/task-tools.ts'
import type { BridgeOutcome, ForgeToolBridgeVerb } from '../src/host/forge-tools/bridge-core.ts'
import { dispatchToolBridgeCall } from '../src/client/ipc/tool-bridge.ts'
import type { WorkbenchIpcBridge } from '../src/client/ipc/workbench.ts'

function execOf(agent?: { id?: string; session?: { id?: string } }): Record<string, unknown> {
  return { callId: 'call-1', signal: new AbortController().signal, ...(agent === undefined ? {} : { agent }) }
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

function toolsOf(deps: ForgeProposalToolDeps): Map<string, ToolDefinition> {
  const registry = new Map<string, ToolDefinition>()
  for (const tool of createForgeProposalTools(deps)) registry.set(tool.name, tool)
  return registry
}

describe('forge_proposal_list / forge_proposal_show: registration contract (AC-4)', () => {
  it('registers exactly the two flat-name read-only tools with typed parameters', () => {
    const { call } = callSeam({ ok: true, value: { proposals: [], generatedAt: 't', proposalsRoot: 'r' } })
    const registry = toolsOf({ call })
    expect([...registry.keys()].sort()).toEqual(['forge_proposal_list', 'forge_proposal_show'])
    const list = registry.get('forge_proposal_list') as ToolDefinition
    expect(list.output.schema).toEqual({ type: 'string' })
    const listParams = list.parameters as { properties: Record<string, { type?: string }>; required?: string[] }
    expect(listParams.properties.projectId).toMatchObject({ type: 'string' })
    expect(listParams.required).toContain('projectId')
    const show = registry.get('forge_proposal_show') as ToolDefinition
    const showParams = show.parameters as { properties: Record<string, { type?: string }>; required?: string[] }
    expect(showParams.properties.projectId).toMatchObject({ type: 'string' })
    expect(showParams.properties.slug).toMatchObject({ type: 'string' })
    expect(showParams.properties.kind).toMatchObject({ type: 'string' }) // 可选 kind
    expect(showParams.required).toContain('projectId')
    expect(showParams.required).toContain('slug')
    expect(showParams.required).not.toContain('kind')
  })

  it('threads the session actor into the bridge frame and returns kernel board values', async () => {
    const board = {
      proposals: [{ slug: 'dsh-forge-m3', status: 'draft', author: 'faner', created: '2026-09-22', featureSlug: 'dsh-forge-m3', hasEval: false, updatedAt: 't' }],
      generatedAt: '2026-09-24T08:00:00.000Z',
      proposalsRoot: 'Z:/root/docs/proposals',
    }
    const { call, invocations } = callSeam({ ok: true, value: board })
    const registry = toolsOf({ call })
    const result = JSON.parse(await (registry.get('forge_proposal_list') as ToolDefinition)
      .execute({ projectId: 'p-1' }, execOf({ id: 's-42' }) as never) as string) as {
      ok: boolean
      result: typeof board
    }
    expect(result.ok).toBe(true)
    expect(result.result.proposals[0]?.slug).toBe('dsh-forge-m3')
    expect(invocations).toEqual([{ verb: 'proposal_list', args: { projectId: 'p-1' }, actor: 'session:s-42' }])
  })
})

describe('forge_proposal_show: pre-bridge guards and kind routing', () => {
  it('rejects slug segment-shape violations before the bridge (T1 mirror)', async () => {
    const { call, invocations } = callSeam({ ok: true, value: { kind: 'proposal', markdown: '' } })
    const registry = toolsOf({ call })
    for (const slug of ['a/b', 'bad\\slug', '']) {
      const bad = JSON.parse(await (registry.get('forge_proposal_show') as ToolDefinition)
        .execute({ projectId: 'p-1', slug }, execOf() as never) as string) as { ok: boolean; code: string }
      expect(bad).toMatchObject({ ok: false, code: 'ERR_PROPOSAL_PATH_INVALID' })
    }
    expect(invocations).toHaveLength(0) // 零桥跳
  })

  it('rejects out-of-vocabulary kinds before the bridge and defaults to proposal', async () => {
    const { call, invocations } = callSeam({ ok: true, value: { kind: 'proposal', markdown: '# p\n' } })
    const registry = toolsOf({ call })
    const show = registry.get('forge_proposal_show') as ToolDefinition

    const bad = JSON.parse(await show.execute({ projectId: 'p-1', slug: 'alpha', kind: 'summary' }, execOf() as never) as string) as { ok: boolean; code: string }
    expect(bad).toMatchObject({ ok: false, code: 'ERR_PROPOSAL_DOC_INVALID' })

    // 缺省 kind = proposal;显式 eval 透传。
    await show.execute({ projectId: 'p-1', slug: 'alpha' }, execOf({ id: 's-1' }) as never)
    await show.execute({ projectId: 'p-1', slug: 'alpha', kind: 'eval' }, execOf({ id: 's-1' }) as never)
    expect(invocations.map(entry => entry.args.kind)).toEqual(['proposal', 'eval'])
  })

  it('folds business rejections into the value form and throws transport failures (Story 9)', async () => {
    const { call } = callSeam({ ok: false, code: 'ERR_PROPOSAL_NOT_FOUND', message: 'proposal ghost has no eval report' })
    const registry = toolsOf({ call })
    const rejection = JSON.parse(await (registry.get('forge_proposal_show') as ToolDefinition)
      .execute({ projectId: 'p-1', slug: 'ghost', kind: 'eval' }, execOf({ id: 's-1' }) as never) as string) as { ok: boolean; code: string }
    expect(rejection).toMatchObject({ ok: false, code: 'ERR_PROPOSAL_NOT_FOUND' })

    const transport = callSeam({ ok: false, code: 'ERR_TOOL_BRIDGE_UNAVAILABLE', message: 'no stream' })
    const failing = toolsOf({ call: transport.call })
    await expect((failing.get('forge_proposal_list') as ToolDefinition)
      .execute({ projectId: 'p-1' }, execOf({ id: 's-1' }) as never)).rejects.toThrowError(/ERR_TOOL_BRIDGE_UNAVAILABLE/)
  })
})

describe('client dispatch: proposal_list / proposal_show legs (T4 closed switch)', () => {
  function bridgeSpy(): { bridge: WorkbenchIpcBridge; calls: string[] } {
    const calls: string[] = []
    const bridge = {
      getProposalBoard: async (projectId: string) => {
        calls.push(`board:${projectId}`)
        return { proposals: [], generatedAt: 't', proposalsRoot: 'r' }
      },
      readProposalDoc: async (input: { projectId: string; slug: string; kind: 'proposal' | 'eval' }) => {
        calls.push(`doc:${input.slug}:${input.kind}`)
        return { kind: input.kind, markdown: '# body' }
      },
    } as unknown as WorkbenchIpcBridge
    return { bridge, calls }
  }

  it('maps the frames onto the read verbs with the kind default', async () => {
    const { bridge, calls } = bridgeSpy()
    const board = await dispatchToolBridgeCall(bridge, { callId: 'c-1', verb: 'proposal_list', args: { projectId: 'p-1' }, actor: 'session:s-1' })
    expect(board).toMatchObject({ callId: 'c-1', ok: true })

    const doc = await dispatchToolBridgeCall(bridge, { callId: 'c-2', verb: 'proposal_show', args: { projectId: 'p-1', slug: 'alpha' }, actor: 'session:s-1' })
    expect(doc).toMatchObject({ callId: 'c-2', ok: true })
    const evalDoc = await dispatchToolBridgeCall(bridge, { callId: 'c-3', verb: 'proposal_show', args: { projectId: 'p-1', slug: 'alpha', kind: 'eval' }, actor: 'session:s-1' })
    expect((evalDoc as { value?: { kind?: string } }).value).toMatchObject({ kind: 'eval' })
    expect(calls).toEqual(['board:p-1', 'doc:alpha:proposal', 'doc:alpha:eval'])
  })

  it('folds kernel rejections into the envelope answer (business codes pass through)', async () => {
    const bridge = {
      readProposalDoc: async () => {
        throw new Error(JSON.stringify({ code: 'ERR_PROPOSAL_NOT_FOUND', message: 'no eval report' }))
      },
    } as unknown as WorkbenchIpcBridge
    const answer = await dispatchToolBridgeCall(bridge, { callId: 'c-9', verb: 'proposal_show', args: { projectId: 'p-1', slug: 'ghost', kind: 'eval' }, actor: 'session:s-1' })
    expect(answer).toMatchObject({ callId: 'c-9', ok: false, code: 'ERR_PROPOSAL_NOT_FOUND' })
  })
})
