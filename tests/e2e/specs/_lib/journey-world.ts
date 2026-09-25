// tests/e2e/specs/_lib/journey-world — the gen-test-scripts (T-test-gen-scripts)
// shared world library for the 8 contract-derived journeys.
//
// One home for the techniques the 6.3-6.8 SC legs proved in place:
//   · kernel corpus worlds — the REAL kernel chain (write tree → register →
//     scan → migrate → stage-asset index) on a journey-private temp root, so
//     the app boots on `data_authority='sqlite'` with hand-built rows;
//   · the app world — the REAL shell over the REAL forge-workbench plugin
//     (`launchWorkbenchShell`: isolated userData + clean PATH + stub env pair)
//     with the three 6.2 Hard Rules baked in (instance lock BEFORE launch,
//     isolated userData, per-journey temp dirs removed post-run);
//   · the renderer verb face (`bridgeInvoke` — the tool-bridge pump's same
//     verb face), the stub-journal readers, the injection oracle inputs, the
//     doc-tree/git snapshot oracles and the zero-spawn process/log faces.
//
// Isolation model (gen-test-scripts): every spec file owns its worlds; worlds
// are created per file (memoized per tag), strictly one live app instance at a
// time (the single-instance lock discipline — workers:1 lane plus this guard),
// and torn down in afterAll regardless of outcome. No cross-file state.

