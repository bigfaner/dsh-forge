// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EMPTY_WIZARD_DRAFT, RegisterWizard, buildProjectPatch, buildRegisterInput,
  draftOfProject, isWizardDraftDirty,
} from '../src/client/views/overview/RegisterWizard.tsx'
import type { RegisterWizardProps } from '../src/client/views/overview/RegisterWizard.tsx'
import { WorkbenchShell } from '../src/client/WorkbenchShell.tsx'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import { zh } from '../src/client/locale/zh.ts'
import {
  WIZARD_ERROR_CODES, WIZARD_ERROR_MESSAGE_KEYS, wizardErrorGuidance, wizardErrorMessage,
} from '../src/client/i18n/errors.ts'
import { directoryNameOf, normalizePathForCompare, samePath } from '../src/client/paths.ts'
import {
  MOCK_NOW, MOCK_WORKBENCH_STATE, MOCK_WIZARD_EXTERNAL_OK, MOCK_WIZARD_EXTERNAL_UNREADABLE,
  MOCK_WIZARD_FEATURE_TOTAL, MOCK_WIZARD_NO_FORGE_ROOT, MOCK_WIZARD_OK_ROOT, MOCK_WIZARD_TASK_TOTAL,
  MOCK_WIZARD_UNREADABLE_ROOT, createMockRegisterWizardFace,
} from '../src/client/mocks/workbench.ts'
import type { CodeRootProbeResult, WorkbenchShellProps } from '../src/client/contract.ts'
import type { Project, WorkbenchState } from '../src/client/ipc-types.ts'
import type { ViewKeySnapshot, WorkbenchTabKey } from '../src/client/store/view-key.ts'

// Task 5.4 — the UF1 register wizard BUILD units (mocked face; 5.14 wires the
// IPC verbs). AC map:
//   AC1 三步流 + 回退不丢状态 · AC2 检出即时反馈 + 六类拒绝码内联 · AC3 仓外
//   必经授权 · AC4 编辑模式预填 + updateProject 语义(重指向校验同链) · AC5
//   focus trap / Esc 脏态确认 / aria · AC6 本测试套件自身, plus the G5 ≤3 步
//   assertion (CTA-open → submit-confirm = exactly three forward clicks).

type Dict = Record<WorkbenchKey, string>
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]
const t = { en: bind(en), zh: bind(zh) }

const ACTIVE_PROJECT = MOCK_WORKBENCH_STATE.projects[0] as Project
const OTHER_PROJECT = MOCK_WORKBENCH_STATE.projects[1] as Project

/** Deferred promise helper for driving in-flight states deterministically. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

/** A spied face over the real mock twin (verb semantics intact underneath). */
function makeFace(initial: WorkbenchState = MOCK_WORKBENCH_STATE) {
  const base = createMockRegisterWizardFace(initial)
  return Object.assign({
    probeCodeRoot: vi.fn(base.probeCodeRoot),
    probeExternalPath: vi.fn(base.probeExternalPath),
    registerProject: vi.fn(base.registerProject),
    updateProject: vi.fn(base.updateProject),
    authorizeExternalDocPath: vi.fn(base.authorizeExternalDocPath),
  }, { base })
}
type WizardFaceSpy = ReturnType<typeof makeFace>

const $ = (selector: string): HTMLElement => {
  const element = document.querySelector(selector)
  if (element === null) throw new Error(`missing ${selector}`)
  return element as HTMLElement
}
const card = () => $('[data-dsh-forge-dialog="register-wizard"]')
const stepAttr = () => card().querySelector('[data-dsh-forge-wizard-step]')?.getAttribute('data-dsh-forge-wizard-step')
const next = () => $('[data-dsh-forge-wizard-next]') as HTMLButtonElement
const finish = () => $('[data-dsh-forge-wizard-finish]') as HTMLButtonElement
const back = () => $('[data-dsh-forge-wizard-back]') as HTMLButtonElement
const pathInput = () => $('[data-dsh-forge-wizard-path-input]') as HTMLInputElement
const externalInput = () => $('[data-dsh-forge-wizard-external-input]') as HTMLInputElement
const authorize = () => $('[data-dsh-forge-wizard-authorize]') as HTMLInputElement
const nameInput = () => $('[data-dsh-forge-wizard-name-input]') as HTMLInputElement

/** Render the wizard in register mode (default props mirror the shell's call). */
function renderWizard(props: Partial<RegisterWizardProps> = {}, face: WizardFaceSpy = makeFace()) {
  const onClose = props.onClose ?? vi.fn()
  render(
    <RegisterWizard
      t={t.en}
      mode="register"
      project={undefined}
      projects={MOCK_WORKBENCH_STATE.projects}
      onClose={onClose}
      face={face}
      {...props}
    />,
  )
  return { face, onClose: onClose as ReturnType<typeof vi.fn> }
}

/** Render the wizard in EDIT mode over a registered row. */
function renderEdit(project: Project = OTHER_PROJECT, props: Partial<RegisterWizardProps> = {}, face: WizardFaceSpy = makeFace()) {
  const onClose = props.onClose ?? vi.fn()
  render(
    <RegisterWizard
      t={t.en}
      mode="edit"
      project={project}
      projects={MOCK_WORKBENCH_STATE.projects}
      onClose={onClose}
      face={face}
      {...props}
    />,
  )
  return { face, onClose: onClose as ReturnType<typeof vi.fn> }
}

