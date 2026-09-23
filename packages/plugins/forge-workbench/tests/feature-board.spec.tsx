// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DOC_KIND_LABEL_KEYS, FEATURE_DOC_KINDS, FEATURE_STATUSES, FEATURE_STATUS_LABEL_KEYS,
  FEATURE_STATUS_PHASE, docKindLabel, featureStatusLabel, isDocKind, isFeatureStatus,
} from '../src/client/i18n/feature-status.ts'
import { FeatureDocs } from '../src/client/views/features/FeatureDocs.tsx'
import type { FeatureDocsProps } from '../src/client/views/features/FeatureDocs.tsx'
import { FeaturesPage } from '../src/client/views/FeaturesPage.tsx'
import type { FeaturesPageProps } from '../src/client/views/FeaturesPage.tsx'
import { WorkbenchShell } from '../src/client/WorkbenchShell.tsx'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import { zh } from '../src/client/locale/zh.ts'
import {
  MOCK_FEATURE_BOARD, MOCK_FEATURE_BOARD_EMPTY, createMockFeatureBoardFace, createMockFeatureDocFace,
} from '../src/client/mocks/workbench.ts'
import type { DocKind, FeatureDoc } from '../src/client/ipc-types.ts'
import type { WorkbenchShellProps } from '../src/client/contract.ts'
import type { ViewKeySnapshot, WorkbenchTabKey } from '../src/client/store/view-key.ts'

// Task 5.9 — the UF4 feature board BUILD units (mocked faces; 5.16 wires the
// IPC verbs). AC map:
//   AC1 list render (slug/status 徽标词表直通含 'in-progress' 连字符/任务进度
//       点/updatedAt) · AC2 detail stepper (词表英文标签共享常量 + aria-current)
//   · AC3 五类文档 tab (docKinds 缺失禁用 + 只读渲染 + loading/读取失败/
//       ERR_SNAPSHOT_STALE 三分支) · AC4 m1 completed 完成徽标
//       (taskCompleted=taskTotal 判定,不重算) · AC5 列表↔详情切换经 view-key
//       子视图语义 + 返回保留列表态 · AC6 this suite itself.
// Hard Rules: status 词表直通不改写; 词表常量与 5.5 同源 (feature-status.ts).

// The shell integration renders the real WorkbenchShell — the ui-primitives
// and ReactFlow lib boundaries get the task-board.spec standins.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconBranchOutline16: () => null,
  StateDot: (props: { state: string }) => <span data-mock-state-dot={props.state} />,
}))
vi.mock('@xyflow/react', async () => await import('./helpers/xyflow-standin'))

type Dict = Record<WorkbenchKey, string>
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]
const t = { en: bind(en), zh: bind(zh) }

const $ = (selector: string): HTMLElement => document.querySelector(selector) as HTMLElement
const $$ = (selector: string): HTMLElement[] =>
  [...document.querySelectorAll(selector)] as HTMLElement[]

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// The feature-status vocabulary (AC2/AC3: 词表常量 + 直通)
// ---------------------------------------------------------------------------

describe('feature vocabulary: order, phases, narrowers', () => {
  it('FEATURE_STATUSES is the canonical lifecycle order; the phase map indexes into it', () => {
    expect([...FEATURE_STATUSES]).toEqual(['prd', 'design', 'tasks', 'in-progress', 'completed'])
    for (const status of FEATURE_STATUSES) {
      expect(FEATURE_STATUS_PHASE[status]).toBe(FEATURE_STATUSES.indexOf(status))
    }
  })

  it('FEATURE_DOC_KINDS is the fixed canonical tab order', () => {
    expect([...FEATURE_DOC_KINDS]).toEqual(['manifest', 'prd', 'design', 'ui', 'tasks'])
  })

  it('the narrowers accept only their vocabulary', () => {
    expect(isFeatureStatus('in-progress')).toBe(true)
    expect(isFeatureStatus('in_progress')).toBe(false) // task vocabulary, not ours
    expect(isFeatureStatus(7)).toBe(false)
    expect(isDocKind('ui')).toBe(true)
    expect(isDocKind('proposal')).toBe(false)
  })

  it('词表直通: every label key resolves to the RAW manifest token in BOTH locales', () => {
    for (const status of FEATURE_STATUSES) {
      const key = FEATURE_STATUS_LABEL_KEYS[status]
      expect(en[key]).toBe(status)
      expect(zh[key]).toBe(status)
      expect(featureStatusLabel(status, t.en)).toBe('in-progress' === status ? 'in-progress' : status)
    }
    for (const kind of FEATURE_DOC_KINDS) {
      expect(en[DOC_KIND_LABEL_KEYS[kind]]).toBe(kind)
      expect(zh[DOC_KIND_LABEL_KEYS[kind]]).toBe(kind)
      expect(docKindLabel(kind, t.zh)).toBe(kind)
    }
  })
})

