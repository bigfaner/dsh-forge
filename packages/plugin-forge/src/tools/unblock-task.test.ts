// 1.4 单测 —— unblockTask tool（blocked-verdict-restore-primitive 工具层）：
// 成功径（blocked 卡 + reason → pending，回执含审计要点）/ 负载拒绝（gate/AC/结算负载
// schema 面不接受）/ 注册在场（FORGE_TOOL_NAMES 含本工具且 ∉ WORKER_FORGE_TOOLS——
// worker deny 矩阵收口）。
import { describe, expect, it } from 'vitest'
import type { ForgeTasksService, UnblockTaskInput } from '@dsh-forge/contracts'
import type { ToolExecFace } from '../faces.js'
import { createUnblockTaskTool, parseUnblockTaskArgs } from './unblock-task.js'
import { FORGE_TOOL_NAMES, type ForgeToolDeps } from './index.js'
import { WORKER_FORGE_TOOLS } from '@dsh-forge/contracts'

const EXEC: ToolExecFace = { agent: { session: { id: 'main-1', header: { cwd: 'C:\\ws\\demo' } } } }

function toolWithCapture() {
  const captured: UnblockTaskInput[] = []
  const tasks = {
    unblockTask: async (input: UnblockTaskInput) => {
      captured.push(input)
      return { taskId: 't-1', status: 'pending' as const }
    },
  } as unknown as ForgeTasksService
  const deps: ForgeToolDeps = {
    tasks,
    proposals: {} as ForgeToolDeps['proposals'],
    bugs: {} as ForgeToolDeps['bugs'],
    checkpoints: {
      appendCheckpoint: async () => {
        throw new Error('not used')
      },
      listCheckpoints: async () => [],
      ensureCheckpoint: async () => {
        throw new Error('not used')
      },
    },
    resolveProjectId: (cwd: string) => (cwd.toLowerCase().includes('demo') ? 'p-1' : undefined),
  }
  return { tool: createUnblockTaskTool(deps), captured }
}

describe('parseUnblockTaskArgs（防御收窄）', () => {
  const base = { slug: 'f1', local_id: '1.4', reason: 'fix-2 completed — blocker resolved' }

  it('定位两参 + reason 必带；空白 reason 拒', () => {
    expect(parseUnblockTaskArgs(base)).toEqual(base)
    expect(() => parseUnblockTaskArgs({ slug: 'f1', local_id: '1.4' })).toThrow(/reason/)
    expect(() => parseUnblockTaskArgs({ ...base, reason: '   ' })).toThrow(/non-empty/)
    expect(() => parseUnblockTaskArgs({ local_id: '1.4', reason: 'r' })).toThrow(/slug/)
  })

  it('负载拒绝：gate/AC/结算负载 schema 面不接受（命中即拒并指路 submitTask）', () => {
    for (const load of [
      { gate_compile: true },
      { gate_test: true },
      { ac_criteria: ['x'], ac_met: [true] },
      { summary: 'done' },
      { result: 'success' },
      { coverage: 0.9 },
      { evidence_debt_suite: 'e2e' },
    ]) {
      expect(() => parseUnblockTaskArgs({ ...base, ...load })).toThrow(/not accepted.*submitTask/s)
    }
  })
})

describe('unblockTask tool（成功径 + 回执审计要点）', () => {
  it('blocked 卡 + reason → deps.tasks.unblockTask 透传（projectId/sessionId 归因），回执含 taskId/status/reason', async () => {
    const { tool, captured } = toolWithCapture()
    const result = await tool.execute({ slug: 'f1', local_id: '1.4', reason: 'fix-2 completed' }, EXEC)
    expect(result).toEqual({ taskId: 't-1', status: 'pending' })
    expect(captured).toEqual([
      { projectId: 'p-1', taskRef: { slug: 'f1', localId: '1.4' }, reason: 'fix-2 completed', sessionId: 'main-1' },
    ])
    const rendered = tool.output.render({ slug: 'f1', local_id: '1.4', reason: 'fix-2 completed' }, result)
    const text = rendered.map((b) => b.text).join('\n')
    expect(text).toContain('✓')
    expect(text).toContain('f1/1.4')
    expect(text).toContain('pending')
    expect(text).toContain('taskId: t-1')
    expect(text).toContain('reason: fix-2 completed')
  })

  it('reason 缺席在 core 先证前被工具面拒绝（形状收窄）', async () => {
    const { tool } = toolWithCapture()
    await expect(tool.execute({ slug: 'f1', local_id: '1.4' }, EXEC)).rejects.toThrow(/reason/)
  })
})

describe('注册在场（装配面生效）', () => {
  it('FORGE_TOOL_NAMES 含 unblockTask 且 ∉ WORKER_FORGE_TOOLS（worker 面不注入——deny 矩阵收口）', async () => {
    expect(FORGE_TOOL_NAMES).toContain('unblockTask')
    expect(WORKER_FORGE_TOOLS).not.toContain('unblockTask')
  })
})
