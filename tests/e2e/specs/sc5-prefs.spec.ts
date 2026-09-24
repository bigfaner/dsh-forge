// @feature dsh-forge-m3 | @web-e2e | @journey forge-m3-sc5
// Traceability: docs/features/dsh-forge-m3/tasks/6.7-sc56-prefs-proposals.md (SC5 AC-1/AC-2)
// Authorities: tech-design §Testing Strategy·Key Test Scenarios (SC5 行:
// 三级覆盖用例;预合成反映生效值)、§Interfaces·Interface 1 (prefs 动词:
// getPrefs 含生效值+来源 / setPrefs 事务原子 / clearPrefOverride 回落)、
// §Cross-Layer Data Map (prefs 来源 = 行级 scope → PrefRow.source 继承/覆盖
// 徽标;feature>project>global 解析), prd-spec G5/SC5 + Story 5 (偏好三级
// 继承 + 预合成消费, D3 键集 coverage.* 在册), 6.2 base (已迁移语料 /
// unified dispatch stub / prompt oracle / instance lock)。
//
// SC5 — the three-tier preference acceptance leg over the 6.2 base, one journey:
//
//   已迁移项目(真内核链:write → register → scan → migrate;单 feature
//   status='tasks' 产物齐全 → 派发直达确认门,1 个零依赖 pending
//   coding.feature 任务)→ 概览页偏好面(插件管理区之下,UF4 seat)→
//     AC-1 三级同键不同值(coverage.coding.feature,注册表默认 80):
//       全局级编辑面基线「继承 · 默认:80%」→ UI 置全局 88(本级覆盖
//       Pill)→ 项目级视图「继承 · 全局:88%」(全局压过默认)→ UI 置
//       项目 77 → Feature 级视图「继承 · 项目:77%」(项目压过全局)→
//       UI 置 feature 66(逐级覆盖序 feature>project>global>default 全链)
//       → 清除 feature 级 → 回落「继承 · 项目:77%」→ 清除 project 级 →
//       回落「继承 · 全局:88%」(AC-1 清除回落 + 来源标识三态:默认/
//       全局/项目/Feature 全部在场过);
//     AC-2 修改偏好后再派发:UI 置 feature 级 55(编辑面 = 唯一写口)→
//       getPrefs 内核面交叉(source='feature', override)→ 看板单选派发 →
//       stub journal prompt 行:「Target: Achieve 55% test coverage」在
//       (生效值注入),默认 80 / 低层 88/77 全部退场(被覆盖)→ 注入
//       oracle 四件套(hash/逐字节前缀/单追加行/requestId 确定性)。
//
// 注入口径(spike-3,SC3/SC4 同源):oracle ② 的预合成内容由测试侧重算
//   (内核引擎字节 + 派发后库/文档树现场),故「生效偏好」要素的喂数
//   正确性由重算承载;journal 面的 55/80/88/77 四串断言则是 UI→内核→
//   注入全链的独立性证据(重算与 journal 同源时仍各自成立)。

import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { assertNoActiveDshForgeInstances } from '../helpers/instance-lock.ts'
import { createDispatchStub, type DispatchStub } from '../stubs/dispatch.ts'
import { verifyPromptInjection } from '../stubs/oracle.ts'
import { launchWorkbenchShell } from '../helpers/app.ts'
import type { PluginShell } from '../../../apps/desktop/e2e/helpers/plugins.ts'
import type { GeneratedFeature, GeneratedTask, GeneratedTaskSet } from '../../../apps/desktop/e2e/fixtures/task-generator.ts'
import { writeForgeProject } from '../../../apps/desktop/e2e/fixtures/forge-project.ts'
import { openDatabase } from '../../../apps/desktop/src/main/workbench/store/db.ts'
import { registerProject } from '../../../apps/desktop/src/main/workbench/repos/projects.ts'
import { scanForgeFiles } from '../../../apps/desktop/src/main/workbench/indexer/scan.ts'
import { createMigrationService } from '../../../apps/desktop/src/main/workbench/migration/pipeline.ts'
import { getTask } from '../../../apps/desktop/src/main/workbench/tasks/task-repo.ts'
import { createPresynthEngine } from '../../../apps/desktop/src/main/workbench/dispatch/presynth/assemble.ts'
import type { RepoDb } from '../../../apps/desktop/src/main/workbench/repos/types.ts'

