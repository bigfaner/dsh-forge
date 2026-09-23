// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createIpcFeatureBoardFace, createIpcFeatureDocFace, getWorkbenchIpcBridge,
  normalizeWorkbenchVerbError, requireWorkbenchIpcBridge,
} from '../src/client/ipc/workbench.ts'
import { createFeatureDocsCache } from '../src/client/store/feature-board.ts'
import { FeaturesView } from '../src/client/views/features/FeaturesView.tsx'
import type { FeaturesViewProps } from '../src/client/views/features/FeaturesView.tsx'
import { FeaturesPage } from '../src/client/views/FeaturesPage.tsx'
import { WorkbenchShell } from '../src/client/WorkbenchShell.tsx'
import { FeatureDocs } from '../src/client/views/features/FeatureDocs.tsx'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import type { DocKind, FeatureBoardData, FeatureDoc, WorkbenchState } from '../src/client/ipc-types.ts'
import type { WorkbenchIpcBridge } from '../src/client/ipc/workbench.ts'
import type { WorkbenchShellProps } from '../src/client/contract.ts'
import type { ViewKeySnapshot, WorkbenchTabKey } from '../src/client/store/view-key.ts'

// Task 5.16 — the UF4 features ASSEMBLY units (real IPC over the
// window.dshForge.workbench boundary; jsdom fakes, no Electron):
//   AC2 mock 全撤 (the real path renders the bridge's data, never the mock
//       fixtures) · one board pull per project · doc on-demand + page cache
//       (重复打开不重拉; project switch clears — Hard Rule)
//   AC3 doc failure retryable + ERR_SNAPSHOT_STALE auto-refetch once (仍失败
//       才显错), envelope rejections normalized at the boundary
//   AC1/AC4/AC5 ride the unchanged 5.9 legs (feature-board.spec.tsx).

// The shell integration renders the real WorkbenchShell — the task-board.spec
// standins for the ui-primitives / ReactFlow lib boundaries.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconBranchOutline16: () => null,
  StateDot: (props: { state: string }) => <span data-mock-state-dot={props.state} />,
}))
vi.mock('@xyflow/react', async () => await import('./helpers/xyflow-standin'))

type Dict = Record<WorkbenchKey, string>
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]
const t = bind(en)

const $ = (selector: string): HTMLElement => document.querySelector(selector) as HTMLElement
const $$ = (selector: string): HTMLElement[] =>
  [...document.querySelectorAll(selector)] as HTMLElement[]

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  delete (globalThis as { dshForge?: unknown }).dshForge
})

// ---------------------------------------------------------------------------
// The adapter (the pattern 5.14/5.15 reuse)
// ---------------------------------------------------------------------------

/** A full callable surface (the preload namespace's test double). */
function fullBridgeFake(overrides: Partial<WorkbenchIpcBridge> = {}): WorkbenchIpcBridge {
  return {
    getState: async () => ({}) as WorkbenchState,
    registerProject: async () => ({}),
    updateProject: async () => ({}),
    removeProject: async () => undefined,
    activateProject: async () => undefined,
    getTaskBoard: async () => ({}),
    getTaskDetail: async () => ({}),
    getFeatureBoard: async () => ({}) as FeatureBoardData,
    readFeatureDoc: async () => ({}) as FeatureDoc,
    listPlugins: async () => [],
    setPluginEnabled: async () => [],
    recordSessionLink: async () => ({}),
    endSessionLink: async () => undefined,
    authorizeExternalDocPath: async () => undefined,
    // M3 migration pair + UF3 integration reads (task 1.7): the presence
    // check walks every declared bridge member.
    getMigrationStatus: async () => ({ authority: 'files', deviated: false, migratedAt: null, lastEvent: null, indexJsonDetected: false }),
    startMigration: async () => ({ started: true }),
    probeCodeRoot: async () => ({ available: true, taskTotal: 0, featureTotal: 0, indexJsonDetected: false }),
    getWorkbenchPaths: async () => ({ docsRoot: 'Z:/userData/workbench/docs', backupsRoot: 'Z:/userData/workbench/backups' }),
    // M3 task verbs (task 2.1): the presence check walks every declared member.
    taskAdd: async () => ({}) as never,
    taskClaim: async () => ({}) as never,
    taskTransition: async () => ({}) as never,
    taskSubmit: async () => ({}) as never,
    taskReopen: async () => ({}) as never,
    taskGet: async () => ({}) as never,
    taskQuery: async () => [],
    // M3 knowledge + feature-read verbs (task 2.2): same presence walk.
    knowledgeFact: async () => ({}) as never,
    knowledgeLesson: async () => ({}) as never,
    knowledgeResearch: async () => ({}) as never,
    knowledgeForensic: async () => ({}) as never,
    featureList: async () => [],
    featureStatus: async () => ({}) as never,
    // M3 prefs verbs (task 3.1): same presence walk.
    getPrefs: async () => [],
    setPrefs: async () => undefined,
    clearPrefOverride: async () => undefined,
    onEvents: () => () => {},
    ...overrides,
  } as unknown as WorkbenchIpcBridge
}

