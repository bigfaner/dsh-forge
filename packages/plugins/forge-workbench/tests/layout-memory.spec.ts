// M4 task 4.5 — the layout-memory ENGINE (AC matrix): the collect model
// (seam fragments → Interface 4 ProjectLayout v1; the 双轨 boundaries), the
// replay planner/executor (重放 open 操作序列 + per-op degrade), and the
// persistence engine (debounce write / write-on-leave / 删除清除 disarm /
// restore feed). The blob's schema fitness rides a LOCAL TWIN of 4.1's
// kernel whitelist (the plugin cannot import the app — the 4.1 lockstep
// precedent; the real kernel drift lock lives in apps/desktop/tests/
// workbench-ui-state.spec.ts).
import { describe, expect, it, vi } from 'vitest'
import type { ProjectLayout, SessionTarget } from '../src/client/ipc-types.ts'
import type { TreeLayoutState } from '../src/client/components/project-tree/tree-derive.ts'
import type { OpenTabRow, SplitLayoutState } from '../src/client/views/rightbar/tabs-model.ts'
import {
  collectProjectLayout, collectRightbarPanes, collectTabOf, SIDEBAR_WIDTH_MAX, SIDEBAR_WIDTH_MIN,
  TOPIC_MAX_LENGTH, widthPctOfRatio,
} from '../src/client/layout/collect.ts'
import type { RightbarCollectInput } from '../src/client/layout/collect.ts'
import { planLayoutReplay, replayProjectLayout } from '../src/client/layout/replay.ts'
import type { LayoutReplayFaces, LayoutReplayOp } from '../src/client/layout/replay.ts'
import {
  createLayoutMemoryEngine, LAYOUT_REPLAY_RETRY_LIMIT, LAYOUT_REPLAY_RETRY_MS, LAYOUT_WRITE_DEBOUNCE_MS,
} from '../src/client/layout/persistence.ts'
import type { LayoutMemoryClock, LayoutMemoryVerbs } from '../src/client/layout/persistence.ts'

// ---------------------------------------------------------------------------
// The 4.1 kernel whitelist twin (sanitizeProjectLayout's semantics, compact)
// ---------------------------------------------------------------------------

const TAB_KIND_SET = new Set(['guide', 'overview', 'board', 'doc', 'depgraph'])
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const keysExact = (source: Record<string, unknown>, allowed: readonly string[], required: readonly string[]): string | null => {
  for (const key of Object.keys(source)) if (!allowed.includes(key)) return `unexpected key "${key}"`
  for (const key of required) if (!(key in source)) return `missing key "${key}"`
  return null
}

/** The kernel's sanitize twin:合法 → reset:false;违规 → reset:true + reason. */
function sanitizeLike(value: unknown): { reset: boolean; reason: string | null } {
  if (!isPlainObject(value)) return { reset: true, reason: 'not an object' }
  let error = keysExact(value, ['version', 'sidebar', 'tree', 'rightbar', 'detached'], ['version', 'sidebar', 'tree', 'rightbar', 'detached'])
  if (error !== null) return { reset: true, reason: error }
  if (value.version !== 1) return { reset: true, reason: 'version must be 1' }
  const sidebar = value.sidebar
  if (!isPlainObject(sidebar)) return { reset: true, reason: 'sidebar' }
  error = keysExact(sidebar, ['collapsed', 'width'], ['collapsed'])
  if (error !== null) return { reset: true, reason: `sidebar ${error}` }
  if (typeof sidebar.collapsed !== 'boolean') return { reset: true, reason: 'sidebar.collapsed' }
  if (sidebar.width !== undefined
    && (typeof sidebar.width !== 'number' || !Number.isFinite(sidebar.width)
      || sidebar.width < SIDEBAR_WIDTH_MIN || sidebar.width > SIDEBAR_WIDTH_MAX)) {
    return { reset: true, reason: 'sidebar.width out of band' }
  }
  const tree = value.tree
  if (!isPlainObject(tree)) return { reset: true, reason: 'tree' }
  error = keysExact(tree, ['expandedProjects', 'expandedSessions', 'overflowOpen'], ['expandedProjects', 'expandedSessions', 'overflowOpen'])
  if (error !== null) return { reset: true, reason: `tree ${error}` }
  for (const field of ['expandedProjects', 'expandedSessions', 'overflowOpen'] as const) {
    if (!Array.isArray(tree[field]) || !(tree[field] as unknown[]).every(entry => typeof entry === 'string' && entry !== '')) {
      return { reset: true, reason: `tree.${field}` }
    }
  }
  const rightbar = value.rightbar
  if (!isPlainObject(rightbar)) return { reset: true, reason: 'rightbar' }
  error = keysExact(rightbar, ['widthPct', 'panes'], ['panes'])
  if (error !== null) return { reset: true, reason: `rightbar ${error}` }
  if (rightbar.widthPct !== undefined && (typeof rightbar.widthPct !== 'number' || !Number.isFinite(rightbar.widthPct))) {
    return { reset: true, reason: 'rightbar.widthPct' }
  }
  if (!Array.isArray(rightbar.panes)) return { reset: true, reason: 'rightbar.panes' }
  for (const pane of rightbar.panes) {
    if (!isPlainObject(pane)) return { reset: true, reason: 'pane' }
    error = keysExact(pane, ['tabs'], ['tabs'])
    if (error !== null) return { reset: true, reason: `pane ${error}` }
    if (!Array.isArray(pane.tabs)) return { reset: true, reason: 'pane.tabs' }
    for (const tab of pane.tabs) {
      if (!isPlainObject(tab)) return { reset: true, reason: 'tab' }
      error = keysExact(tab, ['kind', 'topic'], ['kind'])
      if (error !== null) return { reset: true, reason: `tab ${error}` }
      if (typeof tab.kind !== 'string' || !TAB_KIND_SET.has(tab.kind)) return { reset: true, reason: 'tab.kind' }
      if (tab.topic !== undefined && (typeof tab.topic !== 'string' || tab.topic === '' || tab.topic.length > TOPIC_MAX_LENGTH)) {
        return { reset: true, reason: 'tab.topic' }
      }
    }
  }
  if (!Array.isArray(value.detached)) return { reset: true, reason: 'detached' }
  for (const entry of value.detached) {
    if (!isPlainObject(entry)) return { reset: true, reason: 'detached entry' }
    error = keysExact(entry, ['view', 'target', 'rect'], ['view'])
    if (error !== null) return { reset: true, reason: `detached ${error}` }
    if (entry.view !== 'board' && entry.view !== 'conversation') return { reset: true, reason: 'detached.view' }
    if (entry.target !== undefined) {
      const target = entry.target
      if (!isPlainObject(target)) return { reset: true, reason: 'detached.target' }
      const keys = Object.keys(target)
      const topOk = keys.length === 1 && keys[0] === 'sessionId' && typeof target.sessionId === 'string' && target.sessionId !== ''
      const subKeys = keysWithinList(keys, ['parentSessionId', 'childSessionId', 'mode'])
      const subOk = subKeys && typeof target.parentSessionId === 'string' && typeof target.childSessionId === 'string'
        && (target.mode === 'one-shot' || target.mode === 'continuable')
      if (!topOk && !subOk) return { reset: true, reason: 'detached.target form' }
    }
    if (entry.rect !== undefined) {
      const rect = entry.rect
      if (!isPlainObject(rect)) return { reset: true, reason: 'detached.rect' }
      error = keysExact(rect, ['x', 'y', 'width', 'height'], ['x', 'y', 'width', 'height'])
      if (error !== null) return { reset: true, reason: `rect ${error}` }
    }
  }
  return { reset: false, reason: null }
}