// ---------------------------------------------------------------------------
// The mock twins (build-stage semantics)
// ---------------------------------------------------------------------------

describe('mock twins: board + doc faces', () => {
  it('createMockFeatureBoardFace resolves the fixture; the empty variant is empty', async () => {
    await expect(createMockFeatureBoardFace().loadFeatureBoard('p1'))
      .resolves.toBe(MOCK_FEATURE_BOARD)
    await expect(createMockFeatureBoardFace(MOCK_FEATURE_BOARD_EMPTY).loadFeatureBoard('p1'))
      .resolves.toBe(MOCK_FEATURE_BOARD_EMPTY)
  })

  it('createMockFeatureDocFace resolves known docs, rejects unknown reads, failWith arms rejections', async () => {
    const face = createMockFeatureDocFace()
    const doc = await face.readFeatureDoc('p1', 'dsh-forge-m2', 'manifest')
    expect(doc.kind).toBe('manifest')
    expect(doc.markdown).toContain('dsh-forge-m2')
    // A kind the fixture never declares (m2 has no ui doc):
    await expect(face.readFeatureDoc('p1', 'dsh-forge-m2', 'ui')).rejects.toMatchObject({
      code: 'ERR_WORKBENCH_DB',
    })
    face.failWith('dsh-forge-m2', 'manifest', { code: 'ERR_SNAPSHOT_STALE', message: 'stale' })
    await expect(face.readFeatureDoc('p1', 'dsh-forge-m2', 'manifest')).rejects.toMatchObject({
      code: 'ERR_SNAPSHOT_STALE',
    })
  })
})

// ---------------------------------------------------------------------------
// FeatureDocs: the 五类 tab matrix + the three doc branches (AC3)
// ---------------------------------------------------------------------------

/** A never-settling read — pins the component in its loading branch. */
const pendingRead = (): Promise<FeatureDoc> => new Promise<FeatureDoc>(() => {})

async function renderDocs(props: Partial<FeatureDocsProps> = {}) {
  render(<FeatureDocs t={t.en} featureSlug="dsh-forge-m2" {...props} />)
}

