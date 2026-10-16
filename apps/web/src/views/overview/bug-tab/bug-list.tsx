// Bug 子 tab 列表视图（定位：业务——fix-bug 概览第 4 子 tab；行样式对齐提案行体系
// （dswf-ov-item/parent——标题左 + 状态圆点色区分[无状态文字] + error_type chip 右靠，
// 时间不呈现）；行不展开——点击整行上抛 onOpenBug（详情弹框）。chips 三态计数 0 计数
// disabled（同任务 chips 语义）；搜索/排序控件归 sticky-bar（帧侧统一），本组件仅承载
// chips 过滤 + 行集呈现。
// Hard Rule「搜索过滤服务端承载」：本组件零本地过滤——bugs 行集即服务端过滤后结果。
// bug-recurrence-chain 1.6：链折叠行（mockup ①区逐位对照）——链根 summary 代表整链 +
// 「复发 N 次」红徽标（N = 链条数−1）+ 链聚合态状态点（任一 open 即 error，否则最新条
// 终态色）+ chevron 展开位（零链行留白对齐）；展开区时间正序子行（定位词 + 日期 + 已修
// commit 短哈希，点击开该条详情）。链数据自 listBugs 响应 BugCard.recurrenceOf 前驱指针
// 查询期展开（零链行语言完全不变）。
import { useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { BUG_STATUSES, BUG_STATUS_LABELS, type BugCard, type BugStatus } from '@dsh-forge/contracts'
import { StateDot, Tag, type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import { EmptyState } from '../../../components/index.js'
import { diagStampOf } from '../message-format.js'
import { hasActiveStatusFilter, isChipDisabled } from '../overview-model.js'

/** BugStatus → 官方 StateDot 语义（open 待修复 = error；fixed 已修复 = done；unresolved 无法复现 = idle） */
export const BUG_STATUS_DOT_STATE: Readonly<Record<BugStatus, StateDotState>> = {
  open: 'error',
  fixed: 'done',
  unresolved: 'idle',
}

/**
 * 链分组投影（listBugs 响应 → 链折叠视图模型）：沿 BugCard.recurrenceOf 前驱指针展开的
 * 链快照。chains = 链根 bug_id → 链上条目（时间正序，链根在前）；memberRootOf = 成员 →
 * 链根（渲染期跳过顶层重复行）。链根 = recurrenceOf 缺省或悬空（指向 bug 不在行集——
 * 状态过滤剔除原链根时剩余子链按新根成组）；孤条（单条）不入组。
 */
export interface BugChainGroups {
  readonly chains: ReadonlyMap<string, readonly BugCard[]>
  readonly memberRootOf: ReadonlyMap<string, string>
}

export function bugChainGroups(bugs: readonly BugCard[]): BugChainGroups {
  const byId = new Map(bugs.map((bug) => [bug.bugId, bug]))
  // 前驱 → 直接后继（多叉防御——正常链每前驱至多一后继）
  const childrenOf = new Map<string, string[]>()
  for (const bug of bugs) {
    if (bug.recurrenceOf === undefined) continue
    if (!byId.has(bug.recurrenceOf)) continue
    const list = childrenOf.get(bug.recurrenceOf)
    if (list === undefined) childrenOf.set(bug.recurrenceOf, [bug.bugId])
    else list.push(bug.bugId)
  }
  const chains = new Map<string, BugCard[]>()
  const memberRootOf = new Map<string, string>()
  for (const root of bugs) {
    // 链根 = recurrenceOf 缺省或悬空（指向 bug 不在行集）——悬空根按链根回落
    if (root.recurrenceOf !== undefined && byId.has(root.recurrenceOf)) continue
    // BFS 收集整链成员（沿前驱指针的正向展开）
    const entries: BugCard[] = [root]
    const seen = new Set([root.bugId])
    for (let i = 0; i < entries.length; i++) {
      for (const childId of childrenOf.get(entries[i]!.bugId) ?? []) {
        if (seen.has(childId)) continue
        seen.add(childId)
        const child = byId.get(childId)
        if (child !== undefined) entries.push(child)
      }
    }
    if (entries.length < 2) continue // 孤条不入组
    entries.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0)) // 时间正序（链根在前）
    chains.set(root.bugId, entries)
    for (const entry of entries) memberRootOf.set(entry.bugId, root.bugId)
  }
  return { chains, memberRootOf }
}