import { execSync, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { expect, type Page } from '@playwright/test'
import { assertNoActiveDshForgeInstances } from '../../helpers/instance-lock.ts'
import { createDispatchStub, type DispatchStub } from '../../stubs/dispatch.ts'
import { launchWorkbenchShell } from '../../helpers/app.ts'
import type { PluginShell } from '../../../../apps/desktop/e2e/helpers/plugins.ts'
import type { GeneratedFeature, GeneratedTask, GeneratedTaskSet } from '../../../../apps/desktop/e2e/fixtures/task-generator.ts'
import { writeForgeProject } from '../../../../apps/desktop/e2e/fixtures/forge-project.ts'
import { openDatabase } from '../../../../apps/desktop/src/main/workbench/store/db.ts'
import { registerProject } from '../../../../apps/desktop/src/main/workbench/repos/projects.ts'
import { scanForgeFiles } from '../../../../apps/desktop/src/main/workbench/indexer/scan.ts'
import { createMigrationService } from '../../../../apps/desktop/src/main/workbench/migration/pipeline.ts'
import { rebuildStageAssetIndex } from '../../../../apps/desktop/src/main/workbench/stages/stage-asset-index.ts'
import { getTask } from '../../../../apps/desktop/src/main/workbench/tasks/task-repo.ts'
import { createPresynthEngine } from '../../../../apps/desktop/src/main/workbench/dispatch/presynth/assemble.ts'
import type { RepoDb } from '../../../../apps/desktop/src/main/workbench/repos/types.ts'
import { zh } from '../../../../packages/plugins/forge-workbench/src/client/locale/zh.ts'
import { en } from '../../../../packages/plugins/forge-workbench/src/client/locale/en.ts'

// ---------------------------------------------------------------------------
// Budgets and shared constants (SC 口径;阈值恒定,永不放宽)
// ---------------------------------------------------------------------------

/** The ≤5s perception/reflow budget (BIZ-workbench-005; SC1/SC3/SC6 口径). */
export const REFLOW_BUDGET_MS = 5_000
/** The outer wall for reflow waits (the budget assertion itself stays 5s). */
export const REFLOW_WAIT_TIMEOUT_MS = 20_000
/** The dispatch → subagent interactive budget (ui-design 性能预算). */
export const DISPATCH_INTERACTIVE_BUDGET_MS = 3_000

/** The 15 mandatory migrated skills (PRD 技能迁移划分表 D5). */
export const MANDATORY_SKILLS = [
  'submit-task', 'git-commit', 'git-checkout', 'run-tests', 'fix-bug', 'test-guide',
  'brainstorm', 'write-prd', 'tech-design', 'ui-design', 'breakdown-tasks', 'quick-tasks',
  'gen-contracts', 'gen-journeys', 'gen-test-scripts',
] as const

// ---------------------------------------------------------------------------
// Task-set fixture builders (the hand-built GeneratedTaskSet discipline)
// ---------------------------------------------------------------------------

/** One hand-built task row (the exact shape the writer serializes). */
export interface TaskSpec {
  readonly stem: string
  readonly localId: string
  readonly title: string
  readonly status: string
  readonly type: string
  readonly dependencies: readonly string[]
}

/** Build a deterministic GeneratedTaskSet for one feature (SC3/SC5 形). */
export function handBuiltTaskSet(feature: {
  readonly slug: string
  readonly status: string
  readonly docKinds: readonly string[]
  readonly seed: string
}, tasks: readonly TaskSpec[]): GeneratedTaskSet {
  const rows: GeneratedTask[] = tasks.map(spec => ({
    stem: spec.stem,
    localId: spec.localId,
    title: spec.title,
    status: spec.status as GeneratedTask['status'],
    type: spec.type as GeneratedTask['type'],
    dependencies: [...spec.dependencies],
    record: null,
  }))
  const statusCounts: Record<string, number> = { pending: 0, in_progress: 0, completed: 0, blocked: 0, suspended: 0, skipped: 0, rejected: 0 }
  for (const task of rows) statusCounts[task.status] = (statusCounts[task.status] ?? 0) + 1
  const built: GeneratedFeature = { slug: feature.slug, status: feature.status as GeneratedFeature['status'], docKinds: [...feature.docKinds] as GeneratedFeature['docKinds'], tasks: rows }
  return {
    options: {
      seed: feature.seed,
      taskCount: rows.length,
      featureCount: 1,
      danglingRate: 0,
      recordRate: 0,
      tasksPerPhase: 6,
      gates: false,
      statusWeights: {},
    },
    features: [built],
    facts: {
      taskCount: rows.length,
      featureCount: 1,
      statusCounts,
      edgeCount: 0,
      dangling: [],
      tasksWithRecord: 0,
      recordsWithSessionActor: 0,
      recordsWithTerminalActor: 0,
    },
  }
}

// ---------------------------------------------------------------------------
// Doc-tree dialect renderers (the fixtures' canonical file bodies)
// ---------------------------------------------------------------------------

/** One stage-asset file body (frontmatter { stage, generated, goal } + summary). */
export function stageAssetMarkdown(stage: string, goal: string, summaryMark: string): string {
  return [
    '---',
    `stage: ${stage}`,
    'generated: "2026-09-25T10:00:00.000Z"',
    `goal: "${goal}"`,
    '---',
    '',
    `# ${stage} 阶段总结(旅程语料)`,
    '',
    `目标:${goal}`,
    '',
    summaryMark,
    '',
  ].join('\n')
}

/** The recorded-task md body (frontmatter + ## Summary; forge 记录方言). */
export function recordMarkdown(input: { actor: string; summary: string }): string {
  return [
    '---',
    'status: "completed"',
    'started: "2026-09-25T10:00:00.000Z"',
    'completed: "2026-09-25T10:05:00.000Z"',
    'time_spent: "~1m"',
    `actor: "${input.actor}"`,
    '---',
    '',
    '## Summary',
    input.summary,
    '',
  ].join('\n')
}

/** One proposal.md body (status/author/created frontmatter + markdown). */
export function proposalMarkdown(input: { status: string; author: string; created: string; title: string; mark: string }): string {
  return [
    '---',
    `status: ${input.status}`,
    `author: ${input.author}`,
    `created: "${input.created}"`,
    'intent: new-feature',
    '---',
    '',
    `# ${input.title}`,
    '',
    `${input.mark}`,
    '',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Snapshot oracles (doc tree / git — the harness-level file faces)
// ---------------------------------------------------------------------------

/** The recursive file snapshot (relative path → bytes) of one tree. */
export function snapshotTree(root: string): Map<string, string> {
  const files = new Map<string, string>()
  const walk = (dir: string, rel: string): void => {
    if (!existsSync(dir)) return
    for (const dirent of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const childRel = rel === '' ? dirent.name : `${rel}/${dirent.name}`
      if (dirent.isDirectory()) walk(join(dir, dirent.name), childRel)
      else files.set(childRel, readFileSync(join(dir, dirent.name), 'utf8'))
    }
  }
  walk(root, '')
  return files
}

/** `git status --porcelain` of one tree ('' = clean). */
export function gitStatusPorcelain(root: string): string {
  return execSync('git status --porcelain', { cwd: root, encoding: 'utf8', timeout: 30_000 }).trim()
}

/** Normalize a Windows/POSIX path for comparison. */
export const normPath = (path: string): string => path.replaceAll('\\', '/')

// ---------------------------------------------------------------------------
// Kernel corpus worlds (the REAL kernel chain on a journey-private root)
// ---------------------------------------------------------------------------

/** One stage-asset file to pre-create in the corpus tree. */
export interface StageAssetSeed { readonly stage: string; readonly goal: string; readonly summaryMark: string }
/** One proposal directory to pre-create under docs/proposals. */
export interface ProposalSeed {
  readonly slug: string
  readonly status: string
  readonly author: string
  readonly created: string
  readonly title: string
  readonly mark: string
  readonly evalReport?: string
}

/** Facts about a built kernel world. */
export interface KernelWorld {
  readonly root: string
  readonly codeRoot: string
  readonly docsRoot: string
  readonly featuresRoot: string
  readonly userDataDir: string
  readonly projectId: string
  readonly featureSlug: string
  readonly set: GeneratedTaskSet
}

export interface KernelWorldOptions {
  /** Feature slug + tree shape (required). */
  readonly feature: { readonly slug: string; readonly status: string; readonly docKinds: readonly string[] }
  readonly tasks: readonly TaskSpec[]
  /** Stage assets to pre-write (element ② anchors). Default: none. */
  readonly stageAssets?: readonly StageAssetSeed[]
  /** Proposals to pre-write under docs/proposals (indexed by the scan). Default: none. */
  readonly proposals?: readonly ProposalSeed[]
  /** Run the migration chain (default true — the pre-migrated discipline). */
  readonly migrate?: boolean
  /** Register into the kernel db (default true; false = the wizard legs' unregistered tree). */
  readonly register?: boolean
  /** Docs root override (out-of-repo doc trees). Default: in-repo. */
  readonly docsRoot?: string
  /** Repo directory name inside root (default 'repo'). */
  readonly repoDir?: string
}

/**
 * Build a kernel world through the REAL chain: write tree (tasks md + index +
 * stage assets + proposals) → register → scan → [migrate] → stage-asset index.
 * The returned userData boots the app on the kernel's own rows.
 */
export async function buildKernelWorld(root: string, options: KernelWorldOptions): Promise<KernelWorld> {
  const seed = `dsh-forge-m3-${options.feature.slug}`
  const set = handBuiltTaskSet({ ...options.feature, seed }, options.tasks)
  const codeRoot = join(root, options.repoDir ?? 'repo')
  const written = writeForgeProject(set, {
    codeRoot,
    ...(options.docsRoot === undefined ? {} : { docsRoot: options.docsRoot }),
  })
  const featuresRoot = join(written.docsRoot, 'docs', 'features')
  for (const asset of options.stageAssets ?? []) {
    const stagesDir = join(featuresRoot, options.feature.slug, 'stages')
    mkdirSync(stagesDir, { recursive: true })
    writeFileSync(join(stagesDir, `${asset.stage}.md`), stageAssetMarkdown(asset.stage, asset.goal, asset.summaryMark), 'utf8')
  }
  for (const proposal of options.proposals ?? []) {
    const dir = join(written.docsRoot, 'docs', 'proposals', proposal.slug)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'proposal.md'), proposalMarkdown(proposal), 'utf8')
    if (proposal.evalReport !== undefined) {
      mkdirSync(join(dir, 'eval'), { recursive: true })
      writeFileSync(join(dir, 'eval', 'final-report.md'), proposal.evalReport, 'utf8')
    }
  }
  const userDataDir = join(root, 'user-data')
  mkdirSync(userDataDir, { recursive: true })
  if ((options.register ?? true) === false) {
    // The wizard legs' unregistered tree: files on disk, empty userData — the
    // app's own registration flow (and nothing else) creates the rows.
    return {
      root,
      codeRoot: written.codeRoot,
      docsRoot: written.docsRoot,
      featuresRoot,
      userDataDir,
      projectId: '',
      featureSlug: options.feature.slug,
      set,
    }
  }
  const { db } = await openDatabase(userDataDir)
  try {
    const project = registerProject(db, { codeRoot: written.codeRoot, docLocationType: 'in_repo' })
    scanForgeFiles(db, { id: project.id, codeRoot: written.codeRoot, docLocationPath: null })
    if ((options.migrate ?? true) === true) {
      const service = createMigrationService({
        db: db as RepoDb,
        userDataPath: userDataDir,
        loadProject: id => (id === project.id ? project : null),
        onEvent: () => {},
      })
      await service.startMigration(project.id)
      if ((options.stageAssets ?? []).length > 0) rebuildStageAssetIndex(db as RepoDb, project.id, featuresRoot)
    }
    return {
      root,
      codeRoot: written.codeRoot,
      docsRoot: written.docsRoot,
      featuresRoot,
      userDataDir,
      projectId: project.id,
      featureSlug: options.feature.slug,
      set,
    }
  } finally {
    db.close()
  }
}

/** A fresh journey-private temp root (the isolation Hard Rule's face). */
export function freshRoot(tag: string): string {
  return mkdtempSync(join(tmpdir(), `dsh-forge-m3-${tag}-`))
}

// ---------------------------------------------------------------------------
// The app world (launch + activate + tab) and its manager
// ---------------------------------------------------------------------------

/** One launched app over one kernel world. */
export interface AppWorld {
  readonly tag: string
  readonly shell: PluginShell
  readonly page: Page
  readonly stub: DispatchStub | null
  readonly stubDir: string
  readonly kernel: KernelWorld
  readonly root: string
  readonly projectId: string
}

export interface BootOptions {
  /** Launch with the dispatch stub env pair (default true). */
  readonly stub?: boolean
  /** Extra env after everything else (wins conflicts). */
  readonly env?: Record<string, string>
  /** Keep the ambient PATH (default false = the clean-PATH preset). */
  readonly cleanPath?: boolean
  /** Activate the kernel's project and settle on a tab (default 'workbench/tasks'). */
  readonly activate?: boolean
  readonly tab?: 'workbench/overview' | 'workbench/proposals' | 'workbench/features' | 'workbench/tasks'
  /** Skip the instance-lock probe (default false — the Hard Rule runs it). */
  readonly skipLockProbe?: boolean
}

/** Boot the app world over one kernel world (launch → uiReady → workbench → activate → tab). */
export async function bootAppWorld(kernel: KernelWorld, tag: string, options: BootOptions = {}): Promise<AppWorld> {
  if ((options.skipLockProbe ?? false) === false) assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })
  const stubDir = mkdtempSync(join(tmpdir(), `dsh-forge-m3-${tag}-stub-`))
  const stub = (options.stub ?? true) === true ? createDispatchStub(stubDir) : null
  const shell = await launchWorkbenchShell({
    userDataDir: kernel.userDataDir,
    rootDir: kernel.root,
    stubEnv: stub?.env,
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.cleanPath === undefined ? {} : { cleanPath: options.cleanPath }),
  })
  const page = shell.page
  await shell.uiReady()
  await switchToWorkbench(page)
  let projectId = kernel.projectId
  if ((options.activate ?? true) === true) {
    const displayName = kernel.codeRoot.split(/[\\/]/).filter(part => part !== '').pop() as string
    const card = page.locator('[data-dsh-forge-project-card]', { hasText: displayName }).first()
    await expect(card).toBeVisible({ timeout: 30_000 })
    await card.locator('[data-dsh-forge-card-action="activate"]').click()
    await expect(card).toHaveAttribute('data-active', 'true', { timeout: 10_000 })
    const state = await bridgeInvoke<{ activeProjectId: string | null }>(page, 'getState', [])
    projectId = state.activeProjectId as string
    await expect(projectId, '激活项目在座(= 语料注册行)').toBe(kernel.projectId)
  }
  const tab = options.tab ?? 'workbench/tasks'
  if (tab !== 'workbench/overview') {
    await page.locator(`[data-dsh-forge-tab="${tab}"]`).click()
  }
  return { tag, shell, page, stub, stubDir, kernel, root: kernel.root, projectId }
}

