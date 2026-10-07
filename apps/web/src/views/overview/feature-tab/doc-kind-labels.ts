// doc_kind → 中文组名映射常量（定位：业务——4.3 UF-4 分层文档的 apps/web 展示常量）。
// v18 裁决（Hard Rule）：中文分组 = 展示标签、真实路径 = 数据——两层不混（组名只作分组
// 标题渲染；文档行/消息体路径一律取 FeatureDocumentRow.relPath 真实值——DocGroupList 消费）。
// 词汇封闭：Record<DocKind,…> 全键映射（contracts DOC_KINDS 七值——加类即契约面变更，
// 编译期强制本表同步）。
import type { DocKind } from '@dsh-forge/contracts'

/** 分组名（中文组名——类型面封闭三值） */
export type DocGroupName = '需求文档' | '设计文档' | 'UI 文档'

/** 组序（需求 → 设计 → UI = 目录约定 docs/features/<slug>/ 下 prd·design·ui 三段推进序） */
export const DOC_GROUP_ORDER: readonly DocGroupName[] = ['需求文档', '设计文档', 'UI 文档']

/** doc_kind → 中文组名（展示标签单源——分组标题渲染；无「其它」兜底：词汇封闭全覆盖）。
 *  ui-functions = PRD 四件套之一（prd/prd-ui-functions.md——原型分组同形）→ 需求文档组。 */
export const DOC_KIND_GROUP_LABELS: Readonly<Record<DocKind, DocGroupName>> = {
  'prd-spec': '需求文档',
  'user-stories': '需求文档',
  'ui-functions': '需求文档',
  'tech-design': '设计文档',
  'er-diagram': '设计文档',
  'sql-schema': '设计文档',
  'page-map': 'UI 文档',
}