describe('getWorkbenchIpcBridge: the guarded preload read', () => {
  it('answers undefined in hostless environments (no dshForge at all)', () => {
    expect(getWorkbenchIpcBridge()).toBeUndefined()
  })

  it('answers undefined when the workbench namespace is absent or partial', () => {
    ;(globalThis as { dshForge?: unknown }).dshForge = {}
    expect(getWorkbenchIpcBridge()).toBeUndefined()
    ;(globalThis as { dshForge?: unknown }).dshForge = { workbench: { getState: async () => ({}) } }
    expect(getWorkbenchIpcBridge()).toBeUndefined() // partial bridge degrades to absent
  })

  it('returns the bridge when every declared member is callable', () => {
    const bridge = fullBridgeFake()
    ;(globalThis as { dshForge?: unknown }).dshForge = { workbench: bridge }
    expect(getWorkbenchIpcBridge()).toBe(bridge)
  })

  it('requireWorkbenchIpcBridge throws the explicit hostless error when absent', () => {
    expect(() => requireWorkbenchIpcBridge()).toThrow(/dshForge\.workbench IPC bridge is unavailable/)
  })
})

describe('normalizeWorkbenchVerbError: every rejection folds to the plain envelope', () => {
  it('the plain-object form (the build-stage mocks throw this shape) passes through verbatim', () => {
    expect(normalizeWorkbenchVerbError({ code: 'ERR_SNAPSHOT_STALE', message: 'stale' }))
      .toEqual({ code: 'ERR_SNAPSHOT_STALE', message: 'stale' })
    expect(normalizeWorkbenchVerbError({ code: 'ERR_X', message: 'm', detail: 'd' }))
      .toEqual({ code: 'ERR_X', message: 'm', detail: 'd' })
  })

  it('the IPC form (an Error whose message IS the serialized envelope) parses back', () => {
    // handlers.ts WorkbenchIpcError: super(JSON.stringify(envelope))
    const rejection = new Error(JSON.stringify({ code: 'ERR_PROJECT_NOT_FOUND', message: 'gone', detail: 'x' }))
    expect(normalizeWorkbenchVerbError(rejection))
      .toEqual({ code: 'ERR_PROJECT_NOT_FOUND', message: 'gone', detail: 'x' })
  })

  it('fix-1 defect C: the REAL ipcMain.handle form — Electron prefixes the message, the envelope survives as a trailing substring', () => {
    // Over a real ipcMain.handle Electron 44 re-wraps the rejection
    // renderer-side as `Error invoking remote method '<channel>': <name>:
    // <message>` (experimentally verified on this repo's chain, T-test-run).
    // handlers.ts rejects WorkbenchIpcError (name='WorkbenchIpcError',
    // message = the envelope JSON), so the strict whole-message parse can
    // never succeed over the real hop — the trailing-substring scan below
    // is what keeps every code-keyed renderer branch reachable.
    const wire = (channel: string, envelope: { code: string; message: string; detail?: string }): Error => {
      const mainSide = new Error(JSON.stringify(envelope))
      mainSide.name = 'WorkbenchIpcError'
      return new Error(`Error invoking remote method '${channel}': ${String(mainSide)}`)
    }
    const wrapped = wire('dsh-forge:workbench-register-project', {
      code: 'ERR_PROJECT_EXISTS',
      message: 'code root already registered',
    })
    // The observed wire shape, not the idealized one:
    expect(wrapped.message).toBe(
      'Error invoking remote method \'dsh-forge:workbench-register-project\': '
      + 'WorkbenchIpcError: {"code":"ERR_PROJECT_EXISTS","message":"code root already registered"}',
    )
    expect(normalizeWorkbenchVerbError(wrapped))
      .toEqual({ code: 'ERR_PROJECT_EXISTS', message: 'code root already registered' })
    // The systemic siblings (each had a dead renderer branch over real IPC):
    expect(normalizeWorkbenchVerbError(wire('dsh-forge:workbench-read-feature-doc', {
      code: 'ERR_SNAPSHOT_STALE', message: 'stale',
    }))).toEqual({ code: 'ERR_SNAPSHOT_STALE', message: 'stale' })
    expect(normalizeWorkbenchVerbError(wire('dsh-forge:workbench-update-project', {
      code: 'ERR_PROJECT_NOT_FOUND', message: 'gone', detail: 'x',
    }))).toEqual({ code: 'ERR_PROJECT_NOT_FOUND', message: 'gone', detail: 'x' })
  })

  it('fix-1 defect C: the scan ignores non-envelope JSON earlier in the message', () => {
    const rejection = new Error(
      'Error invoking remote method \'dsh-forge:workbench-register-project\': '
      + 'WorkbenchIpcError: {"code":"ERR_PROJECT_EXISTS","message":"root {dup} taken"}',
    )
    // The {dup} brace inside the envelope\'s message string is not a
    // candidate start; only the envelope\'s own opening brace whole-parses.
    expect(normalizeWorkbenchVerbError(rejection))
      .toEqual({ code: 'ERR_PROJECT_EXISTS', message: 'root {dup} taken' })
    // A non-envelope JSON object earlier in the text never parses (trailing
    // text after it) and never masks the real envelope:
    expect(normalizeWorkbenchVerbError(new Error(
      'junk {"not":"an envelope"} then WorkbenchIpcError: {"code":"ERR_PLUGIN_MANDATORY","message":"no"}',
    ))).toEqual({ code: 'ERR_PLUGIN_MANDATORY', message: 'no' })
  })

  it('unknown shapes fall to the spec ERR_WORKBENCH_DB 兜底', () => {
    expect(normalizeWorkbenchVerbError(new Error('plain boom')))
      .toEqual({ code: 'ERR_WORKBENCH_DB', message: 'plain boom' })
    expect(normalizeWorkbenchVerbError('a string')).toEqual({ code: 'ERR_WORKBENCH_DB', message: 'a string' })
    expect(normalizeWorkbenchVerbError({ code: 7, message: 'shaped wrong' }).code).toBe('ERR_WORKBENCH_DB')
  })
})

