// @dsh-forge/super-composer —— 全屏呈现感知（proposal §2.4 感知段 / §3 包二）。
//
// 全屏语义：文档（dockkit 呈现面）展开占据中间 + 右侧区域，左侧栏保持不变——
// 官方实现即右栏面板 100vw 呈现态（sidebar-right client.js:
// `"data-sidebar-right-panel": fullscreen ? "fullscreen" : "push"` + `width: "100vw"`）。
//
// 读数双源：
// - 正门：`SidebarRightTabInfo.sidebar.fullscreen`（官方 contract/slots.d.ts:169-174，
//   tabInfo hook 订阅面）——本模块只消费 hook 已取出的布尔快照
//   （`readFullscreenFromHook` 注入缝），React 渲染侧订阅由 client face 组装缝承担；
// - 兜底：DOM 标记（`[data-sidebar-right-panel="fullscreen"]` 主标记）——hook 形状
//   漂移/缺席时的降级读数。
// 纯逻辑可注入（doc / hook getter / watch 均注入）——无 React、无全局硬依赖。

/** tabInfo hook 快照的窄面（只消费 sidebar.fullscreen 切片——形状漂移不抛） */
export interface FullscreenTabInfoLike {
  readonly sidebar?: { readonly fullscreen?: unknown }
}

/**
 * 正门读数：tabInfo hook 快照 → sidebar.fullscreen 布尔。
 * 布尔逐值透传；形状漂移（缺字段/非布尔/非对象）= undefined（交由兜底接管）。
 */
export function fullscreenFromTabInfo(info: unknown): boolean | undefined {
  if (typeof info !== 'object' || info === null) return undefined
  const value = (info as FullscreenTabInfoLike).sidebar?.fullscreen
  return typeof value === 'boolean' ? value : undefined
}

/**
 * DOM 兜底选择器清单：right panel 全屏主标记（官方 sidebar-right 以
 * `data-sidebar-right-panel="fullscreen"|"push"` 落 DOM）。评审 A2：曾列
 * `[data-dockkit-*][data-fullscreen="true"]` 两条——官方无该形状生产者
 * （data-fullscreen 仅 html OS 级全屏），已删。
 */
export const DOM_FULLSCREEN_SELECTORS: readonly string[] = [
  '[data-sidebar-right-panel="fullscreen"]',
]

/** 兜底 DOM 窄面（真实 Document 与测试桩同型——不锁 Document 全量形状） */
export interface FullscreenDom {
  querySelectorAll(selectors: string): ArrayLike<unknown>
}

/**
 * 兜底读数：DOM 标记扫描——任一选择器命中即全屏。doc 缺席 = false。
 */
export function fullscreenFromDocument(
  doc: FullscreenDom | undefined,
  selectors: readonly string[] = DOM_FULLSCREEN_SELECTORS,
): boolean {
  if (doc === undefined) return false
  for (const selector of selectors) {
    try {
      if (doc.querySelectorAll(selector).length > 0) return true
    } catch {
      // 非法选择器（宿主自定义清单）= 该条不参与判定，不炸感知面
    }
  }
  return false
}

/** tracker 装配选项（全部可注入——纯逻辑测试与真机组装共用同一面） */
export interface FullscreenTrackerOptions {
  /** 正门：tabInfo hook 快照 getter（返回 undefined = hook 漂移，交兜底接管） */
  readonly readFullscreenFromHook?: () => boolean | undefined
  /** 兜底 DOM（缺席 = 无兜底源） */
  readonly doc?: FullscreenDom
  /** 兜底选择器清单（默认 DOM_FULLSCREEN_SELECTORS） */
  readonly selectors?: readonly string[]
  /**
   * 外部变化源注入缝（notify 语义：环境呈现态可能变化时回调 notify → tracker 重算
   * 并对值变化广播）。真机组装缝提供 MutationObserver 实现；缺席 = 只拉不推。
   */
  readonly watch?: (notify: () => void) => () => void
}

/** 全屏感知 tracker（isFullscreen 拉取 + subscribe 推送 + dispose 撤销） */
export interface FullscreenTracker {
  /** 当前全屏态（正门优先 → DOM 兜底 → false） */
  isFullscreen(): boolean
  /** 订阅变化（仅值变化通知）；返回退订函数 */
  subscribe(listener: (fullscreen: boolean) => void): () => void
  /** 停 watch + 清订阅（幂等）；dispose 后 subscribe 静默无效 */
  dispose(): void
}

/** 组合读数：正门布尔 → DOM 兜底 → false。 */
function resolveFullscreen(options: FullscreenTrackerOptions): boolean {
  const hookValue = options.readFullscreenFromHook?.()
  if (typeof hookValue === 'boolean') return hookValue
  return fullscreenFromDocument(options.doc, options.selectors)
}

/** 全屏感知 tracker 装配（纯逻辑，无全局依赖）。 */
export function createFullscreenTracker(options: FullscreenTrackerOptions): FullscreenTracker {
  const listeners = new Set<(fullscreen: boolean) => void>()
  let disposed = false
  // 首值即拉取时点读数：watch 首拍与初值相同不广播（subscribe 语义 = 仅变化通知）
  let lastKnown: boolean | undefined = resolveFullscreen(options)
  let stopWatch: (() => void) | undefined
  if (options.watch !== undefined) {
    stopWatch = options.watch(() => {
      if (disposed) return
      const next = resolveFullscreen(options)
      if (next === lastKnown) return
      lastKnown = next
      for (const listener of listeners) listener(next)
    })
  }
  return {
    isFullscreen(): boolean {
      return resolveFullscreen(options)
    },
    subscribe(listener: (fullscreen: boolean) => void): () => void {
      if (disposed) return () => undefined
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      listeners.clear()
      stopWatch?.()
    },
  }
}