/** Close one app world (graceful shell close + stub dir removal; root stays for relaunch legs). */
export async function closeAppWorld(world: AppWorld, options: { removeRoot?: boolean } = {}): Promise<void> {
  await world.shell.close().catch(() => {})
  rmSync(world.stubDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  if ((options.removeRoot ?? false) === true) {
    rmSync(world.root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
}

/**
 * The per-file world manager: memoized worlds per tag, strictly ONE live app
 * instance at a time (a different-tag acquire closes the previous world
 * first), everything torn down by `closeAll` (wire into afterAll).
 */
export class WorldManager {
  private readonly worlds = new Map<string, AppWorld>()
  private live: AppWorld | null = null

  async acquire(kernel: KernelWorld, tag: string, options: BootOptions = {}): Promise<AppWorld> {
    const memoized = this.worlds.get(tag)
    if (memoized !== undefined && this.live?.tag === tag) return memoized
    if (this.live !== null && this.live.tag !== tag) await this.closeLive()
    const world = await bootAppWorld(kernel, tag, options)
    this.worlds.set(tag, world)
    this.live = world
    return world
  }

  /** Register an externally-booted world (relaunch legs) as the live one. */
  adopt(world: AppWorld): void {
    this.worlds.set(world.tag, world)
    this.live = world
  }

  /**
   * Hard-kill the live app (the interrupted-migration legs): SIGKILL the
   * Electron main process, settle, and detach WITHOUT the graceful close (the
   * crash semantics under test). The stub dir/root are kept for relaunch.
   */
  async killLive(): Promise<void> {
    const world = this.live
    if (world === null) return
    world.shell.electronApp.process().kill()
    await new Promise(resolve => { setTimeout(resolve, 1_500) })
    await world.shell.close().catch(() => {})
    this.live = null
  }

  private async closeLive(): Promise<void> {
    if (this.live === null) return
    await closeAppWorld(this.live)
    this.live = null
  }

  async closeAll(options: { removeRoot?: boolean } = {}): Promise<void> {
    await this.closeLive()
    if ((options.removeRoot ?? true) === true) {
      for (const world of this.worlds.values()) {
        rmSync(world.root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
      }
    }
    this.worlds.clear()
  }
}

// ---------------------------------------------------------------------------
// Renderer faces (the preload-bridge verb dispatcher + board helpers)
// ---------------------------------------------------------------------------

/** The in-page preload-bridge verb dispatcher (one evaluate per call). */
export async function bridgeInvoke<T>(page: Page, verb: string, args: readonly unknown[]): Promise<T> {
  return await page.evaluate(async (input: { verb: string; args: unknown[] }) => {
    const bridge = (globalThis as { dshForge?: { workbench?: Record<string, (...invoke: unknown[]) => Promise<unknown>> } }).dshForge?.workbench
    if (bridge === undefined || typeof bridge[input.verb] !== 'function') {
      throw new Error(`dshForge.workbench.${input.verb} unavailable in the e2e renderer`)
    }
    return await bridge[input.verb](...input.args)
  }, { verb, args })
}

const workbenchRow = (page: Page) => page.getByRole('button', { name: /^工作台$|^Workbench$/ }).first()

/** The boot-bounce-tolerant workbench switch (6.2 base). */
export async function switchToWorkbench(page: Page): Promise<void> {
  const shellPanel = page.locator('[data-dsh-forge-shell]')
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await workbenchRow(page).click()
    await expect(shellPanel).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(2_500)
    if (await shellPanel.count() > 0) return
  }
  throw new Error('workbench selection never settled (boot session-restore keeps deselecting it)')
}

/** The card-level orchestration badge of one task (its state attribute). */
export const orchBadge = (page: Page, taskKey: string, state: string) =>
  page.locator(`[data-dsh-forge-node-card="${taskKey}"] [data-dsh-forge-orch-badge="${state}"]`)

/** Wait until one task's card shows the given orchestration badge state. */
export async function waitForOrchBadge(page: Page, taskKey: string, state: string, timeoutMs: number): Promise<void> {
  await orchBadge(page, taskKey, state).waitFor({ state: 'visible', timeout: Math.max(1_000, timeoutMs) })
}

/** One dispatch row as getDispatches answers it (the camelCase projection). */
export interface DispatchRowView {
  readonly id: string
  readonly batchId: string
  readonly projectId: string
  readonly featureSlug: string
  readonly taskKey: string
  readonly state: string
  readonly sessionId: string | null
  readonly promptHash: string
  readonly actor: string
  readonly dispatchedAt: string
  readonly endedAt: string | null
  readonly error: string | null
}

/** The board dispatch rows of a project. */
export async function getDispatchRows(page: Page, projectId: string): Promise<DispatchRowView[]> {
  return await bridgeInvoke<DispatchRowView[]>(page, 'getDispatches', [projectId])
}

/** The full board dispatch chain (enter → check N → go → [warning] → confirm). */
export async function dispatchFromBoard(page: Page, taskKeys: readonly string[]): Promise<number> {
  await page.locator('[data-dsh-forge-dispatch-entry]').click()
  await expect(page.locator('[data-dsh-forge-selection-layer="active"]')).toBeVisible({ timeout: 10_000 })
  for (const taskKey of taskKeys) {
    await page.locator(`[data-dsh-forge-select-chk="${taskKey}"] [data-dsh-forge-select-chk-input]`).check()
  }
  await page.locator('[data-dsh-forge-dispatch-go]').click()
  await expect(page.locator('[data-dsh-forge-dialog="dispatch-warning"], [data-dsh-forge-dialog="dispatch-confirm"]').first())
    .toBeVisible({ timeout: 10_000 })
  if (await page.locator('[data-dsh-forge-dialog="dispatch-warning"]').isVisible().catch(() => false)) {
    await page.locator('[data-dsh-forge-dispatch-warning-continue]').click()
  }
  await expect(page.locator('[data-dsh-forge-dialog="dispatch-confirm"]')).toBeVisible({ timeout: 10_000 })
  const t0 = Date.now()
  await page.locator('[data-dsh-forge-dispatch-confirm-go]').click()
  await expect(page.locator('[data-dsh-forge-dialog="dispatch-confirm"]')).toHaveCount(0, { timeout: 15_000 })
  return t0
}

/**
 * The board dispatch entry leg, PAUSED for in-dialog assertions: enter
 * selection → check one task → [派发] → return once the warning OR confirm
 * dialog is on screen (the caller asserts + drives the rest of the chain).
 */
export async function startBoardDispatch(page: Page, taskKey: string): Promise<void> {
  await page.locator('[data-dsh-forge-dispatch-entry]').click()
  await expect(page.locator('[data-dsh-forge-selection-layer="active"]')).toBeVisible({ timeout: 10_000 })
  await page.locator(`[data-dsh-forge-select-chk="${taskKey}"] [data-dsh-forge-select-chk-input]`).check()
  await page.locator('[data-dsh-forge-dispatch-go]').click()
  await expect(page.locator('[data-dsh-forge-dialog="dispatch-warning"], [data-dsh-forge-dialog="dispatch-confirm"]').first())
    .toBeVisible({ timeout: 10_000 })
}

/** One journal prompt row (the injection oracle's subject). */
export interface PromptRow { readonly sessionId: string; readonly text: string; readonly requestId: string }

/** Poll the unified stub journal until one session's prompt row lands. */
export async function waitForPromptRow(page: Page, stub: DispatchStub, sessionId: string): Promise<PromptRow> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const row = stub.readJournal()
      .filter(entry => entry.kind === 'prompt' && entry.sessionId === sessionId)
      .map(entry => ({ sessionId: entry.sessionId as string, text: entry.text as string, requestId: entry.requestId as string }))[0]
    if (row !== undefined) return row
    await page.waitForTimeout(100)
  }
  throw new Error(`stub journal never recorded the prompt row of session ${sessionId}`)
}

/** Poll the journal until N prompt rows exist (the parallel-dispatch face). */
export async function waitForPromptRows(page: Page, stub: DispatchStub, count: number): Promise<PromptRow[]> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const rows = stub.readJournal()
      .filter(entry => entry.kind === 'prompt')
      .map(entry => ({ sessionId: entry.sessionId as string, text: entry.text as string, requestId: entry.requestId as string, at: entry.at }))
    if (rows.length >= count) return rows.slice(0, count).map(({ at: _at, ...row }) => row)
    await page.waitForTimeout(100)
  }
  throw new Error(`stub journal never recorded ${String(count)} prompt rows`)
}

