// 知识卡片网格（定位：业务——UF-6 auto-fill 多列卡片网格 + 主体四态）。
// 卡片字段 frontmatter 驱动（KnowledgeCard：标题/摘要/关键词/状态/时间）+ 热度徽章 =
// card.heat 原样呈现（使用事件计数——listEntries 单表同源 join，AC3：UI 零再推导、
// 不另调 heat 通道）。Hard Rule 官方件复用：StateChip（状态）/ HeatBadge（热度）/
// Tag（关键词 chip）/ EmptyState（空态）/ Button（清除过滤/重试）。
// 四态（browseFaceState 推导注入）：骨架（首装/索引重建中）/ 卡片 / 过滤无结果
// （清除过滤入口）/ 空库引导（说明知识目录位置）；错误态 = 错误条或不可用空态
// （rpcUiState 三态映射，typed error 文案透传）。
import type { ReactNode } from 'react'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { KnowledgeCard } from '@dsh-forge/contracts'
import type { RpcUiStateKind } from '../../rpc/ui-state.js'
import { EmptyState, HeatBadge, StateChip } from '../../components/index.js'
import { cardTimeLabel, type BrowseFaceState } from './browse-model.js'
import './knowledge.css'

/** 骨架占位卡片数（首装相位——auto-fill 网格同型占位） */
const SKELETON_CARDS = 8
/** 卡片关键词 chip 上限（原型刻度：slice(0, 4)） */
const KEYWORDS_SHOWN = 4

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
}

/** 网格骨架（UF-6 States「加载中」——索引重建期/首装） */
function GridSkeleton(): ReactNode {
  return (
    <div className="dswf-kn-skeleton" data-dswf-skeleton="" aria-hidden="true">
      {Array.from({ length: SKELETON_CARDS }, (_, i) => (
        <div key={i} className="dswf-kn-skeleton-card" />
      ))}
    </div>
  )
}

/** 单张知识卡片（frontmatter 驱动字段 + 热度徽章——data-dswf-entry = e2e/详情锚） */
function KnowledgeCardView({
  card,
  now,
  onEntryOpen,
}: {
  readonly card: KnowledgeCard
  readonly now: number
  readonly onEntryOpen?: (entryId: number) => void
}): ReactNode {
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
        <StateChip status={card.status} className="dswf-kn-card-status" />
        <HeatBadge count={card.heat} />
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
    <div className="dswf-kn-error" data-dswf-kn-error="" role="alert">
      <span>知识加载失败{errorMessage === undefined ? '' : `：${errorMessage}`}</span>
      {onRetry === undefined ? null : (
        <button type="button" className="dswf-kn-retry" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
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
        <KnowledgeCardView key={card.entryId} card={card} now={now} onEntryOpen={onEntryOpen} />
      ))}
    </div>
  )
}
