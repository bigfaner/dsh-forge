/**
 * forge-workbench plugin, browser half (M2 task 3.3): the dual-view
 * navigation. The apply body is the FORM COORDINATOR (decision D3): the
 * preferred path injects into the upstream navigation slots (nav/slot-inject)
 * as soon as they declare; a grace timer watches for their arrival, and when
 * the boot has settled without them (upstream version drift) the fallback
 * rail (nav/rail) takes over — chrome-only when the main slot is live but the
 * sidebar list is not, full overlay otherwise. Both forms drive the one
 * view-key machine through the one controller (nav/view-switch), so their
 * behavior contracts are identical by construction; view state persists
 * across restarts (store/view-key), first boot defaulting to the session
 * view. The host half (ForgeBridge / session launch / FORGE_ACTOR passthrough)
 * arrives in 4.x, the UF views in 5.x. Cross-boundary traffic happens
 * exclusively through cordis services (slots, locale) — no shell internals
 * are imported, in either direction.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the renderer-owned slots service (ctx.slots) Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ForgeBridge remote-face declaration (task 4.1) into
// this program's Typert view — `ctx.remote.forgeBridge` after the 5.10/5.11
// namespace mount. Zero runtime face: the service lives in the host half.
import type {} from './services'
import {
  createLocalStoragePersistence, createViewKeyStore,
} from './store/view-key'
import { ViewSwitchController } from './nav/view-switch'
import { installRailNav } from './nav/rail'
import { installSlotNav } from './nav/slot-inject'
import { MAIN_SLOT, NS, SIDEBAR_SLOT } from './contract'
import { en } from './locale/en'
import { zh } from './locale/zh'
import type { WorkbenchKey } from './locale/en'

export { MAIN_SLOT, NS, PANEL_ID, SIDEBAR_ORDER, SIDEBAR_SLOT } from './contract'
export { WorkbenchPanelIcon } from './WorkbenchPanelIcon'
export { WorkbenchShell, VIEW_MOUNT_TABLE, resolveViewMount } from './WorkbenchShell'
export type { WorkbenchPanelIconProps, WorkbenchShellProps, WorkbenchViewFace, WorkbenchPanelLifecycle } from './contract'
export {
  createLocalStoragePersistence, createViewKeyStore, hydratePersistedViewKey,
  INITIAL_VIEW_KEY, VIEW_KEY_STORAGE_KEY, WORKBENCH_DIALOG_PREFIX, WORKBENCH_TABS,
} from './store/view-key'
export type {
  PersistedViewKey, TopLevelView, ViewKeyPersistence, ViewKeySnapshot, ViewKeyStore, WorkbenchTabKey,
} from './store/view-key'
export { ViewSwitchController } from './nav/view-switch'
export type { NavForm, ViewCarrier } from './nav/view-switch'
export { installRailNav } from './nav/rail'
export type { RailContentMode, RailNavOptions } from './nav/rail'
export { installSlotNav } from './nav/slot-inject'
export type { SlotNavOptions } from './nav/slot-inject'
export { en } from './locale/en'
export { zh } from './locale/zh'
export type { WorkbenchKey } from './locale/en'
export type {
  ForgeCliResolved, ForgeCliUnavailable, ForgeBridgeRemoteFace,
  GetTaskPromptInput, GetTaskPromptResult, ResolveCliResult,
  TaskPromptAvailable, TaskPromptUnavailable,
} from './services'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The forge-workbench shell's copy. */
    workbench: WorkbenchKey
  }
}

/**
 * Required services: the renderer-owned slot registry and the locale face.
 * The layout service is consumed OPTIONALLY (ctx.get in nav/slot-inject) — a
 * hard inject would gate this plugin's load on ui-layout and kill the
 * fallback rail.
 */
export const inject = ['slots', 'locale']

/**
 * How long the coordinator waits for the upstream navigation slots before the
 * fallback engages. The slots are declared by base-bundle-tier plugins
 * (ui-layout/ui-sidebar) during boot roster assembly — well inside this
 * window in any healthy boot — so an expired grace means the slots are
 * genuinely unavailable in this build (AC2's 槽位不可用).
 */
export const RAIL_GRACE_MS = 5_000

/**
 * Client plugin body: register the bilingual dictionary, seat the view-key
 * machine + shared controller, then assemble the navigation forms — slot path
 * on arrival, rail on grace expiry, rail standing down when the preferred
 * path completes.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'forge-workbench: dictionaries')
  const t = ctx.locale.bind(NS)

  const store = createViewKeyStore(createLocalStoragePersistence())
  const controller = new ViewSwitchController(store)

  let railDispose: (() => void) | undefined
  let mainCommitted = false

  /** Both navigation slots declared (the preferred path can complete). */
  const navSlotsArrived = (): boolean =>
    ctx.slots.spec(MAIN_SLOT) !== undefined && ctx.slots.spec(SIDEBAR_SLOT) !== undefined

  /** Stand the rail up in the mode the slot state dictates (no-op when the preferred path is live). */
  const enableRail = (): void => {
    if (railDispose !== undefined || navSlotsArrived()) return
    railDispose = installRailNav({
      controller,
      store,
      t,
      // The main registration committed → the keyed slot presents the shell;
      // the rail is only the visible toggle. Otherwise the rail owns the
      // workbench surface itself.
      content: mainCommitted ? 'chrome' : 'overlay',
    })
  }

  const disableRail = (): void => {
    railDispose?.()
    railDispose = undefined
  }

  // The grace timer's slot: the slot path can complete SYNCHRONOUSLY inside
  // installSlotNav (slots already declared — the normal boot), before the
  // timer below exists, so the callback must tolerate either state.
  let graceTimer: ReturnType<typeof setTimeout> | undefined

  const disposeSlotNav = installSlotNav(ctx, {
    controller,
    store,
    label: () => t('panel'),
    onMainCommitted: () => {
      mainCommitted = true
      // Mid-boot arrival (rail already up in overlay mode): the keyed slot
      // now presents the shell, so the rail rebuilds as chrome-only — no
      // zombie plugin-owned surface beside the panel.
      if (railDispose !== undefined && !navSlotsArrived()) {
        disableRail()
        enableRail()
      }
    },
    // Both registrations committed: the upstream sidebar row is the entry —
    // the rail (if the grace had engaged it mid-boot) stands down.
    onPathLive: () => {
      if (graceTimer !== undefined) clearTimeout(graceTimer)
      disableRail()
    },
  })

  graceTimer = setTimeout(enableRail, RAIL_GRACE_MS)
  // Node keeps the process reference alive otherwise; browsers have no unref.
  ;(graceTimer as ReturnType<typeof setTimeout> & { unref?: () => void }).unref?.()

  ctx.effect(() => () => {
    clearTimeout(graceTimer)
    disableRail()
    disposeSlotNav()
  }, 'forge-workbench: navigation forms')
}
