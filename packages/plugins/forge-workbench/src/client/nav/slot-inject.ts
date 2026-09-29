/**
 * The slot-path navigation assembly (task 3.3; M4 task 1.7 collapsed the
 * main registration's inject face with the tab family's retirement): the
 * preferred D3 carrier over the spike-1 §3 registration pair. The 3.2
 * registrations (the `main` keyed slot's fresh `workbench` key — now the
 * overview ESCAPE DOOR single page — + the `sidebar.panellist` icon row)
 * attach the slot carrier at commit, whose attach-time projection IS the
 * restart restore (a persisted workbench view re-selects the panel at boot).
 *
 * The shell's mount/unmount under the keyed main slot reports EXTERNAL
 * selection changes (the upstream sidebar row selecting us, 新建会话 returning
 * to the conversation — ui-workspace's replaceMain/clearMain both end in
 * `selectPanel(null)`) back into the shared controller, so the machine, the
 * persistence, and the fallback rail stay truthful without any upstream
 * knowledge of this plugin. Since 1.7 the panel-lifecycle pair is the whole
 * inject face — the retired view face (the machine as a hooks source + the
 * tab/subview actions) died with the interior it addressed.
 *
 * `ctx.layout` is consumed optionally (`ctx.get`, never the plugin `inject`
 * array): a hard service dependency would gate this plugin's whole load on
 * ui-layout — and the fallback rail must survive ui-layout's absence.
 *
 * M4 task 1.6 appended the P1 integration seats beside that pair: the
 * `sidebar.workspaces` shadowing registration (the forge project tree
 * replaces the native browser's rendering — installWorkspacesSeat), the
 * panellist「项目」row (installProjectPanelRow), and the M4 boot default
 * normalization (normalizeBootDefaultView — 启动首屏 = conversation).
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import {
  MAIN_SLOT, NS, PANEL_ID, PROJECT_SEAT_PRIORITY, SIDEBAR_ORDER, SIDEBAR_SLOT, WORKSPACES_SLOT,
} from '../contract'
import type { ViewKeyStore } from '../store/view-key'
import { WorkbenchPanelIcon } from '../WorkbenchPanelIcon'
import { WorkbenchShell } from '../WorkbenchShell'
import type { ViewCarrier, ViewSwitchController } from './view-switch'
import { PROJECT_PANEL_ID, PROJECT_PANEL_ORDER } from './panel-info'
import { ProjectPanelGlyph, ProjectSidebarSeat, type ProjectSeatFace } from './project-seat'

/** Inputs of {@link installSlotNav}. */
export interface SlotNavOptions {
  /** The shared switching controller the registration attaches its carrier to. */
  readonly controller: ViewSwitchController
  /** The view-key machine (the boot-restore check + the carrier's projection source). */
  readonly store: ViewKeyStore
  /** The sidebar row label thunk (locale-aware, resolved by ui-sidebar per read). */
  readonly label: () => string
  /** Notified when the `main` registration committed (content can present; the rail may drop its overlay). */
  readonly onMainCommitted?: () => void
  /**
   * Notified when BOTH navigation slots' registrations committed — the
   * preferred form is fully live and the fallback rail stands down.
   */
  readonly onPathLive?: () => void
}

/**
 * Contribute the workbench panel and its sidebar entry, wiring the view-key
 * machine into the registration (arrival-order: each registration waits for
 * its own slot's declaration).
 * @param ctx - client root context.
 * @param options - controller/store/label + commit notifications.
 * @returns disposer removing both registrations and detaching the carrier.
 */
export function installSlotNav(ctx: ClientContext, options: SlotNavOptions): () => void {
  const { controller, store } = options

  // The layout service, when its fiber is live; absent/na a projection is a
  // no-op (the rail form owns presentation in that world).
  const layoutOf = (): ILayout | undefined => ctx.get('layout') as ILayout | undefined

  const carrier: ViewCarrier = {
    form: 'slot',
    present(snapshot) {
      const layout = layoutOf()
      if (layout === undefined) return
      // `null` selects the Conversation — the 会话视图 target (spike §2.2:
      // openSession is the DF004 launch-time channel, selectPanel(null) is
      // the plain view return).
      layout.selectPanel(snapshot.view === 'workbench' ? PANEL_ID : null)
    },
  }

  let mainCommitted = false
  let sidebarCommitted = false
  const maybePathLive = (): void => {
    if (mainCommitted && sidebarCommitted) options.onPathLive?.()
  }

  const disposeMain = ctx.slots.inject(MAIN_SLOT, () => {
    const dispose = ctx.slots.register({
      name: MAIN_SLOT,
      key: PANEL_ID,
      locale: NS,
      inject: () => ({
        notifyPresented: () => { controller.adoptExternalView('workbench') },
        notifyDismissed: () => { controller.adoptExternalView('session') },
      }),
    }, WorkbenchShell)
    mainCommitted = true
    options.onMainCommitted?.()
    maybePathLive()
    // A workbench view held at commit is the persistence-driven boot restore:
    // arm the one-shot hold against the upstream boot session auto-restore
    // (see ViewSwitchController.armRestoreHold) BEFORE the attach presents.
    if (store.getSnapshot().view === 'workbench') controller.armRestoreHold()
    controller.attach(carrier)
    return () => {
      mainCommitted = false
      controller.detach(carrier)
      dispose()
    }
  })

  const disposeSidebar = ctx.slots.inject(SIDEBAR_SLOT, () => {
    const dispose = ctx.slots.register({
      name: SIDEBAR_SLOT,
      id: PANEL_ID,
      order: SIDEBAR_ORDER,
      label: options.label,
      locale: NS,
    }, WorkbenchPanelIcon)
    sidebarCommitted = true
    maybePathLive()
    return () => {
      sidebarCommitted = false
      dispose()
    }
  })

  return () => {
    disposeMain()
    disposeSidebar()
  }
}

