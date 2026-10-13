// main-agent-task-tools 1.3 单测 —— updateTask tool 壳：slug+local_id 定位必填 +
// 宽字段全部可选（partial 语义；vars = KEY=VALUE 条目数组 / depends_on 数组）+
// projectId 路由 core updateTask + 更新后快照渲染（formatOk：更新字段可见）+
// typed 错误（状态门/环/边护栏）→ 失败 DTO formatErr + tool-error 事件（verb=updateTask）。
import { describe, expect, it } from 'vitest'
import type { ForgeTasksService, ForgePluginEvent, TaskSnapshot, UpdateTaskInput } from '@dsh-forge/contracts'
import type { ToolExecFace } from '../faces.js'
import { UPDATE_TASK_OUTPUT_SCHEMA, createUpdateTaskTool, parseUpdateTaskArgs } from './update-task.js'
import type { ForgeToolDeps } from './index.js'

const EXEC: ToolExecFace = { agent: { session: { id: 'sess-1', header: { cwd: 'C:\\ws\\demo' } } } }

const snapshot: TaskSnapshot = {
  taskId: 't-1',
  slug: 'f1',
  localId: '1.3',
  source: { kind: 'feature', slug: 'f1' },
  title: '改名后',
  taskType: 'coding-feature',
  taskStatus: 'pending',
  breaking: false,
  complexity: 'high',
  priority: 'P0',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
}

function toolWithCapture(events?: ForgePluginEvent[]) {
  const captured: UpdateTaskInput[] = []
  const tasks = {
    updateTask: async (input: UpdateTaskInput) => {
      captured.push(input)
      return snapshot
    },
  } as unknown as ForgeTasksService
  const deps: ForgeToolDeps = {
    tasks,
    proposals: {} as ForgeToolDeps['proposals'],
  bugs: {} as ForgeToolDeps['bugs'],
    resolveProjectId: (cwd: string) => (cwd.toLowerCase().includes('demo') ? 'p-1' : undefined),
    ...(events !== undefined
      ? { events: { emit: (e: ForgePluginEvent) => events.push(e), prepare: async () => {}, dirOf: () => undefined, remember: () => {} } }
      : {}),
  }
  return { tool: createUpdateTaskTool(deps), captured }
}

describe('parseUpdateTaskArgs', () => {
  it('定位两显式参必填；宽字段全可选（partial 语义）', () => {
    expect(parseUpdateTaskArgs({ slug: 'f1', local_id: '1.3' })).toEqual({ slug: 'f1', local_id: '1.3' })
    expect(() => parseUpdateTaskArgs({ slug: 'f1' })).toThrow(/local_id must be a non-empty string/)
    expect(() => parseUpdateTaskArgs({ local_id: '1.3' })).toThrow(/slug must be a non-empty string/)
    expect(() => parseUpdateTaskArgs({ slug: 'f1', local_id: '1.3', priority: 'P9' })).toThrow(/priority must be one of/)
    expect(() => parseUpdateTaskArgs({ slug: 'f1', local_id: '1.3', complexity: 'vast' })).toThrow(/complexity must be one of/)
    expect(() => parseUpdateTaskArgs({ slug: 'f1', local_id: '1.3', type: 'nope' })).toThrow(/type must be one of/)
  })

  it('宽字段收窄：vars 形状先证（KEY=VALUE / 重复键拒），depends_on 字符串数组', () => {
    expect(
      parseUpdateTaskArgs({ slug: 'f1', local_id: '1.3', title: 't', depends_on: ['1.1', '1.2'], vars: ['K=V'], estimated_time: '2h' }),
    ).toEqual({ slug: 'f1', local_id: '1.3', title: 't', depends_on: ['1.1', '1.2'], vars: ['K=V'], estimated_time: '2h' })
    expect(() => parseUpdateTaskArgs({ slug: 'f1', local_id: '1.3', vars: ['novar'] })).toThrow(/KEY=VALUE/)
    expect(() => parseUpdateTaskArgs({ slug: 'f1', local_id: '1.3', vars: ['K=V', 'K=W'] })).toThrow(/duplicate vars key/)
    expect(() => parseUpdateTaskArgs({ slug: 'f1', local_id: '1.3', depends_on: [1] })).toThrow(
      /depends_on must be an array of non-empty strings/,
    )
  })
})

