// feature 子 tab（定位：业务——UF-1：feature 父行 ▸ 展开元数据[摘要/来源提案/任务七态/
// 文档统计/创建更新] + feature 文档行[名称 + docKind 标签紧贴 + › 行尾]——不含提案文档
// （feature_documents 行级来源，提案文档只在提案子 tab 呈现））。多开并存（openRows 集合）。
// 数据形状 = contracts FeatureCard（byStatus/docCount/proposalSlug 聚合水化）+
// FeatureDocumentRow（fix-2 接线：features.listDocs 列举读面装配注入——OverviewTab 列路
// 三路并发之一；元数据「文档」行呈现 docCount 统计）。
// 文档行点击整行上抛 onOpenDoc（dock 开 tab——4.1 接线）。
import type { ReactNode } from 'react'
import {
  FEATURE_STATUS_LABELS,
  PROPOSAL_STATUS_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type FeatureCard,
  type FeatureDocumentRow,
  type ProposalCard,
  type TaskStatus,
} from '@dsh-forge/contracts'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { EmptyState } from '../../components/index.js'
import { isoTimeLabelZh } from '../../components/time-label.js'
import { featureRowKey } from './overview-model.js'
import './overview.css'

export interface FeatureTabProps {
  /** feature 列表（listFeatures 服务端过滤/排序后） */
  readonly features: readonly FeatureCard[]
  /** 无参提案列（来源提案标题/状态查找——不随搜索漂移） */
  readonly proposals: readonly ProposalCard[]
  /** feature 文档行（fix-2 接线：features.listDocs 列举读面——列路装载注入；featureId 归属过滤在本层） */
  readonly docs?: readonly FeatureDocumentRow[]
  /** 父行展开键集（受控——帧侧 openRows） */
  readonly openRows: ReadonlySet<string>
  /** 父行展开 toggle 上抛 */
  readonly onToggleRow: (key: string) => void
  /** 文档行点击（docRel = feature_documents.rel_path；dock 开 tab——4.1 接线） */
  readonly onOpenDoc: (docRel: string) => void
  /** 空态标题（缺省「暂无 feature」；搜索在场由帧侧注入「无匹配…」——服务端过滤不可自判） */
  readonly emptyTitle?: string
  /** 相对时间基准（缺省 Date.now()——测试注入固定值） */
  readonly now?: number
}

/** 任务总数（七态求和） */
export function featureTaskTotal(byStatus: Readonly<Record<TaskStatus, number>>): number {
  return TASK_STATUSES.reduce((sum, status) => sum + (byStatus[status] ?? 0), 0)
}

/** 七态分布行（非零态「中文标签 N」连接；全零 = 「暂无任务」） */
export function featureStatusSpread(feature: FeatureCard): string {
  const parts = TASK_STATUSES.map((status) => {
    const n = feature.byStatus[status] ?? 0
    return n === 0 ? '' : `${TASK_STATUS_LABELS[status].zh} ${n}`
  }).filter((part) => part !== '')
  return parts.length === 0 ? '暂无任务' : parts.join(' · ')
}

/** 来源提案行（proposalSlug 反查：title（状态）；无 = —） */
export function featureSourceProposal(feature: FeatureCard, proposals: readonly ProposalCard[]): string {
  if (feature.proposalSlug === undefined) return '—'
  const source = proposals.find((p) => p.slug === feature.proposalSlug)
  if (source === undefined) return feature.proposalSlug
  return `${source.title}（${PROPOSAL_STATUS_LABELS[source.proposalStatus].zh}）`
}

/** feature 子 tab（AC4：父行展开元数据 + 文档行[不含提案文档]；多开并存） */
export function FeaturesTab({ features, proposals, docs, openRows, onToggleRow, onOpenDoc, emptyTitle, now }: FeatureTabProps): ReactNode {
  const at = now ?? Date.now()
  if (features.length === 0) {
    return (
      <EmptyState
        className="dswf-ov-empty"
        title={emptyTitle ?? '暂无 feature'}
        description="feature 目录经注册发现面扫描建行"
      />
    )
  }
  return (
    <div className="dswf-ov-list" data-dswf-ov-features="">
      {features.map((feature) => {
        const key = featureRowKey(feature.slug)
        const open = openRows.has(key)
        const done = feature.byStatus.completed ?? 0
        const total = featureTaskTotal(feature.byStatus)
        const featureDocs = docs === undefined ? [] : docs.filter((doc) => doc.featureId === feature.featureId)
        return (
          <div className="dswf-ov-item" key={feature.featureId}>
            <button
              type="button"
              className={open ? 'dswf-ov-parent is-open' : 'dswf-ov-parent'}
              data-dswf-ov-parent={key}
              aria-expanded={open}
              title={feature.title}
              onClick={() => {
                onToggleRow(key)
              }}
            >
              <span className="dswf-ov-caret" aria-hidden="true">
                {open ? '▾' : '▸'}
              </span>
              <span className="dswf-ov-parent-title">{feature.slug}</span>
              <Tag tone="neutral" className="dswf-ov-parent-chip">
                {`${FEATURE_STATUS_LABELS[feature.featureStatus].zh} ${done}/${total}`}
              </Tag>
            </button>
            {open ? (
              <div className="dswf-ov-meta" data-dswf-ov-meta={key}>
                <div className="dswf-ov-meta-row">
                  <span className="dswf-ov-meta-k">摘要</span>
                  <span className="dswf-ov-meta-v">{feature.summary ?? '—'}</span>
                </div>
                <div className="dswf-ov-meta-row">
                  <span className="dswf-ov-meta-k">来源提案</span>
                  <span className="dswf-ov-meta-v">{featureSourceProposal(feature, proposals)}</span>
                </div>
                <div className="dswf-ov-meta-row">
                  <span className="dswf-ov-meta-k">任务</span>
                  <span className="dswf-ov-meta-v">{`${done}/${total} 完成 · ${featureStatusSpread(feature)}`}</span>
                </div>
                <div className="dswf-ov-meta-row">
                  <span className="dswf-ov-meta-k">文档</span>
                  <span className="dswf-ov-meta-v">{`${feature.docCount} 篇`}</span>
                </div>
                <div className="dswf-ov-meta-row">
                  <span className="dswf-ov-meta-k">创建/更新</span>
                  <span
                    className="dswf-ov-meta-v"
                    title={`${feature.createdAt} / ${feature.updatedAt}`}
                  >{`${isoTimeLabelZh(feature.createdAt, at)} / ${isoTimeLabelZh(feature.updatedAt, at)}`}</span>
                </div>
              </div>
            ) : null}
            {featureDocs.map((doc) => (
              <button
                type="button"
                className="dswf-ov-doc"
                key={`${doc.docKind}:${doc.relPath}`}
                data-dswf-ov-doc={doc.relPath}
                title={doc.relPath}
                onClick={() => {
                  onOpenDoc(doc.relPath)
                }}
              >
                <span className="dswf-ov-doc-icon" aria-hidden="true">
                  📄
                </span>
                <span className="dswf-ov-doc-name">{doc.relPath.split('/').pop()}</span>
                <Tag tone="neutral" className="dswf-ov-doc-chip">
                  {doc.docKind}
                </Tag>
                <span className="dswf-ov-spacer" />
                <span className="dswf-ov-doc-arrow" aria-hidden="true">
                  ›
                </span>
              </button>
            ))}
          </div>
        )
      })}
      <p className="dswf-ov-footnote">docs/features/ · 仓内只读</p>
    </div>
  )
}
