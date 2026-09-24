// @vitest-environment jsdom
// Task 5.1 — the UF4 preference section BUILD units (mock verbs; 5.2 wires
// the overview integration). AC map:
//   AC1 三级视图 — segmented 三级切换(getPrefs scope 入参逐级断言);Feature
//      级 feature 选择 Menu 卡(仅 Feature 级出现,先选 feature 再读);无
//      激活项目 → 项目/Feature disabled + tooltip(仅「全局」可用);无
//      feature → Feature disabled + tooltip
//   AC2 键行 — 值控件由 API 类型元数据驱动(toggle/数值/文本/列表文本/
//      coverage 百分比+维持);继承「继承 · {层级}:{值}」/覆盖「本级覆盖」
//      + [清除] 两态;清除后回落上级生效值 + toast
//   AC3 保存链 — 修改 → saving spinner → 成功 toast(连改合并 1 次)+ 生效
//      值即时更新;失败 → save-error 行内(显示值回滚,徽标不变)+ [重试]
//      重走保存
//   AC4 键集呈现 — 行集 = API 行集(surfaces 类键不出现);键分组折叠/
//      展开 0.2s + 会话期记忆(跨 unmount/remount)
//   AC5 = 本件本身(vitest + jsdom,mock 动词);附 loading/load-error +
//      重试、行内类型校验(保存禁用越界值 —— Hard Rule)
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import { zh } from '../src/client/locale/zh.ts'
import type { PrefScope } from '../src/client/ipc-types.ts'
import type { PrefsFace } from '../src/client/contract.ts'
import { PreferenceSection, resetPrefGroupSessionMemory } from '../src/client/views/overview/prefs/PreferenceSection.tsx'
import { createMockPrefsFace, MOCK_PREF_REGISTRY } from '../src/client/mocks/workbench.ts'

type Dict = Record<WorkbenchKey, string>
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]
const t = { en: bind(en), zh: bind(zh) }

const PROJECT = { id: 'mock-project', displayName: 'dsh-forge' }
const FEATURES = [{ slug: 'dsh-forge-m2' }, { slug: 'dsh-forge-m3' }]

afterEach(() => {
  cleanup()
  resetPrefGroupSessionMemory()
  vi.restoreAllMocks()
})

/** Render the section against one fresh mock instance (projected features). */
const mountSection = (face: PrefsFace = createMockPrefsFace(), props: {
  activeProject?: typeof PROJECT | undefined
  features?: readonly { slug: string }[] | undefined
} = {}) => render(
  <PreferenceSection
    t={t.en}
    activeProject={props.activeProject === undefined ? PROJECT : props.activeProject}
    features={props.features === undefined ? FEATURES : props.features}
    face={face}
  />,
)

// ---------------------------------------------------------------------------
// AC1: three-tier view
// ---------------------------------------------------------------------------