const keysWithinList = (keys: string[], allowed: string[]): boolean =>
  keys.length === allowed.length && keys.every(key => allowed.includes(key))

/** Every blob the collect emits must survive the kernel twin (round-trip). */
const assertKernelClean = (layout: ProjectLayout): void => {
  const verdict = sanitizeLike(layout)
  expect(verdict.reset, verdict.reason ?? undefined).toBe(false)
  const roundTrip = sanitizeLike(JSON.parse(JSON.stringify(layout)))
  expect(roundTrip.reset, roundTrip.reason ?? undefined).toBe(false)
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TREE: TreeLayoutState = {
  expandedProjects: ['p-1', 'p-2'],
  expandedSessions: ['s-1'],
  overflowOpen: ['__ungrouped__'],
}

const rows = (...entries: Array<[string, string]>): readonly OpenTabRow[] =>
  entries.map(([tabId, kind]) => ({ tabId, kind }))

const splitOf = (panes: SplitLayoutState['panes'], ratio = 0.5): SplitLayoutState => ({ panes, ratio })

const TARGET_SESSION: SessionTarget = { sessionId: 's-9' }
const TARGET_SUBAGENT: SessionTarget = { parentSessionId: 'p-0', childSessionId: 'c-0', mode: 'one-shot' }

// ---------------------------------------------------------------------------
// AC1 — 采集矩阵
// ---------------------------------------------------------------------------

describe('AC1: collect — the seam fragments fold into ProjectLayout v1', () => {
  it('folds the full matrix (sidebar/tree/rightbar/detached) and passes the kernel twin', () => {
    const layout = collectProjectLayout({
      sidebar: { collapsed: false, width: 320 },
      tree: TREE,
      rightbar: {
        split: splitOf([{ view: 'board', tabId: 't-3' }], 0.4),
        tabs: rows(['t-1', 'guide'], ['t-2', 'overview'], ['t-3', 'board']),
      },
      detached: [{ view: 'conversation', target: TARGET_SESSION }],
    })
    expect(layout).toEqual({
      version: 1,
      sidebar: { collapsed: false, width: 320 },
      tree: TREE,
      rightbar: {
        widthPct: 40,
        panes: [
          { tabs: [{ kind: 'guide' }, { kind: 'overview' }] },
          { tabs: [{ kind: 'board' }] },
        ],
      },
      detached: [{ view: 'conversation', target: TARGET_SESSION }],
    })
    assertKernelClean(layout)
  })

  it('absent fragments fall to the Interface 4 defaults (a whole, valid blob)', () => {
    const layout = collectProjectLayout({})
    expect(layout).toEqual({
      version: 1,
      sidebar: { collapsed: false },
      tree: { expandedProjects: [], expandedSessions: [], overflowOpen: [] },
      rightbar: { panes: [] },
      detached: [],
    })
    assertKernelClean(layout)
  })

  it('sidebar: out-of-band and non-finite widths are omitted (never a kernel-invalid blob)', () => {
    expect(collectProjectLayout({ sidebar: { collapsed: true, width: 100 } }).sidebar).toEqual({ collapsed: true })
    expect(collectProjectLayout({ sidebar: { collapsed: true, width: SIDEBAR_WIDTH_MAX + 1 } }).sidebar).toEqual({ collapsed: true })
    expect(collectProjectLayout({ sidebar: { collapsed: true, width: Number.NaN } }).sidebar).toEqual({ collapsed: true })
    const atMin = collectProjectLayout({ sidebar: { collapsed: false, width: SIDEBAR_WIDTH_MIN } }).sidebar
    expect(atMin).toEqual({ collapsed: false, width: SIDEBAR_WIDTH_MIN })
  })

  it('rightbar: the split ratio maps onto widthPct (clamped band, non-finite → absent)', () => {
    expect(widthPctOfRatio(0.5)).toBe(50)
    expect(widthPctOfRatio(0.34)).toBe(34)
    expect(widthPctOfRatio(0.05)).toBe(30)
    expect(widthPctOfRatio(0.95)).toBe(70)
    expect(widthPctOfRatio(Number.NaN)).toBeUndefined()
    expect(collectProjectLayout({ rightbar: { split: splitOf([], Number.NaN), tabs: [] } }).rightbar.widthPct)
      .toBeUndefined()
  })

  it('rightbar: kinds outside the TabKind whitelist drop (subagentchat asides, terminal, browser)', () => {
    const input: RightbarCollectInput = {
      split: splitOf([{ view: 'session-aside', tabId: 't-aside' }]),
      tabs: rows(
        ['t-1', 'guide'],
        ['t-aside', 'subagentchat'],
        ['t-term', 'terminal'],
        ['t-web', 'browser'],
      ),
    }
    expect(collectProjectLayout({ rightbar: input }).rightbar.panes).toEqual([
      { tabs: [{ kind: 'guide' }] },
    ])
  })

  it('rightbar: an aside pane has NO v1 slot — it drops, the base tabs stay', () => {
    const panes = collectRightbarPanes({
      split: splitOf([
        { view: 'board', tabId: 't-2' },
        { view: 'session-aside', tabId: 't-3' },
      ]),
      tabs: rows(['t-1', 'overview'], ['t-2', 'board'], ['t-3', 'subagentchat']),
    })
    expect(panes).toEqual([
      { tabs: [{ kind: 'overview' }] },
      { tabs: [{ kind: 'board' }] },
    ])
  })

  it('rightbar: doc topics ride the resolver; unresolvable docs drop, depgraph topics optional', () => {
    const topicOf = (row: OpenTabRow): string | undefined => row.tabId === 't-doc' ? 'docs/features/m4/prd' : undefined
    const tabs = rows(['t-doc', 'doc'], ['t-doc-x', 'doc'], ['t-dep', 'depgraph'], ['t-dep-x', 'depgraph'])
    expect(collectTabOf(tabs[0], topicOf)).toEqual({ kind: 'doc', topic: 'docs/features/m4/prd' })
    expect(collectTabOf(tabs[1], topicOf)).toBeUndefined()
    expect(collectTabOf(tabs[1])).toBeUndefined()
    expect(collectTabOf(tabs[2], topicOf)).toEqual({ kind: 'depgraph' })
    expect(collectTabOf(tabs[3], () => 'm4')).toEqual({ kind: 'depgraph', topic: 'm4' })
    // Singleton kinds never carry a topic (and ignore a stray resolver hit).
    expect(collectTabOf(rows(['t-g', 'guide'])[0], () => 'stray')).toEqual({ kind: 'guide' })
  })

  it('rightbar: an over-length topic drops the doc tab (the kernel bound twin)', () => {
    const long = 'x'.repeat(TOPIC_MAX_LENGTH + 1)
    expect(collectTabOf({ tabId: 't', kind: 'doc' }, () => long)).toBeUndefined()
    expect(collectTabOf({ tabId: 't', kind: 'depgraph' }, () => long)).toEqual({ kind: 'depgraph' })
  })

  it('rightbar: an empty column collects as panes: [] (the default posture)', () => {
    expect(collectProjectLayout({ rightbar: { split: splitOf([]), tabs: [] } }).rightbar).toEqual({ widthPct: 50, panes: [] })
  })

  it('detached: entries carry view/target/rect verbatim (both target forms)', () => {
    const layout = collectProjectLayout({
      detached: [
        { view: 'board' },
        { view: 'conversation', target: TARGET_SUBAGENT, rect: { x: 1, y: 2, width: 3, height: 4 } },
      ],
    })
    expect(layout.detached).toEqual([
      { view: 'board' },
      { view: 'conversation', target: TARGET_SUBAGENT, rect: { x: 1, y: 2, width: 3, height: 4 } },
    ])
    assertKernelClean(layout)
  })

  it('双轨边界: the blob NEVER carries the view options (分组×排序 = localStorage, C3 口径)', () => {
    const layout = collectProjectLayout({
      sidebar: { collapsed: false, width: 300 },
      tree: TREE,
      rightbar: { split: splitOf([{ view: 'board', tabId: 't-2' }]), tabs: rows(['t-1', 'guide'], ['t-2', 'board']) },
      detached: [{ view: 'board' }],
    })
    const serialized = JSON.stringify(layout)
    expect(serialized).not.toContain('grouping')
    expect(serialized).not.toContain('sorting')
    // The exact Interface 4 key set (nothing else rides along).
    expect(Object.keys(layout).sort()).toEqual(['detached', 'rightbar', 'sidebar', 'tree', 'version'])
    expect(Object.keys(layout.tree).sort()).toEqual(['expandedProjects', 'expandedSessions', 'overflowOpen'])
    assertKernelClean(layout)
  })
})

// ---------------------------------------------------------------------------
// AC2 — 重放序列
// ---------------------------------------------------------------------------

describe('AC2: replay — the open-operation sequence', () => {
  it("plans in order: sidebar geometry → panes' tabs (later panes split) → ratio (≥2 panes) → detached", () => {
    const ops = planLayoutReplay({
      version: 1,
      sidebar: { collapsed: true, width: 320 },
      tree: TREE,
      rightbar: {
        widthPct: 40,
        panes: [
          { tabs: [{ kind: 'guide' }, { kind: 'doc', topic: 'docs/features/m4/prd' }] },
          { tabs: [{ kind: 'board' }] },
        ],
      },
      detached: [{ view: 'board' }],
    })
    expect(ops).toEqual([
      { op: 'sidebar-width', width: 320 },
      { op: 'sidebar-collapse', collapsed: true },
      { op: 'open-tab', kind: 'guide', preferNewPane: false },
      { op: 'open-tab', kind: 'doc', topic: 'docs/features/m4/prd', preferNewPane: false },
      { op: 'open-tab', kind: 'board', preferNewPane: true },
      { op: 'split-ratio', ratio: 0.4 },
      { op: 'open-detached', view: 'board' },
    ] satisfies LayoutReplayOp[])
  })

  it('the default layout plans to an EMPTY sequence (恢复失败 → 默认布局 backstop)', () => {
    expect(planLayoutReplay(collectProjectLayout({}))).toEqual([])
    // An expanded sidebar with no width and no panes also plans nothing.
    expect(planLayoutReplay(collectProjectLayout({ sidebar: { collapsed: false } }))).toEqual([])
  })

  it('a single pane carries no ratio op (nothing to size); collapse only fires for true', () => {
    const ops = planLayoutReplay(collectProjectLayout({
      rightbar: { split: splitOf([], 0.4), tabs: rows(['t-1', 'guide']) },
      sidebar: { collapsed: false },
    }))
    expect(ops).toEqual([{ op: 'open-tab', kind: 'guide', preferNewPane: false }])
  })

  it('executes the sequence against the faces (recorded call order, doc params derived)', () => {
    const issued: string[] = []
    const faces: LayoutReplayFaces = {
      sidebar: {
        setWidth: (px) => { issued.push(`width:${String(px)}`) },
        setCollapsed: (collapsed) => { issued.push(`collapse:${String(collapsed)}`) },
      },
      rightbar: {
        openTab: (kind, options) => {
          issued.push(`tab:${kind}${options?.preferNewPane === true ? ':new' : ''}:${JSON.stringify(options?.params ?? {})}`)
        },
      },
      split: { setRatio: (ratio) => { issued.push(`ratio:${String(ratio)}`); return true } },
      detached: { openDetached: async (input) => { issued.push(`detached:${input.view}`) } },
    }
    const outcome = replayProjectLayout({
      version: 1,
      sidebar: { collapsed: true, width: 300 },
      tree: TREE,
      rightbar: {
        widthPct: 40,
        panes: [
          { tabs: [{ kind: 'guide' }, { kind: 'doc', topic: 'docs/features/m4/prd' }, { kind: 'depgraph', topic: 'm4' }, { kind: 'depgraph' }] },
          { tabs: [{ kind: 'board' }] },
        ],
      },
      detached: [{ view: 'conversation', target: TARGET_SESSION, rect: { x: 0, y: 0, width: 960, height: 640 } }],
    }, faces)
    expect(issued).toEqual([
      'width:300',
      'collapse:true',
      'tab:guide:{}',
      'tab:doc:{"path":"docs/features/m4/prd","displayName":"m4/prd"}',
      'tab:depgraph:{"featureSlug":"m4"}',
      'tab:depgraph:{}',
      'tab:board:new:{}',
      'ratio:0.4',
      'detached:conversation',
    ])
    expect(outcome).toEqual({ planned: 9, issued: 9, degraded: 0 })
  })

  it('SINGLETON kinds focus an already-open row instead of opening (the native-restore ordering never double-seats the board)', () => {
    const opened: string[] = []
    const focused: string[] = []
    const faces: LayoutReplayFaces = {
      rightbar: {
        openTab: (kind) => { opened.push(kind) },
        focus: (tabId) => { focused.push(tabId) },
        openTabs: { getSnapshot: () => [{ tabId: 'tab-o1', kind: 'overview' }, { tabId: 'tab-b1', kind: 'board' }] },
      },
      split: { setRatio: () => true },
    }
    const layout = collectProjectLayout({
      rightbar: {
        split: splitOf([{ view: 'board', tabId: 't-b' }], 0.5),
        tabs: rows(['t-1', 'overview'], ['t-b', 'board']),
      },
    })
    const outcome = replayProjectLayout(layout, faces)
    // The restored overview/board rows are FOCUSED (the native per-session
    // restore landed first); the replay adds nothing — 恢复态 stays one board
    // however the two tracks order (the retry leg can flip the ordering).
    expect(opened).toEqual([])
    expect(focused.sort()).toEqual(['tab-b1', 'tab-o1'])
    expect(outcome).toEqual({ planned: 3, issued: 3, degraded: 0 })
  })

  it('degrades per-op (absent faces, thrown verbs, unparseable doc topics) without aborting', () => {
    const issued: string[] = []
    const faces: LayoutReplayFaces = {
      rightbar: {
        openTab: (kind) => {
          if (kind === 'overview') throw new Error('rebind window')
          issued.push(`tab:${kind}`)
        },
      },
    }
    const outcome = replayProjectLayout({
      version: 1,
      sidebar: { collapsed: true },
      tree: TREE,
      rightbar: { panes: [{ tabs: [{ kind: 'guide' }, { kind: 'overview' }, { kind: 'doc', topic: 'not-a-doc-path' }, { kind: 'doc' }] }] },
      detached: [{ view: 'board' }],
    }, faces)
    expect(issued).toEqual(['tab:guide'])
    // sidebar legs (no face) + overview (throw) + doc unparseable + doc topicless + detached (no face).
    expect(outcome).toEqual({ planned: 6, issued: 1, degraded: 5 })
  })

  it('passes the detached identity (target + rect) through windowOpenDetached', async () => {
    const opens: unknown[] = []
    const faces: LayoutReplayFaces = { detached: { openDetached: async (input) => { opens.push(input); return { windowId: 'w-1' } } } }
    replayProjectLayout({
      version: 1,
      sidebar: { collapsed: false },
      tree: TREE,
      rightbar: { panes: [] },
      detached: [{ view: 'conversation', target: TARGET_SUBAGENT, rect: { x: 8, y: 8, width: 480, height: 320 } }],
    }, faces)
    expect(opens).toEqual([{ view: 'conversation', target: TARGET_SUBAGENT, rect: { x: 8, y: 8, width: 480, height: 320 } }])
  })

  it('an openDetached REJECTION degrades quietly (never an unhandled rejection)', async () => {
    const faces: LayoutReplayFaces = { detached: { openDetached: async () => { throw new Error('ERR_WINDOW_OPEN_FAILED') } } }
    const outcome = replayProjectLayout({
      version: 1,
      sidebar: { collapsed: false },
      tree: TREE,
      rightbar: { panes: [] },
      detached: [{ view: 'board' }],
    }, faces)
    expect(outcome.issued).toBe(1)
    await Promise.resolve()
    await Promise.resolve()
  })
})

// ---------------------------------------------------------------------------
// AC1/AC3 — debounce + lifecycle (persistence.ts)
// ---------------------------------------------------------------------------

/** The injectable-clock harness (deterministic debounce tests). */
function makeClock() {
  const queue = new Map<number, { at: number; handler: () => void }>()
  let now = 0
  let nextId = 1
  const clock: LayoutMemoryClock = {
    setTimeout: (handler, ms) => {
      const id = nextId
      nextId += 1
      queue.set(id, { at: now + ms, handler })
      return id
    },
    clearTimeout: (handle) => { queue.delete(handle as number) },
  }
  return {
    clock,
    advance: (ms: number): void => {
      now += ms
      for (const [id, entry] of [...queue.entries()]) {
        if (entry.at <= now) {
          queue.delete(id)
          entry.handler()
        }
      }
    },
    pending: (): number => queue.size,
  }
}

interface VerbsHarness {
  verbs: LayoutMemoryVerbs
  writes: Array<{ projectId: string; layout: ProjectLayout }>
  reads: string[]
  stored: Map<string, ProjectLayout>
  failReads: boolean
  failWrites: boolean
}

/**
 * The ui-state verb pair fake (kernel-shaped: missing row → default layout +
 * stored:false; fix-2's row-exists signal rides every read).
 */
function makeVerbs(): VerbsHarness {
  const harness: VerbsHarness = {
    writes: [],
    reads: [],
    stored: new Map(),
    failReads: false,
    failWrites: false,
    verbs: {
      getProjectUiState: async ({ projectId }) => {
        harness.reads.push(projectId)
        if (harness.failReads) throw new Error('ERR_WORKBENCH_DB')
        return {
          layout: harness.stored.get(projectId) ?? collectProjectLayout({}),
          stored: harness.stored.has(projectId),
        }
      },
      setProjectUiState: async (input) => {
        if (harness.failWrites) throw new Error('ERR_PROJECT_NOT_FOUND')
        harness.writes.push(input)
        harness.stored.set(input.projectId, input.layout)
      },
    },
  }
  return harness
}

const flushMicrotasks = async (): Promise<void> => {
  for (let index = 0; index < 6; index += 1) await Promise.resolve()
}

describe('AC1: debounce — 不为每次拖动即时写', () => {
  it('coalesces a burst of seam reports into ONE trailing write', () => {
    const { clock, advance, pending } = makeClock()
    const { verbs, writes } = makeVerbs()
    const engine = createLayoutMemoryEngine({
      verbs,
      projectId: () => 'p-1',
      clock,
      debounceMs: LAYOUT_WRITE_DEBOUNCE_MS,
    })
    // A ratio drag: every pointer move commits through the seam (4.4 即时存).
    for (let step = 0; step < 25; step += 1) {
      engine.setRightbar({
        split: splitOf([{ view: 'board', tabId: 't-2' }], 0.3 + step * 0.01),
        tabs: rows(['t-1', 'guide'], ['t-2', 'board']),
      })
    }
    expect(writes).toEqual([])
    expect(pending()).toBe(1)
    advance(LAYOUT_WRITE_DEBOUNCE_MS - 1)
    expect(writes).toEqual([])
    advance(1)
    expect(writes.length).toBe(1)
    expect(writes[0]?.projectId).toBe('p-1')
    expect(writes[0]?.layout.rightbar.widthPct).toBe(54) // the LAST commit wins
    engine.dispose()
  })

  it('a clean engine never writes (no churn without changes)', () => {
    const { clock, advance } = makeClock()
    const { verbs, writes } = makeVerbs()
    const engine = createLayoutMemoryEngine({ verbs, projectId: () => 'p-1', clock })
    advance(10_000)
    engine.flush()
    expect(writes).toEqual([])
    engine.dispose()
  })

  it('a rejected write logs and drops (never a throw, never a retry storm)', async () => {
    const { clock, advance } = makeClock()
    const harness = makeVerbs()
    harness.failWrites = true
    const log = vi.fn()
    const engine = createLayoutMemoryEngine({ verbs: harness.verbs, projectId: () => 'p-1', clock, log })
    engine.setTree(TREE)
    advance(LAYOUT_WRITE_DEBOUNCE_MS)
    await flushMicrotasks()
    expect(harness.writes).toEqual([])
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0]?.[0]).toContain('setProjectUiState rejected')
    engine.dispose()
  })

  it('suspends while 未激活 (pointer null schedules nothing)', () => {
    const { clock, advance } = makeClock()
    const { verbs, writes } = makeVerbs()
    const engine = createLayoutMemoryEngine({ verbs, projectId: () => null, clock })
    engine.setTree(TREE)
    advance(10_000)
    expect(writes).toEqual([])
    engine.dispose()
  })
})

