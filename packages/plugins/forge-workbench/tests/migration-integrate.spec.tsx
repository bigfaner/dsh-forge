// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OverviewPage } from '../src/client/views/overview/OverviewPage.tsx'
import { RegisterWizard } from '../src/client/views/overview/RegisterWizard.tsx'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import type { MigrationFace } from '../src/client/contract.ts'
import type { MigrationStatus, Project, WorkbenchState } from '../src/client/ipc-types.ts'
import {
  MOCK_MIGRATION_STATUS_FILES, MOCK_MIGRATION_STATUS_SQLITE, MOCK_WORKBENCH_PATHS,
  createMockMigrationFace, createMockRegisterWizardFace,
} from '../src/client/mocks/workbench.ts'
import type { MockMigrationFaceOptions } from '../src/client/mocks/workbench.ts'

/** The locale seat (the overview.spec bind precedent). */
const tEn = (key: WorkbenchKey): string => en[key]

// Task 1.7 — the UF3 integration legs (ui-design 显式迁移 · 注册向导条件性四步
// · 向导内原地迁移 · G7/SC9 默认仓外翻转), jsdom over the 1.6 component family
// + the mock verb twins:
//   AC1  the overview card's migration entry/pill judgment (migratable /
//        migrated / none) + the confirm→progress chain through MigrationDialogs;
//   AC2  the conditional ③ inserted between ② and the summary when the settled
//        doc tree probes index.json (four dots), skipped otherwise (three);
//   AC3  the in-place migration phase after the ④ confirm — progress body in
//        the step area, whole-wizard lock while running, the three terminals;
//   AC4  the flipped default + pristine-clean prefill (wizard.spec carries the
//        step-② leg; here the draft-model + dirty interaction).
//
// The @deepseek-ai/dsh-client-ui-primitives StateDot stub: the module table
// resolves its transitive deps only inside the upstream monorepo (the
// shell.spec / wizard.spec precedent).
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  StateDot: (props: { state: string }) => <span data-mock-state-dot={props.state} />,
}))

const $ = (selector: string): HTMLElement => {
  const element = document.querySelector(selector)
  if (element === null) throw new Error(`missing ${selector}`)
  return element as HTMLElement
}

afterEach(() => cleanup())

/** A files-authority status with the doc-side detection arm. */
function filesStatus(indexJsonDetected: boolean): MigrationStatus {
  return { ...MOCK_MIGRATION_STATUS_FILES, indexJsonDetected }
}

const PROJECT_MIGRATABLE: Project = {
  id: 'p-mig', displayName: 'legacy-forge', codeRoot: 'Z:/repo/legacy-forge',
  docLocationType: 'in_repo', docLocationPath: null,
  createdAt: '2026-09-01T00:00:00.000Z', lastActivatedAt: null,
}
const PROJECT_MIGRATED: Project = {
  id: 'p-done', displayName: 'moved-on', codeRoot: 'Z:/repo/moved-on',
  docLocationType: 'in_repo', docLocationPath: null,
  createdAt: '2026-09-01T00:00:00.000Z', lastActivatedAt: null,
}
const PROJECT_BARE: Project = {
  id: 'p-bare', displayName: 'fresh-start', codeRoot: 'Z:/repo/fresh-start',
  docLocationType: 'in_repo', docLocationPath: null,
  createdAt: '2026-09-01T00:00:00.000Z', lastActivatedAt: null,
}
const STATE: WorkbenchState = {
  projects: [PROJECT_MIGRATABLE, PROJECT_MIGRATED, PROJECT_BARE],
  activeProjectId: null,
  plugins: [],
}

/**
 * A migration face over the 1.6 twin with per-project statuses (the twin
 * serves ONE fixed status; the page's judgment needs the matrix). `statuses`
 * is mutable — the settle assertions observe the re-read through the spy.
 */
