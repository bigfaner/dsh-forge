// @vitest-environment jsdom
// Task 4.3 — the UF2 stage component family BUILD units (mock verbs; 4.4
// wires the Feature 看板 integration). AC map:
//   AC1 stepper 门态 — normal/gate-pending 两态;五阶段遍历(normal = 词表
//      全序 reached/current/pending;gate-pending = 当前节点 warn 描边态,
//      其余节点态不变)+ aria 门注记
//   AC2 偏离徽标 — deviated=true 呈现(卡/详情同一组件);hover tooltip;
//      零点击动作(纯 span,无任何交互面)
//   AC3 StageAssetsTab — 分组卡自旧到新(乱序输入 → 管线序);目标/摘要
//      MarkdownView 只读渲染(对抗语料 → 渲染区零交互元素);空态;骨架/
//      错误 + 重试;新资产 0.2s 淡入(entering 标记 + transition 0.2s,
//      stage_advanced 回流驱动)
//   AC4 推进动作 — 门拒绝 → 引导文案 + 缺失清单(GateHint 拒绝面);
//      成功 → onAdvanced 回调 + stage_advanced 事件回流(同一 face 通道);
//      终态 completed 不渲染;动词缺席 = 惰性(disabled + tooltip)
//   AC5 = 本件本身(vitest + jsdom,mock 动词)
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import { zh } from '../src/client/locale/zh.ts'
import { FEATURE_STATUSES } from '../src/client/i18n/feature-status.ts'
import type { FeatureStatus, StageAssetRow } from '../src/client/ipc-types.ts'
import { FeatureStepper } from '../src/client/views/features/FeatureStepper.tsx'
import { DeviationBadge } from '../src/client/views/features/stages/DeviationBadge.tsx'
import { GateHint } from '../src/client/views/features/stages/GateHint.tsx'
import { AdvanceStageButton } from '../src/client/views/features/stages/AdvanceStageButton.tsx'
import { StageAssetsTab } from '../src/client/views/features/stages/StageAssetsTab.tsx'
import { createMockStageFace, MOCK_STAGE_ASSETS } from '../src/client/mocks/workbench.ts'

type Dict = Record<WorkbenchKey, string>
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]
const t = { en: bind(en), zh: bind(zh) }

const PROJECT_ID = 'proj-stage-1'
const SLUG = 'dsh-forge-m2'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// AC1: stepper gate states
// ---------------------------------------------------------------------------

describe('FeatureStepper — normal/gate-pending 两态 (AC1)', () => {
  const statesOf = (container: HTMLElement): string[] =>
    Array.from(container.querySelectorAll('[data-dsh-forge-stepper-phase]'))
      .map(node => (node as HTMLElement).dataset.dshForgeStepperState ?? '')

  it('normal 态: five-status traversal — phases ≤ cursor reached (last = current), after pending', () => {
    for (const [status, cursor] of FEATURE_STATUSES.map((status, index) => [status, index] as const)) {
      const { container } = render(<FeatureStepper t={t.en} status={status} />)
      const states = statesOf(container)
      expect(states).toHaveLength(5)
      states.forEach((state, index) => {
        expect(state).toBe(index < cursor ? 'reached' : index === cursor ? 'current' : 'pending')
      })
      // completed 前 5 阶段:词表全序呈现(completed 自身 = 当前态)。
      expect(container.querySelectorAll('[data-dsh-forge-stepper-phase]')).toHaveLength(5)
    }
  })

  it('gate-pending 态: the CURRENT node flips to the warn-描边 state; earlier/later nodes untouched', () => {
    const { container } = render(<FeatureStepper t={t.en} status="tasks" gatePending />)
    expect(statesOf(container)).toEqual(['reached', 'reached', 'gate-pending', 'pending', 'pending'])
    const gateNode = container.querySelector('[data-dsh-forge-stepper-phase="tasks"] span') as HTMLElement
    // warn 描边:warn border + warn ring(非品牌蓝填充)。
    expect(gateNode.style.borderColor).toContain('245, 158, 11')
    expect(gateNode.style.boxShadow).not.toBe('')
    expect(gateNode.style.background).toBe('transparent')
  })

  it('gate-pending 态: the list aria-label carries the gate note; normal 态 does not', () => {
    const normal = render(<FeatureStepper t={t.en} status="tasks" />)
    expect(normal.container.querySelector('ol')?.getAttribute('aria-label'))
      .not.toContain('gate pending')
    normal.unmount()
    const gated = render(<FeatureStepper t={t.en} status="tasks" gatePending />)
    expect(gated.container.querySelector('ol')?.getAttribute('aria-label'))
      .toContain(en['features.stages.stepper.gateAria'])
  })

  it('gatePending=false/absent keeps the M2 presentation (extension point is additive)', () => {
    const { container } = render(<FeatureStepper t={t.en} status="tasks" gatePending={false} />)
    expect(statesOf(container)).toEqual(['reached', 'reached', 'current', 'pending', 'pending'])
  })
})

