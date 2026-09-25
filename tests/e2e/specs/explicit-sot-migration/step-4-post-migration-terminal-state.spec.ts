// @feature dsh-forge-m3 | @web-e2e | @journey explicit-sot-migration
// Traceability: docs/features/dsh-forge-m3/testing/explicit-sot-migration/
// contracts/step-4-post-migration-terminal-state.md — Outcomes:
//   success            — 迁移后终态:done 呈现(对拍结论)+ 看板承载全部任务
//                        (对拍零差异)+ 入口消失 + 文档树 harness 断言
//                        (index.json 淘汰归档,md 原样)。
//   wizard-same-confirm — 注册向导内的同一迁移确认(默认开;原位迁移相位)
//                        → 与概览页路径同源终态。
//   migration-events-reviewable — 迁移事件留档可回查(migration_event 审计
//                        行时间正序;结果呈现含备份位置与对拍结论)。
// fixture_spec: Project(sqlite, migrated_at/backup_path)/ArchivedIndexFile/
// TaskMarkdownFile(+ ForgeProjectCodeRoot for the wizard leg)。

import { expect, test, type Page } from '@playwright/test'
import { buildKernelWorld, freshRoot, normPath, openKernelDb, WorldManager, bridgeInvoke } from '../_lib/journey-world.ts'
import {
  assertMigratedEndState,
  buildFilesWorld,
  migrationTrail,
  readParity,
  readProjectRow,
  snapshotDocTree,
  assertParityZeroDiff,
  expectedParity,
} from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

