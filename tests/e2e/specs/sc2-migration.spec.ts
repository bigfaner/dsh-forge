// @feature dsh-forge-m3 | @web-e2e | @journey forge-m3-sc2
// Traceability: docs/features/dsh-forge-m3/tasks/6.4-sc2-migration.md (AC-1..4)
// Authorities: tech-design §Testing Strategy·Key Test Scenarios (SC2)、
// §Interfaces·Interface 4 (迁移管线六步 + 整体回滚), prd-spec G2/SC2 (对拍
// 零差异 / index.json 淘汰 / md 原样 / 中断重试零半迁移), 6.2 base (语料 /
// 干净 PATH / 实例锁 / stub 开关族)。
//
// SC2 — the SoT migration zero-loss acceptance over the 6.2 base, three legs:
//
//   leg 1 概览路径(AC-1/AC-2 主体):注册不迁移(向导「稍后」)→ 项目卡
//   可迁移 Pill + 「迁移」入口 → 确认对话框(备份说明 + mono 备份位置)→
//   进度对话框(close-guard:执行中无 ✕、Esc 不关)→ 完成(「对拍结果:
//   任务全集零差异」呈现)→ Pill 翻转「已迁移 · SQLite」+ 入口退役。文件
//   断言:每 feature 的 tasks/index.json 淘汰、index.json.migrated-<ts> 在
//   (字节 = 原文件,归档 = 改名零重写);文档树其余文件(tasks/*.md、
//   tasks/records/*.md、manifest/PRD/design 全体)位置 + 内容逐字节原样
//   (Hard Rule:内容与位置均不变)。库断言:data_authority='sqlite'、
//   对拍三方零差异(task 表 ↔ task_snapshot[迁移前投影] ↔ 语料生成器
//   真值 —— 第三方面杀「两表同空」的平凡通过)、migration_event 五相
//   全 ok、备份目录真实落盘。
//
//   leg 2 失败重试(AC-3):基座 stub 开关注入归档失败(字典序末位
//   feature —— 前序 feature 已改名,文档树半迁移风险点)→ 失败呈现
//   (「迁移失败 · 已回滚」+ 回滚说明 + [重试])→ 零半迁移断言(库:
//   authority 仍 files、migrated_at/backup_path 空、task 行零、审计含
//   archive/fail + rollback/ok;文档树:index.json 全员在场、零 .migrated
//   残留、md 逐字节不变)→ 清错 → [重试] → 成功终态 + 迁移后全套断言。
//
//   leg 3 向导路径 · 仓外(AC-4,与 6.3 的 in_repo 腿互补):新注册 +
//   仓外文档根(external + 显式授权)→ StepMigrate 默认开 → 向导原位
//   迁移相位 → parity-ok → 进入工作台;断言落在仓外语料树上。
//
// 时序注记:leg 1 的 close-guard 断言需要可观测的 running 窗口 —— 语料
// 取 300 任务(备份全树拷贝 + 预扫描 + 事务内摄入),运行窗为秒级;
// Esc 在窗口内按压,守卫破损时对话框会在 done 前消失(断言可分辨)。

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { assertNoActiveDshForgeInstances } from '../helpers/instance-lock.ts'
import { writeUnmigratedCorpus } from '../fixtures/corpus.ts'
import { createDispatchStub } from '../stubs/dispatch.ts'
import { createMigrationFaultStub } from '../stubs/migration-faults.ts'
import { freshUserDataDir, launchWorkbenchShell } from '../helpers/app.ts'
import type { PluginShell } from '../../../apps/desktop/e2e/helpers/plugins.ts'

type GeneratedSet = ReturnType<typeof writeUnmigratedCorpus>['set']

// ---------------------------------------------------------------------------
// Doc-tree oracle: position + bytes (the md-原样 Hard Rule's evidence base)
// ---------------------------------------------------------------------------

