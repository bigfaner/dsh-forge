/**
 * hello-world demo plugin, browser half: one entry in the ui-chat
 * conversation.chat.assistant-actions strip demonstrating two-way extension —
 * consuming an existing stable core slot (ui-chat) while contributing an own
 * hello-world.panel sub-slot plus a store seat through the same register call.
 * Cross-plugin collaboration happens exclusively through cordis services
 * (slots, locale); the module table resolves the framework baseline.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the renderer-owned slots service (ctx.slots) Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { HelloWorldPanel } from './HelloWorldPanel'
import { TARGET_SLOT } from './contract'
import { en, zh, type HelloWorldKey } from './locales'
import { createHelloWorldStore } from './store'

export { HelloWorldPanel } from './HelloWorldPanel'
export { PANEL_SLOT, TARGET_SLOT } from './contract'
export type { HelloWorldPanelProps } from './contract'
export type { HelloWorldKey } from './locales'
export type { HelloWorldState, HelloWorldStoreHandle } from './store'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The hello-world panel's copy. */
    helloworld: HelloWorldKey
  }

  interface SlotMap {
    /**
     * hello-world's contributed sub-slot: third parties register a component
     * here to extend the workspace panel area. Single-kind: one occupant
     * renders; distinct priorities shadow, an exact-priority collision throws
     * loud (the SlotCore contract).
     */
    'hello-world.panel': { kind: 'single'; scope: 'session' }
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'helloworld'

/** Required services: the renderer-owned slot registry and the locale face. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: registers the bilingual dictionary, then contributes the
 * panel entry once the consumed core slot is declared.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'hello-world: dictionaries')
  ctx.slots.inject(TARGET_SLOT, () => ctx.slots.register({
    name: TARGET_SLOT,
    id: 'hello-world',
    order: 50,
    locale: NS,
    children: {
      'hello-world.panel': { kind: 'single', scope: 'session' },
    },
    store: createHelloWorldStore,
  }, HelloWorldPanel))
}
