// 提案子 tab（定位：业务——UF-1：提案父行 ▸ 展开元数据[slug/摘要/作者/创建/裁决/谱系] +
// proposal.md 文档行[名称 + 状态标签紧贴 + › 行尾]）。多开并存（openRows 集合——互不影响）。
// 父行/文档行 = 领域行（官方无对应件自绘，行语言对齐官方 tree-row）；状态标签 = 官方 Tag。
// 数据形状 = contracts ProposalCard/FeatureCard（谱系 = feature.proposalSlug 反查）。
// 文档行点击整行上抛 onOpenDoc（dock 开 tab——4.1 接线；组件不持 dock 依赖）。
import type { ReactNode } from 'react'
import {
  FEATURE_STATUS_LABELS,
  PROPOSAL_STATUS_LABELS,
  type FeatureCard,
  type ProposalCard,
} from '@dsh-forge/contracts'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { EmptyState } from '../../components/index.js'
import { isoTimeLabelZh } from '../../components/time-label.js'
import { proposalRowKey } from './overview-model.js'
import './overview.css'

export interface ProposalTabProps {
  /** 提案列表（listProposals 服务端过滤/排序后） */
  readonly proposals: readonly ProposalCard[]
  /** 无参 feature 列（谱系反查源——头路装载，不随搜索漂移） */
  readonly features: readonly FeatureCard[]
  /** 父行展开键集（受控——帧侧 openRows） */
  readonly openRows: ReadonlySet<string>
  /** 父行展开 toggle 上抛 */
  readonly onToggleRow: (key: string) => void
  /** 文档行点击（docRel = proposals.rel_path；dock 开 tab——4.1 接线） */
  readonly onOpenDoc: (docRel: string) => void
  /** 空态标题（缺省「暂无提案」；搜索在场由帧侧注入「无匹配…」——服务端过滤不可自判） */
  readonly emptyTitle?: string
  /** 相对时间基准（缺省 Date.now()——测试注入固定值） */
  readonly now?: number
}

/** 提案谱系行（feature.proposalSlug 反查：→ slug(状态) 逗号连接；无 = —） */
export function proposalLineage(proposal: ProposalCard, features: readonly FeatureCard[]): string {
  const children = features.filter((f) => f.proposalSlug === proposal.slug)
  if (children.length === 0) return '—（无 feature）'
  return `→ ${children.map((f) => `${f.slug}（${FEATURE_STATUS_LABELS[f.featureStatus].zh}）`).join('，')}`
}

/** 裁决行（decidedAt ? 「时间 → 状态」 : 评审中占位） */
export function proposalVerdict(proposal: ProposalCard, now: number): string {
  if (proposal.decidedAt === undefined) return '—（评审中）'
  return `${isoTimeLabelZh(proposal.decidedAt, now)} → ${PROPOSAL_STATUS_LABELS[proposal.proposalStatus].zh}`
}

/** 提案子 tab（AC4：父行展开元数据 + 文档行；多开并存） */
export function ProposalsTab({ proposals, features, openRows, onToggleRow, onOpenDoc, emptyTitle, now }: ProposalTabProps): ReactNode {
  const at = now ?? Date.now()
  if (proposals.length === 0) {
    return (
      <EmptyState
        className="dswf-ov-empty"
        title={emptyTitle ?? '暂无提案'}
        description="提案由 agent 会话经 createProposal 产生"
      />
    )
  }
  return (
    <div className="dswf-ov-list" data-dswf-ov-proposals="">
      {proposals.map((proposal) => {
        const key = proposalRowKey(proposal.proposalId)
        const open = openRows.has(key)
        return (
          <div className="dswf-ov-item" key={proposal.proposalId}>
            <button
              type="button"
              className={open ? 'dswf-ov-parent is-open' : 'dswf-ov-parent'}
              data-dswf-ov-parent={key}
              aria-expanded={open}
              title={proposal.title}
              onClick={() => {
                onToggleRow(key)
              }}
            >
              <span className="dswf-ov-caret" aria-hidden="true">
                {open ? '▾' : '▸'}
              </span>
              <span className="dswf-ov-parent-title">{proposal.title || proposal.slug}</span>
              <Tag tone="neutral" className="dswf-ov-parent-chip">
                {PROPOSAL_STATUS_LABELS[proposal.proposalStatus].zh}
              </Tag>
            </button>
            {open ? (
              <div className="dswf-ov-meta" data-dswf-ov-meta={key}>
                <div className="dswf-ov-meta-row">
                  <span className="dswf-ov-meta-k">slug</span>
                  <span className="dswf-ov-meta-v" title={proposal.slug}>
                    {proposal.slug}
                  </span>
                </div>
                {/* 摘要行缺席：contracts ProposalRow 无 summary 字段（Interface 3 数据形状权威）——
                    提案摘要在文档 tab（DocContent.summary）承载，行级不重复 */}
                <div className="dswf-ov-meta-row">
                  <span className="dswf-ov-meta-k">作者</span>
                  <span className="dswf-ov-meta-v">{proposal.author ?? '—'}</span>
                </div>
                <div className="dswf-ov-meta-row">
                  <span className="dswf-ov-meta-k">创建</span>
                  <span className="dswf-ov-meta-v" title={proposal.createdAt}>
                    {isoTimeLabelZh(proposal.createdAt, at)}
                  </span>
                </div>
                <div className="dswf-ov-meta-row">
                  <span className="dswf-ov-meta-k">裁决</span>
                  <span className="dswf-ov-meta-v">{proposalVerdict(proposal, at)}</span>
                </div>
                <div className="dswf-ov-meta-row">
                  <span className="dswf-ov-meta-k">谱系</span>
                  <span className="dswf-ov-meta-v">{proposalLineage(proposal, features)}</span>
                </div>
              </div>
            ) : null}
            {proposal.relPath === undefined ? null : (
              <button
                type="button"
                className="dswf-ov-doc"
                data-dswf-ov-doc={proposal.relPath}
                title={proposal.relPath}
                onClick={() => {
                  onOpenDoc(proposal.relPath as string)
                }}
              >
                <span className="dswf-ov-doc-icon" aria-hidden="true">
                  📄
                </span>
                <span className="dswf-ov-doc-name">{proposal.relPath.split('/').pop()}</span>
                <Tag tone="neutral" className="dswf-ov-doc-chip">
                  {PROPOSAL_STATUS_LABELS[proposal.proposalStatus].zh}
                </Tag>
                <span className="dswf-ov-spacer" />
                <span className="dswf-ov-doc-arrow" aria-hidden="true">
                  ›
                </span>
              </button>
            )}
          </div>
        )
      })}
      <p className="dswf-ov-footnote">docs/proposals/ · 仓内只读</p>
    </div>
  )
}
