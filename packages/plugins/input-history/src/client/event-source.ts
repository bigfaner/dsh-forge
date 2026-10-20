// 会话事件历史源（tech-design ② 裁定落地：binding.eventSource 解包适配内联本包——
// 参考分支判例，获取径 = 装配期 dsh.client.inject 声明 + 运行期 ctx.sessions 具名服务，
// 非宿主 wiring 注入）。官方 SessionBinding 契约（dsh-api-session-controller
// service.d.ts）：session 面（SessionFace）只有行为动词 + 会话快照，无事件流；事件
// feed 在 binding.eventSource（ObservableSnapshot<SessionEventWindow>）——
// getSnapshot().entries 为事件窗口、subscribe 为同步窗口发布订阅。正门 =
// binding(id) 同步借用 → binding.eventSource。binding 对未保留代返回 undefined，
// 消费面 fail-soft 空态。

import type { HistoryEventFeed, HistorySessionEvent } from './input-history.js'

/** 官方 SessionBinding 消费切片（只读 eventSource；缺席/漂移 = undefined） */
export function historyFeedOf(binding: unknown): HistoryEventFeed | undefined {
  try {
    const source = (binding as { eventSource?: unknown } | undefined)?.eventSource as
      | { getSnapshot?: unknown; subscribe?: unknown }
      | undefined
    if (source === undefined || typeof source.getSnapshot !== 'function' || typeof source.subscribe !== 'function') {
      return undefined
    }
    return {
      // 官方窗口条目为包装形（{type:'event',event}|{type:'transient',…}）——插件 feed
      // 契约为裸 SessionEvent 流，解包属本适配层。
      snapshot: () => {
        let entries: readonly unknown[]
        try {
          entries = ((source.getSnapshot as () => { entries?: readonly unknown[] })().entries ??
            []) as readonly unknown[]
        } catch {
          return []
        }
        return entries.flatMap((entry) => {
          const wrapped = entry as { type?: string; event?: unknown }
          return wrapped?.type === 'event' && wrapped.event !== undefined ? [wrapped.event as HistorySessionEvent] : []
        })
      },
      subscribe: (listener: () => void) => {
        // 退订器形状与 getSnapshot 同口径严格校验：非函数真值/缺席/上游抛错 = 按缺席
        // fail-soft 降级为 no-op 退订（下游 dispose 语义恒安全）。
        try {
          const dispose = (source.subscribe as (cb: () => void) => unknown)(listener)
          return typeof dispose === 'function' ? (dispose as () => void) : (() => undefined)
        } catch {
          return () => undefined
        }
      },
    }
  } catch {
    return undefined
  }
}

/** 活跃会话解析（参考分支 activeSessionIdOf 判例移植）：官方 SessionListState 无
 * current 字段——当前会话正本 = byId 行 `retainedBy.mainView > 0` 即主视图在留
 * （该会话因已被 retain，sessions.binding(id) 按「borrow an already-retained
 * binding」语义可用）。快照缺席/形状漂移/无在留行 = undefined。 */
export function activeSessionIdOf(list: unknown): string | undefined {
  if (typeof list !== 'object' || list === null) return undefined
  const getSnapshot = (list as { getSnapshot?: () => unknown }).getSnapshot
  if (typeof getSnapshot !== 'function') return undefined
  let snapshot: unknown
  try {
    snapshot = getSnapshot.call(list)
  } catch {
    return undefined
  }
  const byId = (snapshot as { byId?: unknown } | null)?.byId
  if (typeof byId !== 'object' || byId === null) return undefined
  for (const row of Object.values(byId as Record<string, unknown>)) {
    const id = (row as { id?: unknown } | null)?.id
    const mainView = (row as { retainedBy?: { mainView?: unknown } } | null)?.retainedBy?.mainView
    if (typeof id === 'string' && id !== '' && typeof mainView === 'number' && mainView > 0) return id
  }
  return undefined
}