/** t0 → t1: an apply() write → the card first shows the [会话] badge + the new status short label. */
export async function measureReflow(page: Page, taskKey: string, status: 'in_progress' | 'completed', apply: () => Promise<void>): Promise<number> {
  const labels = shortLabelsOf(status)
  const t0 = Date.now()
  await apply()
  await page.waitForFunction((input: { key: string; labels: string[] }) => {
    const card = document.querySelector(`[data-dsh-forge-node-card="${input.key}"]`)
    if (card === null) return false
    const badge = card.querySelector('[data-dsh-forge-badge^="source:"]')
    if (badge?.getAttribute('data-dsh-forge-badge') !== 'source:session') return false
    const text = card.textContent ?? ''
    return input.labels.some(label => text.includes(label))
  }, { key: taskKey, labels }, { timeout: REFLOW_WAIT_TIMEOUT_MS, polling: 50 })
  return Date.now() - t0
}

const SHORT_LABEL_KEYS = {
  in_progress: 'tasks.status.short.in_progress',
  completed: 'tasks.status.short.completed',
} as const

/** 双语短标签(回流判据 = 页内首见目标徽标 + 新状态短标签)。 */
export function shortLabelsOf(status: keyof typeof SHORT_LABEL_KEYS): string[] {
  return [zh[SHORT_LABEL_KEYS[status]], en[SHORT_LABEL_KEYS[status]]]
}

