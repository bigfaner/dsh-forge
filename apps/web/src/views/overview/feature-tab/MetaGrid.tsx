// 两列元数据网格（定位：业务——4.3 UF-4 展开元数据：摘要独占一行 + 两列网格
// [第一行 标识|阶段、第二行 模式|谱系——谱系右列对齐（v9/v11 裁决）]）。
// 模式 = 远征 mode chip 只读（硬编码恒真——tech-design 裁决⑥：features 恒远征·
// 成链门保证，无 per-feature 数据面；ModeChip 回调缺席 = 只读呈现面）。
// 谱系 = proposal_id 关联链（FeatureCard.proposalSlug 水化反查来源提案）。
// 「标识」原 slug 更名（v18——见名知义）；阶段 = PHASE_PHRASES 短形词汇单源。
// 组件半身（Build）：数据经 props 注入、tab 接线归 4.6。
import type { ReactNode } from 'react'
import { PROPOSAL_STATUS_LABELS, type FeatureCard, type ProposalCard } from '@dsh-forge/contracts'
import { ModeChip } from '../../../components/index.js'
import { PHASE_PHRASES } from '../message-format.js'
import './feature-tab.css'

/** feature 固定模式（恒远征——硬编码恒真：features 无 mode 列，成链门保证一致性） */
export const FEATURE_FIXED_MODE = 'expedition' as const

/**
 * 谱系（proposal_id 关联链水化反查）：proposalSlug 在场且提案行可查 =
 * 「成链自 slug（状态中文）」；在场不可查（提案行缺席——悬空容忍）= 无括注；
 * 缺席（无提案来源）= —。
 */
export function featureLineage(feature: FeatureCard, proposals: readonly ProposalCard[]): string {
  if (feature.proposalSlug === undefined) return '—'
  const source = proposals.find((p) => p.slug === feature.proposalSlug)
  if (source === undefined) return `成链自 ${feature.proposalSlug}`
  return `成链自 ${feature.proposalSlug}（${PROPOSAL_STATUS_LABELS[source.proposalStatus].zh}）`
}

export interface MetaGridProps {
  /** feature 行（标识/阶段/摘要——FeatureCard 数据面） */
  readonly feature: FeatureCard
  /** 无参提案列（谱系反查源——头路装载，不随搜索漂移） */
  readonly proposals: readonly ProposalCard[]
}

/** 元数据键值行（两列网格格元 + 摘要独行共用行语言） */
function MetaRow({ k, children, full }: { k: string; children: ReactNode; full?: boolean }): ReactNode {
  return (
    <div className={full === true ? 'dswf-ov-fmeta-row is-full' : 'dswf-ov-fmeta-row'}>
      <span className="dswf-ov-fmeta-k">{k}</span>
      <span className="dswf-ov-fmeta-v">{children}</span>
    </div>
  )
}

/** 展开元数据块（AC2：摘要独行 + 两列网格 + 只读远征 chip） */
export function MetaGrid({ feature, proposals }: MetaGridProps): ReactNode {
  return (
    <div className="dswf-ov-fmeta" data-dswf-ov-fmeta={feature.slug}>
      <MetaRow k="摘要" full>{feature.summary ?? '—'}</MetaRow>
      <div className="dswf-ov-fmeta-grid">
        <MetaRow k="标识">{feature.slug}</MetaRow>
        <MetaRow k="阶段">{PHASE_PHRASES[feature.featureStatus]}</MetaRow>
        <MetaRow k="模式">
          <ModeChip mode={FEATURE_FIXED_MODE} />
        </MetaRow>
        <MetaRow k="谱系">{featureLineage(feature, proposals)}</MetaRow>
      </div>
    </div>
  )
}
