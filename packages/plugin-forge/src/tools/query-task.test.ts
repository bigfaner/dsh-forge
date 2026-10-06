// 3.2 单测 —— queryTask tool：两显式参定位必填 + include 四布尔平铺门控 +
// projectId 路由 + render（快照/四节投影）。sessionId 非本动词载荷（查询面无会话写）。
import { describe, expect, it } from 'vitest'
import type { ForgeTasksService, QueryTaskInput, QueryTaskResult, TaskSnapshot } from '@dsh-forge/contracts'
import type { ToolExecFace } from '../faces.js'
import { createQueryTaskTool, parseQueryTaskArgs } from './query-task.js'
import type { ForgeToolDeps } from './index.js'
import { WorkspaceNotRegisteredError } from './session.js'

const EXEC: ToolExecFace = { agent: { session: { id: 'sess-1', header: { cwd: 'C:\\ws\\demo' } } } }

const snapshot: TaskSnapshot = {
  taskId: 't-1',
  slug: 'f1',
  localId: '3.2',
  featureId: 'feat-1',
  title: '示例',
  taskType: 'coding-feature',
  taskStatus: 'in_progress',
  mainSession: false,
  breaking: false,
  complexity: 'medium',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function toolWithCapture() {
  const captured: QueryTaskInput[] = []
  const tasks = {
    queryTask: async (input: QueryTaskInput) => {
      captured.push(input)
      return { task: snapshot } satisfies QueryTaskResult
    },
  } as unknown as ForgeTasksService
  const deps: ForgeToolDeps = {
    tasks,
    proposals: {} as ForgeToolDeps['proposals'],
    resolveProjectId: (cwd: string) => (cwd.toLowerCase().includes('demo') ? 'p-1' : undefined),
  }
  return { tool: createQueryTaskTool(deps), captured }
}

describe('parseQueryTaskArgs', () => {
  it('定位两显式参必填；include 平铺四布尔可选', () => {
    expect(parseQueryTaskArgs({ slug: 'f1', local_id: '3.2' })).toEqual({ slug: 'f1', local_id: '3.2' })
    expect(
      parseQueryTaskArgs({ slug: 'f1', local_id: '3.2', include_records: true, include_sessions: true }),
    ).toMatchObject({ include_records: true, include_sessions: true })
    expect(() => parseQueryTaskArgs({ slug: 'f1' })).toThrow(/local_id must be a non-empty string/)
    expect(() => parseQueryTaskArgs({ slug: 'f1', local_id: '3.2', include_records: 'yes' })).toThrow(
      /include_records must be a boolean/,
    )
  })
})

describe('queryTask execute（include 门控映射）', () => {
  it('全缺省 → 无 include（轻查 = 仅快照）', async () => {
    const { tool, captured } = toolWithCapture()
    await tool.execute({ slug: 'f1', local_id: '3.2' }, EXEC)
    expect(captured).toEqual([{ projectId: 'p-1', taskRef: { slug: 'f1', localId: '3.2' } }])
  })

  it('任一 include → include 对象仅含 true 项', async () => {
    const { tool, captured } = toolWithCapture()
    await tool.execute({ slug: 'f1', local_id: '3.2', include_prerequisites: true, include_records: true }, EXEC)
    expect(captured[0]?.include).toEqual({ prerequisites: true, records: true })
  })

  it('cwd 未命中 → WorkspaceNotRegisteredError（查询面同口径）', async () => {
    const { tool } = toolWithCapture()
    await expect(
      tool.execute({ slug: 'f', local_id: '1' }, { agent: { session: { id: 's', header: { cwd: 'C:\\ws\\x' } } } }),
    ).rejects.toThrow(WorkspaceNotRegisteredError)
  })
})

describe('queryTask render（快照 + 四节按在场投影）', () => {
  const { tool } = toolWithCapture()

  it('快照行：自然键 + 状态 + 类型 + blocked 注记', () => {
    const text = tool.output.render({}, { task: { ...snapshot, blockedReason: '等 2.4' } })[0]?.text ?? ''
    expect(text).toContain('f1/3.2 [in_progress]')
    expect(text).toContain('blocked: 等 2.4')
    expect(text).not.toContain('prerequisites:')
  })

  it('四节各自投影（prerequisites/waitingOnMe/records/sessions）', () => {
    const value = {
      task: snapshot,
      prerequisites: [{ slug: 'f1', localId: '2.4', taskStatus: 'completed' as const }],
      waitingOnMe: [],
      records: [
        {
          verb: 'claim' as const,
          fromStatus: 'pending' as const,
          toStatus: 'in_progress' as const,
          digest: 'abc123',
          actor: 'plugin-tool' as const,
          sessionId: 's1',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      sessions: [{ taskId: 't-1', slug: 'f1', localId: '3.2', title: '示例', taskStatus: 'in_progress' as const, sessionId: 's1', source: 'link' as const }],
    }
    const text = tool.output.render({}, value)[0]?.text ?? ''
    expect(text).toContain('prerequisites: f1/2.4 [completed]')
    expect(text).toContain('waiting on me: (none)')
    expect(text).toContain('claim pending→in_progress (plugin-tool, session s1) — digest abc123')
    expect(text).toContain('sessions: s1 (link)')
  })
})
