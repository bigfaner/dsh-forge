/**
 * The workbench main-panel shell (task 3.2 scaffold, view-key driven since
 * task 3.3). It mounts as the `main` slot's `workbench` key — in the slot
 * path chosen by the upstream sidebar, in the fallback rail rendered inside
 * the plugin-owned overlay container — the SAME component either way, so the
 * two forms cannot diverge (Hard Rule).
 *
 * Task 3.3 adds the dual-view face: the view-key selector drives the tab
 * strip (概览/任务/feature, role=tab + aria-selected per ui-design) and the
 * view-key → container mapping table below; the mount/lifecycle notifications
 * report external panel selection back to the shared controller. The UF1–UF6
 * views land inside the reserved mount containers in M2 5.x.
 *
 * The board area stays wrapped in @xyflow/react's ReactFlowProvider: the
 * shell establishes the flow context once, so 5.x task-board views consume
 * useReactFlow without mounting their own provider — and the dependency-tree
 * engine (D4) enters through this plugin's bundle, never the shell's.
 */
import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import type { WorkbenchShellProps } from './contract'
import type { WorkbenchKey } from './locale/en'
import { WORKBENCH_DIALOG_PREFIX, WORKBENCH_TABS, type WorkbenchTabKey } from './store/view-key'

/**
 * view-key → container mapping table (task 3.3 AC5): every workbench view key
 * the page-map defines reserves its mount container here. M2 5.x lands the UF
 * views INTO these seats — the reservation is the contract, no shell change
 * will be needed then. `:slug` is the feature-detail subview
 * (`workbench/features/<slug>`), `workbench/dialog/*` the 5.x overlay family.
 */
export const VIEW_MOUNT_TABLE = {
  'workbench/overview': { container: 'dsh-forge-view-overview' },
  'workbench/tasks': { container: 'dsh-forge-view-tasks' },
  'workbench/features': { container: 'dsh-forge-view-features' },
  'workbench/features/:slug': { container: 'dsh-forge-view-feature-detail' },
  [`${WORKBENCH_DIALOG_PREFIX}*`]: { container: 'dsh-forge-dialog-layer' },
} as const

/**
 * Resolve the active mount container for a snapshot's workbench interior.
 * @param tab - the active workbench tab.
 * @param featureSlug - the feature-detail slug, when the subview is open.
 * @returns the mount container id from {@link VIEW_MOUNT_TABLE}.
 */
export function resolveViewMount(
  tab: WorkbenchTabKey,
  featureSlug: string | undefined,
): string {
  if (tab === 'workbench/features' && featureSlug !== undefined) {
    return VIEW_MOUNT_TABLE['workbench/features/:slug'].container
  }
  return VIEW_MOUNT_TABLE[tab].container
}

/** Inline shell chrome: no stylesheet pipeline, host `--dsh-*` vars carry the theme (scoped styles only — Hard Rule). */
const shellStyle = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  padding: '16px',
  gap: '12px',
} as const

const tabsStyle = {
  display: 'flex',
  gap: '4px',
} as const

const tabStyle = {
  background: 'transparent',
  border: 'none',
  borderRadius: '14px',
  color: 'inherit',
  cursor: 'pointer',
  font: 'inherit',
  padding: '8px 14px',
} as const

const activeTabStyle = {
  ...tabStyle,
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
} as const

const contentStyle = {
  display: 'flex',
  flex: 1,
  flexDirection: 'column',
  minHeight: 0,
} as const

const placeholderStyle = {
  alignItems: 'center',
  border: '1px dashed var(--dsh-border-color, currentColor)',
  borderRadius: 8,
  display: 'flex',
  flex: 1,
  justifyContent: 'center',
} as const

/** The tab-strip rows: locale key + view key, in WORKBENCH_TABS order. */
const TAB_LOCALE_KEYS: Record<WorkbenchTabKey, WorkbenchKey> = {
  'workbench/overview': 'tab.overview',
  'workbench/tasks': 'tab.tasks',
  'workbench/features': 'tab.features',
}

/**
 * The registered main-panel component: tab strip + the active view's reserved
 * mount container (the 3.2 placeholder until 5.x).
 * @param props - composed props: the main slot's runtime share, the `t` seat,
 *   and the view face (selector + tab action + panel lifecycle).
 */
export function WorkbenchShell(props: WorkbenchShellProps) {
  const view = props.useViewKey(snapshot => snapshot)
  // External-selection sync (slot path): mounting means an actor selected the
  // workbench panel, unmounting means it left. Stable callbacks — run once.
  useEffect(() => {
    props.notifyPresented?.()
    return () => { props.notifyDismissed?.() }
  }, [])
  return (
    <div data-dsh-forge-plugin="forge-workbench" data-dsh-forge-shell="" style={shellStyle}>
      <h2>{props.t('shell.title')}</h2>
      <div role="tablist" aria-label={props.t('tabs.label')} data-dsh-forge-tabs="" style={tabsStyle}>
        {WORKBENCH_TABS.map(tab => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={view.workbenchTab === tab ? 'true' : 'false'}
            data-dsh-forge-tab={tab}
            style={view.workbenchTab === tab ? activeTabStyle : tabStyle}
            onClick={() => { props.selectWorkbenchTab(tab) }}
          >
            {props.t(TAB_LOCALE_KEYS[tab])}
          </button>
        ))}
      </div>
      <ReactFlowProvider>
        <div data-dsh-forge-content="" style={contentStyle}>
          <div data-dsh-forge-view={resolveViewMount(view.workbenchTab, view.featureSlug)} style={placeholderStyle}>
            <em>{props.t('shell.placeholder')}</em>
          </div>
        </div>
      </ReactFlowProvider>
    </div>
  )
}
