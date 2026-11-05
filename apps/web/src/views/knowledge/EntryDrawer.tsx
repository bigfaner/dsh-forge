// 知识详情弹窗（定位：业务——UF-6 详情面：两列元数据表 + 摘要块 + Markdown 正文）。
// 承载 = 自持可拖移 dialog（用户裁决：可移动 + 宽 770 + 缘侧可拉伸调宽）——bug-dialog
// 同先例（真 dialog 自持皮 + 拖动机械复用 drawer：taskDrawerHeadDragProps /
// drawerPositionFromDrag / drawerWidthFromEdgeDrag / useTaskDrawerEscape）。
// 组装分工沿 3.6 形制：EntryDrawer（装载壳——hook + 几何态）持有 useEntryDetail
// （正文按需读取），EntryDrawerBody（纯渲染——全相位 renderToStaticMarkup 可测）呈现三区。
// Hard Rules：
//   - 正文渲染经 MarkdownDoc 全量渲染（1.8 渲染链退役：官方渲染唯一包装入口——mermaid
//     fence 渲染为 md-code-block 后由 DOM 增强器出图，增强器挂接归 client 插件 1.7；
//     variant=body + CodeToolbar labels，裸渲染器禁直用不变）；
//   - 正文按需读取（getEntryDetail 唯一通道），不预载全库（browse/listEntries/heat 零调用）。
// 打开参数按 entryId 设计（Implementation Notes）——3.8 召回 tab 分组行跳转复用同门。
// AC3 关闭回浏览上下文（过滤态保持）：本件不触碰浏览过滤态（旁挂层， onClose 上抛归装配方）；
// Esc 捕获序 = 弹窗先于工具栏清空（useTaskDrawerEscape capture——原型同序）。
// 元数据表 = 首区（用户裁决）：域/状态/作者/更新时间四列同行 + 关键词独占整行（Tag tone=info
// 浅蓝 tint、无 # 前缀）；行紧凑刻度（4px 内衬）。
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { Button, IconCloseFillRegular, Tag, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { EntryDetail } from '@dsh-forge/contracts'
import { EmptyState, ErrorBar, MD_PREVIEW_MARKDOWN_LABELS, MarkdownDoc, StateChip } from '../../components/index.js'
import { preloadRpcClientFactory, type ForgeRpcClient, type RpcClientFactory } from '../../rpc/index.js'
import { mapBrowseError, type BrowseErrorInfo } from './use-knowledge-browse.js'
import {
  defaultDrawerPosition,
  drawerPositionFromDrag,
  drawerWidthFromEdgeDrag,
  type DrawerModalPosition,
  type DrawerResizeEdge,
} from '../overview/drawer/collapse.js'
import { taskDrawerHeadDragProps, useTaskDrawerEscape, type TaskDrawerDragKind } from '../overview/drawer/index.js'
import './knowledge.css'

/** 弹窗宽缺省（720 阅读刻度 +50——用户裁决「宽度增加50PX」） */
export const KN_DIALOG_WIDTH_DEFAULT = 770
/** 弹窗宽下限（px——缘侧拉伸收口） */
export const KN_DIALOG_WIDTH_MIN = 480
/** 宽度钳制（上探视口 92%、下不越 MIN；NaN 防御回缺省） */
export function clampKnDialogWidth(width: number, viewportWidth?: number): number {
  if (!Number.isFinite(width)) return KN_DIALOG_WIDTH_DEFAULT
  const ceiling = Math.max(KN_DIALOG_WIDTH_DEFAULT, viewportWidth === undefined ? KN_DIALOG_WIDTH_DEFAULT : Math.round(viewportWidth * 0.92))
  return Math.min(ceiling, Math.max(KN_DIALOG_WIDTH_MIN, Math.round(width)))
}

/** 详情相位（error 附载 BrowseErrorInfo——rpcUiState 三态映射同浏览面） */
export type EntryDrawerPhase = 'loading' | 'ready' | 'error'

/** 弹窗状态（hook 输出——EntryDrawerBody 消费形状） */
export interface EntryDrawerState {
  readonly phase: EntryDrawerPhase
  readonly detail: EntryDetail | undefined
  readonly error: BrowseErrorInfo | undefined
}

/** 元数据行值（渲染选型：状态 → StateChip；关键词 → Tag info chips；其余文本原样） */
export type EntryMetaValue =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'status'; readonly status: string }
  | { readonly kind: 'keywords'; readonly keywords: readonly string[] }

