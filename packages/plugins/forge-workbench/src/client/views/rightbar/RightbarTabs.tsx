/**
 * The rightbar forge-tabs CONTAINER (M4 task 2.2, tech-design §Integration
 * #5): one installer that mounts the whole five-kind family into the NATIVE
 * right column — 原生 rightbar(dockkit)挂 forge tabs, the T1 native-home
 * ruling. What it contributes, through the upstream public seams only
 * (声明合并纯增量, vendored untouched — the guarded-adapter discipline of
 * nav/slot-inject.ts):
 *
 *   stage one  `ctx.sidebarRightTabs.register` ×5 — the definitions
 *              (tab-kinds.ts; guide = the extension TAKE-OVER of the shipped
 *              door page, overview/board/doc/depgraph = fresh kinds);
 *   stage two  the keyed `sidebar.right.pane.tab` bodies (guide → GuideTab,
 *              board → the 2.1 dual-host TasksView in its pane form,
 *              overview → 2.3's 项目概览 body (OverviewTab: 标题栏 + 概要信息
 *              区 + the M3-face sub-tab panes), doc → 2.4's 文档 body
 *              (DocTab: 路径栏 h38 + ↻ + 只读正文) and depgraph → 2.4's 依赖图
 *              body (DepGraphTab: feature 下拉 + DAG/泳道双模式)) + the two
 *              live chip titles (`sidebar.right.pane.tab.title`: the guide's
 *              glyph chip and the doc kind's `slug/产物名称` from its params);
 *   dedupe     the 文档可多开 · 重复打开激活既有 leg (2.4, AC1): one doc-tabs
 *              registry per plugin lifetime — every MOUNTED doc body registers
 *              (tabId, path), and the overview's open seam
 *              (DocTree.focusOrOpenDoc) focuses the live tab of a re-opened
 *              path instead of minting a duplicate (the native page dedupe
 *              cannot key a `multiple` kind by its params);
 *   linkage    the §4.7 watcher — the active-project pointer drives
 *              tabs-model.followProjectSwitch (close the old project's
 *              doc/depgraph, return an expanded column to 项目概览). The
 *              裁决 #28-④ 换台重置 leg (收起 + 开始页) is wired at its 1.6
 *              seam — project-seat's resetWorkbenchContext — not here.
 *
 * Everything the native column already owns STAYS native: the strip
 * mechanics (chips h28/min80/max170/r12, × on active/hover/focus, ellipsis +
 * horizontal scroll + active scroll-into-view, WAI-ARIA tabs keyboard), the
 * ＋ (in-strip, glued to the last tab, opens the guide page directly with NO
 * menu, hidden while the pane holds a guide), ⛶ fullscreen covering the
 * conversation, the collapse-to-zero track + 45%-viewport/300–70% width
 * policy (ui-layout columns.ts), and the per-session native persistence
 * (会话域, untouched — the project-domain layout memory, 4.5, is the OTHER
 * track and does not conflict: different granularity). 分栏钮/拖拽排序/
 * 跨栏/拖出浮动 are dsh dockkit capabilities M4 does not build (注记).
 */
import { useSyncExternalStore, useRef } from 'react'
import type { ReactNode } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { DETACH_TAB_MENU_SLOT, RIGHTBAR_TAB_SLOT, RIGHTBAR_TAB_TITLE_SLOT } from '../../contract'
import type { ActiveProjectStore } from '../../store/active-project'
import { INITIAL_ACTIVE_PROJECT_SNAPSHOT } from '../../store/active-project'
import type { BoardSessionStore } from '../../store/board-session'
import type { WindowVerbFaceClient } from '../../window-role/boot'
import { detachConversationToWindow, parseSubagentChatAddress } from '../../window-role/recall'
import { TasksView } from '../tasks/TasksView'
import type { EnterSessionSeam } from '../tasks/detail/LinkHistory'
import { GuideTab, GuideTabTitle, type ForgeTabFace } from './GuideTab'
import { OverviewTab, type DocOpenInput } from './OverviewTab'
import type { OverviewTaskSource } from './overview-model'
import { DocTab } from './DocTab'
import { DocTabTitle, createDocTabsRegistry, focusOrOpenDoc, type DocTabsRegistry } from './DocTree'
import { DepGraphTab } from './DepGraphTab'
import { PaneHeader } from './PaneControls'
import { SplitSeparator } from './SplitControls'
import {
  forgeTabDefinitions, forgeTabId, RIGHTBAR_TAB_KINDS, type TabKind,
} from './tab-kinds'
import {
  followProjectSwitch, INITIAL_SPLIT_LAYOUT, isSplitActive, toRightbarTabsFace,
  type SplitPaneStore,
} from './tabs-model'

