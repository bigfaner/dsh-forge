// 3.5 单测 —— addTask tool（容器化迁移后）：参数防御收窄（容器双参/词表/成对/
// vars 形状/分数）+ 路由映射（snake_case → AddTaskInput camelCase；容器直传
// source: ContainerRef——2.4/2.5 feature_slug 垫片退役）+ 双友好返回面
//（formatOk ✓ / typed 错误 → 失败 DTO formatErr ✗）。旧参删除断言：feature_slug
// 不在 schema 面、旧参单给拒（编译面 = AddTaskToolArgs 类型已无该键）。
// stub 服务捕获入参（类型面经 tsconfig.test 门核对 contracts 签名）。
import { describe, expect, it } from 'vitest'
import type { AddTaskInput, ForgeTasksService } from '@dsh-forge/contracts'
import type { ToolExecFace } from '../faces.js'
import { createAddTaskTool, parseAddTaskArgs, varsEntriesToRecord } from './add-task.js'
import type { ForgeToolDeps } from './index.js'

const EXEC: ToolExecFace = { agent: { session: { id: 'sess-1', header: { cwd: 'C:\\ws\\demo' } } } }

function toolWithCapture(): { tool: ReturnType<typeof createAddTaskTool>; captured: AddTaskInput[] } {
  const captured: AddTaskInput[] = []
  const tasks = {
    addTask: async (input: AddTaskInput) => {
      captured.push(input)
      return { taskId: 't-1', slug: input.source.slug, localId: '3.9', reused: false }
    },
  } as unknown as ForgeTasksService
  const deps: ForgeToolDeps = {
    tasks,
    proposals: {} as ForgeToolDeps['proposals'],
    resolveProjectId: (cwd: string) => (cwd.toLowerCase().includes('demo') ? 'p-1' : undefined),
  }
  return { tool: createAddTaskTool(deps), captured }
}

describe('parseAddTaskArgs（防御收窄——容器双参直传）', () => {
  const base = { source_kind: 'feature', source_slug: 'f1', title: 'T', type: 'coding-feature' }

  it('最小集 + 全量集均可解析', () => {
    expect(parseAddTaskArgs(base)).toEqual(base)
    const full = {
      ...base,
      task_desc: 'd',
      acceptance_criteria: ['AC1', 'AC2'],
      priority: 'P0',
      estimated_time: '1h',
      vars: ['A=1', 'B=2'],
      depends_on: ['2.1'],
      source_task_slug: 'f1',
      source_task_local_id: '2.4',
      block_source: true,
      breaking: true,
      coverage: 0.8,
      complexity: 'high',
      surface_key: 'web',
      surface_type: 'web',
    }
    expect(parseAddTaskArgs(full)).toEqual(full)
  })

  it('容器双轨：kind 词表收窄（feature|proposal 外拒）；source_kind/source_slug 必填', () => {
    expect(parseAddTaskArgs({ ...base, source_kind: 'proposal' })).toMatchObject({ source_kind: 'proposal' })
    expect(() => parseAddTaskArgs({ ...base, source_kind: 'epic' })).toThrow(/source_kind must be one of/)
    expect(() => parseAddTaskArgs({ title: 'T', type: 'doc', source_slug: 'f1' })).toThrow(/source_kind/)
    expect(() => parseAddTaskArgs({ source_kind: 'feature', title: 'T', type: 'doc' })).toThrow(/source_slug/)
  })

  it('旧参删除（3.5 容器化迁移）：feature_slug 单给拒——垫片退役后不再等价映射', () => {
    // M2 形参 feature_slug 已删——旧调用形态在此显式拒（编译面同步：类型键已无）
    expect(() => parseAddTaskArgs({ feature_slug: 'f1', title: 'T', type: 'doc' } as object)).toThrow(/source_kind/)
    expect(() => parseAddTaskArgs({ feature_slug: 'f1', source_slug: 'f1', title: 'T', type: 'doc', source_kind: 'feature' } as object)).not.toThrow()
  })

  it('词表收窄：type 20 值外拒；priority/complexity 值外拒', () => {
    expect(() => parseAddTaskArgs({ ...base, type: 'implementation' })).toThrow(/type must be one of/)
    expect(() => parseAddTaskArgs({ ...base, priority: 'P9' })).toThrow(/priority must be one of/)
    expect(() => parseAddTaskArgs({ ...base, complexity: 'huge' })).toThrow(/complexity must be one of/)
  })

  it('必填缺省与类型错形拒', () => {
    expect(() => parseAddTaskArgs({ ...base, title: 7 })).toThrow(/title must be a string/)
    expect(() => parseAddTaskArgs(null)).toThrow(/arguments must be an object/)
  })

  it('源对成对完整性：半对拒；block_source 无源对拒（fix 链数据面）', () => {
    expect(() => parseAddTaskArgs({ ...base, source_task_slug: 'f1' })).toThrow(/source_task_slug and source_task_local_id/)
    expect(() => parseAddTaskArgs({ ...base, block_source: true })).toThrow(/block_source requires/)
  })

  it('vars 条目形状：无 = / 空键 / 重复键拒', () => {
    expect(() => parseAddTaskArgs({ ...base, vars: ['NOEQ'] })).toThrow(/KEY=VALUE/)
    expect(() => parseAddTaskArgs({ ...base, vars: ['=1'] })).toThrow(/KEY=VALUE/)
    expect(() => parseAddTaskArgs({ ...base, vars: ['A=1', 'A=2'] })).toThrow(/duplicate vars key/)
  })

  it('coverage 分数口径：0–1 外拒', () => {
    expect(() => parseAddTaskArgs({ ...base, coverage: 1.5 })).toThrow(/between 0 and 1/)
    expect(() => parseAddTaskArgs({ ...base, coverage: -0.1 })).toThrow(/between 0 and 1/)
  })
})