/**
 * 元数据行（span = 关键词独占整行——四列同行刻度：域/状态/作者/更新时间一行四格，
 * 关键词第二行整行——用户裁决）
 */
export interface EntryMetaRow {
  readonly key: 'domain' | 'status' | 'authors' | 'updated' | 'keywords'
  readonly label: string
  readonly span: boolean
  readonly value: EntryMetaValue
}

/**
 * 元数据行投影（纯函数）：首区四列同行（域/状态/作者/更新时间）+ 关键词整行；
 * 空域回退「根」（与卡片行语言同口径）、authors 缺省「—」、更新时间 = 本地时刻
 * `YYYY-MM-DD HH:mm`（用户裁决 localdatetime——不用相对时间标签）。
 */
export function entryMetaRows(detail: EntryDetail, _now: number): readonly EntryMetaRow[] {
  return [
    {
      key: 'domain',
      label: '域',
      span: false,
      value: { kind: 'text', text: detail.domainPath === '' ? '根' : detail.domainPath },
    },
    { key: 'status', label: '状态', span: false, value: { kind: 'status', status: detail.status } },
    { key: 'authors', label: '作者', span: false, value: { kind: 'text', text: detail.authors ?? '—' } },
    {
      key: 'updated',
      label: '更新时间',
      span: false,
      value: { kind: 'text', text: localDateTimeOf(detail.updated) },
    },
    {
      key: 'keywords',
      label: '关键词',
      span: true,
      value: { kind: 'keywords', keywords: detail.keywords },
    },
  ]
}