// ---------------------------------------------------------------------------
// Tab bodies
// ---------------------------------------------------------------------------

/** The guide body's face needs nothing beyond the shared share. */
export type GuideBodyProps = ForgeTabFace

/**
 * The board pane's injected face: the 2.1 dual-host contract — `host='pane'`
 * is the width form, and the ACTIVE-PROJECT pointer is the board's only
 * project source (the pane host feeds it; the detached window pins its own).
 * M4 2.7 adds the two plugin-lifetime legs the board's C5/C6 faces ride: the
 * board-session memory (the shared selection the C6 「查看任务」 jump opens
 * the detail dock through) and the Interface 6 open seam (the channel behind
 * the C5 [打开] rows — 2.7's session-open.ts).
 */
export interface BoardTabFace extends ForgeTabFace {
  /** The plugin-lifetime active-project store; absent (hostless) = the board
   * stays on its resolving branch (no silent project). */
  readonly activeProject?: ActiveProjectStore | undefined
  /** The plugin-lifetime board-session memory (5.11's designed client-apply tier — the C6→C5 dock bridge). */
  readonly session?: BoardSessionStore | undefined
  /** The Interface 6 dual-channel open seam (present = the C5 rows' [打开] goes live). */
  readonly onEnterSession?: EnterSessionSeam | undefined
  /**
   * The upstream sessions source (M4 2.9 — the C5 lineage seat's data leg):
   * present = the detail dock's 挂接历史 rows gain the 行展开 face over the
   * guarded snapshot read (SC7 消费点 wiring); absent = the section keeps its
   * M2/M3 informational form.
   */
  readonly sessions?: import('../../nav/project-seat').SessionsFace | undefined
  /**
   * The plugin-lifetime C9 split store (M4 4.4): present + an ACTIVE split
   * (≥ 2 C9 panes) mounts the pane 头 + 分隔条 chrome AROUND the TasksView
   * (AC5: the chrome wraps, never into — the view below is the SAME
   * instance); absent = the plain 2.1 pane body.
   */
  readonly split?: SplitPaneStore | undefined
  /**
   * The [拆出为窗口] verb seam (M4 4.3, C10): the pane 头's action fires it
   * with the board's project (the ACTIVE project — the pane host's board
   * source); the resolved promise says the window opened, and ONLY then does
   * the body remove its pane (主窗 pane 移除). Absent = the 4.4 reserved
   * 动作位 (disabled + tooltip) — hostless worlds never see a dead click.
   */
  readonly onDetachBoard?: ((projectId: string) => Promise<boolean>) | undefined
}

/**
 * The board pane body: the 2.1 TasksView in its PANE form. The HOST re-keys
 * the view per project (a project switch is a NEW mount — the board store is
 * per-project by contract), and `host='pane'` contracts the docks/float bar
 * to the board's own box (零宿主探测: the breakpoint is injected, never
 * probed).
 *
 * M4 4.4 (C9): while the split is ACTIVE the body gains the pane 头 (区名 +
 * the [拆出为窗口] 动作位 + [关闭] — the close rides the tab's OWN
 * actions, the native seat contract) and the 分隔条 at the left edge (the
 * a11y keyboard separator + the clamped drag, tabs-model/SplitControls).
 * M4 4.3 wires the 动作位: the detach opens the detached window FIRST — the
 * pane closes only on the resolved open (a failed window never loses the view).
 */