/** Every file under <docsRoot>/docs/features (rel path → bytes), pre-run. */
function snapshotDocTree(docsRoot: string): Map<string, string> {
  const files = new Map<string, string>()
  const featuresRoot = join(docsRoot, 'docs', 'features')
  const walk = (dir: string, rel: string): void => {
    for (const dirent of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const childRel = rel === '' ? dirent.name : `${rel}/${dirent.name}`
      if (dirent.isDirectory()) walk(join(dir, dirent.name), childRel)
      else files.set(childRel, readFileSync(join(dir, dirent.name), 'utf8'))
    }
  }
  walk(featuresRoot, '')
  return files
}

/**
 * The doc-tree comparison AFTER migration: every pre-run file must still exist
 * with IDENTICAL bytes at the IDENTICAL path, except each feature's
 * tasks/index.json which must be RETIRED and re-appear as
 * tasks/index.json.migrated-<ts> carrying the SAME bytes (archive = rename).
 * No extra files may appear.
 */
function assertDocTreeMigrated(label: string, before: ReadonlyMap<string, string>, docsRoot: string): void {
  const after = snapshotDocTree(docsRoot)
  const problems: string[] = []
  for (const [rel, bytes] of before) {
    if (rel.endsWith('/tasks/index.json')) {
      if (after.has(rel)) problems.push(`index.json NOT retired: ${rel}`)
      const archived = [...after.keys()].find(candidate => candidate.startsWith(`${rel}.migrated-`))
      if (archived === undefined) problems.push(`archive missing for: ${rel}`)
      else if (after.get(archived) !== bytes) problems.push(`archive bytes rewritten: ${archived}`)
      continue
    }
    if (after.get(rel) !== bytes) problems.push(`file changed: ${rel}`)
  }
  const expectedKeys = new Set(before.keys())
  for (const rel of after.keys()) {
    const base = rel.match(/^(.*\/tasks\/index\.json)\.migrated-[^/]+$/)?.[1]
    if (base !== undefined && expectedKeys.has(base)) continue
    if (!expectedKeys.has(rel)) problems.push(`unexpected extra file: ${rel}`)
  }
  expect(problems, `[${label}] doc tree: md 原样(内容+位置)+ index.json 淘汰归档`).toEqual([])
}

/** The un-migrated doc tree: index.json everywhere, zero archive leftovers. */
function assertDocTreeRolledBack(label: string, before: ReadonlyMap<string, string>, docsRoot: string): void {
  const after = snapshotDocTree(docsRoot)
  const problems: string[] = []
  for (const [rel, bytes] of before) {
    if (after.get(rel) !== bytes) problems.push(`file changed during failed run: ${rel}`)
  }
  for (const rel of after.keys()) {
    if (rel.includes('/index.json.migrated-')) problems.push(`archive leftover: ${rel}`)
  }
  expect(problems, `[${label}] rolled-back doc tree ≡ pre-migration tree (零半迁移 · 文档树半身)`).toEqual([])
}

// ---------------------------------------------------------------------------
// Parity oracle: the AC-2 four-field comparison (限定地址/状态/依赖/标题)
// ---------------------------------------------------------------------------

interface ParityRow { readonly status: string; readonly title: string; readonly blockers: string }

/** The corpus ground truth (the file dialect as the generator wrote it). */
function expectedParity(set: GeneratedSet): Map<string, ParityRow> {
  const map = new Map<string, ParityRow>()
  for (const feature of set.features) {
    for (const task of feature.tasks) {
      map.set(`${feature.slug}/${task.localId}`, {
        status: task.status,
        title: task.title,
        blockers: JSON.stringify(task.dependencies),
      })
    }
  }
  return map
}

