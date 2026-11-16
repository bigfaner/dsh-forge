// 官方服务缝窄面（task-loop 迁移批——镜像自 project ui/official-seams.ts 消费切片，
// 只保留六组件注册面所需的 ctx 窄面与槽名常量；Bug 台账 tab 等注册面留 project 包）。
// bundle 自含纪律：官方服务以结构同型镜像承载（keyed-section 同款），零上游 import。

/** 官方右栏 tab 体 keyed 槽（dock tab body dispatch 键载体——ui-sidebar-right） */
export const SIDEBAR_RIGHT_PANE_TAB_SLOT = "sidebar.right.pane.tab";

/** 官方右栏 tab chip 题写 keyed 槽（占用者缺席 = 回退开 tab 时点捕获题写——ui-sidebar-right） */
export const SIDEBAR_RIGHT_PANE_TAB_TITLE_SLOT = "sidebar.right.pane.tab.title";

/** 官方会话头 utilities 带（list 槽 scope session——「右对齐会话 utilities 升序」，ui-conversation 槽面核销 2026-11：kind list / scope session / owner ConversationHeaderActionOwnerProps） */
export const SESSION_HEADER_UTILITIES_SLOT = "conversation.session.header.utilities";

/** apply ctx 窄面（cordis Context 消费切片——get 解析注入服务 + reflect 反射读 + effect 级联） */
export interface OfficialSeamCtx {
  get(name: string): unknown;
  /** cordis 事件效果缝（撤销器归级联——官方 ui-reference 同径） */
  effect?(factory: () => (() => void) | undefined, name?: string): unknown;
  /** cordis reflect 只读反射（未 inject 服务的官方面；缺席 = undefined fail-soft） */
  reflect?: { get(name: string, strict?: boolean): unknown };
}

/** unknown → 对象窄化（缺席/非对象 = undefined） */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

/** reflect 只读反射（缺席/异常 = undefined——fail-soft） */
export function reflectGet(ctx: OfficialSeamCtx, name: string, strict = true): unknown {
  try {
    return ctx.reflect?.get(name, strict);
  } catch {
    return undefined;
  }
}
