/**
 * The UF3 selected-task store (task 5.8) — the board's selection linkage has
 * ONE source (task Hard Rule: 联动选中态单一来源,禁止三视图各自维护选中副本):
 * every activation (视图 B 行 / 视图 C 行 / 视图 A 节点, plus the dock's own
 * 依赖链 jump) writes HERE, and both readers — the detail dock's open key and
 * the origin-view selected highlights — read from here through controlled
 * props. The views never own a copy.
 *
 * Scope (AC2: 页内会话期): one store per TaskBoardPage MOUNT — the factory,
 * not a singleton, so leaving the tasks tab drops the selection with the page
 * and nothing persists across projects or sessions.
 *
 * The snapshot carries two arms on purpose:
 *   taskKey  the last selected QUALIFIED key — SURVIVES close (AC2: 关闭后
 *            再次打开恢复上次选中). It is also the highlight source, so the
 *            origin row stays marked while the dock is closed — the visible
 *            affordance that re-activating it restores the dock.
 *   open     whether the dock is showing that key. select() opens + retargets
 *            (one write path every source shares); close() drops only the
 *            open arm.
 *
 * Plain observable shape (the view-key machine currency): getSnapshot /
 * subscribe drive useSyncExternalStore; transitions commit only on real
 * change and hand listeners a fresh frozen snapshot.
 */

/** The selection snapshot — a stable reference between transitions. */
export interface SelectedTaskSnapshot {
  /** The last selected qualified task key (`<featureSlug>/<localId>`), or undefined before any selection. */
  readonly taskKey: string | undefined
  /** Whether the detail dock is open on that key. */
  readonly open: boolean
}

/** The never-selected boot snapshot (frozen — snapshots never mutate). */
export const INITIAL_SELECTED_TASK: SelectedTaskSnapshot = Object.freeze({
  taskKey: undefined,
  open: false,
})

/** The observable selection store the board page owns (one per page mount). */
export interface SelectedTaskStore {
  /** @returns the current snapshot (stable reference between transitions). */
  getSnapshot(): SelectedTaskSnapshot
  /** Subscribe to transitions (called after the snapshot changed). */
  subscribe(listener: () => void): () => void
  /** Select a task and open the dock on it — the one write path every source shares. */
  select(taskKey: string): void
  /** Close the dock, KEEPING the key (the reopen-restore memory, 页内会话期). */
  close(): void
}

/**
 * Create a page-scoped selection store.
 * @returns the store (getSnapshot/subscribe for useSyncExternalStore).
 */
export function createSelectedTaskStore(): SelectedTaskStore {
  let snapshot: SelectedTaskSnapshot = INITIAL_SELECTED_TASK
  const listeners = new Set<() => void>()

  const commit = (next: SelectedTaskSnapshot): void => {
    if (next.taskKey === snapshot.taskKey && next.open === snapshot.open) return
    snapshot = Object.freeze(next)
    for (const listener of [...listeners]) listener()
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    select(taskKey: string): void {
      commit({ taskKey, open: true })
    },
    close(): void {
      if (!snapshot.open) return
      commit({ taskKey: snapshot.taskKey, open: false })
    },
  }
}
