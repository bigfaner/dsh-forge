// 单测 —— listTasks tool 壳（main-agent-task-tools 1.2）：search/statusFilter/sort/source
// 四参直透 core listTasks 路由 + 渲染层前置投影（TaskPrerequisiteSummary 三字段对象 →
// 前置任务 localId 数组，不含 slug/taskStatus）+ formatOk/formatErr 双面 + tool-error 事件。
import { describe, expect, it } from 'vitest'
import type { ForgeTasksService, ListTasksQuery, TaskCard } from '@dsh-forge/contracts'
import type { ToolExecFace } from '../faces.js'
import type { ForgeToolDeps } from './index.js'

const checkpoints: ForgeToolDeps['checkpoints'] = {
  appendCheckpoint: async () => {
    throw new Error('not used')
  },
  listCheckpoints: async () => [],
  ensureCheckpoint: async () => {
    throw new Error('not used')
  },
}
import { createListTasksTool, parseListTasksArgs, projectCards } from './list-tasks.js'

const EXEC: ToolExecFace = { agent: { session: { id: 'sess-1', header: { cwd: 'C:\\ws\\demo' } } } }

function card(localId: string, over: Partial<TaskCard> = {}): TaskCard {
  return {
    taskId: `t-${localId}`,
    slug: 'f1',
    localId,
    title: `任务 ${localId}`,
    taskType: 'coding-feature',
    taskStatus: 'pending',
    prerequisites: [],
    sessionCount: 0,
    ...over,
  }
}

function toolWithCapture(overrides?: Partial<Omit<Parameters<typeof createListTasksTool>[0], 'checkpoints'>>) {
  const captured: ListTasksQuery[] = []
  const tasks = {
    listTasks: async (q: ListTasksQuery) => {
      captured.push(q)
      return [card('1.1', { prerequisites: [{ slug: 'f1', localId: '1.0', taskStatus: 'completed' }] }), card('1.2')]
    },
  } as unknown as ForgeTasksService
  const deps: ForgeToolDeps = {
    tasks,
    proposals: {} as ForgeToolDeps['proposals'],
  bugs: {} as ForgeToolDeps['bugs'],
  checkpoints,
    resolveProjectId: (cwd: string) => (cwd.toLowerCase().includes('demo') ? 'p-1' : undefined),
    ...overrides,
  }
  return { tool: createListTasksTool(deps), captured }
}

describe('parseListTasksArgs', () => {
  it('四参全缺省 = 全库活跃序；逐参在场即收窄', () => {
    expect(parseListTasksArgs({})).toEqual({})
    expect(
      parseListTasksArgs({
        search: ' 待处理 ',
        statusFilter: ['pending', 'blocked'],
        sort: 'created',
        source_kind: 'feature',
        source_slug: 'f1',
      }),
    ).toEqual({
      search: ' 待处理 ',
      statusFilter: ['pending', 'blocked'],
      sort: 'created',
      source_kind: 'feature',
      source_slug: 'f1',
    })
  })

  it('statusFilter 词表外即拒；sort 词表外即拒；source 半对即拒', () => {
    expect(() => parseListTasksArgs({ statusFilter: ['pending', 'nope'] })).toThrow(/statusFilter must only contain/)
    expect(() => parseListTasksArgs({ statusFilter: 'pending' })).toThrow(/must be an array/)
    expect(() => parseListTasksArgs({ sort: 'newest' })).toThrow(/sort must be one of/)
    expect(() => parseListTasksArgs({ source_kind: 'feature' })).toThrow(/must be given together/)
  })
})

describe('listTasks execute（core 直透路由）', () => {
  it('全缺省 → 仅 projectId（全库单查询口径）', async () => {
    const { tool, captured } = toolWithCapture()
    await tool.execute({}, EXEC)
    expect(captured).toEqual([{ projectId: 'p-1' }])
  })

  it('四参直透（search/statusFilter/sort/source 原样入查询）', async () => {
    const { tool, captured } = toolWithCapture()
    await tool.execute(
      { search: 'blocked', statusFilter: ['blocked'], sort: 'interrupted', source_kind: 'proposal', source_slug: 'b1' },
      EXEC,
    )
    expect(captured).toEqual([
      { projectId: 'p-1', search: 'blocked', statusFilter: ['blocked'], sort: 'interrupted', source: { kind: 'proposal', slug: 'b1' } },
    ])
  })

  it('cwd 未命中 → 失败 DTO（ERR_WORKSPACE_NOT_REGISTERED）', async () => {
    const { tool } = toolWithCapture()
    const out = await tool.execute({}, { agent: { session: { id: 's', header: { cwd: 'C:\\ws\\x' } } } })
    expect(out).toMatchObject({ ok: false, code: 'ERR_WORKSPACE_NOT_REGISTERED' })
  })
})