/** 链聚合态状态点（折叠行）：链上任一 open 即 error；否则取链上最新条终态色 */
export function chainDotState(entries: readonly BugCard[]): StateDotState {
  if (entries.some((entry) => entry.bugStatus === 'open')) return 'error'
  return BUG_STATUS_DOT_STATE[entries[entries.length - 1]!.bugStatus]
}

/** 链成员定位词（时间正序位次）：链根 / 复发① / 复发② … */
export function chainEntryKind(index: number): string {
  return index === 0 ? '链根' : `复发${'①②③④⑤⑥⑦⑧⑨⑩'[index - 1] ?? index}`
}

/** 已修 commit 短哈希（7 位——mockup 刻度） */
function shortHash(commitHash: string): string {
  return commitHash.slice(0, 7)
}

export interface BugStatusChipsProps {
  /** 三态计数（无参全量行投影——0 计数禁用） */
  readonly counts: Readonly<Record<BugStatus, number>>
  /** 激活集（受控——帧侧 toggleBugStatusFilter） */
  readonly active: ReadonlySet<BugStatus>
  /** chip toggle 上抛 */
  readonly onToggle: (status: BugStatus) => void
  /** 清过滤上抛（任一激活时呈现入口；缺席 = 无清入口面） */
  readonly onClear?: () => void
}

/** Bug 三态状态过滤 chips（表驱动 BUG_STATUSES 行序；0 计数 disabled 同任务 chips 语义） */
export function BugStatusChips({ counts, active, onToggle, onClear }: BugStatusChipsProps): ReactNode {
  const hasFilter = hasActiveStatusFilter(active)
  return (
    <div className="dswf-ov-stchips" role="group" aria-label="状态过滤" data-dswf-ov-bschips="">
      {BUG_STATUSES.map((status) => {
        const count = counts[status] ?? 0
        const disabled = isChipDisabled(count)
        const on = active.has(status)
        const cls = ['dswf-ov-stchip', on ? 'is-on' : '', disabled ? 'is-zero' : ''].filter(Boolean).join(' ')
        return (
          <button
            key={status}
            type="button"
            className={cls}
            data-dswf-ov-bschip={status}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => {
              onToggle(status)
            }}
          >
            <StateDot state={BUG_STATUS_DOT_STATE[status]} size={8} />
            <span className="dswf-ov-stchip-label">{BUG_STATUS_LABELS[status].zh}</span>
            <span className="dswf-ov-stchip-count">{count}</span>
          </button>
        )
      })}
      {hasFilter && onClear !== undefined ? (
        <button
          type="button"
          className="dswf-ov-stchip dswf-ov-stchip-clear"
          data-dswf-ov-bschip-clear=""
          onClick={onClear}
        >
          ✕ 重置
        </button>
      ) : null}
    </div>
  )
}

/** 单 Bug 行（提案行同构——dswf-ov-item/parent flex：状态点[色区分状态] + summary 标题
 *  靠左 + error_type chip 右靠；无展开/无状态文字/无时间。onOpenBug 在场 = 整行可点
 *  role=button 键盘可达，点击上抛开详情弹框；缺席 = 静态呈现。onAddBugToSession 在场 =
 *  行内纯增「添加到会话中」控件（composer-bug-reference 1.4——stopPropagation 不触发
 *  行点击；缺席 = 行语言零变化） */
