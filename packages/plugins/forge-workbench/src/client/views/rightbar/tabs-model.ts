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
 *
 * M4 task 4.4 extends this module with the C9 MULTI-PANE split state (the
 * block at the bottom): the pane-set + ratio model over the SAME public face
 * — pure functions (clamp / keyboard stepping / drag math / the open routing)
 * plus a small plugin-lifetime store whose every commit reports through the
 * onLayoutChange seam 4.5 collects. The panes themselves stay the NATIVE
 * rightbar's (splits, closes, the settle rules); this model only OBSERVES the
 * open-tab inventory and issues the public opens.
 */
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { ISidebarRight } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { LineageSubagentAddress } from '../../lineage'
import { subagentChatAddressOf } from '../../session-open'
import { PROJECT_SCOPED_TAB_KINDS, type TabKind } from './tab-kinds'

/**
 * The controller subset the model consumes: the public `ISidebarRight`
 * commands the lifecycle needs, plus the open-tab inventory the controller
 * class publishes beside the interface (`openTabs` — the cross-session
 * metadata source; the real `ctx.sidebarRight` satisfies this structurally,
 * and tests build fakes against the same contract). M4 4.4 adds the two
 * members the C9 split rides: `openResource` (the 2.7 旁置 path's verb) and
 * the inventory's OPTIONAL `subscribe` (the pane-set watcher — present on
 * the real `ObservableSnapshot` source, absent on minimal fakes).
 */
export type RightbarTabsFace = Pick<
  ISidebarRight,
  'openTab' | 'openResource' | 'close' | 'focus' | 'isExpanded' | 'toggleExpanded'