describe('FeatureDocs: the tab strip (canonical order + docKinds matrix)', () => {
  it('renders the five tabs in canonical order with role=tablist semantics', async () => {
    await renderDocs({ docKinds: ['manifest', 'prd', 'design', 'ui', 'tasks'] })
    const list = $('[data-dsh-forge-feature-doc-tabs]')
    expect(list.getAttribute('role')).toBe('tablist')
    expect(list.getAttribute('aria-label')).toBe(en['features.docs.tabsLabel'])
    expect($$('[data-dsh-forge-feature-doc-tab]').map(tab => tab.dataset.dshForgeFeatureDocTab))
      .toEqual(['manifest', 'prd', 'design', 'ui', 'tasks'])
  })

  it('missing kinds DISABLE their tab (never hidden) with the 无此类文档 tooltip; present kinds stay enabled', async () => {
    // The m2 fixture shape: no ui doc.
    await renderDocs({ docKinds: ['manifest', 'prd', 'design', 'tasks'] })
    const tabs = $$('[data-dsh-forge-feature-doc-tab]')
    expect(tabs).toHaveLength(5)
    const uiTab = tabs.find(tab => tab.dataset.dshForgeFeatureDocTab === 'ui') as HTMLButtonElement
    expect(uiTab.disabled).toBe(true)
    expect(uiTab.getAttribute('aria-disabled')).toBe('true')
    expect(uiTab.title).toBe(en['features.docs.disabledHint'])
    expect(uiTab.getAttribute('aria-selected')).toBe('false')
    for (const tab of tabs.filter(row => row !== uiTab)) {
      expect((tab as HTMLButtonElement).disabled).toBe(false)
    }
  })

  it('the first AVAILABLE kind is the default active tab; a click loads and renders that doc read-only', async () => {
    await renderDocs({ docKinds: ['manifest', 'prd', 'design', 'tasks'] })
    await waitFor(() => {
      expect($('[data-dsh-forge-feature-doc-panel="manifest"]')).not.toBeNull()
    })
    const tabs = $$('[data-dsh-forge-feature-doc-tab]')
    expect(tabs.find(tab => tab.dataset.dshForgeFeatureDocTab === 'manifest')
      ?.getAttribute('aria-selected')).toBe('true')
    // The mock's m2 manifest doc, via MarkdownView (heading text).
    expect($('[data-dsh-forge-feature-doc-panel="manifest"]').textContent).toContain('dsh-forge-m2 manifest')

    fireEvent.click(tabs.find(tab => tab.dataset.dshForgeFeatureDocTab === 'prd') as HTMLElement)
    await waitFor(() => {
      expect($('[data-dsh-forge-feature-doc-panel="prd"]')).not.toBeNull()
    })
    expect($('[data-dsh-forge-feature-doc-panel="prd"]').textContent)
      .toContain('The M2 requirements and session workbench.')
    expect($('[data-dsh-forge-feature-doc-panel="prd"]').getAttribute('aria-labelledby'))
      .toBe('dsh-forge-feature-doc-tab-prd')
  })

  it('a stranded requested kind falls back to the first available one', async () => {
    const view = render(
      <FeatureDocs t={t.en} featureSlug="dsh-forge-m2" docKinds={['manifest', 'prd', 'design', 'tasks']} />,
    )
    await waitFor(() => { expect($('[data-dsh-forge-feature-doc-panel="manifest"]')).not.toBeNull() })
    fireEvent.click(
      $$('[data-dsh-forge-feature-doc-tab]').find(tab => tab.dataset.dshForgeFeatureDocTab === 'design') as HTMLElement,
    )
    await waitFor(() => { expect($('[data-dsh-forge-feature-doc-panel="design"]')).not.toBeNull() })
    // The feature switches to one whose docKinds strand 'design': the active
    // kind falls back to the first available.
    view.rerender(<FeatureDocs t={t.en} featureSlug="dsh-forge-m2" docKinds={['manifest', 'prd']} />)
    await waitFor(() => { expect($('[data-dsh-forge-feature-doc-panel="manifest"]')).not.toBeNull() })
    expect($('[data-dsh-forge-feature-doc-panel="design"]')).toBeNull()
  })

  it('arrow keys move focus AND selection among the ENABLED tabs, skipping disabled ones', async () => {
    await renderDocs({ docKinds: ['manifest', 'prd', 'design', 'tasks'] })
    await waitFor(() => { expect($('[data-dsh-forge-feature-doc-panel="manifest"]')).not.toBeNull() })
    const list = $('[data-dsh-forge-feature-doc-tabs]')
    const tabOf = (kind: string): HTMLElement =>
      $$('[data-dsh-forge-feature-doc-tab]').find(tab => tab.dataset.dshForgeFeatureDocTab === kind) as HTMLElement
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    await waitFor(() => { expect($('[data-dsh-forge-feature-doc-panel="prd"]')).not.toBeNull() })
    expect(document.activeElement).toBe(tabOf('prd'))
    // Skip over the disabled ui tab: design → tasks directly.
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    await waitFor(() => { expect($('[data-dsh-forge-feature-doc-panel="design"]')).not.toBeNull() })
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    await waitFor(() => { expect($('[data-dsh-forge-feature-doc-panel="tasks"]')).not.toBeNull() })
    // Home jumps back to the first enabled tab.
    fireEvent.keyDown(list, { key: 'Home' })
    await waitFor(() => { expect($('[data-dsh-forge-feature-doc-panel="manifest"]')).not.toBeNull() })
    expect(document.activeElement).toBe(tabOf('manifest'))
  })
})