export function BoardTabBody(
  {
    useTabInfo, t, activeProject, session, onEnterSession, sessions, split, onDetachBoard,
  }: BoardTabFace & PropsRuntime<typeof RIGHTBAR_TAB_SLOT>,
): ReactNode {
  const snapshot = useSyncExternalStore(
    activeProject?.subscribe ?? (() => () => {}),
    activeProject?.getSnapshot ?? (() => INITIAL_ACTIVE_PROJECT_SNAPSHOT),
  )
  const splitSnapshot = useSyncExternalStore(
    split?.subscribe ?? (() => () => {}),
    split?.getSnapshot ?? (() => INITIAL_SPLIT_LAYOUT),
  )
  const paneRef = useRef<HTMLDivElement | null>(null)
  const projectId = snapshot.activeProjectId ?? undefined
  const project = projectId === undefined ? undefined : snapshot.projects.find(row => row.id === projectId)
  const splitActive = split !== undefined && isSplitActive(splitSnapshot)
  // The pane 头 [关闭] rides the tab's OWN seat contract (the DocTab
  // `props.useTabInfo?.()` discipline — the actions read at render, the
  // callback only fires them).
  const closeTab = useTabInfo?.().tab.actions.close
  const closePane = (): void => { closeTab?.() }
  // M4 4.3 (C10 ①): [拆出为窗口] → windowOpenDetached FIRST, 主窗 pane 移除
  // only on the resolved open — a failed window keeps the pane (never a lost
  // view). No resolved project yet = no dead click (the reserved seat).
  const detachPane = onDetachBoard === undefined || projectId === undefined
    ? undefined
    : (): void => {
      void onDetachBoard(projectId).then((opened) => {
        if (opened) closePane()
      })
    }
  // The drag math's denominator: the pane's measured width lifted to the WHOLE
  // split's width through the pane's share (first pane = ratio, else 1-ratio;
  // the open order tracks the pane order in the common flow). Zero-measured
  // (a jsdom mount) = the drag degrades, the keyboard path still works.
  const measureSplitContainer = (): number => {
    const panePx = paneRef.current?.offsetWidth ?? 0
    if (!(panePx > 0) || split === undefined) return 0
    const boardIndex = splitSnapshot.panes.findIndex(pane => pane.view === 'board')
    const share = boardIndex === 0 ? splitSnapshot.ratio : 1 - splitSnapshot.ratio
    if (!(share > 0) || !(share < 1)) return 0
    return panePx / share
  }
  return (
    <div
      ref={paneRef}
      data-dsh-forge-board-pane=""
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, position: 'relative' }}
    >
      {splitActive && (
        <SplitSeparator
          t={t}
          ratio={splitSnapshot.ratio}
          onRatioChange={(ratio) => { split?.setRatio(ratio) }}
          measureContainer={measureSplitContainer}
        />
      )}
      {splitActive && (
        <PaneHeader
          t={t}
          view="board"
          onClose={closePane}
          {...detachPane === undefined ? {} : { onDetach: detachPane }}
        />
      )}
      <TasksView
        key={projectId ?? 'unresolved'}
        t={t}
        host="pane"
        projectId={projectId}
        codeRoot={project?.codeRoot}
        {...(session === undefined ? {} : { session })}
        {...(onEnterSession === undefined ? {} : { onEnterSession })}
        {...(sessions === undefined ? {} : { sessions })}
      />
    </div>
  )
}

/**
 * The overview pane's injected face (M4 2.3): the shared locale seat plus the
 * four plugin-lifetime legs the panes ride — the active-project store (the
 * tab's ONLY project source), the row→dock seam (the C6 「查看任务」 shape:
 * the shared board-session selection opens the dock, the board pane comes
 * forward — wired in the apply), the Interface 6 open seam (⟞ 直达会话), and
 * the task-sources read the header's 运行中 segment and the tasks pane share
 * (the C6 metadata source twin — one bridge-side builder feeds both faces).
 */
export interface OverviewTabFace extends ForgeTabFace {
  /** The plugin-lifetime active-project pointer store; absent = the resolving skeleton. */
  readonly activeProject?: ActiveProjectStore | undefined
  /** The row-click → 任务详情 dock seam (select + ensureBoardActive, the apply's wiring). */
  readonly onOpenTask?: ((taskKey: string) => void) | undefined
  /** The Interface 6 dual-channel open seam (⟞ 直达会话). */
  readonly onEnterSession?: EnterSessionSeam | undefined
  /** The shared `{ task, links }` read (real chain; absent = silent degrade). */
  readonly readTaskSources?: (() => Promise<readonly OverviewTaskSource[] | undefined>) | undefined
  /**
   * The 点文档名 → 文档 tab open seam (M4 2.4): the dedupe-aware route —
   * focus-or-open over the doc-tabs registry (AC1 重复打开激活既有). Absent
   * (hostless, or the controller face is unavailable) = the overview keeps
   * its own built-in openTab route.
   */
  readonly openDocTab?: ((input: DocOpenInput) => void) | undefined
}

/** The 项目概览 body's composed props (the keyed-seat dispatch contract). */
export type OverviewTabBodyProps =
  & PropsRuntime<typeof RIGHTBAR_TAB_SLOT>
  & InjectFace<OverviewTabFace>

/**
 * The 项目概览 tab body (2.3's interior): 标题栏 + 概要信息区 + the
 * 提案/feature/任务 sub-tabs (OverviewTab). The BODY re-keys per project —
 * a project switch is a NEW mount (fresh faces seeded per project, the
 * BoardTabBody precedent), while sub-tab switches stay inside the mount.
 */
