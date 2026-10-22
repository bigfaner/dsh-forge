/**
 * Snapshot store 镜像（official-input 复制件本地支撑面）。
 * PROVENANCE：官方源位 packages/client/@deepseek-ai/dsh-client-store 的结构同型镜像
 * （服务缺席不引入第二份 npm 实例——复制件内部自持 store 只服务本地 busyEnter 等
 * 插件内状态，跨边界消费（官方 InputState store）一律结构读取，不经过本文件）。
 * 官方版本锚：0.2.0-rc.2（2026-10-22，repo f059f01ce367748392d8f665c0705fb4302a626b）。
 */

/** 官方 ObservableSnapshot 消费切片（只读快照店） */
export interface ObservableSnapshot<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

/** 官方 SnapshotStore 消费切片（可写快照店——复制件内部状态自持用） */
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
