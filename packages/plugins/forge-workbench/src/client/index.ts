/**
 * forge-workbench plugin, browser half (M2 task 3.2 scaffold): the workbench
 * navigation shell. One registration pair claims the upstream navigation
 * surface — the `main` keyed slot's fresh `workbench` key (the central panel
 * this plugin owns) plus the `sidebar.panellist` icon row entry that selects
 * it — and registers the bilingual dictionary the row and shell read. The
 * shell itself is a placeholder container; UF views arrive in 5.x, and the
 * host half (ForgeBridge / session launch / FORGE_ACTOR passthrough) in 4.x.
 * Cross-boundary traffic happens exclusively through cordis services (slots,
 * locale) — no shell internals are imported, in either direction.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the renderer-owned slots service (ctx.slots) Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import {
  MAIN_SLOT, NS, PANEL_ID, SIDEBAR_ORDER, SIDEBAR_SLOT,
} from './contract'
import { WorkbenchPanelIcon } from './WorkbenchPanelIcon'
import { WorkbenchShell } from './WorkbenchShell'
import { en } from './locale/en'
import { zh } from './locale/zh'
import type { WorkbenchKey } from './locale/en'

export { MAIN_SLOT, NS, PANEL_ID, SIDEBAR_ORDER, SIDEBAR_SLOT } from './contract'
export { WorkbenchPanelIcon } from './WorkbenchPanelIcon'
export { WorkbenchShell } from './WorkbenchShell'
export type { WorkbenchPanelIconProps, WorkbenchShellProps } from './contract'
export { en } from './locale/en'
export { zh } from './locale/zh'
export type { WorkbenchKey } from './locale/en'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The forge-workbench shell's copy. */
    workbench: WorkbenchKey
  }
}

/** Required services: the renderer-owned slot registry and the locale face. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: registers the bilingual dictionary, then contributes the
 * workbench panel once the navigation slots are declared.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'forge-workbench: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject(MAIN_SLOT, () => ctx.slots.register({
    name: MAIN_SLOT,
    key: PANEL_ID,
    locale: NS,
  }, WorkbenchShell))
  ctx.slots.inject(SIDEBAR_SLOT, () => ctx.slots.register({
    name: SIDEBAR_SLOT,
    id: PANEL_ID,
    order: SIDEBAR_ORDER,
    label: () => t('panel'),
    locale: NS,
  }, WorkbenchPanelIcon))
}
