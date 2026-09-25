/**
 * The slot-path navigation assembly (task 3.3): the preferred D3 carrier over
 * the spike-1 §3 registration pair. The 3.2 registrations (the `main` keyed
 * slot's fresh `workbench` key + the `sidebar.panellist` icon row) now carry
 * the view-key machine: the main registration injects the machine as a hooks
 * source (the framework synthesizes the `useViewKey` selector from it) plus
 * the tab action and the panel-lifecycle notifications, and the registration
 * commit attaches the slot carrier — whose attach-time projection IS the
 * restart restore (a persisted workbench view re-selects the panel at boot).
 *
 * The shell's mount/unmount under the keyed main slot reports EXTERNAL
 * selection changes (the upstream sidebar row selecting us, 新建会话 returning
 * to the conversation — ui-workspace's replaceMain/clearMain both end in
 * `selectPanel(null)`) back into the shared controller, so the machine, the
 * persistence, and the fallback rail stay truthful without any upstream
 * knowledge of this plugin.
 *
 * `ctx.layout` is consumed optionally (`ctx.get`, never the plugin `inject`
 * array): a hard service dependency would gate this plugin's whole load on
 * ui-layout — and the fallback rail must survive ui-layout's absence.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import {
  MAIN_SLOT, NS, PANEL_ID, SIDEBAR_ORDER, SIDEBAR_SLOT,
} from '../contract'
import type { ViewKeyStore, WorkbenchTabKey } from '../store/view-key'
import type { BoardSessionStore } from '../store/board-session'
import type { SessionHandover } from '../session-handover'
import { WorkbenchPanelIcon } from '../WorkbenchPanelIcon'
import { WorkbenchShell } from '../WorkbenchShell'
import type { ViewCarrier, ViewSwitchController } from './view-switch'

/** Inputs of {@link installSlotNav}. */
export interface SlotNavOptions {
  /** The shared switching controller the registration attaches its carrier to. */
  readonly controller: ViewSwitchController
  /** The view-key machine, exposed to the shell as the `useViewKey` selector source. */
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
  /**
   * The session hand-over seat (5.11; M3 6.1 slimmed): the shell hands the
   * board page the 「进入会话」 jump seam.
   */
  readonly launch?: SessionHandover | undefined
  /**
   * The board session store (5.11 AC3/AC4): the selection/scroll/badge memory
   * that survives the launch round-trip's shell unmount.
   */
  readonly boardSession?: BoardSessionStore | undefined
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
        hooks: { viewKey: store },
        selectWorkbenchTab: (tab: WorkbenchTabKey) => { controller.switchWorkbenchTab(tab) },
        openFeatureDetail: (slug: string) => { controller.openFeatureDetail(slug) },
        openProposalDetail: (slug: string) => { controller.openProposalDetail(slug) },
        notifyPresented: () => { controller.adoptExternalView('workbench') },
        notifyDismissed: () => { controller.adoptExternalView('session') },
        ...(options.launch === undefined ? {} : { launch: options.launch }),
        ...(options.boardSession === undefined ? {} : { boardSession: options.boardSession }),
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
