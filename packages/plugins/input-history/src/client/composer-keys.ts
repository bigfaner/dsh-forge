// 键位源 + mention 菜单态守卫（composer-correction 分支 apps/web/src/client-plugin/
// plugin.ts:1479-1656 判例移植内联——键位接线与守卫归插件域，共享逻辑各自内联）：
// 官方缝核销（上游 0.2.0-rc.2 源码实读，同参考分支判例）：
//   ① 菜单开合态官方服务面：公开 SessionInput 明文不含菜单态——运行期
//     `conversation.input` 解析器本体为 InputHub 结构超集，其 `launcher`
//     ObservableSnapshot<string|null> 即菜单开合态（非 null = 触发菜单开）。
//     官方面探测 = 结构性 fail-soft 反射（面缺席/漂移 = undefined → DOM 降级）。
//   ② DOM 降级面（dsh-client-ui-commands）：候选菜单弹层 = role="listbox" 容器 +
//     role="option" 行——pin 选择器 + option 结构要求即漂移守卫：读不到/结构不认识
//     一律判 false 不拦键（宁可历史失灵不可吞菜单导航）。
// 守卫只短路转发（菜单开 = 键归官方菜单导航），不动官方 keymap 与 composer DOM。

/** 官方候选菜单弹层 pin 选择器（dsh-client-ui-commands 核销——role=listbox 容器） */
export const COMPOSER_MENU_POPUP_SELECTOR = '[role="listbox"]'

/** 记录结构消费切片（unknown → 可索引） */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
}

/** 服务反射读取窄面（cordis ctx——具名服务 fail-soft 读取；异常 = undefined） */
export function serviceGet(ctx: unknown, name: string): unknown {
  const reflect = asRecord(asRecord(ctx)?.['reflect'])?.['get']
  if (typeof reflect !== 'function') return undefined
  try {
    return (reflect as (n: string) => unknown).call(asRecord(ctx)?.['reflect'], name)
  } catch {
    return undefined
  }
}

/** DOM 查询窄面（bundle/test 双 tsconfig 零 DOM lib——globalThis.document 结构消费切片） */
export interface ForgeComposerMenuDocument {
  querySelectorAll(selectors: string): { readonly length: number } | undefined
  getSelection?(): { readonly anchorNode: unknown; readonly anchorOffset: number } | null | undefined
}

/**
 * 官方服务面菜单开合判定（守卫第一优先）：`conversation.input` 解析器结构反射
 * `inputTriggers(sessionId).launcher.getSnapshot()`——非 null = 触发菜单开（slash/mention
 * 共用弹层壳）；null = 关。解析器/inputTriggers/launcher 任一缺席或形状漂移 = undefined
 * （调用方降级 DOM 判定）；调用异常同 undefined。
 */
export function officialMenuOpenOf(resolver: unknown, sessionId: string): boolean | undefined {
  const inputTriggers = asRecord(resolver)?.['inputTriggers']
  if (typeof inputTriggers !== 'function') return undefined
  try {
    const controller = asRecord((inputTriggers as (id: string) => unknown).call(resolver, sessionId))
    const launcher = controller?.['launcher'] as { getSnapshot?: () => unknown } | undefined
    if (typeof launcher?.getSnapshot !== 'function') return undefined
    return launcher.getSnapshot() !== null
  } catch {
    return undefined
  }
}

/**
 * DOM 弹层在场判定（守卫降级面）：pin 选择器（role=listbox）+ option 行结构要求——
 * 官方候选菜单弹层形态（漂移守卫：选择器不命中/option 结构不在 = 关；查询异常/文档
 * 缺席 = false 不拦键）。
 */
export function domMenuPopupOpen(doc: ForgeComposerMenuDocument | undefined): boolean {
  if (doc === undefined || typeof doc.querySelectorAll !== 'function') return false
  try {
    const options = doc.querySelectorAll(`${COMPOSER_MENU_POPUP_SELECTOR} [role="option"]`)
    return options !== undefined && options.length > 0
  } catch {
    return false
  }
}

/**
 * mention 菜单态守卫组装（方向键转发前判定；只短路转发，不动纯函数层）：
 * 官方服务面可读 = 官方判定；缺席/漂移 = DOM 弹层在场降级；两径皆不可得 = false
 * （读不到一律不拦键——宁可历史失灵不可吞菜单导航）。
 */
export function composerMenuGuardOf(
  ctx: unknown,
  doc?: ForgeComposerMenuDocument,
): (sessionId: string) => boolean {
  return (sessionId: string): boolean => {
    const official = officialMenuOpenOf(asRecord(serviceGet(ctx, 'conversation'))?.['input'], sessionId)
    if (official !== undefined) return official
    return domMenuPopupOpen(doc)
  }
}

/** composer 编辑面目标判定（纯函数）：事件 target 在带 Lexical 编辑器标记的
 * contenteditable 内（官方 ComposerContentEditable 渲染面——contenteditable="true" +
 * `__lexicalEditor` 挂载标记；结构漂移 = false 不接键） */