describe('the IPC faces: 1:1 verb mapping with QUALIFIED args + normalized rejections', () => {
  it('loadFeatureBoard forwards the projectId to getFeatureBoard', async () => {
    const getFeatureBoard = vi.fn(async () => ({ features: [], generatedAt: 'now' }))
    const face = createIpcFeatureBoardFace(fullBridgeFake({ getFeatureBoard }))
    await face.loadFeatureBoard('proj-1')
    expect(getFeatureBoard).toHaveBeenCalledTimes(1)
    expect(getFeatureBoard).toHaveBeenCalledWith('proj-1')
  })

  it('readFeatureDoc forwards (projectId, featureSlug, kind) in the verb order', async () => {
    const readFeatureDoc = vi.fn(async () => ({ kind: 'prd', markdown: '' }))
    const face = createIpcFeatureDocFace(fullBridgeFake({ readFeatureDoc }))
    await face.readFeatureDoc('proj-1', 'demo-feature', 'prd')
    expect(readFeatureDoc).toHaveBeenCalledWith('proj-1', 'demo-feature', 'prd')
  })

  it('a serialized-envelope rejection re-throws as the PLAIN shape (the views stay form-agnostic)', async () => {
    const getFeatureBoard = vi.fn(async (): Promise<FeatureBoardData> => {
      throw new Error(JSON.stringify({ code: 'ERR_PROJECT_NOT_FOUND', message: 'removed concurrently' }))
    })
    const face = createIpcFeatureBoardFace(fullBridgeFake({ getFeatureBoard }))
    await expect(face.loadFeatureBoard('proj-1')).rejects.toMatchObject({
      code: 'ERR_PROJECT_NOT_FOUND',
      message: 'removed concurrently',
    })
  })

  it('an unclassified rejection re-throws under the ERR_WORKBENCH_DB 兜底', async () => {
    const readFeatureDoc = vi.fn(async (): Promise<FeatureDoc> => { throw new Error('ENOENT: gone') })
    const face = createIpcFeatureDocFace(fullBridgeFake({ readFeatureDoc }))
    await expect(face.readFeatureDoc('p', 's', 'manifest')).rejects.toMatchObject({ code: 'ERR_WORKBENCH_DB' })
  })
})