/** One kernel table's four-field projection (blockers canonicalized). */
function readParity(db: import('node:sqlite').DatabaseSync, table: 'task' | 'task_snapshot', projectId: string): Map<string, ParityRow> {
  const rows = db.prepare(`SELECT task_key, status, title, blockers FROM ${table} WHERE project_id = ?`).all(projectId) as
    Array<{ task_key: string; status: string; title: string; blockers: string }>
  const map = new Map<string, ParityRow>()
  for (const row of rows) {
    map.set(row.task_key, {
      status: row.status,
      title: row.title,
      blockers: JSON.stringify(JSON.parse(row.blockers) as unknown[]),
    })
  }
  return map
}

/** Zero-diff assertion with a report (the AC-2 判据;非平凡集强制非空). */
function assertParityZeroDiff(label: string, actual: ReadonlyMap<string, ParityRow>, expected: ReadonlyMap<string, ParityRow>): void {
  expect(expected.size, `[${label}] parity is non-vacuous (ground truth carries tasks)`).toBeGreaterThan(0)
  const diffs: string[] = []
  for (const key of new Set([...expected.keys(), ...actual.keys()])) {
    const left = actual.get(key)
    const right = expected.get(key)
    if (left === undefined || right === undefined) {
      diffs.push(`${key}: ${left === undefined ? 'missing' : 'extra'}`)
      continue
    }
    if (left.status !== right.status) diffs.push(`${key}.status ${left.status} ≠ ${right.status}`)
    if (left.title !== right.title) diffs.push(`${key}.title differs`)
    if (left.blockers !== right.blockers) diffs.push(`${key}.blockers ${left.blockers} ≠ ${right.blockers}`)
  }
  expect(diffs, `[${label}] 任务全集对拍零差异(限定地址/状态/依赖/标题)`).toEqual([])
}

// ---------------------------------------------------------------------------
// Read-only kernel readers (WAL: safe beside the live app connection)
// ---------------------------------------------------------------------------

interface ProjectRow { readonly id: string; readonly data_authority: string; readonly migrated_at: string | null; readonly backup_path: string | null }

async function withKernel<T>(shell: PluginShell, run: (db: import('node:sqlite').DatabaseSync, project: ProjectRow) => T | Promise<T>): Promise<T> {
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(join(shell.userDataDir, 'workbench', 'workbench.db'), { readOnly: true })
  try {
    const rows = db.prepare('SELECT id, data_authority, migrated_at, backup_path FROM projects').all() as ProjectRow[]
    expect(rows.length, 'exactly one registered project in this journey kernel').toBe(1)
    return await run(db, rows[0] as ProjectRow)
  } finally {
    db.close()
  }
}

/** migration_event (phase, result) trail in write order. */
function migrationTrail(db: import('node:sqlite').DatabaseSync, projectId: string): string[] {
  const rows = db.prepare('SELECT phase, result FROM migration_event WHERE project_id = ? ORDER BY rowid').all(projectId) as
    Array<{ phase: string; result: string }>
  return rows.map(row => `${row.phase}/${row.result}`)
}

// ---------------------------------------------------------------------------
// Journey helpers (wizard faces; SC1's switchToWorkbench precedent)
// ---------------------------------------------------------------------------

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

/** Register through the wizard WITHOUT migrating (the 稍后 leg → overview entry). */
async function registerWithoutMigration(page: Page, codeRoot: string): Promise<void> {
  await page.locator('[data-dsh-forge-add-project]').click()
  await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })
  await page.locator('[data-dsh-forge-wizard-path-input]').fill(codeRoot)
  await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 15_000 })
  await page.locator('[data-dsh-forge-wizard-next]').click()
  await expect(page.locator('[data-dsh-forge-wizard-step-doc]')).toBeVisible()
  await page.locator('[data-dsh-forge-wizard-doc-in-repo]').click()
  await page.locator('[data-dsh-forge-wizard-next]').click()
  await expect(page.locator('[data-dsh-forge-wizard-step-migrate]')).toBeVisible()
  // 稍后:uncheck the default-on one-shot toggle — the overview entry owns this leg.
  await page.locator('[data-dsh-forge-wizard-migrate-toggle]').uncheck()
  await page.locator('[data-dsh-forge-wizard-next]').click()
  await expect(page.locator('[data-dsh-forge-wizard-step-summary]')).toBeVisible()
  await page.locator('[data-dsh-forge-wizard-finish]').click()
  await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toHaveCount(0, { timeout: 15_000 })
}

