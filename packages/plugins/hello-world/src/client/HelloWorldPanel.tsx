/**
 * The hello-world panel entry: one assistant-actions row proving the two-way
 * extension loop. The click dispatches the store seat's action and the bound
 * selector hook re-renders — a live runtime link, not static injection — while
 * renderSlot renders the contributed sub-slot with default content until a
 * third party registers into it.
 */
import type { HelloWorldPanelProps } from './contract'

/** Inline panel chrome: no stylesheet pipeline, the demo stays a small bundle. */
const panelStyle = {
  alignItems: 'center',
  border: '1px solid var(--dsh-border-color, currentColor)',
  borderRadius: 6,
  display: 'inline-flex',
  gap: 8,
  padding: '4px 8px',
} as const

/**
 * The registered panel component (consumes the core slot, renders the sub-slot).
 * @param props - composed props: messageId owner share, `t` seat, store seat,
 * and the renderSlot share narrowed to the declared hello-world.panel child.
 */
export function HelloWorldPanel(props: HelloWorldPanelProps) {
  const hellos = props.useStore(state => state.hellos)
  return (
    <div data-dsh-forge-plugin="hello-world" style={panelStyle}>
      <span>{props.t('greet')}</span>
      <button type="button" onClick={() => props.actions.sayHello()}>
        {props.t('increment')}
      </button>
      <span>{props.t('counter', { count: hellos })}</span>
      {props.renderSlot('hello-world.panel', {}, { fallback: <em>{props.t('panelDefault')}</em> })}
    </div>
  )
}