describe('AC2: 换台 — write-on-leave + load-and-replay', () => {
  it('flushes the OLD project immediately with the 离开前 fragments, then replays the new', async () => {
    const { clock, advance } = makeClock()
    const { verbs, writes, stored, reads } = makeVerbs()
    stored.set('p-2', collectProjectLayout({
      tree: TREE,
      rightbar: { split: splitOf([{ view: 'board', tabId: 't-9' }], 0.6), tabs: rows(['t-8', 'overview'], ['t-9', 'board']) },
      detached: [{ view: 'board' }],
    }))
    let pointer: string | null = 'p-1'
    const openedTabs: string[] = []
    const faces: LayoutReplayFaces = {
      rightbar: { openTab: (kind) => { openedTabs.push(kind) } },
      split: { setRatio: () => true },
      detached: { openDetached: async () => ({ windowId: 'w-1' }) },
    }
    const engine = createLayoutMemoryEngine({ verbs, projectId: () => pointer, clock, getReplayFaces: () => faces })
    engine.setTree({ expandedProjects: ['p-1'], expandedSessions: [], overflowOpen: [] })
    engine.setSidebar({ collapsed: true, width: 300 })
    // 换台: the pointer moves BEFORE the debounce fires.
    pointer = 'p-2'
    engine.handleProjectChange()
    // The old project's layout landed IMMEDIATELY (离开前布局):
    expect(writes.length).toBe(1)
    expect(writes[0]?.projectId).toBe('p-1')
    expect(writes[0]?.layout.sidebar).toEqual({ collapsed: true, width: 300 })
    expect(writes[0]?.layout.tree.expandedProjects).toEqual(['p-1'])
    // The new project loaded and replayed:
    expect(reads).toEqual(['p-2'])
    await flushMicrotasks()
    expect(openedTabs).toEqual(['overview', 'board'])
    // The pending old timer is gone; a long advance writes nothing new.
    advance(10_000)
    expect(writes.length).toBe(1)
    engine.dispose()
  })

  it('the stale-load guard: a restore racing another switch never replays onto the wrong project', async () => {
    const { clock } = makeClock()
    const { verbs, reads } = makeVerbs()
    let pointer: string | null = 'p-1'
    const openedTabs: string[] = []
    const engine = createLayoutMemoryEngine({
      verbs,
      projectId: () => pointer,
      clock,
      getReplayFaces: () => ({ rightbar: { openTab: (kind) => { openedTabs.push(kind) } } }),
    })
    storedLayout(verbs, 'p-2', { tabs: ['overview', 'board'] })
    storedLayout(verbs, 'p-3', { tabs: ['guide'] })
    pointer = 'p-2'
    engine.handleProjectChange() // p-1 → p-2 (the read goes in flight)
    pointer = 'p-3'
    engine.handleProjectChange() // p-2 → p-3 while the p-2 read is in flight
    await flushMicrotasks()
    expect(reads.sort()).toEqual(['p-2', 'p-3'])
    // Only p-3's restore replays — p-2's was stale (the pointer moved on).
    expect(openedTabs).toEqual(['guide'])
    engine.dispose()
  })

  it('恢复失败 → 默认布局: a failed read replays nothing (the fresh posture IS the default)', async () => {
    const { clock } = makeClock()
    const harness = makeVerbs()
    harness.failReads = true
    const log = vi.fn()
    const faces: LayoutReplayFaces = { rightbar: { openTab: (kind) => { throw new Error(`unexpected:${kind}`) } } }
    let pointer: string | null = null
    const engine = createLayoutMemoryEngine({ verbs: harness.verbs, projectId: () => pointer, clock, log, getReplayFaces: () => faces })
    pointer = 'p-1'
    engine.handleProjectChange()
    await flushMicrotasks()
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0]?.[0]).toContain('getProjectUiState rejected')
    engine.dispose()
  })

  it('无行 = 默认布局 (fix-2): the default-blob restore replays NOTHING and the tree feed stays silent (the §2.3 activation auto-expand survives the first entry)', async () => {
    const { clock, advance } = makeClock()
    const { verbs, writes, reads } = makeVerbs()
    const openedTabs: string[] = []
    // Every replay leg is a TRIPWIRE: the default blob must issue no op.
    const faces: LayoutReplayFaces = {
      sidebar: {
        setWidth: () => { throw new Error('unexpected:sidebar-width') },
        setCollapsed: () => { throw new Error('unexpected:sidebar-collapse') },
      },
      rightbar: { openTab: (kind) => { openedTabs.push(kind) } },
      split: { setRatio: () => { throw new Error('unexpected:split-ratio') } },
      detached: { openDetached: async () => { throw new Error('unexpected:open-detached') } },
    }
    let pointer: string | null = 'p-1'
    const engine = createLayoutMemoryEngine({ verbs, projectId: () => pointer, clock, getReplayFaces: () => faces })
    const restored: Array<TreeLayoutState | undefined> = []
    const unsubscribe = engine.subscribeRestoredTree(() => { restored.push(engine.getRestoredTree()) })
    expect(engine.getRestoredTree()).toBeUndefined()
    // p-2 has NO project_ui_state row — the kernel answers the default
    // blob + stored:false (the fix-2 row-exists signal).
    pointer = 'p-2'
    engine.handleProjectChange()
    await flushMicrotasks()
    expect(reads).toEqual(['p-2'])
    // The tree feed NEVER publishes the empty default block: only the
    // resetFragments notification (undefined) fired. A published empty
    // block hands the browser a parent-fed layout whose sync clobbers the
    // §2.3 activation auto-expand of the just-entered project's group
    // (the SC7-family regression 4.6 diagnosed).
    expect(restored).toEqual([undefined])
    expect(engine.getRestoredTree()).toBeUndefined()
    expect(openedTabs).toEqual([])
    // Collection still runs on a row-less project: the first seam report
    // writes the FIRST row (the next entry then carries a real memory).
    engine.setTree(TREE)
    advance(LAYOUT_WRITE_DEBOUNCE_MS)
    expect(writes.length).toBe(1)
    expect(writes[0]?.projectId).toBe('p-2')
    expect(writes[0]?.layout.tree).toEqual(TREE)
    unsubscribe()
    engine.dispose()
  })
})

