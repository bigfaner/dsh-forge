// @vitest-environment jsdom
// Task 4.4 — the UF2 EXISTING-PAGE integration units (tech-design
// §Integration Specs #2): the 4.3 stage components wired into
// views/features/* — the deviation badge on the feature card + detail
// header, the stepper gate verdict + hint line, the advance entry in the
// detail header, the sixth 「阶段资产」 tab appended at the strip's END, and
// the stage_advanced / deviation_detected board reflux (≤5s). AC map:
//   AC1 卡偏离徽标 — deviated=true renders the warn pill beside the status
//      Pill (the M2 card structure otherwise untouched); false/absent = no
//      badge node at all
//   AC2 详情头部强化 — getStageGate verdict drives the stepper gate-pending
//      node + the GateHint line; the advance entry sits in the header and a
//      gate refusal is OBSERVABLE (引导文案 + 缺失清单); advance success
//      reloads the board + re-reads the gate through stage_advanced
//   AC3 第六 tab — 「阶段资产」 appended at the END (M2 five-tab strip
//      untouched without a stage face); grouped cards 只读;空态;回流重拉
//   AC4 组件级可见性 — the real-chain form (FeaturesView over the bridge)
//      fires getStageGate with qualified args and the tab renders the
//      bridge's content-joined rows (the doc-root stages/ join is the
//      kernel verb's own leg — 6.6 SC4 data path)
//   AC5 M2 回归 — without a stage face the page renders the 5.9 form
//      byte-for-byte (five tabs, no badge, no advance entry)
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import { FeaturesPage } from '../src/client/views/FeaturesPage.tsx'
import type { FeaturesPageProps } from '../src/client/views/FeaturesPage.tsx'
import { FeaturesView } from '../src/client/views/features/FeaturesView.tsx'
import type { FeaturesViewProps } from '../src/client/views/features/FeaturesView.tsx'
import type { FeatureBoardData, FeatureSummary, StageGateInfo, WorkbenchState } from '../src/client/ipc-types.ts'
import type { WorkbenchIpcBridge } from '../src/client/ipc/workbench.ts'
import { createMockStageFace, MOCK_STAGE_ASSETS } from '../src/client/mocks/workbench.ts'

type Dict = Record<WorkbenchKey, string>
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]
const t = bind(en)

const PROJECT_ID = 'proj-uf2'
const SLUG = 'dsh-forge-m2'

const $ = (selector: string): HTMLElement => document.querySelector(selector) as HTMLElement
const $$ = (selector: string): HTMLElement[] =>
  [...document.querySelectorAll(selector)] as HTMLElement[]

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  delete (globalThis as { dshForge?: unknown }).dshForge
})

/** One board row (the client twin's optional deviated drives the badge). */
const row = (overrides: Partial<FeatureSummary> = {}): FeatureSummary => ({
  slug: SLUG, status: 'in-progress', docKinds: ['manifest'],
  taskTotal: 10, taskCompleted: 3, updatedAt: '2026-09-24T08:00:00.000Z',
  ...overrides,
})

const board = (features: readonly FeatureSummary[]): FeatureBoardData =>
  ({ features, generatedAt: 'now' })

/** The gate verdict (the stepper's data source). */
const gate = (summaryGenerated: boolean, stage = 'tasks'): StageGateInfo => ({
  featureSlug: SLUG, stage, summaryGenerated,
  gateAssetPath: summaryGenerated ? `${SLUG}/stages/${stage}.md` : null,
  assets: MOCK_STAGE_ASSETS,
})

/** The gated stage face twin: the gate verdict + the 4.3 mock semantics. */
const stageFaceOf = (verdict: StageGateInfo) => {
  const face = createMockStageFace({ projectId: PROJECT_ID, featureSlug: SLUG, gate: verdict })
  return face
}

