// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OverviewPage } from '../src/client/views/overview/OverviewPage.tsx'
import { WorkbenchShell } from '../src/client/WorkbenchShell.tsx'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import { zh } from '../src/client/locale/zh.ts'
import {
  MOCK_EMPTY_WORKBENCH_STATE, MOCK_PLUGIN_ROWS, MOCK_WORKBENCH_STATE,
  createMockOverviewFace, createMockPluginFace,
} from '../src/client/mocks/workbench.ts'
import type { WorkbenchShellProps } from '../src/client/contract.ts'
import type { PluginRow, Project, WorkbenchState } from '../src/client/ipc-types.ts'
import type { ViewKeySnapshot, WorkbenchTabKey } from '../src/client/store/view-key.ts'

// Task 5.13 — the UF6 integration units: the 5.12 plugin section wired into
// the real overview page composition (existing-page 挂载, composition layer
// only — the Hard Rule keeps every 5.3 component's internals untouched).
// AC map:
//   AC1 the section sits below the project grid at the page's shared
//      14px-gap full-width column (r14 区块卡, both themes via the 5.12
//      alias styles — no new styles at the composition layer)
//   AC2 the section never hides with the empty 空态 (无项目时仍可见可用 —
//      plugin management is unrelated to project registration)
//   AC3 listPlugins drives the in-page rows (the seat's face threads shell →
//      page → section); the 禁用→启用 round trip really goes through the
//      face verbs (the mock twin carries the REAL 3.1 ERR_PLUGIN_MANDATORY
//      guard semantics — 5.14 swaps the same seam to the IPC verbs)
//   AC4 layout/composition regression — the project side (meta/grid/empty
//      card/向导入口) is unbroken and the section keeps its state across the
//      empty ⇄ populated transitions (section-local error containment)
//
// The page's own loading/load-error branches stay page-level here (5.14 owns
// the unified branch orchestration in the OverviewView assembly).

type Dict = Record<WorkbenchKey, string>
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]
const t = { en: bind(en), zh: bind(zh) }

const ACTIVE_ID = '6f1a2d3e-8b44-4c9a-9d01-3c7f5a2b9e10'
const ACTIVE_PROJECT = MOCK_WORKBENCH_STATE.projects[0] as Project
/** The third-party fixture row (the togglable one — the mock twin's real-guard target list is mandatory-only). */
const HELLO = MOCK_PLUGIN_ROWS.find(row => row.name === '@dsh-forge/plugin-hello-world') as PluginRow
const MANDATORY_ROWS = MOCK_PLUGIN_ROWS.filter(row => row.mandatory)

/**
 * A spied section face over the real mock twin (the mandatory guard rejects
 * ERR_PLUGIN_MANDATORY for real; `.base` exposes the twin's failure pokes).
 */
function makePluginFace(initial: readonly PluginRow[] = MOCK_PLUGIN_ROWS) {
  const base = createMockPluginFace(initial)
  const face = {
    listPlugins: vi.fn(base.listPlugins),
    setPluginEnabled: vi.fn(base.setPluginEnabled),
  }
  return Object.assign(face, { base })
}

/** A spied page face over the real mock twin (Interface 1 transaction semantics kept). */
function makeOverviewFace(initial: WorkbenchState = MOCK_WORKBENCH_STATE) {
  const base = createMockOverviewFace(initial)
  return {
    loadState: vi.fn(base.loadState),
    activateProject: vi.fn(base.activateProject),
    updateProject: vi.fn(base.updateProject),
    removeProject: vi.fn(base.removeProject),
  }
}

/** Render the page with explicit faces and settle both initial loads. */
async function renderOverview(options: {
  state?: WorkbenchState
  pluginFace?: ReturnType<typeof makePluginFace>
} = {}) {
  const face = makeOverviewFace(options.state)
  const pluginFace = options.pluginFace ?? makePluginFace()
  render(<OverviewPage t={t.en} face={face} pluginFace={pluginFace} />)
  await waitFor(() => {
    // The section mounts with the page's ready phase, but its OWN list runs
    // from that mount — settle to rows or the section-local error card, so
    // row interactions never race the section's initial load.
    const settled = document.querySelector('[data-dsh-forge-plugin-row], [data-dsh-forge-plugins-error]')
    expect(settled).not.toBeNull()
  })
  return { face, pluginFace }
}

const rowOf = (name: string): HTMLElement =>
  document.querySelector(`[data-dsh-forge-plugin-row="${name}"]`) as HTMLElement

/** Open + confirm the plugin disable double-confirm for one row. */
function confirmDisable(name: string): void {
  fireEvent.click(rowOf(name).querySelector('[data-dsh-forge-plugin-action="disable"]') as HTMLElement)
  fireEvent.click(document.querySelector('[data-dsh-forge-plugin-confirm]') as HTMLElement)
}

// The upstream StateDot resolves through the module table at runtime; the npm
// node entry carries undeclared transitive deps that only the upstream
// monorepo supplies, so the jsdom unit render stubs it (the overview.spec
// precedent).
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  StateDot: (props: { state: string }) => <span data-mock-state-dot={props.state} />,
}))