// ---------------------------------------------------------------------------
// AC2: deviation badge
// ---------------------------------------------------------------------------

describe('DeviationBadge — deviated=true 呈现,零点击 (AC2)', () => {
  it('renders the warn pill with the tooltip only when deviated', () => {
    const { container, rerender } = render(
      <div><DeviationBadge t={t.en} deviated={true} /></div>,
    )
    const badge = container.querySelector('[data-dsh-forge-badge="deviation"]')
    expect(badge).not.toBeNull()
    expect(badge?.textContent).toBe(en['features.stages.deviation'])
    expect(badge?.getAttribute('title')).toBe(en['features.stages.deviation.tooltip'])
    // 卡 + 详情同一组件(zh 词面同源)。
    rerender(<div><DeviationBadge t={t.zh} deviated={true} /></div>)
    expect(container.querySelector('[data-dsh-forge-badge="deviation"]')?.textContent)
      .toBe(zh['features.stages.deviation'])
    // 非偏离 = 不渲染(无占位)。
    rerender(<div><DeviationBadge t={t.en} deviated={false} /></div>)
    expect(container.querySelector('[data-dsh-forge-badge="deviation"]')).toBeNull()
    rerender(<div><DeviationBadge t={t.en} deviated={undefined} /></div>)
    expect(container.querySelector('[data-dsh-forge-badge="deviation"]')).toBeNull()
  })

  it('zero click actions — a plain span, no interactive affordance anywhere', () => {
    const { container } = render(
      <div><DeviationBadge t={t.en} deviated={true} /></div>,
    )
    const badge = container.querySelector('[data-dsh-forge-badge="deviation"]') as HTMLElement
    expect(badge.tagName).toBe('SPAN')
    expect(badge.getAttribute('role')).toBeNull()
    expect(badge.getAttribute('tabindex')).toBeNull()
    expect(badge.getAttribute('onclick')).toBeNull()
    expect(container.querySelector('button, a, [role="button"]')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// GateHint — the passive line + the rejection guidance face
// ---------------------------------------------------------------------------

describe('GateHint — 提示行 + 拒绝引导 (AC1/AC4 呈现面)', () => {
  it('renders nothing when the gate is satisfied and no rejection is armed', () => {
    const { container } = render(<GateHint t={t.en} gatePending={false} />)
    expect(container.querySelector('[data-dsh-forge-gate-hint]')).toBeNull()
  })

  it('gatePending renders the 12/18 warn line + the generation-path tooltip', () => {
    const { container } = render(<GateHint t={t.en} gatePending />)
    const line = container.querySelector('[data-dsh-forge-gate-hint-line]') as HTMLElement
    expect(line.textContent).toBe(en['features.stages.gateHint'])
    expect(line.getAttribute('title')).toBe(en['features.stages.gateHint.tooltip'])
    expect(line.tagName).toBe('P') // 无点击面(仅 hover 引导)
    expect(container.querySelector('button')).toBeNull()
  })

  it('an ERR_STAGE_GATE_UNSATISFIED envelope renders 引导文案 + the kernel detail verbatim (both envelope forms)', () => {
    // ① the plain-object form the build-stage mock throws.
    const plain = render(
      <GateHint
        t={t.en}
        rejection={{ code: 'ERR_STAGE_GATE_UNSATISFIED', message: 'stage gate unsatisfied', detail: 'missing: features/x/stages/tasks.md — generate it first with the forge_stage_summarize tool' }}
      />,
    )
    const plainBlock = plain.container.querySelector('[data-dsh-forge-gate-hint-rejected="ERR_STAGE_GATE_UNSATISFIED"]')
    expect(plainBlock).not.toBeNull()
    expect(plainBlock?.getAttribute('role')).toBe('alert')
    expect(plainBlock?.textContent).toContain(en['features.stages.advance.rejected.title'])
    expect(plainBlock?.textContent).toContain('missing: features/x/stages/tasks.md')
    plain.unmount()
    // ② the serialized-Error form real IPC rejections arrive as.
    const serialized = render(
      <GateHint
        t={t.en}
        rejection={new Error(JSON.stringify({
          code: 'ERR_STAGE_GATE_UNSATISFIED',
          message: 'stage gate unsatisfied',
          detail: 'missing: features/x/stages/tasks.md',
        }))}
      />,
    )
    expect(serialized.container.querySelector('[data-dsh-forge-gate-hint-rejected]')?.textContent)
      .toContain('missing: features/x/stages/tasks.md')
  })

  it('a non-gate rejection falls to the generic face (code + message, no gate copy)', () => {
    const { container } = render(
      <GateHint t={t.en} rejection={{ code: 'ERR_WORKBENCH_DB', message: 'boom' }} />,
    )
    const block = container.querySelector('[data-dsh-forge-gate-hint-rejected="ERR_WORKBENCH_DB"]')
    expect(block?.textContent).toContain('boom')
    expect(block?.textContent).not.toContain(en['features.stages.advance.rejected.title'])
  })
})

// ---------------------------------------------------------------------------
// AC3: StageAssetsTab
// ---------------------------------------------------------------------------

/** Adversarial asset content: every injection face MarkdownView must degrade. */
const HOSTILE = '[click](javascript:alert(1)) <script>alert(2)</script> <img src=x onerror=alert(3)> [x](https://ok.example)'

const hostileRows = (): StageAssetRow[] => [{
  stage: 'prd',
  path: 'x/stages/prd.md',
  generatedAt: '2026-09-23T10:00:00.000Z',
  goal: `goal ${HOSTILE}`,
  summary: `summary ${HOSTILE}`,
}]

describe('StageAssetsTab — 分组卡只读渲染 (AC3)', () => {
  it('renders the cards 自旧到新 (pipeline order) from shuffled rows, with the stage pill + generated time', async () => {
    const face = createMockStageFace({ projectId: PROJECT_ID, featureSlug: SLUG })
    face.setAssets([...MOCK_STAGE_ASSETS].reverse()) // 乱序输入(design 在前)
    const { container } = render(
      <StageAssetsTab t={t.en} projectId={PROJECT_ID} featureSlug={SLUG} face={face} />,
    )
    await waitFor(() => {
      expect(container.querySelectorAll('[data-dsh-forge-stage-asset]')).toHaveLength(2)
    })
    const order = Array.from(container.querySelectorAll('[data-dsh-forge-stage-asset]'))
      .map(node => (node as HTMLElement).dataset.dshForgeStageAsset)
    expect(order).toEqual(['prd', 'design'])
    expect(container.querySelector('[data-dsh-forge-stage-asset-pill="prd"]')?.textContent).toBe('prd')
    expect(container.querySelector('[data-dsh-forge-stage-asset="prd"] [title="2026-09-22T10:00:00.000Z"]')?.textContent)
      .toBe('2026-09-22 10:00')
  })

  it('目标/摘要 render via MarkdownView whitelist — adversarial content leaves ZERO interactive elements in the render area (Hard Rule)', async () => {
    const face = createMockStageFace({ projectId: PROJECT_ID, featureSlug: SLUG })
    face.setAssets(hostileRows())
    const { container } = render(
      <StageAssetsTab t={t.en} projectId={PROJECT_ID} featureSlug={SLUG} face={face} />,
    )
    await waitFor(() => {
      expect(container.querySelectorAll('[data-dsh-forge-stage-asset]')).toHaveLength(1)
    })
    // 严格只读:整个 tab 体零交互元素(无 button/a/img/iframe/form/input)。
    expect(container.querySelectorAll('button, a, img, iframe, form, input, select, textarea, video, object'))
      .toHaveLength(0)
    // 注入面可见降级:script 载荷以纯文本在场(非执行、非剥离)。
    expect(container.textContent).toContain('<script>alert(2)</script>')
    // 白名单链接 = 纯文本 + hover URL(span,绝不 <a>)。
    const linkSpan = Array.from(container.querySelectorAll('span'))
      .find(node => node.getAttribute('title') === 'https://ok.example/')
    expect(linkSpan).toBeDefined()
    expect(container.querySelector('a')).toBeNull()
  })

  it('空态: no rows → 「尚无阶段资产」 + the explanation line', async () => {
    const face = createMockStageFace({ projectId: PROJECT_ID, featureSlug: SLUG, assets: [] })
    const { container } = render(
      <StageAssetsTab t={t.en} projectId={PROJECT_ID} featureSlug={SLUG} face={face} />,
    )
    await waitFor(() => {
      expect(container.querySelector('[data-dsh-forge-stage-assets-empty]')).not.toBeNull()
    })
    expect(container.querySelector('[data-dsh-forge-stage-assets-empty]')?.textContent)
      .toContain(en['features.stages.assets.empty.title'])
    expect(container.querySelector('[data-dsh-forge-stage-assets-empty]')?.textContent)
      .toContain(en['features.stages.assets.empty.body'])
    expect(container.querySelector('[data-dsh-forge-stage-asset]')).toBeNull()
  })

  it('loading 骨架 then error + 重试 (the M2 docs-tab state shape)', async () => {
    const face = createMockStageFace({ projectId: PROJECT_ID, featureSlug: SLUG })
    let listCalls = 0
    const listVerb = face.listStageAssets
    const failingFirst = async (): Promise<StageAssetRow[]> => {
      listCalls += 1
      if (listCalls === 1) throw new Error(JSON.stringify({ code: 'ERR_WORKBENCH_DB', message: 'mock: list failed' }))
      return listVerb(PROJECT_ID, SLUG)
    }
    const patched = { ...face, listStageAssets: failingFirst }
    const { container } = render(
      <StageAssetsTab t={t.en} projectId={PROJECT_ID} featureSlug={SLUG} face={patched} />,
    )
    expect(container.querySelector('[data-dsh-forge-stage-assets-skeleton]')).not.toBeNull()
    await waitFor(() => {
      expect(container.querySelector('[data-dsh-forge-stage-assets-error]')).not.toBeNull()
    })
    fireEvent.click(container.querySelector('[data-dsh-forge-stage-assets-retry]') as HTMLElement)
    await waitFor(() => {
      expect(container.querySelectorAll('[data-dsh-forge-stage-asset]')).toHaveLength(2)
    })
  })

  it('新资产 0.2s 淡入: a stage_advanced reflux re-lists and the NEW card enters with the fade marker + 0.2s transition', async () => {
    const face = createMockStageFace({ projectId: PROJECT_ID, featureSlug: SLUG })
    const { container } = render(
      <StageAssetsTab t={t.en} projectId={PROJECT_ID} featureSlug={SLUG} face={face} />,
    )
    await waitFor(() => {
      expect(container.querySelectorAll('[data-dsh-forge-stage-asset]')).toHaveLength(2)
    })
    // 首载不淡入(在场资产原位呈现)。
    expect(container.querySelector('[data-dsh-forge-asset-entering]')).toBeNull()
    // 回流:新资产写入 + stage_advanced 事件(≤5s 链路的组件级形态)。
    face.setAssets([...MOCK_STAGE_ASSETS, {
      stage: 'tasks', path: `${SLUG}/stages/tasks.md`, generatedAt: '2026-09-24T09:00:00.000Z',
      goal: '52 项任务分解定形。', summary: '六 Phase 划分。',
    }])
    face.emit([{ type: 'stage_advanced', projectId: PROJECT_ID, featureSlug: SLUG }])
    await waitFor(() => {
      expect(container.querySelectorAll('[data-dsh-forge-stage-asset]')).toHaveLength(3)
    })
    const entering = container.querySelector('[data-dsh-forge-asset-entering="true"]') as HTMLElement
    expect(entering.dataset.dshForgeStageAsset).toBe('tasks')
    expect(entering.style.transition).toContain('0.2s')
    // 淡入收尾:标记清除(240ms 窗口 + 余量)。
    await waitFor(() => {
      expect(container.querySelector('[data-dsh-forge-asset-entering]')).toBeNull()
    }, { timeout: 1500 })
  })

  it('an absent listStageAssets member renders nothing (inert — no silent data plane)', () => {
    const { container } = render(
      <StageAssetsTab t={t.en} projectId={PROJECT_ID} featureSlug={SLUG} face={{}} />,
    )
    expect(container.firstChild).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// AC4: AdvanceStageButton — the advance chain (mock verbs)
// ---------------------------------------------------------------------------

describe('AdvanceStageButton — 推进链主路径 (AC4)', () => {
  it('absent advanceStage = inert: disabled + the unavailable tooltip', () => {
    const { container } = render(
      <AdvanceStageButton t={t.en} projectId={PROJECT_ID} featureSlug={SLUG} status="tasks" face={{}} />,
    )
    const entry = container.querySelector('[data-dsh-forge-advance-entry]') as HTMLButtonElement
    expect(entry.disabled).toBe(true)
    expect(entry.getAttribute('title')).toBe(en['features.stages.advance.unavailable'])
    expect(entry.dataset.dshForgeAdvanceState).toBe('unavailable')
  })

  it('terminal completed renders nothing (nothing left to advance)', () => {
    const face = createMockStageFace({ projectId: PROJECT_ID, featureSlug: SLUG })
    const { container } = render(
      <AdvanceStageButton t={t.en} projectId={PROJECT_ID} featureSlug={SLUG} status="completed" face={face} />,
    )
    expect(container.querySelector('[data-dsh-forge-advance-entry]')).toBeNull()
  })

  it('门拒绝 → 引导文案 + 缺失清单 (kernel-shaped rejection, observable)', async () => {
    const face = createMockStageFace({ projectId: PROJECT_ID, featureSlug: SLUG })
    face.setGate({
      featureSlug: SLUG, stage: 'tasks', summaryGenerated: false, gateAssetPath: null, assets: [],
    })
    const { container } = render(
      <AdvanceStageButton t={t.en} projectId={PROJECT_ID} featureSlug={SLUG} status="tasks" face={face} />,
    )
    fireEvent.click(container.querySelector('[data-dsh-forge-advance-entry]') as HTMLElement)
    await waitFor(() => {
      expect(container.querySelector('[data-dsh-forge-gate-hint-rejected="ERR_STAGE_GATE_UNSATISFIED"]')).not.toBeNull()
    })
    const guidance = container.querySelector('[data-dsh-forge-gate-hint-rejected="ERR_STAGE_GATE_UNSATISFIED"]')
    // 引导文案 + 缺失清单(缺失路径 + forge_stage_summarize 生成路径)。
    expect(guidance?.textContent).toContain(en['features.stages.advance.rejected.title'])
    expect(guidance?.textContent).toContain(`missing: features/${SLUG}/stages/tasks.md`)
    expect(guidance?.textContent).toContain('forge_stage_summarize')
    // 拒绝后按钮回到 idle(可再试 —— 总结生成后可重走)。
    expect((container.querySelector('[data-dsh-forge-advance-entry]') as HTMLButtonElement).disabled).toBe(false)
  })

  it('成功 → onAdvanced(post-advance summary)+ stage_advanced 事件回流经同一 face 通道 (≤5s 链路)', async () => {
    const face = createMockStageFace({ projectId: PROJECT_ID, featureSlug: SLUG })
    const advanced = vi.fn()
    const seen: string[] = []
    face.subscribeEvents((events) => {
      for (const event of events) seen.push(event.type)
    })
    const { container } = render(
      <AdvanceStageButton t={t.en} projectId={PROJECT_ID} featureSlug={SLUG} status="tasks" face={face} onAdvanced={advanced} />,
    )
    const entry = container.querySelector('[data-dsh-forge-advance-entry]') as HTMLButtonElement
    fireEvent.click(entry)
    await waitFor(() => {
      expect(advanced).toHaveBeenCalledTimes(1)
    })
    const summary = advanced.mock.calls[0]![0] as { status: FeatureStatus }
    expect(summary.status).toBe('in-progress') // tasks → in-progress(4.1 管线)
    expect(seen).toContain('stage_advanced') // 事件回流可观察
    expect(entry.dataset.dshForgeAdvanceState).toBe('advanced')
    // 推进成功后的重复请求 = 新阶段门未满足(内核口径)→ 引导面呈现。
    fireEvent.click(entry)
    await waitFor(() => {
      expect(container.querySelector('[data-dsh-forge-gate-hint-rejected="ERR_STAGE_GATE_UNSATISFIED"]')).not.toBeNull()
    })
    expect(container.querySelector('[data-dsh-forge-gate-hint-rejected]')?.textContent)
      .toContain(`missing: features/${SLUG}/stages/in-progress.md`)
  })

  it('arbitrary verb failure surfaces through the generic guidance face (拒绝不静默)', async () => {
    const face = createMockStageFace({ projectId: PROJECT_ID, featureSlug: SLUG })
    face.failNextAdvance('ERR_WORKBENCH_DB', 'mock: advance exploded')
    const { container } = render(
      <AdvanceStageButton t={t.en} projectId={PROJECT_ID} featureSlug={SLUG} status="tasks" face={face} />,
    )
    fireEvent.click(container.querySelector('[data-dsh-forge-advance-entry]') as HTMLElement)
    await waitFor(() => {
      expect(container.querySelector('[data-dsh-forge-gate-hint-rejected="ERR_WORKBENCH_DB"]')).not.toBeNull()
    })
    expect(container.querySelector('[data-dsh-forge-gate-hint-rejected]')?.textContent).toContain('mock: advance exploded')
  })
})
