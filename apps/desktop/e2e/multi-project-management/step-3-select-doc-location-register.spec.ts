// @feature dsh-forge-m2 | @web-e2e | @journey multi-project-management
// Traceability: docs/features/dsh-forge-m2/testing/multi-project-management/contracts/step-3-select-doc-location-register.md
//
// Step 3(选择文档位置并完成注册)的五条 Outcome 腿。
//
// Divergence note(ui-design UF1「注册成功 → 激活项目」vs 实装,gen-test-scripts
// 勘误,记录不静默):WorkbenchShell.tsx 的 register 动词本身不激活(closeWizard
// 只刷新注册表 + 已注册 toast ——「register verb itself never activates,
// activateProject is the single-active transaction」)。实装链 = 向导完成 → 卡片
// 落地 data-active="false" + toast → 经卡片 [data-dsh-forge-card-action=
// "activate"] 显式激活 → 单激活事务。本文件按代码真实链编码 success 腿,断言
// 「激活」落在显式激活动词之后(contract Output 的「该项目被激活并进入工作台」
// 由注册+显式激活两步共同满足;差异已记录,不编码为伪失败预期)。
// 其余:同路径冲突为步骤 ② 客户端即时守卫(paths.ts samePath,零 fs);
// 仓外授权 = 向导步骤 ② 显式勾选、submit 时 authorizeExternalDocPath 落记录
// (FT-051);授权后不可读 = 授权落库后移除仓外树,submit 时可读性关卡拒绝
// (FT-037(5),先于 forge 检出)。
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  BASE_BUNDLES, FORGE_WORKBENCH, FORGE_WORKBENCH_STAGED_AT, forgeWorkbenchTarball,
} from '../helpers/plugins.ts'
import { registerFixtureProject, writeForgeProject } from '../fixtures/forge-project.ts'
import { generateTaskSet } from '../fixtures/task-generator.ts'
import { cleanupViewKey, closeAndAwaitExit, createAppSessionFactory, switchToWorkbench } from '../tests/m2/helpers/restart-app.ts'
import { assertTreesIdentical, hashTree } from '../tests/m2/helpers/tree-hash.ts'

/** The workbench-owned registry read (registration/activation oracle, FT-030). */
interface RegistryRow { id: string; displayName: string; codeRoot: string; docLocationType: string; docLocationPath: string | null }
async function readRegistry(page: Page): Promise<{ projects: RegistryRow[]; activeProjectId: string | null }> {
  return await page.evaluate(async () => {
    type Bridge = { getState?: () => Promise<{ projects: RegistryRow[]; activeProjectId: string | null }> }
    const bridge = (globalThis as { dshForge?: { workbench?: Bridge } }).dshForge?.workbench
    const state = await bridge?.getState?.()
    return { projects: state?.projects ?? [], activeProjectId: state?.activeProjectId ?? null }
  })
}

function journeyBundles(): ReadonlyArray<{ name: string; source?: string; mandatory?: true }> {
  return [
    ...BASE_BUNDLES,
    { name: FORGE_WORKBENCH, source: `tarball:${FORGE_WORKBENCH_STAGED_AT}`, mandatory: true },
  ]
}

/** The card whose registered displayName is `name` (codeRoot 目录名 default). */
const cardOf = (page: Page, name: string) => page.locator('[data-dsh-forge-project-card]', { hasText: name }).first()

