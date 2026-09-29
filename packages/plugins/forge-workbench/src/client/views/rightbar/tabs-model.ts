/**
 * The rightbar tab lifecycle + linkage model (M4 task 2.2, layout §4.7/§4.8
 * + 裁决 #28-④): pure functions over the upstream `ctx.sidebarRight`
 * controller's public subset — no React, no slot knowledge, fully fake-able —
 * expressing the two rules the right column carries:
 *
 *   联动 (§4.7): the WHOLE column follows the current project. A project
 *     switch closes the PROJECT-SCOPED tabs (doc/depgraph — the old
 *     project's artifacts) and, while the column is EXPANDED, returns to the
 *     项目概览 activation (focus the pane's overview, or open one); the same
 *     project switching sessions touches nothing (同项目切会话右栏不动),
 *     and a collapsed column is left alone (the native empty-column seed
 *     owns what the next expansion shows).
 *
 *   换台重置 (裁决 #28-④, the 1.6 deferred seam): 换台 resets the column to
 *     its default — 收起 + 开始页. Closing every closable tab plus the
 *     collapse IS that state natively: the sole-docked guide survives (the
 *     native close protection), the column collapses (the last non-guide
 *     close collapses it natively; the explicit toggle covers the rest), and
 *     the next expansion seeds the 开始页 (stores.ts: an expanded empty pane
 *     seeds the default page).
 *
 * The width/collapse GEOMETRY (§4.9 默认收起轨道归零 / 45% 视口 / 300–70%
 * 拖拽 / ⛶ 覆盖会话列) is the native ui-layout frame's own policy
 * (columns.ts RIGHTBAR_MIN 300 · RIGHTBAR_DEFAULT_RATIO 0.45 ·
 * RIGHTBAR_MAX_RATIO 0.7 · rightbar=0 zeroes the track) — zero forge code,
 * the Hard Rule keeps it that way. Same for the strip mechanics (§4.2): the
 * docking kit's chips/×/＋/fullscreen/panel-toggle are the native column's.
 */
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { ISidebarRight } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { PROJECT_SCOPED_TAB_KINDS, type TabKind } from './tab-kinds'

/**
 * The controller subset the model consumes: the public `ISidebarRight`
 * commands the lifecycle needs, plus the open-tab inventory the controller
 * class publishes beside the interface (`openTabs` — the cross-session
 * metadata source; the real `ctx.sidebarRight` satisfies this structurally,
 * and tests build fakes against the same contract).
 */
export type RightbarTabsFace = Pick<
  ISidebarRight,
  'openTab' | 'close' | 'focus' | 'isExpanded' | 'toggleExpanded'
> & {
  /** The open-tab inventory (each row's observed subset: id + kind). */
  readonly openTabs: { getSnapshot(): readonly OpenTabRow[] }
}

/** One open-tab row as the inventory source publishes it (the observed subset). */
export interface OpenTabRow {
  readonly tabId: string
  readonly kind: string
}

/** What {@link followProjectSwitch} did — the assertion surface for tests. */
export interface ProjectSwitchOutcome {
  /** False for an unchanged pointer OR a first observation (the boot guard). */
  readonly projectChanged: boolean
  /** The project-scoped tab ids the switch closed (doc/depgraph only). */
  readonly closedTabIds: readonly string[]
  /** True when the 项目概览 was focused-or-opened (expanded columns only). */
  readonly overviewActivated: boolean
}

const isObject = (candidate: unknown): candidate is Record<string, unknown> =>
  typeof candidate === 'object' && candidate !== null

const isFunction = (candidate: unknown): candidate is (...args: never[]) => unknown =>
  typeof candidate === 'function'

/**
 * Narrow an unknown `ctx.sidebarRight` candidate onto the model's face (the
 * project-seat guarded-adapter discipline: an absent or drifted service
 * leaves the leg degraded — never a throw, never a load gate).
 * @param candidate - the service as read through `ctx.get`.
 * @returns the face, or `undefined` when any member is absent.
 */
export function toRightbarTabsFace(candidate: unknown): RightbarTabsFace | undefined {
  if (!isObject(candidate)) return undefined
  const required = ['openTab', 'close', 'focus', 'isExpanded', 'toggleExpanded'] as const
  if (!required.every(member => isFunction(candidate[member]))) return undefined
  const openTabs = candidate.openTabs
  if (!isObject(openTabs) || !isFunction(openTabs.getSnapshot)) return undefined
  return candidate as unknown as RightbarTabsFace
}

