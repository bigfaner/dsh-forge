// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkbenchPanelIcon } from '../src/client/WorkbenchPanelIcon.tsx'
import { WorkbenchShell, VIEW_MOUNT_TABLE, resolveViewMount } from '../src/client/WorkbenchShell.tsx'
import { MOCK_WORKBENCH_STATE } from '../src/client/mocks/workbench.ts'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import { zh } from '../src/client/locale/zh.ts'
import type { WorkbenchShellProps } from '../src/client/contract.ts'
import type { ViewKeySnapshot, WorkbenchTabKey } from '../src/client/store/view-key.ts'

// The upstream icons/dots resolve through the module table at runtime
// (browser bundle); the npm node entry carries undeclared transitive deps
// (clsx/shiki/katex/...) that only the upstream monorepo supplies, so the
// jsdom unit render stubs them. The real paths ride the e2e boot.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconBranchOutline16: () => null,
  StateDot: (props: { state: string }) => <span data-mock-state-dot={props.state} />,
}))

// Since 5.6 the tasks tab's DEFAULT view is the DAG — the real ReactFlow
// needs d3-zoom + ResizeObserver (absent in jsdom), so the shell renders
// that mount through the lib-boundary standin (real engine rides e2e).
vi.mock('@xyflow/react', async () => await import('./helpers/xyflow-standin'))

// Task 3.2 AC2 (the slot shell renders — placeholder + flow provider + `t`
// seat) extended by task 3.3: the view face drives the tab strip
// (role=tab/aria-selected, AC6) and the view-key → container mapping table
// (AC5); the panel-lifecycle notifications fire on mount/unmount.

type Dict = Record<WorkbenchKey, string>

/** Translate bound like the locale face does (t(key, params)). */
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]

const t = { en: bind(en), zh: bind(zh) }

/**
 * A controllable view face: `set` mutates the snapshot the selector reads,
 * `selectWorkbenchTab` / `openFeatureDetail` record the shell's actions (the
 * store side of the transitions lives in the controller specs).
 */
function makeFace(initial: Partial<ViewKeySnapshot> = {}): {
  props: Pick<WorkbenchShellProps, 'useViewKey' | 'selectWorkbenchTab' | 'openFeatureDetail'>
} {
  let snapshot: ViewKeySnapshot = {
    view: 'workbench',
    workbenchTab: 'workbench/overview',
    featureSlug: undefined,
    ...initial,
  }
  return {
    props: {
      useViewKey: (selector: (current: ViewKeySnapshot) => ViewKeySnapshot) => selector(snapshot),
      selectWorkbenchTab: (tab: WorkbenchTabKey) => {
        snapshot = { ...snapshot, workbenchTab: tab, featureSlug: undefined }
      },
      openFeatureDetail: (slug: string) => {
        snapshot = { ...snapshot, workbenchTab: 'workbench/features', featureSlug: slug }
      },
    },
  }
}

afterEach(() => cleanup())

