// 3.1 单测 —— registerFeature tool（AC2）：参数收窄 + projectId 路由 + camelCase 映射 +
// typed 错误信封（ERR_WORKSPACE_NOT_REGISTERED）+ formatOk 双友好渲染快照
// （plugin-forge tools 测试形制）。成链补链两用注记：成链内聚径（accepted·expedition）
// 由 transitionProposal 服务内聚调用（2.2），本 tool = 显式补链正门——测试面即服务
// 透传（不重复验链）。
import { describe, expect, it } from 'vitest'
import type { FeatureRow, ForgeFeaturesService, RegisterFeatureInput } from '@dsh-forge/contracts'
import type { ToolExecFace } from '../faces.js'
import { createRegisterFeatureTool, parseRegisterFeatureArgs } from './register-feature.js'
import type { ForgeSpecToolDeps } from './index.js'
import { WorkspaceNotRegisteredError } from './session.js'

const EXEC: ToolExecFace = { agent: { session: { id: 'sess-1', header: { cwd: 'C:\\ws\\demo' } } } }

const row: FeatureRow = {
  featureId: 'feat-1',
  slug: 'm3-bootstrap',
  title: 'M3 自举',
  featureStatus: 'prd',
  summary: '双预设 + 拆包 + 提案管线消费',
  proposalId: 'pr-1',
  createdAt: '2026-10-08T00:00:00.000Z',
  updatedAt: '2026-10-08T00:00:00.000Z',
}

function depsWithCapture() {
  const registered: RegisterFeatureInput[] = []
  const features = {
    registerFeature: async (input: RegisterFeatureInput) => {
      registered.push(input)
      return row
    },
  } as unknown as ForgeFeaturesService
  const deps: ForgeSpecToolDeps = {
    features,
    tasks: {} as ForgeSpecToolDeps['tasks'],
    resolveProjectId: (cwd: string) => (cwd.toLowerCase().includes('demo') ? 'p-1' : undefined),
  }
  return { deps, registered }
}

describe('registerFeature', () => {
  it('parse：slug/title 必填；summary/proposal_id 可选；类型自证', () => {
    expect(parseRegisterFeatureArgs({ slug: 'feat-x', title: 'T' })).toEqual({ slug: 'feat-x', title: 'T' })
    expect(
      parseRegisterFeatureArgs({ slug: 'feat-x', title: 'T', summary: 'S', proposal_id: 'pr-9' }),
    ).toEqual({ slug: 'feat-x', title: 'T', summary: 'S', proposal_id: 'pr-9' })
    expect(() => parseRegisterFeatureArgs({ title: 'T' })).toThrow(/slug must be a non-empty string/)
    expect(() => parseRegisterFeatureArgs({ slug: 'feat-x' })).toThrow(/title must be a non-empty string/)
    expect(() => parseRegisterFeatureArgs({ slug: 'feat-x', title: 'T', summary: 1 })).toThrow(
      /summary must be a string/,
    )
    expect(() => parseRegisterFeatureArgs('nope')).toThrow(/arguments must be an object/)
  })

  it('execute：projectId 路由 + camelCase 映射（summary/proposalId）', async () => {
    const { deps, registered } = depsWithCapture()
    const tool = createRegisterFeatureTool(deps)
    await tool.execute({ slug: 'feat-x', title: 'T', summary: 'S', proposal_id: 'pr-9' }, EXEC)
    expect(registered).toEqual([
      {
        projectId: 'p-1',
        slug: 'feat-x',
        title: 'T',
        summary: 'S',
        proposalId: 'pr-9',
      },
    ])
  })

  it('cwd 未命中 → WorkspaceNotRegisteredError（typed 错误信封·code 承载）', async () => {
    const { deps } = depsWithCapture()
    const tool = createRegisterFeatureTool(deps)
    const miss = { agent: { session: { id: 's', header: { cwd: 'C:\\ws\\other' } } } }
    await expect(tool.execute({ slug: 'a', title: 'T' }, miss)).rejects.toThrow(WorkspaceNotRegisteredError)
    const bare = { agent: undefined }
    await expect(tool.execute({ slug: 'a', title: 'T' }, bare)).rejects.toMatchObject({
      code: 'ERR_WORKSPACE_NOT_REGISTERED',
      data: {},
    })
  })

  it('render：formatOk 双友好快照——首行 ✓ + 键值行（featureId/summary/proposalId）', async () => {
    const { deps } = depsWithCapture()
    const tool = createRegisterFeatureTool(deps)
    const result = await tool.execute({ slug: 'm3-bootstrap', title: 'M3 自举' }, EXEC)
    const text = tool.output.render({}, result)[0]?.text ?? ''
    expect(text).toContain('✓ Feature m3-bootstrap registered [prd]')
    expect(text).toContain('- featureId: feat-1')
    expect(text).toContain('- title: M3 自举')
    expect(text).toContain('- summary: 双预设 + 拆包 + 提案管线消费')
    expect(text).toContain('- proposalId: pr-1')
    // 可选行缺省形态（row 无谱系/摘要时不出行）
    const lean = tool.output.render({}, { ...row, summary: undefined, proposalId: undefined })[0]?.text ?? ''
    expect(lean).not.toContain('- summary:')
    expect(lean).not.toContain('- proposalId:')
  })
})
