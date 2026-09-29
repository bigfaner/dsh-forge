/**
 * The layout-memory COLLECTION half (M4 task 4.5; tech-design §Interfaces·
 * Interface 4「ProjectLayout blob,项目域」+ prd §Data Requirements 布局记忆):
 * the pure model that folds the per-seam layout fragments — sidebar 宽/收起,
 * the C3 tree's three sets, the C9 rightbar split (panes·tabs + 比例), and the
 * C10 detached window set — into ONE Interface 4 `ProjectLayout` v1 blob the
 * debounced write path persists through `setProjectUiState` (persistence.ts).
 *
 * Collection seams consumed (each already exposed by its owning task):
 *   - tree        1.4's `ProjectTreeBrowser.onLayoutChange` payload
 *                 (`TreeLayoutState` — the Interface 4 `tree` block verbatim);
 *   - rightbar    4.4's split-store `onLayoutChange` payload (`SplitLayoutState`)
 *                 + the controller's open-tab inventory rows; the 比例权威态
 *                 (the split store's clamped share) IS the blob's `widthPct`
 *                 (the 0.3–0.7 band × 100 = the Interface 4「钳制 30–70」域);
 *   - sidebar     the main-window shell seat's geometry (a duck-typed optional
 *                 source — see `SidebarGeometryFragment` below);
 *   - detached    4.3's recall-sync registry over the window-changed events.
 *
 * 双轨不冲突 (the boundary this module owns, Interface 4's note): the
 * collection replays/persists FORGE-OWNED state only. The native rightbar
 * column keeps its own persistence — the per-session dockkit layout store
 * (session 域, its own localStorage) — and the native outer divider keeps its
 * own pointer drag; neither is read, written, or replayed here. The blob's
 * `rightbar.widthPct` is the C9 SPLIT ratio (forge's model state), never the
 * native column's px preference.
 *
 * v1 whitelist boundaries (Interface 4's TabKind enum is frozen):
 *   - inventory rows whose kind is OUTSIDE the five forge kinds (subagentchat
 *     asides, terminal, browser, …) have NO blob slot — a session-aside pane
 *     is conversation-lineage content, its recovery rides the C5/C6 jump
 *     seams, not project layout memory. Dropped, not approximated;
 *   - a `doc` tab persists only with a resolvable topic (its project-relative
 *     path, via the caller's `topicOf` resolver over the doc-tabs registry);
 *     an unresolvable identity would replay as a broken tab — dropped;
 *   - `depgraph` topics (the feature slug) are optional — a topicless
 *     depgraph replays as the active-feature view;
 *   - 分组×排序视图选项 NEVER enter the blob (Hard Rule: 用户级 localStorage,
 *     C3 口径) — the output shape is the Interface 4 key set exactly, which
 *     the kernel's whitelist (4.1 layout-schema.ts) would reject otherwise.
 */
import type { ProjectLayout, Rect, SessionTarget } from '../ipc-types'
import type { TreeLayoutState } from '../components/project-tree/tree-derive'
import { EMPTY_TREE_LAYOUT } from '../components/project-tree/tree-derive'
import type { OpenTabRow, SplitLayoutState } from '../views/rightbar/tabs-model'
import type { TabKind } from '../views/rightbar/tab-kinds'
import { isTabKind } from '../views/rightbar/tab-kinds'

/**
 * The kernel's topic bound twin (4.1 layout-schema `TOPIC_MAX_LENGTH` = 512;
 * the plugin cannot import the app — the 4.1 lockstep precedent, the real
 * drift lock lives in apps/desktop/tests/workbench-ui-state.spec.ts).
 */
export const TOPIC_MAX_LENGTH = 512

/** The sidebar width band twin (Interface 4「264–420」; native SIDEBAR_MIN/MAX). */
export const SIDEBAR_WIDTH_MIN = 264
export const SIDEBAR_WIDTH_MAX = 420

/**
 * The sidebar geometry fragment (宽/收起) — the main-window shell seat's own
 * state. The vendored `ILayout` face is write-only (no width read), so the
 * live wiring feeds this fragment from whatever shell seat exposes it; an
 * absent source keeps the blob's `sidebar` at its default (`collapsed:false`,
 * no width) — a documented degrade, never a load gate.
 */
export interface SidebarGeometryFragment {
  readonly collapsed: boolean
  /** The expanded preference in px, within [264, 420] (out-of-band → omitted). */
  readonly width?: number
}

/** The rightbar fragment the 4.4 seam reports, plus the inventory it derives from. */
export interface RightbarCollectInput {
  /** The split store's layout (C9 panes in open order + the clamped ratio). */
  readonly split: SplitLayoutState
  /** The open-tab inventory rows (the wiring scopes them to the live column). */
  readonly tabs: readonly OpenTabRow[]
  /**
   * The tab-identity resolver (doc path / depgraph slug per row): the blob's
   * `topic` carrier. Absent → doc tabs drop (unresolvable identity), other
   * kinds need no topic.
   */
  readonly topicOf?: ((row: OpenTabRow) => string | undefined) | undefined
}

/** One detached window as the collection records it (4.3's registry rows). */
export interface DetachedCollectEntry {
  readonly view: 'board' | 'conversation'
  readonly target?: SessionTarget | undefined
  readonly rect?: Rect | undefined
}