// ---------------------------------------------------------------------------
// Kernel faces (read-only sqlite beside the live app + presynth recomposition)
// ---------------------------------------------------------------------------

/** The kernel db handle as the repo helpers see it (the SC specs' cast face). */
export type KernelDb = RepoDb

/** Open the journey kernel db read-only (WAL: safe beside the live app). */
export async function openKernelDb(userDataDir: string): Promise<KernelDb> {
  const { DatabaseSync } = await import('node:sqlite')
  return new DatabaseSync(join(userDataDir, 'workbench', 'workbench.db'), { readOnly: true }) as unknown as KernelDb
}

/** The kernel-side recomputation of one task's presynth content (oracle input). */
export function recomputePresynth(db: RepoDb, featuresRoot: string, projectId: string, taskKey: string): string {
  const task = getTask(db, projectId, taskKey)
  if (task === null) throw new Error(`task ${taskKey} not found in the journey kernel`)
  const engine = createPresynthEngine({ db, resolveFeaturesRoot: () => featuresRoot })
  return engine.composePresynth(task)
}

// ---------------------------------------------------------------------------
// Zero-spawn faces (the app-tree process scan + main-process stdout capture)
// ---------------------------------------------------------------------------

/** One process-tree row (pid + parent + command — the ancestry faces). */
export interface TreeRow { readonly pid: number; readonly parent: number; readonly command: string }

