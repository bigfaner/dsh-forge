/**
 * The workbench main-panel shell (task 3.2 deliverable: the SHELL). It mounts
 * as the `main` slot's `workbench` key and currently renders a placeholder
 * container; the UF1–UF6 views (overview/wizard, task board, details,
 * feature board, launch entry, plugin management) land inside it in M2 5.x.
 *
 * The board area is already wrapped in @xyflow/react's ReactFlowProvider: the
 * shell establishes the flow context once, so 5.x task-board views consume
 * useReactFlow without mounting their own provider — and the dependency-tree
 * engine (D4) enters through this plugin's bundle, never the shell's.
 */
import { ReactFlowProvider } from '@xyflow/react'
import type { WorkbenchShellProps } from './contract'

/** Inline shell chrome: no stylesheet pipeline, host `--dsh-*` vars carry the theme. */
const shellStyle = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  padding: '16px',
  gap: '12px',
} as const

const placeholderStyle = {
  alignItems: 'center',
  border: '1px dashed var(--dsh-border-color, currentColor)',
  borderRadius: 8,
  display: 'flex',
  flex: 1,
  justifyContent: 'center',
} as const

/**
 * The registered main-panel component (placeholder until 5.x).
 * @param props - composed props: the main slot's runtime share + the `t` seat.
 */
export function WorkbenchShell(props: WorkbenchShellProps) {
  return (
    <div data-dsh-forge-plugin="forge-workbench" data-dsh-forge-shell="" style={shellStyle}>
      <h2>{props.t('shell.title')}</h2>
      <ReactFlowProvider>
        <div data-dsh-forge-board="" style={placeholderStyle}>
          <em>{props.t('shell.placeholder')}</em>
        </div>
      </ReactFlowProvider>
    </div>
  )
}
