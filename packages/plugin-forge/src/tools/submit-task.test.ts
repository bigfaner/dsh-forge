// 3.5 单测 —— submitTask tool：两显式参定位必填（slug = 容器 slug——M3 容器化口径）
// + result 双径 + gate 平铺（all-or-none / coverage 依赖门）+ sessionId 提取 +
// 映射与双友好返回面渲染（formatOk ✓ 含恢复钩子回报行 / typed 错误 → 失败 DTO）。
import { describe, expect, it } from 'vitest'
import type { ForgeTasksService, SubmitTaskInput } from '@dsh-forge/contracts'
import type { ToolExecFace } from '../faces.js'
import { createSubmitTaskTool, gateOf, parseSubmitTaskArgs } from './submit-task.js'
import type { ForgeToolDeps } from './index.js'

const EXEC: ToolExecFace = { agent: { session: { id: 'child-1', header: { cwd: 'C:\\ws\\demo' } } } }

function toolWithCapture() {
  const captured: SubmitTaskInput[] = []
  const tasks = {
    submitTask: async (input: SubmitTaskInput) => {
      captured.push(input)
      return { taskId: 't-1', status: 'completed', restored: [] }
    },
  } as unknown as ForgeTasksService
  const deps: ForgeToolDeps = {
    tasks,
    proposals: {} as ForgeToolDeps['proposals'],
    resolveProjectId: (cwd: string) => (cwd.toLowerCase().includes('demo') ? 'p-1' : undefined),
  }
  return { tool: createSubmitTaskTool(deps), captured }
}

describe('parseSubmitTaskArgs（防御收窄）', () => {
  const base = { slug: 'f1', local_id: '3.2', result: 'success' }

  it('定位两显式参必填；result 词表收窄', () => {
    expect(parseSubmitTaskArgs(base)).toEqual(base)
    expect(() => parseSubmitTaskArgs({ ...base, result: 'failed' })).toThrow(/result must be one of/)
    expect(() => parseSubmitTaskArgs({ local_id: '3.2', result: 'success' })).toThrow(/slug/)
  })

  it('gate 平铺 all-or-none：半门拒；coverage 单独在场拒', () => {
    expect(() => parseSubmitTaskArgs({ ...base, gate_compile: true })).toThrow(/all-or-none/)
    expect(() => parseSubmitTaskArgs({ ...base, gate_coverage: 0.9 })).toThrow(
      /gate_coverage requires the four gate results/,
    )
  })

  it('gate 全四项 + coverage 合法；files 数组形状', () => {
    const parsed = parseSubmitTaskArgs({
      ...base,
      gate_compile: true,
      gate_fmt: true,
      gate_lint: true,
      gate_test: false,
      gate_coverage: 0.85,
      files: ['a.ts', 'b.ts'],
      commit_hash: 'abc123',
    })
    expect(parsed.files).toEqual(['a.ts', 'b.ts'])
    expect(parsed.commit_hash).toBe('abc123')
    expect(() => parseSubmitTaskArgs({ ...base, files: ['', 'a.ts'] })).toThrow(/non-empty strings/)
  })
})

describe('gateOf（平铺 → TaskGateReport）', () => {
  it('全四项 → 报告对象（布尔本值保留，false 不是缺省）', () => {
    expect(gateOf({ slug: 'f', local_id: '1', result: 'success', gate_compile: false, gate_fmt: false, gate_lint: false, gate_test: false })).toEqual({
      compile: false,
      fmt: false,
      lint: false,
      test: false,
    })
  })

  it('全四项 + coverage → 带 coverage 报告；全缺省 → undefined', () => {
    expect(
      gateOf({ slug: 'f', local_id: '1', result: 'success', gate_compile: true, gate_fmt: true, gate_lint: true, gate_test: true, gate_coverage: 0.5 }),
    ).toEqual({ compile: true, fmt: true, lint: true, test: true, coverage: 0.5 })
    expect(gateOf({ slug: 'f', local_id: '1', result: 'success' })).toBeUndefined()
  })
})