> & {
  /** The open-tab inventory (each row's observed subset: id + kind). */
  readonly openTabs: {
    getSnapshot(): readonly OpenTabRow[]
    /** The real inventory source's live subscription; optional on fakes. */
    subscribe?(listener: () => void): () => void
  }
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
  const required = ['openTab', 'openResource', 'close', 'focus', 'isExpanded', 'toggleExpanded'] as const
  if (!required.every(member => isFunction(candidate[member]))) return undefined
  const openTabs = candidate.openTabs
  if (!isObject(openTabs) || !isFunction(openTabs.getSnapshot)) return undefined
  if (openTabs.subscribe !== undefined && !isFunction(openTabs.subscribe)) return undefined
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
 * The MOUNTED-SCOPE focus-or-open (the 会话域 seam, fix-1): the right column
 * is PER-SESSION — the seat binds the conversation's active session, and a
 * session switch mounts that session's FRESH surface (collapsed, empty) —
 * while `openTabs` is the CROSS-SESSION inventory (saved + adopted layouts of
 * every session). An inventory row of a FOREIGN session is therefore not a
 * focusable tab of the mounted surface: the controller's `focus` on it is a
 * documented SILENT no-op, so an inventory-keyed focus-or-open after a
 * session switch would neither focus nor open (the C6 「查看任务」/overview
 * row seams landed nothing and the pane-hosted dock never mounted).
 *
 * The ONE command guaranteed to act on the MOUNTED session is `openTab`: the
 * store's per-pane page uniqueness settles it on the pane's existing page of
 * the kind (the focus outcome, verbatim) or opens one, and it reveals the
 * column in the same step. A controller between seat bindings (the rebind
 * window mid session switch) THROWS on every command — the guarded-adapter
 * discipline degrades that to `false`, never a throw, never a load gate.
 * @param face - the controller subset.
 * @param kind - the page kind to activate ('overview' | 'board').
 * @returns true when the mounted session's open was issued.
 */
function activateOnMountedSession(face: RightbarTabsFace, kind: 'overview' | 'board'): boolean {
  try {
    face.openTab(kind)
    return true
  } catch {
    // No mounted session surface (the rebind window) or a drifted service:
    // the leg degrades — the caller's other legs (e.g. the shared
    // board-session selection) still ran.
    return false
  }
}

/**
 * The 项目概览 activation (§4.7 回概览激活态): settle the mounted session's
 * pane on its overview page — focus it through the native per-pane page
 * dedupe when the pane holds one, open one when none does. Callers gate this
 * on the column being EXPANDED.
 * @param face - the controller subset.
 * @returns true when a tab was focused or opened.
 */
export function ensureOverviewActive(face: RightbarTabsFace): boolean {
  return activateOnMountedSession(face, 'overview')
}

/**
 * The 任务看板 activation (M4 2.7, the C6 bar's 双向跳转 leg): settle the
 * MOUNTED session's pane on its board page — the same scope-correct shape as
 * {@link ensureOverviewActive} over the board kind. The board pane then
 * presents the detail dock the jump's other leg (the shared board-session
 * selection) has already opened.
 * @param face - the controller subset (`undefined` = service absent: no-op).
 * @returns true when a tab was focused or opened.
 */
export function ensureBoardActive(face: RightbarTabsFace | undefined): boolean {
  if (face === undefined) return false
  return activateOnMountedSession(face, 'board')
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

// ---------------------------------------------------------------------------
// The C9 multi-pane split state (M4 task 4.4, tech-design §Overview 交付线 4 +
// ui-design §Component C9)
// ---------------------------------------------------------------------------

/**
 * The C9 pane views the 工作台头 [分屏] menu offers (Menu: 会话旁置/看板): the
 * board = the 2.1 dual-host TasksView full instance (a board tab kind 多 pane
 * 实例 — the native per-pane page uniqueness seats one board page per pane),
 * and the 会话旁置 = a subagent chat aside pane (the 2.7 `subagentchat`
 * precedent, tech-design Interface 6's 旁置 path).
 */
export type SplitPaneView = 'board' | 'session-aside'

/**
 * The split-ratio band (ui-design C9: 拖分隔条 比例即时存 钳制 30%–70%, 两侧
 * pane 最小宽 30%) — the LEFT pane's share of the split, so the band is the
 * same read from either side (0.3 left = 0.7 right). Stricter than the native
 * divider's own minimum (the docking kit clamps at 0.2): the C9 control
 * enforces the C9 band; the native divider keeps its native clamps (the
 * vendored-zero-modification Hard Rule keeps the native column untouched).
 */
export const SPLIT_RATIO_MIN = 0.3
export const SPLIT_RATIO_MAX = 0.7
/** Home/End 复位 50/50 (the a11y baseline's reset target). */
export const SPLIT_RATIO_RESET = 0.5
/** Focused ←/→ step (±2%). */
export const SPLIT_RATIO_STEP = 0.02
/** Focused Shift+←/→ step (±10%). */
export const SPLIT_RATIO_STEP_LARGE = 0.1

/**
 * Clamp a candidate ratio into the C9 band (the drag AND keyboard clamp —
 * 钳制同拖拽). A non-finite candidate resets to 50/50 rather than poisoning
 * the band.
 * @param ratio - the candidate left-pane share.
 * @returns the share clamped into [0.3, 0.7].
 */
export function clampSplitRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return SPLIT_RATIO_RESET
  return Math.min(SPLIT_RATIO_MAX, Math.max(SPLIT_RATIO_MIN, ratio))
}

/**
 * The pointer-drag delta math (即时存: the caller commits every move, no
 * preview-then-settle). The split container's pixel width is measured once at
 * gesture start by the caller (the component owns measurement; the math stays
 * pure and fake-able); a non-positive width leaves the ratio untouched (a
 * jsdom mount measures zero — never a division by zero).
 * @param startRatio - the ratio when the gesture began.
 * @param deltaPx - the pointer's travel since the gesture began (right = +).
 * @param containerPx - the whole split's width in px (both panes + divider).
 * @returns the next clamped ratio.
 */
export function ratioFromDrag(startRatio: number, deltaPx: number, containerPx: number): number {
  if (!(containerPx > 0)) return clampSplitRatio(startRatio)
  return clampSplitRatio(startRatio + deltaPx / containerPx)
}

/** The keys the separator's keyboard model answers (the a11y baseline, C9). */
export type SplitStepKey =
  | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End' | 'Enter' | ' '

/**
 * The 分隔条键盘模型 (pure): focused ←/→ steps ∓/± (Shift = the large step),
 * Home/End both 复位 50/50, every result clamped like the drag. Enter/Space —
 * 无激活语义 — return the current ratio unchanged.
 * @param current - the current left-pane share.
 * @param key - the key the focused separator received.
 * @param shiftKey - whether the Shift modifier rode the press.
 * @returns the next share (clamped; the current one for an inert key).
 */
export function stepSplitRatio(current: number, key: SplitStepKey | string, shiftKey: boolean): number {
  const step = shiftKey ? SPLIT_RATIO_STEP_LARGE : SPLIT_RATIO_STEP
  switch (key) {
    case 'ArrowLeft': return clampSplitRatio(current - step)
    case 'ArrowRight': return clampSplitRatio(current + step)
    case 'Home':
    case 'End': return SPLIT_RATIO_RESET
    // Enter/Space 无激活语义 (a separator is a continuous operation, not a
    // button) — and any other key is not the separator's to interpret.
    default: return clampSplitRatio(current)
  }
}

/** One tracked C9 pane: its view + the inventory tab that hosts it (when known). */
export interface SplitPaneRow {
  readonly view: SplitPaneView
  /** The open-tab inventory row id once the pane's tab lands in it. */
  readonly tabId?: string
}

/**
 * The C9 split layout this task exposes and 4.5 collects (the onLayoutChange
 * seam payload — the 1.4 tree block's pattern): the ordered pane set over the
 * Interface 4 `rightbar.panes` kinds plus the clamped ratio. NOT persisted
 * here (布局持久化归 4.5; nothing touches localStorage in this task).
 */
export interface SplitLayoutState {
  /** The C9 panes in open order (board / session-aside rows). */
  readonly panes: readonly SplitPaneRow[]
  /** The LEFT pane's share, always within the C9 band. */
  readonly ratio: number
}

/** What the [分屏] menu picks: the view to add, with the aside's target when it has one. */
export type SplitPaneSelection =
  | { readonly view: 'board' }
  | { readonly view: 'session-aside'; readonly address: LineageSubagentAddress }

/**
 * The controller subset the C9 open ops need — every member a public
 * `ISidebarRight` verb (the guarded-adapter discipline; tests fake this shape,
 * the real controller satisfies it structurally):
 *   board  → `openTab('board', { preferNewPane: true })` — the native
 *            placement splits the active pane and seats the board page alone
 *            in the new pane (the store's per-pane page uniqueness settles
 *            dedupe), or lands in the active pane when splitting is
 *            unavailable (budget / room rule — the native fallback);
 *   aside  → `openResource(subagentChatAddress(address), { kind:
 *            'subagentchat', preferNewPane: true })` — the 2.7 通道's exact
 *            call (session-open.ts), reused verbatim.
 */
export interface RightbarSplitFace {
  openTab(kind: string, options?: { readonly preferNewPane?: boolean }): void
  openResource(address: string, options?: { readonly kind?: string; readonly preferNewPane?: boolean }): void
}

/**
 * [分屏] → 添加 pane 并选视图 (AC1/AC2): one settled native open per pick.
 * @param face - the controller subset (`undefined` = service absent: no-op).
 * @param selection - the menu pick (the aside's address triple included).
 * @returns true when an open was issued.
 */
export function openSplitPane(face: RightbarSplitFace | undefined, selection: SplitPaneSelection): boolean {
  if (face === undefined) return false
  if (selection.view === 'board') {
    face.openTab('board', { preferNewPane: true })
    return true
  }
  // 2.7 通道复用: the SAME address builder + call shape as the Interface 6
  // 旁置 path (session-open.openSessionTargetAside) — one address format, one
  // resource kind, wherever the aside is asked from.
  face.openResource(subagentChatAddressOf(selection.address), { kind: 'subagentchat', preferNewPane: true })
  return true
}

/** The inventory kinds that host a C9 pane (board panes + subagentchat asides). */
const SPLIT_PANE_TAB_KINDS: ReadonlySet<string> = new Set(['board', 'subagentchat'])

/**
 * Derive the C9 pane rows from the open-tab inventory (AC1 全部 pane 关闭's
 * observation half): every live board / subagentchat tab is one pane row, in
 * inventory order; every other kind is not a C9 pane (guide/overview/doc/
 * depgraph stay out — the split's view set is exactly the [分屏] menu's).
 * @param rows - the open-tab inventory snapshot.
 * @returns the pane rows (empty when no C9 pane is open — the single-view state).
 */
export function deriveSplitPanes(rows: readonly OpenTabRow[]): readonly SplitPaneRow[] {
  return rows
    .filter(row => SPLIT_PANE_TAB_KINDS.has(row.kind))
    .map(row => ({ view: row.kind === 'board' ? 'board' : 'session-aside', tabId: row.tabId }))
}

/** The split store's write surface (the C9 controls' one state home). */
export interface SplitPaneStore {
  /** @returns the current split layout (stable reference between commits). */
  getSnapshot(): SplitLayoutState
  /** Subscribe to split-layout commits (pane set + ratio changes). */
  subscribe(listener: () => void): () => void
  /**
   * The [分屏] menu handler: open the picked view through the face, track the
   * new pane (the inventory reconcile below carries its tab id when the open
   * lands), and report. Split-inactive → active on the first pane AFTER a
   * second arrives (the pane 头/分隔条 render while ≥ 2 panes are open).
   * @param face - the controller subset (absent = the leg degrades, no throw).
   * @param selection - the menu pick.
   * @returns true when an open was issued.
   */
  openPane(face: RightbarSplitFace | undefined, selection: SplitPaneSelection): boolean
  /**
   * A pane 头 [关闭]: close the pane's tab through the controller face. The
   * NATIVE settle rules own the aftermath — an emptied side pane merges away
   * and the last non-guide close collapses the column (回活跃区单视图, the
   * native behavior this model observes rather than re-implements).
   * @param face - the controller subset with the inventory read (absent =
   * degrade, no throw; the inventory resolves a not-yet-adopted pane's tab).
   * @param view - which pane view to close (the LAST pane of that view).
   * @returns true when a close was issued.
   */
  closePane(face: RightbarCloseFace | undefined, view: SplitPaneView): boolean
  /**
   * Drag / keyboard ratio commit (即时存): clamp into the C9 band, commit,
   * notify, and report through the layout seam — every move of a drag lands
   * here (no preview-then-settle on the forge side).
   * @param ratio - the candidate share.
   * @returns true when the clamped value moved the committed state.
   */
  setRatio(ratio: number): boolean
  /**
   * The inventory reconcile (the watcher in the installer feeds it the open-tab
   * snapshot): carries the panes' tab ids, drops panes whose tabs left the
   * inventory (native chip ×, project-switch closes, session teardown), and
   * reports — reaching the empty pane set IS the 全部 pane 关闭 → 回活跃区
   * 单视图 transition (the native collapse already happened by then).
   * @param rows - the open-tab inventory snapshot.
   */
  reconcile(rows: readonly OpenTabRow[]): void
}

/** The close face a pane 头 [关闭] needs: the verb + the inventory read. */
export interface RightbarCloseFace {
  close(tabId: string): void
  readonly openTabs: { getSnapshot(): readonly OpenTabRow[] }
}

/** The split store's options. */
export interface SplitPaneStoreOptions {
  /**
   * The 比例态经接口暴露 seam (AC3, the 1.4 onLayoutChange pattern): called
   * with the whole split layout on EVERY commit — pane set changes and ratio
   * moves alike. The 4.5 layout-memory wiring collects here; THIS task never
   * persists (no localStorage, no IPC).
   */
  readonly onLayoutChange?: (layout: SplitLayoutState) => void
}

/** The never-split boot layout (one pane never tracked: the single-view state). */
export const INITIAL_SPLIT_LAYOUT: SplitLayoutState = Object.freeze({ panes: [], ratio: SPLIT_RATIO_RESET })

/**
 * Create the C9 split store (one per plugin lifetime in the real app; tests
 * create isolated instances). Plain observable shape throughout — the same
 * discipline as the board-session store.
 * @param options - the report seam wiring.
 * @returns the store.
 */
export function createSplitPaneStore(options: SplitPaneStoreOptions = {}): SplitPaneStore {
  let layout: SplitLayoutState = INITIAL_SPLIT_LAYOUT
  const listeners = new Set<() => void>()
  const report = (next: SplitLayoutState): void => {
    layout = next
    options.onLayoutChange?.(next)
    for (const listener of [...listeners]) listener()
  }
  /**
   * The empty-pane-set transition's ratio leg (裁决 #28-④ 换台重置, the seam
   * 4.5's project-domain blobs surfaced): reaching NO panes ends the split —
   * the 回活跃区单视图 transition — and the C9 share is state OF an active
   * split, so it resets to the baseline. This plugin-lifetime store otherwise
   * carries the previous split's share across a project switch (the 换台
   * closes every closable tab → the inventory empties), and the NEXT
   * project's first collect would persist the previous project's share into
   * that project's own `project_ui_state` blob — the cross-project leak the
   * layout-isolation contract pins (Interface 4 项目域, P-7).
   */
  const commit = (next: SplitLayoutState): void => {
    report(next.panes.length === 0 ? { panes: [], ratio: SPLIT_RATIO_RESET } : next)
  }
  return {
    getSnapshot: () => layout,
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    openPane(face, selection): boolean {
      const opened = openSplitPane(face, selection)
      if (!opened) return false
      // The pane's tab id arrives with the inventory's next publish; the view
      // row lands now so the seam's pane set reflects the ask immediately.
      report({ ...layout, panes: [...layout.panes, { view: selection.view }] })
      return true
    },
    closePane(face, view): boolean {
      if (face === undefined) return false
      // The LAST pane of that view (two boards open → the newer one closes).
      for (let index = layout.panes.length - 1; index >= 0; index -= 1) {
        const pane = layout.panes[index]
        if (pane.view !== view) continue
        // A pane not yet adopted by the reconcile (the open raced the click)
        // resolves its tab from the live inventory — never a dead click.
        const tabId = pane.tabId
          ?? deriveSplitPanes(face.openTabs.getSnapshot()).filter(row => row.view === view).at(-1)?.tabId
        if (tabId === undefined) return false
        face.close(tabId)
        commit({ ...layout, panes: layout.panes.toSpliced(index, 1) })
        return true
      }
      return false
    },
    setRatio(ratio): boolean {
      const next = clampSplitRatio(ratio)
      if (next === layout.ratio) return false
      report({ ...layout, ratio: next })
      return true
    },
    reconcile(rows): void {
      const live = deriveSplitPanes(rows)
      const next: SplitPaneRow[] = []
      let changed = false
      for (const pane of layout.panes) {
        // Carry the tracked pane onto its live tab; a view with no live row
        // anymore closed natively (chip ×, project switch) — drop it.
        if (pane.tabId !== undefined) {
          const row = live.find(candidate => candidate.tabId === pane.tabId)
          if (row === undefined) { changed = true; continue }
          next.push(pane)
          continue
        }
        // A pane opened but not yet reconciled adopts the first unmatched live
        // row of its view (the open's own tab landing in the inventory).
        const row = live.find(candidate => candidate.view === pane.view && !next.some(seated => seated.tabId === candidate.tabId))
        if (row === undefined) { changed = true; continue }
        next.push(row.tabId === undefined ? { view: pane.view } : { view: pane.view, tabId: row.tabId })
        changed = true
      }
      // Live rows no tracked pane adopted (an aside the C5 [打开] opened, or a
      // board the guide door seated) join the set — they ARE C9 panes.
      for (const row of live) {
        if (next.some(seated => seated.tabId === row.tabId)) continue
        next.push(row)
        changed = true
      }
      if (!changed) return
      commit({ ...layout, panes: next })
    },
  }
}

/**
 * Is the split ACTIVE (the 分屏态 — the state the pane 头 and 分隔条 render
 * in)? Two or more C9 panes: one pane alone is the 单 pane default (活跃区
 * 全幅 + one rightbar pane), not a split.
 * @param layout - the split layout snapshot.
 * @returns true while ≥ 2 panes are open.
 */
export function isSplitActive(layout: SplitLayoutState): boolean {
  return layout.panes.length >= 2
}