/** Enumerate the OS process table WITH parentage (win32 CIM / posix ps). */
export function listProcessTree(): TreeRow[] {
  if (process.platform === 'win32') {
    const out = execSync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress"',
      { encoding: 'utf8', timeout: 30_000 },
    )
    const parsed = JSON.parse(out.trim() === '' ? '[]' : out.trim()) as
      { ProcessId: number; ParentProcessId: number; CommandLine: string | null } | Array<{ ProcessId: number; ParentProcessId: number; CommandLine: string | null }>
    return (Array.isArray(parsed) ? parsed : [parsed]).map(row => ({
      pid: Number(row.ProcessId),
      parent: Number(row.ParentProcessId),
      command: row.CommandLine ?? '',
    }))
  }
  const out = execSync('ps -eo pid=,ppid=,command=', { encoding: 'utf8', timeout: 30_000 })
  const rows: TreeRow[] = []
  for (const line of out.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line)
    if (match !== null) rows.push({ pid: Number(match[1]), parent: Number(match[2]), command: match[3] ?? '' })
  }
  return rows
}

/** A command line's resolved executable image (first token, quoted or bare). */
export function imageOf(command: string): string {
  const first = /"([^"]+)"/.exec(command)?.[1] ?? command.split(/\s+/)[0] ?? ''
  return first.split(/[\\/]/).pop() ?? ''
}