test('step-3/success [@web-e2e @journey multi-project-management]: in_repo default completes registration in 3 steps, explicit activate keeps single activation, zero project-dir writes', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)

  const setA = generateTaskSet({ seed: 'mpm3ok', taskCount: 6, featureCount: 1, danglingRate: 0, recordRate: 0 })
  const setB = generateTaskSet({ seed: 'mpm3okb', taskCount: 8, featureCount: 2, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-mpm3-'))
  const projectA = writeForgeProject(setA, { codeRoot: join(root, 'proj-a-mpm3') })
  const projectB = writeForgeProject(setB, { codeRoot: join(root, 'proj-b-mpm3') })
  const nameB = 'proj-b-mpm3'
  const hashB = hashTree(projectB.codeRoot)

  const session = createAppSessionFactory({
    bundles: journeyBundles(),
    stageTarballs: [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }],
    rootDir: join(root, 'shell'),
    userDataDir: join(root, 'user-data'),
  })

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      await registerFixtureProject(page, projectA)
      await switchToWorkbench(page)
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()

      // ① 检出 → ② 默认仓内(不勾外置)→ ③ 完成:不超过 3 步完成注册。
      await page.locator('[data-dsh-forge-add-project]').click()
      await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-dsh-forge-wizard-path-input]').fill(projectB.codeRoot)
      await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-dsh-forge-wizard-next]').click()
      await expect(page.locator('[data-dsh-forge-wizard-step-doc]')).toBeVisible()
      await expect(page.locator('[data-dsh-forge-wizard-doc-in-repo]'), '默认仓内文档位置(外置默认关闭)').toBeChecked()
      await page.locator('[data-dsh-forge-wizard-next]').click()
      await expect(page.locator('[data-dsh-forge-wizard-step-summary]')).toBeVisible()
      // UF1 数据要求:显示名缺省 = 代码根目录名(placeholder 承载缺省)。
      await expect(page.locator('[data-dsh-forge-wizard-name-input]')).toHaveAttribute('placeholder', nameB)
      await page.locator('[data-dsh-forge-wizard-finish]').click()

      // 注册落地(实装链:register 不激活 —— 见头注 divergence note)。
      await expect(cardOf(page, nameB)).toBeVisible({ timeout: 30_000 })
      await expect(cardOf(page, nameB)).toHaveAttribute('data-active', 'false')
      await expect(page.locator('[data-dsh-forge-shell-toast]')).toContainText(nameB, { timeout: 10_000 })

      // 显式激活(单激活事务):B 激活、A 去激活、切换器携带 B 名。
      await cardOf(page, nameB).locator('[data-dsh-forge-card-action="activate"]').click()
      await expect(cardOf(page, nameB)).toHaveAttribute('data-active', 'true', { timeout: 10_000 })
      await expect(cardOf(page, 'proj-a-mpm3'), '单激活:激活新项目即原项目去激活').toHaveAttribute('data-active', 'false')
      await expect(page.locator('[data-dsh-forge-switcher-trigger]')).toContainText(nameB, { timeout: 10_000 })

      // State:三分信息持久化为工作台自有状态(FT-036 口径)。
      const after = await readRegistry(page)
      expect(after.projects).toHaveLength(2)
      const rowB = after.projects.find(row => row.displayName === nameB)
      expect(rowB?.docLocationType, 'in_repo 落库').toBe('in_repo')
      expect(rowB?.docLocationPath, 'in_repo → 路径为空(FT-036)').toBeNull()
      expect(rowB?.displayName, '显示名 = 目录名(FT-036 未提供时默认)').toBe(nameB)
      expect(after.activeProjectId, 'active_project_id 指向新(显式激活的)项目').toBe(rowB?.id)

      // Side-effect:注册/激活只写工作台自有库,零项目目录写入(树哈希对拍)。
      assertTreesIdentical('B codeRoot across register+activate', hashB, hashTree(projectB.codeRoot))

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
    expect(existsSync(root)).toBe(false)
  }
})

test('step-3/same-path-conflict [@web-e2e @journey multi-project-management]: external doc path equal to the code root is refused inline on step ② with zero writes', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)

  const setA = generateTaskSet({ seed: 'mpm3cfl', taskCount: 6, featureCount: 1, danglingRate: 0, recordRate: 0 })
  const setB = generateTaskSet({ seed: 'mpm3cflb', taskCount: 6, featureCount: 1, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-mpm3cfl-'))
  const projectA = writeForgeProject(setA, { codeRoot: join(root, 'proj-a-mpm3cfl') })
  const projectB = writeForgeProject(setB, { codeRoot: join(root, 'proj-b-mpm3cfl') })

  const session = createAppSessionFactory({
    bundles: journeyBundles(),
    stageTarballs: [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }],
    rootDir: join(root, 'shell'),
    userDataDir: join(root, 'user-data'),
  })

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      const projectAId = await registerFixtureProject(page, projectA)
      await switchToWorkbench(page)
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()
      const before = await readRegistry(page)

      // 步骤 ② 显式选仓外,路径 = 本项目代码根目录本身。
      await page.locator('[data-dsh-forge-add-project]').click()
      await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-dsh-forge-wizard-path-input]').fill(projectB.codeRoot)
      await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-dsh-forge-wizard-next]').click()
      await page.locator('[data-dsh-forge-wizard-doc-external]').click()
      await page.locator('[data-dsh-forge-wizard-external-input]').fill(projectB.codeRoot)
      // 客户端即时一致性守卫(paths.ts samePath,纯比对零 fs;FT-037(3) 同语义)。
      await expect(page.locator('[data-dsh-forge-wizard-external-error="conflict"]')).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('[data-dsh-forge-wizard-next]'), '校验失败 → 不得进入下一步').toBeDisabled()
      await expect(page.locator('[data-dsh-forge-wizard-step-doc]'), '停留步骤 ②').toBeVisible()

      // State:零注册写入(不得以相同路径完成注册)。
      const after = await readRegistry(page)
      expect(after.projects.map(row => row.id)).toEqual(before.projects.map(row => row.id))
      expect(after.activeProjectId).toBe(projectAId)

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
    expect(existsSync(root)).toBe(false)
  }
})