/** The mounted column's open tabs (kind + id), as the inventory publishes them. */
function openTabsOf(face: RightbarTabsFace): readonly OpenTabRow[] {
  return face.openTabs.getSnapshot()
}

/**
 * The §4.7 联动 leg: a project-pointer change closes the OLD project's
 * project-scoped tabs and returns an expanded column to the 项目概览.
 *
 * `previous === undefined` is the watcher's FIRST observation (boot restore):
 * record-only — the boot column is collapsed and empty natively, and the
 * restore must not fire a linkage pass at it. A `next` of `null` (未激活,
 * e.g. the registry emptied) still closes the scoped tabs (their project is
 * gone) but activates nothing.
 * @param face - the controller subset.
 * @param previous - the pointer as last seen (`undefined` = first sight).
 * @param next - the pointer now (`null` = 未激活).
 * @returns what the pass did.
 */
export function followProjectSwitch(
  face: RightbarTabsFace,
  previous: string | null | undefined,
  next: string | null,
): ProjectSwitchOutcome {
  if (previous === undefined || previous === next) {
    return { projectChanged: false, closedTabIds: [], overviewActivated: false }
  }
  const scoped = new Set<string>(PROJECT_SCOPED_TAB_KINDS as readonly TabKind[])
  const rows = openTabsOf(face)
  // Foreign-session ids are harmless: the public close() acts on the mounted
  // session's surface and a missing id is a no-op (the controller's own rule).
  const closedTabIds = rows.filter(row => scoped.has(row.kind)).map(row => row.tabId)
  for (const tabId of closedTabIds) face.close(tabId)
  const overviewActivated = next !== null && face.isExpanded() && ensureOverviewActive(face)
  return { projectChanged: true, closedTabIds, overviewActivated }
}

/**
 * The 项目概览 activation (§4.7 回概览激活态): focus the column's existing
 * overview tab — a page kind is one-per-pane, so at most one pane holds one —
 * or open one when none does. Callers gate this on the column being EXPANDED.
 * @param face - the controller subset.
 * @returns true when a tab was focused or opened.
 */
export function ensureOverviewActive(face: RightbarTabsFace): boolean {
  const overview = openTabsOf(face).find(row => row.kind === 'overview')
  if (overview !== undefined) {
    face.focus(overview.tabId)
    return true
  }
  face.openTab('overview')
  return true
}

/**
 * The 任务看板 activation (M4 2.7, the C6 bar's 双向跳转 leg): focus the
 * column's existing board tab, or open one when none does — the same
 * focus-or-open shape as {@link ensureOverviewActive} over the board kind.
 * The board pane then presents the detail dock the jump's other leg (the
 * shared board-session selection) has already opened.
 * @param face - the controller subset (`undefined` = service absent: no-op).
 * @returns true when a tab was focused or opened.
 */
export function ensureBoardActive(face: RightbarTabsFace | undefined): boolean {
  if (face === undefined) return false
  const board = openTabsOf(face).find(row => row.kind === 'board')
  if (board !== undefined) {
    face.focus(board.tabId)
    return true
  }
  face.openTab('board')
  return true
}

/**
 * The 裁决 #28-④ 换台重置 leg (the 1.6 deferred seam, now that the container
 * exists): the column back to its DEFAULT — 收起 + 开始页. Closes every
 * closable tab (the sole-docked guide survives — the native protection keeps
 * the door page mounted), then collapses whatever is still expanded. The
 * next expansion lands on the 开始页 through the native empty-pane seed.
 * @param face - the controller subset (`undefined` = service absent: no-op).
 */
export function resetRightbarToDefault(face: RightbarTabsFace | undefined): void {
  if (face === undefined) return
  // Captured upfront: each close mutates the inventory, and the list is the
  // pass's contract (already-closed ids are a harmless controller no-op).
  for (const row of openTabsOf(face)) face.close(row.tabId)
  // The last non-guide close collapses the column natively; re-read AFTER the
  // closes so the explicit toggle only covers the rest (e.g. a sole guide).
  if (face.isExpanded()) face.toggleExpanded()
}