/** ISO-8601 → 本地时刻 `YYYY-MM-DD HH:mm`（非法/缺席 = 原样回退——fullStampOf 同防御形） */
export function localDateTimeOf(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 详情拉取结果（ok/error 归一——永不 reject） */
export type EntryDetailFetch =
  | { readonly ok: true; readonly detail: EntryDetail }
  | { readonly ok: false; readonly error: BrowseErrorInfo }

/**
 * 详情按需拉取（纯异步面）：唯一通道 = `forge:knowledge/entryDetail`（Hard Rule——
 * 不预载全库，browse/listEntries/heat 零调用）；typed error 经 mapBrowseError 三态归一。
 */
export async function fetchEntryDetail(
  client: ForgeRpcClient,
  projectId: string,
  entryId: number,
): Promise<EntryDetailFetch> {
  try {
    return { ok: true, detail: await client.knowledge.entryDetail({ projectId, entryId }) }
  } catch (error) {
    return { ok: false, error: mapBrowseError(error) }
  }
}

/** 详情装载 hook（entryId 变更 / 重试重拉；序号守卫防串台——仅最新拉取落点生效；null = 关闭不拉取） */
export function useEntryDetail(
  projectId: string,
  entryId: number | null,
  makeClient: RpcClientFactory = preloadRpcClientFactory,
): readonly [EntryDrawerState, { retry(): void }] {
  const [state, setState] = useState<EntryDrawerState>(initialDrawerState)
  const [nonce, setNonce] = useState(0)
  const seqRef = useRef(0)

  useEffect(() => {
    if (entryId === null) return
    const seq = ++seqRef.current
    setState(initialDrawerState())
    let alive = true
    void fetchEntryDetail(makeClient(), projectId, entryId).then((out) => {
      if (!alive || seq !== seqRef.current) return
      setState(
        out.ok
          ? { phase: 'ready', detail: out.detail, error: undefined }
          : { phase: 'error', detail: undefined, error: out.error },
      )
    })
    return () => {
      alive = false
    }
  }, [projectId, entryId, nonce, makeClient])

  const retry = useCallback(() => {
    setNonce((n) => n + 1)
  }, [])
  return [state, { retry }] as const
}

/** 初始态（拉取在途：骨架相位） */
export function initialDrawerState(): EntryDrawerState {
  return { phase: 'loading', detail: undefined, error: undefined }
}

export interface EntryDrawerBodyProps {
  /** 详情状态（useEntryDetail 输出——全相位可构造，纯渲染面） */
  readonly state: EntryDrawerState
  /** 重试（错误态） */
  readonly retry: () => void
  /** 元数据时间标签基准（缺省当次渲染时刻） */
  readonly now?: number
}

/** 元数据行值渲染（StateChip / Tag info chips / 文本原样） */
function MetaValue({ value }: { readonly value: EntryMetaValue }): ReactNode {
  if (value.kind === 'status') return <StateChip status={value.status} />
  if (value.kind === 'keywords') {
    return (
      <>
        {value.keywords.map((keyword) => (
          <Tag key={keyword} tone="info">{keyword}</Tag>
        ))}
      </>
    )
  }
  return value.text
}

/** 弹窗骨架（详情拉取在途） */
function DrawerSkeleton(): ReactNode {
  return (
    <div className="dswf-kn-drawer-skeleton" data-dswf-kn-drawer-skeleton="" aria-hidden="true">
      <div className="dswf-kn-drawer-skline is-title" />
      <div className="dswf-kn-drawer-skline is-abs" />
      <div className="dswf-kn-drawer-skline" />
      <div className="dswf-kn-drawer-skline" />
      <div className="dswf-kn-drawer-skline is-long" />
    </div>
  )
}

/** 错误面（rpcUiState 三态：empty-state → 不可用空态；error-bar/banner → 共享 ErrorBar） */
function DrawerError({
  error,
  retry,
}: {
  readonly error: BrowseErrorInfo
  readonly retry: () => void
}): ReactNode {
  if (error.uiState === 'empty-state') {
    return (
      <div className="dswf-kn-drawer-face">
        <EmptyState
          title="知识详情不可用"
          description={error.message}
          action={
            <button type="button" className="dswf-kn-textaction" data-dswf-kn-drawer-retry="" onClick={retry}>
              重试
            </button>
          }
        />
      </div>
    )
  }
  return (
    <div className="dswf-kn-drawer-face">
      <ErrorBar
        className="dswf-kn-error"
        message={`知识详情加载失败：${error.message}`}
        retryClassName="dswf-kn-textaction"
        anchor="data-dswf-kn-error"
        retryAnchor="data-dswf-kn-drawer-retry"
        onRetry={retry}
      />
    </div>
  )
}

/** 详情三区（AC1：元数据表首区 + 摘要块 + Markdown 正文——用户裁决元数据置顶） */
function DrawerContent({ detail, now }: { readonly detail: EntryDetail; readonly now: number }): ReactNode {
  const rows = entryMetaRows(detail, now)
  return (
    <div className="dswf-kn-drawer-content">
      <section className="dswf-kn-drawer-metas" aria-label="元数据">
        <div className="dswf-kn-drawer-seclabel">元数据（frontmatter）</div>
        <div className="dswf-kn-drawer-meta" data-dswf-kn-meta="">
          {rows.map((row) => (
            <div
              key={row.key}
              className={row.span ? 'dswf-kn-drawer-mrow is-span' : 'dswf-kn-drawer-mrow'}
              data-dswf-kn-meta-row={row.key}
            >
              <span className="dswf-kn-drawer-mk">{row.label}</span>
              <span className="dswf-kn-drawer-mv">
                <MetaValue value={row.value} />
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="dswf-kn-drawer-summary" data-dswf-kn-summary="" aria-label="摘要">
        <div className="dswf-kn-drawer-seclabel">摘要</div>
        <h2 className="dswf-kn-drawer-title">{detail.title}</h2>
        <p className="dswf-kn-drawer-abs">{detail.summary}</p>
      </section>
      <section className="dswf-kn-drawer-body" data-dswf-kn-body="" aria-label="正文">
        <div className="dswf-kn-drawer-seclabel">正文</div>
        {/* 正文区 = MarkdownDoc 全量渲染（1.8 渲染链退役）；容器 dswf-kn-md-body 持官方同形
         * 刻度组（docs.css 单源——css$7 inset + white-space 重置），纯块级：
         * 滚动所有权归弹窗内容区（dswf-kn-dialog-body overflow-y:auto 既有面不动） */}
        <div className="dswf-kn-md-body">
          <MarkdownDoc text={detail.body} variant="body" labels={MD_PREVIEW_MARKDOWN_LABELS} />
        </div>
      </section>
    </div>
  )
}

/**
 * 详情纯渲染（状态注入——静态可测全相位）：内容体（弹窗壳/头行/关闭钮归装载壳——
 * 本件只呈现三区；data-dswf-kn-drawer 内容锚保留——e2e/召回跳转断言面零改动）。
 */
export function EntryDrawerBody({ state, retry, now }: EntryDrawerBodyProps): ReactNode {
  return (
    <div className="dswf-kn-drawer" data-dswf-kn-drawer="" aria-label="知识详情">
      {state.phase === 'loading' ? (
        <DrawerSkeleton />
      ) : state.phase === 'error' && state.error !== undefined ? (
        <DrawerError error={state.error} retry={retry} />
      ) : state.detail !== undefined ? (
        <DrawerContent detail={state.detail} now={now ?? Date.now()} />
      ) : null}
    </div>
  )
}

/** 缘侧拖宽手柄（任务弹窗 DrawerResizeHandle 同构——指针捕获拖宽 + 键盘 ←→ 步进 + 双击复位） */
function KnResizeHandle({
  edge,
  onDragStart,
  onDragMove,
  onDragEnd,
  onStepWidth,
  onResetWidth,
}: {
  readonly edge: DrawerResizeEdge
  readonly onDragStart: (kind: TaskDrawerDragKind, clientX: number, clientY: number) => void
  readonly onDragMove: (clientX: number, clientY: number) => void
  readonly onDragEnd: () => void
  readonly onStepWidth: (delta: number) => void
  readonly onResetWidth: () => void
}): ReactNode {
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      onStepWidth(edge === 'left' ? -32 : 32)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      onStepWidth(edge === 'left' ? 32 : -32)
    }
  }
  return (
    // D30：原生 title 退役——官方 Tooltip（portal 逃逸弹窗 transform/层叠上下文）
    <Tooltip label="拖动调宽 · 双击复位" portal>
      <div
        className="dswf-kn-dialog-resize"
        role="separator"
        aria-orientation="vertical"
        tabIndex={0}
        aria-label={edge === 'left' ? '拖动调整弹窗宽度（左缘）' : '拖动调整弹窗宽度（右缘）'}
        data-dswf-kn-dialog-resize={edge}
        onKeyDown={handleKeyDown}
        onDoubleClick={onResetWidth}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          onDragStart(edge === 'left' ? 'resize-left' : 'resize-right', event.clientX, event.clientY)
        }}
        onPointerMove={(event) => {
          if ((event.buttons & 1) === 0) return // 仅主键按住拖拽（悬停移动不触发）
          onDragMove(event.clientX, event.clientY)
        }}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      />
    </Tooltip>
  )
}