describe('FeatureDocs: the three doc branches (加载 / 读取失败 / 快照过期)', () => {
  it('loading: a pending read pins the skeleton', async () => {
    await renderDocs({ docKinds: ['manifest'], face: { readFeatureDoc: pendingRead } })
    expect($('[data-dsh-forge-feature-doc-skeleton]')).not.toBeNull()
  })

  it('read failure: the error card + a working retry', async () => {
    let fail = true
    const face = {
      readFeatureDoc: vi.fn(async (): Promise<FeatureDoc> => {
        if (fail) throw { code: 'ERR_WORKBENCH_DB', message: 'boom' }
        return { kind: 'manifest', markdown: '# recovered' }
      }),
    }
    await renderDocs({ docKinds: ['manifest'], face })
    await waitFor(() => { expect($('[data-dsh-forge-feature-doc-error]')).not.toBeNull() })
    expect($('[data-dsh-forge-feature-doc-error]').getAttribute('role')).toBe('alert')
    expect($('[data-dsh-forge-feature-doc-error]').textContent).toContain(en['features.docs.error.title'])
    fail = false
    fireEvent.click($('[data-dsh-forge-feature-doc-retry]'))
    await waitFor(() => { expect($('[data-dsh-forge-feature-doc-panel="manifest"]').textContent).toContain('recovered') })
  })

  it('ERR_SNAPSHOT_STALE: the dedicated 快照过期 presentation (distinct copy + retry)', async () => {
    const base = createMockFeatureDocFace()
    base.failWith('dsh-forge-m2', 'manifest', { code: 'ERR_SNAPSHOT_STALE', message: 'stale' })
    await renderDocs({ docKinds: ['manifest'], face: { readFeatureDoc: base.readFeatureDoc } })
    await waitFor(() => { expect($('[data-dsh-forge-feature-doc-stale]')).not.toBeNull() })
    expect($('[data-dsh-forge-feature-doc-stale]').textContent).toContain(en['features.docs.stale.title'])
    expect($('[data-dsh-forge-feature-doc-stale]').textContent).toContain(en['features.docs.stale.body'])
    expect($('[data-dsh-forge-feature-doc-error]')).toBeNull()
    expect($('[data-dsh-forge-feature-doc-stale-retry]')).not.toBeNull()
  })

  it('an existing-but-empty document shows the empty hint, not a blank panel', async () => {
    await renderDocs({
      docKinds: ['manifest'],
      face: { readFeatureDoc: async () => ({ kind: 'manifest', markdown: '' }) },
    })
    await waitFor(() => { expect($('[data-dsh-forge-feature-doc-empty]')).not.toBeNull() })
    expect($('[data-dsh-forge-feature-doc-empty]').textContent).toBe(en['features.docs.empty'])
  })
})

// ---------------------------------------------------------------------------
// The page: board states, list render, subview routing, the return trip
// ---------------------------------------------------------------------------

async function renderPage(props: Partial<FeaturesPageProps> = {}) {
  const face = { loadFeatureBoard: vi.fn(async () => MOCK_FEATURE_BOARD) }
  render(<FeaturesPage t={t.en} projectId="p1" face={face} {...props} />)
  await waitFor(() => {
    expect(document.querySelector('[data-dsh-forge-feature-card="dsh-forge-m2"]')).not.toBeNull()
  })
  return { face }
}

describe('FeaturesPage: board states', () => {
  it('loading → populated: the skeleton yields to the card grid (AC1)', async () => {
    render(<FeaturesPage t={t.en} projectId="p1" />)
    expect($('[data-dsh-forge-feature-skeleton]')).not.toBeNull()
    await waitFor(() => {
      expect($('[data-dsh-forge-feature-card="dsh-forge-m1"]')).not.toBeNull()
    })
    expect($('[data-dsh-forge-feature-skeleton]')).toBeNull()
  })

  it('a failed first load shows the error card; retry re-fires the verb', async () => {
    let fail = true
    const face = {
      loadFeatureBoard: vi.fn(async (): Promise<typeof MOCK_FEATURE_BOARD> => {
        if (fail) throw { code: 'ERR_WORKBENCH_DB', message: 'down' }
        return MOCK_FEATURE_BOARD
      }),
    }
    render(<FeaturesPage t={t.en} projectId="p1" face={face} />)
    await waitFor(() => { expect($('[data-dsh-forge-feature-error]')).not.toBeNull() })
    fail = false
    fireEvent.click($('[data-dsh-forge-feature-retry]'))
    await waitFor(() => {
      expect($('[data-dsh-forge-feature-card="dsh-forge-m2"]')).not.toBeNull()
    })
    expect(face.loadFeatureBoard).toHaveBeenCalledTimes(2)
  })

  it('an empty board shows the 空态 card + guidance (ui-design empty 态)', async () => {
    render(<FeaturesPage t={t.en} face={{ loadFeatureBoard: async () => MOCK_FEATURE_BOARD_EMPTY }} />)
    await waitFor(() => { expect($('[data-dsh-forge-feature-empty]')).not.toBeNull() })
    expect($('[data-dsh-forge-feature-empty]').textContent).toContain(en['features.empty.title'])
    expect($('[data-dsh-forge-feature-empty]').textContent).toContain(en['features.empty.body'])
  })
})

