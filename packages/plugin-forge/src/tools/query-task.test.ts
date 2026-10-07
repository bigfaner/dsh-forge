// 3.5 单测 —— queryTask tool：两显式参定位必填（slug = 容器 slug）+ include 四布尔
// 平铺门控 + projectId 路由 + 双友好返回面渲染（formatOk ✓ 快照行 + 容器水化行 +
// 四节投影 / typed 错误 → 失败 DTO）。sessionId 非本动词载荷（查询面无会话写）。
import { describe, expect, it } from 'vitest'
import type { ForgeTasksService, QueryTaskInput, QueryTaskResult, TaskSnapshot } from '@dsh-forge/contracts'
import type { ToolExecFace } from '../faces.js'
import { createQueryTaskTool, parseQueryTaskArgs } from './query-task.js'
import type { ForgeToolDeps } from './index.js'

const EXEC: ToolExecFace = { agent: { session: { id: 'sess-1', header: { cwd: 'C:\\ws\\demo' } } } }

const snapshot: TaskSnapshot = {
  taskId: 't-1',
  slug: 'f1',
  localId: '3.2',
  source: { kind: 'feature', slug: 'f1' },
  title: '示例',
  taskType: 'coding-feature',
  taskStatus: 'in_progress',
  breaking: false,
  complexity: 'medium',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const container = { kind: 'feature' as const, slug: 'f1', title: '特性 f1', mode: 'expedition' as const, phase: 'tasks' as const }

function toolWithCapture() {
  const captured: QueryTaskInput[] = []
  const tasks = {
    queryTask: async (input: QueryTaskInput) => {
      captured.push(input)
      return { task: snapshot, container } satisfies QueryTaskResult
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

  it('cwd 未命中 → 失败 DTO（ERR_WORKSPACE_NOT_REGISTERED——formatErr 面）', async () => {
    const { tool } = toolWithCapture()
    const out = await tool.execute(
      { slug: 'f', local_id: '1' },
      { agent: { session: { id: 's', header: { cwd: 'C:\\ws\\x' } } } },
    )
    expect(out).toMatchObject({ ok: false, code: 'ERR_WORKSPACE_NOT_REGISTERED' })
  })

  it('未命中任务 typed 错误 → 失败 DTO（ERR_TASK_NOT_FOUND）', async () => {
    const tasks = {
      queryTask: async () => {
        const e = new Error('TaskRef(f9/9.9) 未命中') as Error & { code: string }
        e.code = 'ERR_TASK_NOT_FOUND'
        throw e
      },
    } as unknown as ForgeTasksService
    const deps: ForgeToolDeps = {
      tasks,
      proposals: {} as ForgeToolDeps['proposals'],
      resolveProjectId: () => 'p-1',
    }
    const tool = createQueryTaskTool(deps)
    const out = await tool.execute({ slug: 'f9', local_id: '9.9' }, EXEC)
    expect(out).toEqual({ ok: false, code: 'ERR_TASK_NOT_FOUND', message: 'TaskRef(f9/9.9) 未命中', violations: [] })
    expect(tool.output.render({}, out)[0]?.text).toBe('✗ ERR_TASK_NOT_FOUND — TaskRef(f9/9.9) 未命中')
  })
})

describe('queryTask 返回面渲染（formatOk：快照 + 容器 + 四节）', () => {
  const { tool } = toolWithCapture()

  it('首行 ✓ 自然键 + 状态 + 标题；键值行含容器水化（kind/slug/phase/mode/title）', () => {
    const text = tool.output.render({}, { task: { ...snapshot, mode: 'expedition' }, container })[0]?.text ?? ''
    expect(text.startsWith('✓ f1/3.2 [in_progress] 示例')).toBe(true)
    expect(text).toContain('- type: coding-feature, complexity medium')
    expect(text).toContain('- mode: expedition (creation-time snapshot)')
    expect(text).toContain('- container: feature f1 (phase tasks) [expedition] — 特性 f1')
    expect(text).not.toContain('prerequisites:')
  })

  it('proposal 容器：无 phase、键行随容器形态收敛', () => {
    const text =
      tool.output.render(
        {},
        { task: { ...snapshot, slug: 'blitz-idea', mode: 'blitz', source: { kind: 'proposal', slug: 'blitz-idea' } }, container: { kind: 'proposal', slug: 'blitz-idea', title: '突击提案', mode: 'blitz' } },
      )[0]?.text ?? ''
    expect(text).toContain('- container: proposal blitz-idea [blitz] — 突击提案')
    expect(text).toContain('- mode: blitz (creation-time snapshot)')
  })

  it('blocked 注记行；四节各自投影（prerequisites/waitingOnMe/records/sessions）', () => {
    const value = {
      task: { ...snapshot, blockedReason: '等 2.4' },
      container,
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
    expect(text).toContain('- blocked: 等 2.4')
    expect(text).toContain('prerequisites: f1/2.4 [completed]')
    expect(text).toContain('waiting on me: (none)')
    expect(text).toContain('claim pending→in_progress (plugin-tool, session s1) — digest abc123')
    expect(text).toContain('sessions: s1 (link)')
  })
})