function BugRow({
  bug,
  onOpenBug,
  onAddBugToSession,
}: {
  readonly bug: BugCard
  readonly onOpenBug?: (bugId: string) => void
  readonly onAddBugToSession?: (bug: BugCard) => void
}): ReactNode {
  const handleKey = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpenBug?.(bug.bugId)
    }
  }
  const stop = (event: { stopPropagation(): void }): void => {
    event.stopPropagation()
  }
  return (
    <div
      className="dswf-ov-item"
      data-dswf-ov-bugrow={bug.bugId}
      {...(onOpenBug !== undefined
        ? { role: 'button', tabIndex: 0, onClick: () => onOpenBug(bug.bugId), onKeyDown: handleKey }
        : {})}
    >
      <div className="dswf-ov-parent">
        <span className="dswf-ov-bugrow-chev is-hidden" aria-hidden="true" />
        <StateDot state={BUG_STATUS_DOT_STATE[bug.bugStatus]} size={8} />
        <span className="dswf-ov-parent-title">{bug.summary}</span>
        {bug.errorType !== undefined ? (
          <span data-dswf-ov-bugrow-type={bug.errorType}>
            <Tag tone="neutral" className="dswf-ov-parent-chip">{bug.errorType}</Tag>
          </span>
        ) : null}
        {onAddBugToSession !== undefined ? (
          <button
            type="button"
            className="dswf-ov-bugrow-add"
            data-dswf-ov-bugrow-add=""
            onClick={(event) => {
              stop(event)
              onAddBugToSession(bug)
            }}
            onKeyDown={stop}
          >
            添加到会话中
          </button>
        ) : null}
      </div>
    </div>
  )
}
export interface BugListProps {
  /** Bug 行集（服务端 search/status/sort 后结果——零本地过滤；链折叠自 recurrenceOf 展开） */
  readonly bugs: readonly BugCard[]
  /** 三态计数（无参全量行投影——chips 计数单源） */
  readonly counts: Readonly<Record<BugStatus, number>>
  /** 激活集（受控——帧侧模型） */
  readonly activeStatuses: ReadonlySet<BugStatus>
  readonly onToggleStatus: (status: BugStatus) => void
  readonly onClearStatuses?: () => void
  /** 行点击 → 详情弹框回调（后续切片接线；缺席 = 行静态呈现） */
  readonly onOpenBug?: (bugId: string) => void
  /** 行「添加到会话中」上抛（1.4——装配注入；缺席 = 按钮不呈现） */
  readonly onAddBugToSession?: (bug: BugCard) => void
  /** 空态标题（缺省「暂无 Bug」；搜索在场由帧侧注入「无匹配…」） */
  readonly emptyTitle?: string
  /** 展开链集初始值（受控测试缝——缺省全收起） */
  readonly initialOpenChainIds?: readonly string[]
}

/** 链展开子行（时间正序位次——定位词 + summary 摘录 + 日期 + 已修 commit 短哈希；
 *  整行可点 role=button 键盘可达（既有行语言）→ 打开该条详情弹框） */
function ChainChildRow({ entry, index, onOpenBug }: {
  readonly entry: BugCard
  readonly index: number
  readonly onOpenBug?: (bugId: string) => void
}): ReactNode {
  const fixed = entry.commitHash !== undefined
  const meta = `${diagStampOf(entry.createdAt).slice(0, 5)}${fixed ? ` 已修 ${shortHash(entry.commitHash!)}` : ''}`
  const handleKey = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpenBug?.(entry.bugId)
    }
  }
  return (
    <div
      className="dswf-ov-bugrow-child"
      data-dswf-ov-bugrow-child={entry.bugId}
      {...(onOpenBug !== undefined
        ? { role: 'button', tabIndex: 0, onClick: () => onOpenBug(entry.bugId), onKeyDown: handleKey }
        : {})}
    >
      <StateDot state={BUG_STATUS_DOT_STATE[entry.bugStatus]} size={8} />
      <span className="dswf-ov-bugrow-child-title">
        <span className="dswf-ov-bugrow-child-kind">{chainEntryKind(index)}</span>
        {entry.summary}
      </span>
      <span className="dswf-ov-bugrow-child-meta">{meta}</span>
    </div>
  )
}

/** 链折叠行（mockup ①区逐位对照）：chevron + 链聚合态状态点 + 链根 summary +
 *  「复发 N 次」红徽标（N = 链条数−1，置于 errorType chip 左）；行点击 = 整链展开/收起；
 *  展开区 = 缩进左竖线子行集（时间正序，链根在上）。 */
