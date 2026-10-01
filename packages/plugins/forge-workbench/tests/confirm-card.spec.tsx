// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmCard } from '../src/client/components/confirm-card/ConfirmCard.tsx'
import {
  EMPTY_PLACEMENT, buildSubmitInput, canSubmit, checkEntry, defaultPlacement,
  evidenceTierOf, isCustomOutside, machinePhaseOf, resolvePlacement, stripEntryInput,
} from '../src/client/components/confirm-card/card-state.ts'
import type { ConfirmCardFace, PlacementDraft } from '../src/client/components/confirm-card/card-state.ts'
import type { DetectReport, Project, RegisterProjectInputV2 } from '../src/client/ipc-types.ts'
import type { WorkbenchKey } from '../src/client/locale/en.ts'
import { zh } from '../src/client/locale/zh.ts'
import {
  MOCK_CARD_FORGE_ROOT, MOCK_CARD_MISSING_ROOT, MOCK_CARD_NOGIT_ROOT, MOCK_CARD_PARENT_CHILDREN,
  MOCK_CARD_PARENT_ROOT, MOCK_CARD_UNREADABLE_ROOT, MOCK_WIZARD_EXTERNAL_UNREADABLE,
  createMockConfirmCardFace,
} from '../src/client/mocks/workbench.ts'

// Task 1.5 — the C7 添加项目确认卡 BUILD units (mock 侦测动词独立构建; the
// 1.6 assembly wires the real probeProjectPath/registerProject + the 左栏 ＋
// and 空态引导 seats). AC map:
//   AC1 six-state machine (mock DetectReport driven): valid / registered /
//      nogit(信息态) / missing / parent(chips) / custom-outside + entry hygiene
//      (剥引号 / 拒裸盘符与相对路径)
//   AC2 证据三档门控: forgeTreeHit = 沿用仓内 / .git = 仓内新建 <root>/docs /
//      无 .git = 应用管理;✎ 展开才见模式+路径(默认收起)
//   AC3 黏性禁令: 换路径预选重估(手动选择清零 / 自定义清空+授权复位 / 仓内落点永不继承)
//   AC4 硬校验两条 + enabled 条件;提交失败留在卡内;成功 onDone(含落位模式)
//   AC5 高级折叠:仓外自定义显式授权行(授权复位随换路径)+ 留痕灰字
//   AC6 this suite itself (vitest + jsdom)

const bind = (dict: Record<WorkbenchKey, string>) => (key: WorkbenchKey): string => dict[key]
const t = bind(zh)

const GIT_A = 'Z:/work/demo-app'
const GIT_B = 'Z:/work/other-repo'
const FORGE_ROOT = 'Z:/work/legacy-repo'
const NOGIT_ROOT = 'Z:/work/plain-demo'
const MISSING_ROOT = 'Z:/work/ghost-repo'
const UNREADABLE_ROOT = 'Z:/work/locked-repo'

function makeReport(overrides: Partial<DetectReport> = {}): DetectReport {
  const input = overrides.input ?? GIT_A
  return {
    input,
    canonicalPath: overrides.canonicalPath ?? input,
    pathKey: overrides.pathKey ?? input.toUpperCase(),
    identity: { dev: '1', ino: '2' },
    exists: true,
    isDir: true,
    readable: true,
    registered: null,
    gitRoot: input,
    forgeTreeHit: false,
    childRepos: [],
    ...overrides,
  }
}

/** Fixture-keyed scripted face: the path decides the report (the mock twin's discipline). */
function reportForPath(path: string): DetectReport {
  if (path === FORGE_ROOT) return makeReport({ input: path, canonicalPath: path, gitRoot: path, forgeTreeHit: true })
  if (path === NOGIT_ROOT) return makeReport({ input: path, canonicalPath: path, gitRoot: null })
  if (path === MISSING_ROOT) {
    return makeReport({ input: path, canonicalPath: path, exists: false, isDir: false, readable: false, gitRoot: null })
  }
  if (path === UNREADABLE_ROOT) return makeReport({ input: path, canonicalPath: path, readable: false })
  if (path === 'Z:/project/dsh') {
    return makeReport({ input: path, canonicalPath: path, gitRoot: null, childRepos: [...MOCK_CARD_PARENT_CHILDREN] })
  }
  if (path === 'Z:/work/registered-app') {
    return makeReport({ input: path, canonicalPath: path, registered: { projectId: 'p-1', displayName: '已注册项目名' } })
  }
  return makeReport({ input: path, canonicalPath: path, gitRoot: path })
}

function makeFace(): {
  face: ConfirmCardFace
  probe: ReturnType<typeof vi.fn>
  register: ReturnType<typeof vi.fn>
} {
  const probe = vi.fn(async (input: { path: string }) => reportForPath(input.path))
  const register = vi.fn(async (input: RegisterProjectInputV2): Promise<Project> => ({
    id: 'new-1',
    displayName: input.displayName ?? 'x',
    codeRoot: input.anchor,
    docLocationType: 'in_repo',
    docLocationPath: null,
    createdAt: '2026-09-29T00:00:00.000Z',
    lastActivatedAt: null,
    archived: false,
    sortOrder: 9,
    projectionState: 'pending',
    docsPlacement: input.docsPlacement,
  }))
  return { face: { probeProjectPath: probe, registerProject: register }, probe, register }
}