// ---------------------------------------------------------------------------
// The page-session doc cache (store/feature-board.ts)
// ---------------------------------------------------------------------------

describe('createFeatureDocsCache', () => {
  it('is a read-through keyed store: put/get by <slug>/<kind>, clear drops all', () => {
    const cache = createFeatureDocsCache()
    expect(cache.get('demo', 'prd')).toBeUndefined()
    const doc: FeatureDoc = { kind: 'prd', markdown: '# body' }
    cache.put('demo', 'prd', doc)
    expect(cache.get('demo', 'prd')).toBe(doc)
    expect(cache.get('other', 'prd')).toBeUndefined() // slug-scoped
    expect(cache.get('demo', 'ui')).toBeUndefined() // kind-scoped
    expect(cache.size).toBe(1)
    cache.clear()
    expect(cache.get('demo', 'prd')).toBeUndefined()
    expect(cache.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// FeatureDocs: the cache consult + the ERR_SNAPSHOT_STALE auto-refetch (AC2/AC3)
// ---------------------------------------------------------------------------

describe('FeatureDocs assembly behaviors: doc cache + stale auto-refetch', () => {
  it('a cache hit renders WITHOUT firing the verb (重复打开不重拉)', async () => {
    const readFeatureDoc = vi.fn(async (): Promise<FeatureDoc> => ({ kind: 'manifest', markdown: '# cached body' }))
    const cache = createFeatureDocsCache()
    const { rerender } = render(
      <FeatureDocs t={t} featureSlug="demo" docKinds={['manifest']} face={{ readFeatureDoc }} docsCache={cache} />,
    )
    await waitFor(() => { expect($('[data-dsh-forge-feature-doc-panel="manifest"]').textContent).toContain('cached body') })
    expect(readFeatureDoc).toHaveBeenCalledTimes(1)
    expect(cache.size).toBe(1) // the success leg wrote back
    // Remount (the list↔detail round trip unmounts/remounts the tabs): the
    // cached doc renders with ZERO further verb calls.
    rerender(<div />)
    rerender(
      <FeatureDocs t={t} featureSlug="demo" docKinds={['manifest']} face={{ readFeatureDoc }} docsCache={cache} />,
    )
    await waitFor(() => { expect($('[data-dsh-forge-feature-doc-panel="manifest"]').textContent).toContain('cached body') })
    expect(readFeatureDoc).toHaveBeenCalledTimes(1)
  })

  it('ERR_SNAPSHOT_STALE auto-refetches ONCE silently; recovery renders with no card (自动重取一次)', async () => {
    let reads = 0
    const readFeatureDoc = vi.fn(async (): Promise<FeatureDoc> => {
      reads += 1
      if (reads === 1) throw { code: 'ERR_SNAPSHOT_STALE', message: 'stale' } // the rescan fixes it
      return { kind: 'manifest', markdown: '# after rescan' }
    })
    render(<FeatureDocs t={t} featureSlug="demo" docKinds={['manifest']} face={{ readFeatureDoc }} />)
    await waitFor(() => {
      expect($('[data-dsh-forge-feature-doc-panel="manifest"]').textContent).toContain('after rescan')
    })
    expect(readFeatureDoc).toHaveBeenCalledTimes(2) // exactly one silent refetch
    expect($('[data-dsh-forge-feature-doc-stale]')).toBeNull()
    expect($('[data-dsh-forge-feature-doc-error]')).toBeNull()
  })

  it('a REPEAT stale failure surfaces the dedicated 快照过期 card after the one auto-refetch (仍失败才显错)', async () => {
    const readFeatureDoc = vi.fn(async (): Promise<FeatureDoc> => {
      throw { code: 'ERR_SNAPSHOT_STALE', message: 'stale again' }
    })
    render(<FeatureDocs t={t} featureSlug="demo" docKinds={['manifest']} face={{ readFeatureDoc }} />)
    await waitFor(() => { expect($('[data-dsh-forge-feature-doc-stale]')).not.toBeNull() })
    expect(readFeatureDoc).toHaveBeenCalledTimes(2) // first read + the single auto-refetch — no loop
    expect($('[data-dsh-forge-feature-doc-error]')).toBeNull()
  })

  it('the stale branch detects the REAL IPC envelope form too (Error with serialized message)', async () => {
    let reads = 0
    const readFeatureDoc = vi.fn(async (): Promise<FeatureDoc> => {
      reads += 1
      if (reads === 1) throw new Error(JSON.stringify({ code: 'ERR_SNAPSHOT_STALE', message: 'stale' }))
      return { kind: 'manifest', markdown: '# envelope path' }
    })
    render(<FeatureDocs t={t} featureSlug="demo" docKinds={['manifest']} face={{ readFeatureDoc }} />)
    await waitFor(() => {
      expect($('[data-dsh-forge-feature-doc-panel="manifest"]').textContent).toContain('envelope path')
    })
    expect(readFeatureDoc).toHaveBeenCalledTimes(2)
  })

  it('the manual retry re-arms the auto-refetch allowance', async () => {
    let stale = true
    const readFeatureDoc = vi.fn(async (): Promise<FeatureDoc> => {
      if (stale) throw { code: 'ERR_SNAPSHOT_STALE', message: 'stale' }
      return { kind: 'manifest', markdown: '# manual recovery' }
    })
    render(<FeatureDocs t={t} featureSlug="demo" docKinds={['manifest']} face={{ readFeatureDoc }} />)
    await waitFor(() => { expect($('[data-dsh-forge-feature-doc-stale]')).not.toBeNull() })
    stale = false
    fireEvent.click($('[data-dsh-forge-feature-doc-stale-retry]'))
    await waitFor(() => {
      expect($('[data-dsh-forge-feature-doc-panel="manifest"]').textContent).toContain('manual recovery')
    })
  })
})

// ---------------------------------------------------------------------------
// FeaturesPage: the project-switch fresh session (AC2 Hard Rule)
// ---------------------------------------------------------------------------

describe('FeaturesPage: a projectId switch is a fresh page session', () => {
  const boardOf = (slug: string): FeatureBoardData => ({
    features: [{ slug, status: 'completed', docKinds: ['manifest'], taskTotal: 2, taskCompleted: 2, updatedAt: '2026-09-22T09:00:00.000Z' }],
    generatedAt: 'now',
  })

  it('reloads the board and CLEARS the doc cache on a project switch', async () => {
    let current = 'p1'
    const loadFeatureBoard = vi.fn(async (): Promise<FeatureBoardData> => boardOf(`feature-${current}`))
    const readFeatureDoc = vi.fn(async (_p: string, slug: string, kind: DocKind): Promise<FeatureDoc> =>
      ({ kind, markdown: `# ${slug} doc` }))
    const props = {
      t, projectId: current, face: { loadFeatureBoard }, docFace: { readFeatureDoc },
      onOpenFeature: () => {}, onBack: () => {},
    }
    const view = render(<FeaturesPage {...props} />)
    await waitFor(() => { expect($('[data-dsh-forge-feature-card="feature-p1"]')).not.toBeNull() })
    expect(loadFeatureBoard).toHaveBeenCalledWith('p1') // qualified arg

    // Read a doc in the detail (cached), return, re-enter: no second read.
    view.rerender(<FeaturesPage {...props} featureSlug="feature-p1" />)
    await waitFor(() => { expect($('[data-dsh-forge-feature-doc-panel="manifest"]')).not.toBeNull() })
    view.rerender(<FeaturesPage {...props} />)
    view.rerender(<FeaturesPage {...props} featureSlug="feature-p1" />)
    await waitFor(() => { expect($('[data-dsh-forge-feature-doc-panel="manifest"]')).not.toBeNull() })
    expect(readFeatureDoc).toHaveBeenCalledTimes(1)

    // Switch projects: the board reloads (new slug rendered) and the SAME doc
    // re-reads — the cache did not survive the boundary (Hard Rule).
    current = 'p2'
    view.rerender(<FeaturesPage {...props} projectId="p2" />)
    await waitFor(() => { expect($('[data-dsh-forge-feature-card="feature-p2"]')).not.toBeNull() })
    expect($('[data-dsh-forge-feature-card="feature-p1"]')).toBeNull() // no cross-project residue
    view.rerender(<FeaturesPage {...props} projectId="p2" featureSlug="feature-p2" />)
    await waitFor(() => { expect($('[data-dsh-forge-feature-doc-panel="manifest"]')).not.toBeNull() })
    expect(loadFeatureBoard).toHaveBeenCalledTimes(2)
    expect(loadFeatureBoard).toHaveBeenLastCalledWith('p2')
    expect(readFeatureDoc).toHaveBeenCalledTimes(2)
    expect(readFeatureDoc).toHaveBeenLastCalledWith('p2', 'feature-p2', 'manifest')
  })
})

// ---------------------------------------------------------------------------
// FeaturesView: the real-path assembly over the window.dshForge boundary
// ---------------------------------------------------------------------------

/** The real-path fixture: one active project, one feature, one doc per kind present. */
const REAL_STATE: WorkbenchState = {
  projects: [{
    id: 'real-proj-1', displayName: 'real', codeRoot: 'Z:\\real', docLocationType: 'in_repo',
    docLocationPath: null, createdAt: '2026-09-22T08:00:00.000Z', lastActivatedAt: null,
  }],
  activeProjectId: 'real-proj-1',
  plugins: [],
}
const REAL_BOARD: FeatureBoardData = {
  features: [{
    slug: 'real-feature-x', status: 'completed', docKinds: ['manifest', 'prd'],
    taskTotal: 3, taskCompleted: 3, updatedAt: '2026-09-22T09:30:00.000Z',
  }],
  generatedAt: 'now',
}

/** Install a full bridge fake over the jsdom boundary; returns the call log. */
function installBridge(overrides: Partial<WorkbenchIpcBridge> = {}) {
  const calls = { getState: 0, getFeatureBoard: [] as string[], readFeatureDoc: [] as string[] }
  const fake = fullBridgeFake({
    getState: async () => { calls.getState += 1; return REAL_STATE },
    getFeatureBoard: async (projectId: string) => { calls.getFeatureBoard.push(projectId); return REAL_BOARD },
    readFeatureDoc: async (projectId: string, slug: string, kind: DocKind) => {
      calls.readFeatureDoc.push(`${projectId}|${slug}|${kind}`)
      return { kind, markdown: `# ${slug} ${kind} — real body` }
    },
    ...overrides,
  })
  ;(globalThis as { dshForge?: unknown }).dshForge = { workbench: fake }
  return calls
}

async function renderView(props: Partial<FeaturesViewProps> = {}) {
  render(<FeaturesView t={t} onRegister={() => {}} {...props} />)
  // Settle on the list card OR the detail subview (a featureSlug render).
  await waitFor(() => {
    const card = document.querySelector('[data-dsh-forge-feature-card="real-feature-x"]')
    const detail = document.querySelector('[data-dsh-forge-feature-detail="real-feature-x"]')
    expect(card !== null || detail !== null).toBe(true)
  })
}

describe('FeaturesView: the real chain (bridge live, seat absent)', () => {
  it('mock 全撤: resolves the project over getState and renders the BRIDGE\'s board, never the mock fixtures', async () => {
    const calls = installBridge()
    await renderView()
    expect(calls.getState).toBeGreaterThanOrEqual(1)
    expect(calls.getFeatureBoard).toEqual(['real-proj-1']) // qualified with the REAL active id
    // A slug only the bridge knows — the mock twin's dsh-forge-m1/m2 are gone.
    expect($('[data-dsh-forge-feature-card="dsh-forge-m1"]')).toBeNull()
    expect($('[data-dsh-forge-feature-complete]')).not.toBeNull() // 3/3 completed (DTO counters)
  })

  it('the doc tabs read through readFeatureDoc with qualified args', async () => {
    const calls = installBridge()
    await renderView({ featureSlug: 'real-feature-x' })
    await waitFor(() => {
      expect($('[data-dsh-forge-feature-doc-panel="manifest"]').textContent).toContain('real body')
    })
    expect(calls.readFeatureDoc).toEqual(['real-proj-1|real-feature-x|manifest'])
    fireEvent.click($$('[data-dsh-forge-feature-doc-tab="prd"]')[0] as HTMLElement)
    await waitFor(() => {
      expect($('[data-dsh-forge-feature-doc-panel="prd"]').textContent).toContain('real body')
    })
    expect(calls.readFeatureDoc).toContain('real-proj-1|real-feature-x|prd')
  })

  it('an envelope-shaped board rejection surfaces the retryable error card (boundary normalization end-to-end)', async () => {
    installBridge({
      getFeatureBoard: async (): Promise<FeatureBoardData> => {
        throw new Error(JSON.stringify({ code: 'ERR_WORKBENCH_DB', message: 'verb failed' }))
      },
    })
    render(<FeaturesView t={t} onRegister={() => {}} />)
    await waitFor(() => { expect($('[data-dsh-forge-feature-error]')).not.toBeNull() })
  })

  it('activeProjectId null renders the state-gate guidance card (no board verb fires)', async () => {
    const calls = installBridge({
      getState: async () => ({ projects: [], activeProjectId: null, plugins: [] }),
    })
    const onRegister = vi.fn()
    render(<FeaturesView t={t} onRegister={onRegister} />)
    await waitFor(() => { expect($('[data-dsh-forge-feature-gate]')).not.toBeNull() })
    expect($('[data-dsh-forge-feature-gate]').textContent).toContain(en['gate.title'])
    expect(calls.getFeatureBoard).toEqual([]) // no project id, no call
    fireEvent.click($('[data-dsh-forge-feature-gate-register]'))
    expect(onRegister).toHaveBeenCalledTimes(1)
  })

  it('a failed getState shows the retryable project-error card; retry re-resolves', async () => {
    let fail = true
    const calls = installBridge({
      getState: async () => {
        if (fail) throw new Error(JSON.stringify({ code: 'ERR_WORKBENCH_DB', message: 'down' }))
        calls.getState += 1
        return REAL_STATE
      },
    })
    render(<FeaturesView t={t} onRegister={() => {}} />)
    await waitFor(() => { expect($('[data-dsh-forge-feature-project-error]')).not.toBeNull() })
    fail = false
    fireEvent.click($('[data-dsh-forge-feature-project-retry]'))
    await waitFor(() => { expect($('[data-dsh-forge-feature-card="real-feature-x"]')).not.toBeNull() })
    expect(calls.getFeatureBoard).toEqual(['real-proj-1'])
  })

  it('the seat form wins over the bridge (explicit injection is the test seam)', async () => {
    installBridge()
    const loadFeatureBoard = vi.fn(async () => REAL_BOARD)
    render(<FeaturesView t={t} seat={{ face: { loadFeatureBoard } }} chromeProjectId="chrome-p" />)
    await waitFor(() => { expect($('[data-dsh-forge-feature-card="real-feature-x"]')).not.toBeNull() })
    expect(loadFeatureBoard).toHaveBeenCalledWith('chrome-p') // the chrome projection passthrough
  })
})

// ---------------------------------------------------------------------------
// Shell integration: the features branch mounts the assembly
// ---------------------------------------------------------------------------

describe('shell integration: the features branch rides FeaturesView', () => {
  function makeViewFace(initial: Partial<ViewKeySnapshot> = {}) {
    let snapshot: ViewKeySnapshot = {
      view: 'workbench', workbenchTab: 'workbench/overview', featureSlug: undefined, ...initial,
    }
    const openFeatureDetail = vi.fn((slug: string) => {
      snapshot = { view: 'workbench', workbenchTab: 'workbench/features', featureSlug: slug }
    })
    const selectWorkbenchTab = vi.fn((tab: WorkbenchTabKey) => {
      snapshot = { ...snapshot, workbenchTab: tab, featureSlug: undefined }
    })
    return {
      props: {
        useViewKey: (selector: (current: ViewKeySnapshot) => ViewKeySnapshot) => selector(snapshot),
        selectWorkbenchTab,
        openFeatureDetail,
      } satisfies Pick<WorkbenchShellProps, 'useViewKey' | 'selectWorkbenchTab' | 'openFeatureDetail'>,
      openFeatureDetail,
      selectWorkbenchTab,
    }
  }

  it('bridge live + no seat: the REAL chain through the shell (mock 全撤 at the mount site)', async () => {
    const calls = installBridge()
    const viewFace = makeViewFace({ workbenchTab: 'workbench/features' })
    render(
      <WorkbenchShell t={t as WorkbenchShellProps['t']} {...viewFace.props} />,
    )
    await waitFor(() => { expect($('[data-dsh-forge-feature-card="real-feature-x"]')).not.toBeNull() })
    expect(calls.getFeatureBoard).toEqual(['real-proj-1'])
    // Enter the detail through the machine; the doc reads over the verb.
    fireEvent.click($('[data-dsh-forge-feature-card="real-feature-x"]'))
    expect(viewFace.openFeatureDetail).toHaveBeenCalledWith('real-feature-x')
  })

  it('seat injected: the 5.9 form through the shell (the explicit seam still addresses FeaturesPage)', async () => {
    const loadFeatureBoard = vi.fn(async () => REAL_BOARD)
    const viewFace = makeViewFace({ workbenchTab: 'workbench/features' })
    render(
      <WorkbenchShell
        t={t as WorkbenchShellProps['t']}
        features={{ face: { loadFeatureBoard } }}
        {...viewFace.props}
      />,
    )
    await waitFor(() => { expect($('[data-dsh-forge-feature-card="real-feature-x"]')).not.toBeNull() })
    expect(loadFeatureBoard).toHaveBeenCalledTimes(1)
  })
})
