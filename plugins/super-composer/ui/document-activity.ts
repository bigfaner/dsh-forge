// @dsh-forge/super-composer —— dockkit 文档活动感知（1.39 用户裁决：替身可见性
// 绑定「dockkit 文档」——离文档/插件页/非文档 tab 即隐藏）。
//
// 文档活动判据（官方源码核销，禁裸路径猜测）：
// - dockkit 布局面：`[data-dockkit-surface]`（dsh-client-ui-dockkit lib/index.js
//   Surface 根 "data-dockkit-surface": true）；每个 tab 渲染为
//   `section[data-dockkit-content=<tabId>]`，非可见 tabHost 携 `aria-hidden="true"`
//   （同文件 TabHost："aria-hidden": !visible || void 0）。
// - 文档体锚：①官方 `[data-textpreview-url]`（dsh-client-ui-sidebar-documentpreview
//   lib/client.js——text 渲染态与 unsupported 态都落该属性，值 = tab.contentId，
//   即官方文档预览 tab body 的身份锚）；`[data-document-preview]`（同文件，text
//   渲染态附加，值 = 选中 renderer id）为辅锚。②产品 dockkit 文档 tab body
//   `[data-dswf-doc-panel]`（apps/web/src/views/docs/index.tsx——workspace 文档
//   dock tab 的语境容器，三态[骨架/悬空/正文]同落，值锚 data-dswf-doc-key），
//   第一方源码核销。会话/文件树/终端/开始页/概览等非文档 tab body 均无这些锚。
// 判据：布局面在场（有 dockkit surface）时，任一可见 dockkit content 内存在文档
// 体锚 = 文档活动；布局面缺席（宿主无 dockkit 布局——单测桩/变体壳）= 判据未知，
// 降级不收窄（返回 true，保持既有全屏单信号语义）。
//
// 纯逻辑可注入（doc / watch 均注入）——无 React、无全局硬依赖；读数结构同
// fullscreen.ts（isX 拉取 + subscribe 推送 + dispose 撤销）。

/**
 * DOM 兜底锚清单：布局面 + 文档体锚（官方源码核销见文件头）。
 */
export const DOM_DOC_ACTIVITY_SELECTORS = {
  /** dockkit 布局面（缺席 = 宿主无 dockkit 布局，判据未知 → 降级不收窄） */
  surface: '[data-dockkit-surface]',
  /** 可见 dockkit content（非 aria-hidden——官方 TabHost 以 aria-hidden 标非可见 tab） */
  visibleContent: '[data-dockkit-content]:not([aria-hidden="true"])',
  /** 文档体锚（官方 documentpreview + 产品 dockkit 文档 tab body 身份锚） */
  docBody: '[data-textpreview-url], [data-document-preview], [data-dswf-doc-panel]',
} as const

/** 兜底 DOM 窄面（真实 Document 与测试桩同型——不锁 Document 全量形状） */
export interface DocActivityDom {
  querySelectorAll(selectors: string): ArrayLike<unknown>
  querySelector(selectors: string): unknown
}

/**
 * 读数：文档活动布尔。布局面缺席 = true（降级不收窄）；布局面在场 = 可见
 * content 内文档体锚在场判定。
 */
export function documentActivityFromDocument(doc: DocActivityDom | undefined): boolean {
  if (doc === undefined) return true
  try {
    if (doc.querySelector(DOM_DOC_ACTIVITY_SELECTORS.surface) === null) return true
    const visible = doc.querySelectorAll(DOM_DOC_ACTIVITY_SELECTORS.visibleContent)
    const anchors = doc.querySelectorAll(DOM_DOC_ACTIVITY_SELECTORS.docBody)
    for (let i = 0; i < visible.length; i++) {
      const section = visible[i] as { contains?: (node: unknown) => boolean }
      // 锚须落在可见 content 子树内（多 pane 时非本 tab 的锚不算活动）
      for (let j = 0; j < anchors.length; j++) {
        if (section.contains?.(anchors[j]) === true) return true
      }
    }
    return false
  } catch {
    // 官方面漂移 = 降级不收窄，不炸感知面
    return true
  }
}

/** tracker 装配选项（全部可注入——纯逻辑测试与真机组装共用同一面） */
export interface DocumentActivityTrackerOptions {
  /** 兜底 DOM（缺席 = 恒 true 降级） */
  readonly doc?: DocActivityDom
  /**
   * 外部变化源注入缝（notify 语义：DOM 可能变化时回调 notify → tracker 重算并对
   * 值变化广播）。真机组装缝提供 MutationObserver 实现；缺席 = 只拉不推。
   */
  readonly watch?: (notify: () => void) => () => void
}

/** 文档活动 tracker（isActive 拉取 + subscribe 推送 + dispose 撤销） */
export interface DocumentActivityTracker {
  /** 当前文档活动态（布局面缺席 = true 降级） */
  isActive(): boolean
  /** 订阅变化（仅值变化通知）；返回退订函数 */
  subscribe(listener: (active: boolean) => void): () => void
  /** 停 watch + 清订阅（幂等）；dispose 后 subscribe 静默无效 */
  dispose(): void
}

/** 文档活动 tracker 装配（纯逻辑，无全局依赖）。 */
export function createDocumentActivityTracker(options: DocumentActivityTrackerOptions): DocumentActivityTracker {
  const listeners = new Set<(active: boolean) => void>()
  let disposed = false
  // 首值即拉取时点读数：watch 首拍与初值相同不广播（subscribe 语义 = 仅变化通知；
  // 初次 render() 已拉取，首拍重广播只会造成冗余重渲染）
  let lastKnown: boolean | undefined = documentActivityFromDocument(options.doc)
  let stopWatch: (() => void) | undefined
  if (options.watch !== undefined) {
    stopWatch = options.watch(() => {
      if (disposed) return
      const next = documentActivityFromDocument(options.doc)
      if (next === lastKnown) return
      lastKnown = next
      for (const listener of listeners) listener(next)
    })
  }
  return {
    isActive(): boolean {
      return documentActivityFromDocument(options.doc)
    },
    subscribe(listener: (active: boolean) => void): () => void {
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