describe('PreferenceSection — 层级 segmented 三级视图 (AC1)', () => {
  it('global by default; tier clicks re-read the matching scope (feature 级先选 feature)', async () => {
    const base = createMockPrefsFace()
    const scopes: PrefScope[] = []
    const wrapped: PrefsFace = {
      ...base,
      getPrefs: async (scope) => {
        scopes.push(scope)
        return base.getPrefs(scope)
      },
    }
    const { container } = mountSection(wrapped)
    await waitFor(() => {
      expect(container.querySelectorAll('[data-dsh-forge-pref-row]')).toHaveLength(MOCK_PREF_REGISTRY.length)
    })
    expect(scopes).toEqual(['global'])

    // 项目 tier → { project } scope.
    fireEvent.click(container.querySelector('[data-dsh-forge-pref-tier="project"]') as HTMLElement)
    await waitFor(() => { expect(scopes).toEqual(['global', { project: 'mock-project' }]) })

    // Feature tier: Menu 卡 appears (仅 Feature 级),no read until a feature is picked.
    fireEvent.click(container.querySelector('[data-dsh-forge-pref-tier="feature"]') as HTMLElement)
    const trigger = container.querySelector('[data-dsh-forge-prefs-feature-trigger]') as HTMLElement
    expect(trigger).not.toBeNull()
    expect(scopes).toHaveLength(2)
    fireEvent.click(trigger)
    fireEvent.click(container.querySelector('[data-dsh-forge-prefs-feature-item="dsh-forge-m2"]') as HTMLElement)
    await waitFor(() => {
      expect(scopes).toEqual(['global', { project: 'mock-project' }, { feature: 'mock-project/dsh-forge-m2' }])
    })
    await waitFor(() => {
      expect(container.querySelector('[data-dsh-forge-prefs-feature-trigger]')?.textContent)
        .toContain('dsh-forge-m2')
    })
  })

  it('无激活项目: project + feature tiers disabled + tooltip; global stays usable (仅「全局」可用)', () => {
    const { container } = render(
      <PreferenceSection t={t.en} activeProject={undefined} features={FEATURES} face={createMockPrefsFace()} />,
    )
    const project = container.querySelector('[data-dsh-forge-pref-tier="project"]') as HTMLButtonElement
    const feature = container.querySelector('[data-dsh-forge-pref-tier="feature"]') as HTMLButtonElement
    const globalTier = container.querySelector('[data-dsh-forge-pref-tier="global"]') as HTMLButtonElement
    expect(project.disabled).toBe(true)
    expect(project.getAttribute('title')).toBe(en['overview.prefs.tier.projectDisabled'])
    expect(feature.disabled).toBe(true)
    expect(feature.getAttribute('title')).toBe(en['overview.prefs.tier.featureDisabled'])
    expect(globalTier.disabled).toBe(false)
    expect(globalTier.getAttribute('title')).toBeNull()
  })

  it('无 feature: feature tier disabled + tooltip; project tier usable', () => {
    const { container } = mountSection(createMockPrefsFace(), { features: [] })
    const project = container.querySelector('[data-dsh-forge-pref-tier="project"]') as HTMLButtonElement
    const feature = container.querySelector('[data-dsh-forge-pref-tier="feature"]') as HTMLButtonElement
    expect(project.disabled).toBe(false)
    expect(feature.disabled).toBe(true)
    expect(feature.getAttribute('title')).toBe(en['overview.prefs.tier.featureDisabled'])
  })
})

// ---------------------------------------------------------------------------
// AC2: key rows — metadata-driven controls + inherited/overridden badges
// ---------------------------------------------------------------------------