test('step-3/external-auth-required [@web-e2e @journey multi-project-management]: explicit authorization unlocks the external doc location and registers it external, zero project-dir writes', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)

  const setA = generateTaskSet({ seed: 'mpm3ext', taskCount: 6, featureCount: 1, danglingRate: 0, recordRate: 0 })
  const setB = generateTaskSet({ seed: 'mpm3extb', taskCount: 7, featureCount: 2, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-mpm3ext-'))
  const projectA = writeForgeProject(setA, { codeRoot: join(root, 'proj-a-mpm3ext') })
  const extDocs = join(root, 'mpm3-ext-docs')
  const projectB = writeForgeProject(setB, { codeRoot: join(root, 'proj-b-mpm3ext'), docsRoot: extDocs })
  const nameB = 'proj-b-mpm3ext'
  const hashBCode = hashTree(projectB.codeRoot)
  const hashBDocs = hashTree(extDocs)

  const session = createAppSessionFactory({
    bundles: journeyBundles(),
    stageTarballs: [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }],
    rootDir: join(root, 'shell'),
    userDataDir: join(root, 'user-data'),
  })

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      const projectAId = await registerFixtureProject(page, projectA)
      await switchToWorkbench(page)
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()

      await page.locator('[data-dsh-forge-add-project]').click()
      await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-dsh-forge-wizard-path-input]').fill(projectB.codeRoot)
      await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-dsh-forge-wizard-next]').click()
      await page.locator('[data-dsh-forge-wizard-doc-external]').click()
      await page.locator('[data-dsh-forge-wizard-external-input]').fill(extDocs)
      // 授权提示块在、勾选前「下一步」不可用(授权为前置关卡,FT-051)。
      await expect(page.locator('[data-dsh-forge-wizard-auth-block]')).toBeVisible()
      await expect(page.locator('[data-dsh-forge-wizard-authorize]')).not.toBeChecked()
      await expect(page.locator('[data-dsh-forge-wizard-next]')).toBeDisabled()
      // 勾选确认授权 → 解锁。
      await page.locator('[data-dsh-forge-wizard-authorize]').check()
      await expect(page.locator('[data-dsh-forge-wizard-next]')).toBeEnabled()
      await page.locator('[data-dsh-forge-wizard-next]').click()
      await expect(page.locator('[data-dsh-forge-wizard-step-summary]')).toBeVisible()
      await page.locator('[data-dsh-forge-wizard-finish]').click()

      await expect(cardOf(page, nameB)).toBeVisible({ timeout: 30_000 })
      await expect(page.locator('[data-dsh-forge-shell-toast]')).toContainText(nameB, { timeout: 10_000 })

      // State:授权确认后注册以 external 文档位置落库(submit 时授权记录先落库)。
      const after = await readRegistry(page)
      expect(after.projects).toHaveLength(2)
      const rowB = after.projects.find(row => row.displayName === nameB)
      expect(rowB?.docLocationType, 'external 落库').toBe('external')
      expect(rowB?.docLocationPath, '仓外路径(主进程规范化:正斜杠口径)').toBe(extDocs.replaceAll('\\', '/'))

      // Side-effect:授权记录与项目行均写工作台自有库,零项目目录/仓外树写入。
      assertTreesIdentical('B codeRoot across external registration', hashBCode, hashTree(projectB.codeRoot))
      assertTreesIdentical('B external docs tree across external registration', hashBDocs, hashTree(extDocs))
      expect(after.activeProjectId, 'register 不激活(实装链;见头注)——激活指针仍在 A').toBe(projectAId)

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
    expect(existsSync(root)).toBe(false)
  }
})

