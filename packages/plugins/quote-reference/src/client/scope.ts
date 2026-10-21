// @dsh-forge/quote-reference —— 声明式使用范围（proposal §1）。
//
// 纯模型零 DOM 依赖：组合配置解析（selection.roots / fullscreen.surface）与选区
// 合法性过滤均为纯函数，供监听层（client face 组装）消费。语义（proposal 声明式
// 使用范围）：
//   - 未声明 = 默认全量覆盖（默认 root 清单 + rightbar fullscreen）；
//   - 声明为空清单 = 插件静默不挂监听（零固定税）；
//   - 可引用域 = scope 声明清单——声明外的划选域不触发。
//
// 过滤排除集（proposal §2 判例同构）：折叠选区、编辑域（input/textarea/
// contenteditable）、浮层自身（输入区/控件区/标题区）。

/** 组合配置声明面（cordis 组合行配置项；未声明字段走默认）。 */
export interface QuoteScopeConfig {
  selection?: {
    /** 选区监听域选择器清单（可增删收窄；空清单 = 静默不挂监听） */
    roots?: readonly string[]
  }
  fullscreen?: {
    /** 触发底部替身的全屏呈现源（默认 rightbar fullscreen） */
    surface?: string
  }
}

/** 解析产物：监听域 + 全屏呈现源（监听层消费面）。 */
export interface ResolvedQuoteScope {
  /** 选区监听域选择器清单（= 声明清单；未声明 = 默认清单） */
  readonly selectionRoots: readonly string[]
  /** 是否挂监听（空清单静默语义 = false） */
  readonly listening: boolean
  /** 全屏呈现源标识（未声明 = 默认 rightbar fullscreen） */
  readonly fullscreenSurface: string
}

/** 默认监听域：dockkit 文档容器 + 浮窗 + 主 ChatView 消息区。 */
export const DEFAULT_SELECTION_ROOTS: readonly string[] = [
  '[data-dockkit-pane]',
  '[data-dockkit-float]',
  '[data-chat-messages]',
]

/** 默认全屏呈现源：rightbar fullscreen（proposal 复用核销表）。 */
export const DEFAULT_FULLSCREEN_SURFACE = 'rightbar-fullscreen'

/**
 * 组合配置解析纯函数：宿主声明 → 监听域/排除域 + 全屏源。
 * 未声明 = 默认全量覆盖；roots 声明为空清单 = 静默不挂监听（listening=false）。
 */
export function resolveSelectionScope(config?: QuoteScopeConfig): ResolvedQuoteScope {
  const declaredRoots = config?.selection?.roots
  const selectionRoots = declaredRoots ?? DEFAULT_SELECTION_ROOTS
  return {
    selectionRoots,
    listening: selectionRoots.length > 0,
    fullscreenSurface: config?.fullscreen?.surface ?? DEFAULT_FULLSCREEN_SURFACE,
  }
}

/** 选区探针：监听层从真实 DOM 事件提取的过滤输入（DOM 无关描述，纯模型消费）。 */
export interface SelectionProbe {
  /** 选区是否折叠（collapsed = 无内容，排除） */
  collapsed: boolean
  /** 选区目标是否编辑域：input / textarea / [contenteditable] */
  editableTarget: boolean
  /** 选区落点是否浮层自身区域：input=浮层输入区 / control=控件区 / title=标题区 / null=非浮层 */
  overlayRole: 'input' | 'control' | 'title' | null
  /** 选区容器命中的 scope 声明选择器（null = 声明域外） */
  scopeRoot: string | null
}

/**
 * 选区合法性过滤纯函数：全部排除命中 → 不可引用。
 * 通过排除集后，可引用域由 scope 声明清单最终裁定：scopeRoot 须命中声明选择器之一
 * （declaredRoots 默认取默认清单；监听层传 resolveSelectionScope 产物）。
 */
export function isQuotableSelection(
  probe: SelectionProbe,
  declaredRoots: readonly string[] = DEFAULT_SELECTION_ROOTS,
): boolean {
  if (probe.collapsed) return false
  if (probe.editableTarget) return false
  if (probe.overlayRole != null) return false
  return probe.scopeRoot != null && declaredRoots.includes(probe.scopeRoot)
}
