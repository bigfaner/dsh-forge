// 域目录树（定位：业务——UF-6 左轨域目录树：目录即域 ≤3 层，选择 = 前缀过滤条件）。
// Hard Rule 自绘领域组件（官方无域树行对应件）：行 = 自绘（令牌唯一 + 原型行刻度）；
// 数据 = forge:knowledge/browse 聚合（DomainNode，节点计数含子域——与域前缀过滤同口径）。
// knowledge-review-ui SC-H：收合/展开（caret 旋转，缺省常展开 ≤3 层）、树头「＋」新建目录
// （entryAction createDomain 上抛——>3 层客户端预检提示，服务端 domain-depth 同校验）、
// 卡片拖拽落位（entryAction move 上抛——仅具体域行是落点，非域行 = 零动作）、
// 待审核徽记（官方 Tag warning 数字形态——未过滤口径，不随 statusFilter 抖动）。
// 「全部域」根行 = 无域过滤（非落点——targetDomain 必须是具体域）。
import { useState, type CSSProperties, type DragEvent, type ReactNode } from 'react'
import type { DomainNode } from '@dsh-forge/contracts'
import { Tag, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  DOMAIN_MAX_DEPTH,
  domainRows,
  isDomainDepthLegal,
  joinDomainPath,
  parentDomainPaths,
  toggleDomainCollapsed,
  visibleDomainRows,
} from './browse-model.js'
import './knowledge.css'

/** 卡片拖拽携带 entryId 的 dataTransfer 键（拖拽源侧同键约定——text/plain 兜底） */
const DRAG_ENTRY_TYPE = 'text/knowledge-entry'

export interface DomainTreeProps {
  /** 域树聚合节点（core 契约序：depth 升序再路径升序——父先于子） */
  readonly nodes: readonly DomainNode[]
  /** 全部域计数（无过滤底表卡片数——含根域文件） */
  readonly total: number
  /** 选中域路径（undefined = 全部域根行激活；新建目录的缺省父层） */
  readonly active?: string
  /** 域行选择（domainPath = '' 即全部域根行 → 上抛 undefined 清除域过滤） */
  readonly onSelect?: (domainPath: string | undefined) => void
  /** 根行徽记计数（未过滤全量待审核——缺省 = 一级域求和派生，树派生一致口径） */
  readonly unconfirmedTotal?: number
  /** 新建目录（树头「＋」→ entryAction createDomain；缺席 = 钮不渲染） */
  readonly onCreateDomain?: (domainPath: string) => void
  /** 卡片拖拽落位（entryAction move——缺席 = 行非落点，拖拽零动作） */
  readonly onMoveEntry?: (entryId: number, targetDomain: string) => void
}