export function OverviewTabBody(
  { useTabInfo, t, activeProject, onOpenTask, onEnterSession, readTaskSources, openDocTab }: OverviewTabBodyProps,
): ReactNode {
  const snapshot = useSyncExternalStore(
    activeProject?.subscribe ?? (() => () => {}),
    activeProject?.getSnapshot ?? (() => INITIAL_ACTIVE_PROJECT_SNAPSHOT),
  )
  const projectId = snapshot.activeProjectId ?? undefined
  return (
    <OverviewTab
      key={projectId ?? 'unresolved'}
      t={t}
      {...(activeProject === undefined ? {} : { activeProject })}
      {...(onOpenTask === undefined ? {} : { onOpenTask })}
      {...(onEnterSession === undefined ? {} : { onEnterSession })}
      {...(readTaskSources === undefined ? {} : { readTaskSources })}
      {...(openDocTab === undefined ? {} : { openDocTab })}
      {...(useTabInfo === undefined ? {} : { useTabInfo })}
    />
  )
}

/**
 * The 文档 pane's injected face (M4 2.4): the shared locale seat, the
 * plugin-lifetime project pointer (the tab's ONLY project source — the doc
 * belongs to the current project; a project switch CLOSES the tab, the §4.7
 * linkage), and the doc-tabs registry the body's mount registers into (the
 * AC1 dedupe's liveness half).
 */
export interface DocTabFace extends ForgeTabFace {
  /** The plugin-lifetime active-project pointer store; absent = the resolving skeleton. */
  readonly activeProject?: ActiveProjectStore | undefined
  /** The plugin-lifetime doc-tabs registry (AC1 dedupe); absent = unregistered. */
  readonly docTabs?: DocTabsRegistry | undefined
}

/** The 文档 tab body's composed props (the keyed-seat dispatch contract). */
export type DocTabBodyProps =
  & PropsRuntime<typeof RIGHTBAR_TAB_SLOT>
  & InjectFace<DocTabFace>

/**
 * The 文档 tab body (2.4's interior): 路径栏 h38 (路径小字 + ↻ 重新读取 + 只读)
 * over the read-only 正文 (the ONE MarkdownView). The tab identity rides the
 * `doc` navigation params; the read routes through the M3 face verbs (DocTree
 * parses the path — 零新读侧).
 */
export function DocTabBody(
  { useTabInfo, t, activeProject, docTabs }: DocTabBodyProps,
): ReactNode {
  return (
    <DocTab
      t={t}
      {...(activeProject === undefined ? {} : { activeProject })}
      {...(docTabs === undefined ? {} : { docTabs })}
      {...(useTabInfo === undefined ? {} : { useTabInfo })}
    />
  )
}

/**
 * The 依赖图 pane's injected face (M4 2.4): the shared locale seat plus the
 * legs the graph rides — the project pointer (the dropdown's 本项目 rows +
 * the board reads), the row-click → 任务详情 dock seam (C6 select +
 * ensureBoardActive — the SAME seam the overview's task rows use), and the
 * shared task-sources read (the 会话中 pill's active-link map, the C6 source
 * twin).
 */
export interface DepgraphTabFace extends ForgeTabFace {
  /** The plugin-lifetime active-project pointer store; absent = the resolving skeleton. */
  readonly activeProject?: ActiveProjectStore | undefined
  /** The 节点点击 → 任务详情 dock seam (select + ensureBoardActive, the apply's wiring). */
  readonly onOpenTask?: ((taskKey: string) => void) | undefined
  /** The shared `{ task, links }` read (real chain; absent = the pills degrade silently). */
  readonly readTaskSources?: (() => Promise<readonly OverviewTaskSource[] | undefined>) | undefined
}

/** The 依赖图 tab body's composed props (the keyed-seat dispatch contract). */
export type DepgraphTabBodyProps =
  & PropsRuntime<typeof RIGHTBAR_TAB_SLOT>
  & InjectFace<DepgraphTabFace>

/**
 * The 依赖图 tab body (2.4's interior): the feature 名即下拉 (仅本项目 +
 * 状态徽标 pill) over the DAG/泳道图 double mode sharing one node card
 * (点击开任务详情 dock).
 */
export function DepgraphTabBody(
  { useTabInfo, t, activeProject, onOpenTask, readTaskSources }: DepgraphTabBodyProps,
): ReactNode {
  return (
    <DepGraphTab
      t={t}
      {...(activeProject === undefined ? {} : { activeProject })}
      {...(onOpenTask === undefined ? {} : { onOpenTask })}
      {...(readTaskSources === undefined ? {} : { readTaskSources })}
      {...(useTabInfo === undefined ? {} : { useTabInfo })}
    />
  )
}