export function isComposerEditableTarget(target: unknown): boolean {
  const el = target as { closest?: (selectors: string) => unknown } | null | undefined
  if (typeof el?.closest !== 'function') return false
  try {
    const editable = asRecord(el.closest('[contenteditable="true"]'))
    return editable !== undefined && '__lexicalEditor' in editable
  } catch {
    return false
  }
}

/** DOM 键盘事件窄面（真实按键源消费切片——preventDefault + stopImmediatePropagation =
 * 吞键：官方 Lexical keymap 的 target 级监听不再收到） */
export interface ForgeComposerDomKeyEvent {
  readonly key: string
  readonly target: unknown
  preventDefault(): void
  stopImmediatePropagation(): void
}

/** DOM 事件订阅窄面（capture 形态——document 捕获段先于 Lexical target 监听） */
export interface ForgeComposerEventTarget {
  addEventListener(type: string, listener: (event: ForgeComposerDomKeyEvent) => void, capture: boolean): void
  removeEventListener(type: string, listener: (event: ForgeComposerDomKeyEvent) => void, capture: boolean): void
}

/**
 * composer DOM 方向键源（真实按键接线——官方 keymap 保留面之外的窄缝接入，零
 * composer 改制）：document 捕获段 keydown，ArrowUp/ArrowDown 且 target 在 composer
 * 编辑面内时——mention 菜单开（menuOpen() = true）即不转发（键归官方菜单导航）；
 * 菜单关才向 handler 转发手势（preventDefault = DOM preventDefault + 捕获段
 * stopImmediatePropagation，官方 keymap 不再收到）。返回退订器；文档/订阅面缺席 =
 * undefined（调用方 fail-soft 跳过）。
 */
export function createComposerDomKeySource(
  doc: ForgeComposerEventTarget | undefined,
  menuOpen: () => boolean,
  handler: (gesture: { key: string; preventDefault(): void }) => void,
): (() => void) | undefined {
  if (doc === undefined || typeof doc.addEventListener !== 'function') return undefined
  const listener = (event: ForgeComposerDomKeyEvent): void => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    if (!isComposerEditableTarget(event.target)) return
    if (menuOpen()) return
    handler({
      key: event.key,
      preventDefault: () => {
        try {
          event.preventDefault()
          event.stopImmediatePropagation()
        } catch {
          // 事件面漂移——吞键失败不外溢（键落官方 keymap，行为与未接线一致）
        }
      },
    })
  }
  doc.addEventListener('keydown', listener, true)
  return () => {
    try {
      doc.removeEventListener('keydown', listener, true)
    } catch {
      // 撤订失败不外溢（fiber 卸载对称口径）
    }
  }
}

/** DOM 节点窄面（光标偏移纯函数消费切片——Node 测试环境零 DOM lib） */
export interface ForgeComposerDomNode {
  readonly nodeType?: number
  readonly textContent?: unknown
  readonly parentNode?: ForgeComposerDomNode | null
  readonly childNodes?: readonly ForgeComposerDomNode[]
}

/**
 * 光标文档偏移（纯函数）：anchor 相对编辑面 root 的前缀文本长度 + 段内偏移（collapsed
 * selection 消费）。anchor 不在 root 内 = undefined（调用方退非零 = 不触发行首门——
 * 宁可历史失灵不可误触翻阅）。
 */
export function caretOffsetInEditor(
  root: ForgeComposerDomNode,
  anchor: ForgeComposerDomNode | null | undefined,
  offset: number,
): number | undefined {
  if (anchor === null || anchor === undefined) return undefined
  let acc = 0
  const walk = (node: ForgeComposerDomNode): number | undefined => {
    if (node === anchor) return acc + offset
    if (node.nodeType === 3) {
      acc += typeof node.textContent === 'string' ? node.textContent.length : 0
      return undefined
    }
    for (const child of node.childNodes ?? []) {
      const hit = walk(child)
      if (hit !== undefined) return hit
    }
    return undefined
  }
  return walk(root)
}

/** 光标读面：当前 selection 在 composer 编辑面内 = 文档偏移（缺席/漂移/异常
 * = 1 非零——不满足行首门，原生光标移动不受扰） */
export function composerCaretOf(doc: ForgeComposerMenuDocument | undefined): number {
  try {
    const selection = doc?.getSelection?.()
    const anchor = selection?.anchorNode
    if (anchor === null || anchor === undefined) return 1
    const el = anchor as { parentElement?: { closest?: (s: string) => unknown } } | null
    const root = asRecord(el?.parentElement?.closest?.('[contenteditable="true"]'))
    if (root === undefined || !('__lexicalEditor' in root)) return 1
    return caretOffsetInEditor(root as ForgeComposerDomNode, anchor as ForgeComposerDomNode, selection?.anchorOffset ?? 0) ?? 1
  } catch {
    return 1
  }
}