// ---------------------------------------------------------------------------
// M4 task 1.6 — the P1 integration seats (sidebar.workspaces 替换渲染 +
// panellist「项目」行 + 启动首屏 boot default)
// ---------------------------------------------------------------------------

/**
 * Enforce the M4 boot default (裁决 #26 / page-map 启动默认落点): the app
 * boots into the CONVERSATION panel — the `project` workbench — so a view-key
 * machine persisted on the old `workbench` panel by an earlier session is
 * normalized to the session view BEFORE the slot carrier's attach-time
 * projection could re-select that panel (the M2 「重启回到上次视图」 restore
 * is superseded by 启动首屏 = 项目工作台; the escape-hatch panel stays
 * reachable in-session through its own row).
 * @param store - the view-key machine (the persisted boot state).
 * @param controller - the shared switching controller (the one write path).
 */
export function normalizeBootDefaultView(store: ViewKeyStore, controller: ViewSwitchController): void {
  if (store.getSnapshot().view === 'workbench') controller.switchSession()
}

/** Inputs of {@link installProjectPanelRow}. */
export interface ProjectPanelRowOptions {
  /** The「项目」row label thunk (locale-aware, resolved by ui-sidebar per read). */
  readonly label: () => string
}

/**
 * Register the panellist「项目」row (tech-design §Integration #4): a LIST
 * entry at order {@link PROJECT_PANEL_ORDER} — 首项, before upstream `plugins`
 * (0) and the M1 `workbench` row (10), both untouched. The row's ADDRESS is
 * `null` (nav/panel-info.ts): the upstream shell's own row button then does
 * click = `selectPanel(null)` and selected = `activePanelId === null` — the
 * AC's verbatim semantics with zero upstream modification (Hard Rule).
 * @param ctx - client root context.
 * @param options - the label thunk.
 * @returns disposer removing the registration.
 */
export function installProjectPanelRow(ctx: ClientContext, options: ProjectPanelRowOptions): () => void {
  return ctx.slots.inject(SIDEBAR_SLOT, () => {
    const dispose = ctx.slots.register({
      name: SIDEBAR_SLOT,
      // The project workbench's panel address — null (see panel-info.ts).
      id: PROJECT_PANEL_ID,
      order: PROJECT_PANEL_ORDER,
      label: options.label,
      locale: NS,
      registrant: 'forge-workbench: project row',
    }, ProjectPanelGlyph)
    return () => { dispose() }
  })
}

/**
 * Install the forge project tree over the sidebar's browsing region
 * (tech-design §Integration #1): a SINGLE-slot registration at
 * {@link PROJECT_SEAT_PRIORITY} — below ui-workspace's default 0 — so the
 * forge {@link ProjectSidebarSeat} REPLACES the native browser's rendering
 * (SlotCore single-slot shadowing: lowest priority renders; the shadowed
 * native entry stays registered as the crash/teardown fallback). 声明合并
 * 纯增量,上游槽位机制零修改 (Hard Rule); the seat itself renders inert on
 * absent faces (hostless worlds), never a throw.
 * @param ctx - client root context.
 * @param face - the seat's inject face (store + card face + upstream sources).
 * @returns disposer removing the registration.
 */
export function installWorkspacesSeat(ctx: ClientContext, face: ProjectSeatFace): () => void {
  return ctx.slots.inject(WORKSPACES_SLOT, () => {
    const dispose = ctx.slots.register({
      name: WORKSPACES_SLOT,
      priority: PROJECT_SEAT_PRIORITY,
      registrant: 'forge-workbench: project seat',
      inject: () => face,
    }, ProjectSidebarSeat)
    return () => { dispose() }
  })
}