// ---------------------------------------------------------------------------
// The aside tab-menu [拆出为窗口] entry (M4 4.3 — the conversation origin)
// ---------------------------------------------------------------------------

/** The aside tab-menu entry's observed owner share (the kit's menu-item contract subset). */
export interface DetachMenuOwnerShare {
  /** The tab whose menu is open ({ id, kind, contentId } — the observed subset). */
  readonly tab: { readonly id: string; readonly kind: string; readonly contentId: string }
  /** Dismiss the menu (an item that acts MUST call this — the kit's own rule). */
  readonly dismiss: () => void
}

/** The menu entry's injected face. */
export interface DetachMenuFace {
  /** The plugin locale seat. */
  readonly t: ForgeTabFace['t']
  /** The active project id resolver (absent → the entry renders nothing). */
  readonly getProjectId: () => string | undefined
  /** The [拆出为窗口] verb face (the shell's window registry). */
  readonly windowVerb: WindowVerbFaceClient
  /** The tab close seam (the pane removal after a resolved open). */
  readonly closeTab: (tabId: string) => void
}

/** The menu entry's composed props (the owner share + the injected face). */
export type DetachMenuItemProps = DetachMenuOwnerShare & DetachMenuFace

/** The menu row (the 4.4 menu-row form: h30 r14 full-width row). */
const DETACH_MENU_ROW_STYLE = {
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: '14px',
  color: 'inherit',
  cursor: 'pointer',
  display: 'flex',
  font: 'inherit',
  fontSize: '13px',
  gap: '8px',
  height: '30px',
  padding: '0 12px',
  textAlign: 'left',
  width: '100%',
} as const

/**
 * The subagentchat tab's actions-menu [拆出为窗口] row (the 4.4 note's
 * 「native tab-menu seat」 — the upstream-hosted aside pane carries no forge
 * pane 头, its detach joins here): renders ONLY for a subagentchat tab (the
 * contentId parses back into the lineage address triple); the pick opens
 * the detached conversation window and closes the tab ONLY on the resolved
 * open — and the menu dismisses either way (the kit's own rule).
 * @returns the row, or null for any other tab kind.
 */
export function DetachMenuEntry({ tab, dismiss, t, getProjectId, windowVerb, closeTab }: DetachMenuItemProps): ReactNode {
  const target = parseSubagentChatAddress(tab.contentId)
  if (target === undefined) return null
  const onPick = (): void => {
    dismiss()
    const projectId = getProjectId()
    if (projectId === undefined) return
    void detachConversationToWindow(windowVerb, projectId, target).then((opened) => {
      if (opened) closeTab(tab.id)
    })
  }
  return (
    <button type="button" data-dsh-forge-detach-menu-item="" style={DETACH_MENU_ROW_STYLE} onClick={onPick}>
      {t('rightbar.split.pane.detach')}
    </button>
  )
}

/** The aside detach menu entry's list id (the `sidebar.right.tab.menu.item` cell). */
export const DETACH_MENU_ID = 'forge-detach-aside'

/** The entry's order (the menu's extra-items tail, in registration order). */
export const DETACH_MENU_ORDER = 100

// ---------------------------------------------------------------------------
// The installer
// ---------------------------------------------------------------------------

/** The tab-type registry subset the installer consumes (stage one). */
export interface TabRegistryFace {
  register(definition: SidebarRightTabDefinition): () => void
}