export interface EntryDrawerProps {
  /** 当前项目 id（详情查询范围） */
  readonly projectId: string
  /** 打开条目（null = 关闭不渲染；3.8 召回 tab 跳转复用同参数计） */
  readonly entryId: number | null
  /** 关闭（Esc / ✕）——浏览上下文归装配方持有（本件不触碰过滤态） */
  readonly onClose: () => void
  /** RPC client 构造器（缺省 preload 真身；注入 = 测试面） */
  readonly makeClient?: RpcClientFactory
  /** 元数据时间标签基准（缺省当次渲染时刻） */
  readonly now?: number
}

/** 拖移会话快照（move / resize 双形态——起点几何归装载壳本地态，关闭即弃） */
interface KnDragSession {
  readonly kind: TaskDrawerDragKind
  readonly startClientX: number
  readonly startClientY: number
  readonly startLeft: number
  readonly startTop: number
  readonly startWidth: number
}

/**
 * 详情弹窗装载壳（3.8 装配挂知识浏览视图；onEntryOpen(entryId) → entryId 态）。
 * 可拖移 + 缘侧可拉伸（用户裁决——bug-dialog/任务弹窗同机械：标题栏拖移 +
 * 左右缘拖宽，位/宽逐开本地态关闭即弃）；首帧 = 弹窗壳 + 骨架（详情按需拉取不阻塞呈现）。
 */
