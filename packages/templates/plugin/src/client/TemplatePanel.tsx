/**
 * The panel component: the visible half of the two postures. It consumes the
 * core slot's composed props, dispatches the store seat's action on click
 * (the bound selector hook re-renders — a live runtime link, not static
 * injection), and renders the contributed sub-slot with default content until
 * a third party registers into it.
 *
 * dsh UI reuse conventions (keep them): reuse the host's design tokens via
 * the `--dsh-*` CSS variables instead of hard-coded colors; prefer components
 * from `@deepseek-ai/dsh-client-ui-primitives` over building your own chrome
 * (see tsdown.config.ts for the module-table baseline — what you may require
 * without bundling); no stylesheet pipeline unless your host provides one.
 */
import type { TemplatePanelProps } from './contract'

/** Inline panel chrome: no stylesheet pipeline, the scaffold stays a small bundle. */
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
 * @param props - composed props: runtime share from the consumed slot, the
 * `t` seat, store seat, and the renderSlot share narrowed to the declared
 * `<your-plugin>.panel` child.
 */
export function TemplatePanel(props: TemplatePanelProps) {
  const clicks = props.useStore(state => state.clicks)
  return (
    <div data-dsh-forge-plugin="template-demo" style={panelStyle}>
      <span>{props.t('greet')}</span>
      <button type="button" onClick={() => props.actions.sayHello()}>
        {props.t('action')}
      </button>
      <span>{props.t('counter', { count: clicks })}</span>
      {props.renderSlot('template.panel', {}, { fallback: <em>{props.t('panelDefault')}</em> })}
    </div>
  )
}
