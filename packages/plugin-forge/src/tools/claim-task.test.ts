// 3.2 单测 —— claimTask tool：两显式参口径（slug+local_id 成对 = 显式重入；缺席 = 盲选）+
// sessionId 由 exec ctx 提取（空会话拒）+ projectId 路由 + render（Z1 出口 / dispatchPrompt
// 全文投影 / reclaimed 注记）。
import { describe, expect, it } from 'vitest'
import type { ClaimTaskInput, ForgeTasksService, TaskSnapshot } from '@dsh-forge/contracts'
import type { ToolExecFace } from '../faces.js'
import { createClaimTaskTool, parseClaimTaskArgs } from './claim-task.js'
import type { ForgeToolDeps } from './index.js'
import { WorkspaceNotRegisteredError } from './session.js'

const EXEC: ToolExecFace = { agent: { session: { id: 'sess-1', header: { cwd: 'C:\\ws\\demo' } } } }

const snapshot = (over: Partial<TaskSnapshot> = {}): TaskSnapshot =>
  ({
    taskId: 't-1',
    slug: 'f1',
    localId: '3.2',
    featureId: 'feat-1',
    title: '示例任务',
    taskType: 'coding-feature',
    taskStatus: 'in_progress',
    mainSession: false,
    breaking: false,
    complexity: 'high',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }) as TaskSnapshot

function toolWithCapture(result?: { task: TaskSnapshot | null }) {
  const captured: ClaimTaskInput[] = []
  const tasks = {
    claimTask: async (input: ClaimTaskInput) => {
      captured.push(input)
      return (
        result ?? {
          task: snapshot(),
          dispatchPrompt: '人格段\n<constraints>…</constraints>',
          digest: 'abc123def456',
          reclaimed: false,
        }
      )
    },
  } as unknown as ForgeTasksService
  const deps: ForgeToolDeps = {
    tasks,
    proposals: {} as ForgeToolDeps['proposals'],
    resolveProjectId: (cwd: string) => (cwd.toLowerCase().includes('demo') ? 'p-1' : undefined),
  }
  return { tool: createClaimTaskTool(deps), captured }
}

describe('parseClaimTaskArgs（两显式参口径）', () => {
  it('空参 = 盲选（全库）；feature_slug 单独 = 限域盲选', () => {
    expect(parseClaimTaskArgs({})).toEqual({})
    expect(parseClaimTaskArgs({ feature_slug: 'f1' })).toEqual({ feature_slug: 'f1' })
  })

  it('slug + local_id 成对 = 显式 TaskRef', () => {
    expect(parseClaimTaskArgs({ slug: 'f1', local_id: '3.2' })).toEqual({ slug: 'f1', local_id: '3.2' })
  })

  it('半对拒（拼接歧义的另一形态）', () => {
    expect(() => parseClaimTaskArgs({ slug: 'f1' })).toThrow(/slug and local_id/)
    expect(() => parseClaimTaskArgs({ local_id: '3.2' })).toThrow(/slug and local_id/)
  })

  it('显式对与 feature_slug 冲突拒（slug ≡ feature slug 服务不变量——不留静默优先级）', () => {
    expect(() => parseClaimTaskArgs({ feature_slug: 'a', slug: 'b', local_id: '1' })).toThrow(/conflicts/)
    expect(parseClaimTaskArgs({ feature_slug: 'f1', slug: 'f1', local_id: '1' })).toEqual({
      feature_slug: 'f1',
      slug: 'f1',
      local_id: '1',
    })
  })
})

describe('claimTask execute（路由 + 会话提取）', () => {
  it('盲选：projectId + sessionId（exec ctx 提取）注入，无 taskRef', async () => {
    const { tool, captured } = toolWithCapture()
    await tool.execute({}, EXEC)
    expect(captured).toEqual([{ projectId: 'p-1', sessionId: 'sess-1' }])
  })

  it('限域盲选：feature 容器映射（M3 垫片——feature_slug → source）', async () => {
    const { tool, captured } = toolWithCapture()
    await tool.execute({ feature_slug: 'f1' }, EXEC)
    expect(captured[0]).toMatchObject({ projectId: 'p-1', source: { kind: 'feature', slug: 'f1' } })
  })

  it('显式重入：taskRef 两显式参 → TaskRef 映射', async () => {
    const { tool, captured } = toolWithCapture()
    await tool.execute({ slug: 'f1', local_id: '3.2' }, EXEC)
    expect(captured[0]).toMatchObject({ taskRef: { slug: 'f1', localId: '3.2' } })
  })

  it('空会话（无 agent 上下文）→ 拒（links/records 写源键不可空）', async () => {
    const { tool, captured } = toolWithCapture()
    const exec: ToolExecFace = { agent: { session: { id: '', header: { cwd: 'C:\\ws\\demo' } } } }
    await expect(tool.execute({}, exec)).rejects.toThrow(/no agent session/)
    expect(captured).toHaveLength(0)
  })

  it('cwd 未命中 → WorkspaceNotRegisteredError', async () => {
    const { tool } = toolWithCapture()
    await expect(
      tool.execute({}, { agent: { session: { id: 's', header: { cwd: 'C:\\ws\\x' } } } }),
    ).rejects.toThrow(WorkspaceNotRegisteredError)
  })
})

describe('claimTask render（Z1 出口与派发载荷）', () => {
  it('task:null → Z1 出口声明（等待或收工，不造工作）', () => {
    const { tool } = toolWithCapture({ task: null })
    const text = tool.output.render({}, { task: null, dispatchPrompt: '', digest: '', reclaimed: false })[0]?.text
    expect(text).toContain('No ready task')
  })

  it('命中 → 身份行 + dispatchPrompt 全文投影（派发链载荷本体，不得截断）', () => {
    const { tool } = toolWithCapture()
    const value = {
      task: snapshot(),
      dispatchPrompt: '人格段\n<constraints>c</constraints>\n<task-context>TASK_ID: f1/3.2</task-context>',
      digest: 'abc',
      reclaimed: false,
    }
    const text = tool.output.render({}, value)[0]?.text ?? ''
    expect(text).toContain('f1/3.2')
    expect(text).toContain('Dispatch brief — hand to the executor verbatim:')
    expect(text).toContain('TASK_ID: f1/3.2')
    expect(text).not.toContain('re-entry')
  })

  it('reclaimed=true → 重入注记（前次未 submit）', () => {
    const { tool } = toolWithCapture()
    const text = tool.output.render({}, { task: snapshot(), dispatchPrompt: 'p', digest: 'd', reclaimed: true })[0]?.text
    expect(text).toContain('re-entry')
  })
})
