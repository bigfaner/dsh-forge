// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectSwitcher } from '../src/client/components/chrome/ProjectSwitcher.tsx'
import { TabBar, TAB_LOCALE_KEYS } from '../src/client/components/chrome/TabBar.tsx'
import { TopBar } from '../src/client/components/chrome/TopBar.tsx'
import { WorkbenchShell } from '../src/client/WorkbenchShell.tsx'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import { zh } from '../src/client/locale/zh.ts'
import type { WorkbenchShellProps } from '../src/client/contract.ts'
import type { ViewKeySnapshot, WorkbenchTabKey } from '../src/client/store/view-key.ts'
import { WORKBENCH_TABS } from '../src/client/store/view-key.ts'
import { MOCK_EMPTY_WORKBENCH_STATE, MOCK_WORKBENCH_STATE } from '../src/client/mocks/workbench.ts'
import type { Project } from '../src/client/ipc-types.ts'

// The upstream StateDot (consumed by the tasks-seat board since task 5.5)
// resolves through the module table at runtime; the npm node entry carries
// undeclared transitive deps (clsx/shiki/...) that only the upstream
// monorepo supplies, so the jsdom unit render stubs it (the shell.spec
// precedent — the real dot path rides the e2e boot).
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  StateDot: (props: { state: string }) => <span data-mock-state-dot={props.state} />,
}))

// Since 5.6 the tasks tab's DEFAULT view is the DAG — the real ReactFlow
// needs d3-zoom + ResizeObserver (absent in jsdom), so the board mount in
// these shell renders goes through the lib-boundary standin (e2e rides real).
vi.mock('@xyflow/react', async () => await import('./helpers/xyflow-standin'))

// Task 5.1 AC6 — the page chrome units: tab strip (the view-key machine's tab
// dimension, keyboard activation), project switcher (Menu card, empty-state
// guidance, keyboard), top bar, and the shell-level state gate (page-map:
// no active project → tasks/features guide to registration, never error).

type Dict = Record<WorkbenchKey, string>

/** Translate bound like the locale face does. */
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]

const t = { en: bind(en), zh: bind(zh) }

const MOCK_PROJECTS = MOCK_WORKBENCH_STATE.projects as readonly Project[]

afterEach(() => cleanup())