export function EntryDrawer({ projectId, entryId, onClose, makeClient, now }: EntryDrawerProps): ReactNode {
  useTaskDrawerEscape(entryId === null ? null : String(entryId), onClose)
  const [state, { retry }] = useEntryDetail(projectId, entryId, makeClient)
  const [width, setWidth] = useState(KN_DIALOG_WIDTH_DEFAULT)
  const widthRef = useRef(KN_DIALOG_WIDTH_DEFAULT)
  const [position, setPosition] = useState<DrawerModalPosition | null>(null)
  const positionRef = useRef<DrawerModalPosition | null>(null)
  const dragRef = useRef<KnDragSession | null>(null)

  const applyGeometry = useCallback((next: { width: number; position: DrawerModalPosition }): void => {
    widthRef.current = next.width
    setWidth(next.width)
    positionRef.current = next.position
    setPosition(next.position)
  }, [])

  const handleDragStart = useCallback(
    (kind: TaskDrawerDragKind, clientX: number, clientY: number): void => {
      const startWidth = widthRef.current
      const start =
        positionRef.current ?? defaultDrawerPosition(window.innerWidth, window.innerHeight, startWidth)
      if (positionRef.current === null) {
        positionRef.current = start
        setPosition(start)
      }
      dragRef.current = {
        kind,
        startClientX: clientX,
        startClientY: clientY,
        startLeft: start.left,
        startTop: start.top,
        startWidth,
      }
    },
    [],
  )
  const handleDragMove = useCallback(
    (clientX: number, clientY: number): void => {
      const drag = dragRef.current
      if (drag === undefined || drag === null) return
      if (drag.kind === 'move') {
        const next = drawerPositionFromDrag(
          { left: drag.startLeft, top: drag.startTop },
          drag.startClientX,
          drag.startClientY,
          clientX,
          clientY,
          window.innerWidth,
          window.innerHeight,
          widthRef.current,
        )
        positionRef.current = next
        setPosition(next)
        return
      }
      const edge: DrawerResizeEdge = drag.kind === 'resize-left' ? 'left' : 'right'
      const nextWidth = drawerWidthFromEdgeDrag(edge, drag.startWidth, drag.startClientX, clientX, window.innerWidth)
      const clamped = clampKnDialogWidth(nextWidth, window.innerWidth)
      // 对侧锚定：左缘拖宽 = 右缘不动（左随宽补）；右缘拖宽 = 左缘不动（任务弹窗同刻度）
      applyGeometry({
        width: clamped,
        position: {
          left: edge === 'left' ? drag.startLeft + (drag.startWidth - clamped) : drag.startLeft,
          top: drag.startTop,
        },
      })
    },
    [applyGeometry],
  )
  const handleDragEnd = useCallback((): void => {
    dragRef.current = null
  }, [])
  const dragProps = taskDrawerHeadDragProps(handleDragStart, handleDragMove, handleDragEnd)
  // 键盘步进（←/→ ±32——方向由手柄缘侧定向归 KnResizeHandle，钳制内应用）
  const stepWidth = useCallback(
    (delta: number): void => {
      const start =
        positionRef.current ?? defaultDrawerPosition(window.innerWidth, window.innerHeight, widthRef.current)
      const clamped = clampKnDialogWidth(widthRef.current + delta, window.innerWidth)
      applyGeometry({ width: clamped, position: { left: start.left, top: start.top } })
    },
    [applyGeometry],
  )
  const resetWidth = useCallback((): void => {
    applyGeometry({
      width: KN_DIALOG_WIDTH_DEFAULT,
      position: positionRef.current ?? { left: 0, top: 0 },
    })
  }, [applyGeometry])

  if (entryId === null) return null
  return (
    <aside
      className="dswf-kn-dialog"
      role="dialog"
      aria-label="知识详情"
      style={{ width: `${width}px`, ...(position !== null ? { left: `${position.left}px`, top: `${position.top}px`, transform: 'none' } : {}) }}
      data-dswf-kn-dialog=""
    >
      <div className="dswf-kn-dialog-head" data-dswf-kn-dialog-head="" {...dragProps}>
        <span aria-hidden="true">⠿</span>
        <span>知识详情</span>
        <span className="dswf-kn-dialog-spacer" />
        <Button variant="ghost" size="sm" className="dswf-kn-dialog-close" data-dswf-kn-dialog-close="" aria-label="关闭弹窗" onClick={onClose}>
          <IconCloseFillRegular size={14} />
        </Button>
      </div>
      <KnResizeHandle edge="left" onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd} onStepWidth={stepWidth} onResetWidth={resetWidth} />
      <KnResizeHandle edge="right" onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd} onStepWidth={stepWidth} onResetWidth={resetWidth} />
      <div className="dswf-kn-dialog-body">
        <EntryDrawerBody state={state} retry={retry} now={now} />
      </div>
    </aside>
  )
}