describe('PreferenceSection — 键行控件与继承/覆盖两态 (AC2)', () => {
  it('value controls come from the API type metadata (toggle / number / text / list-text / coverage)', async () => {
    const { container } = mountSection()
    await waitFor(() => {
      expect(container.querySelectorAll('[data-dsh-forge-pref-row]')).toHaveLength(MOCK_PREF_REGISTRY.length)
    })
    // Every registry control kind renders its own control, counts = registry counts.
    for (const control of ['toggle', 'number-input', 'text-input', 'coverage-input'] as const) {
      const expected = MOCK_PREF_REGISTRY.filter(def => def.control === control).length
      expect(
        container.querySelectorAll(`[data-dsh-forge-pref-control="${control}"]`),
        control,
      ).toHaveLength(expected)
    }
    // The list-typed text input seeds the joined comma form.
    const includes = container.querySelector('[data-dsh-forge-pref-row="worktree.includes"] input') as HTMLInputElement
    expect(includes.value).toBe('')
    // coverage rows carry the 「maintain」 mode toggle.
    expect(container.querySelectorAll('[data-dsh-forge-pref-coverage-maintain]')).toHaveLength(2)
  })

  it('inherited rows show 「继承 · {source}:{value}」; overridden rows show the Pill + [清除]', async () => {
    const { container } = mountSection()
    await waitFor(() => {
      expect(container.querySelectorAll('[data-dsh-forge-pref-row]')).toHaveLength(MOCK_PREF_REGISTRY.length)
    })
    // Global seed override → 本级覆盖 Pill + clear button.
    const overridden = container.querySelector('[data-dsh-forge-pref-row="auto.test.full"]') as HTMLElement
    expect(overridden.querySelector('[data-dsh-forge-pref-override]')?.textContent)
      .toBe(en['overview.prefs.row.overridden'])
    expect(overridden.querySelector('[data-dsh-forge-pref-clear]')).not.toBeNull()
    // Registry-default inheritance → 继承 · Default:false.
    const inherited = container.querySelector('[data-dsh-forge-pref-row="auto.test.quick"]') as HTMLElement
    const source = inherited.querySelector('[data-dsh-forge-pref-source]') as HTMLElement
    expect(source.textContent).toBe(
      en['overview.prefs.row.inherited']
        .replace('{source}', en['overview.prefs.source.default'])
        .replace('{value}', 'false'),
    )
    expect(inherited.querySelector('[data-dsh-forge-pref-clear]')).toBeNull()
    // A no-value key (worktree.includes, no default) → 未设置, never a blank row.
    const unset = container.querySelector('[data-dsh-forge-pref-row="worktree.includes"] [data-dsh-forge-pref-source]') as HTMLElement
    expect(unset.textContent).toContain(en['overview.prefs.row.unset'])
  })

  it('zh locale renders the same faces (title + 继承 annotation form)', async () => {
    const { container } = render(
      <PreferenceSection t={t.zh} activeProject={PROJECT} features={FEATURES} face={createMockPrefsFace()} />,
    )
    await waitFor(() => {
      expect(container.querySelector('[data-dsh-forge-pref-row="auto.test.quick"]')).not.toBeNull()
    })
    expect(container.querySelector('h3')?.textContent).toBe(zh['overview.prefs.title'])
    const source = container.querySelector('[data-dsh-forge-pref-row="auto.test.quick"] [data-dsh-forge-pref-source]') as HTMLElement
    expect(source.textContent).toContain('继承')
    expect(source.textContent).toContain(zh['overview.prefs.source.default'])
  })

  it('清除 → the row falls back to the upper tier value + toast (回落继承态)', async () => {
    const face = createMockPrefsFace()
    const { container } = mountSection(face)
    await waitFor(() => {
      expect(container.querySelectorAll('[data-dsh-forge-pref-row]')).toHaveLength(MOCK_PREF_REGISTRY.length)
    })
    // Project tier: auto.test.quick carries the project seed (override=true).
    fireEvent.click(container.querySelector('[data-dsh-forge-pref-tier="project"]') as HTMLElement)
    const row = await waitFor(() => {
      const found = container.querySelector('[data-dsh-forge-pref-row="auto.test.quick"]') as HTMLElement
      expect(found.querySelector('[data-dsh-forge-pref-override]')).not.toBeNull()
      return found
    })
    fireEvent.click(row.querySelector('[data-dsh-forge-pref-clear]') as HTMLElement)
    await waitFor(() => {
      // 回落: pill gone, inherited default value visible, toast fired.
      const settled = container.querySelector('[data-dsh-forge-pref-row="auto.test.quick"]') as HTMLElement
      expect(settled.querySelector('[data-dsh-forge-pref-override]')).toBeNull()
      expect(settled.querySelector('[data-dsh-forge-pref-source]')?.textContent).toContain('false')
    })
    expect(container.querySelector('[data-dsh-forge-prefs-toast]')?.textContent)
      .toContain(en['overview.prefs.toast.saved'])
    // The kernel-side twin agrees: the project override row is gone.
    const rows = await face.getPrefs({ project: PROJECT.id })
    expect(rows.find(row => row.key === 'auto.test.quick')).toMatchObject({
      override: false, value: false, source: 'default',
    })
  })
})

// ---------------------------------------------------------------------------
// AC3: the save chain
// ---------------------------------------------------------------------------

