// 知识浏览主体装配（定位：业务——UF-6 浏览主体：工具栏 + 左轨域目录树 + 卡片网格）。
// 组装分工：KnowledgeBrowse（hook 装载壳——3.8 装配挂知识视图槽的唯一入口）持有
// useKnowledgeBrowse（数据 + 过滤态机），KnowledgeBrowseBody（纯渲染——状态/动作注入，
// 全相位 renderToStaticMarkup 可测，ForgeWorkspacePanel 同形制）组合三件
// （KnowledgeToolbar / DomainTree / KnowledgeCardGrid）。网格相位 = browseFaceState
// 纯函数推导（本件零相位判据；error 相位内的三态分流归 KnowledgeCardGrid）。
// 详情抽屉（3.7）经 onEntryOpen 注入，卡片行语言不变。
import { useEffect, useRef, type ReactNode } from 'react'
import type { RpcClientFactory } from '../../rpc/index.js'
import { browseFaceState, hasActiveFilter } from './browse-model.js'
import { DomainTree } from './DomainTree.js'
import { KnowledgeCardGrid } from './KnowledgeCardGrid.js'
import { KnowledgeToolbar, type ScopeProjectOption } from './KnowledgeToolbar.js'
import {
  useKnowledgeBrowse,
  type KnowledgeBrowseActions,
  type KnowledgeBrowseState,
  type KnowledgeMultiSelectActions,
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
  /**
   * 浏览重拉句柄绑定（bug c21a3d0c——dialog 标题栏动作成功后浏览重拉链）：
   * 装载壳挂载时把 retry 句柄交给装配面（KnowledgeView 持引用 → EntryDrawer onMutated 触发）。
   * 恒等回调（装配面 useCallback）只绑一次；缺省 = 不绑定。
   */
  readonly bindRefetch?: (refetch: () => void) => void
}

export interface KnowledgeBrowseBodyProps {
  /** 浏览状态（useKnowledgeBrowse 输出——全相位可构造，纯渲染面） */
  readonly state: KnowledgeBrowseState
  /** 浏览动作（过滤态机事件 + 重试） */
  readonly actions: KnowledgeBrowseActions
  /** 多选与裁决动作（SC-F——entryAction 执行 + 动作后重拉；缺席 = 多选面零动作形态） */
  readonly multiActions?: KnowledgeMultiSelectActions
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
  /** 新建目录（DomainTree 树头「＋」上抛——entryAction createDomain；缺席 = 钮不渲染） */
  readonly onCreateDomain?: (domainPath: string) => void
  /** 拖拽落位（DomainTree 域行 drop 上抛——entryAction move；缺席 = 行非落点） */
  readonly onMoveEntry?: (entryId: number, targetDomain: string) => void
}

/**
 * 浏览主体纯渲染（状态注入——静态可测全相位）：工具栏 + 左轨域树 + 网格主体。
 * aria-busy = 装载/重拉在途（缓存先行期内容保持可见的「不阻塞」标注）。
 */
export function KnowledgeBrowseBody({
  state,
  actions,
  multiActions,
  currentProjectId,
  scopeProjects,
  onScopePick,
  now,
  onEntryOpen,
  onCreateDomain,
  onMoveEntry,
}: KnowledgeBrowseBodyProps): ReactNode {
  const face = browseFaceState({
    phase: state.phase,
    cardCount: state.cards.length,
    filterActive: hasActiveFilter(state.filter),
  })
  const filteredIds = state.cards.map((card) => card.entryId)
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
        statusFilter={state.filter.statusFilter ?? 'all'}
        onStatusFilterChange={actions.setStatusFilter}
        multiSelectActive={state.multiSelect.active}
        selectedCount={state.multiSelect.selected.length}
        totalCount={filteredIds.length}
        onToggleMultiSelect={() => {
          if (multiActions === undefined) return
          if (state.multiSelect.active) multiActions.exitMultiSelect()
          else multiActions.enterMultiSelect()
        }}
        onSelectAll={multiActions?.selectAll}
        onConfirmSelected={
          multiActions === undefined
            ? undefined
            : () => {
                void multiActions.confirmSelected()
              }
        }
        onRejectSelected={
          multiActions === undefined
            ? undefined
            : () => {
                void multiActions.rejectSelected()
              }
        }
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
            onCreateDomain={onCreateDomain}
            onMoveEntry={onMoveEntry}
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
            multiSelect={state.multiSelect.active}
            selectedEntryIds={state.multiSelect.selected}
            onToggleSelect={multiActions?.toggleEntry}
            onEntryConfirm={
              multiActions === undefined ||
              !(state.filter.statusFilter === undefined || state.filter.statusFilter === 'all' || state.filter.statusFilter === 'unconfirmed')
                ? undefined
                : (entryId) => {
                    void multiActions.confirmEntry(entryId)
                  }
            }
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
  bindRefetch,
}: KnowledgeBrowseProps): ReactNode {
  const [state, actions, multiActions, treeActions] = useKnowledgeBrowse(projectId, makeClient, active)
  // 重拉句柄绑定（bug c21a3d0c）：retry 恒定（useCallback 零依赖），经 ref 透出恒等包装——
  // effect 仅随 bindRefetch 恒等回调跑一次
  const retryRef = useRef(actions.retry)
  retryRef.current = actions.retry
  useEffect(() => {
    if (bindRefetch === undefined) return
    bindRefetch(() => {
      retryRef.current()
    })
  }, [bindRefetch])
  return (
    <KnowledgeBrowseBody
      state={state}
      actions={actions}
      multiActions={multiActions}
      currentProjectId={projectId}
      scopeProjects={scopeProjects}
      onScopePick={onScopePick}
      now={now}
      onEntryOpen={onEntryOpen}
      onCreateDomain={(domainPath) => {
        void treeActions.createDomain(domainPath)
      }}
      onMoveEntry={(entryId, targetDomain) => {
        void treeActions.moveEntry(entryId, targetDomain)
      }}
    />
  )
}