describe('varsEntriesToRecord', () => {
  it('首个 = 分割（值可含 =）；空值合法', () => {
    expect(varsEntriesToRecord(['A=1', 'B=x=y', 'C='])).toEqual({ A: '1', B: 'x=y', C: '' })
  })
})

describe('addTask execute（路由 + 容器直传映射）', () => {
  it('cwd 命中 → projectId 注入；容器双参 → source: ContainerRef 直传（feature 容器）', async () => {
    const { tool, captured } = toolWithCapture()
    await tool.execute(
      {
        source_kind: 'feature',
        source_slug: 'f1',
        title: '修复X',
        type: 'coding-fix',
        task_desc: 'd',
        priority: 'P1',
        acceptance_criteria: ['AC1'],
        vars: ['A=1'],
        depends_on: ['2.1', '2.2'],
        source_task_slug: 'f1',
        source_task_local_id: '2.4',
        block_source: true,
        coverage: 0.8,
        complexity: 'low',
      },
      EXEC,
    )
    expect(captured).toEqual([
      {
        projectId: 'p-1',
        source: { kind: 'feature', slug: 'f1' },
        title: '修复X',
        type: 'coding-fix',
        taskDesc: 'd',
        acceptanceCriteria: ['AC1'],
        priority: 'P1',
        vars: { A: '1' },
        dependsOn: ['2.1', '2.2'],
        sourceTask: { slug: 'f1', localId: '2.4' },
        blockSource: true,
        coverage: 0.8,
        complexity: 'low',
      },
    ])
  })

  it('proposal 容器直挂（突击渠道）：kind 判别透传', async () => {
    const { tool, captured } = toolWithCapture()
    await tool.execute({ source_kind: 'proposal', source_slug: 'blitz-idea', title: '直达', type: 'coding-feature' }, EXEC)
    expect(captured[0]?.source).toEqual({ kind: 'proposal', slug: 'blitz-idea' })
  })

  it('cwd 未命中 → 失败 DTO（ERR_WORKSPACE_NOT_REGISTERED——typed 错误不再抛断，formatErr 面）；服务零触达', async () => {
    const { tool, captured } = toolWithCapture()
    const exec: ToolExecFace = { agent: { session: { id: 's', header: { cwd: 'C:\\ws\\other' } } } }
    const out = await tool.execute({ source_kind: 'feature', source_slug: 'f', title: 'T', type: 'doc' }, exec)
    expect(out).toMatchObject({ ok: false, code: 'ERR_WORKSPACE_NOT_REGISTERED' })
    expect(captured).toHaveLength(0)
  })

  it('typed 服务错误 → 失败 DTO（如容器不在场 ERR_FEATURE_NOT_FOUND——违规清单按 data 派生）', async () => {
    const captured: AddTaskInput[] = []
    const tasks = {
      addTask: async (input: AddTaskInput) => {
        captured.push(input)
        const e = new Error('容器不在场：proposal p-404') as Error & { code: string; data?: unknown }
        e.code = 'ERR_PROPOSAL_NOT_FOUND'
        throw e
      },
    } as unknown as ForgeTasksService
    const deps: ForgeToolDeps = {
      tasks,
      proposals: {} as ForgeToolDeps['proposals'],
      resolveProjectId: () => 'p-1',
    }
    const tool = createAddTaskTool(deps)
    const out = await tool.execute({ source_kind: 'proposal', source_slug: 'p-404', title: 'T', type: 'doc' }, EXEC)
    expect(out).toEqual({ ok: false, code: 'ERR_PROPOSAL_NOT_FOUND', message: '容器不在场：proposal p-404', violations: [] })
  })
})

