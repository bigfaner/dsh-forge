/**
 * The consume posture, distilled: name the core slot you inject into and let
 * the framework type the props it composes at the registration position —
 * runtime share from the consumed slot, child-render share for the
 * contributed sub-slot, factory-render share, the store seat, and the locale
 * `t` seat. Change TARGET_SLOT to another stable core slot and the prop types
 * follow; PANEL_SLOT is the key third parties will register into.
 */
import type {
  PropsLocale, PropsRenderFactories, PropsRenderSlots, PropsRuntime, PropsStore,
} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the consumed slot's children-table declaration and owner
// props into this program's SlotMap view. Keep this import for every slot you
// consume — without it the target slot is untyped.
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { TemplateStoreHandle } from './store'

/**
 * The consumed core slot: ui-chat's finalized-assistant action strip — an
 * additive list slot inside the existing chat message area (stable core slot
 * of the ui-chat package, minimal owner coupling: the durable message id).
 */
export const TARGET_SLOT = 'conversation.chat.assistant-actions'

/**
 * The contributed sub-slot: third parties register a component here to extend
 * your panel area. Declared by your own registration children table
 * ('declaring is claiming') — rename to `<your-plugin>.panel`.
 */
export const PANEL_SLOT = 'template.panel'

/** Complete composed props of the panel entry. */
export type TemplatePanelProps =
  & PropsRuntime<typeof TARGET_SLOT>
  & PropsRenderSlots<typeof PANEL_SLOT>
  & PropsRenderFactories
  & PropsStore<TemplateStoreHandle>
  & PropsLocale<'template'>
