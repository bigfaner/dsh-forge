// 选区浮出菜单缝合（super-composer 提案 §2.2 + §2.3 插入路径）：
// document mouseup → scope 过滤（scope.ts 纯模型）→ primitives Menu 同构弹层
//（portal 到 body + getAnchorRect = 选区 DOMRect，视口下方装不下翻上）→ 单行
//「添加到对话」→ insertReferenceAtTail 同径落 quote chip（state 快照 → tail span-CAS
// → bail slash/input-insert-reference + 漂移症状级复核，bug 2d5434d1 判例）→
// 自动聚焦 composer 输入区（全屏聚焦替身 / 常规聚焦主 composer——对应面）。
//
// 复用核销（proposal 复用核销表）：官方无选区专用浮出件——弹层容器复用
// @deepseek-ai/dsh-client-ui-primitives 的 Menu（portal + getAnchorRect），不改制；
// contextmenu 默认行为不劫持（零 contextmenu 监听）。划选进行中不抢焦点：mouseup
// 打开菜单路径零 focus 调用，聚焦只在菜单项点击成功后发生。
//
// bundle 自含纪律（client classic script 形状）：react 走壳层冻结种子表单例
//（PLATFORM_MODULES 外置），react-dom 与 primitives 内联进 bundle（react-dom 只经
// createRoot/flushSync 触达宿主 react 单例，无第二 dispatcher）；primitives 的
// *.module.css 副产物由打包脚本以 empty loader 丢弃——真机页面壳层已装载同一
// primitives 样式（类名同源），弹层 portal 到 body 直接命中既有规则。
import { useCallback, createElement, useMemo } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { isQuotableSelection, type SelectionProbe } from './scope.js'
import { quoteReferenceInsertOf, type QuoteReferenceInsert, type QuoteReferenceSource } from './quote-source.js'

// ─────────────────────────── DOM → SelectionProbe 提取 ───────────────────────────

/** 选区提取产物（probe + 菜单锚定/摘要所需的 DOM 直读量）。 */
export interface SelectionExtraction extends SelectionProbe {
  /** 选区明文（摘要/快照 text 单源） */
  readonly text: string
  /** 选区 DOMRect（弹层 getAnchorRect 锚定量；不可得 = null） */
  readonly rect: DOMRect | null
  /** 选区起点容器（source 语义解析锚点；不可得 = null） */
  readonly anchor: Node | null
}

/** 编辑域排除选择器（proposal §2 判例同构：input/textarea/[contenteditable]）。 */
const EDITABLE_SELECTOR = 'input, textarea, [contenteditable]'

/** 浮层自身角色标记（浮层输入/控件/标题区——命中即排除）。 */
const OVERLAY_ROLE_ATTR = 'data-quote-overlay-role'

function closestOf(node: Node | null): Element | null {
  if (node === null) return null
  const candidate = node.nodeType === node.ELEMENT_NODE ? node : node.parentNode
  return candidate instanceof Element ? candidate : null
}

/** 1.32 source 语义解析产物（快照结构化来源字段）。 */
export type SelectionSource =
  | { readonly sourceType: 'doc'; readonly sourcePath: string }
  | { readonly sourceType: 'sessionMsg'; readonly sourceSeq: number }

/**
 * 选区落点 → source 语义解析（纯读，1.32 改判——替代 document.title 形态）：
 * 文档预览域（官方 sidebar-documentpreview TextPreview，`[data-document-preview]`）
 * 取 `[data-textpreview-path]` 投影文本 = workspace 文件相对路径；chat flow 域
 *（官方 ChatView `[data-chat-flow]`）取选区所在 `[data-chat-anchor-key]` 行在 flow
 * 内的序数（1 起 = 会话消息序号）。皆非 = undefined（serialize 不出 source 属性）。
 */
export function resolveSelectionSource(_doc: Document, anchor: Node | null): SelectionSource | undefined {
  const anchorEl = closestOf(anchor)
  if (anchorEl === null) return undefined
  const preview = anchorEl.closest('[data-document-preview]')
  if (preview !== null) {
    const sourcePath = preview.querySelector('[data-textpreview-path]')?.textContent?.trim() ?? ''
    if (sourcePath !== '') return { sourceType: 'doc', sourcePath }
  }
  const flow = anchorEl.closest('[data-chat-flow]')
  if (flow !== null) {
    const row = anchorEl.closest('[data-chat-anchor-key]')
    if (row !== null) {
      const index = Array.from(flow.querySelectorAll('[data-chat-anchor-key]')).indexOf(row)
      if (index >= 0) return { sourceType: 'sessionMsg', sourceSeq: index + 1 }
    }
  }
  return undefined
}

