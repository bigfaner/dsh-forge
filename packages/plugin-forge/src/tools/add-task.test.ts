// 3.2 单测 —— addTask tool：参数防御收窄（词表/成对/vars 形状/分数）+ 路由映射
//（snake_case → AddTaskInput camelCase；projectId 由 cwd 解析注入；vars KEY=VALUE → Record）。
// stub 服务捕获入参（类型面经 tsconfig.test 门核对 contracts 签名）。
import { describe, expect, it } from 'vitest'
import type { AddTaskInput, ForgeTasksService } from '@dsh-forge/contracts'
import type { ToolExecFace } from '../faces.js'
import { createAddTaskTool, parseAddTaskArgs, varsEntriesToRecord } from './add-task.js'
import type { ForgeToolDeps } from './index.js'
import { WorkspaceNotRegisteredError } from './session.js'

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

describe('parseAddTaskArgs（防御收窄）', () => {
  const base = { feature_slug: 'f1', title: 'T', type: 'coding-feature' }

  it('最小集 + 全量集均可解析', () => {
    expect(parseAddTaskArgs(base)).toEqual(base)
    const full = {
      ...base,
      task_desc: 'd',
      priority: 'P0',
      estimated_time: '1h',
      vars: ['A=1', 'B=2'],
      depends_on: ['2.1'],
      source_slug: 'f1',
      source_local_id: '2.4',
      block_source: true,
      breaking: true,
      coverage: 0.8,
      complexity: 'high',
      surface_key: 'web',
      surface_type: 'web',
    }
    expect(parseAddTaskArgs(full)).toEqual(full)
  })

  it('词表收窄：type 20 值外拒；priority/complexity 值外拒', () => {
    expect(() => parseAddTaskArgs({ ...base, type: 'implementation' })).toThrow(/type must be one of/)
    expect(() => parseAddTaskArgs({ ...base, priority: 'P9' })).toThrow(/priority must be one of/)
    expect(() => parseAddTaskArgs({ ...base, complexity: 'huge' })).toThrow(/complexity must be one of/)
  })

  it('必填缺省与类型错形拒', () => {
    expect(() => parseAddTaskArgs({ title: 'T', type: 'doc' })).toThrow(/feature_slug/)
    expect(() => parseAddTaskArgs({ feature_slug: '', title: 'T', type: 'doc' })).toThrow(/feature_slug/)
    expect(() => parseAddTaskArgs({ ...base, title: 7 })).toThrow(/title must be a string/)
    expect(() => parseAddTaskArgs(null)).toThrow(/arguments must be an object/)
  })

  it('源对成对完整性：半对拒；block_source 无源对拒（fix 链数据面）', () => {
    expect(() => parseAddTaskArgs({ ...base, source_slug: 'f1' })).toThrow(/source_slug and source_local_id/)
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

describe('addTask execute（路由 + 映射）', () => {
  it('cwd 命中 → projectId 注入；snake_case → camelCase 全量映射（含 sourceTask/blockSource/vars）', async () => {
    const { tool, captured } = toolWithCapture()
    await tool.execute(
      {
        feature_slug: 'f1',
        title: '修复X',
        type: 'coding-fix',
        task_desc: 'd',
        priority: 'P1',
        vars: ['A=1'],
        depends_on: ['2.1', '2.2'],
        source_slug: 'f1',
        source_local_id: '2.4',
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

  it('cwd 未命中 → WorkspaceNotRegisteredError（ERR_WORKSPACE_NOT_REGISTERED，服务零触达）', async () => {
    const { tool, captured } = toolWithCapture()
    const exec: ToolExecFace = { agent: { session: { id: 's', header: { cwd: 'C:\\ws\\other' } } } }
    await expect(tool.execute({ feature_slug: 'f', title: 'T', type: 'doc' }, exec)).rejects.toThrow(
      WorkspaceNotRegisteredError,
    )
    expect(captured).toHaveLength(0)
  })

  it('output.render：新建与 reused 双态可读', () => {
    const { tool } = toolWithCapture()
    expect(tool.output.render({}, { taskId: 't', slug: 'f', localId: '1', reused: false })[0]?.text).toContain(
      'added',
    )
    expect(tool.output.render({}, { taskId: 't', slug: 'f', localId: '1', reused: true })[0]?.text).toContain('reused')
  })
})
