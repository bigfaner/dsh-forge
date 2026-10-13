// 单测 —— taskStats tool 壳（main-agent-task-tools 1.2）：source 可选成对作用域
// （半对即拒 / 缺省 = 全库）→ core taskStats 直透路由 + formatOk 渲染（total + 八态 +
// unmetPending）+ typed 错误失败面与 tool-error 事件发射。
import { describe, expect, it } from 'vitest'
import type { ForgeTasksService, TaskStats, TaskStatsQuery } from '@dsh-forge/contracts'
import type { ToolExecFace } from '../faces.js'
import type { ForgeToolDeps } from './index.js'
import { createTaskStatsTool, parseTaskStatsArgs } from './task-stats.js'

const EXEC: ToolExecFace = { agent: { session: { id: 'sess-1', header: { cwd: 'C:\\ws\\demo' } } } }

const STATS: TaskStats = {
  total: 5,
  byStatus: { pending: 2, in_progress: 1, completed: 1, blocked: 1, suspended: 0, interrupted: 0, skipped: 0, rejected: 0 },
  unmetPending: 1,
}

function toolWithCapture(overrides?: Partial<Parameters<typeof createTaskStatsTool>[0]>) {
  const captured: TaskStatsQuery[] = []
  const tasks = {
    taskStats: async (input: TaskStatsQuery) => {
      captured.push(input)
      return { ...STATS }
    },
  } as unknown as ForgeTasksService
  const deps: ForgeToolDeps = {
    tasks,
    proposals: {} as ForgeToolDeps['proposals'],
    resolveProjectId: (cwd: string) => (cwd.toLowerCase().includes('demo') ? 'p-1' : undefined),
    ...overrides,
  }
  return { tool: createTaskStatsTool(deps), captured }
}

describe('parseTaskStatsArgs', () => {
  it('全缺省 = 全库；source 成对给 = 容器作用域', () => {
    expect(parseTaskStatsArgs({})).toEqual({})
    expect(parseTaskStatsArgs({ source_kind: 'feature', source_slug: 'f1' })).toEqual({
      source_kind: 'feature',
      source_slug: 'f1',
    })
  })

  it('半对即拒（both or neither）', () => {
    expect(() => parseTaskStatsArgs({ source_kind: 'feature' })).toThrow(/must be given together/)
    expect(() => parseTaskStatsArgs({ source_slug: 'f1' })).toThrow(/must be given together/)
  })

  it('非对象根即拒', () => {
    expect(() => parseTaskStatsArgs('nope')).toThrow(/arguments must be an object/)
  })
})

describe('taskStats execute（core 直透路由）', () => {
  it('缺省 → 无 source 键（全库口径零变化）', async () => {
    const { tool, captured } = toolWithCapture()
    await tool.execute({}, EXEC)
    expect(captured).toEqual([{ projectId: 'p-1' }])
  })

  it('source 成对 → 容器作用域直透', async () => {
    const { tool, captured } = toolWithCapture()
    await tool.execute({ source_kind: 'proposal', source_slug: 'blitz-1' }, EXEC)
    expect(captured).toEqual([{ projectId: 'p-1', source: { kind: 'proposal', slug: 'blitz-1' } }])
  })

  it('cwd 未命中 → 失败 DTO（ERR_WORKSPACE_NOT_REGISTERED——formatErr 面）', async () => {
    const { tool } = toolWithCapture()
    const out = await tool.execute({}, { agent: { session: { id: 's', header: { cwd: 'C:\\ws\\x' } } } })
    expect(out).toMatchObject({ ok: false, code: 'ERR_WORKSPACE_NOT_REGISTERED' })
  })
})

describe('taskStats 返回面渲染（formatOk）', () => {
  it('首行 ✓ 计数 + total/八态/unmetPending 键值行', () => {
    const { tool } = toolWithCapture()
    const text = tool.output.render({}, STATS)[0]?.text ?? ''
    expect(text.startsWith('✓ 5 task(s) in scope')).toBe(true)
    expect(text).toContain('- total: 5')
    expect(text).toContain('- byStatus: pending 2, in_progress 1, completed 1, blocked 1, suspended 0, interrupted 0, skipped 0, rejected 0')
    expect(text).toContain('- unmetPending: 1')
  })

  it('失败 DTO → formatErr（✗ code 首行）', () => {
    const { tool } = toolWithCapture()
    const out = { ok: false as const, code: 'ERR_WORKSPACE_NOT_REGISTERED' as const, message: '未注册', violations: [] }
    expect(tool.output.render({}, out)[0]?.text).toBe('✗ ERR_WORKSPACE_NOT_REGISTERED — 未注册')
  })
})

describe('taskStats 事件发射（typed 错误 → tool-error）', () => {
  it('typed 服务错误 → tool-error 事件 + 失败 DTO 照常', async () => {
    const events: import('@dsh-forge/contracts').ForgePluginEvent[] = []
    const tasks = {
      taskStats: async () => {
        throw Object.assign(new Error('容器未命中'), { code: 'ERR_FEATURE_NOT_FOUND', data: {} })
      },
    } as unknown as ForgeTasksService
    const { tool } = toolWithCapture({
      tasks,
      events: { emit: (e) => events.push(e), prepare: async () => {}, dirOf: () => undefined, remember: () => {} },
    })
    const out = await tool.execute({ source_kind: 'feature', source_slug: 'f9' }, EXEC)
    expect(out).toMatchObject({ ok: false, code: 'ERR_FEATURE_NOT_FOUND' })
    expect(events[0]).toMatchObject({ slug: 'f9', payload: { verb: 'taskStats', code: 'ERR_FEATURE_NOT_FOUND' } })
  })
})
