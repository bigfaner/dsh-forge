// @vitest-environment jsdom
// Task 5.2 — the UF4 overview integration units (tech-design §Integration
// Specs #4, ui-design 偏好编辑面·三级 Placement): the 5.1 PreferenceSection
// wired INTO the overview page — 插件管理区(M2 UF6)之下, project-card block
// below. AC map:
//   AC1 placement — the section renders BELOW the plugin section as a direct
//      child of the page's 14px-gap column (populated AND empty branches;
//      无激活项目 = 仅「全局」可用)
//   AC2 selector binding — the feature Menu lists the KERNEL feature list of
//      the ACTIVE project (featureList verb / loadFeatures seam); switching
//      the active project rebinds the section (loadFeatures re-fires with the
//      new id, the project-tier read re-fires with the new scope, loading
//      skeleton between; a failed feature read degrades to a disabled
//      Feature tier, never an error wall)
//   AC3 prefs_updated reflux — a pushed prefs_updated event silently re-reads
//      the current scope's rows (no skeleton, no manual refresh), filtered by
//      the scope's resolution-chain addresses (global ⊂ project ⊂ feature)
//   AC4 M2 regression — plugin section structure + project cards + meta ride
//      above the section unchanged
// Plus the OverviewView assembly leg: the store form derives the UF4 verbs
// from the SAME bridge (getPrefs('global') + featureList(activeId) on mount,
// events over the shared single-subscriber channel).
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OverviewPage } from '../src/client/views/overview/OverviewPage.tsx'
import { OverviewView } from '../src/client/views/overview/OverviewView.tsx'
import { createWorkbenchStateStore } from '../src/client/store/workbench-state.ts'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import { zh } from '../src/client/locale/zh.ts'
import {
  MOCK_EMPTY_WORKBENCH_STATE, MOCK_PREF_REGISTRY, MOCK_WORKBENCH_STATE,
  createMockFeatureBoardFace, createMockOverviewFace, createMockPluginFace, createMockPrefsFace,
} from '../src/client/mocks/workbench.ts'
import type { PrefsFace } from '../src/client/contract.ts'
import type { PrefRow, PrefScope, Project, WorkbenchEvent } from '../src/client/ipc-types.ts'
import type { WorkbenchIpcBridge } from '../src/client/ipc/workbench.ts'

type Dict = Record<WorkbenchKey, string>
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]
const t = { en: bind(en), zh: bind(zh) }

const ACTIVE_ID = (MOCK_WORKBENCH_STATE.projects[0] as Project).id
const SECOND_ID = (MOCK_WORKBENCH_STATE.projects[1] as Project).id

// The upstream StateDot resolves through the module table at runtime; the
// jsdom unit render stubs it (the overview.spec / plugin-section precedents).
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  StateDot: (props: { state: string }) => <span data-mock-state-dot={props.state} />,
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Fixtures: a gated/mutable prefs face + an event bus + a feature-list seam
// ---------------------------------------------------------------------------

/**
 * A spied prefs face over the real mock twin with two test drivers:
 *   external(key, value) — simulates an EXTERNAL write landing in the store
 *     (the next getPrefs answers the patched effective value);
 *   holdNextGet() — gates the NEXT getPrefs behind a manual release (the
 *     loading-skeleton / silent-reflux timing probes).
 */
function makePrefsFace(base: PrefsFace = createMockPrefsFace()) {
  const calls: PrefScope[] = []
  let external: Record<string, unknown> = {}
  let gate: Promise<void> | undefined
  let releaseGate: (() => void) | undefined
  const face: PrefsFace = {
    getPrefs: async (scope) => {
      calls.push(scope)
      const pending = gate
      if (pending !== undefined) {
        gate = undefined
        await pending
      }
      const rows = await base.getPrefs(scope)
      return rows.map(row => (row.key in external ? { ...row, value: external[row.key] } : row))
    },
    setPrefs: base.setPrefs,
    clearPrefOverride: base.clearPrefOverride,
  }
  return Object.assign(face, {
    calls,
    external: (key: string, value: unknown): void => { external = { ...external, [key]: value } },
    holdNextGet: (): void => {
      gate = new Promise<void>((resolve) => { releaseGate = resolve })
    },
    release: (): void => { releaseGate?.() },
  })
}

/** The kernel's prefs_updated push (main-side WorkbenchEvent twin). */
const prefsUpdated = (scope: 'global' | 'project' | 'feature', scopeId: string): WorkbenchEvent =>
  ({ type: 'prefs_updated', scope, scopeId }) as unknown as WorkbenchEvent