// ---------------------------------------------------------------------------
// The SC5 corpus: one artifacts-complete feature + one dispatchable task
// ---------------------------------------------------------------------------

/** The journey's single feature slug. */
const SC5_FEATURE = 'sc5-prefs-inherit'

/** The one zero-dependency pending coding.feature task (AC-2's dispatch). */
const SC5_TASK = { localId: '1', title: 'SC5 偏好三级继承腿任务(coding.feature 协议)' } as const

/** The board-qualified key of the task. */
const TASK_KEY = `${SC5_FEATURE}/${SC5_TASK.localId}`

/** The one key the whole tier ladder rides (registry default = 80%). */
const PREF_KEY = 'coverage.coding.feature'

/** The tier-ladder values (all distinct from each other and from 80). */
const GLOBAL_PCT = '88'
const PROJECT_PCT = '77'
const FEATURE_PCT = '66'
const FINAL_PCT = '55'

/** The hand-built task set (1 zero-dep pending typed task). */
function sc5TaskSet(): GeneratedTaskSet {
  const tasks: GeneratedTask[] = [{
    stem: '1-sc5',
    localId: SC5_TASK.localId,
    title: SC5_TASK.title,
    status: 'pending',
    type: 'coding.feature',
    dependencies: [],
    record: null,
  }]
  const statusCounts = { pending: 0, in_progress: 0, completed: 0, blocked: 0, suspended: 0, skipped: 0, rejected: 0 } as Record<string, number>
  for (const task of tasks) statusCounts[task.status] = (statusCounts[task.status] ?? 0) + 1
  // 'tasks' stage + docKinds [prd, design]: the artifacts matrix is satisfied
  // by the written tree ⇒ dispatch reaches the confirm gate with NO warning.
  const feature: GeneratedFeature = {
    slug: SC5_FEATURE,
    status: 'tasks',
    docKinds: ['prd', 'design'],
    tasks,
  }
  return {
    options: {
      seed: 'dsh-forge-m3-sc5',
      taskCount: tasks.length,
      featureCount: 1,
      danglingRate: 0,
      recordRate: 0,
      tasksPerPhase: 6,
      gates: false,
      statusWeights: {},
    },
    features: [feature],
    facts: {
      taskCount: tasks.length,
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

/** Facts about the built journey corpus. */
interface Sc5Corpus {
  readonly codeRoot: string
  readonly docsRoot: string
  readonly featuresRoot: string
  readonly userDataDir: string
  readonly projectId: string
}

/**
 * Build the PRE-MIGRATED SC5 corpus through the REAL kernel chain (the
 * buildSc4Corpus discipline: write tree → register → scan → migrate), so the
 * app boots on `data_authority='sqlite'` with the one typed row.
 */
async function buildSc5Corpus(root: string): Promise<Sc5Corpus> {
  const written = writeForgeProject(sc5TaskSet(), { codeRoot: join(root, 'repo') })
  const userDataDir = join(root, 'user-data')
  const { db } = await openDatabase(userDataDir)
  try {
    const project = registerProject(db, { codeRoot: written.codeRoot, docLocationType: 'in_repo' })
    scanForgeFiles(db, { id: project.id, codeRoot: written.codeRoot, docLocationPath: null })
    const service = createMigrationService({
      db: db as RepoDb,
      userDataPath: userDataDir,
      loadProject: id => (id === project.id ? project : null),
      onEvent: () => {},
    })
    await service.startMigration(project.id)
    return {
      codeRoot: written.codeRoot,
      docsRoot: written.docsRoot,
      featuresRoot: join(written.docsRoot, 'docs', 'features'),
      userDataDir,
      projectId: project.id,
    }
  } finally {
    db.close()
  }
}

// ---------------------------------------------------------------------------
// Renderer-side helpers (SC1/SC3/SC4 precedents)
// ---------------------------------------------------------------------------

/** The in-page preload-bridge verb dispatcher (one evaluate per call). */
async function bridgeInvoke<T>(page: Page, verb: string, args: readonly unknown[]): Promise<T> {
  return await page.evaluate(async (input: { verb: string; args: unknown[] }) => {
    const bridge = (globalThis as { dshForge?: { workbench?: Record<string, (...invoke: unknown[]) => Promise<unknown>> } }).dshForge?.workbench
    if (bridge === undefined || typeof bridge[input.verb] !== 'function') {
      throw new Error(`dshForge.workbench.${input.verb} unavailable in the e2e renderer`)
    }
    return await bridge[input.verb](...input.args)
  }, { verb, args })
}

const workbenchRow = (page: Page) => page.getByRole('button', { name: /^工作台$|^Workbench$/ }).first()
async function switchToWorkbench(page: Page): Promise<void> {
  const shellPanel = page.locator('[data-dsh-forge-shell]')
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await workbenchRow(page).click()
    await expect(shellPanel).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(2_500)
    if (await shellPanel.count() > 0) return
  }
  throw new Error('workbench selection never settled (boot session-restore keeps deselecting it)')
}

// ----- prefs editing-surface helpers (the UF4 section's own dialect) -----

/** The one key's row inside the coverage group body. */
const prefRow = (page: Page) =>
  page.locator(`[data-dsh-forge-pref-group-body="coverage"] [data-dsh-forge-pref-row="${PREF_KEY}"]`)

/** The row's percentage input (aria-label = the key itself). */
const prefInput = (page: Page) => prefRow(page).locator('[data-dsh-forge-pref-control="coverage-input"]')

/** Wait until the section's rows are READY for the current scope. */
async function waitPrefsReady(page: Page): Promise<void> {
  await expect(page.locator('[data-dsh-forge-prefs-section]')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[data-dsh-forge-pref-group-body="coverage"]')).toBeVisible({ timeout: 30_000 })
}

/** Switch the segmented tier (the caller settles the rows — the feature tier
 *  with NO feature picked renders the hint, not the group body). */
async function switchPrefTier(page: Page, tier: 'global' | 'project' | 'feature'): Promise<void> {
  await page.locator(`[data-dsh-forge-pref-tier="${tier}"]`).click()
}

/** Settle on the loaded coverage rows of the current scope. */
async function waitCoverageRows(page: Page): Promise<void> {
  await expect(page.locator('[data-dsh-forge-pref-group-body="coverage"]')).toBeVisible({ timeout: 30_000 })
}

/** Pick the feature in the Feature tier's Menu card and settle the rows. */
async function pickPrefFeature(page: Page, slug: string): Promise<void> {
  await page.locator('[data-dsh-forge-prefs-feature-trigger]').click()
  await page.locator(`[data-dsh-forge-prefs-feature-item="${slug}"]`).click()
  await waitCoverageRows(page)
}

/** Dismiss the saved toast if present (it overlays the lower-right corner). */
async function settlePrefsToast(page: Page): Promise<void> {
  const dismiss = page.locator('[data-dsh-forge-prefs-toast-dismiss]')
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click()
  await expect(page.locator('[data-dsh-forge-prefs-toast]')).toHaveCount(0, { timeout: 10_000 })
}

/**
 * Commit a percentage at the CURRENT tier through the editing surface (fill +
 * Enter = the row's commit path), settling on the authoritative refetch: the
 * 本级覆盖 Pill only renders once getPrefs answers `override: true`.
 */
async function setCoverageAtCurrentTier(page: Page, percentage: string): Promise<void> {
  await prefInput(page).fill(percentage)
  await prefInput(page).press('Enter')
  await expect(prefRow(page).locator('[data-dsh-forge-pref-override]'), `${PREF_KEY} 本级覆盖 Pill(权威 refetch 后)`).toBeVisible({ timeout: 15_000 })
  await expect(prefInput(page), '控件值 = 新生效值').toHaveValue(percentage)
  await settlePrefsToast(page)
}

/** Clear the CURRENT tier's override, settling on the inherited annotation. */
async function clearCoverageAtCurrentTier(page: Page): Promise<void> {
  await prefRow(page).locator('[data-dsh-forge-pref-clear]').click()
  await expect(prefRow(page).locator('[data-dsh-forge-pref-source]'), `${PREF_KEY} 回落继承标注`).toBeVisible({ timeout: 15_000 })
  await settlePrefsToast(page)
}

/** One journal prompt row (the injection oracle's subject). */
interface PromptRow { readonly sessionId: string; readonly text: string; readonly requestId: string }

/** Poll the unified stub journal until one session's prompt row lands. */
async function waitForPromptRow(shell: PluginShell, stub: DispatchStub, sessionId: string): Promise<PromptRow> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const row = stub.readJournal()
      .filter(entry => entry.kind === 'prompt' && entry.sessionId === sessionId)
      .map(entry => ({ sessionId: entry.sessionId as string, text: entry.text as string, requestId: entry.requestId as string }))[0]
    if (row !== undefined) return row
    await shell.page.waitForTimeout(100)
  }
  throw new Error(`stub journal never recorded the prompt row of session ${sessionId}`)
}

/** One dispatch row as getDispatches answers it (the camelCase projection). */
interface DispatchRowView {
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

/** The kernel-side recomputation of one task's presynth content (oracle input). */
function recomposePresynth(db: RepoDb, featuresRoot: string, projectId: string, taskKey: string): string {
  const task = getTask(db, projectId, taskKey)
  if (task === null) throw new Error(`task ${taskKey} not found in the journey kernel`)
  const engine = createPresynthEngine({ db, resolveFeaturesRoot: () => featuresRoot })
  return engine.composePresynth(task)
}

// ---------------------------------------------------------------------------
// The SC5 leg
// ---------------------------------------------------------------------------

test('sc5/prefs: three-tier same-key ladder (default→global→project→feature) + clear fall-backs through the editing surface → post-change dispatch injects the new effective value', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)

  // Hard Rule / 6.2 base — the instance-lock discipline runs BEFORE any launch.
  assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })

  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-sc5-'))
  const stubDir = mkdtempSync(join(tmpdir(), 'dsh-forge-sc5-stub-'))
  const stub: DispatchStub = createDispatchStub(stubDir)
  const corpus = await buildSc5Corpus(root)

  const shell = await launchWorkbenchShell({
    userDataDir: corpus.userDataDir,
    stubEnv: stub.env,
  })
  try {
    const { page } = shell
    await shell.uiReady()
    await switchToWorkbench(page)

    // ---- journey pre-state: the migrated corpus is the boot's own kernel ----
    expect(existsSync(join(corpus.featuresRoot, SC5_FEATURE, 'tasks', 'index.json')),
      '已迁移语料:index.json 已淘汰').toBe(false)

    // 显式激活(单激活事务)→ 概览 tab(偏好面所在)。
    const displayName = corpus.codeRoot.split(/[\\/]/).filter(part => part !== '').pop() as string
    const card = page.locator('[data-dsh-forge-project-card]', { hasText: displayName }).first()
    await expect(card).toBeVisible({ timeout: 30_000 })
    await card.locator('[data-dsh-forge-card-action="activate"]').click()
    await expect(card).toHaveAttribute('data-active', 'true', { timeout: 10_000 })
    await page.locator('[data-dsh-forge-tab="workbench/overview"]').click()

    const state = await bridgeInvoke<{ activeProjectId: string | null }>(page, 'getState', [])
    const projectId = state.activeProjectId
    expect(projectId, '激活项目在座').toBe(corpus.projectId)

    // =========================================================================
    // AC-1:三级同键不同值 → 生效值逐级覆盖 + 清除回落 + 来源标识
    // =========================================================================
    await waitPrefsReady(page)

    // 基线:全局级编辑面呈现注册表默认(来源标识 = 「继承 · 默认:80%」,
    // Cross-Layer Data Map 的 PrefRow.source='default' 渲染面)。
    await expect(prefRow(page).locator('[data-dsh-forge-pref-source]'), '基线:默认来源标识 + 生效值 80%')
      .toHaveText('继承 · 默认:80%')

    // —— 第 1 级:全局 88(编辑面 = 唯一写口:setPrefs 经 UI 控件)——
    await setCoverageAtCurrentTier(page, GLOBAL_PCT)
    await expect(prefRow(page).locator('[data-dsh-forge-pref-override]'), '全局级覆盖 Pill 在场').toBeVisible()

    // —— 第 2 级:项目视图继承全局(全局压过默认)→ 置项目 77 ——
    await switchPrefTier(page, 'project')
    await waitCoverageRows(page)
    await expect(prefRow(page).locator('[data-dsh-forge-pref-source]'), '项目级视图:继承标注 = 全局:88%(覆盖序)')
      .toHaveText(`继承 · 全局:${GLOBAL_PCT}%`)
    await setCoverageAtCurrentTier(page, PROJECT_PCT)

    // —— 第 3 级:Feature 视图继承项目(项目压过全局)→ 置 feature 66 ——
    await switchPrefTier(page, 'feature')
    await pickPrefFeature(page, SC5_FEATURE)
    await expect(prefRow(page).locator('[data-dsh-forge-pref-source]'), 'Feature 级视图:继承标注 = 项目:77%(覆盖序)')
      .toHaveText(`继承 · 项目:${PROJECT_PCT}%`)
    await setCoverageAtCurrentTier(page, FEATURE_PCT)

    // —— 清除 feature 级 → 回落项目 ——
    await clearCoverageAtCurrentTier(page)
    await expect(prefRow(page).locator('[data-dsh-forge-pref-source]'), '清除 feature 级 → 回落项目:77%')
      .toHaveText(`继承 · 项目:${PROJECT_PCT}%`)

    // —— 清除 project 级 → 回落 global(AC-1 的回落锚)——
    await switchPrefTier(page, 'project')
    await waitCoverageRows(page)
    await clearCoverageAtCurrentTier(page)
    await expect(prefRow(page).locator('[data-dsh-forge-pref-source]'), '清除 project 级 → 回落全局:88%(AC-1 回落)')
      .toHaveText(`继承 · 全局:${GLOBAL_PCT}%`)

    // 回落传播:Feature 级视图同步回落到全局(解析链唯一性;the section
    // stays mounted, so the picked slug survives the tier round trip)。
    await switchPrefTier(page, 'feature')
    await pickPrefFeature(page, SC5_FEATURE)
    await expect(prefRow(page).locator('[data-dsh-forge-pref-source]'), '回落传播:Feature 视图 = 继承 · 全局:88%')
      .toHaveText(`继承 · 全局:${GLOBAL_PCT}%`)

    // =========================================================================
    // AC-2:修改偏好后再派发 → 注入内容反映新生效值(journal 断言)
    // =========================================================================
    // 仍在 Feature 级:UI 置 55(修改偏好,编辑面写口)。
    await setCoverageAtCurrentTier(page, FINAL_PCT)

    // 内核面交叉(getPrefs 的 source/override = 解析权威,Interface 1)。
    const featureRows = await bridgeInvoke<Array<{ key: string; value: unknown; source: string | null; override: boolean }>>(
      page, 'getPrefs', [{ feature: `${projectId}/${SC5_FEATURE}` }],
    )
    const coverageRow = featureRows.find(row => row.key === PREF_KEY)
    expect(coverageRow?.value, 'getPrefs:feature 级生效值 = 55%').toEqual({ type: 'percentage', percentage: Number(FINAL_PCT) })
    expect(coverageRow?.source, 'getPrefs:来源 = feature').toBe('feature')
    expect(coverageRow?.override, 'getPrefs:feature 本级覆盖位').toBe(true)

    // 看板单选派发(产物齐全 → 直达确认门,无警告)。
    await page.locator('[data-dsh-forge-tab="workbench/tasks"]').click()
    await expect(page.locator(`[data-dsh-forge-node-card="${TASK_KEY}"]`)).toBeVisible({ timeout: 20_000 })
    await page.locator('[data-dsh-forge-dispatch-entry]').click()
    await expect(page.locator('[data-dsh-forge-selection-layer="active"]')).toBeVisible({ timeout: 10_000 })
    await page.locator(`[data-dsh-forge-select-chk="${TASK_KEY}"] [data-dsh-forge-select-chk-input]`).check()
    await page.locator('[data-dsh-forge-dispatch-go]').click()
    const confirm = page.locator('[data-dsh-forge-dialog="dispatch-confirm"]')
    await expect(confirm, '产物齐全 → 无警告直达确认').toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-dsh-forge-dialog="dispatch-warning"]'), '警告门不出现').toHaveCount(0)
    await page.locator('[data-dsh-forge-dispatch-confirm-go]').click()
    await expect(confirm).toHaveCount(0, { timeout: 15_000 })
    await page.locator(`[data-dsh-forge-node-card="${TASK_KEY}"] [data-dsh-forge-orch-badge="running"]`)
      .waitFor({ state: 'visible', timeout: 20_000 })

    const dispatchRow = (await bridgeInvoke<DispatchRowView[]>(page, 'getDispatches', [projectId]))
      .filter(row => row.taskKey === TASK_KEY)[0] as DispatchRowView
    expect(dispatchRow.state, '派发成功(running)').toBe('running')
    expect(dispatchRow.sessionId, '行携带预铸 session id').not.toBeNull()

    // journal 断言:注入的覆盖指令 = 修改后的 feature 级生效值;默认与
    // 低层级值全部退场(被覆盖序压出)。
    const prompt = await waitForPromptRow(shell, stub, dispatchRow.sessionId as string)
    expect(prompt.text, '注入反映新生效值(55%)').toContain(`Target: Achieve ${FINAL_PCT}% test coverage`)
    expect(prompt.text, '注册表默认(80)不再生效').not.toContain('Achieve 80% test coverage')
    expect(prompt.text, '全局级值(88)被 feature 覆盖').not.toContain('Achieve 88% test coverage')
    expect(prompt.text, '项目级值(77)被 feature 覆盖').not.toContain('Achieve 77% test coverage')

    // 注入 oracle 四件套(逐字符,Hard Rule 形态):sha256(text) ===
    // dispatch.prompt_hash;text 以测试侧重算的预合成内容逐字节开头;
    // 追加行恰好一行;requestId 确定性。
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(join(corpus.userDataDir, 'workbench', 'workbench.db'), { readOnly: true }) as unknown as RepoDb
    try {
      const oracle = verifyPromptInjection({
        journalText: prompt.text,
        presynthContent: recomposePresynth(db, corpus.featuresRoot, projectId, TASK_KEY),
        promptHash: dispatchRow.promptHash,
        sessionId: dispatchRow.sessionId as string,
        requestId: prompt.requestId,
      })
      expect(oracle, '注入 oracle 四件套(hash/逐字节前缀/单追加行/requestId)').toEqual({ ok: true })
    } finally {
      (db as unknown as { close(): void }).close()
    }

    // ---- 收尾:零 renderer pageerrors ---------------------------------------
    expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await shell.close()
    rmSync(stubDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
})