afterEach(() => cleanup())

// ---------------------------------------------------------------------------
// AC1: the placement contract (grid 之下 · the page's shared full-width column)
// ---------------------------------------------------------------------------

describe('integration: placement below the project content (AC1)', () => {
  it('populated: meta → grid → section in page child order; the section is a direct child of the 14px-gap page column', async () => {
    await renderOverview()
    const page = document.querySelector('[data-dsh-forge-overview]') as HTMLElement
    const meta = document.querySelector('[data-dsh-forge-overview-meta]') as HTMLElement
    const grid = document.querySelector('[data-dsh-forge-project-grid]') as HTMLElement
    const section = document.querySelector('[data-dsh-forge-plugins-section]') as HTMLElement
    const order = Array.from(page.children)
    // The page-map section order, with the 区块卡 as a direct child — so it
    // spans the page's full width and rides its 14px gap (ui-design).
    expect(order.indexOf(meta)).toBeGreaterThanOrEqual(0)
    expect(order.indexOf(grid)).toBeGreaterThan(order.indexOf(meta))
    expect(order.indexOf(section)).toBeGreaterThan(order.indexOf(grid))
    expect(section.parentElement).toBe(page)
    expect(page.style.gap).toBe('14px')
  })
})

// ---------------------------------------------------------------------------
// AC2: the section never hides with the empty 空态
// ---------------------------------------------------------------------------

describe('integration: empty-state visibility (AC2)', () => {
  it('no projects: the 空态卡 (register CTA intact) AND the section render, section below the card', async () => {
    await renderOverview({ state: MOCK_EMPTY_WORKBENCH_STATE })
    const empty = document.querySelector('[data-dsh-forge-overview-empty]') as HTMLElement
    expect(empty).not.toBeNull()
    expect(empty.querySelector('[data-dsh-forge-overview-register]')).not.toBeNull()
    const section = document.querySelector('[data-dsh-forge-plugins-section]') as HTMLElement
    expect(section).not.toBeNull()
    expect(section.textContent).toContain(en['overview.plugins.title'])
    const page = document.querySelector('[data-dsh-forge-overview]') as HTMLElement
    const order = Array.from(page.children)
    expect(order.indexOf(section)).toBeGreaterThan(order.indexOf(empty))
  })

  it('bilingual balance: the zh dictionary flows through the in-page section in the empty branch', async () => {
    const face = makeOverviewFace(MOCK_EMPTY_WORKBENCH_STATE)
    render(<OverviewPage t={t.zh} face={face} />)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-plugins-section]')).not.toBeNull()
    })
    expect(document.querySelector('[data-dsh-forge-plugins-section]')?.textContent)
      .toContain(zh['overview.plugins.title'])
    expect(document.querySelector('[data-dsh-forge-overview-empty]')?.textContent)
      .toContain(zh['overview.empty.title'])
  })
})

// ---------------------------------------------------------------------------
// AC3: real data through the seam + the 禁用→启用 round trip (the real guard)
// ---------------------------------------------------------------------------

