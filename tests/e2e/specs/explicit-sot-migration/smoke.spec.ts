// @feature dsh-forge-m3 | @web-e2e | @journey explicit-sot-migration
// Journey smoke test — the overview-path happy chain END TO END in one world
// (happy-path Outcomes only):
//   Step 1 discovery (migratable pill + entry) → Step 2 confirm (three-part
//   explanation + mono backup path) → Step 3 execution (close-guard progress →
//   done + parity-zero-diff presentation; pill flips, entry retires) →
//   Step 4 terminal state (board carries ALL tasks, parity vs corpus ground
//   truth; doc-tree harness assertions; five-phase audit trail).
// Traceability: docs/features/dsh-forge-m3/testing/explicit-sot-migration/
// journey.md (Happy Path Steps 1-4) + contracts/step-{1..4}-*.md success faces.

import { expect, test } from '@playwright/test'
import { freshRoot, openKernelDb, WorldManager } from '../_lib/journey-world.ts'
import { assertMigratedEndState, buildFilesWorld, readProjectRow, snapshotDocTree } from './harness.ts'

test('smoke/explicit-sot-migration: 发现入口 → 显式确认(备份说明)→ 原子执行(close-guard + 对拍零差异)→ 终态(看板全量承载 + md 原样 + 五相审计)', async ({ }, testInfo) => {
  testInfo.setTimeout(900_000)
  const manager = new WorldManager()
  const kernel = await buildFilesWorld(freshRoot('sot-mig-smoke'))
  const treeBefore = snapshotDocTree(kernel.docsRoot)
  try {
    const world = await manager.acquire(kernel, 'smoke', { tab: 'workbench/overview' })
    const { page } = world
    const displayName = kernel.codeRoot.split(/[\\/]/).filter(part => part !== '').pop() as string
    const card = page.locator('[data-dsh-forge-project-card]', { hasText: displayName }).first()

    // ---- Step 1:概览发现迁移入口 ------------------------------------------
    await expect(card).toBeVisible({ timeout: 30_000 })
    await expect(card.locator('[data-dsh-forge-migration-pill="migratable"]'), 'Step 1:可迁移 Pill').toBeVisible({ timeout: 15_000 })

    // ---- Step 2:确认迁移(含备份说明)-----------------------------------
    await card.locator('[data-dsh-forge-migration-entry]').click()
    const confirm = page.locator('[data-dsh-forge-dialog="migrate-confirm"]')
    await expect(confirm).toBeVisible({ timeout: 10_000 })
    const backupText = (await confirm.locator('[data-dsh-forge-migrate-backup-path]').textContent()) ?? ''
    expect(backupText, 'Step 2:备份位置说明(userData 下 backups 根)').toContain('backups')
    await expect(confirm.locator('[data-dsh-forge-migrate-guard-note]'), 'Step 2:迁移内容说明').toBeVisible()
    await confirm.locator('[data-dsh-forge-migrate-confirm]').click()

    // ---- Step 3:原子迁移执行与对拍结果 ----------------------------------
    const progress = page.locator('[data-dsh-forge-dialog="migrate-progress"]')
    await expect(progress).toBeVisible({ timeout: 10_000 })
    await expect(progress.locator('[data-dsh-forge-migration-step]').first(), 'Step 3:相位步呈现(校验/迁移/对拍/完成)').toBeVisible()
    await expect(progress.locator('[data-dsh-forge-dialog-close]'), 'close-guard:✕ 不渲染').toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(progress, 'close-guard:Esc 不关闭').toBeVisible()
    await expect(progress.locator('[data-dsh-forge-migration-run]')).toHaveAttribute('data-dsh-forge-migration-run', 'done', { timeout: 120_000 })
    await expect(progress.locator('[data-dsh-forge-migration-parity-ok]'), 'Step 3:对拍零差异呈现').toBeVisible()
    await expect(progress.locator('[data-dsh-forge-migration-backup-path]'), 'Step 3:备份位置在结果中可见').toBeVisible()
    await progress.locator('[data-dsh-forge-migration-done]').click()

    // ---- Step 4:迁移后终态确认 ------------------------------------------
    await expect(card.locator('[data-dsh-forge-migration-pill="migrated"]'), 'Step 4:Pill 翻转已迁移').toBeVisible({ timeout: 15_000 })
    await expect(card.locator('[data-dsh-forge-migration-entry]'), 'Step 4:入口退役').toHaveCount(0)

    await page.locator('[data-dsh-forge-tab="workbench/tasks"]').click()
    for (const task of kernel.set.features[0]?.tasks ?? []) {
      await expect(page.locator(`[data-dsh-forge-node-card="${kernel.featureSlug}/${task.localId}"]`),
        `Step 4:看板承载 ${task.localId}`).toBeVisible({ timeout: 20_000 })
    }

    // Journey Invariants:原子性/md 原样/对拍结论/审计留档(harness 级全套)。
    const db = await openKernelDb(kernel.userDataDir)
    try {
      const project = readProjectRow(db)
      expect(project.data_authority, 'Invariant:SQLite 唯一权威').toBe('sqlite')
      await assertMigratedEndState('smoke', kernel, treeBefore, db)
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await manager.closeAll()
  }
})
