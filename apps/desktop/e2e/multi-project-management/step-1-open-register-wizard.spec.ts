// @feature dsh-forge-m2 | @web-e2e | @journey multi-project-management
// Traceability: docs/features/dsh-forge-m2/testing/multi-project-management/contracts/step-1-open-register-wizard.md
//
// Step 1(进入注册向导)的两条 Outcome 腿:
//   success — 从项目切换器点「添加项目」→ workbench/dialog/register-wizard 浮层
//     打开、停在步骤 ①(选代码根目录)、三步结构可见(①检出校验 ②仓外授权
//     ③确认),零注册写入(Floating 打开零落库;FT-053 注册向导属
//     workbench/dialog/* 浮层键族)。注册/激活态断言 = dshForge.workbench
//     getState 读数对拍(FT-030,浏览器侧不自行观测文件系统)。
//   wizard-abandon-guard — 步骤内已有输入后经 Esc 触发关闭 → 放弃确认守卫;
//     取消腿:守卫关闭、向导停留原步骤且输入完整保留;确认放弃腿:向导关闭
//     且零注册(无项目行变化、无激活变更)。两腿均注册表零写入。
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

/** The workbench-owned registry read (the journey's sole activation oracle). */
async function readRegistry(page: Page): Promise<{
  projects: Array<{ id: string; displayName: string; codeRoot: string }>
  activeProjectId: string | null
}> {
  return await page.evaluate(async () => {
    type Row = { id: string; displayName: string; codeRoot: string }
    type Bridge = { getState?: () => Promise<{ projects: Row[]; activeProjectId: string | null }> }
    const bridge = (globalThis as { dshForge?: { workbench?: Bridge } }).dshForge?.workbench
    const state = await bridge?.getState?.()
    return { projects: state?.projects ?? [], activeProjectId: state?.activeProjectId ?? null }
  })
}

test('step-1/success [@web-e2e @journey multi-project-management]: switcher 添加项目 opens the 3-step wizard parked on step ① with zero writes', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)

  const setA = generateTaskSet({ seed: 'mpm1ok', taskCount: 6, featureCount: 1, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-mpm1-'))
  const projectA = writeForgeProject(setA, { codeRoot: join(root, 'proj-a-mpm1') })
  const session = createAppSessionFactory({
    bundles: [
      ...BASE_BUNDLES,
      { name: FORGE_WORKBENCH, source: `tarball:${FORGE_WORKBENCH_STAGED_AT}`, mandatory: true } as const,
    ],
    stageTarballs: [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }],
    rootDir: join(root, 'shell'),
    userDataDir: join(root, 'user-data'),
  })

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      const projectAId = await registerFixtureProject(page, projectA)
      expect(typeof projectAId).toBe('string')

      await switchToWorkbench(page)
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()
      const before = await readRegistry(page)
      expect(before.projects).toHaveLength(1)
      expect(before.activeProjectId).toBe(projectAId)

      // Input face: 从项目切换器点「添加项目」(contract Step 1 User Action)。
      await page.locator('[data-dsh-forge-switcher-trigger]').click()
      await expect(page.locator('[data-dsh-forge-switcher-menu]')).toBeVisible()
      await page.locator('[data-dsh-forge-switcher-add]').click()

      // Output/State:向导浮层打开、停步骤 ①、三步结构可见;零注册写入。
      await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('[data-dsh-forge-wizard-step-path]')).toBeVisible()
      await expect(page.locator('[data-dsh-forge-wizard-path-input]')).toBeVisible()
      await expect(page.locator('[data-dsh-forge-wizard-stepper]')).toBeVisible()
      // 停在 ①:步骤 ②/③ 的 section 不在,空输入下「下一步」不可用。
      await expect(page.locator('[data-dsh-forge-wizard-step-doc]')).toHaveCount(0)
      await expect(page.locator('[data-dsh-forge-wizard-step-summary]')).toHaveCount(0)
      await expect(page.locator('[data-dsh-forge-wizard-next]')).toBeDisabled()

      const after = await readRegistry(page)
      expect(after.projects.map(row => row.id), '打开向导零落库(行集不变)').toEqual(before.projects.map(row => row.id))
      expect(after.activeProjectId, '打开向导不动激活指针').toBe(before.activeProjectId)

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    expect(existsSync(root)).toBe(false)
  }
})

test('step-1/wizard-abandon-guard [@web-e2e @journey multi-project-management]: Esc with input raises the discard guard — cancel keeps input, confirm closes with zero writes', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)

  const setA = generateTaskSet({ seed: 'mpm1g', taskCount: 6, featureCount: 1, danglingRate: 0, recordRate: 0 })
  const setB = generateTaskSet({ seed: 'mpm1gb', taskCount: 6, featureCount: 1, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-mpm1g-'))
  const projectA = writeForgeProject(setA, { codeRoot: join(root, 'proj-a-mpm1g') })
  const projectB = writeForgeProject(setB, { codeRoot: join(root, 'proj-b-mpm1g') })
  const session = createAppSessionFactory({
    bundles: [
      ...BASE_BUNDLES,
      { name: FORGE_WORKBENCH, source: `tarball:${FORGE_WORKBENCH_STAGED_AT}`, mandatory: true } as const,
    ],
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

      await page.locator('[data-dsh-forge-switcher-trigger]').click()
      await page.locator('[data-dsh-forge-switcher-add]').click()
      await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })

      // 未完成的注册上下文:步骤 ① 已有输入(dirty guard 的输入前提)。
      const pathInput = page.locator('[data-dsh-forge-wizard-path-input]')
      await pathInput.fill(projectB.codeRoot)
      await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 10_000 })

      // ---- 取消腿:守卫关闭,向导停留原步骤且已输入内容完整保留 ----------
      await page.keyboard.press('Escape')
      const discard = page.locator('[data-dsh-forge-dialog="register-wizard-discard"]')
      await expect(discard).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-dsh-forge-wizard-discard-cancel]').click()
      await expect(discard).toHaveCount(0)
      await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]'), '取消放弃:向导保持打开').toBeVisible()
      await expect(page.locator('[data-dsh-forge-wizard-step-path]'), '取消放弃:停留原步骤').toBeVisible()
      await expect(pathInput, '取消放弃:已输入内容不丢失').toHaveValue(projectB.codeRoot)
      let mid = await readRegistry(page)
      expect(mid.projects.map(row => row.id), '取消腿注册表零写入').toEqual(before.projects.map(row => row.id))
      expect(mid.activeProjectId).toBe(projectAId)

      // ---- 确认放弃腿:向导关闭,零注册、激活指针不变、概览原状态 ----------
      await page.keyboard.press('Escape')
      await expect(page.locator('[data-dsh-forge-dialog="register-wizard-discard"]')).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-dsh-forge-wizard-discard-confirm]').click()
      await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]'), '确认放弃:向导关闭').toHaveCount(0)
      // 返回概览页原状态:既有卡片仍在、激活不变。
      await expect(page.locator('[data-dsh-forge-project-card]', { hasText: 'proj-a-mpm1g' })).toBeVisible()
      mid = await readRegistry(page)
      expect(mid.projects.map(row => row.id), '放弃腿零注册(无项目行)').toEqual(before.projects.map(row => row.id))
      expect(mid.activeProjectId, '放弃腿无激活变更').toBe(projectAId)

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    expect(existsSync(root)).toBe(false)
  }
})
