/**
 * Snapshot store（official-input 复制件本地支撑面）。
 * PROVENANCE：ObservableSnapshot 类型自任务 1.5 起改指 @deepseek-ai/dsh-client-store
 * 公开包本体（0.2.2-rc.5，contract.d.ts ObservableSnapshot 逐成员同型——镜像退役）。
 * SnapshotStore 保留本地薄片：官方公开 SnapshotStore 额外携带 update(immer draft)/
 * persist 语义——替身内部自持 store 只服务本地 busyEnter 等插件内状态、无 immer draft
 * 域，set 薄片保留。运行期 createSnapshotStore 维持本地自持实现（服务缺席不引入第二份
 * npm 运行实例——跨边界消费（官方 InputState store）一律结构读取，不经过本文件）。
 */

/** 官方公开包本体的只读快照消费切片（改指 @deepseek-ai/dsh-client-store）。 */
export type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'

import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'

/** 可写快照店本地薄片（官方 ObservableSnapshot + set——官方 update/persist 域替身不消费）。 */
export interface SnapshotStore<T> extends ObservableSnapshot<T> {
  set(next: T): void
}

/** 最小快照店（引用不变性发布——同值不扇出） */
export function createSnapshotStore<T>(initial: T): SnapshotStore<T> {
  let current = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => current,
    set(next) {
      if (next === current) return
      current = next
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