describe('updateTask execute（projectId 路由 core updateTask）', () => {
  it('定位 + 宽字段 → UpdateTaskInput snake→camel 映射（partial：未给字段缺席）', async () => {
    const { tool, captured } = toolWithCapture()
    const out = await tool.execute(
      { slug: 'f1', local_id: '1.3', title: '改名后', priority: 'P0', complexity: 'high', depends_on: ['1.1'], vars: ['K=V'], acceptance_criteria: ['AC-1'] },
      EXEC,
    )
    expect(out).toEqual(snapshot)
    expect(captured).toEqual([
      {
        projectId: 'p-1',
        taskRef: { slug: 'f1', localId: '1.3' },
        title: '改名后',
        priority: 'P0',
        complexity: 'high',
        dependsOn: ['1.1'],
        vars: { K: 'V' },
        acceptanceCriteria: ['AC-1'],
      },
    ])
  })

  it('仅定位两参 → 零改写负载（projectId + taskRef）', async () => {
    const { tool, captured } = toolWithCapture()
    await tool.execute({ slug: 'f1', local_id: '1.3' }, EXEC)
    expect(captured).toEqual([{ projectId: 'p-1', taskRef: { slug: 'f1', localId: '1.3' } }])
  })

  it('cwd 未命中 → 失败 DTO（ERR_WORKSPACE_NOT_REGISTERED）', async () => {
    const { tool } = toolWithCapture()
    const out = await tool.execute({ slug: 'f1', local_id: '1' }, { agent: { session: { id: 's', header: { cwd: 'C:\\ws\\x' } } } })
    expect(out).toMatchObject({ ok: false, code: 'ERR_WORKSPACE_NOT_REGISTERED' })
  })

  it('typed 错误（状态门 ERR_TASK_LOCKED）→ 失败 DTO formatErr', async () => {
    const tasks = {
      updateTask: async () => {
        throw Object.assign(new Error('任务被锁定'), { code: 'ERR_TASK_LOCKED', data: {} })
      },
    } as unknown as ForgeTasksService
    const tool = createUpdateTaskTool({ tasks, proposals: {} as ForgeToolDeps['proposals'], bugs: {} as ForgeToolDeps['bugs'], resolveProjectId: () => 'p-1' })
    const out = await tool.execute({ slug: 'f1', local_id: '1.3' }, EXEC)
    expect(out).toEqual({ ok: false, code: 'ERR_TASK_LOCKED', message: '任务被锁定', violations: [] })
    expect(tool.output.render({}, out)[0]?.text).toContain('✗ ERR_TASK_LOCKED')
  })
})

describe('updateTask 返回面渲染（formatOk：更新后快照，更新字段可见）', () => {
  const { tool } = toolWithCapture()

  it('首行 ✓ 自然键 + 状态 + 标题；键值行含类型/优先级/复杂度/updatedAt', () => {
    const text = tool.output.render({}, snapshot)[0]?.text ?? ''
    expect(text.startsWith('✓ Task f1/1.3 updated — [pending] 改名后')).toBe(true)
    expect(text).toContain('- taskId: t-1')
    expect(text).toContain('- type: coding-feature, priority P0, complexity high')
    expect(text).toContain('- updatedAt: 2026-01-02T00:00:00.000Z')
  })

  it('可选字段按在场投影：desc/AC 计数/vars 计数/surface', () => {
    const text =
      tool.output.render(
        {},
        {
          ...snapshot,
          taskDesc: '载荷',
          acceptanceCriteria: ['AC-1', 'AC-2'],
          vars: { K: 'V' },
          surfaceKey: 'web',
          surfaceType: 'web',
        },
      )[0]?.text ?? ''
    expect(text).toContain('- desc: 载荷')
    expect(text).toContain('- acceptanceCriteria: 2 items')
    expect(text).toContain('- vars: 1 entries')
    expect(text).toContain('- surface: web (web)')
  })
})

describe('UPDATE_TASK_OUTPUT_SCHEMA 结构 pin（TaskSnapshot 镜像 + 失败支）', () => {
  const successProps = (UPDATE_TASK_OUTPUT_SCHEMA.oneOf[0] as { properties: Record<string, unknown> }).properties

  it('成功支覆盖 TaskSnapshot 全字段', () => {
    for (const key of [
      'taskId', 'slug', 'localId', 'source', 'title', 'taskType', 'taskStatus', 'taskDesc', 'priority',
      'estimatedTime', 'vars', 'sourceTaskId', 'blockedReason', 'mode', 'acceptanceCriteria', 'breaking',
      'coverage', 'complexity', 'surfaceKey', 'surfaceType', 'createdAt', 'updatedAt',
    ]) {
      expect(Object.keys(successProps), `${key} 必须在 schema properties 中`).toContain(key)
    }
  })
})

describe('updateTask 事件发射（typed 错误 → tool-error；verb=updateTask）', () => {
  it('typed 服务错误 → tool-error（归属 = 任务容器 slug）+ 失败 DTO 照常', async () => {
    const events: ForgePluginEvent[] = []
    const tasks = {
      updateTask: async () => {
        throw Object.assign(new Error('成环'), { code: 'ERR_CYCLE_DETECTED', data: {} })
      },
    } as unknown as ForgeTasksService
    const tool = createUpdateTaskTool({
      tasks,
      proposals: {} as ForgeToolDeps['proposals'],
  bugs: {} as ForgeToolDeps['bugs'],
      resolveProjectId: () => 'p-1',
      events: { emit: (e) => events.push(e), prepare: async () => {}, dirOf: () => undefined, remember: () => {} },
    })
    const out = await tool.execute({ slug: 'f1', local_id: '1.3' }, EXEC)
    expect(out).toMatchObject({ ok: false, code: 'ERR_CYCLE_DETECTED' })
    expect(events[0]).toMatchObject({ slug: 'f1', payload: { verb: 'updateTask', code: 'ERR_CYCLE_DETECTED' } })
  })
})