/** Seed a stored layout through the verbs fake (kernel-shaped). */
function storedLayout(verbs: LayoutMemoryVerbs, projectId: string, shape: { tabs: readonly string[] }): void {
  void verbs.setProjectUiState({
    projectId,
    layout: collectProjectLayout({ rightbar: { split: splitOf([]), tabs: shape.tabs.map(kind => ({ tabId: `t-${kind}`, kind })) } }),
  }).catch(() => {})
}

describe('AC2: the restore feed (the seat\'s controlled tree layout)', () => {
  it('publishes the restored tree block; the replay echo does not schedule a write', async () => {
    const { clock, advance } = makeClock()
    const { verbs, writes, stored } = makeVerbs()
    stored.set('p-2', collectProjectLayout({ tree: TREE }))
    let pointer: string | null = 'p-1'
    const log = vi.fn()
    const engine = createLayoutMemoryEngine({ verbs, projectId: () => pointer, clock, log })
    const restored: Array<TreeLayoutState | undefined> = []
    const unsubscribe = engine.subscribeRestoredTree(() => { restored.push(engine.getRestoredTree()) })
    expect(engine.getRestoredTree()).toBeUndefined()
    pointer = 'p-2'
    engine.handleProjectChange()
    await flushMicrotasks()
    expect(engine.getRestoredTree()).toEqual(TREE)
    expect(restored.at(-1)).toEqual(TREE)
    // The seat feeds the restored block back through the browser's report:
    engine.setTree(TREE)
    advance(10_000)
    expect(writes).toEqual([]) // echo suppressed — no write-back churn
    // A REAL user edit (different content) schedules normally:
    engine.setTree({ expandedProjects: ['p-2'], expandedSessions: ['s-2'], overflowOpen: [] })
    advance(LAYOUT_WRITE_DEBOUNCE_MS)
    expect(writes.length).toBe(1)
    expect(writes[0]?.layout.tree.expandedSessions).toEqual(['s-2'])
    unsubscribe()
    engine.dispose()
  })
})