/** A subscribe/emit pair standing in for the shared single-subscriber channel. */
function makeEventBus() {
  const listeners = new Set<(events: readonly WorkbenchEvent[]) => void>()
  return {
    subscribe: (listener: (events: readonly WorkbenchEvent[]) => void): (() => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    emit: (events: readonly object[]): void => {
      for (const listener of [...listeners]) listener(events as readonly WorkbenchEvent[])
    },
  }
}

const FEATURES_BY_PROJECT: Readonly<Record<string, readonly { slug: string }[]>> = {
  [ACTIVE_ID]: [{ slug: 'demo-a' }, { slug: 'demo-b' }],
  [SECOND_ID]: [{ slug: 'other-c' }],
}

/** Render the page with the UF4 seams injected; settle the section's rows. */
async function renderOverview(options: {
  state?: typeof MOCK_WORKBENCH_STATE
  prefsFace?: ReturnType<typeof makePrefsFace>
  loadFeatures?: (projectId: string) => Promise<readonly { slug: string }[]>
  events?: ReturnType<typeof makeEventBus>
} = {}) {
  const face = createMockOverviewFace(options.state ?? MOCK_WORKBENCH_STATE)
  const pluginFace = createMockPluginFace()
  const prefsFace = options.prefsFace ?? makePrefsFace()
  const events = options.events ?? makeEventBus()
  const loadFeatures = options.loadFeatures
    ?? (vi.fn(async (projectId: string) => FEATURES_BY_PROJECT[projectId] ?? []))
  render(
    <OverviewPage
      t={t.en}
      face={face}
      pluginFace={pluginFace}
      prefsFace={prefsFace}
      loadFeatures={loadFeatures}
      subscribePrefsEvents={events.subscribe}
    />,
  )
  await waitFor(() => {
    expect(document.querySelectorAll('[data-dsh-forge-pref-row]')).toHaveLength(MOCK_PREF_REGISTRY.length)
  })
  return { prefsFace, events, loadFeatures }
}

const flush = async (): Promise<void> => { await new Promise(resolve => setTimeout(resolve, 0)) }

const rowOf = (key: string): HTMLElement =>
  document.querySelector(`[data-dsh-forge-pref-row="${key}"]`) as HTMLElement

// ---------------------------------------------------------------------------
// AC1: placement — 插件管理区之下 · the page column's direct child
// ---------------------------------------------------------------------------

describe('integration: placement below the plugin section (AC1)', () => {
  it('populated: grid → plugin section → prefs section in page child order; direct child of the 14px-gap page column', async () => {
    await renderOverview()
    const page = document.querySelector('[data-dsh-forge-overview]') as HTMLElement
    const grid = document.querySelector('[data-dsh-forge-project-grid]') as HTMLElement
    const plugins = document.querySelector('[data-dsh-forge-plugins-section]') as HTMLElement
    const prefs = document.querySelector('[data-dsh-forge-prefs-section]') as HTMLElement
    expect(grid).not.toBeNull()
    expect(plugins).not.toBeNull()
    expect(prefs).not.toBeNull()
    const order = Array.from(page.children)
    expect(order.indexOf(plugins)).toBeGreaterThan(order.indexOf(grid))
    expect(order.indexOf(prefs)).toBeGreaterThan(order.indexOf(plugins))
    expect(prefs.parentElement).toBe(page)
    expect(page.style.gap).toBe('14px')
    expect(prefs.textContent).toContain(en['overview.prefs.title'])
  })

  it('empty branch: the section renders below the 空态卡 + plugin section with 仅「全局」可用 (project/feature tiers disabled + tooltip)', async () => {
    await renderOverview({ state: MOCK_EMPTY_WORKBENCH_STATE })
    const page = document.querySelector('[data-dsh-forge-overview]') as HTMLElement
    const empty = document.querySelector('[data-dsh-forge-overview-empty]') as HTMLElement
    const plugins = document.querySelector('[data-dsh-forge-plugins-section]') as HTMLElement
    const prefs = document.querySelector('[data-dsh-forge-prefs-section]') as HTMLElement
    expect(empty).not.toBeNull()
    const order = Array.from(page.children)
    expect(order.indexOf(plugins)).toBeGreaterThan(order.indexOf(empty))
    expect(order.indexOf(prefs)).toBeGreaterThan(order.indexOf(plugins))
    const global = prefs.querySelector('[data-dsh-forge-pref-tier="global"]') as HTMLButtonElement
    const project = prefs.querySelector('[data-dsh-forge-pref-tier="project"]') as HTMLButtonElement
    const feature = prefs.querySelector('[data-dsh-forge-pref-tier="feature"]') as HTMLButtonElement
    expect(global.disabled).toBe(false)
    expect(project.disabled).toBe(true)
    expect(project.getAttribute('title')).toBe(en['overview.prefs.tier.projectDisabled'])
    expect(feature.disabled).toBe(true)
    expect(feature.getAttribute('title')).toBe(en['overview.prefs.tier.featureDisabled'])
  })

  it('bilingual: the zh dictionary flows through the in-page section (the shell locale seat threads verbatim)', async () => {
    render(
      <OverviewPage
        t={t.zh}
        face={createMockOverviewFace(MOCK_EMPTY_WORKBENCH_STATE)}
        pluginFace={createMockPluginFace()}
        prefsFace={makePrefsFace()}
      />,
    )
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-prefs-section]')).not.toBeNull()
    })
    expect(document.querySelector('[data-dsh-forge-prefs-section]')?.textContent)
      .toContain(zh['overview.prefs.title'])
  })
})