/** The wizard registration WITH one-shot migration (SC1/SC2-leg3 selector chain). */
export async function registerWithMigration(page: Page, codeRoot: string): Promise<void> {
  await page.locator('[data-dsh-forge-add-project]').click()
  await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })
  await page.locator('[data-dsh-forge-wizard-path-input]').fill(codeRoot)
  await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 15_000 })
  await page.locator('[data-dsh-forge-wizard-next]').click()
  await expect(page.locator('[data-dsh-forge-wizard-step-doc]')).toBeVisible()
  await page.locator('[data-dsh-forge-wizard-doc-in-repo]').click()
  await page.locator('[data-dsh-forge-wizard-next]').click()
  await expect(page.locator('[data-dsh-forge-wizard-step-migrate]')).toBeVisible()
  await expect(page.locator('[data-dsh-forge-wizard-migrate-toggle]'), '向导内迁移确认默认开(同一迁移确认步骤)').toBeChecked()
  await page.locator('[data-dsh-forge-wizard-next]').click()
  await expect(page.locator('[data-dsh-forge-wizard-step-summary]')).toBeVisible()
  await page.locator('[data-dsh-forge-wizard-finish]').click()
  await expect(page.locator('[data-dsh-forge-wizard-step="migration"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('[data-dsh-forge-migration-run="done"]')).toBeVisible({ timeout: 120_000 })
  await expect(page.locator('[data-dsh-forge-migration-parity-ok]'), '向导路径:对拍零差异呈现').toBeVisible()
  await page.locator('[data-dsh-forge-wizard-migration-enter]').click()
  await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toHaveCount(0, { timeout: 15_000 })
}

test.describe.serial('explicit-sot-migration / step 4: 迁移后终态确认', () => {
  const manager = new WorldManager()
  let kernel: KernelWorld | null = null
  let treeBefore: Map<string, string> = new Map()

  test.beforeAll(async () => {
    kernel = await buildFilesWorld(freshRoot('sot-mig-s4a'))
    treeBefore = snapshotDocTree(kernel.docsRoot)
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  /** Fire the overview migration on the live world (fresh files corpus). */
  async function migrateOverview(world: Awaited<ReturnType<WorldManager['acquire']>>): Promise<void> {
    const displayName = world.kernel.codeRoot.split(/[\\/]/).filter(part => part !== '').pop() as string
    const card = world.page.locator('[data-dsh-forge-project-card]', { hasText: displayName }).first()
    await card.locator('[data-dsh-forge-migration-entry]').click()
    const confirm = world.page.locator('[data-dsh-forge-dialog="migrate-confirm"]')
    await expect(confirm).toBeVisible({ timeout: 10_000 })
    await confirm.locator('[data-dsh-forge-migrate-confirm]').click()
    const progress = world.page.locator('[data-dsh-forge-dialog="migrate-progress"]')
    await expect(progress.locator('[data-dsh-forge-migration-run]')).toHaveAttribute('data-dsh-forge-migration-run', 'done', { timeout: 120_000 })
    await expect(progress.locator('[data-dsh-forge-migration-parity-ok]'), '完成呈现:对拍结论(不因当场关闭而无痕的结论要素)').toBeVisible()
    await expect(progress.locator('[data-dsh-forge-migration-backup-path]'), '结果含备份位置').toBeVisible()
    await progress.locator('[data-dsh-forge-migration-done]').click()
  }

  // Outcome "success" — the overview-path terminal state (board + tree + entry).
  test('step4/success: post-migration terminal state — done copy, board carries ALL tasks (parity zero-diff), entry gone, doc-tree harness assertions', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const world = await manager.acquire(kernel as KernelWorld, 'a', { tab: 'workbench/overview' })
    await migrateOverview(world)

    // 概览:入口消失 + 已迁移 Pill。
    const displayName = (kernel as KernelWorld).codeRoot.split(/[\\/]/).filter(part => part !== '').pop() as string
    const card = world.page.locator('[data-dsh-forge-project-card]', { hasText: displayName }).first()
    await expect(card.locator('[data-dsh-forge-migration-pill="migrated"]')).toBeVisible({ timeout: 15_000 })
    await expect(card.locator('[data-dsh-forge-migration-entry]'), '「可迁移」入口消失').toHaveCount(0)

    // 看板承载全部任务(与迁移前任务全集一致)。
    await world.page.locator('[data-dsh-forge-tab="workbench/tasks"]').click()
    for (const task of (kernel as KernelWorld).set.features[0]?.tasks ?? []) {
      await expect(world.page.locator(`[data-dsh-forge-node-card="${(kernel as KernelWorld).featureSlug}/${task.localId}"]`),
        `看板承载:${task.localId}`).toBeVisible({ timeout: 20_000 })
    }

    // harness 级全套(文档树 + 库 + 备份)。
    const db = await openKernelDb(world.kernel.userDataDir)
    try {
      await assertMigratedEndState('s4/success', kernel as KernelWorld, treeBefore, db)
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
  })

  // Outcome "migration-events-reviewable" — 审计链可回查(承接 success 的迁移)。
  test('step4/migration-events-reviewable: migration events stay reviewable (ordered five-phase trail, kernel-owned audit)', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(kernel as KernelWorld, 'a')
    const db = await openKernelDb(world.kernel.userDataDir)
    try {
      const project = readProjectRow(db)
      const trail = migrationTrail(db, project.id)
      expect(trail, '迁移事件留档(非无痕)').toHaveLength(5)
      expect(trail, '五相时间正序全 ok(备份/对拍结果可回查)').toEqual([
        'backup/ok', 'ingest/ok', 'verify/ok', 'switch/ok', 'archive/ok',
      ])
      // 对拍结论可回查:权威表与真值零差异(审计与结果同源)。
      assertParityZeroDiff('s4/reviewable', readParity(db, 'task', project.id), expectedParity(kernel as KernelWorld))
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
  })

  // Outcome "wizard-same-confirm" — 向导内同一迁移确认(与概览路径同源)。
  test('step4/wizard-same-confirm: registering an index.json-carrying project through the wizard migrates in place — same terminal state as the overview path', async ({ }, testInfo) => {
    testInfo.setTimeout(900_000)
    // 未注册树(register:false):注册与迁移一并由向导承载。
    const wizardKernel = await buildKernelWorld(freshRoot('sot-mig-s4b'), {
      feature: { slug: 'sot-mig-wizard', status: 'tasks', docKinds: ['prd', 'design'] },
      tasks: (kernel as KernelWorld).set.features[0]?.tasks.map(task => ({
        stem: task.stem, localId: task.localId, title: task.title, status: task.status, type: task.type, dependencies: [...task.dependencies],
      })) ?? [],
      register: false,
    })
    const wizardTreeBefore = snapshotDocTree(wizardKernel.docsRoot)

    const world = await manager.acquire(wizardKernel, 'wizard', { activate: false, tab: 'workbench/overview' })
    await registerWithMigration(world.page, wizardKernel.codeRoot)

    // 注册行 + 终态与概览路径一致(对拍零差异/index.json 淘汰/md 留存)。
    const state = await bridgeInvoke<{ projects: Array<{ id: string; codeRoot: string; docLocationType: string }> }>(world.page, 'getState', [])
    const project = state.projects.find(row => normPath(row.codeRoot) === normPath(wizardKernel.codeRoot))
    expect(project?.docLocationType, '向导注册行 in_repo').toBe('in_repo')

    const displayName = wizardKernel.codeRoot.split(/[\\/]/).filter(part => part !== '').pop() as string
    const card = world.page.locator('[data-dsh-forge-project-card]', { hasText: displayName }).first()
    await expect(card.locator('[data-dsh-forge-migration-pill="migrated"]'), '向导路径:已迁移 Pill').toBeVisible({ timeout: 15_000 })
    const db = await openKernelDb(wizardKernel.userDataDir)
    try {
      await assertMigratedEndState('s4/wizard', wizardKernel, wizardTreeBefore, db)
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
  })
})
