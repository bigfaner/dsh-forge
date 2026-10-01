// @feature dsh-forge-m3 | @web-e2e | @journey out-of-repo-docs-root
// Traceability: docs/features/dsh-forge-m3/testing/out-of-repo-docs-root/
// contracts/step-1-wizard-doc-location.md — one test per Outcome:
//   success           — 文档位置步骤:默认 = 仓外应用管理路径(external 单选
//                       默认选中 + 预填值 === 管理路径 + 「已预填」提示行);
//                       仓内为可选项(非默认)。
//   explicit-in-repo  — 显式选仓内 → 注册成功;项目行 in_repo(路径空),
//                       不经仓外授权链。
//   forge-not-detected — 无 .forge/ 且无文档位置 forge 数据 → 注册被阻止
//                       (probe failed + 错误引导),不进入文档位置步骤。
// fixture_spec: ForgeProjectCodeRoot(hasDotForge / hasProcessDocs)。

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { freshRoot, normPath, WorldManager, bridgeInvoke } from '../_lib/journey-world.ts'
import { buildInRepoWorld, buildPureWorld, managedDocRoot, registerInRepoViaWizard } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('out-of-repo-docs-root / step 1: 注册向导到达文档位置步骤', () => {
  const manager = new WorldManager()
  let pure: KernelWorld | null = null
  let inrepo: KernelWorld | null = null

  test.beforeAll(async () => {
    pure = await buildPureWorld(freshRoot('oor-s1a'))
    inrepo = await buildInRepoWorld(freshRoot('oor-s1b'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  // Outcome "success" — 默认仓外三面(单选/预填值/提示行)。
  test('step1/success: the doc-location step defaults to the app-managed EXTERNAL root (radio + prefilled value + hint); in-repo stays an option', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(pure as KernelWorld, 'pure', { activate: false, tab: 'workbench/overview' })
    const { page } = world

    // M4 1.8 迁移改写:注册向导入口 = 概览空态 CTA(TopBar add-project 随 chrome 退役)。
    await page.locator('[data-dsh-forge-overview-register]').click()
    await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })
    await page.locator('[data-dsh-forge-wizard-path-input]').fill((pure as KernelWorld).codeRoot)
    await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 15_000 })
    await page.locator('[data-dsh-forge-wizard-next]').click()
    await expect(page.locator('[data-dsh-forge-wizard-step-doc]')).toBeVisible()

    // 默认三面:仓外单选默认选中 + 仓内未选 + 预填值 = 应用管理路径 + 提示行。
    await expect(page.locator('[data-dsh-forge-wizard-doc-external]'), '默认 = 仓外(external 选中)').toBeChecked()
    await expect(page.locator('[data-dsh-forge-wizard-doc-in-repo]'), '仓内单选未选(可选项,非默认)').not.toBeChecked()
    await expect(page.locator('[data-dsh-forge-wizard-external-default]'), '已预填提示行在场').toBeVisible({ timeout: 10_000 })
    const prefilled = await page.locator('[data-dsh-forge-wizard-external-input]').inputValue()
    expect(normPath(prefilled), '预填值 = <userData>/workbench/docs/<dirname>(应用管理路径)')
      .toBe(normPath(managedDocRoot((pure as KernelWorld).root, 'repo')))
  })

  // Outcome "explicit-in-repo" — 显式仓内注册(选项保留,非淘汰)。
  test('step1/explicit-in-repo: explicitly choosing in-repo registers with docLocationType=in_repo (path empty), no external authorization chain', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const world = await manager.acquire(inrepo as KernelWorld, 'inrepo', { activate: false, tab: 'workbench/overview' })
    const { page } = world

    await registerInRepoViaWizard(page, (inrepo as KernelWorld).codeRoot)

    // 项目行:in_repo、路径空(不经仓外授权链)。
    const state = await bridgeInvoke<{ projects: Array<{ codeRoot: string; docLocationType: string; docLocationPath: string | null }> }>(page, 'getState', [])
    const project = state.projects.find(row => normPath(row.codeRoot) === normPath((inrepo as KernelWorld).codeRoot))
    expect(project?.docLocationType, '注册行 in_repo(选项保留)').toBe('in_repo')
    expect(project?.docLocationPath, 'in_repo 不携带路径').toBeNull()
  })

  // Outcome "forge-not-detected" — 无 forge 数据 → 阻止 + 引导。
  test('step1/forge-not-detected: a bare directory (no .forge, no doc-location data) blocks registration at the probe with guidance', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(pure as KernelWorld, 'bare-probe', { activate: false, tab: 'workbench/overview' })
    const { page } = world

    const bareDir = join((pure as KernelWorld).root, 'bare-dir')
    mkdirSync(bareDir, { recursive: true })

    // M4 1.8 迁移改写:注册向导入口 = 概览空态 CTA(TopBar add-project 随 chrome 退役)。
    await page.locator('[data-dsh-forge-overview-register]').click()
    await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })
    await page.locator('[data-dsh-forge-wizard-path-input]').fill(bareDir)
    await expect(page.locator('[data-dsh-forge-wizard-probe="failed"]'), 'forge 数据未检出 → probe failed(role=alert)').toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-dsh-forge-wizard-probe-guide]'), '错误引导在场(修正路径/先初始化)').toBeVisible()
    await expect(page.locator('[data-dsh-forge-wizard-step-doc]'), '不进入文档位置步骤').toHaveCount(0)
  })
})