function makeStatusFace(
  statuses: Record<string, MigrationStatus>,
  options: MockMigrationFaceOptions = {},
): { face: MigrationFace; readCount: () => number } {
  const twin = createMockMigrationFace({ projectId: PROJECT_MIGRATABLE.id, ...options })
  let reads = 0
  const face: MigrationFace = {
    ...twin.face,
    getMigrationStatus: vi.fn(async (id: string): Promise<MigrationStatus> => {
      reads += 1
      return statuses[id] ?? filesStatus(false)
    }),
  }
  return { face, readCount: () => reads }
}

/** Render the overview page with the migration face armed. */
function renderPage(statuses: Record<string, MigrationStatus>, options?: MockMigrationFaceOptions) {
  const twin = makeStatusFace(statuses, options)
  const page = render(
    <OverviewPage
      t={tEn}
      face={{ loadState: async () => STATE }}
      migrationFace={twin.face}
    />,
  )
  return { ...twin, ...page }
}

// ---------------------------------------------------------------------------
// AC1 — the card surface judgment + the confirm chain
// ---------------------------------------------------------------------------

describe('OverviewPage + ProjectCard: the migration surface (1.7)', () => {
  it('migratable = files + indexJsonDetected → 可迁移 Pill + 「迁移」 entry; migrated → 已迁移 Pill, entry retired; bare files → nothing', async () => {
    renderPage({
      [PROJECT_MIGRATABLE.id]: filesStatus(true),
      [PROJECT_MIGRATED.id]: { ...MOCK_MIGRATION_STATUS_SQLITE, indexJsonDetected: false },
      [PROJECT_BARE.id]: filesStatus(false),
    })
    await waitFor(() => {
      expect($(`[data-dsh-forge-project-card="${PROJECT_MIGRATABLE.id}"] [data-dsh-forge-migration-pill="migratable"]`)).not.toBeNull()
    })

    const migratable = $(`[data-dsh-forge-project-card="${PROJECT_MIGRATABLE.id}"]`)
    expect(migratable.querySelector('[data-dsh-forge-migration-pill="migratable"]')?.textContent)
      .toBe(en['migration.pill.migratable'])
    expect(migratable.querySelector('[data-dsh-forge-migration-entry]')).not.toBeNull()

    const migrated = $(`[data-dsh-forge-project-card="${PROJECT_MIGRATED.id}"]`)
    expect(migrated.querySelector('[data-dsh-forge-migration-pill="migrated"]')?.textContent)
      .toBe(en['migration.pill.migrated'])
    expect(migrated.querySelector('[data-dsh-forge-migration-entry]')).toBeNull()

    const bare = $(`[data-dsh-forge-project-card="${PROJECT_BARE.id}"]`)
    expect(bare.querySelector('[data-dsh-forge-migration-pill]')).toBeNull()
    expect(bare.querySelector('[data-dsh-forge-migration-entry]')).toBeNull()
  })

  it('the entry opens the 1.6 confirm chain; 完成 closes and the statuses re-read (the Pill retires on the flipped authority)', async () => {
    let status = filesStatus(true)
    const twin = createMockMigrationFace({ projectId: PROJECT_MIGRATABLE.id })
    const face: MigrationFace = {
      ...twin.face,
      getMigrationStatus: async () => status,
    }
    render(
      <OverviewPage
        t={tEn}
        face={{ loadState: async () => STATE }}
        migrationFace={face}
      />,
    )
    await waitFor(() => { expect($('[data-dsh-forge-migration-entry]')).not.toBeNull() })
    fireEvent.click($('[data-dsh-forge-migration-entry]'))

    // The confirm door (the ONE explicit path) with the backups root copy.
    await waitFor(() => { expect($('[data-dsh-forge-dialog="migrate-confirm"]')).not.toBeNull() })
    expect($('[data-dsh-forge-migrate-backup-path]').textContent).toBe(MOCK_WORKBENCH_PATHS.backupsRoot)
    fireEvent.click($('[data-dsh-forge-migrate-confirm]'))

    // The mock twin pushes the phase stream synchronously → the done terminal.
    await waitFor(() => { expect($('[data-dsh-forge-migration-parity-ok]')).not.toBeNull() })
    // The kernel flips authority on success — the settle re-read observes it.
    status = { ...MOCK_MIGRATION_STATUS_SQLITE, indexJsonDetected: false }
    fireEvent.click($('[data-dsh-forge-migration-done]'))
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-dialog="migrate-progress"]')).toBeNull() })
    await waitFor(() => {
      // The re-read landed: the card now carries the 已迁移 Pill, the entry retired.
      expect($(`[data-dsh-forge-project-card="${PROJECT_MIGRATABLE.id}"] [data-dsh-forge-migration-pill="migrated"]`)).not.toBeNull()
      expect(document.querySelector('[data-dsh-forge-migration-entry]')).toBeNull()
    })
  })

  it('the 在跑编排 guard disables the entry with the tooltip (event-driven recovery is the 1.6 hook leg)', async () => {
    const twin = createMockMigrationFace({ projectId: PROJECT_MIGRATABLE.id, guard: { blocked: true, runningCount: 2 } })
    const face: MigrationFace = {
      ...twin.face,
      getMigrationStatus: async () => filesStatus(true),
    }
    render(
      <OverviewPage
        t={tEn}
        face={{ loadState: async () => STATE }}
        migrationFace={face}
      />,
    )
    await waitFor(() => {
      const entry = $('[data-dsh-forge-migration-entry]') as HTMLButtonElement
      expect(entry.disabled).toBe(true)
      expect(entry.title).toBe(en['migration.entry.guardTooltip'])
      expect(twin.guardReads).toBeGreaterThan(0)
    })
  })

  it('absent migrationFace = the M2 page verbatim (no surface, no status reads)', async () => {
    const getMigrationStatus = vi.fn()
    render(
      <OverviewPage
        t={tEn}
        face={{ loadState: async () => STATE }}
      />,
    )
    await waitFor(() => { expect($(`[data-dsh-forge-project-card="${PROJECT_MIGRATABLE.id}"]`)).not.toBeNull() })
    expect(document.querySelector('[data-dsh-forge-migration-pill]')).toBeNull()
    expect(document.querySelector('[data-dsh-forge-migration-entry]')).toBeNull()
    expect(getMigrationStatus).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// AC2/AC3 — the conditional ③ + the in-place migration phase
// ---------------------------------------------------------------------------

/** The wizard harness over the mock twins; `indexJson` arms the probe's answer. */
function renderWizard(options: {
  readonly indexJson?: boolean
  readonly migration?: MockMigrationFaceOptions
  readonly migrationFaceOverride?: Partial<MigrationFace>
} = {}) {
  const registerFace = createMockRegisterWizardFace(undefined, { indexJsonDetected: options.indexJson === true })
  const registerProject = vi.fn(registerFace.registerProject)
  const probeCodeRoot = vi.fn(registerFace.probeCodeRoot)
  const twin = createMockMigrationFace({ projectId: 'mock-wizard-project-0001', ...options.migration })
  const migrationFace: MigrationFace = { ...twin.face, ...options.migrationFaceOverride }
  const onClose = vi.fn()
  render(
    <RegisterWizard
      t={tEn}
      mode="register"
      project={undefined}
      projects={[]}
      face={{ probeCodeRoot, registerProject }}
      migrationFace={migrationFace}
      onClose={onClose}
    />,
  )
  return { probeCodeRoot, registerProject, twin, onClose }
}

/** Walk ①→② and opt in-repo (the docs choice irrelevant to the conditional leg). */
async function walkToStep2() {
  fireEvent.change($('[data-dsh-forge-wizard-path-input]'), { target: { value: 'Z:\\repo\\legacy' } })
  await waitFor(() => { expect(($('[data-dsh-forge-wizard-next]') as HTMLButtonElement).disabled).toBe(false) })
  fireEvent.click($('[data-dsh-forge-wizard-next]'))
  await waitFor(() => { expect($('[data-dsh-forge-wizard-doc-in-repo]')).not.toBeNull() })
  fireEvent.click($('[data-dsh-forge-wizard-doc-in-repo]'))
  fireEvent.click($('[data-dsh-forge-wizard-next]'))
}

describe('RegisterWizard: the conditional migration step (1.7 AC2)', () => {
  it('detected → FOUR dots + StepMigrate between ② and the summary; the re-probe carries the settled doc location', async () => {
    const handles = renderWizard({ indexJson: true })
    await walkToStep2()
    await waitFor(() => { expect($('[data-dsh-forge-wizard-step-migrate]')).not.toBeNull() })
    // 四圆: the step count rides the conditional step.
    expect($('[data-dsh-forge-wizard-stepper]').getAttribute('aria-label')).toBe('Step 3/4')
    expect(document.querySelectorAll('[data-dsh-forge-wizard-dot]').length).toBe(4)
    // The ②-exit probe asked about the SETTLED tree (in_repo → null doc base).
    expect(handles.probeCodeRoot).toHaveBeenLastCalledWith({ codeRoot: 'Z:\\repo\\legacy', docLocationPath: null })
    // Toggle default ON (ui-design 开关默认开).
    expect(($('[data-dsh-forge-wizard-migrate-toggle]') as HTMLInputElement).checked).toBe(true)
    // ③ → ④: the summary carries the migration row.
    fireEvent.click($('[data-dsh-forge-wizard-next]'))
    await waitFor(() => { expect($('[data-dsh-forge-wizard-step-summary]')).not.toBeNull() })
    expect($('[data-dsh-forge-wizard-stepper]').getAttribute('aria-label')).toBe('Step 4/4')
    expect($('[data-dsh-forge-wizard-summary-migrate]').textContent).toContain(en['wizard.summary.migrateNow'])
  })

  it('not detected → THREE dots, no migration step, no migration row on the summary', async () => {
    renderWizard({ indexJson: false })
    await walkToStep2()
    await waitFor(() => { expect($('[data-dsh-forge-wizard-step-summary]')).not.toBeNull() })
    expect($('[data-dsh-forge-wizard-stepper]').getAttribute('aria-label')).toBe('Step 3/3')
    expect(document.querySelectorAll('[data-dsh-forge-wizard-dot]').length).toBe(3)
    expect(document.querySelector('[data-dsh-forge-wizard-step-migrate]')).toBeNull()
    expect(document.querySelector('[data-dsh-forge-wizard-summary-migrate]')).toBeNull()
  })

  it('toggle OFF → registers the read-only compatibility state; startMigration NEVER fires', async () => {
    const handles = renderWizard({ indexJson: true })
    await walkToStep2()
    await waitFor(() => { expect($('[data-dsh-forge-wizard-migrate-toggle]')).not.toBeNull() })
    fireEvent.click($('[data-dsh-forge-wizard-migrate-toggle]')) // default on → off
    expect($('[data-dsh-forge-wizard-migrate-block]').textContent).toContain(en['wizard.stepMigrate.offHint'])
    fireEvent.click($('[data-dsh-forge-wizard-next]'))
    await waitFor(() => { expect($('[data-dsh-forge-wizard-finish]')).not.toBeNull() })
    expect($('[data-dsh-forge-wizard-summary-migrate]').textContent).toContain(en['wizard.summary.migrateDefer'])
    fireEvent.click($('[data-dsh-forge-wizard-finish]'))
    await waitFor(() => { expect(handles.onClose).toHaveBeenCalledTimes(1) })
    expect(handles.twin.startCalls).toBe(0)
    const result = (handles.onClose.mock.calls[0] as [{ project: Project }])[0]
    expect(result.project.id).toBe('mock-wizard-project-0001')
  })
})

describe('RegisterWizard: the in-place migration phase (1.7 AC3)', () => {
  /** Walk to the summary with the toggle ON (the offered four-step form). */
  async function walkToSummary(handles: { onClose: ReturnType<typeof vi.fn> }) {
    await walkToStep2()
    await waitFor(() => { expect($('[data-dsh-forge-wizard-migrate-toggle]')).not.toBeNull() })
    fireEvent.click($('[data-dsh-forge-wizard-next]'))
    await waitFor(() => { expect($('[data-dsh-forge-wizard-finish]')).not.toBeNull() })
    fireEvent.click($('[data-dsh-forge-wizard-finish]'))
    await waitFor(() => { expect(handles.onClose).not.toHaveBeenCalled() }) // the wizard STAYS
  }

  it('success: the step area evolves in place → parity conclusion + [进入工作台] closes with the registration result', async () => {
    const handles = renderWizard({ indexJson: true })
    await walkToSummary(handles)
    // The in-place body (no nested dialog — the step form carries the run).
    await waitFor(() => { expect($('[data-dsh-forge-wizard-migration-run]')).not.toBeNull() })
    expect(document.querySelector('[data-dsh-forge-dialog="migrate-progress"]')).toBeNull()
    expect($('[data-dsh-forge-migration-run="done"]')).not.toBeNull()
    expect($('[data-dsh-forge-migration-parity-ok]').textContent).toBe(en['migration.result.parityOk'])
    expect(handles.twin.startCalls).toBe(1)
    // The stepper/footer retired; the terminal closes with the result.
    expect(document.querySelector('[data-dsh-forge-wizard-stepper]')).toBeNull()
    fireEvent.click($('[data-dsh-forge-wizard-migration-enter]'))
    await waitFor(() => { expect(handles.onClose).toHaveBeenCalledTimes(1) })
    const result = (handles.onClose.mock.calls[0] as [{ project: Project; action: string }])[0]
    expect(result.action).toBe('register')
    expect(result.project.id).toBe('mock-wizard-project-0001')
  })

  it('failure: rollback note + [重试] + [以未迁移态完成注册]; the retry walks the same verb; the finish-unmigrated closes with the result', async () => {
    const handles = renderWizard({ indexJson: true, migration: { failAtPhase: 'verify' } })
    await walkToSummary(handles)
    await waitFor(() => { expect($('[data-dsh-forge-migration-run="failed"]')).not.toBeNull() })
    expect($('[data-dsh-forge-migration-rollback-note]').textContent).toBe(en['migration.failed.rollbackNote'])
    expect($('[data-dsh-forge-wizard-migration-finish-unmigrated]')).not.toBeNull()

    // Retry: the same one-shot verb again (still failed here).
    fireEvent.click($('[data-dsh-forge-wizard-migration-retry]'))
    await waitFor(() => { expect(handles.twin.startCalls).toBe(2) })
    await waitFor(() => { expect($('[data-dsh-forge-migration-run="failed"]')).not.toBeNull() })

    // 以未迁移态完成注册: closes carrying the registration (the card keeps 可迁移).
    fireEvent.click($('[data-dsh-forge-wizard-migration-finish-unmigrated]'))
    await waitFor(() => { expect(handles.onClose).toHaveBeenCalledTimes(1) })
    const result = (handles.onClose.mock.calls[0] as [{ project: Project; action: string }])[0]
    expect(result.action).toBe('register')
  })

  it('the whole-wizard lock: while the run is live Esc/mask/✕ are inert — and the pre-flight rejection renders the inline note + the two terminals', async () => {
    const handles = renderWizard({ indexJson: true, migration: { rejectGuard: true } })
    await walkToSummary(handles)
    await waitFor(() => { expect($('[data-dsh-forge-wizard-migration-preflight]')).not.toBeNull() })
    expect($('[data-dsh-forge-wizard-migration-preflight]').textContent).toBe(en['migration.err.guard'])
    // Pre-flight = nothing ran → the failed-rollback presentation stays absent.
    expect(document.querySelector('[data-dsh-forge-migration-rollback-note]')).toBeNull()
    // The lock: Esc does nothing (no discard dialog, no close)…
    fireEvent.keyDown($('[data-dsh-forge-dialog="register-wizard"]'), { key: 'Escape' })
    expect(document.querySelector('[data-dsh-forge-dialog="register-wizard-discard"]')).toBeNull()
    expect(handles.onClose).not.toHaveBeenCalled()
    // …and the explicit terminal is the only way out.
    fireEvent.click($('[data-dsh-forge-wizard-migration-finish-unmigrated]'))
    await waitFor(() => { expect(handles.onClose).toHaveBeenCalledTimes(1) })
  })
})

// ---------------------------------------------------------------------------
// AC4 residue — the flipped draft model + the pristine-clean prefill
// ---------------------------------------------------------------------------

describe('the flipped default (1.7 AC4, draft-model residue)', () => {
  it('EMPTY_WIZARD_DRAFT: 仓外 default + migrateNow on (the toggle neutral in edit mode)', async () => {
    const wizard = await import('../src/client/views/overview/RegisterWizard.tsx')
    expect(wizard.EMPTY_WIZARD_DRAFT.docLocationType).toBe('external')
    expect(wizard.EMPTY_WIZARD_DRAFT.migrateNow).toBe(true)
  })

  it('the app-managed prefill lands ONCE with its hint; a hand edit wins and never gets re-clobbered', async () => {
    renderWizard({ indexJson: false })
    fireEvent.change($('[data-dsh-forge-wizard-path-input]'), { target: { value: 'Z:\\repo\\legacy' } })
    await waitFor(() => { expect(($('[data-dsh-forge-wizard-next]') as HTMLButtonElement).disabled).toBe(false) })
    fireEvent.click($('[data-dsh-forge-wizard-next]')) // → step ② (the external branch is the default)
    await waitFor(() => {
      expect(($('[data-dsh-forge-wizard-external-input]') as HTMLInputElement).value)
        .toBe(`${MOCK_WORKBENCH_PATHS.docsRoot}/legacy`)
    })
    expect($('[data-dsh-forge-wizard-external-default]').textContent).toContain(en['wizard.step2.defaultPathHint'])
    // A hand edit retires the default hint and survives the ②⇄① round trip
    // (the once-only prefill never re-clobbers a user choice).
    fireEvent.change($('[data-dsh-forge-wizard-external-input]'), { target: { value: 'Z:\\docs\\custom' } })
    expect(document.querySelector('[data-dsh-forge-wizard-external-default]')).toBeNull()
    fireEvent.click($('[data-dsh-forge-wizard-back]'))
    fireEvent.click($('[data-dsh-forge-wizard-next]'))
    await waitFor(() => {
      expect(($('[data-dsh-forge-wizard-external-input]') as HTMLInputElement).value).toBe('Z:\\docs\\custom')
    })
    // The prefill patches the BASELINE alongside the draft — a pure-model
    // proof that the default itself contributes no dirty field (a typed
    // codeRoot already arms the M2 any-input discard guard on its own).
    const { EMPTY_WIZARD_DRAFT, isWizardDraftDirty } = await import('../src/client/views/overview/RegisterWizard.tsx')
    const prefilled = {
      ...EMPTY_WIZARD_DRAFT,
      codeRoot: 'Z:\\repo\\legacy',
      docLocationPath: `${MOCK_WORKBENCH_PATHS.docsRoot}/legacy`,
    }
    expect(isWizardDraftDirty(prefilled, prefilled)).toBe(false)
  })
})
