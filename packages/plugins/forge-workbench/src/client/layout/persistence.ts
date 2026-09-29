/**
 * The layout-memory ENGINE binding (M4 task 4.5; tech-design §Interfaces·
 * Interface 1 get/setProjectUiState + Interface 4): the plugin-lifetime
 * collector that folds the seam fragments (collect.ts), writes them through
 * `setProjectUiState` on a DEBOUNCE (AC1: 不为每次拖动即时写 — a ratio drag
 * commits every pointer move; the write path coalesces the burst into one
 * trailing write), and — on a project re-entry — reads the stored layout and
 * REPLAYS it (replay.ts) so 恢复态 = 离开前布局 (SC4).
 *
 * Lifecycle semantics:
 *   - 换台 (project switch): the OLD project's layout is flushed IMMEDIATELY
 *     (write-on-leave — the fragments at that instant are the 离开前布局),
 *     the fragments reset, and the NEW project loads + replays. The pointer
 *     subscription must register BEFORE the rightbar linkage watcher for the
 *     flush to see the pre-close tab set (the apply wiring's ordering);
 *   - 删除清除 (project removal): `forget(projectId)` cancels the removed
 *     project's pending write and drops its fragments BEFORE the pointer
 *     falls — a debounced write landing after the FK cascade would
 *     RESURRECT a project_ui_state row for a gone project (upsert + no FK
 *     guard on the write path). The kernel's cascade + the 4.2/4.3 window
 *     closes are the landed halves; this is the client's no-resurrect half;
 *   - 无行 = 默认布局 (fix-2): a project with NO project_ui_state row
 *     answers the default blob + stored:false — NOTHING replays and the
 *     tree feed stays silent, so the §2.3 activation auto-expand survives
 *     the first entry (the SC7 regression 4.6 diagnosed: the default blob's
 *     EMPTY tree branch used to publish over the activation expansion);
 *     collection still runs — the first seam report writes the first row;
 *   - 写入失败: a rejected setProjectUiState (ERR_PROJECT_NOT_FOUND after a
 *     removal, storage faults) logs and drops — never a throw, never a
 *     retry storm. The kernel re-validates every write anyway (4.1's
 *     server-side second gate).
 *
 * The write debounce interval (800ms trailing) rides `clock` injection for
 * test determinism; the restore feed exposes the last restored tree block
 * as an observable (`getRestoredTree` + `subscribeRestoredTree`) — the
 * sidebar seat's controlled `layout` prop (1.4's parent-fed seam) reads it
 * through useSyncExternalStore, so the C3 tree restores with the project.
 */
import type { ProjectLayout } from '../ipc-types'
import type { TreeLayoutState } from '../components/project-tree/tree-derive'
import {
  collectProjectLayout,
  type DetachedCollectEntry,
  type RightbarCollectInput,
  type SidebarGeometryFragment,
} from './collect'
import { replayProjectLayout, type LayoutReplayFaces } from './replay'

/**
 * The 4.1 verb subset the engine rides (the bridge's ui-state pair).
 * fix-2 additive:`stored` = 行存在信号(kernel 回传;false/缺席 = 该项目从未
 * 写过布局,layout 即默认 blob)—— 引擎据此跳过默认 blob 的恢复重放。
 */
export interface LayoutMemoryVerbs {
  getProjectUiState(input: { readonly projectId: string }): Promise<{ readonly layout: ProjectLayout; readonly stored?: boolean }>
  setProjectUiState(input: { readonly projectId: string; readonly layout: ProjectLayout }): Promise<void>
}

/** The trailing-debounce interval (AC1: coalesce drag bursts into one write). */
export const LAYOUT_WRITE_DEBOUNCE_MS = 800