/**
 * 选区 client rects → 菜单锚矩形（纯函数，fix-27）：取末个非退化矩形（多行/跨元素
 * 选区的末行位置），锚在其下一行（top = 末行 bottom，行高沿用末矩形）——菜单浮出在
 * 选中内容末尾的下一行，不遮挡选区。末矩形为零宽高空壳时回落前一非空者；全部退化
 * 或空清单 = null（调用方回落包围盒）。
 */
export function selectionAnchorRect(rects: readonly DOMRect[]): DOMRect | null {
  let last: DOMRect | null = null
  for (const r of rects) {
    if (r.width > 0 || r.height > 0) last = r
  }
  if (last === null) return null
  const left = last.left
  const top = last.bottom
  const height = last.height
  return {
    left,
    top,
    right: left + last.width,
    bottom: top + height,
    width: last.width,
    height,
    x: left,
    y: top,
    toJSON: last.toJSON?.bind(last),
  } as DOMRect
}

/**
 * DOM Selection → 提取产物（纯读函数）。无 selection / 无 range / 折叠 = collapsed
 * 空产物；编辑域/浮层角色从选区落点元素向上 closest 判定；scopeRoot = 声明清单内
 * 首个命中选择器（声明外 = null）。锚矩形 = 选区末矩形下一行（fix-27，selectionAnchorRect
 * 纯函数）；rects 不可得/全退化时回落整体包围盒。
 */
export function extractSelection(doc: Document, roots: readonly string[]): SelectionExtraction {
  const empty: SelectionExtraction = {
    collapsed: true,
    editableTarget: false,
    overlayRole: null,
    scopeRoot: null,
    text: '',
    rect: null,
    anchor: null,
  }
  const selection = doc.getSelection()
  if (selection === null || selection.rangeCount === 0) return empty
  const range = selection.getRangeAt(0)
  const text = selection.toString()
  if (selection.isCollapsed || text === '') return empty
  const anchorEl = closestOf(range.startContainer)
  const editableTarget = anchorEl?.closest(EDITABLE_SELECTOR) != null
  const overlayEl = anchorEl?.closest(`[${OVERLAY_ROLE_ATTR}]`) ?? null
  const overlayRaw = overlayEl?.getAttribute(OVERLAY_ROLE_ATTR) ?? null
  const overlayRole =
    overlayRaw === 'input' || overlayRaw === 'control' || overlayRaw === 'title' ? overlayRaw : null
  let scopeRoot: string | null = null
  if (anchorEl !== null) {
    for (const root of roots) {
      if (anchorEl.closest(root) !== null) {
        scopeRoot = root
        break
      }
    }
  }
  let rect: DOMRect | null = null
  try {
    // Root cause (fix-27 bug 21b01a7e): 旧实现取 range.getBoundingClientRect() 整体
    // 包围盒——顶边即首行顶、左缘即最左，菜单浮出在选区起始处遮住选中内容。改为
    // clientRects 末个非空矩形的下一行（selectionAnchorRect 纯函数）。
    rect = selectionAnchorRect(Array.from(range.getClientRects())) ?? range.getBoundingClientRect()
  } catch {
    rect = null
  }
  return { collapsed: false, editableTarget, overlayRole, scopeRoot, text, rect, anchor: range.startContainer }
}

// ─────────────────────────── insertReferenceAtTail 同径（open-session 判例镜像） ───────────────────────────

/** scoped 事件 bail 窄面（cordis actx.bail——官方 input-trigger execute 同径）。 */
export type ScopedEventBail = (actx: unknown, name: string, payload: unknown) => unknown

/** composer 输入 face 窄面（官方 SessionInput 消费切片：state 快照 + 聚焦）。 */
export interface QuoteComposerFace {
  readonly state?: {
    getSnapshot(): { readonly draft: string; readonly draftRev: number; readonly occurrences?: readonly unknown[] }
  }
  focus(): void
}

/** 引用插入依赖（会话寻址 + 输入面 + scoped 事件发射——测试注入面）。 */
export interface QuoteInsertServices {
  readonly sessions: { binding(sessionId: string): { readonly ctx: unknown } | undefined }
  readonly conversation: { readonly input: { for(actx: unknown): QuoteComposerFace | undefined } }
  readonly bail: ScopedEventBail
}