describe('PreferenceSection — 保存链主路径 (AC3)', () => {
  it('toggle → saving spinner on the row → toast + 生效值/徽标即时更新', async () => {
    const base = createMockPrefsFace()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const face: PrefsFace = {
      ...base,
      setPrefs: (scope, entries) => gate.then(() => base.setPrefs(scope, entries)),
    }
    const { container } = mountSection(face)
    const checkbox = await waitFor(() => {
      // Project tier: auto.test.full inherits the GLOBAL seed (false).
      fireEvent.click(container.querySelector('[data-dsh-forge-pref-tier="project"]') as HTMLElement)
      const input = container.querySelector('[data-dsh-forge-pref-row="auto.test.full"] input[type="checkbox"]') as HTMLInputElement
      expect(input).not.toBeNull()
      return input
    })
    expect(checkbox.checked).toBe(false)
    fireEvent.click(checkbox)
    // saving 态: inline spinner + the control disabled (spinner 0.1s-class).
    const row = container.querySelector('[data-dsh-forge-pref-row="auto.test.full"]') as HTMLElement
    await waitFor(() => { expect(row.querySelector('[data-dsh-forge-pref-saving]')).not.toBeNull() })
    expect((container.querySelector('[data-dsh-forge-pref-row="auto.test.full"] input[type="checkbox"]') as HTMLInputElement).disabled).toBe(true)
    release()
    await waitFor(() => {
      const settled = container.querySelector('[data-dsh-forge-pref-row="auto.test.full"]') as HTMLElement
      expect(settled.querySelector('[data-dsh-forge-pref-override]')).not.toBeNull()
      expect((settled.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true)
    })
    expect(container.querySelector('[data-dsh-forge-prefs-toast]')?.textContent)
      .toContain(en['overview.prefs.toast.saved'])
  })

  it('save failure → save-error 行内: value rolled back, badge unchanged, [重试] re-fires and succeeds', async () => {
    const face = createMockPrefsFace()
    face.failSetWith('auto.test.full', { code: 'ERR_WORKBENCH_DB', message: 'mock: kernel busy' })
    const setSpy = vi.fn()
    const wrapped: PrefsFace = { ...face, setPrefs: async (scope, entries) => {
      setSpy(entries)
      return face.setPrefs(scope, entries)
    } }
    const { container } = mountSection(wrapped)
    const checkbox = await waitFor(() => {
      const input = container.querySelector('[data-dsh-forge-pref-row="auto.test.full"] input[type="checkbox"]') as HTMLInputElement
      expect(input).not.toBeNull()
      return input
    })
    // Global seed → override=true ALREADY (badge must survive the failure).
    const rowBefore = container.querySelector('[data-dsh-forge-pref-row="auto.test.full"]') as HTMLElement
    expect(rowBefore.querySelector('[data-dsh-forge-pref-override]')).not.toBeNull()
    fireEvent.click(checkbox)
    await waitFor(() => {
      expect(container.querySelector('[data-dsh-forge-pref-save-error]')).not.toBeNull()
    })
    const row = container.querySelector('[data-dsh-forge-pref-row="auto.test.full"]') as HTMLElement
    // 失败不经 toast: inline error carries the envelope message.
    expect(row.querySelector('[data-dsh-forge-pref-save-error]')?.textContent).toContain('mock: kernel busy')
    expect(container.querySelector('[data-dsh-forge-prefs-toast]')).toBeNull()
    // 显示值回滚为保存前值 + 徽标不变。
    expect((row.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false)
    expect(row.querySelector('[data-dsh-forge-pref-override]')).not.toBeNull()
    // [重试] re-fires the same attempt (one-shot arm) → success path.
    fireEvent.click(row.querySelector('[data-dsh-forge-pref-retry]') as HTMLElement)
    await waitFor(() => {
      const settled = container.querySelector('[data-dsh-forge-pref-row="auto.test.full"]') as HTMLElement
      expect((settled.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true)
      expect(settled.querySelector('[data-dsh-forge-pref-save-error]')).toBeNull()
    })
    expect(setSpy).toHaveBeenCalledTimes(2)
  })

  it('连改合并: two rapid saves surface ONE toast instance', async () => {
    const { container } = mountSection()
    await waitFor(() => {
      expect(container.querySelectorAll('[data-dsh-forge-pref-row]')).toHaveLength(MOCK_PREF_REGISTRY.length)
    })
    fireEvent.click(container.querySelector('[data-dsh-forge-pref-row="auto.gitPush"] input[type="checkbox"]') as HTMLElement)
    fireEvent.click(container.querySelector('[data-dsh-forge-pref-row="auto.eval.prd"] input[type="checkbox"]') as HTMLElement)
    await waitFor(() => {
      expect(container.querySelectorAll('[data-dsh-forge-prefs-toast]')).toHaveLength(1)
    })
    expect(container.querySelector('[data-dsh-forge-prefs-toast]')?.textContent)
      .toContain(en['overview.prefs.toast.saved'])
  })

  it('typed commits save on Enter; 生效值 seeds back into the input', async () => {
    const { container } = mountSection()
    const input = await waitFor(() => {
      const found = container.querySelector('[data-dsh-forge-pref-row="eval.proposal.target"] input') as HTMLInputElement
      expect(found).not.toBeNull()
      return found
    })
    expect(input.value).toBe('900')
    fireEvent.change(input, { target: { value: '950' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(container.querySelector('[data-dsh-forge-prefs-toast]')?.textContent)
        .toContain(en['overview.prefs.toast.saved'])
    })
    const settled = container.querySelector('[data-dsh-forge-pref-row="eval.proposal.target"]') as HTMLElement
    expect((settled.querySelector('input') as HTMLInputElement).value).toBe('950')
    expect(settled.querySelector('[data-dsh-forge-pref-override]')).not.toBeNull()
  })

  it('type-invalid drafts mark the row inline and NEVER fire the verb (Hard Rule: 保存禁用越界值)', async () => {
    const face = createMockPrefsFace()
    const setSpy = vi.fn(face.setPrefs.bind(face))
    const wrapped: PrefsFace = { ...face, setPrefs: setSpy }
    const { container } = mountSection(wrapped)
    await waitFor(() => {
      expect(container.querySelectorAll('[data-dsh-forge-pref-row]')).toHaveLength(MOCK_PREF_REGISTRY.length)
    })
    expect(setSpy).not.toHaveBeenCalled()

    // Non-integer number → 行内 invalidNumber, no commit.
    const number = container.querySelector('[data-dsh-forge-pref-row="eval.proposal.target"] input') as HTMLInputElement
    fireEvent.change(number, { target: { value: '2.5' } })
    fireEvent.blur(number)
    expect(container.querySelector('[data-dsh-forge-pref-row="eval.proposal.target"] [data-dsh-forge-pref-invalid]')?.textContent)
      .toBe(en['overview.prefs.row.invalidNumber'])

    // Empty text → invalidText.
    const text = container.querySelector('[data-dsh-forge-pref-row="worktree.source-branch"] input') as HTMLInputElement
    fireEvent.change(text, { target: { value: '' } })
    fireEvent.blur(text)
    expect(container.querySelector('[data-dsh-forge-pref-row="worktree.source-branch"] [data-dsh-forge-pref-invalid]')?.textContent)
      .toBe(en['overview.prefs.row.invalidText'])

    // Coverage percentage out of [0,100] → invalidPercent.
    const coverage = container.querySelector('[data-dsh-forge-pref-row="coverage.coding.feature"] input') as HTMLInputElement
    fireEvent.change(coverage, { target: { value: '150' } })
    fireEvent.blur(coverage)
    expect(container.querySelector('[data-dsh-forge-pref-row="coverage.coding.feature"] [data-dsh-forge-pref-invalid]')?.textContent)
      .toBe(en['overview.prefs.row.invalidPercent'])

    expect(setSpy).not.toHaveBeenCalled()
    expect(container.querySelector('[data-dsh-forge-prefs-toast]')).toBeNull()
  })

  it('coverage 「维持」 toggle commits the maintain strategy', async () => {
    const face = createMockPrefsFace()
    const { container } = mountSection(face)
    const maintain = await waitFor(() => {
      const found = container.querySelector('[data-dsh-forge-pref-row="coverage.coding.feature"] [data-dsh-forge-pref-coverage-maintain]') as HTMLButtonElement
      expect(found).not.toBeNull()
      return found
    })
    expect(maintain.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(maintain)
    await waitFor(() => {
      const settled = container.querySelector('[data-dsh-forge-pref-row="coverage.coding.feature"] [data-dsh-forge-pref-coverage-maintain]') as HTMLButtonElement
      expect(settled.getAttribute('aria-pressed')).toBe('true')
    })
    // The override landed: the row flips to the 本级覆盖 badge (source line gone).
    const row = container.querySelector('[data-dsh-forge-pref-row="coverage.coding.feature"]') as HTMLElement
    expect(row.querySelector('[data-dsh-forge-pref-override]')).not.toBeNull()
    expect(container.querySelector('[data-dsh-forge-prefs-toast]')?.textContent)
      .toContain(en['overview.prefs.toast.saved'])
    // The kernel-side twin carries the maintain strategy as this tier's override.
    const rows = await face.getPrefs('global')
    expect(rows.find(entry => entry.key === 'coverage.coding.feature')).toMatchObject({
      override: true, value: { type: 'maintain' },
    })
  })
})

// ---------------------------------------------------------------------------
// AC4: key-set presentation + group accordion
// ---------------------------------------------------------------------------

describe('PreferenceSection — 键集呈现与分组手风琴 (AC4)', () => {
  it('rows = the API rows verbatim (surfaces keys never appear); groups follow metadata order', async () => {
    const { container } = mountSection()
    await waitFor(() => {
      expect(container.querySelectorAll('[data-dsh-forge-pref-row]')).toHaveLength(MOCK_PREF_REGISTRY.length)
    })
    const keys = Array.from(container.querySelectorAll('[data-dsh-forge-pref-row]'))
      .map(node => (node as HTMLElement).dataset.dshForgePrefRow)
    expect(keys).toEqual(MOCK_PREF_REGISTRY.map(def => def.key))
    expect(keys.every(key => !key.startsWith('surfaces.'))).toBe(true)
    const groups = Array.from(container.querySelectorAll('[data-dsh-forge-pref-group]'))
      .map(node => (node as HTMLElement).dataset.dshForgePrefGroup)
    expect(groups).toEqual(['auto', 'worktree', 'coverage', 'eval'])
  })

  it('折叠/展开 0.2s + 会话期记忆 (survives unmount/remount)', async () => {
    resetPrefGroupSessionMemory()
    const face = createMockPrefsFace()
    const first = mountSection(face)
    await waitFor(() => {
      expect(first.container.querySelector('[data-dsh-forge-pref-group-body="worktree"]')).not.toBeNull()
    })
    const header = first.container.querySelector('[data-dsh-forge-pref-group-header="worktree"]') as HTMLElement
    // 0.2s motion tokens on the accordion (chevron rotate + body fade).
    expect((header.querySelector('span') as HTMLElement).style.transition).toContain('0.2s')
    expect((first.container.querySelector('[data-dsh-forge-pref-group-body="worktree"]') as HTMLElement).style.transition).toContain('0.2s')
    fireEvent.click(header)
    expect(first.container.querySelector('[data-dsh-forge-pref-group-body="worktree"]')).toBeNull()
    expect(header.getAttribute('aria-expanded')).toBe('false')
    first.unmount()

    // Same session: a fresh mount keeps the fold.
    const second = mountSection(createMockPrefsFace())
    await waitFor(() => {
      expect(second.container.querySelectorAll('[data-dsh-forge-pref-row]').length).toBeGreaterThan(0)
    })
    expect(second.container.querySelector('[data-dsh-forge-pref-group-body="worktree"]')).toBeNull()
    fireEvent.click(second.container.querySelector('[data-dsh-forge-pref-group-header="worktree"]') as HTMLElement)
    expect(second.container.querySelector('[data-dsh-forge-pref-group-body="worktree"]')).not.toBeNull()
    second.unmount()
  })
})

// ---------------------------------------------------------------------------
// AC5: loading / load-error + retry (the M2 docs-tab state shape)
// ---------------------------------------------------------------------------

describe('PreferenceSection — loading / load-error (AC5 支撑面)', () => {
  it('first paint is the skeleton (分组行灰块), rows land after the verb settles', async () => {
    const base = createMockPrefsFace()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const face: PrefsFace = {
      ...base,
      getPrefs: scope => gate.then(() => base.getPrefs(scope)),
    }
    const { container } = mountSection(face)
    expect(container.querySelector('[data-dsh-forge-prefs-skeleton]')).not.toBeNull()
    expect(container.querySelector('[data-dsh-forge-pref-row]')).toBeNull()
    release()
    await waitFor(() => {
      expect(container.querySelectorAll('[data-dsh-forge-pref-row]')).toHaveLength(MOCK_PREF_REGISTRY.length)
    })
    expect(container.querySelector('[data-dsh-forge-prefs-skeleton]')).toBeNull()
  })

  it('load-error 区块错误说明 + [重试] 重走当前层级读取', async () => {
    const face = createMockPrefsFace()
    face.failGetWith({ code: 'ERR_WORKBENCH_DB', message: 'mock: read failed' })
    const { container } = mountSection(face)
    await waitFor(() => {
      expect(container.querySelector('[data-dsh-forge-prefs-error]')).not.toBeNull()
    })
    expect(container.querySelector('[data-dsh-forge-prefs-error]')?.textContent)
      .toContain(en['overview.prefs.loadError.title'])
    expect(container.querySelector('[data-dsh-forge-pref-row]')).toBeNull()
    fireEvent.click(container.querySelector('[data-dsh-forge-prefs-retry]') as HTMLElement)
    await waitFor(() => {
      expect(container.querySelectorAll('[data-dsh-forge-pref-row]')).toHaveLength(MOCK_PREF_REGISTRY.length)
    })
    expect(container.querySelector('[data-dsh-forge-prefs-error]')).toBeNull()
  })
})