// ---------------------------------------------------------------------------
// AC2: the feature selector binds the ACTIVE project's kernel feature list
// ---------------------------------------------------------------------------

describe('integration: feature selector + active-project rebinding (AC2)', () => {
  it('the Feature menu lists loadFeatures(activeProjectId); picking one reads the qualified feature scope <projectId>/<slug>', async () => {
    const { loadFeatures } = await renderOverview()
    fireEvent.click(document.querySelector('[data-dsh-forge-pref-tier="feature"]') as HTMLElement)
    const trigger = document.querySelector('[data-dsh-forge-prefs-feature-trigger]') as HTMLElement
    expect(trigger).not.toBeNull()
    fireEvent.click(trigger)
    const items = [...document.querySelectorAll('[data-dsh-forge-prefs-feature-item]')]
    expect(items.map(item => item.getAttribute('data-dsh-forge-prefs-feature-item')))
      .toEqual(['demo-a', 'demo-b'])
    expect(loadFeatures).toHaveBeenCalledWith(ACTIVE_ID)
    fireEvent.click(document.querySelector('[data-dsh-forge-prefs-feature-item="demo-b"]') as HTMLElement)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-prefs-feature-trigger]')?.textContent)
        .toContain('demo-b')
    })
  })

  it('switching the active project rebinds the section: loadFeatures re-fires with the new id, the project-tier read re-fires with the new scope, loading skeleton between', async () => {
    const { prefsFace, loadFeatures } = await renderOverview()
    fireEvent.click(document.querySelector('[data-dsh-forge-pref-tier="project"]') as HTMLElement)
    await waitFor(() => {
      expect(prefsFace.calls).toEqual(['global', { project: ACTIVE_ID }])
    })

    // Gate the upcoming { project: SECOND_ID } read — the skeleton must show
    // while it pends (项目切换后偏好面数据随项目切换).
    prefsFace.holdNextGet()
    fireEvent.click(document.querySelector(
      `[data-dsh-forge-project-card="${SECOND_ID}"] [data-dsh-forge-card-action="activate"]`,
    ) as HTMLElement)
    await waitFor(() => {
      expect(loadFeatures).toHaveBeenCalledWith(SECOND_ID)
      expect(document.querySelector('[data-dsh-forge-prefs-skeleton]')).not.toBeNull()
      expect(rowOf('auto.test.quick')).toBeNull()
    })
    prefsFace.release()
    await waitFor(() => {
      expect(rowOf('auto.test.quick')).not.toBeNull()
    })
    expect(prefsFace.calls).toEqual(['global', { project: ACTIVE_ID }, { project: SECOND_ID }])
  })

  it('a failed feature read degrades to a disabled Feature tier — never an error wall (rows stay rendered)', async () => {
    const failing = vi.fn(async (): Promise<readonly { slug: string }[]> => {
      throw new Error('featureList boom')
    })
    await renderOverview({ loadFeatures: failing })
    await waitFor(() => { expect(failing).toHaveBeenCalledWith(ACTIVE_ID) })
    expect(rowOf('auto.test.quick')).not.toBeNull()
    const feature = document.querySelector('[data-dsh-forge-pref-tier="feature"]') as HTMLButtonElement
    expect(feature.disabled).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// AC3: prefs_updated reflux — silent re-read, chain-address filtered
// ---------------------------------------------------------------------------

describe('integration: prefs_updated drives the effective-value refresh (AC3)', () => {
  it('a matching prefs_updated event silently re-reads the current scope: rows stay mounted (no skeleton), the new effective value lands', async () => {
    const { prefsFace, events } = await renderOverview()
    fireEvent.click(document.querySelector('[data-dsh-forge-pref-tier="project"]') as HTMLElement)
    await waitFor(() => {
      expect(prefsFace.calls).toEqual(['global', { project: ACTIVE_ID }])
    })
    expect((rowOf('auto.test.quick').querySelector('[data-dsh-forge-pref-control="toggle"]') as HTMLInputElement).checked)
      .toBe(false)

    // An EXTERNAL write lands in the store (agent via dsh tool) + the kernel
    // pushes prefs_updated — gate the reflux read to prove it is SILENT.
    prefsFace.external('auto.test.quick', true)
    prefsFace.holdNextGet()
    events.emit([prefsUpdated('project', ACTIVE_ID)])
    await waitFor(() => { expect(prefsFace.calls).toHaveLength(3) })
    expect(rowOf('auto.test.quick')).not.toBeNull() // rows stayed mounted — no skeleton
    expect(document.querySelector('[data-dsh-forge-prefs-skeleton]')).toBeNull()
    prefsFace.release()
    await waitFor(() => {
      expect((rowOf('auto.test.quick').querySelector('[data-dsh-forge-pref-control="toggle"]') as HTMLInputElement).checked)
        .toBe(true)
    })
  })

  it('the chain filter: a global write refreshes the project-tier view (global ⊂ the project chain); foreign scopes do not', async () => {
    const { prefsFace, events } = await renderOverview()
    fireEvent.click(document.querySelector('[data-dsh-forge-pref-tier="project"]') as HTMLElement)
    await waitFor(() => { expect(prefsFace.calls).toHaveLength(2) })

    events.emit([prefsUpdated('global', '')])
    await waitFor(() => { expect(prefsFace.calls).toHaveLength(3) })

    // A feature-scope write never reaches the project tier's resolution chain
    // (project resolves [project, global]), and a foreign project id never
    // matches at all — both must NOT re-read.
    events.emit([prefsUpdated('feature', `${ACTIVE_ID}/demo-a`)])
    events.emit([prefsUpdated('project', 'some-other-project')])
    await flush()
    expect(prefsFace.calls).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// AC4: the M2 overview surface rides unchanged above the section
// ---------------------------------------------------------------------------

describe('integration: M2 overview regression beside the section (AC4)', () => {
  it('plugin rows + project cards + meta render unchanged, the prefs section closes the column below them', async () => {
    await renderOverview()
    expect(document.querySelectorAll('[data-dsh-forge-plugin-row]').length).toBeGreaterThanOrEqual(4)
    expect(document.querySelectorAll('[data-dsh-forge-project-card]')).toHaveLength(2)
    expect(document.querySelector('[data-dsh-forge-overview-meta]')).not.toBeNull()
    const page = document.querySelector('[data-dsh-forge-overview]') as HTMLElement
    const order = Array.from(page.children)
    expect(order.indexOf(page.querySelector('[data-dsh-forge-plugins-section]') as HTMLElement))
      .toBeLessThan(order.indexOf(page.querySelector('[data-dsh-forge-prefs-section]') as HTMLElement))
  })
})

// ---------------------------------------------------------------------------
// The OverviewView assembly: the store form derives the UF4 verbs from the bridge
// ---------------------------------------------------------------------------

const REAL_PROJECTS: Project[] = [
  { id: 'real-p1', displayName: 'real-one', codeRoot: 'Z:\\real\\one', docLocationType: 'in_repo', docLocationPath: null, createdAt: '', lastActivatedAt: null, archived: false, sortOrder: 0, projectionState: 'pending', docsPlacement: 'repo-existing' },
  { id: 'real-p2', displayName: 'real-two', codeRoot: 'Z:\\real\\two', docLocationType: 'in_repo', docLocationPath: null, createdAt: '', lastActivatedAt: null, archived: false, sortOrder: 1, projectionState: 'pending', docsPlacement: 'repo-existing' },
]

/** One bridge-backed boolean row (value true — the mock twin's default is false). */
const BRIDGE_PREF_ROWS: PrefRow[] = [{
  key: 'auto.test.quick', group: 'auto', type: 'boolean', control: 'toggle',
  value: true, source: 'global', override: true, localValue: true, defaultValue: false,
}]

/** A minimal registry bridge carrying the UF4 members the store form reads. */
function prefsRegistryBridge() {
  const calls = { getPrefs: [] as PrefScope[], featureList: [] as string[] }
  let eventsCallback: ((events: readonly object[]) => void) | undefined
  const fake = {
    getState: async () => ({
      projects: [...REAL_PROJECTS], activeProjectId: 'real-p1',
      plugins: [{ name: '@deepseek-ai/dsh-base', mandatory: true, enabled: true }],
    }),
    activateProject: async () => undefined,
    updateProject: async () => REAL_PROJECTS[0],
    removeProject: async () => undefined,
    listPlugins: async () => [{ name: '@deepseek-ai/dsh-base', mandatory: true, enabled: true }],
    setPluginEnabled: async () => [],
    featureList: async (projectId: string) => {
      calls.featureList.push(projectId)
      return [{
        slug: 'real-feature-a', status: 'in-progress', created: '', completed: 0, total: 0,
        scores: { prd: '', design: '', ui: '', tests: '' },
      }]
    },
    getPrefs: async (scope: PrefScope) => {
      calls.getPrefs.push(scope)
      return BRIDGE_PREF_ROWS
    },
    setPrefs: async () => undefined,
    clearPrefOverride: async () => undefined,
    onEvents: (callback: (events: readonly object[]) => void): (() => void) => {
      eventsCallback = callback
      return () => { eventsCallback = undefined }
    },
  } as unknown as WorkbenchIpcBridge
  return {
    fake, calls,
    emit: (events: readonly object[]): void => { eventsCallback?.(events) },
  }
}

describe('OverviewView assembly: the UF4 family over the bridge', () => {
  it('the store form reads the section through the bridge: getPrefs(global) + featureList(activeId) on mount, bridge rows render (never the mock twin)', async () => {
    const registry = prefsRegistryBridge()
    const store = createWorkbenchStateStore(registry.fake)
    render(<OverviewView t={t.en} store={store} />)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-pref-row="auto.test.quick"]')).not.toBeNull()
    })
    expect(registry.calls.getPrefs).toEqual(['global'])
    expect(registry.calls.featureList).toEqual(['real-p1'])
    expect((document.querySelector('[data-dsh-forge-pref-control="toggle"]') as HTMLInputElement).checked)
      .toBe(true)

    // The Feature menu carries the BRIDGE roster (the mock board's slugs
    // dsh-forge-m2/m1 must never render on the real chain).
    fireEvent.click(document.querySelector('[data-dsh-forge-pref-tier="feature"]') as HTMLElement)
    fireEvent.click(document.querySelector('[data-dsh-forge-prefs-feature-trigger]') as HTMLElement)
    expect(document.querySelector('[data-dsh-forge-prefs-feature-item="real-feature-a"]')).not.toBeNull()
    expect(document.querySelector('[data-dsh-forge-prefs-feature-item="dsh-forge-m2"]')).toBeNull()
    store.dispose()
  })

  it('prefs_updated over the bridge\'s onEvents channel silently re-reads the section (the shared single-subscriber source)', async () => {
    const registry = prefsRegistryBridge()
    const store = createWorkbenchStateStore(registry.fake)
    render(<OverviewView t={t.en} store={store} />)
    await waitFor(() => { expect(registry.calls.getPrefs).toHaveLength(1) })
    registry.emit([{ type: 'prefs_updated', scope: 'global', scopeId: '' }])
    await waitFor(() => { expect(registry.calls.getPrefs).toHaveLength(2) })
    expect(registry.calls.getPrefs).toEqual(['global', 'global'])
    store.dispose()
  })
})

// ---------------------------------------------------------------------------
// The build-stage default: the feature roster falls back to the mock board twin
// ---------------------------------------------------------------------------

describe('build-stage default: the feature roster rides the mock board twin', () => {
  it('without loadFeatures the menu derives from createMockFeatureBoardFace (the hostless demo form)', async () => {
    const twin = createMockFeatureBoardFace()
    render(
      <OverviewPage
        t={t.en}
        face={createMockOverviewFace()}
        pluginFace={createMockPluginFace()}
        prefsFace={makePrefsFace()}
      />,
    )
    await waitFor(() => {
      expect(document.querySelectorAll('[data-dsh-forge-pref-row]')).toHaveLength(MOCK_PREF_REGISTRY.length)
    })
    const board = await twin.loadFeatureBoard(ACTIVE_ID)
    fireEvent.click(document.querySelector('[data-dsh-forge-pref-tier="feature"]') as HTMLElement)
    fireEvent.click(document.querySelector('[data-dsh-forge-prefs-feature-trigger]') as HTMLElement)
    const slugs = [...document.querySelectorAll('[data-dsh-forge-prefs-feature-item]')]
      .map(item => item.getAttribute('data-dsh-forge-prefs-feature-item'))
    expect(slugs).toEqual(board.features.map(feature => feature.slug))
  })
})