describe('AC4: 删除清除 — the no-resurrect disarm', () => {
  it('cancels the removed project\'s pending write (the FK cascade stays final)', () => {
    const { clock, advance } = makeClock()
    const { verbs, writes } = makeVerbs()
    const engine = createLayoutMemoryEngine({ verbs, projectId: () => 'p-1', clock })
    engine.setTree(TREE)
    engine.forget('p-1') // removeProjectNow calls this BEFORE the verb
    advance(10_000)
    expect(writes).toEqual([])
    // Even the leave flush stays quiet:
    engine.handleProjectChange()
    expect(writes).toEqual([])
    engine.dispose()
  })

  it('the pointer fall after a removal never writes the removed project', () => {
    const { clock, advance } = makeClock()
    const { verbs, writes, stored, reads } = makeVerbs()
    stored.set('p-2', collectProjectLayout({ tree: TREE }))
    let pointer: string | null = 'p-1'
    const engine = createLayoutMemoryEngine({ verbs, projectId: () => pointer, clock })
    engine.setSidebar({ collapsed: true })
    engine.forget('p-1')
    pointer = 'p-2' // the kernel cleared the pointer; the store falls to p-2
    engine.handleProjectChange()
    advance(10_000)
    expect(writes).toEqual([]) // p-1 never resurrects; p-2 has no edits yet
    expect(reads).toEqual(['p-2'])
    engine.dispose()
  })

  it('forgetting a NON-active project is a no-op (nothing was tracked for it)', () => {
    const { clock, advance } = makeClock()
    const { verbs, writes } = makeVerbs()
    const engine = createLayoutMemoryEngine({ verbs, projectId: () => 'p-1', clock })
    engine.setTree(TREE)
    engine.forget('p-other')
    advance(LAYOUT_WRITE_DEBOUNCE_MS)
    expect(writes.length).toBe(1) // the active project's write survives untouched
    engine.dispose()
  })

  it('dispose tears everything down (no late writes, no listener leaks)', () => {
    const { clock, advance } = makeClock()
    const { verbs, writes } = makeVerbs()
    const engine = createLayoutMemoryEngine({ verbs, projectId: () => 'p-1', clock })
    engine.setTree(TREE)
    engine.dispose()
    advance(10_000)
    expect(writes).toEqual([])
  })
})

