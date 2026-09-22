/**
 * dsh client plugin template, browser half: one entry in the ui-chat
 * conversation.chat.assistant-actions strip demonstrating two-way extension —
 * consuming an existing stable core slot (ui-chat) while contributing an own
 * sub-slot plus a store seat through the same register call. Cross-plugin
 * collaboration happens exclusively through cordis services (slots, locale);
 * the module table resolves the framework baseline.
 *
 * Rename map (search-and-replace when starting from this template):
 *   'template.panel'   -> '<your-plugin>.panel'   (contract.ts + here + panel)
 *   'template'         -> '<your-namespace>'      (locale namespace)
 *   'template-demo'    -> '<your-entry-id>'       (slot cell id, see collision notes in README)
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the renderer-owned slots service (ctx.slots) Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { TemplatePanel } from './TemplatePanel'
import { TARGET_SLOT } from './contract'
import { en, zh, type TemplateKey } from './locales'
import { createTemplateStore } from './store'

export { TemplatePanel } from './TemplatePanel'
export { PANEL_SLOT, TARGET_SLOT } from './contract'
export type { TemplatePanelProps } from './contract'
export type { TemplateKey } from './locales'
export type { TemplateState, TemplateStoreHandle } from './store'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The template plugin's copy. */
    template: TemplateKey
  }

  interface SlotMap {
    /**
     * The template's contributed sub-slot: third parties register a component
     * here to extend the panel area. Single-kind: one occupant renders;
     * distinct priorities shadow, an exact-priority collision throws loud
     * (the SlotCore contract).
     */
    'template.panel': { kind: 'single'; scope: 'session' }
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'template'

/** Required services: the renderer-owned slot registry and the locale face. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: registers the bilingual dictionary, then contributes the
 * panel entry once the consumed core slot is declared.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'template: dictionaries')
  ctx.slots.inject(TARGET_SLOT, () => ctx.slots.register({
    name: TARGET_SLOT,
    id: 'template-demo',
    order: 50,
    locale: NS,
    children: {
      'template.panel': { kind: 'single', scope: 'session' },
    },
    store: createTemplateStore,
  }, TemplatePanel))
}