/** 官方 scoped 引用插入事件名（上游 input.d.ts Events 契约字面量）。 */
export const INPUT_INSERT_REFERENCE_EVENT = 'slash/input-insert-reference'

/** TokenSpan 结构同型镜像（span-CAS 三元组）。 */
export interface TokenSpanMirror {
  readonly start: number
  readonly end: number
  readonly draftRev: number
}

/**
 * tail span-CAS 构造（纯函数）：草稿 detect 末尾 + 当前 InputState.draftRev。
 * Root cause (bug 043166fc): 官方 span-map 契约（ui-conversation span-map.ts selectSpan
 * 源码核销）以 detect 平面映射 span——chip 在 detect 投影中坍缩为单字符，而
 * InputState.draft 是 clipboard 投影（chip 展开 token 全文）；旧实现直接取
 * state.draft.length，空草稿两平面数值相等掩盖错位，草稿含 chip 后 span.end 越界
 * detectLength → selectSpan 返 null → bail 拒绝 → 「添加到对话」再次点击静默 no-op
 * （插入次数语义破坏）。修法：occurrences（clipboard offset/length 契约）反推
 * detect 长度 = draft.length − Σ(token 长 − 1)。
 */
export function tailSpanOf(state: {
  readonly draft: string
  readonly draftRev: number
  readonly occurrences?: readonly unknown[]
}): TokenSpanMirror {
  const chipExtra = (state.occurrences ?? []).reduce<number>((n, occ) => {
    const len = (occ as { length?: unknown } | null | undefined)?.length
    return n + (typeof len === 'number' && Number.isFinite(len) ? Math.max(0, len - 1) : 0)
  }, 0)
  const at = state.draft.length - chipExtra
  return { start: at, end: at, draftRev: state.draftRev }
}

/**
 * bail 返回值漂移症状级复核（bug 2d5434d1 判例同构）：occurrences 增长 = 已应用；
 * 草稿尾接 clipboardText 投影 = 已应用；否则未应用。
 */
export function referenceApplied(
  before: { readonly draft: string; readonly occurrences?: readonly unknown[] },
  after: { readonly draft: string; readonly occurrences?: readonly unknown[] },
  clipboardText: string,
): boolean {
  if (
    after.occurrences !== undefined &&
    before.occurrences !== undefined &&
    after.occurrences.length > before.occurrences.length
  )
    return true
  return clipboardText.length > 0 && after.draft.endsWith(clipboardText)
}

/**
 * 活跃会话草稿末尾插入原子引用（纯编排——官方 scoped 事件径，不直捅 editor 内部
 * API）：binding 解析会话作用域 actx → input.for(actx) 取 state 快照 → tail span-CAS
 * → actx.bail('slash/input-insert-reference', {reference, span})。bail 未回 true 时
 * 症状级复核（再取一帧快照比对）。不含聚焦——聚焦归调用方（全屏/常规对应面裁决）。
 */
export function insertReferenceAtTail(
  services: QuoteInsertServices,
  sessionId: string,
  reference: QuoteReferenceInsert,
): boolean {
  const binding = services.sessions.binding(sessionId)
  if (binding === undefined) return false
  let face: QuoteComposerFace | undefined
  try {
    face = services.conversation.input.for(binding.ctx)
  } catch {
    return false
  }
  const state = face?.state?.getSnapshot()
  if (face === undefined || state === undefined) return false
  let applied: unknown
  try {
    applied = services.bail(binding.ctx, INPUT_INSERT_REFERENCE_EVENT, {
      reference,
      span: tailSpanOf(state),
    })
  } catch {
    return false
  }
  if (applied !== true) {
    // 症状级复核（bug 2d5434d1）：bail 返回值漂移但插入事实已落——再取一帧快照比对。
    let after:
      | { readonly draft: string; readonly draftRev: number; readonly occurrences?: readonly unknown[] }
      | undefined
    try {
      after = face.state?.getSnapshot()
    } catch {
      return false
    }
    if (after === undefined || !referenceApplied(state, after, reference.clipboardText)) return false
  }
  return true
}

// ─────────────────────────── 浮出菜单装配（React） ───────────────────────────

/** 摘要截断上界（mention label；超长截断加省略号）。 */
const SUMMARY_MAX = 24

/** 视口下方装不下翻上的估算高度（单行菜单卡 + 边距）。 */
const MENU_SPACE_ESTIMATE = 120

