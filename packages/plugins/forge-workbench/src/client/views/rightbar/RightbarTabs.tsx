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
 *              board → the 2.1 dual-host TasksView in its pane form, doc /
 *              depgraph / overview → PLACEHOLDER MOUNTS: 2.4/2.3 own the
 *              interiors; the placeholders render NOTHING — never an empty
 *              view or preset data, the SC2 discipline) + the guide chip
 *              title (`sidebar.right.pane.tab.title`);
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
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { RIGHTBAR_TAB_SLOT, RIGHTBAR_TAB_TITLE_SLOT } from '../../contract'
import type { ActiveProjectStore } from '../../store/active-project'
import { INITIAL_ACTIVE_PROJECT_SNAPSHOT } from '../../store/active-project'
import type { BoardSessionStore } from '../../store/board-session'
import { TasksView } from '../tasks/TasksView'
import type { EnterSessionSeam } from '../tasks/detail/LinkHistory'
import { GuideTab, GuideTabTitle, type ForgeTabFace } from './GuideTab'
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
}

/**
 * The board pane body: the 2.1 TasksView in its PANE form. The HOST re-keys
 * the view per project (a project switch is a NEW mount — the board store is
 * per-project by contract), and `host='pane'` contracts the docks/float bar
 * to the board's own box (零宿主探测: the breakpoint is injected, never
 * probed).
 */
export function BoardTabBody({ t, activeProject, session, onEnterSession }: BoardTabFace): ReactNode {
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
      />
    </div>
  )
}

/**
 * The 项目概览 placeholder mount (2.3 owns the interior: 标题栏 + 概要信息区
 * + 提案/feature/任务三子 tab). Renders NOTHING until then — an open tab is
 * never preset with an empty view (SC2: 知识区零空占位).
 */
export function OverviewTabBody(): ReactNode {
  return null
}

/**
 * The 文档 tab placeholder mount (2.4 owns the interior: 路径栏 + 只读正文;
 * the tab identity rides the `doc` navigation params). Renders NOTHING.
 */
export function DocTabBody(): ReactNode {
  return null
}

/**
 * The 依赖图 tab placeholder mount (2.4 owns the interior: feature 下拉 +
 * DAG/泳道双模式). Renders NOTHING.
 */
export function DepgraphTabBody(): ReactNode {
  return null
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
   * the C5 挂接历史 rows' [打开] rides the real channel (顶层/subagent 双通路).
   */
  readonly onEnterSession?: EnterSessionSeam | undefined
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
  const { t, activeProjectStore, boardSession, onEnterSession } = options
  const tabs = toTabRegistryFace(optionalService(ctx, 'sidebarRightTabs'))
  if (tabs === undefined) return () => {}
  const face: ForgeTabFace = { t }

  // Stage one — the definitions, held by this fiber's effect (the
  // ui-sidebar-terminal precedent for an outside package's registration).
  const disposeTypes = ctx.effect(() => {
    const definitions = forgeTabDefinitions(t)
    const disposers = RIGHTBAR_TAB_KINDS.map(kind => tabs.register(definitions[kind]))
    return () => { for (const dispose of disposers.reverse()) dispose() }
  }, 'forge-workbench: rightbar tab types')

  // Stage two — the bodies + the guide chip title, each keyed under its own
  // definition id (arrival-order: each injection waits for the seat family's
  // declaration by ui-sidebar-right, exactly like the 1.6 seats). The four
  // non-board bodies share the { t } face; the board adds the active-project
  // store (its only project source) plus 2.7's plugin-lifetime legs (the
  // board-session memory + the Interface 6 open seam).
  const boardFace: BoardTabFace = {
    t,
    ...activeProjectStore === undefined ? {} : { activeProject: activeProjectStore },
    ...boardSession === undefined ? {} : { session: boardSession },
    ...onEnterSession === undefined ? {} : { onEnterSession },
  }

  const registerBody = (
    kind: TabKind,
    component: typeof GuideTab | typeof OverviewTabBody | typeof BoardTabBody | typeof DocTabBody | typeof DepgraphTabBody,
    injectFace: ForgeTabFace | BoardTabFace,
  ): (() => void) => ctx.slots.inject(RIGHTBAR_TAB_SLOT, () => {
    const dispose = ctx.slots.register({
      name: RIGHTBAR_TAB_SLOT,
      key: forgeTabId(kind),
      inject: (): ForgeTabFace | BoardTabFace => injectFace,
      registrant: `forge-workbench: rightbar tab ${kind}`,
    }, component as typeof GuideTab)
    return () => { dispose() }
  })

  const disposeBodies = [
    registerBody('guide', GuideTab, face),
    registerBody('overview', OverviewTabBody, face),
    registerBody('board', BoardTabBody, boardFace),
    registerBody('doc', DocTabBody, face),
    registerBody('depgraph', DepgraphTabBody, face),
  ]
  const disposeGuideTitle = ctx.slots.inject(RIGHTBAR_TAB_TITLE_SLOT, () => {
    const dispose = ctx.slots.register({
      name: RIGHTBAR_TAB_TITLE_SLOT,
      key: forgeTabId('guide'),
      registrant: 'forge-workbench: rightbar tab guide title',
    }, GuideTabTitle)
    return () => { dispose() }
  })

  // The §4.7 linkage: the active-project pointer drives the column. The
  // first observation is record-only (the model's own boot guard) and the
  // same-project pointer never fires (同项目切会话右栏不动).
  const sidebarRight = toRightbarTabsFace(optionalService(ctx, 'sidebarRight'))
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
    disposeGuideTitle()
    for (const dispose of disposeBodies.reverse()) dispose()
    disposeTypes()
  }
}