function mountCard(face: ConfirmCardFace, overrides: { onDone?: ConfirmCardProps1['onDone']; onLocateRegistered?: ConfirmCardProps1['onLocateRegistered'] } = {}) {
  const onDone = overrides.onDone ?? vi.fn()
  const onLocateRegistered = overrides.onLocateRegistered ?? undefined
  const props = { t, face, onCancel: vi.fn(), onDone, onLocateRegistered }
  return { ...render(<ConfirmCard {...props} />), props }
}
type ConfirmCardProps1 = Parameters<typeof ConfirmCard>[0]

const q = <T extends Element>(selector: string): T => document.querySelector<T>(selector)!
const detectText = (): string => q('[data-dsh-forge-confirm-detect]')?.textContent ?? ''
const previewNote = (): string => q('[data-dsh-forge-confirm-preview-note]')?.textContent ?? ''
const previewPath = (): string => q('[data-dsh-forge-confirm-preview-path]')?.textContent ?? ''
const submitBtn = (): HTMLButtonElement => q<HTMLButtonElement>('[data-dsh-forge-confirm-submit]')
const typeCode = (value: string): void => {
  fireEvent.change(q<HTMLInputElement>('[data-dsh-forge-confirm-code]'), { target: { value } })
}
const settle = async (probe: ReturnType<typeof vi.fn>, path: string): Promise<void> => {
  await waitFor(() => {
    expect(probe).toHaveBeenCalledWith({ path })
  })
}

afterEach(cleanup)

// ---------------------------------------------------------------------------
// card-state pure units
// ---------------------------------------------------------------------------

describe('card-state entry hygiene (代码区唯一输入位)', () => {
  it('strips wrapping quotes and whitespace (drag/paste armor)', () => {
    expect(stripEntryInput('"Z:\\a\\b"')).toBe('Z:\\a\\b')
    expect(stripEntryInput('  "Z:/a/b"  ')).toBe('Z:/a/b')
    expect(stripEntryInput('""Z:/x""')).toBe('Z:/x')
    expect(stripEntryInput('Z:/plain')).toBe('Z:/plain')
  })

  it('rejects bare drives, root forms and relative paths at the entry', () => {
    expect(checkEntry('')).toEqual({ ok: false, reason: 'empty' })
    expect(checkEntry('Z:')).toEqual({ ok: false, reason: 'bare-drive-or-root' })
    expect(checkEntry('Z:\\')).toEqual({ ok: false, reason: 'bare-drive-or-root' })
    expect(checkEntry('z:/')).toEqual({ ok: false, reason: 'bare-drive-or-root' })
    expect(checkEntry('\\\\srv')).toEqual({ ok: false, reason: 'bare-drive-or-root' })
    expect(checkEntry('\\\\srv\\share')).toEqual({ ok: false, reason: 'bare-drive-or-root' })
    expect(checkEntry('repo/sub')).toEqual({ ok: false, reason: 'relative' })
    expect(checkEntry('./here')).toEqual({ ok: false, reason: 'relative' })
    expect(checkEntry('"Z:\\work\\a"')).toEqual({ ok: true, path: 'Z:\\work\\a' })
    expect(checkEntry('Z:/work/a')).toEqual({ ok: true, path: 'Z:/work/a' })
    expect(checkEntry('\\\\srv\\share\\repo')).toEqual({ ok: true, path: '\\\\srv\\share\\repo' })
  })
})

describe('card-state evidence three-tier gating (decisions §5.3)', () => {
  it('forgeTreeHit → repo-existing; gitRoot → repo-new; neither → app', () => {
    expect(evidenceTierOf(makeReport({ forgeTreeHit: true }))).toBe('repo-existing')
    expect(evidenceTierOf(makeReport({ forgeTreeHit: true, gitRoot: null }))).toBe('repo-existing')
    expect(evidenceTierOf(makeReport())).toBe('repo-new')
    expect(evidenceTierOf(makeReport({ gitRoot: null }))).toBe('app')
  })

  it('null tier for rejected entries and non-directories', () => {
    expect(evidenceTierOf(makeReport({ pathKey: null, canonicalPath: null, exists: false }))).toBeNull()
    expect(evidenceTierOf(makeReport({ exists: false, isDir: false }))).toBeNull()
    expect(evidenceTierOf(makeReport({ isDir: false }))).toBeNull()
  })
})

