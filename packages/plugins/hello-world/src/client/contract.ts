/**
 * The hello-world entry's composed-props contract: the five shares the
 * framework delivers at the registration position (runtime share from the
 * consumed ui-chat slot, child-render share for the contributed sub-slot,
 * factory-render share, the store seat, and the locale `t` seat).
 */
import type {
  PropsLocale, PropsRenderFactories, PropsRenderSlots, PropsRuntime, PropsStore,
} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the consumed slot's children-table declaration and owner
// props (AssistantActionOwnerProps) into this program's SlotMap view.
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { HelloWorldStoreHandle } from './store'

/**
 * The consumed core slot: ui-chat's finalized-assistant action strip — an
 * additive list slot inside the existing chat message area (stable core slot
 * of the ui-chat package, minimal owner coupling: the durable message id).
 */
export const TARGET_SLOT = 'conversation.chat.assistant-actions'

/**
 * The contributed sub-slot: third parties register a component here to extend
 * the workspace panel area. Declared by this plugin's own registration
 * children table ('declaring is claiming').
 */
export const PANEL_SLOT = 'hello-world.panel'

/** Complete composed props of the hello-world panel entry. */
export type HelloWorldPanelProps =
  & PropsRuntime<typeof TARGET_SLOT>
  & PropsRenderSlots<typeof PANEL_SLOT>
  & PropsRenderFactories
  & PropsStore<HelloWorldStoreHandle>
  & PropsLocale<'helloworld'>
