// 3.1 单测 —— upsertFeatureDoc tool（AC3）：参数收窄（doc_kind 词表 = contracts
// DOC_KINDS 七值单源）+ projectId 路由 + 映射（featureSlug 自然键——Interface 1 服务
// 签名单源，slug→id 服务内解析）+ typed 错误信封 + formatOk 渲染快照。
// 审计伴随（feature_records(doc-upsert)）经服务闭包——插件零审计代码，测试面即透传。
import { describe, expect, it } from 'vitest'
import type { FeatureDocumentRow, ForgeFeaturesService, UpsertFeatureDocInput } from '@dsh-forge/contracts'
import type { ToolExecFace } from '../faces.js'
import { createUpsertFeatureDocTool, parseUpsertFeatureDocArgs } from './upsert-feature-doc.js'
import type { ForgeSpecToolDeps } from './index.js'
import { WorkspaceNotRegisteredError } from './session.js'

const EXEC: ToolExecFace = { agent: { session: { id: 'sess-1', header: { cwd: 'C:\\ws\\demo' } } } }

const docRow: FeatureDocumentRow = {
  featureId: 'feat-1',
  docKind: 'tech-design',
  relPath: 'features/m3-bootstrap/design/tech-design.md',
  summary: '八工件 + 三关键机制',
  createdAt: '2026-10-08T00:00:00.000Z',
  updatedAt: '2026-10-08T12:00:00.000Z',
}

function depsWithCapture() {
  const upserted: UpsertFeatureDocInput[] = []
  const features = {
    upsertFeatureDoc: async (input: UpsertFeatureDocInput) => {
      upserted.push(input)
      return docRow
    },
  } as unknown as ForgeFeaturesService
  const deps: ForgeSpecToolDeps = {
    features,
    tasks: {} as ForgeSpecToolDeps['tasks'],
    resolveProjectId: (cwd: string) => (cwd.toLowerCase().includes('demo') ? 'p-1' : undefined),
  }
  return { deps, upserted }
}

describe('upsertFeatureDoc', () => {
  it('parse：feature_slug/doc_kind/rel_path 必填；doc_kind 词表收窄；summary 可选', () => {
    expect(
      parseUpsertFeatureDocArgs({ feature_slug: 'feat-x', doc_kind: 'prd-spec', rel_path: 'a/b.md' }),
    ).toEqual({ feature_slug: 'feat-x', doc_kind: 'prd-spec', rel_path: 'a/b.md' })
    expect(
      parseUpsertFeatureDocArgs({ feature_slug: 'feat-x', doc_kind: 'ui-functions', rel_path: 'a/b.md', summary: 'S' }),
    ).toMatchObject({ summary: 'S' })
    expect(() => parseUpsertFeatureDocArgs({ feature_slug: 'feat-x', rel_path: 'a/b.md' })).toThrow(
      /doc_kind must be one of/,
    )
    expect(() =>
      parseUpsertFeatureDocArgs({ feature_slug: 'feat-x', doc_kind: 'random-doc', rel_path: 'a/b.md' }),
    ).toThrow(/doc_kind must be one of \[prd-spec, user-stories, ui-functions, tech-design, er-diagram, sql-schema, page-map\]/)
    expect(() => parseUpsertFeatureDocArgs({ doc_kind: 'prd-spec', rel_path: 'a/b.md' })).toThrow(/feature_slug/)
    expect(() => parseUpsertFeatureDocArgs({ feature_slug: 'feat-x', doc_kind: 'prd-spec' })).toThrow(/rel_path/)
  })

  it('execute：projectId 路由 + featureSlug 自然键映射（uuid 锚不进 agent 面）', async () => {
    const { deps, upserted } = depsWithCapture()
    const tool = createUpsertFeatureDocTool(deps)
    await tool.execute(
      { feature_slug: 'feat-x', doc_kind: 'tech-design', rel_path: 'features/f/design/tech-design.md', summary: 'S' },
      EXEC,
    )
    expect(upserted).toEqual([
      {
        projectId: 'p-1',
        featureSlug: 'feat-x',
        docKind: 'tech-design',
        relPath: 'features/f/design/tech-design.md',
        summary: 'S',
      },
    ])
  })

  it('cwd 未命中 → WorkspaceNotRegisteredError（typed 错误信封）', async () => {
    const { deps } = depsWithCapture()
    const tool = createUpsertFeatureDocTool(deps)
    await expect(
      tool.execute(
        { feature_slug: 'a', doc_kind: 'prd-spec', rel_path: 'x.md' },
        { agent: { session: { id: 's', header: { cwd: 'C:\\ws\\x' } } } },
      ),
    ).rejects.toThrow(WorkspaceNotRegisteredError)
  })

  it('render：formatOk 双友好快照——首行 ✓ + relPath/summary/updatedAt 行', async () => {
    const { deps } = depsWithCapture()
    const tool = createUpsertFeatureDocTool(deps)
    const result = await tool.execute({ feature_slug: 'feat-x', doc_kind: 'tech-design', rel_path: 'a.md' }, EXEC)
    const text = tool.output.render({}, result)[0]?.text ?? ''
    expect(text).toContain('✓ tech-design doc registered for feature')
    expect(text).toContain('- relPath: features/m3-bootstrap/design/tech-design.md')
    expect(text).toContain('- summary: 八工件 + 三关键机制')
    expect(text).toContain('- updatedAt: 2026-10-08T12:00:00.000Z')
    // 可选行缺省形态
    const lean = tool.output.render({}, { ...docRow, summary: undefined })[0]?.text ?? ''
    expect(lean).not.toContain('- summary:')
  })
})