/** Is one command line a forge CLI execution (any spawn form)? */
export const isForgeCliImage = (command: string): boolean => /^forge(\.exe|\.cmd|\.bat)?$/i.test(imageOf(command))

/** Is one command line a frozen-CC-plugin spawn (claude executable / package forms)? */
export function isCcPluginSpawn(command: string): boolean {
  if (/^claude(-code)?(\.exe|\.cmd|\.bat|\.ps1)?$/i.test(imageOf(command))) return true
  return /@anthropic-ai[\\/]claude-code|claude-code[\\/]cli\.js/i.test(command)
}

/** Process-level zero-spawn violations under the app tree (forge CLI + frozen CC plugin). */
export function spawnViolationsUnderApp(appPid: number, label: string, rows: readonly TreeRow[]): string[] {
  const byPid = new Map(rows.map(row => [row.pid, row]))
  const isDescendant = (pid: number): boolean => {
    let current = byPid.get(pid)
    let hops = 0
    while (current !== undefined && hops < 64) {
      if (current.pid === appPid) return true
      current = byPid.get(current.parent)
      hops += 1
    }
    return false
  }
  return rows
    .filter(row => row.pid !== appPid && isDescendant(row.pid) && (isForgeCliImage(row.command) || isCcPluginSpawn(row.command)))
    .map(row => `[${label}] pid ${String(row.pid)}: ${row.command.slice(0, 160)}`)
}

/** The main-process stdout capture (log-level face; pipe buffers keep early lines). */
export function captureMainStdout(shell: PluginShell): string[] {
  const lines: string[] = []
  const child = shell.electronApp.process()
  child.stdout?.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString('utf8').split('\n')) {
      if (line.trim() !== '') lines.push(line)
    }
  })
  return lines
}

/**
 * 日志级断言:流活性 + 零 CLI spawn 标记(SC1/SC7 口径 —— 活性锚点选旅程
 * 自身必产的 WORKBENCH_WATCH 行,而非 boot 早期行)。
 */
export function assertZeroSpawnInLog(lines: readonly string[]): void {
  expect(lines.some(line => /"level":"(info|warn|error)".*"code":"[A-Z_]+"/.test(line)),
    '主进程日志流在场(shellLog JSON 行;反空转证据)').toBe(true)
  expect(lines.some(line => line.includes('WORKBENCH_WATCH')), 'WORKBENCH_WATCH 在场(活性锚点)').toBe(true)
  const spawns = lines.filter(line => /forge-bridge|forge CLI|cli-resolve|claude-code|cc-plugin/i.test(line))
  expect(spawns, '日志级零 forge CLI / 冻结 CC 插件 spawn 标记').toEqual([])
}