/** The registered project's card (single project per journey). */
const projectCard = (page: Page) => page.locator('[data-dsh-forge-project-card]').first()

/** Post-migration kernel + tree assertions shared by all three legs. */
async function assertMigratedEndState(
  label: string,
  shell: PluginShell,
  docsRoot: string,
  treeBefore: ReadonlyMap<string, string>,
  set: GeneratedSet,
): Promise<void> {
  // 文档树(Hard Rule):md 位置+内容原样;index.json 淘汰 + 归档字节原样。
  assertDocTreeMigrated(label, treeBefore, docsRoot)
  await withKernel(shell, async (db, project) => {
    expect(project.data_authority, `[${label}] 权威已切读 sqlite`).toBe('sqlite')
    expect(project.migrated_at, `[${label}] migrated_at 落库`).not.toBeNull()
    expect(project.backup_path, `[${label}] backup_path 落库`).not.toBeNull()
    // 备份目录真实落盘(库三件套 + tasks/ 树拷贝)。
    const backupPath = project.backup_path as string
    expect(existsSync(backupPath), `[${label}] 备份目录在场`).toBe(true)
    expect(existsSync(join(backupPath, 'workbench.db')), `[${label}] 备份含库文件`).toBe(true)
    const backedSlugs = readdirSync(join(backupPath, 'tasks'))
    expect(backedSlugs.sort(), `[${label}] 备份含全部 feature tasks/`).toEqual([...set.features.map(f => f.slug)].sort())
    // AC-2 对拍:task(迁移后 SoT)↔ task_snapshot(迁移前投影)↔ 生成器真值。
    assertParityZeroDiff(`${label} task↔snapshot`, readParity(db, 'task', project.id), readParity(db, 'task_snapshot', project.id))
    assertParityZeroDiff(`${label} task↔ground-truth`, readParity(db, 'task', project.id), expectedParity(set))
    // 审计:成功程收尾五相全 ok(重试腿前面还带着失败程的 fail+rollback 行,
    // 由该腿自己全文断言)。
    const trail = migrationTrail(db, project.id)
    expect(trail.slice(-5), `[${label}] 成功程五相全 ok`).toEqual([
      'backup/ok', 'ingest/ok', 'verify/ok', 'switch/ok', 'archive/ok',
    ])
  })
}

// ---------------------------------------------------------------------------
// Leg 1 — the overview-path full chain (AC-1 + AC-2 + md Hard Rule)
// ---------------------------------------------------------------------------

