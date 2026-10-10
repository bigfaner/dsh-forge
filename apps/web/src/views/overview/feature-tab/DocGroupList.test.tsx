// 分层文档列表单测 —— 4.3 AC3：doc_kind → 中文组名映射常量（展示标签）+ 文档行
// svg file 图标 + `dir/name`（相对 feature 目录真实路径 = 数据——v18 裁决两层不混；
// M3.1 D17 原型 m31-doc-row 形态：📄 emoji 退役 → 24 网格线性 file 件——README 五区
// 「emoji 全退役」）+ [状态] 括注（在场/缺席两态——FeatureDocumentRow 无状态字段，
// 缺席 = 恒态）+ 零文档空态行（原型 is-empty 形态）+ 整行可点回调锚
// （data-dswf-ov-doc = relPath 原始值——onOpenDoc 上抛同值；点击链归 4.6/e2e）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DOC_KINDS, type FeatureDocumentRow } from '@dsh-forge/contracts'
import { DocGroupList, docPathInFeature, groupFeatureDocs } from './DocGroupList.js'
import { DOC_GROUP_ORDER, DOC_KIND_GROUP_LABELS } from './doc-kind-labels.js'

const CREATED = '2026-10-01T08:00:00.000Z'

function row(docKind: FeatureDocumentRow['docKind'], relPath: string, status?: string) {
  return {
    featureId: 'f-1',
    docKind,
    relPath,
    ...(status !== undefined ? { status } : {}),
    createdAt: CREATED,
    updatedAt: CREATED,
  }
}

/** 结构兼容：FeatureDocumentRow（无状态字段）直喂 = 状态缺席态 */
const ROWS: readonly FeatureDocumentRow[] = [
  row('prd-spec', 'docs/features/dsh-forge-m3/prd/prd-spec.md'),
  row('ui-functions', 'docs/features/dsh-forge-m3/prd/prd-ui-functions.md'),
  row('tech-design', 'docs/features/dsh-forge-m3/design/tech-design.md'),
  row('sql-schema', 'design/schema.sql'),
  row('page-map', 'docs/features/dsh-forge-m3/ui/page-map.md'),
]

describe('doc_kind → 中文组名映射常量（AC3——apps/web 展示常量）', () => {
  it('DOC_KINDS 七值全覆盖 + 组名 ∈ 组序（Record<DocKind,…> 编译期封闭）', () => {
    expect(DOC_KIND_GROUP_LABELS).toEqual({
      'prd-spec': '需求文档',
      'user-stories': '需求文档',
      'ui-functions': '需求文档',
      'tech-design': '设计文档',
      'er-diagram': '设计文档',
      'sql-schema': '设计文档',
      'page-map': 'UI 文档',
    } satisfies typeof DOC_KIND_GROUP_LABELS)
    for (const kind of DOC_KINDS) {
      expect(DOC_GROUP_ORDER).toContain(DOC_KIND_GROUP_LABELS[kind])
    }
  })

  it('组序常量：需求文档 → 设计文档 → UI 文档（目录约定 prd/design/ui 三段推进序）', () => {
    expect(DOC_GROUP_ORDER).toEqual(['需求文档', '设计文档', 'UI 文档'])
  })
})

describe('真实路径（AC3 纯函数面——数据层不混展示标签）', () => {
  it('docs/features/<slug>/ 前缀裁剪 = 相对 feature 目录真实路径', () => {
    expect(docPathInFeature('docs/features/dsh-forge-m3/prd/prd-spec.md', 'dsh-forge-m3')).toBe(
      'prd/prd-spec.md',
    )
    expect(docPathInFeature('docs/features/dsh-forge-m3/ui/ui-design.md', 'dsh-forge-m3')).toBe(
      'ui/ui-design.md',
    )
  })

  it('悬空路径（非本 feature 前缀——悬空容忍）= 原样直出不裁剪', () => {
    expect(docPathInFeature('design/schema.sql', 'dsh-forge-m3')).toBe('design/schema.sql')
    // 同名前缀但不完整段（前缀后无内容）= 空串守卫（不以部分段误裁）
    expect(docPathInFeature('docs/features/other/prd/x.md', 'dsh-forge-m3')).toBe(
      'docs/features/other/prd/x.md',
    )
  })
})

describe('分组（AC3 纯函数面）', () => {
  it('按组序聚合 + 组内保序 + 空组不呈现', () => {
    const groups = groupFeatureDocs(ROWS)
    expect(groups.map((g) => g.group)).toEqual(['需求文档', '设计文档', 'UI 文档'])
    expect(groups[0]?.docs.map((d) => d.relPath)).toEqual([
      'docs/features/dsh-forge-m3/prd/prd-spec.md',
      'docs/features/dsh-forge-m3/prd/prd-ui-functions.md',
    ])
    expect(groups[1]?.docs.map((d) => d.relPath)).toEqual([
      'docs/features/dsh-forge-m3/design/tech-design.md',
      'design/schema.sql',
    ])
    expect(groups[2]?.docs.map((d) => d.relPath)).toEqual([
      'docs/features/dsh-forge-m3/ui/page-map.md',
    ])
    expect(groupFeatureDocs([])).toEqual([]) // 空组不呈现（全集空 = 无分组）
  })
})