/** Render the page's detail form (board + doc + stage faces injected). */
async function renderDetail(props: Partial<FeaturesPageProps> = {}) {
  const loadFeatureBoard = props.face?.loadFeatureBoard
    ?? vi.fn(async () => board([row()]))
  const readFeatureDoc = props.docFace?.readFeatureDoc
    ?? vi.fn(async () => ({ kind: 'manifest', markdown: '# body' }))
  render(
    <FeaturesPage
      t={t}
      projectId={PROJECT_ID}
      featureSlug={SLUG}
      face={{ loadFeatureBoard }}
      docFace={{ readFeatureDoc }}
      onBack={() => {}}
      {...props}
    />,
  )
  await waitFor(() => { expect($(`[data-dsh-forge-feature-detail="${SLUG}"]`)).not.toBeNull() })
  return { loadFeatureBoard: loadFeatureBoard as ReturnType<typeof vi.fn> }
}

// ---------------------------------------------------------------------------
// AC1: the feature card's deviation badge (状态 Pill 侧;M2 卡结构其余不动)
// ---------------------------------------------------------------------------

describe('UF2 integration — feature 卡偏离徽标 (AC1)', () => {
  it('deviated=true renders the warn badge BESIDE the status pill; the M2 card structure otherwise unchanged', async () => {
    render(
      <FeaturesPage
        t={t}
        projectId={PROJECT_ID}
        face={{ loadFeatureBoard: vi.fn(async () => board([row({ deviated: true })])) }}
      />,
    )
    await waitFor(() => { expect($(`[data-dsh-forge-feature-card="${SLUG}"]`)).not.toBeNull() })
    const badge = $('[data-dsh-forge-badge="deviation"]')
    expect(badge).not.toBeNull()
    expect(badge.textContent).toBe(en['features.stages.deviation'])
    expect(badge.getAttribute('title')).toBe(en['features.stages.deviation.tooltip'])
    // 状态 Pill 侧 = the badge sits in the title row AFTER the status pill.
    const titleRow = $('[data-dsh-forge-feature-card]').querySelector('span') as HTMLElement
    const statusPill = $('[data-dsh-forge-feature-status="in-progress"]')
    expect(titleRow.contains(statusPill)).toBe(true)
    expect(statusPill.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    // M2 卡结构其余不动:slug/status/进度/时间 all still present.
    expect($(`[data-dsh-forge-feature-card="${SLUG}"]`).textContent).toContain(SLUG)
    expect($(`[data-dsh-forge-feature-card="${SLUG}"]`).textContent).toContain('3/10')
  })

  it('deviated=false/absent keeps the M2 card (no badge node — never a placeholder)', async () => {
    render(
      <FeaturesPage
        t={t}
        projectId={PROJECT_ID}
        face={{ loadFeatureBoard: vi.fn(async () => board([row()])) }}
      />,
    )
    await waitFor(() => { expect($(`[data-dsh-forge-feature-card="${SLUG}"]`)).not.toBeNull() })
    expect($('[data-dsh-forge-badge="deviation"]')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// AC2: 详情头部 — stepper 门态 + 提示行 + 推进按钮(门拒绝可观察)
// ---------------------------------------------------------------------------

describe('UF2 integration — 详情头部 stepper 门态强化 (AC2)', () => {
  it('gate unsatisfied: the CURRENT stepper node flips gate-pending + the GateHint line renders', async () => {
    await renderDetail({ stageFace: stageFaceOf(gate(false)) })
    await waitFor(() => {
      expect($('[data-dsh-forge-stepper-state="gate-pending"]')).not.toBeNull()
    })
    expect($('[data-dsh-forge-stepper-state="gate-pending"]').getAttribute('data-dsh-forge-stepper-phase'))
      .toBe('in-progress')
    expect($('[data-dsh-forge-gate-hint-line]').textContent).toBe(en['features.stages.gateHint'])
  })

  it('gate satisfied: the M2 normal stepper (current node) and NO hint line', async () => {
    await renderDetail({ stageFace: stageFaceOf(gate(true)) })
    await waitFor(() => { expect($('[data-dsh-forge-stepper-state="current"]')).not.toBeNull() })
    expect($('[data-dsh-forge-stepper-state="gate-pending"]')).toBeNull()
    expect($('[data-dsh-forge-gate-hint-line]')).toBeNull()
  })

  it('a gate read failure degrades to the M2 presentation (no gate state, no hint)', async () => {
    const getStageGate = vi.fn(async () => { throw new Error(JSON.stringify({ code: 'ERR_WORKBENCH_DB', message: 'gate read failed' })) })
    await renderDetail({ stageFace: { getStageGate } })
    await waitFor(() => { expect($('[data-dsh-forge-stepper-state="current"]')).not.toBeNull() })
    expect($('[data-dsh-forge-stepper-state="gate-pending"]')).toBeNull()
    expect($('[data-dsh-forge-gate-hint-line]')).toBeNull()
  })

  it('terminal completed carries no gate verdict face (nothing left to advance)', async () => {
    await renderDetail({
      stageFace: stageFaceOf({ ...gate(true, 'completed'), stage: 'completed' }),
      face: { loadFeatureBoard: vi.fn(async () => board([row({ status: 'completed', taskCompleted: 10 })])) },
    })
    await waitFor(() => { expect($('[data-dsh-forge-stepper-state="current"]').getAttribute('data-dsh-forge-stepper-phase')).toBe('completed') })
    expect($('[data-dsh-forge-gate-hint-line]')).toBeNull()
    expect($('[data-dsh-forge-advance-entry]')).toBeNull()
  })
})

describe('UF2 integration — 详情头部推进按钮 (AC2)', () => {
  it('the advance entry sits in the detail header; a gate refusal is OBSERVABLE (引导 + 缺失清单)', async () => {
    await renderDetail({ stageFace: stageFaceOf(gate(false)) })
    const entry = $('[data-dsh-forge-advance-entry]')
    expect(entry).not.toBeNull()
    expect(entry.textContent).toContain(en['features.stages.advance'])
    // 头部落位:the entry lives inside the header row.
    expect($('[data-dsh-forge-feature-header]').contains(entry)).toBe(true)
    fireEvent.click(entry)
    await waitFor(() => {
      expect($('[data-dsh-forge-gate-hint-rejected="ERR_STAGE_GATE_UNSATISFIED"]')).not.toBeNull()
    })
    expect($('[data-dsh-forge-gate-hint-rejected]').textContent)
      .toContain(`missing: features/${SLUG}/stages/tasks.md`)
  })

  it('advance success reloads the board verb AND re-reads the gate (the new stage gate is pending)', async () => {
    const face = stageFaceOf(gate(true))
    const getStageGate = vi.fn(face.getStageGate)
    const wired = { ...face, getStageGate }
    const { loadFeatureBoard } = await renderDetail({ stageFace: wired })
    const before = loadFeatureBoard.mock.calls.length
    const gateBefore = getStageGate.mock.calls.length
    fireEvent.click($('[data-dsh-forge-advance-entry]'))
    await waitFor(() => {
      // onStageAdvanced reload + the stage_advanced reflux re-read.
      expect(loadFeatureBoard.mock.calls.length).toBeGreaterThan(before)
    })
    await waitFor(() => {
      expect(getStageGate.mock.calls.length).toBeGreaterThan(gateBefore)
    })
    // The mock's post-advance gate: the NEW stage (in-progress) is pending.
    await waitFor(() => {
      expect($('[data-dsh-forge-stepper-state="gate-pending"]').getAttribute('data-dsh-forge-stepper-phase'))
        .toBe('in-progress')
    })
  })

  it('no stage face = no advance entry (the M2 detail form — AC5)', async () => {
    await renderDetail()
    expect($('[data-dsh-forge-advance-entry]')).toBeNull()
  })

  it('the deviation badge lands in the DETAIL header for a deviated feature', async () => {
    await renderDetail({
      face: { loadFeatureBoard: vi.fn(async () => board([row({ deviated: true })])) },
    })
    const badge = $('[data-dsh-forge-badge="deviation"]')
    expect(badge).not.toBeNull()
    expect($('[data-dsh-forge-feature-header]').contains(badge)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// AC3: 第六「阶段资产」tab(末位;分组卡;空态;回流)
// ---------------------------------------------------------------------------

describe('UF2 integration — 第六「阶段资产」tab (AC3)', () => {
  it('appends the assets tab at the END when the stage read leg exists; absent stage face keeps the five-tab M2 form (AC5)', async () => {
    await renderDetail({ stageFace: stageFaceOf(gate(true)) })
    expect($$('[data-dsh-forge-feature-doc-tab]').map(tab => tab.dataset.dshForgeFeatureDocTab))
      .toEqual(['manifest', 'prd', 'design', 'ui', 'tasks', 'assets'])
    expect($('[data-dsh-forge-feature-doc-tab="assets"]').textContent).toBe(en['features.stages.assets.tab'])
    cleanup()

    await renderDetail()
    expect($$('[data-dsh-forge-feature-doc-tab]').map(tab => tab.dataset.dshForgeFeatureDocTab))
      .toEqual(['manifest', 'prd', 'design', 'ui', 'tasks'])
  })

  it('clicking the tab renders the grouped asset cards read-only (the verb rows — AC4 组件级可见性)', async () => {
    await renderDetail({ stageFace: stageFaceOf(gate(true)) })
    fireEvent.click($('[data-dsh-forge-feature-doc-tab="assets"]'))
    await waitFor(() => {
      expect($('[data-dsh-forge-feature-doc-panel="assets"]')).not.toBeNull()
    })
    const cards = $$('[data-dsh-forge-stage-asset]')
    expect(cards.map(card => card.dataset.dshForgeStageAsset)).toEqual(['prd', 'design'])
    expect($('[data-dsh-forge-stage-asset="prd"]').textContent).toContain('把 forge 项目装进工作台。')
    expect($('[data-dsh-forge-stage-asset="design"]').textContent).toContain('SQLite 快照与感知链路。')
    // 只读:the assets panel carries zero interactive elements.
    expect($('[data-dsh-forge-feature-doc-panel="assets"]').querySelectorAll('button, a, img, form, input'))
      .toHaveLength(0)
    // The doc read never fires for the assets panel.
    expect($('[data-dsh-forge-feature-doc-panel="manifest"]')).toBeNull()
  })

  it('empty assets render the 空态 copy', async () => {
    const face = createMockStageFace({ projectId: PROJECT_ID, featureSlug: SLUG, gate: gate(true), assets: [] })
    await renderDetail({ stageFace: face })
    fireEvent.click($('[data-dsh-forge-feature-doc-tab="assets"]'))
    await waitFor(() => { expect($('[data-dsh-forge-stage-assets-empty]')).not.toBeNull() })
    expect($('[data-dsh-forge-stage-assets-empty]').textContent).toContain(en['features.stages.assets.empty.title'])
  })

  it('the roving keyboard contract reaches the sixth tab (End → assets)', async () => {
    await renderDetail({
      stageFace: stageFaceOf(gate(true)),
      face: {
        loadFeatureBoard: vi.fn(async () => board([row({ docKinds: ['manifest', 'prd'] })])),
      },
    })
    const manifest = $('[data-dsh-forge-feature-doc-tab="manifest"]')
    manifest.focus()
    fireEvent.keyDown($('[data-dsh-forge-feature-doc-tabs]'), { key: 'End' })
    expect(document.activeElement?.getAttribute('data-dsh-forge-feature-doc-tab')).toBe('assets')
    expect($('[data-dsh-forge-feature-doc-panel="assets"]')).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// AC3 (回流): stage_advanced / deviation_detected → board reload (≤5s)
// ---------------------------------------------------------------------------

describe('UF2 integration — 事件回流 (AC3 reflux)', () => {
  it('a deviation_detected event for THIS project reloads the board and the badge appears (即时出现)', async () => {
    const face = stageFaceOf(gate(true))
    let deviated = false
    const loadFeatureBoard = vi.fn(async (): Promise<FeatureBoardData> => board([row({ deviated })]))
    render(
      <FeaturesPage
        t={t}
        projectId={PROJECT_ID}
        face={{ loadFeatureBoard }}
        stageFace={face}
      />,
    )
    await waitFor(() => { expect($(`[data-dsh-forge-feature-card="${SLUG}"]`)).not.toBeNull() })
    expect($('[data-dsh-forge-badge="deviation"]')).toBeNull()
    const callsBefore = loadFeatureBoard.mock.calls.length
    // The external cross-stage operation lands:the watcher's event + the
    // refreshed board carry the flag.
    deviated = true
    face.emit([{ type: 'deviation_detected', projectId: PROJECT_ID, featureSlug: SLUG }])
    await waitFor(() => { expect($('[data-dsh-forge-badge="deviation"]')).not.toBeNull() })
    expect(loadFeatureBoard.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('a deviation event for ANOTHER project does not reload this board', async () => {
    const face = stageFaceOf(gate(true))
    const loadFeatureBoard = vi.fn(async (): Promise<FeatureBoardData> => board([row()]))
    render(
      <FeaturesPage
        t={t}
        projectId={PROJECT_ID}
        face={{ loadFeatureBoard }}
        stageFace={face}
      />,
    )
    await waitFor(() => { expect($(`[data-dsh-forge-feature-card="${SLUG}"]`)).not.toBeNull() })
    const callsBefore = loadFeatureBoard.mock.calls.length
    face.emit([{ type: 'deviation_detected', projectId: 'other-project' }])
    await new Promise((resolve) => { setTimeout(resolve, 30) })
    expect(loadFeatureBoard.mock.calls.length).toBe(callsBefore)
  })

  it('a stage_advanced event reloads the board (external advances refresh the detail)', async () => {
    const face = stageFaceOf(gate(true))
    const loadFeatureBoard = vi.fn(async (): Promise<FeatureBoardData> => board([row()]))
    render(
      <FeaturesPage
        t={t}
        projectId={PROJECT_ID}
        featureSlug={SLUG}
        face={{ loadFeatureBoard }}
        docFace={{ readFeatureDoc: vi.fn(async () => ({ kind: 'manifest', markdown: '# b' })) }}
        stageFace={face}
      />,
    )
    await waitFor(() => { expect($(`[data-dsh-forge-feature-detail="${SLUG}"]`)).not.toBeNull() })
    const callsBefore = loadFeatureBoard.mock.calls.length
    face.emit([{ type: 'stage_advanced', projectId: PROJECT_ID, featureSlug: SLUG }])
    await waitFor(() => { expect(loadFeatureBoard.mock.calls.length).toBeGreaterThan(callsBefore) })
  })
})

// ---------------------------------------------------------------------------
// AC4: the real chain — FeaturesView over the bridge (组件级可见性)
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
    readFeatureDoc: async () => ({ kind: 'manifest', markdown: '' }),
    listPlugins: async () => [],
    setPluginEnabled: async () => [],
    recordSessionLink: async () => ({}),
    endSessionLink: async () => undefined,
    authorizeExternalDocPath: async () => undefined,
    getMigrationStatus: async () => ({ authority: 'files', deviated: false, migratedAt: null, lastEvent: null, indexJsonDetected: false }),
    startMigration: async () => ({ started: true }),
    probeCodeRoot: async () => ({ available: true, taskTotal: 0, featureTotal: 0, indexJsonDetected: false }),
    getWorkbenchPaths: async () => ({ docsRoot: 'Z:/ud/docs', backupsRoot: 'Z:/ud/backups' }),
    taskAdd: async () => ({}) as never,
    taskClaim: async () => ({}) as never,
    taskTransition: async () => ({}) as never,
    taskSubmit: async () => ({}) as never,
    taskReopen: async () => ({}) as never,
    taskGet: async () => ({}) as never,
    taskQuery: async () => [],
    knowledgeFact: async () => ({}) as never,
    knowledgeLesson: async () => ({}) as never,
    knowledgeResearch: async () => ({}) as never,
    knowledgeForensic: async () => ({}) as never,
    featureList: async () => [],
    featureStatus: async () => ({}) as never,
    getPrefs: async () => [],
    setPrefs: async () => undefined,
    clearPrefOverride: async () => undefined,
    receiveApproval: async () => ({}) as never,
    decideApproval: async () => ({}) as never,
    notifySessionStarted: async () => ({}) as never,
    notifyLaunchFailed: async () => ({}) as never,
    checkStageArtifacts: async () => ({ stage: 'tasks', satisfied: true, missing: [] }),
    dispatchTasks: async () => ({ dispatched: [] }),
    redispatch: async () => ({ dispatched: [] }),
    getDispatches: async () => [],
    listApprovals: async () => [],
    advanceStage: async () => ({}) as never,
    stageSummarize: async () => ({}) as never,
    getStageGate: async () => ({}) as never,
    listStageAssets: async () => [],
    // M3 proposals 读段(任务 5.3;BRIDGE_MEMBERS presence check 全员可调)。
    getProposalBoard: async () => ({ proposals: [], generatedAt: '', proposalsRoot: 'Z:/docs/proposals' }),
    readProposalDoc: async () => ({ kind: 'proposal', markdown: '' }),
    onEvents: () => () => {},
    ...overrides,
  } as unknown as WorkbenchIpcBridge
}

const REAL_STATE: WorkbenchState = {
  projects: [{
    id: PROJECT_ID, displayName: 'real', codeRoot: 'Z:\\real', docLocationType: 'in_repo',
    docLocationPath: null, createdAt: '2026-09-22T08:00:00.000Z', lastActivatedAt: null,
  }],
  activeProjectId: PROJECT_ID,
  plugins: [],
}

describe('UF2 integration — the real chain (FeaturesView over the bridge) (AC4)', () => {
  it('bridge live: the detail fires getStageGate with qualified args and the sixth tab renders the bridge rows', async () => {
    const calls = { getStageGate: [] as string[], listStageAssets: [] as string[] }
    ;(globalThis as { dshForge?: unknown }).dshForge = {
      workbench: fullBridgeFake({
        getState: async () => REAL_STATE,
        getFeatureBoard: async () => board([row({ deviated: true })]),
        getStageGate: async (projectId: string, slug: string) => {
          calls.getStageGate.push(`${projectId}|${slug}`)
          return gate(true)
        },
        listStageAssets: async (projectId: string, slug: string) => {
          calls.listStageAssets.push(`${projectId}|${slug}`)
          return MOCK_STAGE_ASSETS
        },
      }),
    }
    const props: FeaturesViewProps = { t, featureSlug: SLUG, onRegister: () => {} }
    render(<FeaturesView {...props} />)
    await waitFor(() => { expect($(`[data-dsh-forge-feature-detail="${SLUG}"]`)).not.toBeNull() })
    await waitFor(() => { expect(calls.getStageGate).toEqual([`${PROJECT_ID}|${SLUG}`]) })
    // The badge rides the board DTO (feature_snapshot 增列投影).
    expect($('[data-dsh-forge-badge="deviation"]')).not.toBeNull()
    // 第六 tab present on the real chain (详情 tab 数 5 → 6).
    expect($$('[data-dsh-forge-feature-doc-tab]')).toHaveLength(6)
    fireEvent.click($('[data-dsh-forge-feature-doc-tab="assets"]'))
    await waitFor(() => {
      expect($$('[data-dsh-forge-stage-asset]').map(card => card.dataset.dshForgeStageAsset))
        .toEqual(['prd', 'design'])
    })
    expect(calls.listStageAssets).toEqual([`${PROJECT_ID}|${SLUG}`])
  })

  it('the seat form injects the stage face through WorkbenchFeaturesSeat.stageFace', async () => {
    const face = stageFaceOf(gate(true))
    render(
      <FeaturesView
        t={t}
        featureSlug={SLUG}
        onRegister={() => {}}
        seat={{
          face: { loadFeatureBoard: vi.fn(async () => board([row()])) },
          stageFace: face,
        }}
        chromeProjectId={PROJECT_ID}
      />,
    )
    await waitFor(() => { expect($('[data-dsh-forge-advance-entry]')).not.toBeNull() })
    expect($$('[data-dsh-forge-feature-doc-tab]')).toHaveLength(6)
  })
})