describe('card-state six-state machine', () => {
  it('derives the six states + transitional phases from DetectReport', () => {
    expect(machinePhaseOf(null)).toEqual({ kind: 'idle' })
    expect(machinePhaseOf(makeReport({ pathKey: null, canonicalPath: null, exists: false })))
      .toEqual({ kind: 'invalid-entry', reason: 'bare-drive-or-root' })
    expect(machinePhaseOf(makeReport({ registered: { projectId: 'p1', displayName: 'x' } })))
      .toEqual({ kind: 'registered', projectId: 'p1', displayName: 'x' })
    expect(machinePhaseOf(makeReport({ exists: false, isDir: false, readable: false })))
      .toEqual({ kind: 'missing', variant: 'not-exists' })
    expect(machinePhaseOf(makeReport({ isDir: false }))).toEqual({ kind: 'missing', variant: 'not-dir' })
    expect(machinePhaseOf(makeReport({ readable: false }))).toEqual({ kind: 'missing', variant: 'unreadable' })
    expect(machinePhaseOf(makeReport({ gitRoot: null, childRepos: MOCK_CARD_PARENT_CHILDREN })))
      .toEqual({ kind: 'parent' })
    expect(machinePhaseOf(makeReport())).toEqual({ kind: 'valid' })
    expect(machinePhaseOf(makeReport({ gitRoot: null }))).toEqual({ kind: 'nogit' })
  })

  it('registered outranks everything (fast lane); parent outranks the git statement', () => {
    const registeredParent = makeReport({
      registered: { projectId: 'p1', displayName: 'x' },
      childRepos: MOCK_CARD_PARENT_CHILDREN,
    })
    expect(machinePhaseOf(registeredParent).kind).toBe('registered')
    const gitBearingParent = makeReport({ childRepos: MOCK_CARD_PARENT_CHILDREN })
    expect(machinePhaseOf(gitBearingParent).kind).toBe('parent')
  })
})

describe('card-state custom-outside + placement resolution', () => {
  const anchor = 'Z:/work/demo-app'

  it('isCustomOutside: win32 case-folded prefix compare', () => {
    expect(isCustomOutside(anchor, 'Z:/work/demo-app/docs')).toBe(false)
    expect(isCustomOutside(anchor, 'z:/WORK/DEMO-APP/docs')).toBe(false)
    expect(isCustomOutside(anchor, anchor)).toBe(false)
    expect(isCustomOutside(anchor, 'Z:/docs/elsewhere')).toBe(true)
    expect(isCustomOutside(anchor, 'Z:/work/demo-app-evil/docs')).toBe(true)
    expect(isCustomOutside(anchor, '')).toBe(false)
    expect(isCustomOutside(null, 'Z:/x')).toBe(false)
  })

  it('defaultPlacement rebuilds per report (sticky ban choke point)', () => {
    expect(defaultPlacement(anchor)).toEqual({
      manualMode: null,
      docsPath: 'Z:/work/demo-app/docs',
      docsPathTouched: false,
      customPath: '',
      customAuthorized: false,
    })
    expect(defaultPlacement(null)).toEqual(EMPTY_PLACEMENT)
  })

  it('resolvePlacement: custom overrides radios; manual overrides evidence; repo-new falls back to <root>/docs', () => {
    const evidence = resolvePlacement(anchor, 'repo-new', defaultPlacement(anchor))
    expect(evidence).toMatchObject({ mode: 'repo-new', previewPath: 'Z:/work/demo-app/docs', needsAuthorization: false })
    const manual: PlacementDraft = { ...defaultPlacement(anchor), manualMode: 'app' }
    expect(resolvePlacement(anchor, 'repo-new', manual).mode).toBe('app')
    const customPending: PlacementDraft = { ...defaultPlacement(anchor), customPath: 'Z:/docs/elsewhere' }
    expect(resolvePlacement(anchor, 'repo-new', customPending))
      .toMatchObject({ mode: 'custom', needsAuthorization: true, customOutside: true })
    const customGranted = { ...customPending, customAuthorized: true }
    expect(resolvePlacement(anchor, 'repo-new', customGranted).needsAuthorization).toBe(false)
    const customInside = { ...defaultPlacement(anchor), customPath: 'Z:/work/demo-app/specs' }
    expect(resolvePlacement(anchor, 'app', customInside))
      .toMatchObject({ mode: 'custom', needsAuthorization: false })
    const reuse = resolvePlacement(FORGE_ROOT, 'repo-existing', defaultPlacement(FORGE_ROOT))
    expect(reuse).toMatchObject({ mode: 'repo-existing', docsPath: null, previewPath: `${FORGE_ROOT}/docs` })
    const editedRepoNew: PlacementDraft = { ...defaultPlacement(anchor), docsPathTouched: true, docsPath: '  ' }
    expect(resolvePlacement(anchor, 'repo-new', editedRepoNew).docsPath).toBe('Z:/work/demo-app/docs')
  })
})