function summaryOf(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  return compact.length > SUMMARY_MAX ? `${compact.slice(0, SUMMARY_MAX)}…` : compact
}

function randomQuoteId(): string {
  const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (typeof cryptoRef?.randomUUID === 'function') return cryptoRef.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const rand = (Math.random() * 16) | 0
    const value = ch === 'x' ? rand : (rand & 0x3) | 0x8
    return value.toString(16)
  })
}

/** 弹层 props（受控渲染面）。 */
interface SelectionMenuProps {
  readonly open: boolean
  readonly rect: DOMRect | null
  readonly side: 'bottom' | 'top'
  onAdd(): void
  onClose(): void
}

/**
 * primitives Menu 同构弹层（portal + getAnchorRect = 选区 DOMRect；单行「添加到对话」；
 * autoFocus=false——划选进行中不抢焦点）。
 */
function SelectionMenu({ open, rect, side, onAdd, onClose }: SelectionMenuProps): JSX.Element {
  const getAnchorRect = useCallback(() => rect, [rect])
  const items = useMemo(() => [{ id: 'add-to-chat', label: '添加到对话' }], [])
  return createElement(Menu, {
    open,
    autoFocus: false,
    portal: true,
    side,
    items,
    getAnchorRect,
    onSelect: onAdd,
    onClose,
    listClassName: 'dshf-quote-selection-menu',
    anchor: createElement('span', { 'aria-hidden': true, 'data-quote-menu-anchor': true }),
  })
}

/** 装配依赖（真实 DOM + 服务注入面）。 */
export interface SelectionMenuDeps {
  /** 监听文档（document 级 mouseup——dockkit/ChatView 同主 Document） */
  readonly doc: Document
  /** 选区监听域选择器清单（resolveSelectionScope 产物；空清单 = 静默不挂监听） */
  readonly roots: readonly string[]
  /** 目标会话解析（点击时点解析——主视图在留会话单源；undefined = 无活跃会话，fail-soft） */
  resolveSessionId(): string | undefined
  /** 引用插入服务（sessions + conversation.input + bail） */
  readonly services: QuoteInsertServices
  /** quote trigger source（快照入池——@ 菜单候选 + serialize 全文块） */
  readonly source: QuoteReferenceSource
  /** 全屏替身输入区聚焦面（super-composer 替身提供——cordis 服务惰性读取闭包；
   * true = 替身已聚焦；false/异常 = 替身不在场，回落主 composer face） */
  readonly focusFullscreenInput?: () => boolean
  /** 引用落稿现身反馈（1.45——super-composer 替身提供：插入成功后触发替身悬浮球
   * 表面化，用户可点球查看 chip。只作表面化信号，不参与插入——fix-15 插入径语义
   * 联动：本回调仅在 applied=true 后触发，不重复插入） */
  readonly surfaceReplacement?: () => void
}

/** 装配产物（撤销句柄：监听摘除 + portal 卸载；幂等）。 */
export interface SelectionMenuHandle {
  dispose(): void
}

/**
 * 选区浮出菜单装配（document mouseup → scope 过滤 → Menu 弹层 → 落 chip → 聚焦）。
 * 打开路径零 focus 调用（划选进行中不抢焦点）；菜单点击成功后聚焦对应面
 *（focusFullscreenInput 提供时聚焦全屏替身，否则聚焦主 composer face——insert
 * 同径成功即 face 在场）。dispose 幂等。
 */