/** 域目录树（role=tree——行级 aria-selected/aria-expanded + data-dswf-domain 锚） */
export function DomainTree({
  nodes,
  total,
  active,
  onSelect,
  unconfirmedTotal,
  onCreateDomain,
  onMoveEntry,
}: DomainTreeProps): ReactNode {
  const allRows = domainRows(nodes, total)
  // 收合态（缺省空集 = 全展开——≤3 层口径无缺省收合）
  const [collapsed, setCollapsed] = useState<readonly string[]>([])
  // 新建目录编辑行（draft = 目录名；depthHint = 超层拒收提示）
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [depthHint, setDepthHint] = useState(false)
  // 拖拽 hover 反馈（当前悬停落点域行——零反馈即非落点）
  const [hoverPath, setHoverPath] = useState<string | undefined>(undefined)

  const parents = parentDomainPaths(allRows)
  const rows = visibleDomainRows(allRows, collapsed)
  const rootUnconfirmed =
    unconfirmedTotal ?? allRows.filter((row) => row.depth === 1).reduce((sum, row) => sum + row.unconfirmedCount, 0)

  const openEditor = (): void => {
    setAdding(true)
    setDraft('')
    setDepthHint(false)
  }
  const closeEditor = (): void => {
    setAdding(false)
    setDraft('')
    setDepthHint(false)
  }
  const submitEditor = (): void => {
    const name = draft.trim()
    if (name === '') return
    const path = joinDomainPath(active, name)
    if (!isDomainDepthLegal(path)) {
      setDepthHint(true) // 超层拒收提示留编辑行（服务端 domain-depth 同判据预检）
      return
    }
    onCreateDomain?.(path)
    closeEditor()
  }
  const handleDrop = (domainPath: string, event: DragEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    setHoverPath(undefined)
    const raw = event.dataTransfer.getData(DRAG_ENTRY_TYPE) || event.dataTransfer.getData('text/plain')
    const entryId = Number(raw)
    if (Number.isInteger(entryId) && entryId > 0) onMoveEntry?.(entryId, domainPath)
  }

  return (
    <div className="dswf-kn-dom" data-dswf-kn-tree="" role="tree" aria-label="域目录">
      <div className="dswf-kn-dom-head">
        <span>目录（域）</span>
        {onCreateDomain !== undefined && (
          // D30：原生 title 退役——官方 Tooltip（树头动作钮）
          <Tooltip label="新建目录" portal>
            <button
              type="button"
              className="dswf-kn-dom-add"
              data-dswf-kn-dom-add=""
              aria-label="新建目录"
              onClick={openEditor}
            >
              ＋
            </button>
          </Tooltip>
        )}
      </div>
      {adding && (
        <div className="dswf-kn-dom-new" data-dswf-kn-dom-new="">
          <input
            className="dswf-kn-dom-new-input"
            autoFocus
            value={draft}
            placeholder={active === undefined || active === '' ? '新目录名' : `${active}/…`}
            aria-label="新目录名"
            onChange={(event) => {
              setDraft(event.target.value)
              setDepthHint(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitEditor()
              else if (event.key === 'Escape') closeEditor()
            }}
          />
          <div className="dswf-kn-dom-new-actions">
            <button type="button" className="dswf-kn-dom-new-btn" onClick={submitEditor}>
              确定
            </button>
            <button type="button" className="dswf-kn-dom-new-btn" onClick={closeEditor}>
              取消
            </button>
            {depthHint && (
              <span className="dswf-kn-dom-new-hint" role="alert">
                域层级超过 {String(DOMAIN_MAX_DEPTH)} 层上限
              </span>
            )}
          </div>
        </div>
      )}
      {rows.map((row) => {
        const isRoot = row.domainPath === ''
        const isActive = (isRoot ? undefined : row.domainPath) === active
        const hasChildren = parents.has(row.domainPath)
        const isCollapsed = collapsed.includes(row.domainPath)
        // 落点判据：具体域行且 move 动作在场——根行/非域行零动作（H3）
        const droppable = onMoveEntry !== undefined && !isRoot
        return (
          // D30：原生 title 退役——官方 Tooltip（portal 逃逸知识面板域轨滚动容器）
          <Tooltip key={isRoot ? '__all__' : row.domainPath} label={isRoot ? '全部域' : row.domainPath} portal>
            <button
              type="button"
              className="dswf-kn-dom-row"
              data-dswf-domain={row.domainPath}
              data-active={isActive || undefined}
              data-drag-over={hoverPath === row.domainPath || undefined}
              data-dswf-kn-drop={droppable || undefined}
              role="treeitem"
              aria-selected={isActive}
              aria-expanded={hasChildren ? !isCollapsed : undefined}
              style={{ '--dswf-depth': String(row.depth) } as CSSProperties}
              onClick={
                onSelect === undefined
                  ? undefined
                  : () => {
                      onSelect(isRoot ? undefined : row.domainPath)
                    }
              }
              onDragOver={
                droppable
                  ? (event) => {
                      event.preventDefault()
                      event.dataTransfer.dropEffect = 'move'
                      setHoverPath(row.domainPath)
                    }
                  : undefined
              }
              onDragLeave={droppable ? () => setHoverPath(undefined) : undefined}
              onDrop={droppable ? (event) => handleDrop(row.domainPath, event) : undefined}
            >
              {hasChildren ? (
                // caret = 收合/展开开关（stopPropagation——不触发行选择）；叶行空占位对齐
                <span
                  className="dswf-kn-dom-caret"
                  data-collapsed={isCollapsed || undefined}
                  aria-hidden="true"
                  onClick={(event) => {
                    event.stopPropagation()
                    setCollapsed((prev) => toggleDomainCollapsed(prev, row.domainPath))
                  }}
                >
                  ▾
                </span>
              ) : (
                <span className="dswf-kn-dom-caret" aria-hidden="true" />
              )}
              <span className="dswf-kn-dom-label">{row.label}</span>
              <span className="dswf-kn-dom-count">{row.entryCount}</span>
              {row.unconfirmedCount > 0 && (
                // H4：待审核徽记 = 未过滤口径（DomainNode.unconfirmedCount 直取——不随 statusFilter 抖动）
                <Tag tone="warning" className="dswf-kn-dom-badge">
                  {isRoot ? rootUnconfirmed : row.unconfirmedCount}
                </Tag>
              )}
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}
