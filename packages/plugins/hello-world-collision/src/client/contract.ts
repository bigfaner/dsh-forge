/**
 * The collision-replica entry's composed-props contract: the five shares the
 * framework delivers at the registration position (runtime share from the
 * consumed ui-chat slot, child-render share for the mode's sub-slot,
 * factory-render share, the store seat, and the locale `t` seat).
 *
 * The child-render share is generic over the mode's child key: the panel
 * factory instantiates one component per key so each mode's registration
 * satisfies the `component key set ⊆ children declaration` phantom check.
 */
import type {
  PropsLocale, PropsRenderFactories, PropsRenderSlots, PropsRuntime, PropsStore,
} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the consumed slot's children-table declaration and owner
// props (AssistantActionOwnerProps) into this program's SlotMap view.
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { CollisionStoreHandle } from './store'
import type { OWN_PANEL_SLOT, SHARED_PANEL_SLOT } from './mode'

/**
 * The consumed core slot (identical to hello-world's target): ui-chat's
 * finalized-assistant action strip — an additive list slot inside the existing
 * chat message area.
 */
export const TARGET_SLOT = 'conversation.chat.assistant-actions'

/** The two child keys this fixture can declare (the replica target and its own). */
export type ChildSlotKey = typeof SHARED_PANEL_SLOT | typeof OWN_PANEL_SLOT

/** Complete composed props of the collision-replica panel entry for one child key. */
export type ReplicaPanelProps<K extends ChildSlotKey> =
  & PropsRuntime<typeof TARGET_SLOT>
  & PropsRenderSlots<K>
  & PropsRenderFactories
  & PropsStore<CollisionStoreHandle>
  & PropsLocale<'collision'>
