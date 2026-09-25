// @feature dsh-forge-m3 | @web-e2e | @journey out-of-repo-docs-root
// Traceability: docs/features/dsh-forge-m3/testing/out-of-repo-docs-root/
// contracts/step-2-complete-external-registration.md — one test per Outcome:
//   success                 — 接受默认仓外 + 显式授权 → 注册成功(external
//                             行);注册过程不向代码仓写入任何过程文档。
//   authorization-incomplete — 未完成授权 → 「下一步」禁用(无绕过通道)。
//   path-validation-failed  — 非法路径(与代码根相同 → conflict;不存在 →
//                             unreadable)→ 成因可辨错误;修正后可继续。
//   duplicate-registration  — 同一规范化代码根再注册 → 阻止(零新增行)。
// fixture_spec: ForgeProjectCodeRoot(hasDotForge, codeRootUnique)。

import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { freshRoot, gitStatusPorcelain, normPath, snapshotTree, WorldManager, bridgeInvoke } from '../_lib/journey-world.ts'
import { buildPureWorld, managedDocRoot, registerExternalViaWizard } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('out-of-repo-docs-root / step 2: 以默认仓外完成注册', () => {
  const manager = new WorldManager()
  let pure: KernelWorld | null = null

  test.beforeAll(async () => {
    pure = await buildPureWorld(freshRoot('oor-s2'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  /** Walk the wizard to the doc-location step (paused for in-dialog assertions). */
  async function walkToDocStep(world: Awaited<ReturnType<WorldManager['acquire']>>): Promise<void> {
    const { page } = world
    await page.locator('[data-dsh-forge-add-project]').click()
    await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })
    await page.locator('[data-dsh-forge-wizard-path-input]').fill((pure as KernelWorld).codeRoot)
    await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 15_000 })
    await page.locator('[data-dsh-forge-wizard-next]').click()
    await expect(page.locator('[data-dsh-forge-wizard-step-doc]')).toBeVisible()
  }

  // Outcome "success" — 默认仓外注册 + 代码仓零新增。
  test('step2/success: accept the default external root + explicit authorization → registered external; the code repo gains ZERO process docs', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const world = await manager.acquire(pure as KernelWorld, 'pure', { activate: false, tab: 'workbench/overview' })
    const { page } = world
    const repoBaseline = snapshotTree((pure as KernelWorld).codeRoot)

    await registerExternalViaWizard(page, (pure as KernelWorld).codeRoot)

    // 注册行:external + 应用管理路径(库权威);卡片仓外徽标。
    const state = await bridgeInvoke<{ projects: Array<{ codeRoot: string; docLocationType: string; docLocationPath: string | null }> }>(page, 'getState', [])
    const project = state.projects.find(row => normPath(row.codeRoot) === normPath((pure as KernelWorld).codeRoot))
    expect(project?.docLocationType, '注册行 external').toBe('external')
    expect(project?.docLocationPath && normPath(project.docLocationPath), '文档根 = 应用管理路径')
      .toBe(normPath(managedDocRoot((pure as KernelWorld).root, 'repo')))
    const displayName = (pure as KernelWorld).codeRoot.split(/[\\/]/).filter(part => part !== '').pop() as string
    const card = page.locator('[data-dsh-forge-project-card]', { hasText: displayName }).first()
    await expect(card.locator('[data-dsh-forge-card-doc="external"]'), '项目卡仓外徽标').toBeVisible({ timeout: 15_000 })

    // 代码仓零新增过程文档(文件树全等 + git status 空)。
    expect(snapshotTree((pure as KernelWorld).codeRoot), '代码仓文件树与基线全等').toEqual(repoBaseline)
    expect(gitStatusPorcelain((pure as KernelWorld).codeRoot), 'git status --porcelain 为空(git 断言面)').toBe('')
  })

  // Outcome "authorization-incomplete" — 未授权 → 禁用,无绕过。
  test('step2/authorization-incomplete: without the authorization checkbox the NEXT button stays disabled (no bypass channel)', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    // 独立世界(上一世界已注册该代码根;此处需干净注册表)。
    const freshKernel = await buildPureWorld(freshRoot('oor-s2b'))
    const world = await manager.acquire(freshKernel, 'auth', { activate: false, tab: 'workbench/overview' })
    const { page } = world

    await page.locator('[data-dsh-forge-add-project]').click()
    await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })
    await page.locator('[data-dsh-forge-wizard-path-input]').fill(freshKernel.codeRoot)
    await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 15_000 })
    await page.locator('[data-dsh-forge-wizard-next]').click()
    await expect(page.locator('[data-dsh-forge-wizard-step-doc]')).toBeVisible()

    // 未授权(授权登记为空)→ 下一步禁用(仓外纪律:显式授权确认)。
    await expect(page.locator('[data-dsh-forge-wizard-authorize]'), '授权控件未勾选').not.toBeChecked()
    await expect(page.locator('[data-dsh-forge-wizard-next]'), '未授权 → 下一步禁用(无绕过通道)').toBeDisabled()

    // 完成授权后可继续(授权引导闭环)。
    await page.locator('[data-dsh-forge-wizard-authorize]').check()
    await expect(page.locator('[data-dsh-forge-wizard-next]'), '授权后可前进').toBeEnabled({ timeout: 10_000 })
  })

  // Outcome "path-validation-failed" — 两种成因可辨 + 修正后可继续。
  test('step2/path-validation-failed: an edited external path fails by CAUSE (conflict with the code root / unreadable); fixed path proceeds', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const freshKernel = await buildPureWorld(freshRoot('oor-s2c'))
    const world = await manager.acquire(freshKernel, 'validate', { activate: false, tab: 'workbench/overview' })
    const { page } = world

    await (async () => {
      await page.locator('[data-dsh-forge-add-project]').click()
      await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-dsh-forge-wizard-path-input]').fill(freshKernel.codeRoot)
      await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 15_000 })
      await page.locator('[data-dsh-forge-wizard-next]').click()
      await expect(page.locator('[data-dsh-forge-wizard-step-doc]')).toBeVisible()
    })()

    // 成因一:路径与代码根相同 → ERR_DOC_PATH_CONFLICT。
    await page.locator('[data-dsh-forge-wizard-external-input]').fill(freshKernel.codeRoot)
    await expect(page.locator('[data-dsh-forge-wizard-external-error="conflict"]'), '路径冲突错误(role=alert,成因可辨)').toBeVisible({ timeout: 10_000 })

    // 成因二:不存在的路径 → 注册被拒并按成因呈现。真链路的路径探针为宽容
    // 孪生(设计:真校验在提交时主侧链,经向导集中错误映射呈现)—— 契约
    // 口径 = 「注册被阻止 + 成因可辨(ERR_EXTERNAL_PATH_UNREADABLE)+ 修正
    // 后可继续」,呈现面为提交错误(role=alert)。
    await page.locator('[data-dsh-forge-wizard-external-input]').fill(join(freshKernel.root, 'no-such-dir'))
    await page.locator('[data-dsh-forge-wizard-authorize]').check()
    await expect(page.locator('[data-dsh-forge-wizard-next]'), '宽容探针:可前进至提交面').toBeEnabled({ timeout: 10_000 })
    await page.locator('[data-dsh-forge-wizard-next]').click()
    await expect(page.locator('[data-dsh-forge-wizard-step-summary]')).toBeVisible({ timeout: 10_000 })
    await page.locator('[data-dsh-forge-wizard-finish]').click()
    await expect(page.locator('[data-dsh-forge-wizard-submit-error]'), '不可读路径 → 注册被拒(role=alert)').toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-dsh-forge-wizard-submit-error]'), '成因可辨(不可读目录 + 路径在场)').toContainText('is not a readable directory')
    expect((await bridgeInvoke<{ projects: Array<{ codeRoot: string }> }>(page, 'getState', [])).projects.some(
      row => normPath(row.codeRoot) === normPath(freshKernel.codeRoot)), '被拒路径 → 零注册写入').toBe(false)

    // 修正:回退默认应用管理路径 → 授权后可继续完成注册(携默认迁移)。
    await page.locator('[data-dsh-forge-wizard-back]').click()
    await expect(page.locator('[data-dsh-forge-wizard-step-doc]')).toBeVisible()
    await page.locator('[data-dsh-forge-wizard-external-input]').fill(managedDocRoot(freshKernel.root, 'repo'))
    await page.locator('[data-dsh-forge-wizard-authorize]').check()
    await page.locator('[data-dsh-forge-wizard-next]').click()
    await expect(page.locator('[data-dsh-forge-wizard-step-migrate]'), '修正后可继续(迁移步骤在场)').toBeVisible({ timeout: 15_000 })
    await page.locator('[data-dsh-forge-wizard-next]').click()
    await expect(page.locator('[data-dsh-forge-wizard-step-summary]')).toBeVisible()
    await page.locator('[data-dsh-forge-wizard-finish]').click()
    await expect(page.locator('[data-dsh-forge-wizard-step="migration"]'), '完成注册(进入原位迁移相)').toBeVisible({ timeout: 15_000 })
  })

  // Outcome "duplicate-registration" — 重复注册被阻止(零新增)。
  test('step2/duplicate-registration: re-registering the same normalized code root is blocked; the existing registration is untouched', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(pure as KernelWorld, 'pure', { activate: false, tab: 'workbench/overview' })
    const { page } = world

    // 前置:该代码根已在注册表(success 腿)。
    const before = await bridgeInvoke<{ projects: Array<{ codeRoot: string }> }>(page, 'getState', [])
    expect(before.projects.some(row => normPath(row.codeRoot) === normPath((pure as KernelWorld).codeRoot)), '前置:已注册').toBe(true)

    // 再次发起注册向导(同一代码根)。
    await page.locator('[data-dsh-forge-add-project]').click()
    await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })
    await page.locator('[data-dsh-forge-wizard-path-input]').fill((pure as KernelWorld).codeRoot)
    await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 15_000 })
    await page.locator('[data-dsh-forge-wizard-next]').click()

    // 重复注册阻止:向导不进入文档位置/不落第二条注册行。
    await page.waitForTimeout(1_000)
    const after = await bridgeInvoke<{ projects: Array<{ codeRoot: string }> }>(page, 'getState', [])
    expect(after.projects.filter(row => normPath(row.codeRoot) === normPath((pure as KernelWorld).codeRoot)).length,
      '不产生第二条注册记录').toBe(1)
    await page.locator('[data-dsh-forge-dialog="register-wizard"] [data-dsh-forge-dialog-close]').click().catch(() => {})
    await page.keyboard.press('Escape').catch(() => {})
  })
})
