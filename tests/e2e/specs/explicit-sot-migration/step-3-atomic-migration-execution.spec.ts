// @feature dsh-forge-m3 | @web-e2e | @journey explicit-sot-migration
// Traceability: docs/features/dsh-forge-m3/testing/explicit-sot-migration/
// contracts/step-3-atomic-migration-execution.md — Outcomes:
//   success            — 进度浮层(close-guard)→ done + 对拍零差异呈现 →
//                        入口退役 + Pill 翻转;kernel/doc-tree/backup 全套
//                        断言(原子执行 + 五相审计)。
//   interrupted-pre-commit-rollback — 执行中 SIGKILL → 重启 → 二值终态之一
//                        (回滚态:重试成功走全套终态断言;成功态:等价断言);
//                        无第三态。
//   interrupted-post-commit-success — done 呈现后、终态确认前 SIGKILL → 重启
//                        → 等价迁移成功终态,无回滚/重试呈现。
//   external-write-conflict — DEFERRED(无注入缝):「摄入完成后、提交前」的
//                        确定性外部写注入在 6.2 基座无 seam(migration-faults
//                        仅 archive 注错;时序竞态不满足 harness 级确定性命中
//                        前提);覆盖留待缝位(见覆盖报告)。
//   corrupt-source-validation — index.json 损坏 → 校验阶段终止,零摄入零
//                        淘汰,原样在位;修复后重试成功(对拍零差异)。
// fixture_spec: Project(files)/TaskIndexFile(≥10)/TaskMarkdownFile/
// TaskRecordFile — served by harness.buildFilesWorld (×4 independent roots).

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { freshRoot, openKernelDb, snapshotTree, WorldManager } from '../_lib/journey-world.ts'
import {
  assertDocTreeRolledBack,
  assertMigratedEndState,
  buildFilesWorld,
  migrationTrail,
  readParity,
  readProjectRow,
  snapshotDocTree,
  assertParityZeroDiff,
  expectedParity,
  MIG_FEATURE,
} from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('explicit-sot-migration / step 3: 原子迁移执行与对拍结果', () => {
  const manager = new WorldManager()

  test.afterAll(async () => {
    await manager.closeAll()
  })

  /** Open the confirm dialog from the overview entry and click confirm. */
  async function startOverviewMigration(world: Awaited<ReturnType<WorldManager['acquire']>>): Promise<void> {
    const displayName = world.kernel.codeRoot.split(/[\\/]/).filter(part => part !== '').pop() as string
    const card = world.page.locator('[data-dsh-forge-project-card]', { hasText: displayName }).first()
    await expect(card.locator('[data-dsh-forge-migration-entry]')).toBeVisible({ timeout: 15_000 })
    await card.locator('[data-dsh-forge-migration-entry]').click()
    const confirm = world.page.locator('[data-dsh-forge-dialog="migrate-confirm"]')
    await expect(confirm).toBeVisible({ timeout: 10_000 })
    await confirm.locator('[data-dsh-forge-migrate-confirm]').click()
  }

  // Outcome "success" — the overview-path full chain with close-guard + end-state.
  test('step3/success: overview entry → confirm → progress (close-guard: no ✕, Esc alive) → done parity-zero-diff; pill flips, entry retires, full kernel/tree/backup assertions', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const kernel = await buildFilesWorld(freshRoot('sot-mig-s3a'))
    const treeBefore = snapshotDocTree(kernel.docsRoot)
    const world = await manager.acquire(kernel, 'a', { tab: 'workbench/overview' })

    await startOverviewMigration(world)
    const progress = world.page.locator('[data-dsh-forge-dialog="migrate-progress"]')
    await expect(progress).toBeVisible({ timeout: 10_000 })
    await expect(progress.locator('[data-dsh-forge-migration-run]')).toHaveAttribute('data-dsh-forge-migration-run', 'running', { timeout: 15_000 })

    // close-guard:执行中 ✕ 不渲染、Esc 不关闭(不可阻挡的运行不得看起来可取消)。
    await expect(progress.locator('[data-dsh-forge-dialog-close]')).toHaveCount(0)
    await world.page.keyboard.press('Escape')
    await expect(progress).toBeVisible()

    await expect(progress.locator('[data-dsh-forge-migration-run]')).toHaveAttribute('data-dsh-forge-migration-run', 'done', { timeout: 120_000 })
    await expect(progress.locator('[data-dsh-forge-migration-parity-ok]'), '完成呈现:对拍零差异').toBeVisible()
    await progress.locator('[data-dsh-forge-migration-done]').click()
    await expect(world.page.locator('[data-dsh-forge-dialog="migrate-progress"]')).toHaveCount(0, { timeout: 10_000 })

    // 入口退役 + Pill 翻转。
    const displayName = kernel.codeRoot.split(/[\\/]/).filter(part => part !== '').pop() as string
    const card = world.page.locator('[data-dsh-forge-project-card]', { hasText: displayName }).first()
    await expect(card.locator('[data-dsh-forge-migration-pill="migrated"]')).toBeVisible({ timeout: 15_000 })
    await expect(card.locator('[data-dsh-forge-migration-entry]')).toHaveCount(0)

    // harness 级全套:文档树 + 库 + 备份工件 + 五相审计。
    const db = await openKernelDb(world.kernel.userDataDir)
    try {
      await assertMigratedEndState('s3/success', kernel, treeBefore, db)
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
  })

  // Outcome "interrupted-pre-commit-rollback" — kill mid-run → binary terminal state.
  test('step3/interrupted-pre-commit-rollback: SIGKILL mid-run → relaunch lands on ONE of the two terminal states (rolled-back + retry OK, or migrated); never a third state', async ({ }, testInfo) => {
    testInfo.setTimeout(900_000)
    const kernel = await buildFilesWorld(freshRoot('sot-mig-s3b'))
    const treeBefore = snapshotDocTree(kernel.docsRoot)
    const world = await manager.acquire(kernel, 'b', { tab: 'workbench/overview' })

    await startOverviewMigration(world)
    const progress = world.page.locator('[data-dsh-forge-dialog="migrate-progress"]')
    await expect(progress).toBeVisible({ timeout: 10_000 })
    // Kill IMMEDIATELY (the interruption point relative to COMMIT is unknown —
    // the contract's own premise; the assertion is the binary terminal state).
    await manager.killLive()

    // 重启(同一 rootDir/userData):概览呈现二值终态之一。
    const relaunched = await manager.acquire(kernel, 'b-relaunch', { tab: 'workbench/overview' })
    const displayName = kernel.codeRoot.split(/[\\/]/).filter(part => part !== '').pop() as string
    const card = relaunched.page.locator('[data-dsh-forge-project-card]', { hasText: displayName }).first()
    await expect(card).toBeVisible({ timeout: 30_000 })

    const db = await openKernelDb(kernel.userDataDir)
    try {
      const project = readProjectRow(db)
      if (project.data_authority === 'files') {
        // 分支一:提交前中断 → 回滚态(index.json 完整在位,全集 = 基线)。
        assertDocTreeRolledBack('s3/pre-commit', treeBefore, kernel.docsRoot)
        assertParityZeroDiff('s3/pre-commit snapshot', readParity(db, 'task_snapshot', project.id), expectedParity(kernel))
        await expect(card.locator('[data-dsh-forge-migration-pill="migratable"]'), '回滚态:可迁移 Pill 复现').toBeVisible({ timeout: 15_000 })
        // 重试可成功(对拍零差异 + 全套终态)。
        await startOverviewMigration(relaunched)
        const progress2 = relaunched.page.locator('[data-dsh-forge-dialog="migrate-progress"]')
        await expect(progress2.locator('[data-dsh-forge-migration-run]')).toHaveAttribute('data-dsh-forge-migration-run', 'done', { timeout: 120_000 })
        await expect(progress2.locator('[data-dsh-forge-migration-parity-ok]'), '重试成功:对拍零差异').toBeVisible()
        await progress2.locator('[data-dsh-forge-migration-done]').click()
        const db2 = await openKernelDb(kernel.userDataDir)
        try {
          await assertMigratedEndState('s3/pre-commit-retry', kernel, treeBefore, db2)
        } finally {
          ;(db2 as unknown as { close(): void }).close()
        }
      } else {
        // 分支二:提交后中断 → 等价迁移成功终态(无回滚/重试呈现)。
        expect(project.data_authority, '终态二值:sqlite(提交后中断 = 成功态)').toBe('sqlite')
        await expect(card.locator('[data-dsh-forge-migration-pill="migrated"]'), '成功态 Pill').toBeVisible({ timeout: 15_000 })
        await expect(card.locator('[data-dsh-forge-migration-entry]'), '成功态:入口退役').toHaveCount(0)
        await assertMigratedEndState('s3/post-commit-equivalent', kernel, treeBefore, db)
      }
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
  })

  // Outcome "interrupted-post-commit-success" — kill AFTER done, BEFORE dismissal.
  test('step3/interrupted-post-commit-success: SIGKILL after done (before dismissal) → relaunch = migrated terminal state, no rollback/retry face', async ({ }, testInfo) => {
    testInfo.setTimeout(900_000)
    const kernel = await buildFilesWorld(freshRoot('sot-mig-s3c'))
    const treeBefore = snapshotDocTree(kernel.docsRoot)
    const world = await manager.acquire(kernel, 'c', { tab: 'workbench/overview' })

    await startOverviewMigration(world)
    const progress = world.page.locator('[data-dsh-forge-dialog="migrate-progress"]')
    await expect(progress.locator('[data-dsh-forge-migration-run]')).toHaveAttribute('data-dsh-forge-migration-run', 'done', { timeout: 120_000 })
    await expect(progress.locator('[data-dsh-forge-migration-parity-ok]')).toBeVisible()
    // COMMIT 已收口;在终态确认点击前杀进程。
    await manager.killLive()

    const relaunched = await manager.acquire(kernel, 'c-relaunch', { tab: 'workbench/overview' })
    const displayName = kernel.codeRoot.split(/[\\/]/).filter(part => part !== '').pop() as string
    const card = relaunched.page.locator('[data-dsh-forge-project-card]', { hasText: displayName }).first()
    await expect(card.locator('[data-dsh-forge-migration-pill="migrated"]'), '重启 = 迁移成功终态').toBeVisible({ timeout: 30_000 })
    await expect(card.locator('[data-dsh-forge-migration-entry]'), '无迁移入口(不出现重试/回滚呈现)').toHaveCount(0)
    await expect(relaunched.page.locator('[data-dsh-forge-dialog="migrate-progress"]'), '无残留进度浮层').toHaveCount(0)

    // 等价终态:全套断言(库 + 树 + 审计可回查)。
    const db = await openKernelDb(kernel.userDataDir)
    try {
      await assertMigratedEndState('s3/post-commit', kernel, treeBefore, db)
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
  })

  // Outcome "corrupt-source-validation" — 校验阶段源损坏 → 终止于摄入前,可修复重试。
  test('step3/corrupt-source-validation: corrupt index.json → migration stops at validation (zero ingest, file untouched); fix + retry succeeds', async ({ }, testInfo) => {
    testInfo.setTimeout(900_000)
    const kernel = await buildFilesWorld(freshRoot('sot-mig-s3d'))
    const treeBefore = snapshotDocTree(kernel.docsRoot)
    const indexPath = join(kernel.featuresRoot, MIG_FEATURE, 'tasks', 'index.json')
    const originalBytes = readFileSync(indexPath, 'utf8')
    const world = await manager.acquire(kernel, 'd', { tab: 'workbench/overview' })

    // 注入:源文件损坏(JSON 解析必败)。
    const corruptBytes = '{ this is not json ]]'
    writeFileSync(indexPath, corruptBytes, 'utf8')
    // 回滚断言的基线 = 注入后的稳定态(本腿要求损坏文件原样在位;treeBefore
    // 保留原始语料,供修复重试腿的终态对拍引用)。
    const corruptBaseline = snapshotDocTree(kernel.docsRoot)

    await startOverviewMigration(world)
    const progress = world.page.locator('[data-dsh-forge-dialog="migrate-progress"]')
    await expect(progress).toBeVisible({ timeout: 10_000 })
    await expect(progress.locator('[data-dsh-forge-migration-run]')).toHaveAttribute('data-dsh-forge-migration-run', 'failed', { timeout: 60_000 })

    // State:零摄入/淘汰;损坏文件原样在位(不修复不改动);库保持迁移前态。
    expect(readFileSync(indexPath, 'utf8'), '损坏源原样在位(校验终止不触碰源)').toBe(corruptBytes)
    const db = await openKernelDb(kernel.userDataDir)
    try {
      const project = readProjectRow(db)
      expect(project.data_authority, '零摄入:权威仍 files').toBe('files')
      expect(migrationTrail(db, project.id).some(row => row.endsWith('/fail')), '失败审计留档(可回查)').toBe(true)
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
    assertDocTreeRolledBack('s3/corrupt', corruptBaseline, kernel.docsRoot)
    expect(existsSync(indexPath), 'index.json 在位').toBe(true)

    // 修复源文件 → 重试成功(对拍零差异)。
    writeFileSync(indexPath, originalBytes, 'utf8')
    const retry = progress.locator('[data-dsh-forge-migration-retry]')
    if (await retry.isVisible().catch(() => false)) {
      await retry.click()
    } else {
      // 校验失败的呈现面若不带重试钮:自入口重发(修复后可从入口重试)。
      const done = progress.locator('[data-dsh-forge-migration-done]')
      if (await done.isVisible().catch(() => false)) await done.click()
      await world.page.waitForTimeout(500)
      await startOverviewMigration(world)
    }
    const progress2 = world.page.locator('[data-dsh-forge-dialog="migrate-progress"]')
    await expect(progress2.locator('[data-dsh-forge-migration-run]')).toHaveAttribute('data-dsh-forge-migration-run', 'done', { timeout: 120_000 })
    await expect(progress2.locator('[data-dsh-forge-migration-parity-ok]'), '修复后重试成功').toBeVisible()
    await progress2.locator('[data-dsh-forge-migration-done]').click()
    const db2 = await openKernelDb(kernel.userDataDir)
    try {
      await assertMigratedEndState('s3/corrupt-retry', kernel, treeBefore, db2)
    } finally {
      ;(db2 as unknown as { close(): void }).close()
    }
  })
})