export function mountSelectionMenu(deps: SelectionMenuDeps): SelectionMenuHandle {
  const { doc, roots, resolveSessionId, services, source, focusFullscreenInput, surfaceReplacement } = deps
  // 零固定税：空清单静默不挂监听（scope.ts listening 语义同源）。
  if (roots.length === 0) {
    return { dispose() {} }
  }
  const container = doc.createElement('div')
  container.setAttribute('data-quote-selection-menu-root', '')
  // Root cause: 容器只承载官方 Menu 的内联 anchor span（portal 模式列表走
  // createPortal 直挂 body）——静态流内空 span 生成行盒（~21.6px）把文档顶出
  // 视口，全窗竖直滚动条（bug cf64ea39）。fixed 脱流 = 零滚动贡献；列表在
  // body 下不受影响，锚矩形由 getAnchorRect 供给不经此容器。
  container.style.position = 'fixed'
  doc.body.appendChild(container)
  let root: Root | null = null
  try {
    root = createRoot(container)
  } catch {
    container.remove()
    return { dispose() {} }
  }

  let open = false
  let rect: DOMRect | null = null
  let side: 'bottom' | 'top' = 'bottom'
  let pendingText = ''
  let pendingAnchor: Node | null = null
  let disposed = false

  function render(): void {
    if (root === null) return
    root.render(
      createElement(SelectionMenu, {
        open,
        rect,
        side,
        onAdd: addToChat,
        onClose: close,
      }),
    )
  }

  function close(): void {
    if (!open && rect === null) return
    open = false
    rect = null
    flushSync(render)
  }

  /** 视口下方装不下翻上（单行菜单卡估算高度 vs 选区下缘到视口底距离）。 */
  function sideFor(extraction: SelectionExtraction): 'bottom' | 'top' {
    const win = doc.defaultView
    const bottom = extraction.rect?.bottom ?? 0
    if (win != null && bottom + MENU_SPACE_ESTIMATE > win.innerHeight) return 'top'
    return 'bottom'
  }

  function onSelectionTarget(snapshotText: string): void {
    const sessionId = resolveSessionId()
    if (sessionId === undefined) {
      // 无活跃会话（主视图无在留行）——fail-soft：收菜单不插入。
      close()
      return
    }
    const id = randomQuoteId()
    const summary = summaryOf(snapshotText)
    // 1.32 source 语义：doc=文件相对路径 / sessionMsg=会话消息序号（结构化字段随快照入池）
    const selectionSource = resolveSelectionSource(doc, pendingAnchor)
    const snapshot = selectionSource === undefined
      ? { id, summary, text: snapshotText }
      : { id, summary, text: snapshotText, ...selectionSource }
    // 快照入池（offerSelection 同时落缓存——@ 菜单候选 + serialize 全文块单源）
    source.offerSelection(snapshot)
    const reference = quoteReferenceInsertOf({ id, summary })
    let applied = false
    try {
      applied = insertReferenceAtTail(services, sessionId, reference)
    } catch {
      applied = false
    }
    if (applied) {
      // 1.45 现身反馈：插入事实已落 → 通知替身悬浮球表面化（best effort——服务缺席/
      // 异常只降反馈面，不影响插入与聚焦）。先于聚焦：替身以球态现身时复制件输入区
      // 未挂载，聚焦面会如实回落主 composer face。
      if (surfaceReplacement !== undefined) {
        try {
          surfaceReplacement()
        } catch {
          // best effort
        }
      }
      // 自动聚焦对应面：全屏替身在（hook/服务提供且聚焦成功）→ 替身输入区；否则主
      // composer face（insertReferenceAtTail 已核 face 在场——聚焦同面，best effort 不回滚）。
      let replacementFocused = false
      if (focusFullscreenInput !== undefined) {
        try {
          replacementFocused = focusFullscreenInput() === true
        } catch {
          replacementFocused = false
        }
      }
      if (!replacementFocused) {
        const binding = services.sessions.binding(sessionId)
        if (binding !== undefined) {
          try {
            services.conversation.input.for(binding.ctx)?.focus()
          } catch {
            // best effort（插入已落——还焦失败不回滚）
          }
        }
      }
      try {
        doc.getSelection()?.removeAllRanges()
      } catch {
        // best effort
      }
    }
    close()
  }

  const addToChat = (): void => onSelectionTarget(pendingText)

  function onMouseUp(event: MouseEvent): void {
    if (disposed) return
    // Root cause: 弹层自身的 mouseup 也冒泡到 document——真实点击序列里 mousedown
    // 先折叠选区，此径会把刚打开的菜单抢先收层（click 永不落到 onSelect → chip 永不
    // 落稿）。官方 Menu portal 到 body（容器外），以官方 role="menu" 锚排除弹层自身。
    const target = event.target
    if (target instanceof Element && target.closest('[role="menu"]') !== null) return
    const extraction = extractSelection(doc, roots)
    if (!isQuotableSelection(extraction, roots)) {
      close()
      return
    }
    pendingText = extraction.text
    pendingAnchor = extraction.anchor
    open = true
    rect = extraction.rect
    side = sideFor(extraction)
    flushSync(render)
  }

  doc.addEventListener('mouseup', onMouseUp)
  render()

  return {
    dispose(): void {
      if (disposed) return
      disposed = true
      doc.removeEventListener('mouseup', onMouseUp)
      try {
        root?.unmount()
      } catch {
        // best effort（root 已卸载等）
      }
      root = null
      container.remove()
    },
  }
}
