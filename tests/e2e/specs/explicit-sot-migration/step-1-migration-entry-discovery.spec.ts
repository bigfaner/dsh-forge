// @feature dsh-forge-m3 | @web-e2e | @journey explicit-sot-migration
// Traceability: docs/features/dsh-forge-m3/testing/explicit-sot-migration/
// contracts/step-1-migration-entry-discovery.md — one test per Outcome:
//   success              — files-authority project with index.json → 「可迁移」
//                          warn Pill + 「迁移到 M3 内核」入口;纯读零写。
//   not-migratable-hidden — migrated project → success Pill + 入口不呈现
//                          (一次性语义)。
// fixture_spec: Project(files)/TaskIndexFile(≥10 tasks)/Task — served by
// harness.buildFilesWorld / buildMigratedWorld (real kernel chain).

import { expect, test } from '@playwright/test'
import { freshRoot, openKernelDb, WorldManager } from '../_lib/journey-world.ts'
import { buildFilesWorld, buildMigratedWorld, readProjectRow } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('explicit-sot-migration / step 1: 概览页发现迁移入口', () => {
  const manager = new WorldManager()
  let files: KernelWorld | null = null
  let migrated: KernelWorld | null = null

  test.beforeAll(async () => {
    files = await buildFilesWorld(freshRoot('sot-mig-s1a'))
    migrated = await buildMigratedWorld(freshRoot('sot-mig-s1b'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  // Outcome "success" — 检出 index.json → 可迁移标识 + 入口。
  test('step1/success: files-authority project with index.json presents the migratable pill and the migration entry', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(files as KernelWorld, 'files', { tab: 'workbench/overview' })
    const { page } = world

    const displayName = (files as KernelWorld).codeRoot.split(/[\\/]/).filter(part => part !== '').pop() as string
    const card = page.locator('[data-dsh-forge-project-card]', { hasText: displayName }).first()
    await expect(card).toBeVisible({ timeout: 30_000 })
    await expect(card.locator('[data-dsh-forge-migration-pill="migratable"]'), '可迁移 warn Pill').toBeVisible({ timeout: 15_000 })
    await expect(card.locator('[data-dsh-forge-migration-entry]'), '「迁移到 M3 内核」入口在场').toBeVisible()

    // State:纯读零写(getMigrationStatus 面)—— 权威仍 files。
    const db = await openKernelDb(world.kernel.userDataDir)
    try {
      expect(readProjectRow(db).data_authority, '纯读取面:权威仍 files').toBe('files')
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
  })

  // Outcome "not-migratable-hidden" — 已迁移 → 入口退役,一次性语义。
  test('step1/not-migratable-hidden: the migrated project shows the migrated pill and NO migration entry (one-shot semantics)', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(migrated as KernelWorld, 'migrated', { tab: 'workbench/overview' })
    const { page } = world

    const displayName = (migrated as KernelWorld).codeRoot.split(/[\\/]/).filter(part => part !== '').pop() as string
    const card = page.locator('[data-dsh-forge-project-card]', { hasText: displayName }).first()
    await expect(card).toBeVisible({ timeout: 30_000 })
    await expect(card.locator('[data-dsh-forge-migration-pill="migrated"]'), '已迁移 success Pill').toBeVisible({ timeout: 15_000 })
    await expect(card.locator('[data-dsh-forge-migration-entry]'), '迁移入口不呈现(一次性语义)').toHaveCount(0)

    const db = await openKernelDb(world.kernel.userDataDir)
    try {
      expect(readProjectRow(db).data_authority, '权威 sqlite').toBe('sqlite')
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
  })
})