describe('addTask 返回面渲染（formatOk/formatErr 快照）', () => {
  it('新建/reused 双态：首行 ✓ + taskId 键值行', () => {
    const { tool } = toolWithCapture()
    expect(tool.output.render({}, { taskId: 't-1', slug: 'f1', localId: '3.9', reused: false })[0]?.text).toBe(
      '✓ Task f1/3.9 added\n- taskId: t-1',
    )
    expect(tool.output.render({}, { taskId: 't-9', slug: 'f1', localId: 'fix-1', reused: true })[0]?.text).toBe(
      '✓ Task f1/fix-1 already exists (fix dedup) — reused, no new row\n- taskId: t-9',
    )
  })

  it('失败态：首行 ✗ code + 人话 + 违规清单逐行', () => {
    const { tool } = toolWithCapture()
    const text = tool.output.render(
      {},
      { ok: false, code: 'ERR_CYCLE_DETECTED', message: '任务图成环', violations: ['cycle: f/2.2 → f/T → f/2.2'] },
    )[0]?.text
    expect(text).toBe('✗ ERR_CYCLE_DETECTED — 任务图成环\ncycle: f/2.2 → f/T → f/2.2')
  })
})

// ─────────────────────────── 3.4 tool-error 事件发射 ───────────────────────────

describe('addTask 事件发射（typed 错误 → tool-error；verb=addTask）', () => {
  it('typed 服务错误 → tool-error（归属 = source_slug 容器）+ 失败 DTO 照常', async () => {
    const events: import('@dsh-forge/contracts').ForgePluginEvent[] = []
    const tasks = {
      addTask: async () => {
        throw Object.assign(new Error('容器不在场'), { code: 'ERR_FEATURE_NOT_FOUND', data: {} })
      },
    } as unknown as ForgeTasksService
    const tool = createAddTaskTool({
      tasks,
      proposals: {} as ForgeToolDeps['proposals'],
      resolveProjectId: () => 'p-1',
      events: { emit: (e) => events.push(e), prepare: async () => {}, dirOf: () => undefined },
    })
    const out = await tool.execute({ source_kind: 'feature', source_slug: 'f1', title: 'T', type: 'coding-feature' }, EXEC)
    expect(out).toMatchObject({ ok: false, code: 'ERR_FEATURE_NOT_FOUND' })
    expect(events.map((e) => e.type)).toEqual(['tool-error'])
    expect(events[0]).toMatchObject({ slug: 'f1', payload: { verb: 'addTask', code: 'ERR_FEATURE_NOT_FOUND' } })
  })
})