// ---------------------------------------------------------------------------
// 15-skill flat-name resolution (boot-synced root + vendored yaml parser)
// ---------------------------------------------------------------------------

/** The vendored yaml@2 the host's skill-filesystem provider parses with. */
function vendoredYamlParse(): (text: string) => Record<string, unknown> {
  const specDir = fileURLToPath(new URL('.', import.meta.url))
  const require = createRequire(join(specDir, '../../../../packages/desktop-host-vendor/vendored/packages/skill/skill-filesystem/lib/index.js'))
  const yaml = require('yaml') as { parse(text: string): Record<string, unknown> }
  return text => yaml.parse(text)
}

/** The 15 flat-name resolution assertion over the LIVE synced skill root. */
export function assertSkillsResolve(profileDir: string): void {
  const patchPath = join(profileDir, 'cordis.patch.yml')
  expect(existsSync(patchPath), 'boot 同步落笔用户层 dsh 配置(customSkillDirs 承载面)').toBe(true)
  const patch = readFileSync(patchPath, 'utf8')
  expect(/id:\s*skill-filesystem/.test(patch), 'patch 用户层持有 skill-filesystem 受管行').toBe(true)
  const skillRoot = /customSkillDirs:[\s\S]*?-\s*'([^']+)'/.exec(patch)?.[1]
  expect(typeof skillRoot, 'customSkillDirs 条目指向技能根').toBe('string')
  expect(existsSync(skillRoot as string), `技能根在场: ${String(skillRoot)}`).toBe(true)
  const dirs = readdirSync(skillRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
  expect(dirs, '技能根持有恰好 15 个扁平名目录').toEqual([...MANDATORY_SKILLS].sort())
  const parse = vendoredYamlParse()
  for (const name of MANDATORY_SKILLS) {
    const skillMd = readFileSync(join(skillRoot as string, name, 'SKILL.md'), 'utf8')
    expect(skillMd.startsWith('---'), `${name}/SKILL.md frontmatter 在场`).toBe(true)
    const end = skillMd.indexOf('\n---', 3)
    expect(end, `${name}/SKILL.md frontmatter 闭合`).toBeGreaterThan(0)
    const frontmatter = parse(skillMd.slice(3, end)) as Record<string, unknown>
    expect(frontmatter.name, `${name} frontmatter.name === 扁平名(寻址解析)`).toBe(name)
    expect(typeof frontmatter.description === 'string' && (frontmatter.description as string).trim() !== '',
      `${name} description 非空(vendored 解析器接受)`).toBe(true)
  }
}

// ---------------------------------------------------------------------------
// The real forge CLI probe (dual-form legs' env prerequisite; SC7 precedent)
// ---------------------------------------------------------------------------

/** Resolve the REAL forge CLI executable (the dual-form legs' environment premise). */
export function resolveForgeCli(): string {
  const out = process.platform === 'win32'
    ? execSync('where.exe forge', { encoding: 'utf8', timeout: 15_000 })
    : execSync('which forge', { encoding: 'utf8', timeout: 15_000 })
  const exe = out.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '')[0]
  if (exe === undefined || !existsSync(exe)) {
    throw new Error(
      'dual-form 腿需要本机可解析的真实 forge CLI(子进程实测的环境前提);'
        + `解析输出:${out.trim() === '' ? '(空)' : out.trim()}`,
    )
  }
  return exe
}

/** One real CLI invocation in a project (cwd = codeRoot). */
export function runForgeCli(exe: string, args: readonly string[], cwd: string, options: { allowFailure?: boolean } = {}): { stdout: string; status: number } {
  try {
    const stdout = execFileSync(exe, [...args], { cwd, encoding: 'utf8', timeout: 120_000, windowsHide: true })
    return { stdout, status: 0 }
  } catch (error) {
    if ((options.allowFailure ?? false) === true && error !== null && typeof error === 'object' && 'status' in error) {
      const failure = error as { status?: number; stdout?: string }
      return { stdout: failure.stdout ?? '', status: failure.status ?? 1 }
    }
    throw error
  }
}

/** sha256 of one text (the prompt-hash kernel 口径 leg convenience). */
export const sha256Of = (text: string): string => createHash('sha256').update(text).digest('hex')
