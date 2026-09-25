// @feature dsh-forge-m3 | @web-e2e | @journey explicit-sot-migration
// Traceability: docs/features/dsh-forge-m3/testing/explicit-sot-migration/
// contracts/step-2-migration-confirm.md — Outcomes:
//   success        — 确认对话框三要素(迁移内容/自动备份/index.json 淘汰)+
//                   mono 备份位置;未显式确认不进入执行。
//   cancel-confirm — 取消 → 零执行零变化;入口仍在可再次发起。
//   kernel-unavailable — DEFERRED(无注入缝):「数据内核不可用」在 6.2 基座
//                   无 fault seam(库文件由应用持有,外部破坏非受控注入);
//                   质量门禁止无条件 skip 空测试,覆盖留待缝位(见覆盖报告)。
//   already-migrated-guard — 已迁移项目再发起 → ERR_MIGRATION_GUARD(一次
//                   性语义;在跑编排阻断同因守卫)。
// fixture_spec: Project(files)/TaskIndexFile (+ migrated 行 for the guard) —
// served by harness.buildFilesWorld / buildMigratedWorld.

import { expect, test } from '@playwright/test'
import { freshRoot, openKernelDb, snapshotTree, WorldManager, bridgeInvoke } from '../_lib/journey-world.ts'
import { buildFilesWorld, buildMigratedWorld, readProjectRow } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('explicit-sot-migration / step 2: 确认迁移(含备份说明)', () => {
  const manager = new WorldManager()
  let files: KernelWorld | null = null
  let migrated: KernelWorld | null = null
  let treeBefore: Map<string, string> = new Map()

  test.beforeAll(async () => {
    files = await buildFilesWorld(freshRoot('sot-mig-s2a'))
    migrated = await buildMigratedWorld(freshRoot('sot-mig-s2b'))
    treeBefore = snapshotTree((files as KernelWorld).codeRoot)
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  // Outcome "success" — 三要素说明齐备;仅在显式确认后才进入执行。
  test('step2/success: confirm dialog carries the three-part explanation + mono backup path; no execution before the explicit confirm', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(files as KernelWorld, 'files', { tab: 'workbench/overview' })
    const { page } = world

    const displayName = (files as KernelWorld).codeRoot.split(/[\\/]/).filter(part => part !== '').pop() as string
    const card = page.locator('[data-dsh-forge-project-card]', { hasText: displayName }).first()
    await card.locator('[data-dsh-forge-migration-entry]').click()

    const confirm = page.locator('[data-dsh-forge-dialog="migrate-confirm"]')
    await expect(confirm, '确认对话框在场').toBeVisible({ timeout: 10_000 })
    // 三要素:迁移内容(guard note)/ 自动备份(备份位置 mono)/ 淘汰说明。
    const backupPathEl = confirm.locator('[data-dsh-forge-migrate-backup-path]')
    await expect(backupPathEl, '备份位置说明在场').toBeVisible()
    expect((await backupPathEl.textContent()) ?? '', '备份位置 = userData 下 backups 根').toContain('backups')
    // 三要素正文承载(guard-note 元素 = 启动侧拒绝内联注记,仅错误路由在场,生成稿误用作常驻锚点)。
    await expect(confirm, '迁移内容说明在场').toContainText('任务结构化状态')
    await expect(confirm, '自动备份说明在场').toContainText('迁移前自动备份')
    await expect(confirm, 'index.json 淘汰说明在场').toContainText('index.json 退役归档')
    await expect(confirm.locator('[data-dsh-forge-migrate-confirm]'), '显式确认动作在场').toBeVisible()

    // 未显式确认 → 不进入执行(进度浮层缺席,权威仍 files)。
    await expect(page.locator('[data-dsh-forge-dialog="migrate-progress"]'), '未确认 → 零执行').toHaveCount(0)
    const db = await openKernelDb(world.kernel.userDataDir)
    try {
      expect(readProjectRow(db).data_authority, '确认前权威仍 files(确认本身零库写)').toBe('files')
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
    // 对话框留驻给 cancel outcome(serial 顺序)。
  })

  // Outcome "cancel-confirm" — 取消即未确认:零执行、零变化、可再发起。
  test('step2/cancel-confirm: cancel the confirm dialog → zero execution, zero change, the entry remains re-openable', async ({ }, testInfo) => {
    testInfo.setTimeout(180_000)
    const world = await manager.acquire(files as KernelWorld, 'files')
    const { page } = world

    const confirm = page.locator('[data-dsh-forge-dialog="migrate-confirm"]')
    await expect(confirm, '前置:确认对话框呈现中(serial 前驱)').toBeVisible({ timeout: 10_000 })
    await confirm.locator('[data-dsh-forge-migrate-cancel]').click()
    await expect(confirm, '取消 → 对话框关闭').toHaveCount(0, { timeout: 10_000 })

    // State:数据内核与文档树零变更;项目保持 files 权威。
    const displayName = (files as KernelWorld).codeRoot.split(/[\\/]/).filter(part => part !== '').pop() as string
    const card = page.locator('[data-dsh-forge-project-card]', { hasText: displayName }).first()
    await expect(card.locator('[data-dsh-forge-migration-pill="migratable"]'), '仍可迁移态').toBeVisible({ timeout: 15_000 })
    await expect(card.locator('[data-dsh-forge-migration-entry]'), '迁移入口仍在(可再次发起)').toBeVisible()
    expect(snapshotTree((files as KernelWorld).codeRoot), '取消零变化:文档树与基线全等').toEqual(treeBefore)

    // 可再次发起:重开确认对话框(发起路径完整)。
    await card.locator('[data-dsh-forge-migration-entry]').click()
    await expect(page.locator('[data-dsh-forge-dialog="migrate-confirm"]'), '再次发起 → 确认对话框重现').toBeVisible({ timeout: 10_000 })
    await page.locator('[data-dsh-forge-dialog="migrate-confirm"] [data-dsh-forge-migrate-cancel]').click()
  })

  // Outcome "already-migrated-guard" — 一次性语义守卫(同因:在跑编排阻断)。
  test('step2/already-migrated-guard: re-initiating migration on a migrated project → ERR_MIGRATION_GUARD, zero ingest', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(migrated as KernelWorld, 'migrated', { tab: 'workbench/overview' })
    const { page } = world

    let rejected: string | undefined
    try {
      await bridgeInvoke(page, 'startMigration', [world.projectId])
    } catch (error) {
      rejected = String((error as Error).message)
    }
    expect(rejected ?? '', '已迁移再发起 → ERR_MIGRATION_GUARD(一次性语义)').toContain('ERR_MIGRATION_GUARD')

    // State:零摄入零淘汰 —— 权威行不变。
    const db = await openKernelDb(world.kernel.userDataDir)
    try {
      const project = readProjectRow(db)
      expect(project.data_authority, '守卫拒绝零写入').toBe('sqlite')
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
  })
})