describe('replayNow — the boot service-race retry leg', () => {
  it('re-loads + re-replays the CURRENT project (idempotent)', async () => {
    const { clock } = makeClock()
    const { verbs, reads, stored } = makeVerbs()
    stored.set('p-1', collectProjectLayout({ rightbar: { split: splitOf([]), tabs: rows(['t-g', 'guide']) } }))
    const openedTabs: string[] = []
    let facesPresent = false
    const engine = createLayoutMemoryEngine({
      verbs,
      projectId: () => 'p-1',
      clock,
      getReplayFaces: () => (facesPresent ? { rightbar: { openTab: (kind) => { openedTabs.push(kind) } } } : undefined),
    })
    engine.replayNow()
    await flushMicrotasks()
    expect(openedTabs).toEqual([]) // the service had not landed yet
    facesPresent = true
    engine.replayNow()
    await flushMicrotasks()
    expect(openedTabs).toEqual(['guide'])
    expect(reads.length).toBe(2)
    engine.dispose()
  })

  it('an IDENTICAL re-read does not re-notify the restore feed (the boot retry must not clobber the §2.3 activation auto-expand)', async () => {
    const { clock } = makeClock()
    const { verbs, stored } = makeVerbs()
    stored.set('p-1', collectProjectLayout({ tree: TREE }))
    const engine = createLayoutMemoryEngine({ verbs, projectId: () => 'p-1', clock })
    const notifications: number[] = []
    const unsubscribe = engine.subscribeRestoredTree(() => { notifications.push(engine.getRestoredTree()?.expandedProjects.length ?? -1) })
    engine.replayNow()
    await flushMicrotasks()
    expect(notifications.length, 'the first restore (undefined → content) notifies').toBe(1)
    // The boot service-race retry re-reads the SAME stored layout: the
    // content-equal restore echo stays silent — a re-notify would hand the
    // browser a fresh parent-fed reference and clobber whatever the live
    // tree did in between (4.6 SC4 e2e finding).
    engine.replayNow()
    await flushMicrotasks()
    expect(notifications.length, 'the identical re-read notifies nothing').toBe(1)
    expect(engine.getRestoredTree()).toEqual(TREE)
    // A REAL content change (a different stored tree) still notifies.
    stored.set('p-1', collectProjectLayout({ tree: { expandedProjects: ['p-9'], expandedSessions: [], overflowOpen: [] } }))
    engine.replayNow()
    await flushMicrotasks()
    expect(notifications.length).toBe(2)
    unsubscribe()
    engine.dispose()
  })
})

