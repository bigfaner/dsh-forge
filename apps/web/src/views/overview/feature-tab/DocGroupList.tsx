// 分层文档列表（定位：业务——4.3 UF-4：文档区标题「文档（N 篇）」+ 中文分组标题
// [需求文档(N)/设计文档(N)/UI 文档(N)…] + 文档行 svg file 图标 + `dir/name`（相对
// feature 目录真实路径）[状态] › 整行可点。M3.1 D17 形态对齐（原型 B 区 m31-doc-row）：
// 📄 emoji 退役 → 24 网格线性 file 件（官方 primitives 无对应件——原型 README 五区
// 「emoji 全退役」记账）+ 零文档空态行（原型 is-empty「（暂无文档）」非命中面）。
// Hard Rule（v18 裁决）：中文分组 = 展示标签（doc-kind-labels 常量）、真实路径 = 数据
// （FeatureDocumentRow.relPath）——两层不混。
// 文档数据 = forge:features/listDocs（4.1 通道）——FeatureDocumentRow 结构兼容直喂
// （无状态字段 → [状态] 恒缺席态；status 可选入参 = 在场态消费面）。
// 组件半身（Build）：onOpenDoc 上抛 relPath 原始值（dock 开 tab——4.6 接线）。
import type { ReactNode } from 'react'
import type { DocKind } from '@dsh-forge/contracts'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { DOC_GROUP_ORDER, DOC_KIND_GROUP_LABELS, type DocGroupName } from './doc-kind-labels.js'
import './feature-tab.css'

/** 文档行线性图标（M3.1 D17——原型 ico('file',13) 同形 24 网格线性件；currentColor
 * 着色随行态归 CSS；aria-hidden 装饰面）。 */
function DocFileIcon(): ReactNode {
  return (
    <svg
      className="dswf-ov-drow-ic"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  )
}

/** 文档行输入（FeatureDocumentRow 结构兼容：docKind/relPath 恒有、status 括注可选缺席） */
export interface DocGroupDoc {
  readonly docKind: DocKind
  /** 相对 forge_dir 真实路径（正斜杠——数据面，展示时裁剪为相对 feature 目录） */
  readonly relPath: string
  /** 状态括注（缺席 = 无 [状态] 段——FeatureDocumentRow 无状态字段恒缺席） */
  readonly status?: string
}

/**
 * 相对 feature 目录真实路径（AC3 数据面）：`docs/features/<slug>/` 前缀裁剪；
 * 非该前缀（悬空容忍——relPath 可指向任意位置）= 原样直出不裁剪。
 */
export function docPathInFeature(relPath: string, featureSlug: string): string {
  const prefix = `docs/features/${featureSlug}/`
  return relPath.startsWith(prefix) ? relPath.slice(prefix.length) : relPath
}

/** 分层分组（组序 = DOC_GROUP_ORDER；组内保持行序；空组不呈现——0 计数组标题缺席） */
export interface DocGroup {
  readonly group: DocGroupName
  readonly docs: readonly DocGroupDoc[]
}

/** 按中文组名聚合（展示标签层——分组归 docKind 映射，路径原值透传） */
export function groupFeatureDocs(docs: readonly DocGroupDoc[]): readonly DocGroup[] {
  return DOC_GROUP_ORDER.map((group) => ({
    group,
    docs: docs.filter((doc) => DOC_KIND_GROUP_LABELS[doc.docKind] === group),
  })).filter((entry) => entry.docs.length > 0)
}

export interface DocGroupListProps {
  /** feature 标识（relPath 前缀裁剪锚——目录路径构造） */
  readonly featureSlug: string
  /** 文档行（forge:features/listDocs 列——featureId 归属过滤归装配层） */
  readonly docs: readonly DocGroupDoc[]
  /** 文档行整行点击（上抛 relPath 原始值——相对 forge_dir；dock 开 tab 归 4.6） */
  readonly onOpenDoc: (relPath: string) => void
}

/** 分层文档列表（AC3：分组标题 + 真实路径文档行 + 状态括注 + 整行可点；零文档 =
 * is-empty 空态行——M3.1 D17 原型形态） */
export function DocGroupList({ featureSlug, docs, onOpenDoc }: DocGroupListProps): ReactNode {
  const groups = groupFeatureDocs(docs)
  return (
    <div className="dswf-ov-dgroups" data-dswf-ov-dgroups={featureSlug}>
      <div className="dswf-ov-docs-head">{`文档（${docs.length} 篇）`}</div>
      {docs.length === 0 ? (
        <div className="dswf-ov-drow is-empty">
          <DocFileIcon />
          <span className="dswf-ov-drow-path">（暂无文档）</span>
        </div>
      ) : null}
      {groups.map((group) => (
        <div key={group.group} className="dswf-ov-dgroup" data-dswf-ov-dgroup={group.group}>
          <div className="dswf-ov-dgroup-title">{`${group.group}（${group.docs.length}）`}</div>
          {group.docs.map((doc) => (
            <Tooltip key={`${doc.docKind}:${doc.relPath}`} label={doc.relPath} portal>
              <button
                type="button"
                className="dswf-ov-drow"
                data-dswf-ov-doc={doc.relPath}
                onClick={() => {
                  onOpenDoc(doc.relPath)
                }}
              >
                <DocFileIcon />
                <span className="dswf-ov-drow-path">{docPathInFeature(doc.relPath, featureSlug)}</span>
                {doc.status === undefined ? null : (
                  <span className="dswf-ov-drow-state">{`[${doc.status}]`}</span>
                )}
                <span className="dswf-ov-drow-arrow" aria-hidden="true">
                  ›
                </span>
              </button>
            </Tooltip>
          ))}
        </div>
      ))}
    </div>
  )
}