describe('FeaturesPage: the list view (AC1/AC4 — 词表直通 + 完成徽标)', () => {
  it('every feature renders: raw status tokens (hyphen intact), progress counts, updatedAt', async () => {
    await renderPage()
    const m2 = $('[data-dsh-forge-feature-card="dsh-forge-m2"]')
    expect(m2.querySelector('[data-dsh-forge-feature-status="in-progress"]')?.textContent)
      .toBe('in-progress') // manifest 原词,连字符原样 — never rewritten
    expect(m2.textContent).toContain('4/15 tasks')
    expect(m2.textContent).toContain('2026-09-22 09:12') // formatTimestamp, UTC-stable
    const m1 = $('[data-dsh-forge-feature-card="dsh-forge-m1"]')
    expect(m1.querySelector('[data-dsh-forge-feature-status="completed"]')?.textContent).toBe('completed')
    expect(m1.textContent).toContain('48/48 tasks')
    expect(m1.textContent).toContain('2026-09-20 14:00')
  })

  it('the zh dictionary carries the same passthrough tokens with zh count copy', async () => {
    render(<FeaturesPage t={t.zh} projectId="p1" />)
    await waitFor(() => { expect($('[data-dsh-forge-feature-card="dsh-forge-m2"]')).not.toBeNull() })
    const m2 = $('[data-dsh-forge-feature-card="dsh-forge-m2"]')
    expect(m2.querySelector('[data-dsh-forge-feature-status="in-progress"]')?.textContent).toBe('in-progress')
    expect(m2.textContent).toContain('4/15 个任务')
  })

  it('the completed badge lands ONLY on taskCompleted=taskTotal (never recomputed) — the m1 样板', async () => {
    await renderPage()
    expect($('[data-dsh-forge-feature-card="dsh-forge-m1"]').textContent)
      .toContain(en['features.completedBadge'])
    expect($('[data-dsh-forge-feature-card="dsh-forge-m1"]').hasAttribute('data-dsh-forge-feature-complete'))
      .toBe(true)
    expect($('[data-dsh-forge-feature-card="dsh-forge-m2"]').textContent)
      .not.toContain(en['features.completedBadge'])
  })

  it('a card activation fires the onOpenFeature seam with the slug', async () => {
    const onOpenFeature = vi.fn()
    await renderPage({ onOpenFeature })
    fireEvent.click($('[data-dsh-forge-feature-card="dsh-forge-m1"]'))
    expect(onOpenFeature).toHaveBeenCalledTimes(1)
    expect(onOpenFeature).toHaveBeenCalledWith('dsh-forge-m1')
  })
})