describe('WorkbenchShell: the 3.2 container, view-key driven (AC5)', () => {
  it('renders the shell title, the tab strip, and the UF4 feature board on the features seat', async () => {
    // Tasks 5.3/5.5/5.9 filled all three seats (their own suites cover the
    // overview/tasks mounts) — the features tab now carries the UF4 page
    // (the 3.2 placeholder retired with it), over the shared mock registry's
    // ACTIVE project (no state gate).
    const face = makeFace({ workbenchTab: 'workbench/features' })
    render(<WorkbenchShell t={t.en as WorkbenchShellProps['t']} {...face.props} />)
    expect(screen.getByText(en['shell.title'])).toBeDefined()
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-feature-card="dsh-forge-m2"]')).not.toBeNull()
    })
    expect(document.querySelector('[data-dsh-forge-plugin="forge-workbench"]')).not.toBeNull()
    expect(document.querySelector('[data-dsh-forge-shell]')).not.toBeNull()
    expect(document.querySelector('[data-dsh-forge-tabs]')).not.toBeNull()
  })

  it('reads the locale seat — the same component renders zh copy (tabs included)', () => {
    const face = makeFace()
    render(<WorkbenchShell t={t.zh as WorkbenchShellProps['t']} {...face.props} />)
    expect(screen.getByText(zh['shell.title'])).toBeDefined()
    expect(screen.getByText(zh['tab.overview'])).toBeDefined()
    expect(screen.getByText(zh['tab.features'])).toBeDefined()
  })

  it('reserves every page-map view key in the mapping table (5.x mount points)', () => {
    expect(Object.keys(VIEW_MOUNT_TABLE)).toEqual([
      'workbench/overview',
      'workbench/tasks',
      'workbench/features',
      'workbench/features/:slug',
      'workbench/dialog/*',
    ])
    expect(resolveViewMount('workbench/overview', undefined)).toBe('dsh-forge-view-overview')
    expect(resolveViewMount('workbench/tasks', undefined)).toBe('dsh-forge-view-tasks')
    expect(resolveViewMount('workbench/features', undefined)).toBe('dsh-forge-view-features')
    expect(resolveViewMount('workbench/features', 'dsh-forge-m2')).toBe('dsh-forge-view-feature-detail')
  })

  it('mounts the container the active view key addresses — a tab switch swaps it', () => {
    const face = makeFace()
    const view = render(<WorkbenchShell t={t.en as WorkbenchShellProps['t']} {...face.props} />)
    expect(document.querySelector('[data-dsh-forge-view="dsh-forge-view-overview"]')).not.toBeNull()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map(tab => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
    // The tab action performs the machine transition (mutation here mirrors
    // the controller's), then the selector re-reads on rerender.
    ;(tabs[1] as HTMLButtonElement).click()
    view.rerender(<WorkbenchShell t={t.en as WorkbenchShellProps['t']} {...face.props} />)
    expect(document.querySelector('[data-dsh-forge-view="dsh-forge-view-tasks"]')).not.toBeNull()
    expect(document.querySelector('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeNull()
    expect(
      (document.querySelector('[data-dsh-forge-tab="workbench/tasks"]') as HTMLElement).getAttribute('aria-selected'),
    ).toBe('true')
  })

  it('the feature-detail subview addresses its own reserved container', () => {
    const face = makeFace({ workbenchTab: 'workbench/features', featureSlug: 'dsh-forge-m2' })
    render(<WorkbenchShell t={t.en as WorkbenchShellProps['t']} {...face.props} />)
    expect(document.querySelector('[data-dsh-forge-view="dsh-forge-view-feature-detail"]')).not.toBeNull()
  })
})

describe('WorkbenchShell: aria and lifecycle (AC6)', () => {
  it('exposes the tab strip with role=tablist and aria-selected per ui-design global rules', () => {
    const face = makeFace()
    render(<WorkbenchShell t={t.en as WorkbenchShellProps['t']} {...face.props} />)
    const list = document.querySelector('[data-dsh-forge-tabs]')
    expect(list?.getAttribute('role')).toBe('tablist')
    expect(list?.getAttribute('aria-label')).toBe(en['tabs.label'])
    const tasksTab = document.querySelector('[data-dsh-forge-tab="workbench/tasks"]') as HTMLButtonElement
    expect(tasksTab.getAttribute('role')).toBe('tab')
    expect(tasksTab.getAttribute('aria-selected')).toBe('false')
    expect(tasksTab.textContent).toBe(en['tab.tasks'])
  })

  it('fires notifyPresented on mount and notifyDismissed on unmount (external-selection sync)', () => {
    const notifyPresented = vi.fn()
    const notifyDismissed = vi.fn()
    const face = makeFace()
    const view = render(
      <WorkbenchShell
        t={t.en as WorkbenchShellProps['t']} {...face.props}
        notifyPresented={notifyPresented} notifyDismissed={notifyDismissed}
      />,
    )
    expect(notifyPresented).toHaveBeenCalledTimes(1)
    expect(notifyDismissed).not.toHaveBeenCalled()
    view.unmount()
    expect(notifyDismissed).toHaveBeenCalledTimes(1)
  })
})

describe('WorkbenchShell: project switch retires the feature-detail selection (6.4 SC5-2)', () => {
  it('an active-project change fires the tab action that clears the slug; same-project rerenders and slug-less switches never do', () => {
    const projects = MOCK_WORKBENCH_STATE.projects
    let snapshot: ViewKeySnapshot = { view: 'workbench', workbenchTab: 'workbench/features', featureSlug: 'demo-slug' }
    const selectWorkbenchTab = vi.fn()
    const props = {
      useViewKey: (selector: (current: ViewKeySnapshot) => ViewKeySnapshot) => selector(snapshot),
      selectWorkbenchTab,
      openFeatureDetail: (slug: string) => { snapshot = { ...snapshot, workbenchTab: 'workbench/features', featureSlug: slug } },
      workbenchState: { ...MOCK_WORKBENCH_STATE, activeProjectId: projects[0].id },
      activateProject: vi.fn(),
      addProject: vi.fn(),
    }
    const view = render(<WorkbenchShell t={t.en as WorkbenchShellProps['t']} {...props} />)
    // First resolution (undefined → id) arms the tracker; nothing to clear yet.
    expect(selectWorkbenchTab).not.toHaveBeenCalled()

    // Same project, different slug (a fresh detail open): NOT a switch.
    snapshot = { ...snapshot, featureSlug: 'another-slug' }
    view.rerender(<WorkbenchShell t={t.en as WorkbenchShellProps['t']} {...props} />)
    expect(selectWorkbenchTab).not.toHaveBeenCalled()

    // The switch: the machine's own slug-clearing transition (tab action)
    // fires with the CURRENT tab retained.
    view.rerender(
      <WorkbenchShell
        t={t.en as WorkbenchShellProps['t']} {...props}
        workbenchState={{ ...MOCK_WORKBENCH_STATE, activeProjectId: projects[1].id }}
      />,
    )
    expect(selectWorkbenchTab).toHaveBeenCalledTimes(1)
    expect(selectWorkbenchTab).toHaveBeenCalledWith('workbench/features')
  })
})

describe('WorkbenchPanelIcon: the sidebar glyph (3.2)', () => {
  it('renders without error at the size the sidebar requests (glyph stubbed, see mock note)', () => {
    const view = render(<WorkbenchPanelIcon size={16} />)
    expect(view.container).toBeDefined()
  })
})