/** The clock seam (test determinism; the default is the platform timer). */
export interface LayoutMemoryClock {
  setTimeout(handler: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

const defaultClock = (): LayoutMemoryClock => ({
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
})

/** The engine's options. */
export interface LayoutMemoryEngineOptions {
  /** The ui-state verb pair (the 4.1 bridge members). */
  readonly verbs: LayoutMemoryVerbs
  /** The active-project pointer read (null = 未激活; collection suspends). */
  readonly projectId: () => string | null
  /** The replay legs, resolved LAZILY per replay (the late-boot lesson). */
  readonly getReplayFaces?: (() => LayoutReplayFaces | undefined) | undefined
  /** The trailing write debounce (default {@link LAYOUT_WRITE_DEBOUNCE_MS}). */
  readonly debounceMs?: number | undefined
  /** The injected clock (tests); defaults to the platform timer. */
  readonly clock?: LayoutMemoryClock | undefined
  /** The structured-log sink (write/replay degrades; never a user surface). */
  readonly log?: ((message: string) => void) | undefined
}

/** The layout-memory engine's public face. */
export interface LayoutMemoryEngine {
  /** The sidebar geometry collect sink (the shell seat's fragment). */
  setSidebar(fragment: SidebarGeometryFragment): void
  /** The tree collect sink (1.4's onLayoutChange payload). */
  setTree(layout: TreeLayoutState): void
  /** The rightbar collect sink (4.4's onLayoutChange payload + inventory). */
  setRightbar(input: RightbarCollectInput): void
  /** The detached-set collect sink (4.3's window-changed mirror). */
  setDetached(entries: readonly DetachedCollectEntry[]): void
  /** The currently collected blob (the fragments folded; pure read). */
  snapshot(): ProjectLayout
  /** The pointer-change reaction: flush the old project, load+replay the new. */
  handleProjectChange(): void
  /** Re-load + re-replay the CURRENT project (the boot service-race retry). */
  replayNow(): void
  /** Immediate guarded write (leave path); a no-op while clean. */
  flush(): void
  /**
   * The removal clear (删除清除): cancel the project's pending write + drop
   * its fragments — called BEFORE the removeProject verb (the markRemoved
   * ordering) so no debounced write can resurrect the cascaded row.
   */
  forget(projectId: string): void
  /** The last restored tree block (undefined until a restore lands). */
  getRestoredTree(): TreeLayoutState | undefined
  /** Subscribe to restored-tree changes (the seat's controlled-layout feed). */
  subscribeRestoredTree(listener: () => void): () => void
  /** Tear down: cancel the pending write, drop the state. */
  dispose(): void
}

const sameTreeLayout = (a: TreeLayoutState | undefined, b: TreeLayoutState | undefined): boolean => {
  if (a === b) return true
  if (a === undefined || b === undefined) return false
  return a.expandedProjects.join('\u{0}') === b.expandedProjects.join('\u{0}')
    && a.expandedSessions.join('\u{0}') === b.expandedSessions.join('\u{0}')
    && a.overflowOpen.join('\u{0}') === b.overflowOpen.join('\u{0}')
}

/**
 * Create the plugin-lifetime layout-memory engine (ONE per main window; the
 * apply body guards the bridge). Hostless worlds never construct one — the
 * collection seams stay unwired, exactly the pre-4.5 shape.
 * @param options - the verbs + the pointer read + the lazy replay faces.
 * @returns the engine face.
 */
export function createLayoutMemoryEngine(options: LayoutMemoryEngineOptions): LayoutMemoryEngine {
  const { verbs, projectId } = options
  const debounceMs = options.debounceMs ?? LAYOUT_WRITE_DEBOUNCE_MS
  const clock = options.clock ?? defaultClock()
  const log = options.log ?? ((): void => {})

  let sidebar: SidebarGeometryFragment | undefined
  let tree: TreeLayoutState | undefined
  let rightbar: RightbarCollectInput | undefined
  let detached: readonly DetachedCollectEntry[] | undefined
  let restoredTree: TreeLayoutState | undefined
  let lastSeenProject: string | null = projectId()
  let dirty = false
  let timer: unknown
  const restoredListeners = new Set<() => void>()

  const notifyRestored = (): void => {
    for (const listener of [...restoredListeners]) listener()
  }

  const cancelPending = (): void => {
    if (timer !== undefined) {
      clock.clearTimeout(timer)
      timer = undefined
    }
  }

  /** The trailing debounce: a burst of seam reports = ONE write. */
  const schedule = (): void => {
    const target = projectId()
    if (target === null) return // 未激活: nothing to persist for
    cancelPending()
    timer = clock.setTimeout(() => {
      timer = undefined
      writeNow(target)
    }, debounceMs)
  }

  /** The immediate guarded write (debounce fire + the leave flush). */
  const writeNow = (forProject: string): void => {
    cancelPending()
    if (!dirty) return
    dirty = false
    const layout = snapshot()
    verbs.setProjectUiState({ projectId: forProject, layout })
      .then(() => {}, (error) => {
        // ERR_PROJECT_NOT_FOUND (a removal raced the write) or a storage
        // fault: log + drop — the next seam report reschedules cleanly.
        log(`layout-memory: setProjectUiState rejected for ${forProject}: ${String(error)}`)
      })
  }

  const loadAndReplay = (target: string): void => {
    verbs.getProjectUiState({ projectId: target })
      .then(
        ({ layout, stored }) => {
          // The pointer may have moved again while the read was in flight —
          // a stale restore must not replay onto the wrong project.
          if (projectId() !== target) return
          // fix-2:无行 = 默认布局 —— the project never persisted a layout,
          // so the fresh native posture IS the default layout and NOTHING
          // replays. The default blob's replay plan is empty anyway; the
          // hazard was the tree feed: publishing the EMPTY default block
          // hands the browser a parent-fed layout whose sync CLOBBERS the
          // §2.3 activation auto-expand of the just-entered project's group
          // (the SC7 regression 4.6 diagnosed). Only a stored row (stored
          // === true; anything else = an older/absent signal) carries a
          // memory worth replaying.
          if (stored !== true) return
          // Notify ONLY on a real tree-content change (the 4.6 SC4 e2e
          // finding): the boot service-race retry re-reads an IDENTICAL
          // layout, and an unconditional re-notify hands the browser a fresh
          // (content-equal) reference whose parent-fed sync CLOBBERS the
          // §2.3 activation auto-expand of a fresh project's group — the
          // restore echo must be as silent as the write echo below.
          const treeChanged = !sameTreeLayout(restoredTree, layout.tree)
          restoredTree = layout.tree
          if (treeChanged) notifyRestored()
          const faces = options.getReplayFaces?.()
          if (faces === undefined) return
          const outcome = replayProjectLayout(layout, faces)
          if (outcome.degraded > 0) log(`layout-memory: replay degraded ${String(outcome.degraded)}/${String(outcome.planned)} ops`)
        },
        (error) => {
          // 恢复失败 → 默认布局: the read itself failed — nothing replays,
          // the fresh native posture IS the default layout (the kernel's
          // sanitize backstop covers the corrupt-blob arm main-side).
          log(`layout-memory: getProjectUiState rejected for ${target}: ${String(error)}`)
        },
      )
  }

  const resetFragments = (): void => {
    sidebar = undefined
    tree = undefined
    rightbar = undefined
    detached = undefined
    restoredTree = undefined
    dirty = false
    cancelPending()
    notifyRestored()
  }

  const snapshot = (): ProjectLayout => collectProjectLayout({
    ...(sidebar === undefined ? {} : { sidebar }),
    ...(tree === undefined ? {} : { tree }),
    ...(rightbar === undefined ? {} : { rightbar }),
    ...(detached === undefined ? {} : { detached }),
  })

  return {
    setSidebar(fragment) {
      sidebar = fragment
      dirty = true
      schedule()
    },
    setTree(layout) {
      // The restore's own application reports back through the same seam —
      // a report identical to the restored block is the replay echo, not a
      // user edit: record it WITHOUT scheduling (no write-back churn).
      tree = layout
      if (sameTreeLayout(layout, restoredTree)) return
      dirty = true
      schedule()
    },
    setRightbar(input) {
      rightbar = input
      dirty = true
      schedule()
    },
    setDetached(entries) {
      detached = entries
      dirty = true
      schedule()
    },
    snapshot,
    handleProjectChange() {
      const next = projectId()
      if (next === lastSeenProject) return
      const previous = lastSeenProject
      lastSeenProject = next
      // Write-on-leave: the fragments this instant are the 离开前布局.
      if (previous !== null) writeNow(previous)
      resetFragments()
      if (next !== null) loadAndReplay(next)
    },
    replayNow() {
      const current = projectId()
      if (current !== null) loadAndReplay(current)
    },
    flush() {
      const current = lastSeenProject
      if (current !== null) writeNow(current)
    },
    forget(gone) {
      if (lastSeenProject !== gone) return
      // The removed project is no longer a write target: clear + disarm so
      // neither the pending debounce nor a leave flush can resurrect its row.
      lastSeenProject = null
      resetFragments()
    },
    getRestoredTree: () => restoredTree,
    subscribeRestoredTree(listener) {
      restoredListeners.add(listener)
      return () => { restoredListeners.delete(listener) }
    },
    dispose() {
      cancelPending()
      restoredListeners.clear()
      resetFragments()
    },
  }
}
