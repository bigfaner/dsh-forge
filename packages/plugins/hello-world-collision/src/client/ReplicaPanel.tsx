/**
 * The collision-replica panel: visually and structurally the twin of
 * hello-world's panel (same click -> store action -> re-render loop, same
 * child-slot default content), marked with its own plugin identity so live UI
 * observation can tell the two registrants of the same slot area apart.
 *
 * Generic over the declared child key: each mode's registration needs the
 * component's render key set ⊆ its children declaration (the __renders
 * phantom), so one factory instantiates a narrowed component per key.
 */
import type { ReactNode } from 'react'
import type { ChildSlotKey, ReplicaPanelProps } from './contract'

/** Inline panel chrome: no stylesheet pipeline, the fixture stays a small bundle. */
const panelStyle = {
  alignItems: 'center',
  border: '1px dashed var(--dsh-border-color, currentColor)',
  display: 'inline-flex',
  gap: 8,
  padding: '4px 8px',
} as const

/**
 * Instantiate the replica panel component for one declared child key.
 * @param childKey - the child slot this instantiation renders (must be the
 * registration's declared key).
 * @returns the narrowed panel component.
 */
export function replicaPanelFor<K extends ChildSlotKey>(childKey: K) {
  function ReplicaPanel(props: ReplicaPanelProps<K>) {
    const hellos = props.useStore(state => state.hellos)
    // Generic-key call-site erasure: RenderSlotFn's conditional signature is
    // not callable through an unresolved K. The register call site already
    // proves childKey ⊆ the registration's children declaration statically.
    const renderChild = props.renderSlot as
      (key: K, owner: object, opts?: { fallback?: ReactNode }) => ReactNode
    return (
      <div data-dsh-forge-plugin="hello-world-collision" style={panelStyle}>
        <span>{props.t('greet')}</span>
        <button type="button" onClick={() => props.actions.sayHello()}>
          {props.t('increment')}
        </button>
        <span>{props.t('counter', { count: hellos })}</span>
        {renderChild(childKey, {}, { fallback: <em>{props.t('panelDefault')}</em> })}
      </div>
    )
  }
  return ReplicaPanel
}