describe('FeaturesPage: the detail subview (AC2/AC4/AC5)', () => {
  it('a slug renders the detail: breadcrumb, header (status pill + completion), stepper, docs', async () => {
    render(<FeaturesPage t={t.en} projectId="p1" featureSlug="dsh-forge-m1" />)
    await waitFor(() => { expect($('[data-dsh-forge-feature-detail="dsh-forge-m1"]')).not.toBeNull() })
    const detail = $('[data-dsh-forge-feature-detail="dsh-forge-m1"]')
    // Breadcrumb: clickable root + the current crumb.
    expect($('[data-dsh-forge-feature-back]').textContent).toBe(en['features.breadcrumb.root'])
    expect(document.querySelector('[aria-current="page"]')?.textContent).toBe('dsh-forge-m1')
    // Header: raw status token + the completed badge (48/48).
    expect(detail.querySelector('[data-dsh-forge-feature-status="completed"]')?.textContent)
      .toBe('completed')
    expect(detail.querySelector('[data-dsh-forge-feature-completed]')?.textContent)
      .toBe(en['features.completedBadge'])
    // Docs ride along (m1 carries all five kinds).
    await waitFor(() => { expect($('[data-dsh-forge-feature-doc-panel="manifest"]')).not.toBeNull() })
  })

  it('the 仓外角标 appears only for external doc locations', async () => {
    const base = createMockFeatureDocFace()
    render(
      <FeaturesPage
        t={t.en} projectId="p1" featureSlug="dsh-forge-m2" externalDocs
        docFace={{ readFeatureDoc: base.readFeatureDoc }}
      />,
    )
    await waitFor(() => { expect($('[data-dsh-forge-feature-detail="dsh-forge-m2"]')).not.toBeNull() })
    expect(document.querySelector('[data-dsh-forge-badge="external-docs"]')?.textContent)
      .toContain(en['features.externalDocs'])
  })

  it('an unknown slug renders the not-found card whose back fires onBack', async () => {
    const onBack = vi.fn()
    const face = { loadFeatureBoard: vi.fn(async () => MOCK_FEATURE_BOARD) }
    render(<FeaturesPage t={t.en} projectId="p1" featureSlug="gone-feature" face={face} onBack={onBack} />)
    await waitFor(() => { expect($('[data-dsh-forge-feature-notfound]')).not.toBeNull() })
    fireEvent.click($('[data-dsh-forge-feature-notfound-back]'))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('返回保留列表态: the round trip never re-fires the board verb (one load, list intact)', async () => {
    const onOpenFeature = vi.fn()
    const onBack = vi.fn()
    const face = { loadFeatureBoard: vi.fn(async () => MOCK_FEATURE_BOARD) }
    const props = { t: t.en as FeaturesPageProps['t'], projectId: 'p1', face, onOpenFeature, onBack }
    const view = render(<FeaturesPage {...props} />)
    await waitFor(() => { expect($('[data-dsh-forge-feature-card="dsh-forge-m2"]')).not.toBeNull() })
    // Enter the detail (the machine owns addressing; the page just receives the slug).
    fireEvent.click($('[data-dsh-forge-feature-card="dsh-forge-m2"]'))
    expect(onOpenFeature).toHaveBeenCalledWith('dsh-forge-m2')
    view.rerender(<FeaturesPage {...props} featureSlug="dsh-forge-m2" />)
    await waitFor(() => { expect($('[data-dsh-forge-feature-detail="dsh-forge-m2"]')).not.toBeNull() })
    // Return via the breadcrumb seam.
    fireEvent.click($('[data-dsh-forge-feature-back]'))
    expect(onBack).toHaveBeenCalledTimes(1)
    view.rerender(<FeaturesPage {...props} />)
    await waitFor(() => { expect($('[data-dsh-forge-feature-card="dsh-forge-m2"]')).not.toBeNull() })
    // ONE board load for the whole round trip — the list state survived.
    expect(face.loadFeatureBoard).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// The stepper (AC2: shared constants, current-state accessibility)
// ---------------------------------------------------------------------------

describe('FeatureStepper: phases from the ONE vocabulary', () => {
  it("in-progress: the reached phases fill, the current carries aria-current='step', completed stays pending", async () => {
    render(<FeaturesPage t={t.en} projectId="p1" featureSlug="dsh-forge-m2" />)
    await waitFor(() => { expect($('[data-dsh-forge-feature-stepper]')).not.toBeNull() })
    const nodes = $$('[data-dsh-forge-stepper-phase]')
    expect(nodes.map(node => node.dataset.dshForgeStepperPhase)).toEqual([...FEATURE_STATUSES])
    expect(nodes.map(node => node.dataset.dshForgeStepperState))
      .toEqual(['reached', 'reached', 'reached', 'current', 'pending'])
    expect(nodes.find(node => node.dataset.dshForgeStepperPhase === 'in-progress')
      ?.getAttribute('aria-current')).toBe('step')
    expect(nodes.filter(node => node.getAttribute('aria-current') === 'step')).toHaveLength(1)
    // Labels are the verbatim full tokens (不缩写).
    expect(nodes.find(node => node.dataset.dshForgeStepperPhase === 'in-progress')?.textContent)
      .toBe('in-progress')
  })

  it('completed: every phase reached, the cursor on completed', async () => {
    render(<FeaturesPage t={t.en} projectId="p1" featureSlug="dsh-forge-m1" />)
    await waitFor(() => { expect($('[data-dsh-forge-feature-stepper]')).not.toBeNull() })
    const nodes = $$('[data-dsh-forge-stepper-phase]')
    expect(nodes.map(node => node.dataset.dshForgeStepperState))
      .toEqual(['reached', 'reached', 'reached', 'reached', 'current'])
  })

  it('the stepper carries its group aria-label', async () => {
    render(<FeaturesPage t={t.zh} projectId="p1" featureSlug="dsh-forge-m2" />)
    await waitFor(() => { expect($('[data-dsh-forge-feature-stepper]')).not.toBeNull() })
    expect($('[data-dsh-forge-feature-stepper] ol').getAttribute('aria-label'))
      .toBe(zh['features.stepper.label'])
  })
})

// ---------------------------------------------------------------------------
// Shell integration: the seat mount + the view-key subview semantics (AC5)
// ---------------------------------------------------------------------------

describe('shell integration: the features seat + the subview round trip', () => {
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
      selectWorkbenchTab,
      openFeatureDetail,
    }
  }

  it('mounts the UF4 page in the reserved features container; a card enters the subview through the machine', async () => {
    const viewFace = makeViewFace({ workbenchTab: 'workbench/features' })
    const loadFeatureBoard = vi.fn(async () => MOCK_FEATURE_BOARD)
    const shell = render(
      <WorkbenchShell
        t={t.en as WorkbenchShellProps['t']}
        features={{ face: { loadFeatureBoard } }}
        {...viewFace.props}
      />,
    )
    await waitFor(() => { expect($('[data-dsh-forge-view="dsh-forge-view-features"]')).not.toBeNull() })
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-feature-card="dsh-forge-m2"]')).not.toBeNull()
    })
    fireEvent.click(document.querySelector('[data-dsh-forge-feature-card="dsh-forge-m2"]') as HTMLElement)
    expect(viewFace.openFeatureDetail).toHaveBeenCalledWith('dsh-forge-m2')

    // The machine transition (mutating here mirrors the controller's) swaps
    // the mount container and renders the detail subview.
    shell.rerender(
      <WorkbenchShell
        t={t.en as WorkbenchShellProps['t']}
        features={{ face: { loadFeatureBoard } }}
        {...viewFace.props}
      />,
    )
    await waitFor(() => { expect($('[data-dsh-forge-view="dsh-forge-view-feature-detail"]')).not.toBeNull() })
    expect(document.querySelector('[data-dsh-forge-feature-detail="dsh-forge-m2"]')).not.toBeNull()

    // The breadcrumb return fires the tab action — the machine clears the slug.
    fireEvent.click($('[data-dsh-forge-feature-back]'))
    expect(viewFace.selectWorkbenchTab).toHaveBeenCalledWith('workbench/features')
    shell.rerender(
      <WorkbenchShell
        t={t.en as WorkbenchShellProps['t']}
        features={{ face: { loadFeatureBoard } }}
        {...viewFace.props}
      />,
    )
    await waitFor(() => { expect($('[data-dsh-forge-view="dsh-forge-view-features"]')).not.toBeNull() })
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-feature-card="dsh-forge-m2"]')).not.toBeNull()
    })
    // One board load for the whole round trip.
    expect(loadFeatureBoard).toHaveBeenCalledTimes(1)
  })

  it('re-selecting the features tab while the subview is open returns to the list (the return stack)', async () => {
    const viewFace = makeViewFace({ workbenchTab: 'workbench/features', featureSlug: 'dsh-forge-m1' })
    render(
      <WorkbenchShell t={t.en as WorkbenchShellProps['t']} {...viewFace.props} />,
    )
    await waitFor(() => { expect($('[data-dsh-forge-view="dsh-forge-view-feature-detail"]')).not.toBeNull() })
    // The TabBar re-select routes through the same machine tab action.
    fireEvent.click(document.querySelector('[data-dsh-forge-tab="workbench/features"]') as HTMLElement)
    expect(viewFace.selectWorkbenchTab).toHaveBeenCalledWith('workbench/features')
  })
})