describe('TabBar: the three-tab strip drives the view-key machine (AC1/AC4)', () => {
  it('renders the three page-map tabs in store order with locale labels and aria state', () => {
    const onSelect = vi.fn()
    render(<TabBar t={t.en} activeTab="workbench/tasks" onSelect={onSelect} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map(tab => tab.textContent)).toEqual([
      en['tab.overview'], en['tab.tasks'], en['tab.features'],
    ])
    expect(tabs.map(tab => tab.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
    expect(tabs.map(tab => tab.getAttribute('data-dsh-forge-tab'))).toEqual([...WORKBENCH_TABS])
    expect(tabs.map(tab => tab.tabIndex)).toEqual([-1, 0, -1])
  })

  it('routes every click through the machine action — including re-selecting the features tab (the :slug subview return)', () => {
    const onSelect = vi.fn()
    render(<TabBar t={t.en} activeTab="workbench/features" onSelect={onSelect} />)
    for (const tab of WORKBENCH_TABS) {
      fireEvent.click(document.querySelector(`[data-dsh-forge-tab="${tab}"]`) as HTMLButtonElement)
    }
    expect(onSelect).toHaveBeenCalledTimes(3)
    expect(onSelect).toHaveBeenNthCalledWith(1, 'workbench/overview')
    expect(onSelect).toHaveBeenNthCalledWith(2, 'workbench/tasks')
    // Re-selecting the features tab while the subview is open = the machine's
    // selectWorkbenchTab('workbench/features') → slug cleared → back to list.
    expect(onSelect).toHaveBeenNthCalledWith(3, 'workbench/features')
  })

  it('arrow keys select and focus with wrap-around; Home/End jump (WAI-ARIA tabs)', () => {
    const onSelect = vi.fn()
    render(<TabBar t={t.en} activeTab="workbench/overview" onSelect={onSelect} />)
    const list = document.querySelector('[data-dsh-forge-tabs]') as HTMLElement
    const tabs = screen.getAllByRole('tab')
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(onSelect).toHaveBeenCalledWith('workbench/tasks')
    expect(document.activeElement).toBe(tabs[1])
    fireEvent.keyDown(list, { key: 'ArrowLeft' })
    expect(onSelect).toHaveBeenCalledWith('workbench/features') // wrap: overview ← features
    fireEvent.keyDown(list, { key: 'End' })
    expect(onSelect).toHaveBeenLastCalledWith('workbench/features')
    fireEvent.keyDown(list, { key: 'Home' })
    expect(onSelect).toHaveBeenLastCalledWith('workbench/overview')
    // Non-navigation keys are inert.
    fireEvent.keyDown(list, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledTimes(4)
  })

  it('applies the brand focus ring on focus and injects no stylesheet (AC4)', () => {
    render(<TabBar t={t.en} activeTab="workbench/overview" onSelect={() => {}} />)
    const tab = screen.getByRole('tab', { selected: true }) as HTMLButtonElement
    expect(tab.style.outline).toBe('')
    act(() => { tab.focus() })
    expect(tab.style.outline).toContain('var(--dsw-alias-link')
    expect(document.querySelectorAll('style')).toHaveLength(0)
  })

  it('renders the zh dictionary through the same component (bilingual balance)', () => {
    render(<TabBar t={t.zh} activeTab="workbench/overview" onSelect={() => {}} />)
    expect(screen.getByText(zh['tab.features'])).toBeDefined()
  })
})

describe('ProjectSwitcher: the Menu-card dropdown (AC2/AC4)', () => {
  const harness = (projects: readonly Project[] = MOCK_PROJECTS, activeProjectId: string | null = MOCK_WORKBENCH_STATE.activeProjectId) => {
    const onActivate = vi.fn()
    const onAddProject = vi.fn()
    render(
      <ProjectSwitcher
        t={t.en} projects={projects} activeProjectId={activeProjectId}
        onActivate={onActivate} onAddProject={onAddProject}
      />,
    )
    return { onActivate, onAddProject }
  }

  const openMenu = (): HTMLElement => {
    fireEvent.click(document.querySelector('[data-dsh-forge-switcher-trigger]') as HTMLButtonElement)
    return document.querySelector('[data-dsh-forge-switcher-menu]') as HTMLElement
  }

  it('shows the active project on the trigger; the menu stays closed', () => {
    harness()
    const trigger = document.querySelector('[data-dsh-forge-switcher-trigger]') as HTMLButtonElement
    expect(trigger.textContent).toContain('dsh-forge')
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('[data-dsh-forge-switcher-menu]')).toBeNull()
  })

  it('opens on click: every project listed, the active one aria-checked with the ✓ mark', () => {
    harness()
    const menu = openMenu()
    expect(menu.getAttribute('role')).toBe('menu')
    const trigger = document.querySelector('[data-dsh-forge-switcher-trigger]') as HTMLButtonElement
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    const items = menu.querySelectorAll('[data-dsh-forge-switcher-item]')
    expect(items).toHaveLength(2)
    const first = items[0] as HTMLButtonElement
    expect(first.getAttribute('role')).toBe('menuitemradio')
    expect(first.getAttribute('aria-checked')).toBe('true')
    expect(first.textContent).toContain('✓')
    expect((items[1] as HTMLButtonElement).getAttribute('aria-checked')).toBe('false')
  })

  it('selecting a project activates it and closes the menu', () => {
    const { onActivate } = harness()
    const menu = openMenu()
    fireEvent.click(menu.querySelector('[data-dsh-forge-switcher-item="b2c93f57-1e6a-4d88-8f0c-2a9d4e7b1c53"]') as HTMLButtonElement)
    expect(onActivate).toHaveBeenCalledWith('b2c93f57-1e6a-4d88-8f0c-2a9d4e7b1c53')
    expect(document.querySelector('[data-dsh-forge-switcher-menu]')).toBeNull()
  })

  it('the bottom add entry fires the register action and closes', () => {
    const { onAddProject } = harness()
    const menu = openMenu()
    fireEvent.click(menu.querySelector('[data-dsh-forge-switcher-add]') as HTMLButtonElement)
    expect(onAddProject).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-dsh-forge-switcher-menu]')).toBeNull()
  })

  it('keyboard: arrows cycle items, Escape closes with focus returned to the trigger', () => {
    harness()
    fireEvent.keyDown(document.querySelector('[data-dsh-forge-switcher-trigger]') as HTMLButtonElement, { key: 'ArrowDown' })
    const menu = document.querySelector('[data-dsh-forge-switcher-menu]') as HTMLElement
    expect(menu).not.toBeNull()
    const items = Array.from(menu.querySelectorAll('button')) as HTMLButtonElement[]
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1])
    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(document.querySelector('[data-dsh-forge-switcher-menu]')).toBeNull()
    expect(document.activeElement).toBe(document.querySelector('[data-dsh-forge-switcher-trigger]'))
  })

  it('pointer-down outside closes the menu without activating anything', () => {
    const { onActivate } = harness()
    openMenu()
    act(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    expect(document.querySelector('[data-dsh-forge-switcher-menu]')).toBeNull()
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('clicking the trigger again toggles the menu closed; a Tab key-out closes without focus juggling', () => {
    harness()
    const trigger = document.querySelector('[data-dsh-forge-switcher-trigger]') as HTMLButtonElement
    fireEvent.click(trigger)
    const menu = document.querySelector('[data-dsh-forge-switcher-menu]') as HTMLElement
    expect(menu).not.toBeNull()
    fireEvent.click(trigger)
    expect(document.querySelector('[data-dsh-forge-switcher-menu]')).toBeNull()
    // Tab-out: the menu closes, focus simply leaves (no return-to-trigger).
    fireEvent.click(trigger)
    const openMenu = document.querySelector('[data-dsh-forge-switcher-menu]') as HTMLElement
    fireEvent.keyDown(openMenu, { key: 'Tab' })
    expect(document.querySelector('[data-dsh-forge-switcher-menu]')).toBeNull()
  })

  it('empty registry: placeholder trigger label, guidance hint, and only the add entry (空态引导至注册)', () => {
    harness([], null)
    const trigger = document.querySelector('[data-dsh-forge-switcher-trigger]') as HTMLButtonElement
    expect(trigger.textContent).toContain(en['switcher.empty'])
    fireEvent.click(trigger)
    const menu = document.querySelector('[data-dsh-forge-switcher-menu]') as HTMLElement
    expect(menu.textContent).toContain(en['switcher.emptyHint'])
    expect(menu.querySelectorAll('[data-dsh-forge-switcher-item]')).toHaveLength(0)
    expect(menu.querySelector('[data-dsh-forge-switcher-add]')).not.toBeNull()
  })
})

describe('TopBar: identity + switcher + persistent add action (AC2)', () => {
  it('renders the app identity and the add button, which fires the register action', () => {
    const onActivate = vi.fn()
    const onAddProject = vi.fn()
    render(
      <TopBar
        t={t.en} projects={MOCK_PROJECTS} activeProjectId={MOCK_WORKBENCH_STATE.activeProjectId}
        onActivate={onActivate} onAddProject={onAddProject}
      />,
    )
    expect(document.querySelector('[data-dsh-forge-topbar]')).not.toBeNull()
    expect(screen.getByText(en['shell.title'])).toBeDefined()
    fireEvent.click(document.querySelector('[data-dsh-forge-add-project]') as HTMLButtonElement)
    expect(onAddProject).toHaveBeenCalledTimes(1)
  })
})

describe('WorkbenchShell: the state gate + chrome integration (AC3/AC5)', () => {
  /** A controllable view face (the shell.spec pattern). */
  function makeFace(initial: Partial<ViewKeySnapshot> = {}): {
    props: Pick<WorkbenchShellProps, 'useViewKey' | 'selectWorkbenchTab' | 'openFeatureDetail'>
    selectWorkbenchTab: ReturnType<typeof vi.fn>
  } {
    let snapshot: ViewKeySnapshot = {
      view: 'workbench',
      workbenchTab: 'workbench/overview',
      featureSlug: undefined,
      ...initial,
    }
    const selectWorkbenchTab = vi.fn((tab: WorkbenchTabKey) => {
      snapshot = { ...snapshot, workbenchTab: tab, featureSlug: undefined }
    })
    return {
      props: {
        useViewKey: (selector: (current: ViewKeySnapshot) => ViewKeySnapshot) => selector(snapshot),
        selectWorkbenchTab,
        openFeatureDetail: (slug: string) => {
          snapshot = { ...snapshot, workbenchTab: 'workbench/features', featureSlug: slug }
        },
      },
      selectWorkbenchTab,
    }
  }

  it('defaults to the shared mock: populated registry keeps every mount container addressable', () => {
    const face = makeFace({ workbenchTab: 'workbench/tasks' })
    render(<WorkbenchShell t={t.en as WorkbenchShellProps['t']} {...face.props} />)
    expect(document.querySelector('[data-dsh-forge-view="dsh-forge-view-tasks"]')).not.toBeNull()
    expect(document.querySelector('[data-dsh-forge-gate]')).toBeNull()
  })

  it('no active project: the tasks tab presents the guidance card, not an error, and withholds the mount container', () => {
    const face = makeFace({ workbenchTab: 'workbench/tasks' })
    render(
      <WorkbenchShell
        t={t.en as WorkbenchShellProps['t']} {...face.props}
        workbenchState={MOCK_EMPTY_WORKBENCH_STATE}
      />,
    )
    const gate = document.querySelector('[data-dsh-forge-gate]')
    expect(gate).not.toBeNull()
    expect(gate?.textContent).toContain(en['gate.title'])
    expect(gate?.textContent).toContain(en['gate.body'])
    expect(document.querySelector('[data-dsh-forge-view="dsh-forge-view-tasks"]')).toBeNull()
    // 引导态 not 报错: no alert role anywhere in the gate.
    expect(gate?.querySelector('[role="alert"]')).toBeNull()
  })

  it('the feature tab and its :slug subview gate the same way; the overview tab keeps its container', () => {
    const featuresFace = makeFace({ workbenchTab: 'workbench/features', featureSlug: 'dsh-forge-m2' })
    const features = render(
      <WorkbenchShell
        t={t.en as WorkbenchShellProps['t']} {...featuresFace.props}
        workbenchState={MOCK_EMPTY_WORKBENCH_STATE}
      />,
    )
    expect(document.querySelector('[data-dsh-forge-gate]')).not.toBeNull()
    expect(document.querySelector('[data-dsh-forge-view="dsh-forge-feature-detail"]')).toBeNull()
    features.unmount()

    const overviewFace = makeFace({ workbenchTab: 'workbench/overview' })
    render(
      <WorkbenchShell
        t={t.en as WorkbenchShellProps['t']} {...overviewFace.props}
        workbenchState={MOCK_EMPTY_WORKBENCH_STATE}
      />,
    )
    // The overview page owns its own empty state (UF1/5.3): its mount seat stays reserved.
    expect(document.querySelector('[data-dsh-forge-view="dsh-forge-view-overview"]')).not.toBeNull()
    expect(document.querySelector('[data-dsh-forge-gate]')).toBeNull()
  })

  it('the gate CTA and the top-bar add button both fire the register action (the 5.4 seam)', () => {
    const addProject = vi.fn()
    const face = makeFace({ workbenchTab: 'workbench/tasks' })
    render(
      <WorkbenchShell
        t={t.en as WorkbenchShellProps['t']} {...face.props}
        workbenchState={MOCK_EMPTY_WORKBENCH_STATE} addProject={addProject}
      />,
    )
    fireEvent.click(document.querySelector('[data-dsh-forge-gate-register]') as HTMLButtonElement)
    fireEvent.click(document.querySelector('[data-dsh-forge-add-project]') as HTMLButtonElement)
    expect(addProject).toHaveBeenCalledTimes(2)
  })

  it('the switcher drives the local activation stub: the trigger follows the selection', () => {
    const face = makeFace()
    const view = render(<WorkbenchShell t={t.en as WorkbenchShellProps['t']} {...face.props} />)
    fireEvent.click(document.querySelector('[data-dsh-forge-switcher-trigger]') as HTMLButtonElement)
    const menu = document.querySelector('[data-dsh-forge-switcher-menu]') as HTMLElement
    fireEvent.click(menu.querySelector('[data-dsh-forge-switcher-item="b2c93f57-1e6a-4d88-8f0c-2a9d4e7b1c53"]') as HTMLButtonElement)
    view.rerender(<WorkbenchShell t={t.en as WorkbenchShellProps['t']} {...face.props} />)
    const trigger = document.querySelector('[data-dsh-forge-switcher-trigger]') as HTMLButtonElement
    expect(trigger.textContent).toContain('electron-course')
  })

  it('an assembly-provided activateProject replaces the local stub untouched', () => {
    const activateProject = vi.fn()
    const face = makeFace()
    render(
      <WorkbenchShell
        t={t.en as WorkbenchShellProps['t']} {...face.props} activateProject={activateProject}
      />,
    )
    fireEvent.click(document.querySelector('[data-dsh-forge-switcher-trigger]') as HTMLButtonElement)
    const menu = document.querySelector('[data-dsh-forge-switcher-menu]') as HTMLElement
    fireEvent.click(menu.querySelector('[data-dsh-forge-switcher-item="b2c93f57-1e6a-4d88-8f0c-2a9d4e7b1c53"]') as HTMLButtonElement)
    expect(activateProject).toHaveBeenCalledWith('b2c93f57-1e6a-4d88-8f0c-2a9d4e7b1c53')
  })
})

describe('mocks/workbench: the shared 5.x build fixture', () => {
  it('populated variant satisfies the single-activation invariant', () => {
    const ids = MOCK_WORKBENCH_STATE.projects.map(project => project.id)
    expect(MOCK_WORKBENCH_STATE.projects.length).toBeGreaterThanOrEqual(2)
    expect(ids).toContain(MOCK_WORKBENCH_STATE.activeProjectId)
    expect(new Set(MOCK_WORKBENCH_STATE.projects.map(project => project.codeRoot)).size)
      .toBe(MOCK_WORKBENCH_STATE.projects.length)
  })

  it('empty variant is the state-gate fixture (no projects, null pointer)', () => {
    expect(MOCK_EMPTY_WORKBENCH_STATE.projects).toHaveLength(0)
    expect(MOCK_EMPTY_WORKBENCH_STATE.activeProjectId).toBeNull()
  })
})