describe('listTasks 前置投影（tool 渲染层——localId 数组）', () => {
  it('projectCards：前置 = localId 数组（不含 slug/taskStatus 对象）', () => {
    const value = projectCards([
      card('2.1', {
        priority: 'P1',
        prerequisites: [
          { slug: 'f1', localId: '1.1', taskStatus: 'completed' },
          { slug: 'f1', localId: '1.2', taskStatus: 'in_progress' },
        ],
        sessionCount: 2,
        sourceTask: { slug: 'f1', localId: '1.0' },
        source: { kind: 'feature', slug: 'f1' },
      }),
    ])
    const c = value.cards[0] as Record<string, unknown>
    expect(c.prerequisites).toEqual(['1.1', '1.2'])
    expect(JSON.stringify(c.prerequisites)).toBe('["1.1","1.2"]') // 纯 localId，无对象形态
    expect(c.taskStatus).toBe('pending') // 自身状态保留
  })

  it('渲染文本：前置行仅 localId 列表；fix 源标与会话计数照投影', () => {
    const { tool } = toolWithCapture()
    const value = projectCards([
      card('2.1', {
        priority: 'P1',
        title: '示例卡',
        prerequisites: [{ slug: 'f1', localId: '1.1', taskStatus: 'completed' }],
        sessionCount: 3,
        sourceTask: { slug: 'f1', localId: '1.0' },
      }),
    ])
    const text = tool.output.render({}, value)[0]?.text ?? ''
    expect(text.startsWith('✓ 1 task(s) matched')).toBe(true)
    expect(text).toContain('- f1/2.1 [pending] (P1) 示例卡')
    expect(text).toContain('prerequisites: 1.1')
    expect(text).not.toContain('completed')
    expect(text).toContain('sessions: 3')
    expect(text).toContain('fix from: f1/1.0')
  })

  it('空集 → (no matching tasks) 行；前置空 → (none)', () => {
    const { tool } = toolWithCapture()
    const empty = tool.output.render({}, projectCards([]))[0]?.text ?? ''
    expect(empty).toContain('(no matching tasks)')
    const none = tool.output.render({}, projectCards([card('3.1')]))[0]?.text ?? ''
    expect(none).toContain('prerequisites: (none)')
  })

  it('失败 DTO → formatErr（✗ code 首行）', () => {
    const { tool } = toolWithCapture()
    const out = { ok: false as const, code: 'ERR_TASK_NOT_FOUND' as const, message: '未命中', violations: [] }
    expect(tool.output.render({}, out)[0]?.text).toBe('✗ ERR_TASK_NOT_FOUND — 未命中')
  })
})

describe('listTasks 事件发射（typed 错误 → tool-error）', () => {
  it('typed 服务错误 → tool-error 事件（slug = source_slug，缺省 _pool）+ 失败 DTO 照常', async () => {
    const events: import('@dsh-forge/contracts').ForgePluginEvent[] = []
    const tasks = {
      listTasks: async () => {
        throw Object.assign(new Error('容器未命中'), { code: 'ERR_FEATURE_NOT_FOUND', data: {} })
      },
    } as unknown as ForgeTasksService
    const { tool } = toolWithCapture({
      tasks,
      events: { emit: (e) => events.push(e), prepare: async () => {}, dirOf: () => undefined, remember: () => {} },
    })
    const out = await tool.execute({ source_kind: 'feature', source_slug: 'f9' }, EXEC)
    expect(out).toMatchObject({ ok: false, code: 'ERR_FEATURE_NOT_FOUND' })
    expect(events[0]).toMatchObject({ slug: 'f9', payload: { verb: 'listTasks', code: 'ERR_FEATURE_NOT_FOUND' } })
  })
})