/** A defensible non-empty string (topic-shaped). */
const isTopic = (value: string | undefined): value is string =>
  typeof value === 'string' && value !== '' && value.length <= TOPIC_MAX_LENGTH

/**
 * The C9 ratio → the blob's `widthPct` (比例权威态 × 100): 0.5 → 50. The
 * share arrives pre-clamped from the split store; a non-finite candidate
 * answers `undefined` (the optional field stays absent — never NaN in a blob
 * the kernel would reject).
 */
export function widthPctOfRatio(ratio: number): number | undefined {
  if (!Number.isFinite(ratio)) return undefined
  const pct = Math.round(ratio * 100)
  return Math.min(70, Math.max(30, pct))
}

/** One pane's tab as it enters the blob (kind + the optional topic). */
export interface CollectedTab {
  readonly kind: TabKind
  readonly topic?: string
}

/**
 * Fold one inventory row onto its blob tab (the per-row collect decision):
 * kinds outside the five forge kinds drop (`undefined`); a `doc` row without
 * a resolvable topic drops (an unidentifiable doc would replay broken);
 * `depgraph` keeps its optional topic; the singleton kinds never carry one.
 */
export function collectTabOf(row: OpenTabRow, topicOf?: (row: OpenTabRow) => string | undefined): CollectedTab | undefined {
  if (!isTabKind(row.kind)) return undefined
  if (row.kind === 'guide' || row.kind === 'overview' || row.kind === 'board') return { kind: row.kind }
  const topic = topicOf?.(row)
  if (row.kind === 'doc') return isTopic(topic) ? { kind: 'doc', topic } : undefined
  return isTopic(topic) ? { kind: 'depgraph', topic } : { kind: 'depgraph' }
}

/**
 * Derive the blob's `rightbar.panes` (the pane·tab structure): the BASE pane
 * (the column's first pane) carries every forge-kind row no C9 pane seats,
 * in inventory order; each C9 pane follows in the split's open order — a
 * `board` pane seats its own row (one board tab per pane — the native
 * per-pane page uniqueness), a `session-aside` pane has NO v1 slot and is
 * dropped (the module boundary note). Panes with no tabs never enter the
 * array (an empty column collects as `panes: []` — the default posture).
 */
export function collectRightbarPanes(input: RightbarCollectInput): ReadonlyArray<{ tabs: readonly CollectedTab[] }> {
  const seated = new Set<string>()
  for (const pane of input.split.panes) {
    if (pane.tabId !== undefined) seated.add(pane.tabId)
  }
  const baseTabs: CollectedTab[] = []
  for (const row of input.tabs) {
    if (seated.has(row.tabId)) continue
    const tab = collectTabOf(row, input.topicOf)
    if (tab !== undefined) baseTabs.push(tab)
  }
  const panes: Array<{ tabs: CollectedTab[] }> = baseTabs.length > 0 ? [{ tabs: baseTabs }] : []
  for (const pane of input.split.panes) {
    if (pane.tabId === undefined) continue
    const row = input.tabs.find(candidate => candidate.tabId === pane.tabId)
    const tab = row === undefined ? undefined : collectTabOf(row, input.topicOf)
    // A board pane seats its board row; an aside pane's row is `subagentchat`
    // (outside the whitelist) — dropped either way when it does not fold.
    if (tab === undefined) continue
    panes.push({ tabs: [tab] })
  }
  return panes
}

/**
 * Fold every fragment into ONE Interface 4 `ProjectLayout` v1 (the write
 * path's single collect point — 采集矩阵's pure target). Absent fragments
 * fall to their Interface 4 defaults (the blob is ALWAYS whole: the kernel
 * whitelist rejects partial shapes, so the collect never emits one). The
 * output carries the Interface 4 key set EXACTLY — no view options, no
 * foreign field (the Hard Rule boundary, asserted by the schema twin).
 */
export function collectProjectLayout(fragments: {
  readonly sidebar?: SidebarGeometryFragment | undefined
  readonly tree?: TreeLayoutState | undefined
  readonly rightbar?: RightbarCollectInput | undefined
  readonly detached?: readonly DetachedCollectEntry[] | undefined
}): ProjectLayout {
  const sidebar = fragments.sidebar
  const width = sidebar?.width
  const widthInBand = typeof width === 'number' && Number.isFinite(width)
    && width >= SIDEBAR_WIDTH_MIN && width <= SIDEBAR_WIDTH_MAX
  const tree = fragments.tree ?? EMPTY_TREE_LAYOUT
  const rightbar = fragments.rightbar
  const widthPct = rightbar === undefined ? undefined : widthPctOfRatio(rightbar.split.ratio)
  return {
    version: 1,
    sidebar: {
      collapsed: sidebar?.collapsed === true,
      ...(widthInBand ? { width: Math.round(width) } : {}),
    },
    tree: {
      expandedProjects: [...tree.expandedProjects],
      expandedSessions: [...tree.expandedSessions],
      overflowOpen: [...tree.overflowOpen],
    },
    rightbar: {
      ...(widthPct === undefined ? {} : { widthPct }),
      panes: rightbar === undefined ? [] : collectRightbarPanes(rightbar).map(pane => ({ tabs: pane.tabs })),
    },
    detached: (fragments.detached ?? []).map(entry => ({
      view: entry.view,
      ...(entry.target === undefined ? {} : { target: entry.target }),
      ...(entry.rect === undefined ? {} : { rect: entry.rect }),
    })),
  }
}
