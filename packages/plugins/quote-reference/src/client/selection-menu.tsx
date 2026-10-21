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

/**
 * DOM Selection → 提取产物（纯读函数）。无 selection / 无 range / 折叠 = collapsed
 * 空产物；编辑域/浮层角色从选区落点元素向上 closest 判定；scopeRoot = 声明清单内
 * 首个命中选择器（声明外 = null）。
 */
export function extractSelection(doc: Document, roots: readonly string[]): SelectionExtraction {
  const empty: SelectionExtraction = {
    collapsed: true,
    editableTarget: false,
    overlayRole: null,
    scopeRoot: null,
    text: '',
    rect: null,
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
    rect = range.getBoundingClientRect()
  } catch {
    rect = null
  }
  return { collapsed: false, editableTarget, overlayRole, scopeRoot, text, rect }
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

/** tail span-CAS 构造（纯函数）：草稿末尾 + 当前 InputState.draftRev。 */
export function tailSpanOf(state: { readonly draft: string; readonly draftRev: number }): TokenSpanMirror {
  return { start: state.draft.length, end: state.draft.length, draftRev: state.draftRev }
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
  /** 全屏替身输入区聚焦面（super-composer 替身提供；缺席 = 聚焦主 composer face） */
  readonly focusFullscreenInput?: () => void
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
  const { doc, roots, resolveSessionId, services, source, focusFullscreenInput } = deps
  // 零固定税：空清单静默不挂监听（scope.ts listening 语义同源）。
  if (roots.length === 0) {
    return { dispose() {} }
  }
  const container = doc.createElement('div')
  container.setAttribute('data-quote-selection-menu-root', '')
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
    const title = doc.title
    const snapshot = {
      id,
      summary,
      text: snapshotText,
      source: title !== '' ? title : undefined,
    }
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
      // 自动聚焦对应面：全屏替身在（hook 提供）→ 替身输入区；否则主 composer face
      //（insertReferenceAtTail 已核 face 在场——聚焦同面，best effort 不回滚）。
      if (focusFullscreenInput !== undefined) {
        try {
          focusFullscreenInput()
        } catch {
          // best effort
        }
      } else {
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

  function onMouseUp(): void {
    if (disposed) return
    const extraction = extractSelection(doc, roots)
    if (!isQuotableSelection(extraction, roots)) {
      close()
      return
    }
    pendingText = extraction.text
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