describe('card-state submit gate + payload (硬校验两条 + enabled)', () => {
  const res = resolvePlacement(GIT_A, 'repo-new', defaultPlacement(GIT_A))

  it('enabled = 存在 ∧ 未注册 ∧ 名称非空 ∧ 自定义已授权', () => {
    expect(canSubmit(makeReport(), 'name', res)).toBe(true)
    expect(canSubmit(null, 'name', res)).toBe(false)
    expect(canSubmit(makeReport({ exists: false, isDir: false }), 'name', res)).toBe(false)
    expect(canSubmit(makeReport({ readable: false }), 'name', res)).toBe(false)
    expect(canSubmit(makeReport({ registered: { projectId: 'p', displayName: 'd' } }), 'name', res)).toBe(false)
    expect(canSubmit(makeReport(), '  ', res)).toBe(false)
    expect(canSubmit(makeReport(), '', res)).toBe(false)
    const pendingAuth = resolvePlacement(GIT_A, 'repo-new', { ...defaultPlacement(GIT_A), customPath: 'Z:/elsewhere' })
    expect(canSubmit(makeReport(), 'name', pendingAuth)).toBe(false)
    // nogit + parent both pass 存在 (零 git 强制 / chips suggest, never block).
    expect(canSubmit(makeReport({ gitRoot: null }), 'name', resolvePlacement(GIT_A, 'app', defaultPlacement(GIT_A)))).toBe(true)
    expect(canSubmit(makeReport({ childRepos: MOCK_CARD_PARENT_CHILDREN, gitRoot: null }), 'name', res)).toBe(true)
  })

  it('buildSubmitInput: docsPath only for repo-new/custom; customAuthorized only for custom', () => {
    expect(buildSubmitInput(GIT_A, ' demo ', resolvePlacement(GIT_A, 'repo-new', defaultPlacement(GIT_A))))
      .toEqual({ anchor: GIT_A, displayName: 'demo', docsPlacement: 'repo-new', docsPath: `${GIT_A}/docs` })
    expect(buildSubmitInput(FORGE_ROOT, 'demo', resolvePlacement(FORGE_ROOT, 'repo-existing', defaultPlacement(FORGE_ROOT))))
      .toEqual({ anchor: FORGE_ROOT, displayName: 'demo', docsPlacement: 'repo-existing' })
    expect(buildSubmitInput(GIT_A, 'demo', resolvePlacement(GIT_A, 'app', defaultPlacement(GIT_A))))
      .toEqual({ anchor: GIT_A, displayName: 'demo', docsPlacement: 'app' })
    const custom = resolvePlacement(GIT_A, 'repo-new', { ...defaultPlacement(GIT_A), customPath: 'Z:/elsewhere', customAuthorized: true })
    expect(buildSubmitInput(GIT_A, 'demo', custom))
      .toEqual({ anchor: GIT_A, displayName: 'demo', docsPlacement: 'custom', docsPath: 'Z:/elsewhere', customAuthorized: true })
  })
})

// ---------------------------------------------------------------------------
// ConfirmCard component (AC1–AC5)
// ---------------------------------------------------------------------------

describe('AC1 ConfirmCard six-state machine (mock DetectReport driven)', () => {
  it('idle: renders the r24 dialog, no 侦测行, submit disabled, 留痕灰字 present', () => {
    const { face } = makeFace()
    mountCard(face)
    expect(q('[data-dsh-forge-dialog="confirm-card"]')).toBeTruthy()
    expect(q('[data-dsh-forge-confirm-detect]')).toBeNull()
    expect(submitBtn().disabled).toBe(true)
    expect(q('[data-dsh-forge-confirm-trace]').textContent).toBe(t('confirmCard.trace'))
    expect(face.probeProjectPath).not.toHaveBeenCalled()
  })

  it('valid git: 侦测陈述 ✓ git 仓库 + preview 仓内新建 + auto name + enabled', async () => {
    const { face, probe } = makeFace()
    mountCard(face)
    typeCode(GIT_A)
    await settle(probe, GIT_A)
    await waitFor(() => { expect(detectText()).toBe(t('confirmCard.detect.git')) })
    expect(previewNote()).toBe(t('confirmCard.note.repo-new'))
    expect(previewPath()).toBe(`${GIT_A}/docs`)
    expect(q<HTMLInputElement>('[data-dsh-forge-confirm-name]').value).toBe('demo-app')
    expect(submitBtn().disabled).toBe(false)
  })

  it('valid git + forge tree: ✓ git 仓库 · 检出 forge 文档树 + 沿用仓内 preview', async () => {
    const { face, probe } = makeFace()
    mountCard(face)
    typeCode(FORGE_ROOT)
    await settle(probe, FORGE_ROOT)
    await waitFor(() => { expect(detectText()).toBe(t('confirmCard.detect.gitForge')) })
    expect(previewNote()).toBe(t('confirmCard.note.repo-existing'))
    expect(previewPath()).toBe(`${FORGE_ROOT}/docs`)
  })

  it('registered: 已注册 statement + disabled + fast-lane locate (once)', async () => {
    const { face, probe } = makeFace()
    const onLocateRegistered = vi.fn()
    mountCard(face, { onLocateRegistered })
    typeCode('Z:/work/registered-app')
    await settle(probe, 'Z:/work/registered-app')
    await waitFor(() => { expect(detectText()).toBe(t('confirmCard.detect.registered')) })
    expect(submitBtn().disabled).toBe(true)
    expect(onLocateRegistered).toHaveBeenCalledTimes(1)
    expect(onLocateRegistered).toHaveBeenCalledWith({ projectId: 'p-1', displayName: '已注册项目名' })
    // Re-renders (name typing) never re-fire the fast lane.
    fireEvent.change(q<HTMLInputElement>('[data-dsh-forge-confirm-name]'), { target: { value: 'x' } })
    expect(onLocateRegistered).toHaveBeenCalledTimes(1)
  })

  it('nogit: 信息态 (info tone, not error) + 应用管理 preview + still enabled (零 git 强制)', async () => {
    const { face, probe } = makeFace()
    mountCard(face)
    typeCode(NOGIT_ROOT)
    await settle(probe, NOGIT_ROOT)
    await waitFor(() => { expect(detectText()).toBe(t('confirmCard.detect.nogit')) })
    expect(q('[data-dsh-forge-confirm-detect]').getAttribute('data-tone')).toBe('info')
    expect(previewNote()).toBe(t('confirmCard.note.app'))
    expect(q('[data-dsh-forge-confirm-preview-path]')).toBeNull()
    expect(submitBtn().disabled).toBe(false)
  })

  it('missing: 路径不存在 + disabled, no preview row', async () => {
    const { face, probe } = makeFace()
    mountCard(face)
    typeCode(MISSING_ROOT)
    await settle(probe, MISSING_ROOT)
    await waitFor(() => { expect(detectText()).toBe(t('confirmCard.detect.missing')) })
    expect(submitBtn().disabled).toBe(true)
    expect(q('[data-dsh-forge-confirm-preview]')).toBeNull()
  })

  it('unreadable dir: 硬校验 ① readable variant statement + disabled', async () => {
    const { face, probe } = makeFace()
    mountCard(face)
    typeCode(UNREADABLE_ROOT)
    await settle(probe, UNREADABLE_ROOT)
    await waitFor(() => { expect(detectText()).toBe(t('confirmCard.detect.unreadable')) })
    expect(submitBtn().disabled).toBe(true)
  })

  it('parent: 子仓 chips 一键选定 — click refills the code input and re-probes', async () => {
    const { face, probe } = makeFace()
    mountCard(face)
    typeCode('Z:/project/dsh')
    await settle(probe, 'Z:/project/dsh')
    await waitFor(() => { expect(detectText()).toContain(t('confirmCard.detect.parent')) })
    const chips = Array.from(document.querySelectorAll('[data-dsh-forge-confirm-chip]'))
    expect(chips.map(chip => chip.getAttribute('data-dsh-forge-confirm-chip'))).toEqual(['demo-app', 'legacy-repo', 'plain-demo'])
    expect(submitBtn().disabled).toBe(false) // 存在通过 — chips suggest, never block
    fireEvent.click(chips[0]!)
    await settle(probe, 'Z:/project/dsh/demo-app')
    await waitFor(() => { expect(detectText()).toBe(t('confirmCard.detect.git')) })
    expect(q<HTMLInputElement>('[data-dsh-forge-confirm-code]').value).toBe('Z:/project/dsh/demo-app')
  })

  it('entry hygiene: bare drive / relative path rejected locally, zero probe calls', () => {
    const { face, probe } = makeFace()
    mountCard(face)
    typeCode('Z:')
    expect(detectText()).toBe(t('confirmCard.detect.invalid'))
    typeCode('repo/sub')
    expect(detectText()).toBe(t('confirmCard.detect.invalid'))
    expect(probe).not.toHaveBeenCalled()
    expect(submitBtn().disabled).toBe(true)
  })

  it('entry hygiene: quoted input probes the stripped path (剥引号)', async () => {
    const { face, probe } = makeFace()
    mountCard(face)
    typeCode(`"${GIT_A}"`)
    await settle(probe, GIT_A)
    await waitFor(() => { expect(detectText()).toBe(t('confirmCard.detect.git')) })
  })

  it('custom-outside: 授权行 renders only inside the advanced fold content', async () => {
    const { face, probe } = makeFace()
    mountCard(face)
    typeCode(GIT_A)
    await settle(probe, GIT_A)
    expect(q('[data-dsh-forge-confirm-authrow]')).toBeNull()
    fireEvent.change(q<HTMLInputElement>('[data-dsh-forge-confirm-custom]'), { target: { value: 'Z:/elsewhere/docs' } })
    await waitFor(() => { expect(q('[data-dsh-forge-confirm-authrow]').getAttribute('data-auth')).toBe('pending') })
    expect(q('[data-dsh-forge-confirm-auth-outside]').textContent).toBe(t('confirmCard.auth.outside'))
  })
})

