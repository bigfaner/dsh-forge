// 知识浏览主体装配（定位：业务——UF-6 浏览主体：工具栏 + 左轨域目录树 + 卡片网格）。
// 组装分工：KnowledgeBrowse（hook 装载壳——3.8 装配挂知识视图槽的唯一入口）持有
// useKnowledgeBrowse（数据 + 过滤态机），KnowledgeBrowseBody（纯渲染——状态/动作注入，
// 全相位 renderToStaticMarkup 可测，ForgeWorkspacePanel 同形制）组合三件
// （KnowledgeToolbar / DomainTree / KnowledgeCardGrid）。网格相位 = browseFaceState
// 纯函数推导（本件零相位判据；error 相位内的三态分流归 KnowledgeCardGrid）。
// 详情抽屉（3.7）经 onEntryOpen 注入，卡片行语言不变。
import type { ReactNode } from 'react'
import type { RpcClientFactory } from '../../rpc/index.js'
import { browseFaceState, hasActiveFilter } from './browse-model.js'
import { DomainTree } from './DomainTree.js'
import { KnowledgeCardGrid } from './KnowledgeCardGrid.js'
import { KnowledgeToolbar, type ScopeProjectOption } from './KnowledgeToolbar.js'
import {
  useKnowledgeBrowse,
  type KnowledgeBrowseActions,
  type KnowledgeBrowseState,
} from './use-knowledge-browse.js'
import './knowledge.css'

export interface KnowledgeBrowseProps {
  /** 当前项目 id（浏览范围——P1 项目级） */
  readonly projectId: string
  /** 可切换项目行集（范围切换控件——archived 排除；缺省 = 纯文本范围 Pill） */
  readonly scopeProjects?: readonly ScopeProjectOption[]
  /** 拾取项目（切换浏览锚——显式拾取优先） */
  readonly onScopePick?: (projectId: string) => void
  /** RPC client 构造器（缺省 preload 真身；注入 = 测试面） */
  readonly makeClient?: RpcClientFactory
  /** 视图激活态（缺省 true；false = 隐藏期 hold，激活翻转全量重拉——AC3 即时累积，4.2 fix-1） */
  readonly active?: boolean
  /** 卡片时间标签基准（缺省当次渲染时刻） */
  readonly now?: number
  /** 卡片点击 → 详情抽屉打开（3.7/3.8 装配；缺席 = 不可点开） */
  readonly onEntryOpen?: (entryId: number) => void
}

export interface KnowledgeBrowseBodyProps {
  /** 浏览状态（useKnowledgeBrowse 输出——全相位可构造，纯渲染面） */
  readonly state: KnowledgeBrowseState
  /** 浏览动作（过滤态机事件 + 重试） */
  readonly actions: KnowledgeBrowseActions
  /** 当前项目 id（范围切换菜单选中行） */
  readonly currentProjectId?: string
  /** 可切换项目行集（范围切换控件；缺省 = 纯文本范围 Pill） */
  readonly scopeProjects?: readonly ScopeProjectOption[]
  /** 拾取项目（切换浏览锚） */
  readonly onScopePick?: (projectId: string) => void
  /** 卡片时间标签基准（缺省当次渲染时刻） */
  readonly now?: number
  /** 卡片点击 → 详情抽屉打开（缺席 = 不可点开） */
  readonly onEntryOpen?: (entryId: number) => void
}

/**
 * 浏览主体纯渲染（状态注入——静态可测全相位）：工具栏 + 左轨域树 + 网格主体。
 * aria-busy = 装载/重拉在途（缓存先行期内容保持可见的「不阻塞」标注）。
 */
export function KnowledgeBrowseBody({
  state,
  actions,
  currentProjectId,
  scopeProjects,
  onScopePick,
  now,
  onEntryOpen,
}: KnowledgeBrowseBodyProps): ReactNode {
  const face = browseFaceState({
    phase: state.phase,
    cardCount: state.cards.length,
    filterActive: hasActiveFilter(state.filter),
  })
  return (
    <section
      className="dswf-kn-browse"
      data-dswf-kn-browse=""
      aria-label="知识库浏览"
      aria-busy={state.busy}
    >
      <KnowledgeToolbar
        keyword={state.filter.keyword}
        onKeywordChange={actions.setKeyword}
        projectName={state.projectName}
        currentProjectId={currentProjectId}
        scopeProjects={scopeProjects}
        onScopePick={onScopePick}
      />
      <div className="dswf-kn-body">
        <aside className="dswf-kn-rail">
          <DomainTree
            nodes={state.nodes}
            total={state.total}
            active={state.filter.domain}
            onSelect={actions.selectDomain}
          />
        </aside>
        <div className="dswf-kn-main">
          <KnowledgeCardGrid
            state={face}
            cards={state.cards}
            now={now ?? Date.now()}
            knowledgeDir={state.knowledgeDir}
            errorMessage={state.error?.message}
            errorUiState={state.error?.uiState}
            onClearFilters={actions.clearFilters}
            onRetry={actions.retry}
            onEntryOpen={onEntryOpen}
          />
        </div>
      </div>
    </section>
  )
}

/**
 * 浏览主体装载壳（hook 装配——数据 + 过滤态机单一来源；3.8 挂知识视图槽）。
 * 首装零数据期呈现骨架（索引直读即瞬时翻卡——AC5 首显不阻塞）。
 */
export function KnowledgeBrowse({
  projectId,
  scopeProjects,
  onScopePick,
  makeClient,
  active,
  now,
  onEntryOpen,
}: KnowledgeBrowseProps): ReactNode {
  const [state, actions] = useKnowledgeBrowse(projectId, makeClient, active)
  return (
    <KnowledgeBrowseBody
      state={state}
      actions={actions}
      currentProjectId={projectId}
      scopeProjects={scopeProjects}
      onScopePick={onScopePick}
      now={now}
      onEntryOpen={onEntryOpen}
    />
  )
}
