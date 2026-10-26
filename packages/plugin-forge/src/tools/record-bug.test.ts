// recordBug tool 单测（fix-bug 两写径·登记）：参数防御收窄（五必填 + 两可选）+
// 路由映射（snake_case → registerBug 入参 camelCase；report_session_id = 执行会话注入；
// source_task_id = 派发上下文注入——worker 来源任务注册表，standalone 缺席键）+
// 双友好返回面（✓ bugId / typed 错误 → 失败 DTO——超长摘要 ERR_BUG_SUMMARY_TOO_LONG）。
import { afterEach, describe, expect, it } from 'vitest'
import type { BugCard } from '@dsh-forge/contracts'
import { workerSourceTaskOf } from '../dispatch-core/index.js'
import { forgetWorkerSourceTask, rememberWorkerSourceTask } from '../dispatch-core/index.js'
import type { ToolExecFace } from '../faces.js'
import { createRecordBugTool, parseRecordBugArgs } from './record-bug.js'
import type { ForgeBugsToolFace, ForgeToolDeps } from './index.js'

const checkpoints: ForgeToolDeps['checkpoints'] = {
  appendCheckpoint: async () => {
    throw new Error('not used')
  },
  listCheckpoints: async () => [],
  ensureCheckpoint: async () => {
    throw new Error('not used')
  },
}

/** ForgeBugsToolFace 桩（getBug/listBugs 缺席用例——recordBug 用例不触） */
function stubBugsFace(registerBug: ForgeBugsToolFace['registerBug']): ForgeBugsToolFace {
  return {
    registerBug,
    resolveBug: async () => {
      throw new Error('not used')
    },
    listBugs: async () => [],
    getBug: async () => {
      throw new Error('not used')
    },
  }
}

const EXEC: ToolExecFace = { agent: { session: { id: 'sess-1', header: { cwd: 'C:\\ws\\demo' } } } }

/** registerBug 服务返回面（open 行投影） */
function openCard(summary: string): BugCard {
  return {
    bugId: 'bug-1',
    summary,
    bugDesc: 'd',
    triggerDesc: 't',
    expected: 'e',
    actual: 'a',
    bugStatus: 'open',
    reporter: 'faner',
    createdAt: '2026-10-13T00:00:00.000Z',
    updatedAt: '2026-10-13T00:00:00.000Z',
  }
}

interface CapturedInput {
  projectId: string
  summary: string
  recurrenceOf?: string
  reportSessionId?: string
  sourceTaskId?: string
}

function toolWithCapture(): { tool: ReturnType<typeof createRecordBugTool>; captured: CapturedInput[] } {
  const captured: CapturedInput[] = []
  const bugs = stubBugsFace(async (input) => {
    captured.push({
      projectId: input.projectId,
      summary: input.summary,
      recurrenceOf: input.recurrenceOf,
      reportSessionId: input.reportSessionId,
      sourceTaskId: input.sourceTaskId,
    })
    return openCard(input.summary)
  })
  const deps: ForgeToolDeps = {
    tasks: {} as ForgeToolDeps['tasks'],
    proposals: {} as ForgeToolDeps['proposals'],
    bugs,
    checkpoints,
    resolveProjectId: (cwd: string) => (cwd.toLowerCase().includes('demo') ? 'p-1' : undefined),
  }
  return { tool: createRecordBugTool(deps), captured }
}

const BASE = {
  summary: '登录接口 500',
  bug_desc: '空 body 必现 500',
  trigger_desc: 'POST /login 空 body',
  expected: '400 参数错误',
  actual: '500 内部错误',
}