describe('submitTask execute（路由 + 映射）', () => {
  it('slug+local_id → taskRef（slug = 容器 slug——feature/proposal 同规）；sessionId 提取；gate 映射', async () => {
    const { tool, captured } = toolWithCapture()
    await tool.execute(
      {
        slug: 'f1',
        local_id: '3.2',
        result: 'success',
        summary: '完成',
        files: ['src/a.ts'],
        gate_compile: true,
        gate_fmt: true,
        gate_lint: true,
        gate_test: true,
        gate_coverage: 0.9,
        commit_hash: 'abc123',
      },
      EXEC,
    )
    expect(captured).toEqual([
      {
        projectId: 'p-1',
        taskRef: { slug: 'f1', localId: '3.2' },
        result: 'success',
        sessionId: 'child-1',
        summary: '完成',
        files: ['src/a.ts'],
        gate: { compile: true, fmt: true, lint: true, test: true, coverage: 0.9 },
        commitHash: 'abc123',
      },
    ])
  })

  it('blocked 径：reason 映射（校验在 core——此处仅形状透传）', async () => {
    const { tool, captured } = toolWithCapture()
    await tool.execute({ slug: 'f1', local_id: '3.2', result: 'blocked', reason: '依赖缺失' }, EXEC)
    expect(captured[0]).toMatchObject({ result: 'blocked', reason: '依赖缺失' })
    expect(captured[0]?.gate).toBeUndefined()
  })

  it('空会话拒（untyped 防御收窄——原样抛，不走失败 DTO）', async () => {
    const { tool, captured } = toolWithCapture()
    await expect(
      tool.execute(
        { slug: 'f', local_id: '1', result: 'success' },
        { agent: { session: { id: '', header: { cwd: 'C:\\ws\\demo' } } } },
      ),
    ).rejects.toThrow(/no agent session/)
    expect(captured).toHaveLength(0)
  })

  it('cwd 未命中 → 失败 DTO（ERR_WORKSPACE_NOT_REGISTERED——formatErr 面）；服务零触达', async () => {
    const { tool, captured } = toolWithCapture()
    const out = await tool.execute(
      { slug: 'f', local_id: '1', result: 'success' },
      { agent: { session: { id: 's', header: { cwd: 'C:\\ws\\x' } } } },
    )
    expect(out).toMatchObject({ ok: false, code: 'ERR_WORKSPACE_NOT_REGISTERED' })
    expect(captured).toHaveLength(0)
  })

  it('AC 证据门 typed 错误 → 失败 DTO（违规清单 = AC 逐行）', async () => {
    const tasks = {
      submitTask: async () => {
        const e = new Error('submitTask 缺测试证据：验收清单（逐条补证据后重新提交）：\n- AC1') as Error & {
          code: string
          data?: unknown
        }
        e.code = 'ERR_TEST_EVIDENCE_REQUIRED'
        e.data = { acceptanceCriteria: ['AC1'] }
        throw e
      },
    } as unknown as ForgeTasksService
    const deps: ForgeToolDeps = {
      tasks,
      proposals: {} as ForgeToolDeps['proposals'],
      resolveProjectId: () => 'p-1',
    }
    const tool = createSubmitTaskTool(deps)
    const out = await tool.execute({ slug: 'f1', local_id: '3.2', result: 'success', summary: 's' }, EXEC)
    expect(out).toMatchObject({ ok: false, code: 'ERR_TEST_EVIDENCE_REQUIRED' })
    const text = tool.output.render({ slug: 'f1', local_id: '3.2' }, out)[0]?.text ?? ''
    expect(text).toContain('✗ ERR_TEST_EVIDENCE_REQUIRED — submitTask 缺测试证据')
    expect(text).toContain('missing evidence for AC: AC1')
  })
})

describe('submitTask 返回面渲染（formatOk 快照）', () => {
  it('首行 ✓ 自然键 + 状态；taskId 键值行；恢复钩子逐行回报', () => {
    const { tool } = toolWithCapture()
    expect(tool.output.render({ slug: 'f1', local_id: '3.2' }, { taskId: 't-1', status: 'completed', restored: [] })[0]?.text).toBe(
      '✓ Task f1/3.2 submitted — completed\n- taskId: t-1',
    )
    expect(
      tool.output.render(
        { slug: 'f1', local_id: 'fix-1' },
        { taskId: 't-2', status: 'completed', restored: [{ slug: 'f1', localId: '2.4' }] },
      )[0]?.text,
    ).toBe('✓ Task f1/fix-1 submitted — completed\n- taskId: t-2\n- restored: f1/2.4 (source unblocked)')
  })
})

