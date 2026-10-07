// 3.1 单测 —— validateFeatureTasks tool（AC4）：参数收窄 + projectId 路由 + 映射 +
// typed 错误信封 + 渲染双面快照（全绿 ✓ / 有违规 ✗ 逐项——✗ 行必含任务键 slug/localId，
// agent 修复直达锚）。五类 + M3 扩展项校验本体在 core（2.1）——本面只透传单 feature 容器。
import { describe, expect, it } from 'vitest'
import type { ForgeTasksService, ValidateFeatureTasksInput, ValidateReport } from '@dsh-forge/contracts'
import type { ToolExecFace } from '../faces.js'
import { createValidateFeatureTasksTool, parseValidateFeatureTasksArgs } from './validate-feature-tasks.js'
import type { ForgeSpecToolDeps } from './index.js'
import { WorkspaceNotRegisteredError } from './session.js'

const EXEC: ToolExecFace = { agent: { session: { id: 'sess-1', header: { cwd: 'C:\\ws\\demo' } } } }

function depsReturning(report: ValidateReport) {
  const validated: ValidateFeatureTasksInput[] = []
  const tasks = {
    validateFeatureTasks: async (input: ValidateFeatureTasksInput) => {
      validated.push(input)
      return report
    },
  } as unknown as ForgeTasksService
  const deps: ForgeSpecToolDeps = {
    features: {} as ForgeSpecToolDeps['features'],
    tasks,
    resolveProjectId: (cwd: string) => (cwd.toLowerCase().includes('demo') ? 'p-1' : undefined),
  }
  return { deps, validated }
}

describe('validateFeatureTasks', () => {
  it('parse：feature_slug 必填（恒单 feature——批量语义归流程层）', () => {
    expect(parseValidateFeatureTasksArgs({ feature_slug: 'feat-x' })).toEqual({ feature_slug: 'feat-x' })
    expect(() => parseValidateFeatureTasksArgs({})).toThrow(/feature_slug must be a non-empty string/)
    expect(() => parseValidateFeatureTasksArgs(null)).toThrow(/arguments must be an object/)
  })

  it('execute：projectId 路由 + featureSlug 映射（Interface 1 签名：{ projectId, featureSlug }）', async () => {
    const healthy: ValidateReport = { violations: [], checked: { featureSlug: 'feat-x', tasks: 4 } }
    const { deps, validated } = depsReturning(healthy)
    const tool = createValidateFeatureTasksTool(deps)
    await tool.execute({ feature_slug: 'feat-x' }, EXEC)
    expect(validated).toEqual([{ projectId: 'p-1', featureSlug: 'feat-x' }])
  })

  it('cwd 未命中 → WorkspaceNotRegisteredError（typed 错误信封）', async () => {
    const healthy: ValidateReport = { violations: [], checked: { featureSlug: 'feat-x', tasks: 0 } }
    const { deps } = depsReturning(healthy)
    const tool = createValidateFeatureTasksTool(deps)
    await expect(
      tool.execute({ feature_slug: 'a' }, { agent: { session: { id: 's', header: { cwd: 'C:\\ws\\x' } } } }),
    ).rejects.toThrow(WorkspaceNotRegisteredError)
  })

  it('render：全绿 ✓ 快照（覆盖面行——feature slug + 任务数）', async () => {
    const healthy: ValidateReport = { violations: [], checked: { featureSlug: 'feat-x', tasks: 12 } }
    const { deps } = depsReturning(healthy)
    const tool = createValidateFeatureTasksTool(deps)
    const result = await tool.execute({ feature_slug: 'feat-x' }, EXEC)
    const text = tool.output.render({}, result)[0]?.text ?? ''
    expect(text).toContain('✓ Feature feat-x task graph healthy — 12 tasks checked, no violations')
    expect(text).not.toContain('✗')
  })

  it('render：违规 ✗ 逐项快照——首行汇总 + 每条一行，任务级违规含任务键 slug/localId', async () => {
    const report: ValidateReport = {
      violations: [
        { kind: 'record-chain', message: 'in_progress task has no claim record', taskRef: { slug: 'feat-x', localId: '2.5' } },
        { kind: 'phase-invariant', message: 'feature status disagrees with derived phase' },
        { kind: 'liveness', message: 'task idle beyond threshold', taskRef: { slug: 'feat-x', localId: '3.1' } },
      ],
      checked: { featureSlug: 'feat-x', tasks: 9 },
    }
    const { deps } = depsReturning(report)
    const tool = createValidateFeatureTasksTool(deps)
    const result = await tool.execute({ feature_slug: 'feat-x' }, EXEC)
    const text = tool.output.render({}, result)[0]?.text ?? ''
    const lines = text.split('\n')
    expect(lines[0]).toBe('✗ Feature feat-x has 3 violation(s) across 9 tasks')
    expect(lines[1]).toBe('✗ [record-chain] in_progress task has no claim record (feat-x/2.5)')
    expect(lines[2]).toBe('✗ [phase-invariant] feature status disagrees with derived phase')
    expect(lines[3]).toBe('✗ [liveness] task idle beyond threshold (feat-x/3.1)')
    // ✗ 行含任务键（任务级违规）——AC4 锚
    expect(text).toContain('feat-x/2.5')
    expect(text).toContain('feat-x/3.1')
  })
})
