// feature 子 tab 升级（定位：业务——M3 4.6 UF-4：阶段 chips 行[列表之上] + feature 父行
// [标题 + 远征 mode chip 只读（硬编码恒真）+ 阶段 tag + 行头「打开新会话→固定远征」] +
// 展开元数据[MetaGrid 两列网格（4.3）+ DocGroupList 分层文档（4.3——features.listDocs）]）。
// feature 列表 = 远征内容（突击无 feature 阶段——v6 ⑪ 裁决）；打开新会话 = 固定切远征 +
// formatPrefill 现状预填（阶段行 + 已生成文档真实路径清单；不含模式；不自动发送）。
// 结构纪律：父行多动作行（展开 toggle / 打开新会话各自独立命中面——零嵌套按钮）；
// 数据形状 = contracts FeatureCard + FeatureDocumentRow（列路三路并发注入——overview-data）。
import type { ReactNode } from 'react'
import {
  TASK_STATUSES,
  type FeatureCard,
  type FeatureDocumentRow,
  type FeatureStatus,
  type ProposalCard,
  type TaskStatus,
} from '@dsh-forge/contracts'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { EmptyState } from '../../components/index.js'
import { ModeChip } from '../../components/index.js'
import { featureRowKey } from './overview-model.js'
import { PHASE_PHRASES, formatPrefill, type PrefillDocLine, type SessionOpenRequest } from './message-format.js'
import { PhaseChips, filterFeaturesByPhases } from './feature-tab/PhaseChips.js'
import { MetaGrid, FEATURE_FIXED_MODE } from './feature-tab/MetaGrid.js'
import { DocGroupList, docPathInFeature } from './feature-tab/DocGroupList.js'
import './overview.css'
import './feature-tab/feature-tab.css'

export interface FeatureTabProps {
  /** feature 列表（listFeatures 服务端 search/sort 后——阶段并集过滤叠加在本层） */
  readonly features: readonly FeatureCard[]
  /** 阶段计数（头路无参聚合单源——不随搜索漂移） */
  readonly counts: Readonly<Record<FeatureStatus, number>>
  /** 阶段激活集（受控——帧侧 toggle 持有；子 tab 切换清空） */
  readonly activePhases: ReadonlySet<FeatureStatus>
  readonly onTogglePhase: (phase: FeatureStatus) => void
  /** 清过滤（缺席 = 无清入口面） */
  readonly onClearPhases?: () => void
  /** 无参提案列（来源提案标题/状态查找——不随搜索漂移） */
  readonly proposals: readonly ProposalCard[]
  /** feature 文档行（features.listDocs 列举读面——列路装载注入；featureId 归属过滤在本层） */
  readonly docs?: readonly FeatureDocumentRow[]
  /** 父行展开键集（受控——帧侧 openRows） */
  readonly openRows: ReadonlySet<string>
  readonly onToggleRow: (key: string) => void
  /** 文档行点击（docRel = feature_documents.rel_path；dock 开 tab——4.1 接线） */
  readonly onOpenDoc: (docRel: string) => void
  /** 行头「打开新会话→固定远征」（缺席 = 按钮不呈现——SSR/非壳载体面） */
  readonly onStartSession?: (request: SessionOpenRequest) => void
  /** @ 锚文档根（帧侧 head 项目行推导——docsRootOf；缺席 = `docs` 缺省锚） */
  readonly docsRoot?: string
  /** 空态标题（缺省「暂无 feature」；搜索在场由帧侧注入「无匹配…」） */
  readonly emptyTitle?: string
  /** 相对时间基准（缺省 Date.now()——测试注入固定值） */
  readonly now?: number
}

/** 任务总数（七态求和） */
export function featureTaskTotal(byStatus: Readonly<Record<TaskStatus, number>>): number {
  return TASK_STATUSES.reduce((sum, status) => sum + (byStatus[status] ?? 0), 0)
}

/** 预填文档行（相对 feature 目录真实路径——v17 ㉙ 真实化裁决；FeatureDocumentRow 无状态字段） */
export function featurePrefillDocs(feature: FeatureCard, docs: readonly FeatureDocumentRow[]): readonly PrefillDocLine[] {
  return docs
    .filter((doc) => doc.featureId === feature.featureId)
    .map((doc) => ({ path: docPathInFeature(doc.relPath, feature.slug) }))
}

/**
 * 打开新会话请求（feature 渠道·UF-4.5）：固定切远征（硬编码恒真——成链门保证）+
 * formatPrefill 现状上下文（@path 首行 → 名称 → 摘要? → 阶段 → 文档真实路径清单 →
 * 「我的意图：」空位）；不自动发送。docsRoot = @ 锚文档根（项目行推导注入；
 * 缺席 = `docs` 缺省锚）。
 */