describe('integration: list + toggle round trip in-page (AC3)', () => {
  it('empty state: the third-party 禁用→启用 round trip works — exact verb shapes, resolved rows drive the row state', async () => {
    const { pluginFace } = await renderOverview({ state: MOCK_EMPTY_WORKBENCH_STATE })
    expect(pluginFace.listPlugins).toHaveBeenCalledTimes(1)

    // Disable: the double-confirm fires setPluginEnabled(name, false) and the
    // resolved rows migrate the row (pending-then-refresh, 5.12 semantics).
    confirmDisable(HELLO.name)
    await waitFor(() => {
      expect(pluginFace.setPluginEnabled).toHaveBeenCalledWith(HELLO.name, false)
    })
    await waitFor(() => {
      expect(rowOf(HELLO.name).getAttribute('data-enabled')).toBe('false')
    })

    // Enable: the direct verb completes the round trip.
    fireEvent.click(rowOf(HELLO.name).querySelector('[data-dsh-forge-plugin-action="enable"]') as HTMLElement)
    await waitFor(() => {
      expect(pluginFace.setPluginEnabled).toHaveBeenLastCalledWith(HELLO.name, true)
    })
    await waitFor(() => {
      expect(rowOf(HELLO.name).getAttribute('data-enabled')).toBe('true')
    })
  })

  it('populated: the same round trip beside the grid, and mandatory rows stay structurally controlless (SC6-1 kept at page level)', async () => {
    const { pluginFace } = await renderOverview()
    // The project side renders beside the section (layout coexistence).
    expect(document.querySelectorAll('[data-dsh-forge-project-card]')).toHaveLength(2)
    confirmDisable(HELLO.name)
    await waitFor(() => {
      expect(rowOf(HELLO.name).getAttribute('data-enabled')).toBe('false')
    })
    fireEvent.click(rowOf(HELLO.name).querySelector('[data-dsh-forge-plugin-action="enable"]') as HTMLElement)
    await waitFor(() => {
      expect(rowOf(HELLO.name).getAttribute('data-enabled')).toBe('true')
    })
    expect(pluginFace.setPluginEnabled).toHaveBeenCalledTimes(2)

    // The render guard rides along into the page: mandatory rows expose ZERO
    // writable controls — the UI can never even attempt a guarded disable.
    for (const row of MANDATORY_ROWS) {
      const cell = rowOf(row.name)
      const writable = cell.querySelectorAll(
        'button, input, select, textarea, [role="switch"], [role="checkbox"], [href]',
      )
      expect(writable.length).toBe(0)
    }
  })

  it('the shell overview seat threads its pluginFace into the in-page section (real data source, not the default twin)', async () => {
    let snapshot: ViewKeySnapshot = { view: 'workbench', workbenchTab: 'workbench/overview', featureSlug: undefined }
    const viewProps = {
      useViewKey: (selector: (current: ViewKeySnapshot) => ViewKeySnapshot) => selector(snapshot),
      selectWorkbenchTab: vi.fn((tab: WorkbenchTabKey) => {
        snapshot = { ...snapshot, workbenchTab: tab, featureSlug: undefined }
      }),
      openFeatureDetail: (slug: string) => {
        snapshot = { ...snapshot, workbenchTab: 'workbench/features', featureSlug: slug }
      },
    } satisfies Pick<WorkbenchShellProps, 'useViewKey' | 'selectWorkbenchTab' | 'openFeatureDetail'>
    // A mandatory-only roster — the default twin would render 4 rows.
    const seatFace = makePluginFace(MOCK_PLUGIN_ROWS.filter(row => row.mandatory))
    render(
      <WorkbenchShell
        t={t.en as WorkbenchShellProps['t']} {...viewProps}
        overview={{ pluginFace: seatFace }}
      />,
    )
    await waitFor(() => {
      expect(document.querySelectorAll('[data-dsh-forge-plugin-row]')).toHaveLength(3)
    })
    expect(rowOf(HELLO.name)).toBeNull()
    expect(document.querySelector('[data-dsh-forge-plugins-empty-third-party]')?.textContent)
      .toBe(en['overview.plugins.emptyThirdParty'])
  })
})

// ---------------------------------------------------------------------------
// AC4: layout/composition regression — containment + transition stability
// ---------------------------------------------------------------------------

describe('integration: error containment + empty ⇄ populated stability (AC4)', () => {
  it('a section list failure is contained: the section-local error card renders, the project side (meta + grid) stays intact', async () => {
    const pluginFace = makePluginFace()
    pluginFace.base.failListWith({ code: 'ERR_WORKBENCH_DB', message: 'integrate: list boom' })
    const { face } = await renderOverview({ pluginFace })
    const errorCard = await waitFor(() => {
      const card = document.querySelector('[data-dsh-forge-plugins-error]') as HTMLElement
      expect(card).not.toBeNull()
      return card
    })
    expect(errorCard.getAttribute('role')).toBe('alert')
    // The project side is untouched by the section's failure (and vice versa:
    // no section rows, but the grid keeps its cards + meta row).
    expect(document.querySelectorAll('[data-dsh-forge-project-card]')).toHaveLength(2)
    expect(document.querySelector('[data-dsh-forge-overview-meta]')).not.toBeNull()
    expect(face.loadState).toHaveBeenCalledTimes(1)

    // The section-local retry recovers without touching the page face.
    pluginFace.listPlugins.mockClear()
    fireEvent.click(document.querySelector('[data-dsh-forge-plugins-retry]') as HTMLElement)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-plugin-row]')).not.toBeNull()
    })
    expect(pluginFace.listPlugins).toHaveBeenCalledTimes(1)
    expect(face.loadState).toHaveBeenCalledTimes(1)
  })

  it('removing the last project (populated → empty) keeps the section mounted without a re-list; the register CTA returns', async () => {
    const single: WorkbenchState = {
      projects: [ACTIVE_PROJECT],
      activeProjectId: ACTIVE_ID,
      plugins: [],
    }
    const { pluginFace } = await renderOverview({ state: single })
    expect(pluginFace.listPlugins).toHaveBeenCalledTimes(1)

    fireEvent.click(document.querySelector(
      `[data-dsh-forge-project-card="${ACTIVE_ID}"] [data-dsh-forge-card-action="remove"]`,
    ) as HTMLButtonElement)
    fireEvent.click(document.querySelector('[data-dsh-forge-remove-confirm]') as HTMLButtonElement)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-overview-empty]')).not.toBeNull()
    })
    // The 向导入口 is back (the empty card's register CTA) and the section
    // rode the transition at its stable slot — same instance, no re-list.
    expect(document.querySelector('[data-dsh-forge-overview-register]')).not.toBeNull()
    const section = document.querySelector('[data-dsh-forge-plugins-section]') as HTMLElement
    expect(section).not.toBeNull()
    expect(section.querySelectorAll('[data-dsh-forge-plugin-row]').length).toBeGreaterThanOrEqual(4)
    expect(pluginFace.listPlugins).toHaveBeenCalledTimes(1)
    expect(pluginFace.setPluginEnabled).not.toHaveBeenCalled()
  })
})