describe('parseRecordBugArgs（防御收窄）', () => {
  it('最小集 + 全量集均可解析；可选字段缺席 = 键缺席', () => {
    expect(parseRecordBugArgs(BASE)).toEqual(BASE)
    expect(parseRecordBugArgs({ ...BASE, suspected: 'a/b.ts:1', error_type: 'api' })).toEqual({
      ...BASE,
      suspected: 'a/b.ts:1',
      error_type: 'api',
    })
    expect(parseRecordBugArgs(BASE)).not.toHaveProperty('suspected')
    expect(parseRecordBugArgs(BASE)).not.toHaveProperty('error_type')
  })

  it('五必填缺一拒；非 string 拒；非对象根拒', () => {
    for (const key of Object.keys(BASE)) {
      const partial: Record<string, unknown> = { ...BASE }
      delete partial[key]
      expect(() => parseRecordBugArgs(partial)).toThrow(new RegExp(key))
    }
    expect(() => parseRecordBugArgs({ ...BASE, summary: 7 })).toThrow(/summary must be a string/)
    expect(() => parseRecordBugArgs(null)).toThrow(/arguments must be an object/)
  })

  it('身份/会话/来源任务字段不在 agent 面（schema 薄面——提交即未知键拒之 parse 外）', () => {
    expect(() =>
      parseRecordBugArgs({ ...BASE, report_session_id: 's', reporter: 'x', source_task_id: 't' } as object),
    ).not.toThrow()
    // 未知键不进输出（parse 面零透传——白名单形制）
    expect(parseRecordBugArgs({ ...BASE, report_session_id: 's' } as object)).not.toHaveProperty('report_session_id')
  })

  it('recurrence_of 可选：缺席 = 键缺席；在场即透传（挂链前驱——bug-recurrence-chain）', () => {
    expect(parseRecordBugArgs(BASE)).not.toHaveProperty('recurrence_of')
    expect(parseRecordBugArgs({ ...BASE, recurrence_of: 'bug-root-uuid' })).toEqual({
      ...BASE,
      recurrence_of: 'bug-root-uuid',
    })
    expect(() => parseRecordBugArgs({ ...BASE, recurrence_of: '' })).not.toThrow() // 空串 = 缺省（optionalString 语义）
  })

  it('schema description 含前驱语义定义句（裁决⑮——前驱 bug_id / 首次不填 / 检索候选指引）', () => {
    const { tool } = toolWithCapture()
    const desc = (tool.parameters.properties as Record<string, { description?: string }>).recurrence_of?.description ?? ''
    expect(desc).toContain('bug_id of the most recent prior record')
    expect(desc).toContain('Omit on first occurrence')
    expect(desc).toContain('listBugs')
  })

  it('recurrence_of 路由：snake_case → registerBug 入参 recurrenceOf（camelCase 挂链）', async () => {
    const { tool, captured } = toolWithCapture()
    await tool.execute({ ...BASE, recurrence_of: 'bug-root-uuid' }, EXEC)
    expect(captured[0]).toMatchObject({ recurrenceOf: 'bug-root-uuid' })
  })
})

describe('recordBug execute（路由 + 服务端注入径）', () => {
  afterEach(() => {
    forgetWorkerSourceTask('sess-1')
  })

  it('cwd → projectId；report_session_id = 执行会话注入；standalone 路径 source_task_id 键缺席', async () => {
    const { tool, captured } = toolWithCapture()
    const result = await tool.execute(BASE, EXEC)
    expect(result).toMatchObject({ bugId: 'bug-1', bugStatus: 'open' })
    expect(captured).toEqual([{ projectId: 'p-1', summary: '登录接口 500', reportSessionId: 'sess-1' }])
    expect(captured[0]!.sourceTaskId).toBeUndefined()
  })

  it('派发上下文注入：worker 来源任务注册表登记 → source_task_id 注入（registerBug 入参）', async () => {
    rememberWorkerSourceTask('sess-1', 'task-uuid-9')
    expect(workerSourceTaskOf('sess-1')).toBe('task-uuid-9')
    const { tool, captured } = toolWithCapture()
    await tool.execute(BASE, EXEC)
    expect(captured[0]).toMatchObject({ sourceTaskId: 'task-uuid-9', reportSessionId: 'sess-1' })
  })

  it('cwd 未绑定 → ERR_WORKSPACE_NOT_REGISTERED 失败 DTO', async () => {
    const { tool } = toolWithCapture()
    const result = await tool.execute(BASE, {
      agent: { session: { id: 'sess-2', header: { cwd: 'C:\\other' } } },
    })
    expect(result).toMatchObject({ ok: false, code: 'ERR_WORKSPACE_NOT_REGISTERED' })
  })

  it('超长摘要拒写（服务端 ERR_BUG_SUMMARY_TOO_LONG）→ 失败 DTO（✗ code 人话面）', async () => {
    const deps: ForgeToolDeps = {
      tasks: {} as ForgeToolDeps['tasks'],
      proposals: {} as ForgeToolDeps['proposals'],
      bugs: stubBugsFace(async () => {
        throw Object.assign(new Error('summary 超长拒绝：50 字上限，实际 51 字'), {
          code: 'ERR_BUG_SUMMARY_TOO_LONG',
          data: { summary: 'x'.repeat(51), max: 50 },
        })
      }),
      resolveProjectId: () => 'p-1',
      checkpoints,
    }
    const tool = createRecordBugTool(deps)
    const result = await tool.execute({ ...BASE, summary: 'x'.repeat(51) }, EXEC)
    expect(result).toMatchObject({ ok: false, code: 'ERR_BUG_SUMMARY_TOO_LONG' })
    expect((result as { message: string }).message).toContain('50 字上限')
  })

  it('渲染面：成功 ✓ bugId；失败 ✗ code（双友好）', async () => {
    const { tool } = toolWithCapture()
    const rendered = tool.output?.render?.(BASE, await tool.execute(BASE, EXEC))
    expect(rendered).toBeDefined()
    expect((rendered as { type: string; text: string }[])[0]!.text).toContain('✓ Bug registered')
    expect((rendered as { type: string; text: string }[])[0]!.text).toContain('bug-1')
  })
})