function BugChainRow({ entries, expanded, onToggle, onOpenBug }: {
  readonly entries: readonly BugCard[]
  readonly expanded: boolean
  readonly onToggle: () => void
  readonly onOpenBug?: (bugId: string) => void
}): ReactNode {
  const root = entries[0]!
  const dotState = chainDotState(entries)
  const handleKey = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onToggle()
    }
  }
  return (
    <div className="dswf-ov-item" data-dswf-ov-chainitem="">
      <div
        className="dswf-ov-parent"
        data-dswf-ov-chainrow={root.bugId}
        data-dswf-ov-chain-state={dotState}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={handleKey}
      >
        <span className="dswf-ov-bugrow-chev" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        <StateDot state={dotState} size={8} />
        <span className="dswf-ov-parent-title">{root.summary}</span>
        <span className="dswf-ov-bugrow-rbadge" data-dswf-ov-bugrow-rbadge="">
          复发 {entries.length - 1} 次
        </span>
        {root.errorType !== undefined ? (
          <span data-dswf-ov-bugrow-type={root.errorType}>
            <Tag tone="neutral" className="dswf-ov-parent-chip">{root.errorType}</Tag>
          </span>
        ) : null}
      </div>
      {expanded ? (
        <div className="dswf-ov-bugrow-children" data-dswf-ov-bugrow-children="">
          {entries.map((entry, index) => (
            <ChainChildRow key={entry.bugId} entry={entry} index={index} {...(onOpenBug !== undefined ? { onOpenBug } : {})} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Bug 子 tab 列表视图（chips 行 + 行集；空态 = EmptyState——过滤在场/缺省双标题；
 *  链折叠自 listBugs 响应 recurrenceOf 展开——链根行代表整链，成员不重复出顶层行） */
export function BugList({ bugs, counts, activeStatuses, onToggleStatus, onClearStatuses, onOpenBug, onAddBugToSession, emptyTitle, initialOpenChainIds }: BugListProps): ReactNode {
  const hasFilter = hasActiveStatusFilter(activeStatuses)
  const [openChains, setOpenChains] = useState<ReadonlySet<string>>(() => new Set(initialOpenChainIds ?? []))
  const { chains, memberRootOf } = bugChainGroups(bugs)
  const toggleChain = (rootBugId: string): void => {
    setOpenChains((prev) => {
      const next = new Set(prev)
      if (next.has(rootBugId)) next.delete(rootBugId)
      else next.add(rootBugId)
      return next
    })
  }
  return (
    <div className="dswf-ov-bugpage" data-dswf-ov-bugpage="">
      <BugStatusChips counts={counts} active={activeStatuses} onToggle={onToggleStatus} {...(onClearStatuses !== undefined ? { onClear: onClearStatuses } : {})} />
      {bugs.length === 0 ? (
        <EmptyState
          className="dswf-ov-empty"
          title={hasFilter ? '无匹配当前状态过滤的 Bug' : (emptyTitle ?? '暂无 Bug')}
          description={hasFilter ? '调整或清除过滤后重试' : 'Bug 由 fix-bug 流程经 recordBug 登记'}
        />
      ) : (
        <div className="dswf-ov-list" data-dswf-ov-bugs="">
          {bugs.map((bug) => {
            const rootBugId = memberRootOf.get(bug.bugId)
            if (rootBugId !== undefined && rootBugId !== bug.bugId) return null // 非链根成员——仅展开区呈现
            const chain = rootBugId !== undefined ? chains.get(rootBugId) : undefined
            if (chain !== undefined) {
              return (
                <BugChainRow
                  key={bug.bugId}
                  entries={chain}
                  expanded={openChains.has(rootBugId!)}
                  onToggle={() => {
                    toggleChain(rootBugId!)
                  }}
                  {...(onOpenBug !== undefined ? { onOpenBug } : {})}
                />
              )
            }
            return (
              <BugRow
                key={bug.bugId}
                bug={bug}
                {...(onOpenBug !== undefined ? { onOpenBug } : {})}
                {...(onAddBugToSession !== undefined ? { onAddBugToSession } : {})}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