/** Inputs of {@link installRightbarTabs}. */
export interface RightbarTabsOptions extends ForgeTabFace {
  /** The plugin-lifetime active-project pointer store (the linkage + board feed); absent = both legs inert. */
  readonly activeProjectStore?: ActiveProjectStore | undefined
  /**
   * The plugin-lifetime board-session memory (M4 2.7, the C6→C5 dock bridge):
   * threaded into the board pane body — the shared selection the metadata
   * bar's 「查看任务」 jump opens the detail dock through.
   */
  readonly boardSession?: BoardSessionStore | undefined
  /**
   * The Interface 6 open seam (M4 2.7): threaded into the board pane body so
   * the C5 挂接历史 rows' [打开] rides the real channel (顶层/subagent 双通路),
   * and into the overview body (2.3) for the tasks pane's ⟞ 直达会话 entry.
   */
  readonly onEnterSession?: EnterSessionSeam | undefined
  /**
   * The overview tasks row's dock seam (M4 2.3): select through the shared
   * board-session store + bring the board pane forward (the C6 「查看任务」
   * shape) — wired in the client apply over the plugin-lifetime legs.
   */
  readonly onOpenTask?: ((taskKey: string) => void) | undefined
  /**
   * The overview's shared task-sources read (M4 2.3): the `{ task, links }`
   * rows the 概要信息区's 运行中 segment and the tasks pane consume — the C6
   * metadata source twin (the apply shares ONE bridge-side builder between
   * both faces).
   */
  readonly readTaskSources?: (() => Promise<readonly OverviewTaskSource[] | undefined>) | undefined
  /**
   * The upstream sessions source (M4 2.9 — the C5 lineage seat's data leg):
   * the guarded `ctx.sessions` read threaded into the board pane body so the
   * detail dock's 挂接历史 rows gain the 行展开 face (SC7 消费点 wiring).
   */
  readonly sessions?: import('../../nav/project-seat').SessionsFace | undefined
  /**
   * The plugin-lifetime C9 split store (M4 4.4): threaded into the board pane
   * body (the pane 头 + 分隔条 chrome) AND fed the open-tab inventory (the
   * watcher below — native closes / project-switch closes reconcile the pane
   * set; reaching the empty set IS the 全部 pane 关闭 → 回活跃区 transition).
   */
  readonly splitStore?: SplitPaneStore | undefined
  /**
   * The [拆出为窗口] verb seam (M4 4.3, C10 ①): threaded into the board pane
   * body's pane 头 动作位 — the action opens the detached window; the pane
   * closes only on the resolved promise. Absent = the reserved disabled seat.
   */
  readonly onDetachBoard?: ((projectId: string) => Promise<boolean>) | undefined
  /**
   * The shell's window verb face (M4 4.3): present + an active project
   * resolver = the subagentchat tab's actions menu gains the [拆出为窗口]
   * entry (the conversation origin); absent = no entry (hostless worlds).
   */
  readonly windowVerb?: WindowVerbFaceClient | undefined
  /** The active project id resolver (the aside menu entry's project source). */
  readonly getActiveProjectId?: (() => string | null | undefined) | undefined
  /**
   * The SHARED doc-tabs registry (M4 4.5): the apply body owns the
   * plugin-lifetime instance so the layout memory's `doc` topic resolver
   * reads the same live (tabId ↔ path) pairs the open dedupe does. Absent =
   * the installer creates its own (the pre-4.5 shape).
   */
  readonly docTabs?: DocTabsRegistry | undefined
  /**
   * The rightbar-inventory collect seam (4.5 wiring completion): fired on
   * every open-tab inventory PUBLISH (a forge-kind tab opening or closing
   * without any split/pane change — a doc tab opened from the overview is
   * the canonical case). The blob's `rightbar.panes` is defined OVER the
   * inventory (collect.ts's `RightbarCollectInput.tabs`), so a forge-owned
   * tab joining the column is a rightbar-fragment change the layout memory
   * must mirror; sampling the rows only when the split store reports left
   * tab-only opens outside every collect seam (the stored memory silently
   * missed them — the restore-target-missing contract's fixture premise).
   * Absent = no extra collect (the pre-seam shape).
   */
  readonly onInventoryChange?: (() => void) | undefined
}

const isObject = (candidate: unknown): candidate is Record<string, unknown> =>
  typeof candidate === 'object' && candidate !== null

const isFunction = (candidate: unknown): candidate is (...args: never[]) => unknown =>
  typeof candidate === 'function'

/** Narrow an unknown `ctx.sidebarRightTabs` candidate onto the register face (guarded adapter). */
export function toTabRegistryFace(candidate: unknown): TabRegistryFace | undefined {
  if (!isObject(candidate) || !isFunction(candidate.register)) return undefined
  return candidate as unknown as TabRegistryFace
}

/** Read an upstream service without gating the boot (absent = that leg's absence). */
function optionalService(ctx: ClientContext, name: string): unknown {
  try {
    return ctx.get(name, false)
  } catch {
    return undefined
  }
}

/**
 * Mount the forge tab family into the native right column (the 2.2
 * container). Every upstream reach is guarded: an absent `sidebarRightTabs`
 * service keeps the whole family unregistered (the native column stays
 * exactly as shipped); an absent `sidebarRight` leaves the linkage inert; an
 * absent store leaves the board's project feed unresolved. Never a throw,
 * never a load gate.
 * @param ctx - client root context.
 * @param options - the locale seat + the active-project store.
 * @returns disposer removing the definitions, the bodies, and the watcher.
 */