describe('AC2 ✎ 展开才见模式+路径 (默认收起)', () => {
  it('panel hidden by default; ✎ expands radios + path; reuse radio offered only on a forge hit', async () => {
    const { face, probe } = makeFace()
    mountCard(face)
    typeCode(GIT_A)
    await settle(probe, GIT_A)
    await waitFor(() => { expect(previewNote()).toBe(t('confirmCard.note.repo-new')) })
    expect(q('[data-dsh-forge-confirm-panel]')).toBeNull()
    expect(q('[data-dsh-forge-confirm-edit]').getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(q('[data-dsh-forge-confirm-edit]'))
    expect(q('[data-dsh-forge-confirm-panel]')).toBeTruthy()
    expect(q('[data-dsh-forge-confirm-edit]').getAttribute('aria-expanded')).toBe('true')
    const radios = () => Array.from(document.querySelectorAll('[data-dsh-forge-confirm-mode]'))
      .map(radio => radio.getAttribute('data-dsh-forge-confirm-mode'))
    expect(radios()).toEqual(['app', 'repo-new']) // no reuse option without a hit
    expect(q<HTMLInputElement>('[data-dsh-forge-confirm-docpath]').value).toBe(`${GIT_A}/docs`)
    // The forge hit offers the third radio (沿用项仅命中时呈现).
    typeCode(FORGE_ROOT)
    await settle(probe, FORGE_ROOT)
    await waitFor(() => { expect(previewNote()).toBe(t('confirmCard.note.repo-existing')) })
    expect(radios()).toEqual(['app', 'repo-new', 'repo-existing'])
  })
})

describe('AC3 黏性禁令 (换路径预选重估;仓内落点永不继承)', () => {
  it('manual mode selection clears on path change (evidence re-preselect)', async () => {
    const { face, probe } = makeFace()
    mountCard(face)
    typeCode(GIT_A)
    await settle(probe, GIT_A)
    await waitFor(() => { expect(previewNote()).toBe(t('confirmCard.note.repo-new')) })
    fireEvent.click(q('[data-dsh-forge-confirm-edit]'))
    fireEvent.click(q('[data-dsh-forge-confirm-mode="app"]'))
    await waitFor(() => { expect(previewNote()).toBe(t('confirmCard.note.app')) })
    typeCode(GIT_B)
    await settle(probe, GIT_B)
    await waitFor(() => { expect(previewNote()).toBe(t('confirmCard.note.repo-new')) })
    expect(previewPath()).toBe(`${GIT_B}/docs`) // B's OWN evidence — A's manual pick never carried over
  })

  it('custom path empties and authorization resets on path change (授权复位)', async () => {
    const { face, probe } = makeFace()
    mountCard(face)
    typeCode(GIT_A)
    await settle(probe, GIT_A)
    fireEvent.change(q<HTMLInputElement>('[data-dsh-forge-confirm-custom]'), { target: { value: 'Z:/elsewhere/docs' } })
    await waitFor(() => { expect(q('[data-dsh-forge-confirm-authrow]').getAttribute('data-auth')).toBe('pending') })
    fireEvent.click(q('[data-dsh-forge-confirm-auth-grant]'))
    await waitFor(() => { expect(q('[data-dsh-forge-confirm-authrow]').getAttribute('data-auth')).toBe('granted') })
    typeCode(GIT_B)
    await settle(probe, GIT_B)
    await waitFor(() => { expect(previewNote()).toBe(t('confirmCard.note.repo-new')) })
    expect(q<HTMLInputElement>('[data-dsh-forge-confirm-custom]').value).toBe('') // 自定义清空
    expect(q('[data-dsh-forge-confirm-authrow]')).toBeNull()
    // Re-typing the SAME custom path demands authorization again (复位,非黏性).
    fireEvent.change(q<HTMLInputElement>('[data-dsh-forge-confirm-custom]'), { target: { value: 'Z:/elsewhere/docs' } })
    await waitFor(() => { expect(q('[data-dsh-forge-confirm-authrow]').getAttribute('data-auth')).toBe('pending') })
    expect(submitBtn().disabled).toBe(true)
  })

  it('an edited 仓内 docs path never inherits to the next path', async () => {
    const { face, probe } = makeFace()
    mountCard(face)
    typeCode(GIT_A)
    await settle(probe, GIT_A)
    fireEvent.click(q('[data-dsh-forge-confirm-edit]'))
    fireEvent.change(q<HTMLInputElement>('[data-dsh-forge-confirm-docpath]'), { target: { value: `${GIT_A}/notes` } })
    await waitFor(() => { expect(previewPath()).toBe(`${GIT_A}/notes`) })
    typeCode(GIT_B)
    await settle(probe, GIT_B)
    await waitFor(() => { expect(previewPath()).toBe(`${GIT_B}/docs`) }) // default, not /notes
  })
})

describe('AC4 enabled 条件 + submit (成功/失败不静默)', () => {
  it('name is a gate: empty name disables; retyping enables', async () => {
    const { face, probe } = makeFace()
    mountCard(face)
    typeCode(GIT_A)
    await settle(probe, GIT_A)
    await waitFor(() => { expect(submitBtn().disabled).toBe(false) })
    fireEvent.change(q<HTMLInputElement>('[data-dsh-forge-confirm-name]'), { target: { value: '' } })
    await waitFor(() => { expect(submitBtn().disabled).toBe(true) })
    fireEvent.change(q<HTMLInputElement>('[data-dsh-forge-confirm-name]'), { target: { value: '手工名' } })
    await waitFor(() => { expect(submitBtn().disabled).toBe(false) })
  })

  it('repo-new submit: exact v2 payload + onDone carries the 落位模式 label', async () => {
    const { face, probe, register } = makeFace()
    const onDone = vi.fn()
    mountCard(face, { onDone })
    typeCode(GIT_A)
    await settle(probe, GIT_A)
    await waitFor(() => { expect(submitBtn().disabled).toBe(false) })
    fireEvent.click(submitBtn())
    await waitFor(() => { expect(register).toHaveBeenCalledTimes(1) })
    expect(register).toHaveBeenCalledWith({
      anchor: GIT_A,
      displayName: 'demo-app',
      docsPlacement: 'repo-new',
      docsPath: `${GIT_A}/docs`,
    })
    await waitFor(() => { expect(onDone).toHaveBeenCalledTimes(1) })
    const result = onDone.mock.calls[0]![0] as { project: Project; modeLabel: string }
    expect(result.project.docsPlacement).toBe('repo-new')
    expect(result.modeLabel).toContain(t('confirmCard.mode.repo-new'))
    expect(result.modeLabel).toContain(`${GIT_A}/docs`)
  })

  it('nogit submit: app payload without docsPath; forge-hit submit: repo-existing payload', async () => {
    const { face, probe, register } = makeFace()
    const onDone = vi.fn()
    mountCard(face, { onDone })
    typeCode(NOGIT_ROOT)
    await settle(probe, NOGIT_ROOT)
    await waitFor(() => { expect(submitBtn().disabled).toBe(false) })
    fireEvent.click(submitBtn())
    await waitFor(() => { expect(register).toHaveBeenCalledWith({ anchor: NOGIT_ROOT, displayName: 'plain-demo', docsPlacement: 'app' }) })
    cleanup() // one card per document — the second leg mounts its own
    const forge = makeFace()
    const onDone2 = vi.fn()
    mountCard(forge.face, { onDone: onDone2 })
    typeCode(FORGE_ROOT)
    await settle(forge.probe, FORGE_ROOT)
    await waitFor(() => { expect(submitBtn().disabled).toBe(false) })
    fireEvent.click(submitBtn())
    await waitFor(() => {
      expect(forge.register).toHaveBeenCalledWith({ anchor: FORGE_ROOT, displayName: 'legacy-repo', docsPlacement: 'repo-existing' })
    })
  })

  it('custom submit requires authorization: payload carries customAuthorized + custom docsPath', async () => {
    const { face, probe, register } = makeFace()
    mountCard(face)
    typeCode(GIT_A)
    await settle(probe, GIT_A)
    fireEvent.change(q<HTMLInputElement>('[data-dsh-forge-confirm-custom]'), { target: { value: 'Z:/elsewhere/docs' } })
    await waitFor(() => { expect(submitBtn().disabled).toBe(true) }) // 待授权 blocks
    fireEvent.click(q('[data-dsh-forge-confirm-auth-grant]'))
    await waitFor(() => { expect(submitBtn().disabled).toBe(false) })
    fireEvent.click(submitBtn())
    await waitFor(() => {
      expect(register).toHaveBeenCalledWith({
        anchor: GIT_A,
        displayName: 'demo-app',
        docsPlacement: 'custom',
        docsPath: 'Z:/elsewhere/docs',
        customAuthorized: true,
      })
    })
  })

  it('submit failure stays in the card with the error code (提交失败留在卡内修正,不静默)', async () => {
    const probe = vi.fn(async (input: { path: string }) => reportForPath(input.path))
    const register = vi.fn(async (): Promise<Project> => {
      throw { code: 'ERR_PROJECT_EXISTS', message: 'already registered' }
    })
    const onDone = vi.fn()
    mountCard({ probeProjectPath: probe, registerProject: register }, { onDone })
    typeCode(GIT_A)
    await settle(probe, GIT_A)
    await waitFor(() => { expect(submitBtn().disabled).toBe(false) })
    fireEvent.click(submitBtn())
    await waitFor(() => { expect(q('[data-dsh-forge-confirm-submit-error]').textContent).toContain('ERR_PROJECT_EXISTS') })
    expect(q('[data-dsh-forge-dialog="confirm-card"]')).toBeTruthy() // 卡未关闭
    expect(onDone).not.toHaveBeenCalled()
  })
})

describe('AC5 高级折叠:仓外显式授权 (BIZ-001/003 收窄)', () => {
  it('custom inside the 代码区: no auth row, submit enabled directly', async () => {
    const { face, probe } = makeFace()
    mountCard(face)
    typeCode(GIT_A)
    await settle(probe, GIT_A)
    fireEvent.change(q<HTMLInputElement>('[data-dsh-forge-confirm-custom]'), { target: { value: `${GIT_A}/specs` } })
    await waitFor(() => { expect(previewNote()).toBe(t('confirmCard.custom.note')) })
    expect(q('[data-dsh-forge-confirm-authrow]')).toBeNull()
    expect(submitBtn().disabled).toBe(false)
  })

  it('授权行: pending → grant → granted (✓ 复检通过) unblocks submit', async () => {
    const { face, probe } = makeFace()
    mountCard(face)
    typeCode(GIT_A)
    await settle(probe, GIT_A)
    fireEvent.change(q<HTMLInputElement>('[data-dsh-forge-confirm-custom]'), { target: { value: 'Z:/elsewhere/docs' } })
    await waitFor(() => { expect(submitBtn().disabled).toBe(true) })
    fireEvent.click(q('[data-dsh-forge-confirm-auth-grant]'))
    await waitFor(() => { expect(q('[data-dsh-forge-confirm-auth-ok]').textContent).toContain(t('confirmCard.auth.granted')) })
    expect(submitBtn().disabled).toBe(false)
  })

  it('授权复检失败 → 授权行错误态 (ERR_EXTERNAL_PATH_UNREADABLE);re-grant recovers', async () => {
    let failOnce = true
    const probe = vi.fn(async (input: { path: string }) => reportForPath(input.path))
    const authorize = vi.fn(async (path: string): Promise<void> => {
      if (failOnce) throw { code: 'ERR_EXTERNAL_PATH_UNREADABLE', message: `unreadable: ${path}` }
    })
    mountCard({ probeProjectPath: probe, registerProject: vi.fn(async () => { throw new Error('unreached') }), authorizeExternalDocPath: authorize })
    typeCode(GIT_A)
    await settle(probe, GIT_A)
    fireEvent.change(q<HTMLInputElement>('[data-dsh-forge-confirm-custom]'), { target: { value: 'Z:/docs/gone' } })
    await waitFor(() => { expect(q('[data-dsh-forge-confirm-authrow]').getAttribute('data-auth')).toBe('pending') })
    fireEvent.click(q('[data-dsh-forge-confirm-auth-grant]'))
    await waitFor(() => { expect(q('[data-dsh-forge-confirm-authrow]').getAttribute('data-auth')).toBe('failed') })
    expect(q('[data-dsh-forge-confirm-auth-outside]').textContent).toBe(t('confirmCard.auth.failed'))
    expect(submitBtn().disabled).toBe(true)
    failOnce = false
    fireEvent.click(q('[data-dsh-forge-confirm-auth-grant]'))
    await waitFor(() => { expect(q('[data-dsh-forge-confirm-authrow]').getAttribute('data-auth')).toBe('granted') })
  })
})

// ---------------------------------------------------------------------------
// The build-stage mock twin (mock 侦测动词)
// ---------------------------------------------------------------------------

describe('createMockConfirmCardFace (build-stage verb twin)', () => {
  it('probeProjectPath: the fixture matrix + registered fast lane off the state', async () => {
    const face = createMockConfirmCardFace()
    const registered = await face.probeProjectPath({ path: 'Z:\\project\\dsh\\dsh-forge' })
    expect(registered.registered).toEqual({ projectId: '6f1a2d3e-8b44-4c9a-9d01-3c7f5a2b9e10', displayName: 'dsh-forge' })
    const parent = await face.probeProjectPath({ path: MOCK_CARD_PARENT_ROOT })
    expect(parent.childRepos.map(child => child.name)).toEqual(['demo-app', 'legacy-repo', 'plain-demo'])
    expect(parent.gitRoot).toBeNull()
    const missing = await face.probeProjectPath({ path: MOCK_CARD_MISSING_ROOT })
    expect(missing.exists).toBe(false)
    expect(missing.pathKey).not.toBeNull()
    const nogit = await face.probeProjectPath({ path: MOCK_CARD_NOGIT_ROOT })
    expect(nogit.gitRoot).toBeNull()
    expect(nogit.readable).toBe(true)
    const forge = await face.probeProjectPath({ path: MOCK_CARD_FORGE_ROOT })
    expect(forge.forgeTreeHit).toBe(true)
    expect(forge.gitRoot).not.toBeNull()
    const unknown = await face.probeProjectPath({ path: 'Z:/work/unknown-repo' })
    expect(unknown.gitRoot).not.toBeNull()
    expect(unknown.forgeTreeHit).toBe(false)
    const rejectedEntry = await face.probeProjectPath({ path: 'Z:' })
    expect(rejectedEntry.pathKey).toBeNull()
    expect(rejectedEntry.exists).toBe(false)
  })

  it('registerProject v2: app folds to the derived docs root; duplicate → ERR_PROJECT_EXISTS', async () => {
    const face = createMockConfirmCardFace()
    const created = await face.registerProject({ anchor: 'Z:/work/demo-app', displayName: '演示', docsPlacement: 'app' })
    expect(created).toMatchObject({
      displayName: '演示',
      codeRoot: 'Z:/work/demo-app',
      docLocationType: 'external',
      docLocationPath: 'Z:/userData/workbench/docs/demo-app',
      docsPlacement: 'app',
      projectionState: 'pending',
    })
    const defaulted = await face.registerProject({ anchor: 'Z:/work/other-repo', docsPlacement: 'repo-new', docsPath: 'Z:/work/other-repo/docs' })
    expect(defaulted.displayName).toBe('other-repo') // 缺省 = 文件夹名
    expect(defaulted.docLocationType).toBe('in_repo')
    await expect(face.registerProject({ anchor: 'Z:/work/demo-app', docsPlacement: 'app' }))
      .rejects.toMatchObject({ code: 'ERR_PROJECT_EXISTS' })
    await expect(face.registerProject({ anchor: 'Z:\\project\\dsh\\dsh-forge', docsPlacement: 'app' }))
      .rejects.toMatchObject({ code: 'ERR_PROJECT_EXISTS' }) // both separator spellings hit the same root
  })

  it('authorizeExternalDocPath: the unreadable fixture rejects, everything else resolves', async () => {
    const face = createMockConfirmCardFace()
    await expect(face.authorizeExternalDocPath?.(MOCK_WIZARD_EXTERNAL_UNREADABLE))
      .rejects.toMatchObject({ code: 'ERR_EXTERNAL_PATH_UNREADABLE' })
    await expect(face.authorizeExternalDocPath?.('Z:/docs/elsewhere')).resolves.toBeUndefined()
  })
})

// Locale parity is compile-time enforced (zh: Record<WorkbenchKey, string>);
// the zh copy used above is asserted verbatim against the decisions §5 v2
// vocabulary once, so a silent dictionary edit cannot drift the card copy.
describe('locale vocabulary (decisions §5 v2 对齐)', () => {
  it('the three-tier + statement copy stays spec-verbatim', () => {
    expect(zh['confirmCard.note.repo-new']).toBe('随 git 提交、可 PR 评审')
    expect(zh['confirmCard.note.app']).not.toContain('内部版本历史') // T6: shadow git deferred
    expect(zh['confirmCard.detect.nogit']).toContain('未检测到 git')
    expect(zh['confirmCard.detect.nogit']).toContain('文档将由应用管理')
    expect(zh['confirmCard.trace']).toBe('过程留痕 · 应用数据目录(本机,不进 git)')
    expect(zh['confirmCard.title']).toBe('添加项目')
    expect(zh['confirmCard.docs.label']).toBe('文档位置')
  })
})
