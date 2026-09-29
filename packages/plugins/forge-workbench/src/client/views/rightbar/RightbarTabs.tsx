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
import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { RIGHTBAR_TAB_SLOT, RIGHTBAR_TAB_TITLE_SLOT } from '../../contract'
import type { ActiveProjectStore } from '../../store/active-project'
import { INITIAL_ACTIVE_PROJECT_SNAPSHOT } from '../../store/active-project'
import type { BoardSessionStore } from '../../store/board-session'
import { TasksView } from '../tasks/TasksView'
import type { EnterSessionSeam } from '../tasks/detail/LinkHistory'
import { GuideTab, GuideTabTitle, type ForgeTabFace } from './GuideTab'
import { OverviewTab, type DocOpenInput } from './OverviewTab'
import type { OverviewTaskSource } from './overview-model'
import { DocTab } from './DocTab'
import { DocTabTitle, createDocTabsRegistry, focusOrOpenDoc, type DocTabsRegistry } from './DocTree'
import { DepGraphTab } from './DepGraphTab'
import {
  forgeTabDefinitions, forgeTabId, RIGHTBAR_TAB_KINDS, type TabKind,
} from './tab-kinds'
import { followProjectSwitch, toRightbarTabsFace } from './tabs-model'

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
}

/**
 * The board pane body: the 2.1 TasksView in its PANE form. The HOST re-keys
 * the view per project (a project switch is a NEW mount — the board store is
 * per-project by contract), and `host='pane'` contracts the docks/float bar
 * to the board's own box (零宿主探测: the breakpoint is injected, never
 * probed).
 */
export function BoardTabBody({ t, activeProject, session, onEnterSession, sessions }: BoardTabFace): ReactNode {
  const snapshot = useSyncExternalStore(
    activeProject?.subscribe ?? (() => () => {}),
    activeProject?.getSnapshot ?? (() => INITIAL_ACTIVE_PROJECT_SNAPSHOT),
  )
  const projectId = snapshot.activeProjectId ?? undefined
  const project = projectId === undefined ? undefined : snapshot.projects.find(row => row.id === projectId)
  return (
    <div
      data-dsh-forge-board-pane=""
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}
    >
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
  const { t, activeProjectStore, boardSession, onEnterSession, onOpenTask, readTaskSources } = options
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
  // openTab route — never a dead button).
  const docTabs = createDocTabsRegistry()
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

  return () => {
    disposeWatch?.()
    disposeDocTitle()
    disposeGuideTitle()
    for (const dispose of disposeBodies.reverse()) dispose()
    disposeTypes()
  }
}