export function installRightbarTabs(ctx: ClientContext, options: RightbarTabsOptions): () => void {
  const {
    t, activeProjectStore, boardSession, onEnterSession, onOpenTask, readTaskSources, splitStore,
    onDetachBoard, windowVerb,
  } = options
  const tabs = toTabRegistryFace(optionalService(ctx, 'sidebarRightTabs'))
  if (tabs === undefined) return () => {}
  const face: ForgeTabFace = { t }

  // The controller face: resolved ONCE here — the §4.7 linkage watcher AND the
  // 文档 open dedupe seam below both consume it (guarded throughout).
  const sidebarRight = toRightbarTabsFace(optionalService(ctx, 'sidebarRight'))

  // Stage one — the definitions, held by this fiber's effect (the
  // ui-sidebar-terminal precedent for an outside package's registration).
  const disposeTypes = ctx.effect(() => {
    const definitions = forgeTabDefinitions(t)
    const disposers = RIGHTBAR_TAB_KINDS.map(kind => tabs.register(definitions[kind]))
    return () => { for (const dispose of disposers.reverse()) dispose() }
  }, 'forge-workbench: rightbar tab types')

  // The 文档 dedupe halves (M4 2.4, AC1): ONE registry per plugin lifetime —
  // the doc bodies register their (tabId, path) on mount, and the overview's
  // open seam focuses a live tab for a re-opened path. Only live while the
  // controller face is (an absent face leaves the overview on its built-in
  // openTab route — never a dead button). M4 4.5: the apply body may supply
  // the SHARED instance (the layout memory's topic resolver reads it too).
  const docTabs = options.docTabs ?? createDocTabsRegistry()
  const openDocTab = sidebarRight === undefined
    ? undefined
    : (input: DocOpenInput): void => { focusOrOpenDoc(sidebarRight, docTabs, input) }

  // Stage two — the bodies + the live chip titles, each keyed under its own
  // definition id (arrival-order: each injection waits for the seat family's
  // declaration by ui-sidebar-right, exactly like the 1.6 seats). The guide
  // body shares the { t } face; the board adds the active-project store (its
  // only project source) plus 2.7's plugin-lifetime legs (the board-session
  // memory + the Interface 6 open seam); the overview adds its own project
  // source + 2.3's legs (the dock seam, the ⟞ open seam, the shared
  // task-sources read) + 2.4's dedupe-aware doc open; the doc body adds the
  // project source + the registry; the depgraph body adds the project source
  // + the dock seam + the shared task-sources read (the 会话中 pill).
  const boardFace: BoardTabFace = {
    t,
    ...activeProjectStore === undefined ? {} : { activeProject: activeProjectStore },
    ...boardSession === undefined ? {} : { session: boardSession },
    ...onEnterSession === undefined ? {} : { onEnterSession },
    // M4 2.9: read through the OPTIONS object (a getter at the apply side may
    // resolve the upstream service lazily — an eager destructure would freeze
    // an absent service into the face for the plugin's lifetime).
    get sessions() { return options.sessions },
    // M4 4.4: the C9 split store (the pane 头 + 分隔条 chrome's state home).
    ...splitStore === undefined ? {} : { split: splitStore },
    // M4 4.3: the [拆出为窗口] verb seam (the pane 头 动作位 goes live).
    ...onDetachBoard === undefined ? {} : { onDetachBoard },
  }
  const overviewFace: OverviewTabFace = {
    t,
    ...activeProjectStore === undefined ? {} : { activeProject: activeProjectStore },
    ...onOpenTask === undefined ? {} : { onOpenTask },
    ...onEnterSession === undefined ? {} : { onEnterSession },
    ...readTaskSources === undefined ? {} : { readTaskSources },
    ...openDocTab === undefined ? {} : { openDocTab },
  }
  const docFace: DocTabFace = {
    t,
    ...activeProjectStore === undefined ? {} : { activeProject: activeProjectStore },
    docTabs,
  }
  const depgraphFace: DepgraphTabFace = {
    t,
    ...activeProjectStore === undefined ? {} : { activeProject: activeProjectStore },
    ...onOpenTask === undefined ? {} : { onOpenTask },
    ...readTaskSources === undefined ? {} : { readTaskSources },
  }

  const registerBody = (
    kind: TabKind,
    component: typeof GuideTab | typeof OverviewTabBody | typeof BoardTabBody | typeof DocTabBody | typeof DepgraphTabBody,
    injectFace: ForgeTabFace | BoardTabFace | OverviewTabFace | DocTabFace | DepgraphTabFace,
  ): (() => void) => ctx.slots.inject(RIGHTBAR_TAB_SLOT, () => {
    const dispose = ctx.slots.register({
      name: RIGHTBAR_TAB_SLOT,
      key: forgeTabId(kind),
      inject: (): ForgeTabFace | BoardTabFace | OverviewTabFace | DocTabFace | DepgraphTabFace => injectFace,
      registrant: `forge-workbench: rightbar tab ${kind}`,
    }, component as typeof GuideTab)
    return () => { dispose() }
  })

  const disposeBodies = [
    registerBody('guide', GuideTab, face),
    registerBody('overview', OverviewTabBody, overviewFace),
    registerBody('board', BoardTabBody, boardFace),
    registerBody('doc', DocTabBody, docFace),
    registerBody('depgraph', DepgraphTabBody, depgraphFace),
  ]
  const registerTitle = (
    kind: 'guide' | 'doc',
    component: typeof GuideTabTitle | typeof DocTabTitle,
  ): (() => void) => ctx.slots.inject(RIGHTBAR_TAB_TITLE_SLOT, () => {
    const dispose = ctx.slots.register({
      name: RIGHTBAR_TAB_TITLE_SLOT,
      key: forgeTabId(kind),
      registrant: `forge-workbench: rightbar tab ${kind} title`,
    }, component as typeof GuideTabTitle)
    return () => { dispose() }
  })
  const disposeGuideTitle = registerTitle('guide', GuideTabTitle)
  // The doc chip rides its params (`slug/产物名称`) — without this seat every
  // doc chip would show the registry's generic fallback (2.2's title thunk).
  const disposeDocTitle = registerTitle('doc', DocTabTitle)

  // The §4.7 linkage: the active-project pointer drives the column. The
  // first observation is record-only (the model's own boot guard) and the
  // same-project pointer never fires (同项目切会话右栏不动).
  let disposeWatch: (() => void) | undefined
  if (activeProjectStore !== undefined && sidebarRight !== undefined) {
    let seen: string | null = activeProjectStore.getSnapshot().activeProjectId
    disposeWatch = activeProjectStore.subscribe(() => {
      const next = activeProjectStore.getSnapshot().activeProjectId
      const previous = seen
      if (next === previous) return
      seen = next
      followProjectSwitch(sidebarRight, previous, next)
    })
  }

  // The C9 pane-set watcher (M4 4.4): the split store reconciles with the
  // open-tab inventory — native chip × closes, the §4.7 project-switch closes
  // and any C5-opened aside all land in the pane set through ONE source. The
  // boot reconcile seeds the set from whatever is already open (e.g. a board
  // the guide door seated before the split began). The SAME publish feeds the
  // 4.5 collect seam (`onInventoryChange`): a forge-kind tab joining or
  // leaving the column with no split-state change (a doc tab opened from the
  // overview) is a rightbar-fragment change the layout memory must collect —
  // the store's own reports sample the inventory only at split commits.
  let disposeSplitWatch: (() => void) | undefined
  if (sidebarRight !== undefined && (splitStore !== undefined || options.onInventoryChange !== undefined)) {
    if (splitStore !== undefined) splitStore.reconcile(sidebarRight.openTabs.getSnapshot())
    disposeSplitWatch = sidebarRight.openTabs.subscribe?.(() => {
      splitStore?.reconcile(sidebarRight.openTabs.getSnapshot())
      options.onInventoryChange?.()
    })
  }

  // The aside tab's actions-menu [拆出为窗口] entry (M4 4.3 — the conversation
  // origin): ONE list registration under the kit's menu-item seat, rendered
  // only for subagentchat tabs. 声明合并纯增量 — the kit's own layout actions
  // stay untouched (Hard Rule).
  const disposeDetachMenu = windowVerb === undefined || options.getActiveProjectId === undefined
    ? () => {}
    : ctx.slots.inject(DETACH_TAB_MENU_SLOT, () => {
      const dispose = ctx.slots.register({
        name: DETACH_TAB_MENU_SLOT,
        id: DETACH_MENU_ID,
        order: DETACH_MENU_ORDER,
        registrant: 'forge-workbench: aside detach menu entry',
        inject: (): DetachMenuFace => ({
          t,
          getProjectId: () => options.getActiveProjectId?.() ?? undefined,
          windowVerb,
          closeTab: (tabId: string): void => {
            try {
              sidebarRight?.close(tabId)
            } catch {
              // The rebind window mid session switch — the kit's close is a
              // no-op then; the window opened, the tab settles natively.
            }
          },
        }),
      }, DetachMenuEntry)
      return () => { dispose() }
    })

  return () => {
    disposeDetachMenu()
    disposeSplitWatch?.()
    disposeWatch?.()
    disposeDocTitle()
    disposeGuideTitle()
    for (const dispose of disposeBodies.reverse()) dispose()
    disposeTypes()
  }
}
