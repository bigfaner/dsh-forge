/**
 * The board page's session store (task 5.11, AC3/AC4): the per-plugin-lifetime
 * memory the task board hydrates from, so a UF5 launch round-trip — 切会话视图
 * (the keyed main slot UNMOUNTS the shell when the panel is deselected; only
 * the rail overlay keeps it) — and back loses neither the selection nor the
 * scroll. The 5.8 selection store's 页内会话期 scope deliberately ends at the
 * page mount; THIS store is the plugin-session tier above it (created once in
 * the client apply, threaded through both navigation forms — the same identity
 * channel the view-key machine uses).
 *
 * Members:
 *   selection — a SelectedTaskStore (5.8's shape, verbatim semantics: select
 *               opens + retargets, close keeps the key). The page uses the
 *               injected one when present and falls back to a per-mount
 *               instance otherwise (tests / seat mounts keep 5.8 behavior).
 *               Since 6.4 the plugin-lifetime selection is PROJECT-SCOPED:
 *               the page's mount-time bindProject closes it when the board
 *               re-mounts for a DIFFERENT active project (SC5-2 无跨项目残留);
 *               same-project remounts (the UF5 round trip) keep it.
 *   scroll    — the board's scroll memory (the tree viewport stash, view B's
 *               horizontal offset, the shell content's vertical scrollTop).
 *               Save-on-leave / restore-on-enter, exact-value, never clamped
 *               here (the DOM clamps on apply).
 *   links     — the 运行中徽标 data (AC3): taskKey → sessionId of the task's
 *               ACTIVE session link. Writers: launch success (markLinkActive),
 *               the dock's detail load (reconcileLinks — getTaskDetail's links
 *               row is authoritative for that task: active rows light the
 *               badge, an ended/absent link drops it), and markLinksEnded for
 *               the event-push seam (a session_link end event lands here the
 *               moment one exists in the WorkbenchEvent vocabulary — 6.x; the
 *               ≤5s AC budget is met by the same-transition commit below).
 *               Keyed per project: a project switch clears the map (links are
 *               project-scoped rows; a stale cross-project badge is a defect).
 */
import type { Viewport } from '@xyflow/react'
import type { SessionLink } from '../ipc-types'
import {
  createSelectedTaskStore, type SelectedTaskSnapshot, type SelectedTaskStore,
} from './selected-task'

/** The board's scroll memory (AC4: 滚动位置保持). */
export interface BoardScrollMemory {
  /** The shell content area's vertical offset while the tasks tab was live. */
  readonly contentScrollTop: number
  /** View B's horizontal kanban offset (the 5.5 stash-on-leave rule). */
  readonly statusBoardScrollLeft: number
  /** View A's settled pan/zoom (fit-view 仅首载; a re-entry restores it). */
  readonly treeViewport: Viewport | undefined
}

/** The never-scrolled boot memory. */
export const INITIAL_BOARD_SCROLL: BoardScrollMemory = Object.freeze({
  contentScrollTop: 0,
  statusBoardScrollLeft: 0,
  treeViewport: undefined,
})

/** The observable board-session store the client apply owns. */
export interface BoardSessionStore {
  /** The 5.8-shaped selection store (select opens + retargets; close keeps). */
  readonly selection: SelectedTaskStore
  /** @returns the current scroll memory (stable reference between saves). */
  getScroll(): BoardScrollMemory
  /** Merge a scroll patch (save-on-leave writes come here). */
  saveScroll(patch: Partial<BoardScrollMemory>): void
  /** @returns taskKey → sessionId of the task's ACTIVE session link. */
  getActiveLinks(): ReadonlyMap<string, string>
  /** Subscribe to active-link transitions (badge re-renders ride this). */
  subscribeLinks(listener: () => void): () => void
  /** Launch success: the task's link is active on the launched session. */
  markLinkActive(projectId: string, taskKey: string, sessionId: string): void
  /** An end arrived out-of-band (the event-push seam): drop the badges. */
  markLinksEnded(projectId: string, taskKeys: readonly string[]): void
  /**
   * The dock's authoritative read for one task (getTaskDetail.links): active
   * rows light the badge (latest wins), a load whose previously-active link is
   * ended/absent drops it.
   */
  reconcileLinks(projectId: string, taskKey: string, links: readonly SessionLink[]): void
  /**
   * Project rebind (6.4, SC5-2): the board page calls this on mount — a bind
   * to a DIFFERENT project closes the selection (a stale cross-project taskKey
   * re-aimed at the new project's detail verb is residue, not state) and the
   * link map follows the existing project scoping. The SAME project rebinds
   * untouched (the 5.11 UF5 round-trip — launch → 切会话视图 → back on one
   * project — keeps selection and badges).
   */
  bindProject(projectId: string | undefined): void
}

