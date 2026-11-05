// 知识卡片网格（定位：业务——UF-6 auto-fill 多列卡片网格 + 主体四态）。
// 卡片字段 frontmatter 驱动（KnowledgeCard：标题/摘要/关键词/状态/时间）+ 热度徽章 =
// card.heat 原样呈现（使用事件计数——listEntries 单表同源 join，AC3：UI 零再推导、
// 不另调 heat 通道）。Hard Rule 官方件复用：StateChip（状态）/ HeatBadge（热度）/
// Tag（关键词 chip）/ EmptyState（空态）/ Button（清除过滤/重试）/ Checkbox（多选勾选——
// 官方 dsh-client-ui-primitives 在场件核销，零自绘）/ Tooltip（chip 快速通过提示）。
// 四态（browseFaceState 推导注入）：骨架（首装/索引重建中）/ 卡片 / 过滤无结果
// （清除过滤入口）/ 空库引导（说明知识目录位置）；错误态 = 错误条或不可用空态
// （rpcUiState 三态映射，typed error 文案透传）。
// knowledge-review-ui（SC-F/SC-B 单卡入口）：多选模式 checkbox 卡片右端与标题同行
// （仅多选模式在场、stopPropagation 不触发卡片开 dialog）；StateChip 仅 unconfirmed 态
// 可点（Tooltip「点击通过」——可点性与状态显示同源），confirmed/superseded 严格只读。
import type { ReactNode } from 'react'
import { Checkbox, Tag, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { KnowledgeCard } from '@dsh-forge/contracts'
import type { RpcUiStateKind } from '../../rpc/ui-state.js'
import { EmptyState, ErrorBar, HeatBadge, SkeletonRows, StateChip } from '../../components/index.js'
import { cardTimeLabel, type BrowseFaceState } from './browse-model.js'
import './knowledge.css'

/** 骨架占位卡片数（首装相位——auto-fill 网格同型占位） */
const SKELETON_CARDS = 8
/** 卡片关键词 chip 上限（原型刻度：slice(0, 4)） */
const KEYWORDS_SHOWN = 4

/** chip 快速通过可点判据（纯函数——可点性与状态显示同源：仅 unconfirmed 可点） */
export function isEntryConfirmable(status: string): boolean {
  return status === 'unconfirmed'
}

export interface KnowledgeCardGridProps {
  /** 主体相位（browseFaceState 纯函数推导注入——本件零相位判据） */
  readonly state: BrowseFaceState
  /** 当前过滤结果卡片（state=cards 时渲染；其余相位忽略） */
  readonly cards: readonly KnowledgeCard[]
  /** 时间标签基准（注入——纯渲染可测） */
  readonly now: number
  /** 知识目录绝对路径（空库引导说明位；null = 未就绪回退通用文案） */
  readonly knowledgeDir?: string | null
  /** 错误文案（error 相位呈现） */
  readonly errorMessage?: string
  /** 错误三态（empty-state → 不可用空态；error-bar/banner → 错误条） */
  readonly errorUiState?: RpcUiStateKind
  /** 清除过滤（无结果空态入口——域 + 关键词一并复位） */
  readonly onClearFilters?: () => void
  /** 重试（错误态/不可用态） */
  readonly onRetry?: () => void
  /** 卡片点击（详情抽屉打开——3.7/3.8 装配；缺席 = 不可点开，行语言保持） */
  readonly onEntryOpen?: (entryId: number) => void
  /** 多选模式在场（SC-F3——checkbox 仅多选模式淡入；非多选模式 DOM 不在场） */
  readonly multiSelect?: boolean
  /** 勾选集（受控——checked 单一来源） */
  readonly selectedEntryIds?: readonly number[]
  /** 勾选/取消单条（checkbox 变更上抛） */
  readonly onToggleSelect?: (entryId: number) => void
  /** 单条快速通过（unconfirmed chip 点击入口——SC-B 链；缺席 = chip 全体只读） */
  readonly onEntryConfirm?: (entryId: number) => void
}

/** 网格骨架（UF-6 States「加载中」——索引重建期/首装；共享件注入 kn 域锚） */
function GridSkeleton(): ReactNode {
  return (
    <SkeletonRows
      className="dswf-kn-skeleton"
      rowClassName="dswf-kn-skeleton-card"
      rows={SKELETON_CARDS}
      anchor="data-dswf-kn-skeleton"
    />
  )
}

/** 单张知识卡片（frontmatter 驱动字段 + 热度徽章——data-dswf-entry = e2e/详情锚） */
function KnowledgeCardView({
  card,
  now,
  onEntryOpen,
  multiSelect,
  selected,
  onToggleSelect,
  onEntryConfirm,
}: {
  readonly card: KnowledgeCard
  readonly now: number
  readonly onEntryOpen?: (entryId: number) => void
  readonly multiSelect?: boolean
  readonly selected?: boolean
  readonly onToggleSelect?: (entryId: number) => void
  readonly onEntryConfirm?: (entryId: number) => void
}): ReactNode {
  // chip 可点态（SC）：unconfirmed + 回调在场 = 可点（Tooltip「点击通过」+ stopPropagation，
  // 不触发卡片本体开 dialog）；其余态严格只读
  const chipFace =
    onEntryConfirm !== undefined && isEntryConfirmable(card.status) ? (
      <Tooltip label="点击通过" portal>
        <span
          role="button"
          tabIndex={0}
          className="dswf-kn-card-chip is-actionable"
          data-dswf-kn-chip-confirm={card.entryId}
          aria-label="点击通过"
          onClick={(event) => {
            event.stopPropagation()
            onEntryConfirm(card.entryId)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.stopPropagation()
            onEntryConfirm(card.entryId)
          }}
        >
          <StateChip status={card.status} />
        </span>
      </Tooltip>
    ) : (
      <StateChip status={card.status} className="dswf-kn-card-status" />
    )
  return (
    <button
      type="button"
      className="dswf-kn-card"
      data-dswf-entry={card.entryId}
      onClick={onEntryOpen === undefined ? undefined : () => {
        onEntryOpen(card.entryId)
      }}
    >
      <span className="dswf-kn-card-top">
        <span className="dswf-kn-card-title">{card.title}</span>
        {chipFace}
        <HeatBadge count={card.heat} />
        {/* 多选 checkbox（SC-F3）：官方 Checkbox——卡片右端与标题同行；事件隔离层
            stopPropagation（勾选不触发卡片开 dialog）；非多选模式 DOM 不在场。
            卡片本体开 dialog 不随多选模式停用（mockup ②：本体=开详情唯一主行为，
            多选模式下依旧可点——勾选隔离只在 checkbox 自身） */}
        {multiSelect ? (
          <span
            className="dswf-kn-card-check"
            data-dswf-kn-card-check=""
            onClick={(event) => {
              event.stopPropagation()
            }}
            onKeyDown={(event) => {
              event.stopPropagation()
            }}
          >
            <Checkbox
              checked={selected === true}
              onChange={() => {
                onToggleSelect?.(card.entryId)
              }}
              label={card.title}
              className="dswf-kn-check"
            />
          </span>
        ) : null}
      </span>
      <span className="dswf-kn-card-abs">{card.summary}</span>
      <span className="dswf-kn-card-keys">
        {card.keywords.slice(0, KEYWORDS_SHOWN).map((keyword) => (
          <Tag key={keyword} tone="outline" className="dswf-kn-key">
            {`#${keyword}`}
          </Tag>
        ))}
      </span>
      <span className="dswf-kn-card-foot">
        <span className="dswf-kn-card-dom">{card.domainPath === '' ? '根' : card.domainPath}</span>
        <span className="dswf-kn-card-time">{cardTimeLabel(card.updated, now)}</span>
      </span>
    </button>
  )
}

/** 错误态（rpcUiState 三态：empty-state → 不可用空态 + 重试；其余 → 错误条 + 重试） */
function GridError({
  errorMessage,
  errorUiState,
  onRetry,
}: {
  readonly errorMessage: string | undefined
  readonly errorUiState: RpcUiStateKind | undefined
  readonly onRetry: (() => void) | undefined
}): ReactNode {
  if (errorUiState === 'empty-state') {
    return (
      <EmptyState
        title="知识暂不可用"
        description={errorMessage ?? '索引不可用，稍后自动恢复'}
        action={
          onRetry === undefined ? undefined : (
            <button type="button" className="dswf-kn-textaction" data-dswf-kn-retry="" onClick={onRetry}>
              重试
            </button>
          )
        }
      />
    )
  }
  return (
    <ErrorBar
      className="dswf-kn-error"
      message={`知识加载失败${errorMessage === undefined ? '' : `：${errorMessage}`}`}
      retryClassName="dswf-kn-textaction"
      anchor="data-dswf-kn-error"
      retryAnchor="data-dswf-kn-retry"
      onRetry={onRetry}
    />
  )
}

/** 知识卡片网格（主体四态容器——auto-fill 多列） */
export function KnowledgeCardGrid({
  state,
  cards,
  now,
  knowledgeDir,
  errorMessage,
  errorUiState,
  onClearFilters,
  onRetry,
  onEntryOpen,
  multiSelect,
  selectedEntryIds,
  onToggleSelect,
  onEntryConfirm,
}: KnowledgeCardGridProps): ReactNode {
  if (state === 'skeleton') return <GridSkeleton />
  if (state === 'error') {
    return <GridError errorMessage={errorMessage} errorUiState={errorUiState} onRetry={onRetry} />
  }
  if (state === 'no-results') {
    return (
      <EmptyState
        title="无匹配知识"
        description="当前域与关键词组合下没有知识条目"
        action={
          onClearFilters === undefined ? undefined : (
            <button type="button" className="dswf-kn-textaction" data-dswf-clear-filters="" onClick={onClearFilters}>
              清除过滤
            </button>
          )
        }
      />
    )
  }
  if (state === 'empty-library') {
    return (
      <EmptyState
        title="尚无知识"
        description={
          knowledgeDir === null || knowledgeDir === undefined
            ? '在项目的知识目录放入带 frontmatter（summary 与 keywords）的 Markdown 文档'
            : `在知识目录放入带 frontmatter（summary 与 keywords）的 Markdown 文档：${knowledgeDir}`
        }
      />
    )
  }
  return (
    <div className="dswf-kn-cards" data-dswf-kn-cards="">
      {cards.map((card) => (
        <KnowledgeCardView
          key={card.entryId}
          card={card}
          now={now}
          onEntryOpen={onEntryOpen}
          multiSelect={multiSelect}
          selected={selectedEntryIds?.includes(card.entryId)}
          onToggleSelect={onToggleSelect}
          onEntryConfirm={onEntryConfirm}
        />
      ))}
    </div>
  )
}
