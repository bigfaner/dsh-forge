// PROVENANCE: 复制自官方 dsh 源码 ui-conversation/src/client/submission-settings.ts @ deepseek-harness f059f01ce367748392d8f665c0705fb4302a626b（0.2.0-rc.2，2026-10-22）；升级需人工 re-copy，漂移自担。
/** Busy-Enter preference stored in the Host user-settings document. */

// PROVENANCE 适配（imports 重写）：schemastery 持久 schema 面不入复制件——替身用
// 浏览器本地默认（DEFAULT_BUSY_ENTER_BEHAVIOR）；ConfigForm 以结构镜像承载。

/** 共享配置表单消费切片（官方 ConfigForm 结构同型——只承载复制件读到的三个动词） */
export interface ConfigForm<T> {
  subscribe(listener: () => void): () => void
  getSnapshot(): { readonly value?: T }
  set(key: string, value: unknown): unknown
}

/** Settings namespace owned by the conversation plugin. */
export const CONVERSATION_SETTINGS_NAMESPACE = 'ui-conversation'

/** Field carrying the delivery mode for plain Enter while an agent is busy. */
export const BUSY_ENTER_FIELD = 'busyEnter'

/** Busy-Enter behaviors accepted at settings and input boundaries. */
export const BUSY_ENTER_BEHAVIORS = ['queue', 'steer'] as const

/** Configurable meaning of plain Enter while the addressed agent is busy. */
export type BusyEnterBehavior = typeof BUSY_ENTER_BEHAVIORS[number]

/** Default preserves Enter-as-Queue for running conversations. */
export const DEFAULT_BUSY_ENTER_BEHAVIOR: BusyEnterBehavior = 'queue'

/** Durable conversation section shared by the Host schema and the browser scope. */
export interface ConversationSettings {
  /** Delivery mode for plain Enter while the addressed agent is busy. */
  busyEnter: BusyEnterBehavior
}