/** Fill step ① and settle the detection probe into a detected state. */
async function fillStep1(path: string = MOCK_WIZARD_OK_ROOT) {
  fireEvent.change(pathInput(), { target: { value: path } })
  await waitFor(() => { expect(next().disabled).toBe(false) })
}

// The upstream StateDot (consumed by the tasks-seat board since task 5.5,
// via the WorkbenchShell mount chain) resolves through the module table at
// runtime; the npm node entry carries undeclared transitive deps
// (clsx/shiki/...) that only the upstream monorepo supplies, so the jsdom
// unit render stubs it (the shell.spec precedent).
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  StateDot: (props: { state: string }) => <span data-mock-state-dot={props.state} />,
}))

afterEach(() => cleanup())

// ---------------------------------------------------------------------------
// Pure model: paths primitives + the draft → verb payload builders
// ---------------------------------------------------------------------------

describe('paths primitives', () => {
  it('normalizePathForCompare trims and strips trailing separators (root survives)', () => {
    expect(normalizePathForCompare('  Z:\\a\\b\\ ')).toBe('Z:\\a\\b')
    expect(normalizePathForCompare('Z:\\a\\b//')).toBe('Z:\\a\\b')
    expect(normalizePathForCompare('/')).toBe('/')
    expect(normalizePathForCompare('')).toBe('')
  })

  it('samePath: separator-spelling variants equal, different tails differ', () => {
    expect(samePath('Z:\\a\\b', 'Z:\\a\\b\\')).toBe(true)
    expect(samePath('Z:\\a\\b', ' Z:\\a\\b ')).toBe(true)
    expect(samePath('Z:\\a\\b', 'Z:\\a\\c')).toBe(false)
    expect(samePath('', '  ')).toBe(true)
  })

  it('directoryNameOf: last non-empty segment, both separators, trailing tolerated', () => {
    expect(directoryNameOf('Z:\\project\\dsh-forge')).toBe('dsh-forge')
    expect(directoryNameOf('Z:\\project\\x\\')).toBe('x')
    expect(directoryNameOf('/home/user/repo')).toBe('repo')
    expect(directoryNameOf('')).toBe('')
  })
})