test('sc2/overview-path: entry → confirm(backup) → progress(close-guard) → done(parity zero-diff); index.json retired, md verbatim', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })

  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-sc2-ov-'))
  const stubDir = mkdtempSync(join(tmpdir(), 'dsh-forge-sc2-ov-stub-'))
  // 300 tasks / 6 features: a seconds-scale run window (backup tree copy +
  // pre-scan + in-transaction ingest) so the close-guard observation is not
  // a race, plus a multi-feature archive loop.
  const corpus = writeUnmigratedCorpus(root, { seed: 'dsh-forge-m3-sc2', taskCount: 300, featureCount: 6 })
  const treeBefore = snapshotDocTree(corpus.docsRoot)

  const stub = createDispatchStub(stubDir)
  const shell = await launchWorkbenchShell({
    userDataDir: freshUserDataDir('dsh-forge-m3-sc2-ov'),
    stubEnv: stub.env,
  })
  try {
    const { page } = shell
    await shell.uiReady()
    await switchToWorkbench(page)

    // ---- AC-1 前半:概览入口(注册「稍后」→ 项目卡可迁移态)------------
    await registerWithoutMigration(page, corpus.codeRoot)
    const card = projectCard(page)
    await expect(card).toBeVisible({ timeout: 30_000 })
    await expect(card.locator('[data-dsh-forge-migration-pill="migratable"]')).toBeVisible({ timeout: 15_000 })
    await expect(card.locator('[data-dsh-forge-migration-entry]')).toBeVisible()

    // ---- AC-1:确认对话框(备份说明 + mono 备份位置)--------------------
    await card.locator('[data-dsh-forge-migration-entry]').click()
    const confirm = page.locator('[data-dsh-forge-dialog="migrate-confirm"]')
    await expect(confirm).toBeVisible({ timeout: 10_000 })
    const backupPathEl = confirm.locator('[data-dsh-forge-migrate-backup-path]')
    await expect(backupPathEl).toBeVisible()
    expect((await backupPathEl.textContent()) ?? '', '确认对话框呈现备份位置(userData 下 backups 根)').toContain('backups')

    // ---- AC-1:进度(close-guard)→ 完成(对拍零差异呈现)---------------
    await confirm.locator('[data-dsh-forge-migrate-confirm]').click()
    const progress = page.locator('[data-dsh-forge-dialog="migrate-progress"]')
    await expect(progress).toBeVisible({ timeout: 10_000 })
    await expect(progress.locator('[data-dsh-forge-migration-run]')).toHaveAttribute('data-dsh-forge-migration-run', 'running', { timeout: 15_000 })
    // close-guard:执行中 ✕ 不渲染、Esc 不关闭(一个不可阻挡的运行不得
    // 看起来可取消);守卫破损时 Esc 会在终态前吃掉对话框。
    await expect(progress.locator('[data-dsh-forge-dialog-close]')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(progress).toBeVisible()

    await expect(progress.locator('[data-dsh-forge-migration-run]')).toHaveAttribute('data-dsh-forge-migration-run', 'done', { timeout: 120_000 })
    await expect(progress.locator('[data-dsh-forge-migration-parity-ok]'), '完成呈现:对拍零差异').toBeVisible()
    await progress.locator('[data-dsh-forge-migration-done]').click()
    await expect(page.locator('[data-dsh-forge-dialog="migrate-progress"]')).toHaveCount(0, { timeout: 10_000 })

    // ---- AC-1 后半:入口退役 + Pill 翻转 --------------------------------
    await expect(card.locator('[data-dsh-forge-migration-pill="migrated"]')).toBeVisible({ timeout: 15_000 })
    await expect(card.locator('[data-dsh-forge-migration-entry]')).toHaveCount(0)

    // ---- AC-2 + Hard Rule:对拍三方零差异 + 文档树/库断言 ----------------
    await assertMigratedEndState('sc2/overview', shell, corpus.docsRoot, treeBefore, corpus.set)

    expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await shell.close()
    rmSync(stubDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
})

// ---------------------------------------------------------------------------
// Leg 2 — injected failure → rollback presentation → retry succeeds (AC-3)
// ---------------------------------------------------------------------------

test('sc2/fault-retry: injected archive failure → rolled-back presentation + [重试] → retry succeeds; zero half-migration throughout', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })

  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-sc2-rt-'))
  const stubDir = mkdtempSync(join(tmpdir(), 'dsh-forge-sc2-rt-stub-'))
  const corpus = writeUnmigratedCorpus(root, { seed: 'dsh-forge-m3-sc2-retry', taskCount: 24, featureCount: 4 })
  const treeBefore = snapshotDocTree(corpus.docsRoot)

  // The stub-switch fault: the archive rename throws for the LAST feature in
  // dictionary order — every EARLIER feature is already renamed at that point
  // (the doc-tree half-migration risk the rollback must undo).
  const lastSlug = [...corpus.set.features.map(feature => feature.slug)].sort().at(-1) as string
  const fault = createMigrationFaultStub(stubDir)
  fault.failArchiveForSlug(lastSlug)

  const stub = createDispatchStub(stubDir)
  const shell = await launchWorkbenchShell({
    userDataDir: freshUserDataDir('dsh-forge-m3-sc2-rt'),
    stubEnv: { ...stub.env, ...fault.env },
  })
  try {
    const { page } = shell
    await shell.uiReady()
    await switchToWorkbench(page)

    await registerWithoutMigration(page, corpus.codeRoot)
    const card = projectCard(page)
    await expect(card).toBeVisible({ timeout: 30_000 })
    await expect(card.locator('[data-dsh-forge-migration-entry]')).toBeVisible({ timeout: 15_000 })

    // Fire the migration that WILL fail at archive (post-switch, mid-rename).
    await card.locator('[data-dsh-forge-migration-entry]').click()
    const confirm = page.locator('[data-dsh-forge-dialog="migrate-confirm"]')
    await expect(confirm).toBeVisible({ timeout: 10_000 })
    await confirm.locator('[data-dsh-forge-migrate-confirm]').click()
    const progress = page.locator('[data-dsh-forge-dialog="migrate-progress"]')
    await expect(progress).toBeVisible({ timeout: 10_000 })

    // ---- AC-3:失败呈现(回滚态)+ [重试] -------------------------------
    await expect(progress.locator('[data-dsh-forge-migration-run]')).toHaveAttribute('data-dsh-forge-migration-run', 'failed', { timeout: 60_000 })
    await expect(progress.locator('[data-dsh-forge-migration-rollback-note]'), '失败呈现:回滚说明(零半迁移)').toBeVisible()
    await expect(progress.locator('[data-dsh-forge-migration-retry]'), '[重试] 在场').toBeVisible()

    // ---- AC-3:零半迁移(库 + 文档树,失败态当场断言)-------------------
    assertDocTreeRolledBack('sc2/retry-failed', treeBefore, corpus.docsRoot)
    await withKernel(shell, async (db, project) => {
      expect(project.data_authority, '失败态:权威回滚为 files').toBe('files')
      expect(project.migrated_at, '失败态:migrated_at 未落').toBeNull()
      expect(project.backup_path, '失败态:backup_path 未落(事务回滚)').toBeNull()
      const taskRows = db.prepare('SELECT COUNT(*) AS n FROM task WHERE project_id = ?').get(project.id) as { n: number | bigint }
      expect(Number(taskRows.n), '失败态:权威 task 表零行(摄入整体回滚)').toBe(0)
      const trail = migrationTrail(db, project.id)
      expect(trail[trail.length - 2], '审计:archive 相 fail 留档').toBe('archive/fail')
      expect(trail[trail.length - 1], '审计:rollback 相 ok 留档').toBe('rollback/ok')
    })

    // ---- AC-3:清错 → [重试] → 成功 -------------------------------------
    fault.clear()
    await progress.locator('[data-dsh-forge-migration-retry]').click()
    await expect(progress.locator('[data-dsh-forge-migration-run]')).toHaveAttribute('data-dsh-forge-migration-run', 'done', { timeout: 120_000 })
    await expect(progress.locator('[data-dsh-forge-migration-parity-ok]'), '重试成功:对拍零差异呈现').toBeVisible()
    await progress.locator('[data-dsh-forge-migration-done]').click()
    await expect(page.locator('[data-dsh-forge-dialog="migrate-progress"]')).toHaveCount(0, { timeout: 10_000 })

    // ---- 重试后的全套终态(与 leg 1 同口径 + 双程审计)------------------
    await assertMigratedEndState('sc2/retry-ok', shell, corpus.docsRoot, treeBefore, corpus.set)
    await withKernel(shell, async (db, project) => {
      // 首程审计:backup ok(事务外)→ 事务内相位随 ROLLBACK 吞 → 失败相
      // + rollback ok(事务外补记)。
      const trail = migrationTrail(db, project.id)
      expect(trail.slice(0, 3), '首程:backup ok + archive fail + rollback ok(事务内相位随回滚消失)').toEqual([
        'backup/ok', 'archive/fail', 'rollback/ok',
      ])
      expect(trail.slice(3), '重试程:五相全 ok').toEqual(['backup/ok', 'ingest/ok', 'verify/ok', 'switch/ok', 'archive/ok'])
    })

    expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await shell.close()
    rmSync(stubDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
})