test('step-3/external-auth-declined [@web-e2e @journey multi-project-management]: without the explicit authorization checkbox the wizard cannot advance past step ②, zero writes', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)

  const setA = generateTaskSet({ seed: 'mpm3dec', taskCount: 6, featureCount: 1, danglingRate: 0, recordRate: 0 })
  const setB = generateTaskSet({ seed: 'mpm3decb', taskCount: 6, featureCount: 1, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-mpm3dec-'))
  const projectA = writeForgeProject(setA, { codeRoot: join(root, 'proj-a-mpm3dec') })
  const extDocs = join(root, 'mpm3dec-ext-docs')
  const projectB = writeForgeProject(setB, { codeRoot: join(root, 'proj-b-mpm3dec'), docsRoot: extDocs })

  const session = createAppSessionFactory({
    bundles: journeyBundles(),
    stageTarballs: [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }],
    rootDir: join(root, 'shell'),
    userDataDir: join(root, 'user-data'),
  })

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      const projectAId = await registerFixtureProject(page, projectA)
      await switchToWorkbench(page)
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()
      const before = await readRegistry(page)

      await page.locator('[data-dsh-forge-add-project]').click()
      await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-dsh-forge-wizard-path-input]').fill(projectB.codeRoot)
      await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-dsh-forge-wizard-next]').click()
      await page.locator('[data-dsh-forge-wizard-doc-external]').click()
      await page.locator('[data-dsh-forge-wizard-external-input]').fill(extDocs)

      // 不勾选授权,直接尝试完成:「下一步」(通往 ③/完成的唯一通道)不可用。
      await expect(page.locator('[data-dsh-forge-wizard-auth-block]'), '授权说明块在(提示需先完成授权)').toBeVisible()
      await expect(page.locator('[data-dsh-forge-wizard-authorize]')).not.toBeChecked()
      await expect(page.locator('[data-dsh-forge-wizard-next]'), '未确认时完成操作不可用').toBeDisabled()
      await expect(page.locator('[data-dsh-forge-wizard-step-summary]'), '无法进入步骤 ③').toHaveCount(0)

      // State:零注册写入、零授权落库通道被阻(授权唯一落库通道在勾选后的 submit)。
      const after = await readRegistry(page)
      expect(after.projects.map(row => row.id)).toEqual(before.projects.map(row => row.id))
      expect(after.activeProjectId).toBe(projectAId)

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
    expect(existsSync(root)).toBe(false)
  }
})

test('step-3/external-authorized-unreadable [@web-e2e @journey multi-project-management]: authorized external path removed before finish is refused at submit, registration refused', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)

  const setA = generateTaskSet({ seed: 'mpm3unr', taskCount: 6, featureCount: 1, danglingRate: 0, recordRate: 0 })
  const setB = generateTaskSet({ seed: 'mpm3unrb', taskCount: 6, featureCount: 1, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-mpm3unr-'))
  const projectA = writeForgeProject(setA, { codeRoot: join(root, 'proj-a-mpm3unr') })
  const extDocs = join(root, 'mpm3unr-ext-docs')
  const projectB = writeForgeProject(setB, { codeRoot: join(root, 'proj-b-mpm3unr'), docsRoot: extDocs })

  const session = createAppSessionFactory({
    bundles: journeyBundles(),
    stageTarballs: [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }],
    rootDir: join(root, 'shell'),
    userDataDir: join(root, 'user-data'),
  })

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      const projectAId = await registerFixtureProject(page, projectA)
      await switchToWorkbench(page)
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()
      const before = await readRegistry(page)

      // 授权勾选 + 探测通过,到达步骤 ③;随后(finish 前)注入不可读:移除仓外树。
      await page.locator('[data-dsh-forge-add-project]').click()
      await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-dsh-forge-wizard-path-input]').fill(projectB.codeRoot)
      await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-dsh-forge-wizard-next]').click()
      await page.locator('[data-dsh-forge-wizard-doc-external]').click()
      await page.locator('[data-dsh-forge-wizard-external-input]').fill(extDocs)
      await page.locator('[data-dsh-forge-wizard-authorize]').check()
      await expect(page.locator('[data-dsh-forge-wizard-next]')).toBeEnabled()
      await page.locator('[data-dsh-forge-wizard-next]').click()
      await expect(page.locator('[data-dsh-forge-wizard-step-summary]')).toBeVisible()
      rmSync(extDocs, { recursive: true, force: true })
      await page.locator('[data-dsh-forge-wizard-finish]').click()

      // submit 序:授权记录先落库(workbench 自有库写入,允许)→ 注册链在
      // 仓外可读性关卡拒绝(FT-037(5),消息含路径与原因)。
      const submitError = page.locator('[data-dsh-forge-wizard-submit-error]')
      await expect(submitError, 'ERR_EXTERNAL_PATH_UNREADABLE:授权后路径不可读拒绝').toBeVisible({ timeout: 15_000 })
      await expect(submitError).toContainText('is not a readable directory')
      await expect(submitError).toContainText(extDocs.replaceAll('\\', '/'))
      await expect(page.locator('[data-dsh-forge-wizard-step-summary]'), '停留向导').toBeVisible()

      // State:注册被拒 —— 无项目行(读数对拍)。
      const after = await readRegistry(page)
      expect(after.projects.map(row => row.id), '零注册写入').toEqual(before.projects.map(row => row.id))
      expect(after.activeProjectId).toBe(projectAId)

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
    expect(existsSync(root)).toBe(false)
  }
})
