// 3.2 单测 —— submitTask tool：两显式参定位必填 + result 双径 + gate 平铺
//（all-or-none / coverage 依赖门）+ sessionId 提取 + 映射与 render（restored 恢复钩子回报）。
import { describe, expect, it } from 'vitest'
import type { ForgeTasksService, SubmitTaskInput } from '@dsh-forge/contracts'
import type { ToolExecFace } from '../faces.js'
import { createSubmitTaskTool, gateOf, parseSubmitTaskArgs } from './submit-task.js'
import type { ForgeToolDeps } from './index.js'
import { WorkspaceNotRegisteredError } from './session.js'

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
  it('slug+local_id → taskRef；sessionId 提取（执行会话 = 子会话，与 claim 派发会话相异可判）；gate 映射', async () => {
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

  it('空会话拒；cwd 未命中 → WorkspaceNotRegisteredError', async () => {
    const { tool, captured } = toolWithCapture()
    await expect(
      tool.execute(
        { slug: 'f', local_id: '1', result: 'success' },
        { agent: { session: { id: '', header: { cwd: 'C:\\ws\\demo' } } } },
      ),
    ).rejects.toThrow(/no agent session/)
    await expect(
      tool.execute(
        { slug: 'f', local_id: '1', result: 'success' },
        { agent: { session: { id: 's', header: { cwd: 'C:\\ws\\x' } } } },
      ),
    ).rejects.toThrow(WorkspaceNotRegisteredError)
    expect(captured).toHaveLength(0)
  })
})

describe('submitTask render', () => {
  it('restored 空 = 单行；非空 = 恢复钩子回报行', () => {
    const { tool } = toolWithCapture()
    expect(tool.output.render({}, { taskId: 't', status: 'completed', restored: [] })[0]?.text).not.toContain(
      'Auto-restored',
    )
    expect(
      tool.output.render({}, { taskId: 't', status: 'completed', restored: [{ slug: 'f', localId: '2.4' }] })[0]?.text,
    ).toContain('f/2.4')
  })
})