/**
 * Create the board-session store (one per plugin lifetime in the real app;
 * tests create isolated instances).
 * @param selection - optional pre-built selection store (defaults fresh).
 * @returns the store (plain observable shape throughout).
 */
export function createBoardSessionStore(selection?: SelectedTaskStore): BoardSessionStore {
  const selectionStore = selection ?? createSelectedTaskStore()
  let scroll: BoardScrollMemory = INITIAL_BOARD_SCROLL
  let projectId: string | undefined
  let activeLinks: ReadonlyMap<string, string> = new Map()
  const linkListeners = new Set<() => void>()

  /** Project scoping: a different project's board starts from a clean map. */
  const ensureProject = (next: string): void => {
    if (projectId === next) return
    const previous = projectId
    projectId = next
    // 6.4 (SC5-2 无跨项目残留): a genuine CROSS-PROJECT transition retires the
    // selection with the link map — the open taskKey addressed the previous
    // project's board. The initial bind (undefined → first project) closes
    // nothing: no cross-project key can predate it.
    if (previous !== undefined) selectionStore.close()
    if (activeLinks.size === 0) return
    activeLinks = new Map()
    for (const listener of [...linkListeners]) listener()
  }

  const commitLinks = (next: ReadonlyMap<string, string>): void => {
    if (next === activeLinks) return
    activeLinks = next
    for (const listener of [...linkListeners]) listener()
  }

  return {
    selection: selectionStore,
    getScroll: () => scroll,
    saveScroll(patch: Partial<BoardScrollMemory>): void {
      const next: BoardScrollMemory = {
        contentScrollTop: patch.contentScrollTop ?? scroll.contentScrollTop,
        statusBoardScrollLeft: patch.statusBoardScrollLeft ?? scroll.statusBoardScrollLeft,
        treeViewport: 'treeViewport' in patch ? patch.treeViewport : scroll.treeViewport,
      }
      if (next === scroll) return
      scroll = Object.freeze(next)
    },
    getActiveLinks: () => activeLinks,
    subscribeLinks(listener: () => void): () => void {
      linkListeners.add(listener)
      return () => { linkListeners.delete(listener) }
    },
    markLinkActive(project: string, taskKey: string, sessionId: string): void {
      ensureProject(project)
      if (activeLinks.get(taskKey) === sessionId) return
      commitLinks(new Map(activeLinks).set(taskKey, sessionId))
    },
    markLinksEnded(project: string, taskKeys: readonly string[]): void {
      if (projectId !== project || activeLinks.size === 0) return
      const next = new Map(activeLinks)
      let changed = false
      for (const taskKey of taskKeys) {
        changed = next.delete(taskKey) || changed
      }
      if (changed) commitLinks(next)
    },
    reconcileLinks(project: string, taskKey: string, links: readonly SessionLink[]): void {
      ensureProject(project)
      // getTaskDetail returns links 新→旧; the FIRST active row is the live one.
      const active = links.find(link => link.status === 'active' && link.taskKey === taskKey)
      const current = activeLinks.get(taskKey)
      if (active === undefined) {
        if (current === undefined) return
        const next = new Map(activeLinks)
        next.delete(taskKey)
        commitLinks(next)
        return
      }
      if (current === active.sessionId) return
      commitLinks(new Map(activeLinks).set(taskKey, active.sessionId))
    },
    bindProject(project: string | undefined): void {
      if (project === undefined) return // unresolved gate/skeleton — nothing to bind
      ensureProject(project)
    },
  }
}

/** Re-export the selection snapshot type for seat consumers. */
export type { SelectedTaskSnapshot }