// ─────────────────────────── 3.4 事件发射（task-submitted / tool-error） ───────────────────────────

describe('submitTask 事件发射（3.4——worker 会话语境）', () => {
  function eventsSink() {
    const events: import('@dsh-forge/contracts').ForgePluginEvent[] = []
    const eventsDeps = {
      events: {
        emit: (e: import('@dsh-forge/contracts').ForgePluginEvent) => events.push(e),
        prepare: async () => {},
        dirOf: () => undefined,
      },
    }
    return { events, eventsDeps }
  }

  it('结算成功 → task-submitted（sessionId = 执行会话；payload taskKey/outcome/commitHash）', async () => {
    const { events, eventsDeps } = eventsSink()
    const captured: SubmitTaskInput[] = []
    const tasks = {
      submitTask: async (input: SubmitTaskInput) => {
        captured.push(input)
        return { taskId: 't-1', status: 'completed', restored: [] }
      },
    } as unknown as ForgeTasksService
    const tool = createSubmitTaskTool({
      tasks,
      proposals: {} as ForgeToolDeps['proposals'],
      resolveProjectId: () => 'p-1',
      ...eventsDeps,
    })
    await tool.execute({ slug: 'f1', local_id: '3.2', result: 'success', summary: 's', commit_hash: 'abc123' }, EXEC)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      sessionId: 'child-1',
      slug: 'f1',
      type: 'task-submitted',
      payload: { taskKey: 'f1/3.2', outcome: 'success', commitHash: 'abc123' },
    })
  })

  it('blocked 结算 → task-submitted 带 reason', async () => {
    const { events, eventsDeps } = eventsSink()
    const tasks = {
      submitTask: async () => ({ taskId: 't-1', status: 'blocked', restored: [] }),
    } as unknown as ForgeTasksService
    const tool = createSubmitTaskTool({
      tasks,
      proposals: {} as ForgeToolDeps['proposals'],
      resolveProjectId: () => 'p-1',
      ...eventsDeps,
    })
    await tool.execute({ slug: 'f1', local_id: '2.4', result: 'blocked', reason: 'missing key' }, EXEC)
    expect(events[0]).toMatchObject({ type: 'task-submitted', payload: { outcome: 'blocked', reason: 'missing key' } })
  })

  it('typed 错误 → tool-error（verb=submitTask）+ 失败 DTO 照常', async () => {
    const { events, eventsDeps } = eventsSink()
    const tasks = {
      submitTask: async () => {
        throw Object.assign(new Error('submitTask 缺测试证据'), {
          code: 'ERR_TEST_EVIDENCE_REQUIRED',
          data: { acceptanceCriteria: ['AC1'] },
        })
      },
    } as unknown as ForgeTasksService
    const tool = createSubmitTaskTool({
      tasks,
      proposals: {} as ForgeToolDeps['proposals'],
      resolveProjectId: () => 'p-1',
      ...eventsDeps,
    })
    const out = await tool.execute({ slug: 'f1', local_id: '3.2', result: 'success', summary: 's' }, EXEC)
    expect(out).toMatchObject({ ok: false, code: 'ERR_TEST_EVIDENCE_REQUIRED' })
    expect(events.map((e) => e.type)).toEqual(['tool-error'])
    expect(events[0]).toMatchObject({ slug: 'f1', payload: { verb: 'submitTask', code: 'ERR_TEST_EVIDENCE_REQUIRED' } })
  })

  it('deps.events 缺席 = 零事件降级（返回面不变）', async () => {
    const tasks = {
      submitTask: async () => ({ taskId: 't-1', status: 'completed', restored: [] }),
    } as unknown as ForgeTasksService
    const tool = createSubmitTaskTool({
      tasks,
      proposals: {} as ForgeToolDeps['proposals'],
      resolveProjectId: () => 'p-1',
    })
    const out = await tool.execute({ slug: 'f1', local_id: '3.2', result: 'success', summary: 's' }, EXEC)
    expect(out).toMatchObject({ taskId: 't-1' })
  })
})