describe('draft model: buildRegisterInput / buildProjectPatch / dirtiness', () => {
  it('buildRegisterInput: in_repo nulls the path; external trims it; empty name = absent key (缺省 dirname)', () => {
    const input = buildRegisterInput({ ...EMPTY_WIZARD_DRAFT, codeRoot: ' Z:\\project\\demo ' })
    expect(input).toEqual({ codeRoot: 'Z:\\project\\demo', docLocationType: 'in_repo', docLocationPath: null })
    expect('displayName' in input).toBe(false)

    const external = buildRegisterInput({
      ...EMPTY_WIZARD_DRAFT,
      codeRoot: 'Z:\\project\\demo',
      docLocationType: 'external',
      docLocationPath: '  Z:\\docs\\demo  ',
      displayName: '  Demo  ',
    })
    expect(external).toEqual({
      codeRoot: 'Z:\\project\\demo',
      docLocationType: 'external',
      docLocationPath: 'Z:\\docs\\demo',
      displayName: 'Demo',
    })
  })

  it('buildProjectPatch: rename + repoint in one patch; empty name = absent key', () => {
    const rename = buildProjectPatch({ ...EMPTY_WIZARD_DRAFT, displayName: 'renamed' })
    expect(rename).toEqual({ displayName: 'renamed', docLocationType: 'in_repo', docLocationPath: null })

    const repoint = buildProjectPatch({
      ...EMPTY_WIZARD_DRAFT,
      docLocationType: 'external',
      docLocationPath: ' Z:\\docs\\demo\\ ',
    })
    expect(repoint).toEqual({ docLocationType: 'external', docLocationPath: 'Z:\\docs\\demo' })
    expect('displayName' in repoint).toBe(false)
  })

  it('draftOfProject prefill + isWizardDraftDirty: identical = clean, each field arms it', () => {
    const prefill = draftOfProject(OTHER_PROJECT)
    expect(isWizardDraftDirty(prefill, draftOfProject(OTHER_PROJECT))).toBe(false)
    expect(isWizardDraftDirty(EMPTY_WIZARD_DRAFT, EMPTY_WIZARD_DRAFT)).toBe(false)

    expect(isWizardDraftDirty({ ...prefill, displayName: 'x' }, prefill)).toBe(true)
    expect(isWizardDraftDirty({ ...prefill, docLocationPath: 'Z:\\other' }, prefill)).toBe(true)
    // Edit prefill: the CURRENT external path carries its persisted authorization.
    expect(prefill.externalAuthorized).toBe(true)
    expect(draftOfProject(ACTIVE_PROJECT).externalAuthorized).toBe(false)
    // Register baseline: any input counts as dirty (ui-design: 步骤②之后先确认).
    expect(isWizardDraftDirty({ ...EMPTY_WIZARD_DRAFT, codeRoot: 'Z:\\x' }, EMPTY_WIZARD_DRAFT)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// i18n/errors: the centralized code → copy routing (Implementation Note)
// ---------------------------------------------------------------------------

describe('i18n/errors: the centralized 错误码→文案 routing', () => {
  it('every wizard error code routes to non-empty copy in BOTH locales, guidance where defined', () => {
    for (const code of WIZARD_ERROR_CODES) {
      expect(wizardErrorMessage(code, t.en)).toBe(en[WIZARD_ERROR_MESSAGE_KEYS[code]])
      expect(wizardErrorMessage(code, t.en).length).toBeGreaterThan(0)
      expect(wizardErrorMessage(code, t.zh).length).toBeGreaterThan(0)
      const guidance = wizardErrorGuidance(code, t.zh)
      if (code === 'ERR_PROJECT_EXISTS') {
        // The exists terminal guides through its locate CTA instead.
        expect(guidance).toBeUndefined()
      } else {
        expect(guidance === undefined ? '' : guidance.length).toBeGreaterThan(0)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Three-step machine (AC1 + G5 ≤3 步)
// ---------------------------------------------------------------------------

describe('RegisterWizard: the three-step machine', () => {
  it('happy path: exactly THREE forward clicks from open to submit-confirm; the verb carries the collected input', async () => {
    const { face, onClose } = renderWizard()
    await fillStep1(MOCK_WIZARD_OK_ROOT)
    fireEvent.click(next()) // 1 → 2
    expect(stepAttr()).toBe('2')
    fireEvent.click(next()) // 2 → 3 (in_repo default — 仓外可跳过)
    expect(stepAttr()).toBe('3')
    fireEvent.click(finish()) // 3 → submit
    await waitFor(() => { expect(onClose).toHaveBeenCalledTimes(1) })

    const result = (onClose.mock.calls[0] as [{ project: Project; action: 'register' | 'update' }])[0]
    expect(result.action).toBe('register')
    expect(result.project.codeRoot).toBe(MOCK_WIZARD_OK_ROOT)
    expect(result.project.displayName).toBe('demo') // 缺省 = codeRoot 目录名
    expect(result.project.docLocationPath).toBeNull()
    expect(face.registerProject).toHaveBeenCalledTimes(1)
    expect(face.registerProject).toHaveBeenCalledWith({
      codeRoot: MOCK_WIZARD_OK_ROOT,
      docLocationType: 'in_repo',
      docLocationPath: null,
    })
  })

  it('detected feedback shows the task/feature overview counts (AC2 检出成功概览)', async () => {
    renderWizard()
    fireEvent.change(pathInput(), { target: { value: MOCK_WIZARD_OK_ROOT } })
    await waitFor(() => { expect($('[data-dsh-forge-wizard-probe="detected"]')).not.toBeNull() })
    expect($('[data-dsh-forge-wizard-probe="detected"]').textContent)
      .toBe(en['wizard.step1.detected']
        .replace('{tasks}', String(MOCK_WIZARD_TASK_TOTAL))
        .replace('{features}', String(MOCK_WIZARD_FEATURE_TOTAL)))
  })

  it('probing spinner while in flight; the resolution enables 「下一步」', async () => {
    const face = makeFace()
    const gate = deferred<CodeRootProbeResult>()
    face.probeCodeRoot.mockImplementationOnce(() => gate.promise)
    renderWizard({}, face)
    fireEvent.change(pathInput(), { target: { value: MOCK_WIZARD_OK_ROOT } })
    expect($('[data-dsh-forge-wizard-probe="checking"]')).not.toBeNull()
    expect(next().disabled).toBe(true)
    act(() => { gate.resolve({ available: true, taskTotal: 5, featureTotal: 2 }) })
    await waitFor(() => { expect($('[data-dsh-forge-wizard-probe="detected"]').textContent).toContain('5') })
    expect(next().disabled).toBe(false)
  })

  it('ERR_CODE_ROOT_UNREADABLE: inline message + guidance, stays ①, Next disabled', async () => {
    const { face } = renderWizard()
    fireEvent.change(pathInput(), { target: { value: MOCK_WIZARD_UNREADABLE_ROOT } })
    await waitFor(() => { expect($('[data-dsh-forge-wizard-probe="failed"]')).not.toBeNull() })
    const error = $('[data-dsh-forge-wizard-probe="failed"]')
    expect(error.getAttribute('role')).toBe('alert')
    expect(error.textContent).toContain(en['wizard.err.codeRootUnreadable'])
    expect(error.textContent).toContain(en['wizard.err.codeRootUnreadable.guide'])
    expect(next().disabled).toBe(true)
    fireEvent.submit(card().querySelector('[data-dsh-forge-wizard-step]') as HTMLFormElement)
    expect(stepAttr()).toBe('1')
    expect(face.registerProject).not.toHaveBeenCalled()
  })

  it('ERR_FORGE_NOT_DETECTED: same 步① discipline, its own copy', async () => {
    renderWizard()
    fireEvent.change(pathInput(), { target: { value: MOCK_WIZARD_NO_FORGE_ROOT } })
    await waitFor(() => { expect($('[data-dsh-forge-wizard-probe="failed"]').textContent).toContain(en['wizard.err.forgeNotDetected']) })
    expect($('[data-dsh-forge-wizard-probe="failed"]').textContent).toContain(en['wizard.err.forgeNotDetected.guide'])
    expect(next().disabled).toBe(true)
  })

  it('Enter (form submit) advances a valid step ①', async () => {
    renderWizard()
    await fillStep1(MOCK_WIZARD_OK_ROOT)
    fireEvent.submit(card().querySelector('[data-dsh-forge-wizard-step]') as HTMLFormElement)
    expect(stepAttr()).toBe('2')
  })

  it('back navigation keeps every collected value (AC1 步骤间回退不丢状态)', async () => {
    renderWizard()
    await fillStep1(MOCK_WIZARD_OK_ROOT)
    fireEvent.click(next())
    fireEvent.click($('[data-dsh-forge-wizard-doc-external]'))
    fireEvent.change(externalInput(), { target: { value: MOCK_WIZARD_EXTERNAL_OK } })
    fireEvent.click(authorize())
    await waitFor(() => { expect(next().disabled).toBe(false) })
    fireEvent.click(next())
    expect(stepAttr()).toBe('3')
    fireEvent.change(nameInput(), { target: { value: 'renamed-on-step3' } })

    fireEvent.click(back()) // 3 → 2
    expect(externalInput().value).toBe(MOCK_WIZARD_EXTERNAL_OK)
    expect(authorize().checked).toBe(true)
    fireEvent.click(back()) // 2 → 1
    expect(pathInput().value).toBe(MOCK_WIZARD_OK_ROOT)
    fireEvent.click(next())
    fireEvent.click(next())
    expect(stepAttr()).toBe('3')
    expect(nameInput().value).toBe('renamed-on-step3') // survived the round trip
    expect($('[data-dsh-forge-wizard-summary-doc]').textContent).toContain(MOCK_WIZARD_EXTERNAL_OK)
  })
})

// ---------------------------------------------------------------------------
// Step ②: 仓外 validation chain + the explicit authorization (AC2/AC3)
// ---------------------------------------------------------------------------

describe('RegisterWizard: step ② docs-location chain', () => {
  async function toStep2() {
    const handles = renderWizard()
    await fillStep1(MOCK_WIZARD_OK_ROOT)
    fireEvent.click(next())
    expect(stepAttr()).toBe('2')
    return handles
  }

  it('default in_repo: no external surface at all, 「下一步」 ready immediately (可跳过)', async () => {
    const { face } = await toStep2()
    expect(document.querySelector('[data-dsh-forge-wizard-external-input]')).toBeNull()
    expect(document.querySelector('[data-dsh-forge-wizard-auth-block]')).toBeNull()
    expect(next().disabled).toBe(false)
    expect(face.probeExternalPath).not.toHaveBeenCalled()
  })

  it('external 必填: empty path → required error + Next disabled', async () => {
    await toStep2()
    fireEvent.click($('[data-dsh-forge-wizard-doc-external]'))
    expect($('[data-dsh-forge-wizard-external-error="required"]').textContent).toContain(en['wizard.step2.required'])
    expect(next().disabled).toBe(true)
  })

  it('ERR_DOC_PATH_CONFLICT: path = codeRoot → exact ui-design copy, Next disabled, probe NOT consulted', async () => {
    const { face } = await toStep2()
    fireEvent.click($('[data-dsh-forge-wizard-doc-external]'))
    fireEvent.change(externalInput(), { target: { value: `${MOCK_WIZARD_OK_ROOT}\\` } })
    expect($('[data-dsh-forge-wizard-external-error="conflict"]').textContent)
      .toContain(en['wizard.err.docPathConflict'])
    expect(next().disabled).toBe(true)
    expect(face.probeExternalPath).not.toHaveBeenCalled()
  })

  it('ERR_EXTERNAL_PATH_UNREADABLE: unreadable fixture → inline error + 授权说明块 guidance, Next disabled', async () => {
    await toStep2()
    fireEvent.click($('[data-dsh-forge-wizard-doc-external]'))
    fireEvent.change(externalInput(), { target: { value: MOCK_WIZARD_EXTERNAL_UNREADABLE } })
    await waitFor(() => { expect($('[data-dsh-forge-wizard-external-error="unreadable"]')).not.toBeNull() })
    expect($('[data-dsh-forge-wizard-external-error="unreadable"]').textContent)
      .toContain(en['wizard.err.externalPathUnreadable'])
    expect($('[data-dsh-forge-wizard-auth-block]').textContent).toContain(en['wizard.step2.authorize'])
    expect(next().disabled).toBe(true)
  })

  it('authorization gate: readable path but unchecked → disabled with the reason; a path edit RESETS the confirm', async () => {
    await toStep2()
    fireEvent.click($('[data-dsh-forge-wizard-doc-external]'))
    fireEvent.change(externalInput(), { target: { value: MOCK_WIZARD_EXTERNAL_OK } })
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-wizard-external-error="unreadable"]')).toBeNull() })
    // 未授权不可进入下一步 (AC3)
    expect(next().disabled).toBe(true)
    expect(next().title).toBe(en['wizard.step2.needAuthorize'])
    fireEvent.click(authorize())
    await waitFor(() => { expect(next().disabled).toBe(false) })
    // Editing the path voids the authorization — the confirm targeted the old path.
    fireEvent.change(externalInput(), { target: { value: MOCK_WIZARD_EXTERNAL_OK } })
    await waitFor(() => { expect(next().disabled).toBe(false) })
    fireEvent.change(externalInput(), { target: { value: 'Z:\\docs\\other' } })
    await waitFor(() => { expect(next().disabled).toBe(true) })
    expect(authorize().checked).toBe(false)
  })

  it('zh seat renders the zh copy (locale balance spot check)', async () => {
    render(
      <RegisterWizard
        t={t.zh}
        mode="register"
        project={undefined}
        projects={MOCK_WORKBENCH_STATE.projects}
        onClose={vi.fn()}
      />,
    )
    expect(document.querySelector('[data-dsh-forge-dialog="register-wizard"] h2')?.textContent).toBe(zh['wizard.title'])
    expect($('[data-dsh-forge-wizard-stepper]').getAttribute('aria-label')).toBe('步骤 1/3')
    expect(next().textContent).toBe(zh['wizard.next'])
  })
})

// ---------------------------------------------------------------------------
// Step ③: summary + submit terminals
// ---------------------------------------------------------------------------

describe('RegisterWizard: step ③ summary + submit', () => {
  async function toStep3(overrides: { path?: string; external?: string } = {}) {
    const handles = renderWizard()
    await fillStep1(overrides.path ?? MOCK_WIZARD_OK_ROOT)
    fireEvent.click(next())
    if (overrides.external !== undefined) {
      fireEvent.click($('[data-dsh-forge-wizard-doc-external]'))
      fireEvent.change(externalInput(), { target: { value: overrides.external } })
      fireEvent.click(authorize())
    }
    await waitFor(() => { expect(next().disabled).toBe(false) })
    fireEvent.click(next())
    expect(stepAttr()).toBe('3')
    return handles
  }

  it('summary shows the collected values with the dirname placeholder (缺省)', async () => {
    await toStep3()
    expect($('[data-dsh-forge-wizard-summary-coderoot]').textContent).toBe(MOCK_WIZARD_OK_ROOT)
    expect($('[data-dsh-forge-wizard-summary-doc]').textContent).toContain(en['overview.doc.inRepo'])
    expect(nameInput().placeholder).toBe('demo')
  })

  it('typed displayName rides the verb input verbatim', async () => {
    const { face } = await toStep3()
    fireEvent.change(nameInput(), { target: { value: '  My Demo  ' } })
    fireEvent.click(finish())
    await waitFor(() => { expect(face.registerProject).toHaveBeenCalledTimes(1) })
    expect(face.registerProject.mock.calls[0][0].displayName).toBe('My Demo')
  })

  it('6.4: an external submit records the step-② authorization BEFORE registerProject (the persisted consent the registry chain reads); in_repo never fires it', async () => {
    // in_repo: no authorization member call at all.
    const inRepo = await toStep3()
    fireEvent.click(finish())
    await waitFor(() => { expect(inRepo.face.registerProject).toHaveBeenCalledTimes(1) })
    expect(inRepo.face.authorizeExternalDocPath).not.toHaveBeenCalled()
    cleanup() // one dialog in the document at a time — $() targets the first

    // external + authorized: the record lands first, with the SAME path
    // normalization the register payload carries (comparable against the
    // registered docLocationPath).
    const external = await toStep3({ external: `${MOCK_WIZARD_EXTERNAL_OK}\\` })
    fireEvent.click(finish())
    await waitFor(() => { expect(external.face.registerProject).toHaveBeenCalledTimes(1) })
    expect(external.face.authorizeExternalDocPath).toHaveBeenCalledTimes(1)
    expect(external.face.authorizeExternalDocPath).toHaveBeenCalledWith(MOCK_WIZARD_EXTERNAL_OK)
    expect(external.face.registerProject.mock.calls[0][0].docLocationPath).toBe(MOCK_WIZARD_EXTERNAL_OK)
    expect(
      external.face.authorizeExternalDocPath.mock.invocationCallOrder[0],
      'the authorization record precedes the register verb (the validation chain reads it)',
    ).toBeLessThan(external.face.registerProject.mock.invocationCallOrder[0])
  })

  it('submitting: finish disabled + spinner label, Esc/✕ disarmed until settle', async () => {
    const face = makeFace()
    const gate = deferred<Project>()
    face.registerProject.mockImplementationOnce(() => gate.promise)
    const { onClose } = renderWizard({}, face)
    await fillStep1(MOCK_WIZARD_OK_ROOT)
    fireEvent.click(next())
    fireEvent.click(next())
    fireEvent.click(finish())
    expect(finish().disabled).toBe(true)
    // The spinner rides the button (its label is the accessible copy).
    expect(finish().querySelector('[data-dsh-forge-launch-spinner]')).not.toBeNull()
    expect(finish().querySelector('[data-dsh-forge-launch-spinner]')?.getAttribute('aria-label')).toBe(en['wizard.submitting'])
    fireEvent.keyDown(card(), { key: 'Escape' })
    expect(document.querySelector('[data-dsh-forge-dialog="register-wizard-discard"]')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    act(() => {
      gate.resolve({
        id: 'p1', displayName: 'demo', codeRoot: MOCK_WIZARD_OK_ROOT,
        docLocationType: 'in_repo', docLocationPath: null,
        createdAt: MOCK_NOW, lastActivatedAt: null,
      })
    })
    await waitFor(() => { expect(onClose).toHaveBeenCalledTimes(1) })
    const result = (onClose.mock.calls[0] as [{ project: Project; action: 'register' }])[0]
    expect(result.project.codeRoot).toBe(MOCK_WIZARD_OK_ROOT)
  })

  it('ERR_PROJECT_EXISTS: 已注册提示 + locate hands over the existing row and closes', async () => {
    const onLocate = vi.fn()
    const onClose = vi.fn()
    // The ACTIVE fixture's codeRoot is registered in the default mock registry.
    renderWizard({ onLocate, onClose })
    await fillStep1(ACTIVE_PROJECT.codeRoot)
    fireEvent.click(next())
    fireEvent.click(next())
    fireEvent.click(finish())
    await waitFor(() => { expect($('[data-dsh-forge-wizard-exists]')).not.toBeNull() })
    expect($('[data-dsh-forge-wizard-exists]').textContent).toContain(en['wizard.err.projectExists'])
    fireEvent.click($('[data-dsh-forge-wizard-locate]'))
    expect(onLocate).toHaveBeenCalledWith(ACTIVE_PROJECT)
    expect(onClose).toHaveBeenCalledTimes(1) // no result — a cancel-shaped close
    expect((onClose.mock.calls[0] as [unknown])[0]).toBeUndefined()
  })

  it('generic verb failure: the failed line carries the serialized message', async () => {
    const face = makeFace()
    face.registerProject.mockImplementationOnce(async () => {
      throw { code: 'ERR_WORKBENCH_DB', message: 'probe failed (test)' }
    })
    renderWizard({}, face)
    await fillStep1(MOCK_WIZARD_OK_ROOT)
    fireEvent.click(next())
    fireEvent.click(next())
    fireEvent.click(finish())
    await waitFor(() => { expect($('[data-dsh-forge-wizard-submit-error]')).not.toBeNull() })
    expect($('[data-dsh-forge-wizard-submit-error]').textContent)
      .toBe(en['wizard.submitFailed'].replace('{message}', 'probe failed (test)'))
  })
})

// ---------------------------------------------------------------------------
// Edit mode: prefill + updateProject semantics (AC4 重指向校验同链)
// ---------------------------------------------------------------------------

describe('RegisterWizard: edit mode (重新指向)', () => {
  it('prefills from the registered row: title, read-only root, external selected, persisted authorization, name', async () => {
    renderEdit()
    expect(document.querySelector('[data-dsh-forge-dialog="register-wizard"] h2')?.textContent).toBe(en['wizard.editTitle'])
    expect(pathInput().readOnly).toBe(true)
    expect(pathInput().value).toBe(OTHER_PROJECT.codeRoot)
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-wizard-probe="detected"]')).not.toBeNull() })
    await waitFor(() => { expect(next().disabled).toBe(false) })
    fireEvent.click(next())
    expect(($('[data-dsh-forge-wizard-doc-external]') as HTMLInputElement).checked).toBe(true)
    expect(externalInput().value).toBe(OTHER_PROJECT.docLocationPath)
    expect(authorize().checked).toBe(true) // the 2.4 persisted authorization covers the CURRENT path
    await waitFor(() => { expect(next().disabled).toBe(false) })
  })

  it('repoint external → in_repo walks updateProject with the patch; close result action=update', async () => {
    const { face, onClose } = renderEdit()
    await waitFor(() => { expect(next().disabled).toBe(false) })
    fireEvent.click(next())
    fireEvent.click($('[data-dsh-forge-wizard-doc-in-repo]'))
    fireEvent.click(next())
    fireEvent.click(finish())
    await waitFor(() => { expect(onClose).toHaveBeenCalledTimes(1) })
    expect(face.updateProject).toHaveBeenCalledWith(OTHER_PROJECT.id, {
      displayName: OTHER_PROJECT.displayName,
      docLocationType: 'in_repo',
      docLocationPath: null,
    })
    const result = (onClose.mock.calls[0] as [{ project: Project; action: 'register' | 'update' }])[0]
    expect(result.action).toBe('update')
    expect(result.project.docLocationType).toBe('in_repo')
  })

  it('6.4: repointing to a NEW external path re-authorizes it before updateProject (编辑模式无豁免 — the chain needs the record for the new path)', async () => {
    const { face } = renderEdit()
    await waitFor(() => { expect(next().disabled).toBe(false) })
    fireEvent.click(next())
    // A path edit resets the confirm; the new path needs its own consent.
    fireEvent.change(externalInput(), { target: { value: 'Z:\\docs\\relocated  ' } })
    fireEvent.click(authorize())
    await waitFor(() => { expect(next().disabled).toBe(false) })
    fireEvent.click(next())
    fireEvent.click(finish())
    await waitFor(() => { expect(face.updateProject).toHaveBeenCalledTimes(1) })
    expect(face.authorizeExternalDocPath).toHaveBeenCalledTimes(1)
    expect(face.authorizeExternalDocPath).toHaveBeenCalledWith('Z:\\docs\\relocated')
    expect(face.updateProject.mock.calls[0][1].docLocationPath).toBe('Z:\\docs\\relocated')
    expect(face.authorizeExternalDocPath.mock.invocationCallOrder[0])
      .toBeLessThan(face.updateProject.mock.invocationCallOrder[0])
  })

  it('rename rides the same patch (ProjectPatch displayName)', async () => {
    const { face } = renderEdit()
    await waitFor(() => { expect(next().disabled).toBe(false) })
    fireEvent.click(next())
    fireEvent.click(next())
    fireEvent.change(nameInput(), { target: { value: 'renamed-project' } })
    fireEvent.click(finish())
    await waitFor(() => { expect(face.updateProject).toHaveBeenCalledTimes(1) })
    expect(face.updateProject.mock.calls[0][1].displayName).toBe('renamed-project')
  })

  it('重指向校验同链: repointing to the code root hits the same conflict + disabled', async () => {
    renderEdit()
    await waitFor(() => { expect(next().disabled).toBe(false) })
    fireEvent.click(next())
    fireEvent.change(externalInput(), { target: { value: OTHER_PROJECT.codeRoot } })
    await waitFor(() => { expect($('[data-dsh-forge-wizard-external-error="conflict"]')).not.toBeNull() })
    expect(next().disabled).toBe(true)
  })

  it('untouched edit draft is clean (Esc closes without the discard confirm); a change arms the guard', async () => {
    const onClose = vi.fn()
    renderEdit(OTHER_PROJECT, { onClose })
    await waitFor(() => { expect(next().disabled).toBe(false) })
    fireEvent.keyDown(card(), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-dsh-forge-dialog="register-wizard-discard"]')).toBeNull()

    const again = vi.fn()
    renderEdit(OTHER_PROJECT, { onClose: again })
    await waitFor(() => { expect(next().disabled).toBe(false) })
    fireEvent.click(next())
    fireEvent.change(externalInput(), { target: { value: 'Z:\\docs\\somewhere-else' } })
    fireEvent.keyDown(card(), { key: 'Escape' })
    expect(document.querySelector('[data-dsh-forge-dialog="register-wizard-discard"]')).not.toBeNull()
    expect(again).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Dialog discipline: focus trap, dirty-discard guard, dismissal (AC5)
// ---------------------------------------------------------------------------

describe('RegisterWizard: dialog discipline', () => {
  it('focus lands on the first field; Tab/Shift+Tab wrap inside (focus trap)', async () => {
    renderWizard()
    expect(document.activeElement).toBe(pathInput())
    await fillStep1(MOCK_WIZARD_OK_ROOT) // enable Next so it joins the cycle set
    const closeButton = $('[data-dsh-forge-dialog-close]') as HTMLButtonElement
    // Focusables in DOM order: ✕ (header) → path input → next. Last wraps to first.
    next().focus()
    fireEvent.keyDown(card(), { key: 'Tab' })
    expect(document.activeElement).toBe(closeButton)
    fireEvent.keyDown(card(), { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(next())
  })

  it('Esc closes immediately when clean — no discard dialog', () => {
    const { onClose } = renderWizard()
    fireEvent.keyDown(card(), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-dsh-forge-dialog="register-wizard-discard"]')).toBeNull()
  })

  it('dirty Esc opens the discard confirm; 继续编辑 resumes, 放弃 closes', async () => {
    const { onClose } = renderWizard()
    fireEvent.change(pathInput(), { target: { value: MOCK_WIZARD_OK_ROOT } })
    fireEvent.keyDown(card(), { key: 'Escape' })
    const discard = $('[data-dsh-forge-dialog="register-wizard-discard"]')
    expect(discard.getAttribute('role')).toBe('alertdialog')
    expect(discard.textContent).toContain(en['wizard.discard.title'])
    fireEvent.click($('[data-dsh-forge-wizard-discard-cancel]'))
    expect(document.querySelector('[data-dsh-forge-dialog="register-wizard-discard"]')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    expect(pathInput().value).toBe(MOCK_WIZARD_OK_ROOT) // state intact
    fireEvent.keyDown(card(), { key: 'Escape' })
    fireEvent.click($('[data-dsh-forge-wizard-discard-confirm]'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('mask pointer-down and ✕ ride the same dirty guard', async () => {
    const { onClose } = renderWizard()
    fireEvent.change(pathInput(), { target: { value: MOCK_WIZARD_OK_ROOT } })
    const mask = document.querySelectorAll('[data-dsh-forge-dialog-mask]')[0] as HTMLElement
    fireEvent.pointerDown(mask)
    expect(document.querySelector('[data-dsh-forge-dialog="register-wizard-discard"]')).not.toBeNull()
    fireEvent.click($('[data-dsh-forge-wizard-discard-cancel]'))
    fireEvent.click($('[data-dsh-forge-dialog-close]'))
    expect(document.querySelector('[data-dsh-forge-dialog="register-wizard-discard"]')).not.toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Shell integration: the addProject / repoint seams own the wizard
// ---------------------------------------------------------------------------

describe('WorkbenchShell: the register seams open the wizard (5.1/5.3 → 5.4)', () => {
  /** A controllable view face (the overview.spec pattern). */
  function makeViewFace(initial: Partial<ViewKeySnapshot> = {}) {
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
      } satisfies Pick<WorkbenchShellProps, 'useViewKey' | 'selectWorkbenchTab' | 'openFeatureDetail'>,
    }
  }

  it('chrome 「添加项目」 opens the wizard; a clean Esc closes it and focus returns to the trigger', async () => {
    const face = makeViewFace()
    render(<WorkbenchShell t={t.en as WorkbenchShellProps['t']} {...face.props} />)
    await waitFor(() => { expect($('[data-dsh-forge-add-project]')).not.toBeNull() })
    const trigger = $('[data-dsh-forge-add-project]') as HTMLButtonElement
    // Browsers focus a button before its click lands; jsdom does not — prime it
    // so the opener's focus snapshot has something to restore.
    trigger.focus()
    fireEvent.click(trigger)
    expect(card()).not.toBeNull()
    fireEvent.keyDown(card(), { key: 'Escape' })
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-dialog="register-wizard"]')).toBeNull() })
    expect(document.activeElement).toBe(trigger)
  })

  it('the overview lost-card 重新指向 opens the EDIT mode prefilled with the active row', async () => {
    const face = makeViewFace()
    render(
      <WorkbenchShell
        t={t.en as WorkbenchShellProps['t']} {...face.props}
        overview={{ lostProjectIds: [ACTIVE_PROJECT.id] }}
      />,
    )
    await waitFor(() => { expect($('[data-dsh-forge-overview-repoint]')).not.toBeNull() })
    fireEvent.click($('[data-dsh-forge-overview-repoint]'))
    expect(document.querySelector('[data-dsh-forge-dialog="register-wizard"] h2')?.textContent).toBe(en['wizard.editTitle'])
    expect(pathInput().value).toBe(ACTIVE_PROJECT.codeRoot)
    expect(pathInput().readOnly).toBe(true)
  })

  it('the wizard seat injects the 5.14 face members over the mock twin', async () => {
    const registerProject = vi.fn(async () => ({
      id: 'assembled-1', displayName: 'demo', codeRoot: MOCK_WIZARD_OK_ROOT,
      docLocationType: 'in_repo' as const, docLocationPath: null,
      createdAt: MOCK_NOW, lastActivatedAt: null,
    }))
    const face = makeViewFace()
    render(
      <WorkbenchShell
        t={t.en as WorkbenchShellProps['t']} {...face.props}
        wizard={{ face: { registerProject } }}
      />,
    )
    await waitFor(() => { expect($('[data-dsh-forge-add-project]')).not.toBeNull() })
    fireEvent.click($('[data-dsh-forge-add-project]'))
    fireEvent.change(pathInput(), { target: { value: MOCK_WIZARD_OK_ROOT } })
    await waitFor(() => { expect(next().disabled).toBe(false) })
    fireEvent.click(next())
    fireEvent.click(next())
    fireEvent.click(finish())
    await waitFor(() => { expect(registerProject).toHaveBeenCalledTimes(1) })
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-dialog="register-wizard"]')).toBeNull() })
  })
})

// ---------------------------------------------------------------------------
// The mock twin's verb semantics (registry-side mirrors of the IPC chain)
// ---------------------------------------------------------------------------

describe('createMockRegisterWizardFace: the verb twin', () => {
  it('registerProject: UNIQUE guard, dirname default, frozen stamps, deterministic ids', async () => {
    const face = createMockRegisterWizardFace()
    const created = await face.registerProject({
      codeRoot: `${MOCK_WIZARD_OK_ROOT}\\`,
      docLocationType: 'in_repo',
    })
    expect(created.displayName).toBe('demo')
    expect(created.codeRoot).toBe(MOCK_WIZARD_OK_ROOT)
    expect(created.createdAt).toBe(MOCK_NOW)
    const second = await face.registerProject({ codeRoot: 'Z:\\other', docLocationType: 'in_repo', displayName: 'Other' })
    expect(second.id).not.toBe(created.id)

    await expect(face.registerProject({ codeRoot: MOCK_WIZARD_OK_ROOT, docLocationType: 'in_repo' }))
      .rejects.toMatchObject({ code: 'ERR_PROJECT_EXISTS' })
  })

  it('registerProject / updateProject: doc-path conflict mirrors the verb chain', async () => {
    const face = createMockRegisterWizardFace()
    await expect(face.registerProject({
      codeRoot: MOCK_WIZARD_OK_ROOT, docLocationType: 'external', docLocationPath: MOCK_WIZARD_OK_ROOT,
    })).rejects.toMatchObject({ code: 'ERR_DOC_PATH_CONFLICT' })

    await expect(face.updateProject(ACTIVE_PROJECT.id, {
      docLocationType: 'external', docLocationPath: ACTIVE_PROJECT.codeRoot,
    })).rejects.toMatchObject({ code: 'ERR_DOC_PATH_CONFLICT' })

    await expect(face.updateProject('nope', { displayName: 'x' }))
      .rejects.toMatchObject({ code: 'ERR_PROJECT_NOT_FOUND' })
  })

  it('updateProject: an undefined patch member never nulls a stored field', async () => {
    const face = createMockRegisterWizardFace()
    const updated = await face.updateProject(ACTIVE_PROJECT.id, { docLocationType: 'external', docLocationPath: 'Z:\\docs\\moved' })
    expect(updated.displayName).toBe(ACTIVE_PROJECT.displayName)
    expect(updated.docLocationPath).toBe('Z:\\docs\\moved')
    const renamedOnly = await face.updateProject(ACTIVE_PROJECT.id, { displayName: 'renamed' })
    expect(renamedOnly.docLocationType).toBe('external')
    expect(renamedOnly.docLocationPath).toBe('Z:\\docs\\moved')
  })

  it('probe fixtures: the three code-root answers + the external pair', async () => {
    const face = createMockRegisterWizardFace()
    await expect(face.probeCodeRoot({ codeRoot: MOCK_WIZARD_UNREADABLE_ROOT }))
      .resolves.toMatchObject({ available: false, reasonCode: 'ERR_CODE_ROOT_UNREADABLE' })
    await expect(face.probeCodeRoot({ codeRoot: MOCK_WIZARD_NO_FORGE_ROOT }))
      .resolves.toMatchObject({ available: false, reasonCode: 'ERR_FORGE_NOT_DETECTED' })
    await expect(face.probeCodeRoot({ codeRoot: MOCK_WIZARD_OK_ROOT }))
      .resolves.toMatchObject({ available: true, taskTotal: MOCK_WIZARD_TASK_TOTAL, featureTotal: MOCK_WIZARD_FEATURE_TOTAL })
    await expect(face.probeExternalPath({ codeRoot: MOCK_WIZARD_OK_ROOT, docLocationPath: MOCK_WIZARD_OK_ROOT }))
      .resolves.toMatchObject({ ok: false, reasonCode: 'ERR_DOC_PATH_CONFLICT' })
    await expect(face.probeExternalPath({ codeRoot: MOCK_WIZARD_OK_ROOT, docLocationPath: MOCK_WIZARD_EXTERNAL_UNREADABLE }))
      .resolves.toMatchObject({ ok: false, reasonCode: 'ERR_EXTERNAL_PATH_UNREADABLE' })
    await expect(face.probeExternalPath({ codeRoot: MOCK_WIZARD_OK_ROOT, docLocationPath: MOCK_WIZARD_EXTERNAL_OK }))
      .resolves.toMatchObject({ ok: true })
  })
})
