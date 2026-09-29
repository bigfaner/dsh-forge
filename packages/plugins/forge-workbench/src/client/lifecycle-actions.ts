/**
 * The lifecycle verb wiring shared by the two C8 GUI hosts (M4 task 3.5):
 * the left-rail project seat (⋯ menu dialogs) and the C2 archive banner —
 * ONE owner of the fire-and-land sequence instead of two copies:
 *
 *   verb → store.refresh() (best-effort re-pull; the project_list_changed
 *   push re-pulls too — either landing updates the tree/banner) → toast;
 *   a rejection degrades to the failure toast (Propagation Strategy:
 *   ERR_PROJECT_NOT_FOUND → 刷新列表 + toast, never a throw at the user).
 *
 * 生命周期 × 投影联动 (AC3): the verbs are local-commit (kernel writes the
 * registry first; the projection rides the async push — 3.4's guaranteed
 * semantics). The GUI never blocks on the projection outcome; the 概览
 * status row surfaces the async state via projection_updated.
 *
 * 删除落点 (AC2): the kernel clears the active pointer when the ACTIVE
 * project is removed — the client then falls the pointer to the FIRST
 * remaining project (注册序), or leaves it null (the workbench's 空态引导)
 * when none remain.
 */
import type { Project } from './ipc-types'
import type { ActiveProjectStore } from './store/active-project'
import type { WorkbenchKey } from './locale/en'
import { fillTemplate } from './views/overview/format'

/** The host-provided surfaces the actions ride. */
export interface LifecycleActionDeps {
  /** The plugin-lifetime active-project store (the registry + pointer). */
  readonly store: ActiveProjectStore
  /** The locale seat. */
  readonly t: (key: WorkbenchKey) => string
  /** The host's toast surface (the seat's fixed toast / the banner's own). */
  readonly showToast: (message: string) => void
  /**
   * The layout-memory removal clear (M4 4.5, 删除清除): called BEFORE the
   * removeProject verb (the markRemoved ordering) so the engine's pending
   * debounced write for the project can never land after the FK cascade and
   * resurrect a project_ui_state row. Absent = no layout memory in flight.
   */
  readonly forgetLayout?: ((projectId: string) => void) | undefined
}

/** The quiet refresh: re-pull the registry; a failure keeps the last good state. */
const refreshQuietly = async (store: ActiveProjectStore): Promise<void> => {
  try {
    await store.refresh()
  } catch {
    // The push-driven re-pull keeps the tree truthful on the next landing.
  }
}

/** 重命名 — the Interface 1 renameProject verb (纯 DB 更新,投影 rename op 异步). */
export function commitProjectRename(deps: LifecycleActionDeps, projectId: string, displayName: string): void {
  const name = displayName.trim()
  if (name === '') return
  deps.store.bridge.renameProject({ projectId, displayName: name })
    .then(
      async () => {
        await refreshQuietly(deps.store)
        deps.showToast(fillTemplate(deps.t('project.toast.renamed'), { name }))
      },
      () => { deps.showToast(deps.t('project.toast.actionFailed')) },
    )
    .catch(() => { /* never a throw at the user */ })
}

/** 归档 — archiveProject (archived=1; dsh workspace 保留, BIZ-006). */
export function archiveProjectNow(deps: LifecycleActionDeps, project: Project): void {
  deps.store.bridge.archiveProject({ projectId: project.id })
    .then(
      async () => {
        await refreshQuietly(deps.store)
        deps.showToast(fillTemplate(deps.t('project.toast.archived'), { name: project.displayName }))
      },
      () => { deps.showToast(deps.t('project.toast.actionFailed')) },
    )
    .catch(() => { /* never a throw at the user */ })
}

/** 恢复 — restoreProject (confirm-free, C1 semantics; toast on landing). */
export function restoreProjectNow(deps: LifecycleActionDeps, project: Project): void {
  deps.store.bridge.restoreProject({ projectId: project.id })
    .then(
      async () => {
        await refreshQuietly(deps.store)
        deps.showToast(fillTemplate(deps.t('project.toast.restored'), { name: project.displayName }))
      },
      () => { deps.showToast(deps.t('project.toast.actionFailed')) },
    )
    .catch(() => { /* never a throw at the user */ })
}

/**
 * 删除 — removeProject (投影 delete + FK cascade; the kernel clears the
 * pointer when the ACTIVE project goes). 删除当前项目 → the pointer falls to
 * the first remaining project, or the workbench lands on the 空态引导.
 * M4 4.3 (AC4): `windowsClosedNote` — the caller-supplied note the toast
 * appends when the removed project had detached windows (the kernel's
 * recallProjectWindows hook closes them; the note counts them pre-verb).
 */
export function removeProjectNow(deps: LifecycleActionDeps, project: Project, windowsClosedNote?: string): void {
  // 删除清除 (M4 4.5): the layout memory disarms BEFORE the verb — its
  // pending debounced write for this project dies with the FK cascade.
  deps.forgetLayout?.(project.id)
  deps.store.bridge.removeProject(project.id)
    .then(
      async () => {
        await refreshQuietly(deps.store)
        const snapshot = deps.store.getSnapshot()
        const fallback = snapshot.projects[0]
        if (snapshot.activeProjectId === null && fallback !== undefined) {
          deps.store.switchProject(fallback.id)
        }
        const removed = fillTemplate(deps.t('project.toast.removed'), { name: project.displayName })
        deps.showToast(windowsClosedNote === undefined ? removed : `${removed}\n${windowsClosedNote}`)
      },
      () => { deps.showToast(deps.t('project.toast.actionFailed')) },
    )
    .catch(() => { /* never a throw at the user */ })
}