export function featurePrefillRequest(
  feature: FeatureCard,
  docs: readonly FeatureDocumentRow[],
  docsRoot?: string,
): SessionOpenRequest {
  return {
    mode: FEATURE_FIXED_MODE,
    prefill: formatPrefill(
      {
        kind: 'feature',
        slug: feature.slug,
        title: feature.title,
        ...(feature.summary !== undefined ? { summary: feature.summary } : {}),
        phase: feature.featureStatus,
        ...(docsRoot !== undefined ? { docsRoot } : {}),
      },
      featurePrefillDocs(feature, docs),
    ),
  }
}

/** feature 子 tab（UF-4：阶段 chips + 行头动作 + 两列元数据 + 分层文档；多开并存） */
export function FeaturesTab({
  features,
  counts,
  activePhases,
  onTogglePhase,
  onClearPhases,
  proposals,
  docs,
  openRows,
  onToggleRow,
  onOpenDoc,
  onStartSession,
  docsRoot,
  emptyTitle,
}: FeatureTabProps): ReactNode {
  const visible = filterFeaturesByPhases(features, activePhases)
  const hasFilter = activePhases.size > 0
  if (visible.length === 0) {
    return (
      <div className="dswf-ov-featurepage" data-dswf-ov-featurepage="">
        <PhaseChips counts={counts} active={activePhases} onToggle={onTogglePhase} {...(onClearPhases !== undefined ? { onClear: onClearPhases } : {})} />
        <EmptyState
          className="dswf-ov-empty"
          title={hasFilter ? '无匹配当前阶段过滤的 feature' : (emptyTitle ?? '暂无 feature')}
          description={hasFilter ? '调整或清除过滤后重试' : 'feature 目录经注册发现面扫描建行'}
        />
      </div>
    )
  }
  return (
    <div className="dswf-ov-featurepage" data-dswf-ov-featurepage="">
      {/* 阶段 chips 行——列表之上（UF-4 插入点锚） */}
      <PhaseChips counts={counts} active={activePhases} onToggle={onTogglePhase} {...(onClearPhases !== undefined ? { onClear: onClearPhases } : {})} />
      <div className="dswf-ov-list" data-dswf-ov-features="">
        {visible.map((feature) => {
          const key = featureRowKey(feature.slug)
          const open = openRows.has(key)
          const done = feature.byStatus.completed ?? 0
          const total = featureTaskTotal(feature.byStatus)
          const featureDocs = docs === undefined ? [] : docs.filter((doc) => doc.featureId === feature.featureId)
          return (
            <div className="dswf-ov-item" key={feature.featureId}>
              <div className={open ? 'dswf-ov-parent is-open' : 'dswf-ov-parent'} data-dswf-ov-parent={key}>
                <button
                  type="button"
                  className="dswf-ov-parent-toggle"
                  aria-expanded={open}
                  title={feature.title}
                  data-dswf-ov-parent-toggle={key}
                  onClick={() => {
                    onToggleRow(key)
                  }}
                >
                  <span className="dswf-ov-caret" aria-hidden="true">
                    {open ? '▾' : '▸'}
                  </span>
                  <span className="dswf-ov-parent-title">{feature.slug}</span>
                </button>
                <ModeChip mode={FEATURE_FIXED_MODE} />
                <Tag tone="neutral" className="dswf-ov-parent-chip" data-phase={feature.featureStatus}>
                  {`${PHASE_PHRASES[feature.featureStatus]} ${done}/${total}`}
                </Tag>
                {onStartSession !== undefined ? (
                  <button
                    type="button"
                    className="dswf-ov-act"
                    data-dswf-ov-opensession={feature.slug}
                    title="打开新会话（固定远征模式 + 现状上下文预填·不发送）"
                    onClick={() => {
                      onStartSession(featurePrefillRequest(feature, featureDocs, docsRoot))
                    }}
                  >
                    打开新会话
                  </button>
                ) : null}
              </div>
              {open ? (
                <div className="dswf-ov-meta" data-dswf-ov-meta={key}>
                  <MetaGrid feature={feature} proposals={proposals} />
                  <DocGroupList featureSlug={feature.slug} docs={featureDocs} onOpenDoc={onOpenDoc} />
                </div>
              ) : null}
            </div>
          )
        })}
        <p className="dswf-ov-footnote">docs/features/ · 仓内只读</p>
      </div>
    </div>
  )
}