describe('分层文档列表（AC3 渲染面）', () => {
  it('文档区标题含篇数（全量计数）+ 分组标题含组内计数 + 空组不呈现', () => {
    const markup = renderToStaticMarkup(
      <DocGroupList featureSlug="dsh-forge-m3" docs={ROWS} onOpenDoc={() => {}} />,
    )
    expect(markup).toContain('文档（5 篇）')
    expect(markup).toContain('需求文档（2）')
    expect(markup).toContain('设计文档（2）')
    expect(markup).toContain('UI 文档（1）')
    // 空组不呈现：去掉 page-map 后 UI 文档组标题缺席
    const noUi = renderToStaticMarkup(
      <DocGroupList featureSlug="dsh-forge-m3" docs={ROWS.slice(0, 4)} onOpenDoc={() => {}} />,
    )
    expect(noUi).not.toContain('UI 文档（')
    expect(noUi).toContain('文档（4 篇）')
  })

  it('文档行 = 线性 svg file 图标 + 真实路径（前缀裁剪——M3.1 D17 原型 m31-doc-row 形态，📄 emoji 退役）+ [状态] 括注缺席态（FeatureDocumentRow 无状态字段）', () => {
    const markup = renderToStaticMarkup(
      <DocGroupList featureSlug="dsh-forge-m3" docs={ROWS} onOpenDoc={() => {}} />,
    )
    expect(markup).not.toContain('📄') // emoji 全退役（原型 README 五区——线性 svg 全覆盖）
    expect(markup.match(/<svg/g)?.length).toBe(ROWS.length) // 每文档行一枚 file 图标
    expect(markup).toContain('viewBox="0 0 24 24"') // 原型无官方对应件 → 24 网格线性件
    expect(markup).toContain('M14 3H7a2 2 0 0 0-2 2v14') // 原型 ico('file') 原路径（图标几何刻度）
    expect(markup).toContain('prd/prd-spec.md')
    expect(markup).toContain('prd/prd-ui-functions.md')
    expect(markup).toContain('design/tech-design.md')
    expect(markup).toContain('design/schema.sql') // 悬空路径直出
    expect(markup).not.toContain('[') // 状态缺席 = 无括注段
  })

  it('状态在场态：[状态] 括注紧贴路径', () => {
    const withStatus = [
      row('prd-spec', 'docs/features/dsh-forge-m3/prd/prd-spec.md', '已接受'),
      row('ui-functions', 'docs/features/dsh-forge-m3/prd/prd-ui-functions.md'),
    ]
    const markup = renderToStaticMarkup(
      <DocGroupList featureSlug="dsh-forge-m3" docs={withStatus} onOpenDoc={() => {}} />,
    )
    expect(markup).toContain('[已接受]')
    const at = markup.indexOf('prd/prd-ui-functions.md')
    const second = markup.slice(at, markup.indexOf('</button>', at))
    expect(second).not.toContain('[') // 行内缺席态（另一行在场）
  })

  it('整行可点：button 行 + data-dswf-ov-doc 锚 = relPath 原始值（onOpenDoc 上抛同值）+ › 行尾', () => {
    const markup = renderToStaticMarkup(
      <DocGroupList featureSlug="dsh-forge-m3" docs={ROWS} onOpenDoc={() => {}} />,
    )
    const at = markup.indexOf('data-dswf-ov-doc="docs/features/dsh-forge-m3/design/tech-design.md"')
    expect(at).toBeGreaterThanOrEqual(0)
    const btn = markup.slice(markup.lastIndexOf('<button', at), markup.indexOf('</button>', at))
    expect(btn).toContain('type="button"')
    expect(btn).toContain('data-dswf-ov-doc="docs/features/dsh-forge-m3/design/tech-design.md"')
    expect(btn).not.toContain('title=') // D30：relPath 悬停归官方 Tooltip label（原生 title 退役——结构 pin tests/structure/d30）
    expect(btn).toContain('›')
    expect(btn).toContain('design/tech-design.md') // 路径文本（数据面）随图标同行
  })

  it('零文档 = 「文档（0 篇）」+（暂无文档）空态行（原型 m31-doc-row is-empty——非命中面）', () => {
    const markup = renderToStaticMarkup(
      <DocGroupList featureSlug="dsh-forge-m3" docs={[]} onOpenDoc={() => {}} />,
    )
    expect(markup).toContain('文档（0 篇）')
    expect(markup).toContain('（暂无文档）')
    expect(markup).toContain('is-empty')
    expect(markup).not.toContain('<button') // 空态行零交互命中面（非文档行）
    expect(markup).not.toContain('data-dswf-ov-doc=') // 零文档行锚
  })

  it('中文分组 = 展示标签、真实路径 = 数据（v18 两层不混——组名不出现在任何路径文本中）', () => {
    const markup = renderToStaticMarkup(
      <DocGroupList featureSlug="dsh-forge-m3" docs={ROWS} onOpenDoc={() => {}} />,
    )
    expect(markup).not.toContain('需求文档/prd-spec.md')
    expect(markup).not.toContain('设计/schema.sql')
  })
})