describe('degraded-replay retry — the boot seat-race arm (failed subset only, bounded)', () => {
  /** The boot-race world: the rightbar FACE exists but its controller throws
   * between seat bindings — every open degrades on the first pass. */
  const makeThrowingRightbar = (): {
    readonly opened: string[]
    seatBound: boolean
    readonly face: { openTab(kind: string, options?: { params?: unknown }): void }
  } => {
    const opened: string[] = []
    const state = { seatBound: false }
    return {
      opened,
      get seatBound() { return state.seatBound },
      set seatBound(value: boolean) { state.seatBound = value },
      face: {
        openTab(kind, options) {
          if (!state.seatBound) throw new Error('controller between seat bindings')
          opened.push(kind + (options?.params !== undefined ? `:${String((options.params as { path?: string }).path ?? '')}` : ''))
        },
      },
    }
  }

  it('re-issues ONLY the degraded ops once the seat binds (a failed open landed nothing — no duplicates)', async () => {
    const { clock, advance, pending } = makeClock()
    const { verbs, stored } = makeVerbs()
    stored.set('p-1', collectProjectLayout({
      rightbar: {
        split: splitOf([{ view: 'board', tabId: 't-b' }], 0.4),
        tabs: rows(['t-1', 'overview'], ['t-b', 'board']),
      },
    }))
    const rightbar = makeThrowingRightbar()
    const ratios: number[] = []
    const engine = createLayoutMemoryEngine({
      verbs,
      projectId: () => 'p-1',
      clock,
      getReplayFaces: () => ({ rightbar: rightbar.face, split: { setRatio: ratio => { ratios.push(ratio); return true } } }),
    })
    engine.replayNow()
    await flushMicrotasks()
    // First pass: the two opens degrade (the seat window); the ratio op rides
    // a live face and issues immediately — only the failed subset retries.
    expect(rightbar.opened).toEqual([])
    expect(ratios).toEqual([0.4])
    rightbar.seatBound = true
    advance(LAYOUT_REPLAY_RETRY_MS)
    expect(rightbar.opened.sort()).toEqual(['board', 'overview'])
    for (let step = 0; step < 12; step += 1) advance(LAYOUT_REPLAY_RETRY_MS)
    expect(rightbar.opened.length, 'the issued ops are never re-run (no duplicates)').toBe(2)
    expect(ratios, 'the issued ratio op is never re-run either').toEqual([0.4])
    expect(pending()).toBe(0)
    engine.dispose()
  })

  it('a seat that never binds stops at the bound (no retry storm)', async () => {
    const { clock, advance, pending } = makeClock()
    const { verbs, stored } = makeVerbs()
    stored.set('p-1', collectProjectLayout({ rightbar: { split: splitOf([]), tabs: rows(['t-1', 'overview']) } }))
    const rightbar = makeThrowingRightbar()
    const log: string[] = []
    const engine = createLayoutMemoryEngine({
      verbs, projectId: () => 'p-1', clock, log: message => log.push(message),
      getReplayFaces: () => ({ rightbar: rightbar.face }),
    })
    engine.replayNow()
    await flushMicrotasks()
    for (let step = 0; step < LAYOUT_REPLAY_RETRY_LIMIT + 2; step += 1) advance(LAYOUT_REPLAY_RETRY_MS)
    expect(rightbar.opened).toEqual([])
    expect(pending(), 'the series terminates at the bound').toBe(0)
    expect(log.some(line => line.includes('replay degraded')), 'the degrade was logged').toBe(true)
    engine.dispose()
  })

  it('a stale series never replays onto the wrong project (the pointer-move guard)', async () => {
    const { clock, advance } = makeClock()
    const { verbs, stored } = makeVerbs()
    stored.set('p-1', collectProjectLayout({ rightbar: { split: splitOf([]), tabs: rows(['t-1', 'overview']) } }))
    const rightbar = makeThrowingRightbar()
    let pointer: string | null = 'p-1'
    const engine = createLayoutMemoryEngine({
      verbs, projectId: () => pointer, clock,
      getReplayFaces: () => ({ rightbar: rightbar.face }),
    })
    engine.replayNow()
    await flushMicrotasks()
    pointer = 'p-2' // the switch: the wiring's handleProjectChange cancels the
    // timer via resetFragments; the guard inside a fired timer is the second
    // line — neither may replay p-1's ops after the move.
    rightbar.seatBound = true
    for (let step = 0; step < 12; step += 1) advance(LAYOUT_REPLAY_RETRY_MS)
    expect(rightbar.opened, 'the stale series never fires').toEqual([])
    engine.dispose()
  })
})