// ---------------------------------------------------------------------------
// Leg 3 — the wizard path, external doc root (AC-4; complements 6.3's in_repo)
// ---------------------------------------------------------------------------

test('sc2/wizard-external: fresh registration (external docs root + explicit authorization) → in-wizard migration → parity-ok; retired/archived on the external tree', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })

  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-sc2-wz-'))
  const stubDir = mkdtempSync(join(tmpdir(), 'dsh-forge-sc2-wz-stub-'))
  const corpus = writeUnmigratedCorpus(root, {
    seed: 'dsh-forge-m3-sc2-wizard',
    taskCount: 12,
    featureCount: 2,
    docsRoot: join(root, 'docs-tree'),
  })
  const treeBefore = snapshotDocTree(corpus.docsRoot)

  const stub = createDispatchStub(stubDir)
  const shell = await launchWorkbenchShell({
    userDataDir: freshUserDataDir('dsh-forge-m3-sc2-wz'),
    stubEnv: stub.env,
  })
  try {
    const { page } = shell
    await shell.uiReady()
    await switchToWorkbench(page)

    // Wizard: path → 仓外 step (fill + explicit authorization) → migrate ON.
    await page.locator('[data-dsh-forge-add-project]').click()
    await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })
    await page.locator('[data-dsh-forge-wizard-path-input]').fill(corpus.codeRoot)
    await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 15_000 })
    await page.locator('[data-dsh-forge-wizard-next]').click()
    await expect(page.locator('[data-dsh-forge-wizard-step-doc]')).toBeVisible()
    await page.locator('[data-dsh-forge-wizard-doc-external]').click()
    await page.locator('[data-dsh-forge-wizard-external-input]').fill(corpus.docsRoot)
    await page.locator('[data-dsh-forge-wizard-authorize]').check()
    await expect(page.locator('[data-dsh-forge-wizard-next]'), '仓外探测 + 授权后可前进').toBeEnabled({ timeout: 15_000 })
    await page.locator('[data-dsh-forge-wizard-next]').click()

    // The conditional migration step: default ON for this leg (wizard path).
    await expect(page.locator('[data-dsh-forge-wizard-step-migrate]')).toBeVisible()
    await expect(page.locator('[data-dsh-forge-wizard-migrate-toggle]')).toBeChecked()
    await page.locator('[data-dsh-forge-wizard-next]').click()
    await expect(page.locator('[data-dsh-forge-wizard-step-summary]')).toBeVisible()
    await page.locator('[data-dsh-forge-wizard-finish]').click()

    // The in-wizard migration phase (in-place, SC1's selectors).
    await expect(page.locator('[data-dsh-forge-wizard-step="migration"]')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-dsh-forge-migration-run="done"]')).toBeVisible({ timeout: 120_000 })
    await expect(page.locator('[data-dsh-forge-migration-parity-ok]')).toBeVisible()
    await page.locator('[data-dsh-forge-wizard-migration-enter]').click()
    await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toHaveCount(0, { timeout: 15_000 })

    // The card lands migrated (no overview entry ever offered for it).
    const card = projectCard(page)
    await expect(card).toBeVisible({ timeout: 30_000 })
    await expect(card.locator('[data-dsh-forge-migration-pill="migrated"]')).toBeVisible({ timeout: 15_000 })

    // Full end-state over the EXTERNAL tree (doc location honored everywhere).
    await assertMigratedEndState('sc2/wizard-external', shell, corpus.docsRoot, treeBefore, corpus.set)

    expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await shell.close()
    rmSync(stubDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
})
