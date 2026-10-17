/**
 * 模块级 store（发布订阅 + revision 守卫，~20 行口径）。
 * set 支持 CAS：expectRevision 不匹配 → false（守卫拒绝，双端写冲突防线）。
 */

export interface StoreSnapshot<T> {
  readonly value: T
  readonly revision: number
}

export interface Store<T> {
  get(): T
  revision(): number
  /** 期望 revision 匹配才写入（CAS）；未传 = 无条件写。成功返回 true。 */
  set(next: T | ((prev: T) => T), expectRevision?: number): boolean
  subscribe(listener: (snapshot: StoreSnapshot<T>) => void): () => void
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial
  let revision = 0
  const listeners = new Set<(snapshot: StoreSnapshot<T>) => void>()
  const snapshot = (): StoreSnapshot<T> => ({ value, revision })
  return {
    get: () => value,
    revision: () => revision,
    set(next, expectRevision) {
      if (expectRevision !== undefined && expectRevision !== revision) return false
      value = typeof next === 'function' ? (next as (prev: T) => T)(value) : next
      revision += 1
      const current = snapshot()
      for (const listener of listeners) listener(current)
      return true
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
