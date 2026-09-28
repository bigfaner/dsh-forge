// @feature dsh-forge-m2 | @web-e2e | @journey multi-project-management
// Journey smoke test (happy path): 向导进入(含放弃守卫取消腿)→ 仓内注册 B →
// 显式激活 B → 切回 A(完整数据切换)→ 移除 B(确认 + 树哈希对拍)→ 重注册 B
// (槽位释放)。步骤间传递状态;每步断言其 Output + Journey Invariants。
// Traceability: docs/features/dsh-forge-m2/testing/multi-project-management/contracts/step-{1..5}-*.md
//
// Invariants 贯穿断言:单激活(每步 getState 读数恰一个激活指针且指向预期行);
// 移除不改动项目文件(文件树快照对拍);注册表读数一律走 getState(浏览器侧
// 不自行观测文件系统,FT-030)。实装链勘误(divergence note):register 动词
// 不激活 —— 注册后卡片 data-active="false" + toast,显式 activate 完成单激活
// 事务(WorkbenchShell.tsx;UF1「注册成功 → 激活」为设计意图源,差异记录)。
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
import { cleanupViewKey, closeAndAwaitExit, createAppSessionFactory, switchToWorkbench, waitForTreeNodes } from '../tests/m2/helpers/restart-app.ts'
import { assertTreesIdentical, hashTree } from '../tests/m2/helpers/tree-hash.ts'

/** The workbench-owned registry read (the journey's sole registry oracle, FT-030). */
async function readRegistry(page: Page): Promise<{ rows: string[]; activeProjectId: string | null }> {
  return await page.evaluate(async () => {
    type Bridge = { getState?: () => Promise<{ projects: Array<{ id: string }>; activeProjectId: string | null }> }
    const bridge = (globalThis as { dshForge?: { workbench?: Bridge } }).dshForge?.workbench
    const state = await bridge?.getState?.()
    return { rows: (state?.projects ?? []).map(row => row.id), activeProjectId: state?.activeProjectId ?? null }
  })
}

/** The card whose registered displayName is `name` (codeRoot 目录名 default). */
const cardOf = (page: Page, name: string) => page.locator('[data-dsh-forge-project-card]', { hasText: name }).first()

// [M4 1.8 e2e 迁移·迁移清单 第①行 · 全局导航 chrome(ProjectSwitcher / TopBar / TabBar)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
// P2 右栏 pane / 概览子 tab(2.1–2.4)落座后按新宿主恢复,2.10 全量复跑收口。
// 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。
test.fixme('multi-project-management journey smoke: wizard → register B (in_repo) → activate → switch back to A → remove B → re-register', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)

  const setA = generateTaskSet({ seed: 'mpmsmoke', taskCount: 12, featureCount: 2, danglingRate: 0, recordRate: 0 })
  const setB = generateTaskSet({ seed: 'mpmsmokeb', taskCount: 10, featureCount: 2, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-mpm-smoke-'))
  const projectA = writeForgeProject(setA, { codeRoot: join(root, 'proj-a-smoke') })
  const projectB = writeForgeProject(setB, { codeRoot: join(root, 'proj-b-smoke') })
  const nameA = 'proj-a-smoke'
  const nameB = 'proj-b-smoke'
  const featureA1 = setA.features[0]
  if (featureA1 === undefined) throw new Error('fixture set A missing features')

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
      const hashA = hashTree(projectA.codeRoot)
      const hashB = hashTree(projectB.codeRoot)

      // ---- Step 1:进入注册向导(A 已注册并激活)----------------------------
      const projectAId = await registerFixtureProject(page, projectA)
      await switchToWorkbench(page)
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()
      await page.locator('[data-dsh-forge-switcher-trigger]').click()
      await page.locator('[data-dsh-forge-switcher-add]').click()
      await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('[data-dsh-forge-wizard-step-path]')).toBeVisible()
      await expect(page.locator('[data-dsh-forge-wizard-stepper]')).toBeVisible()
      expect((await readRegistry(page)).rows, '打开向导零落库').toEqual([projectAId])

      // (守卫取消腿:已有输入 → Esc → 取消放弃 → 输入保留,向导不丢上下文。)
      await page.locator('[data-dsh-forge-wizard-path-input]').fill(projectB.codeRoot)
      await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 10_000 })
      await page.keyboard.press('Escape')
      await expect(page.locator('[data-dsh-forge-dialog="register-wizard-discard"]')).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-dsh-forge-wizard-discard-cancel]').click()
      await expect(page.locator('[data-dsh-forge-wizard-path-input]')).toHaveValue(projectB.codeRoot)
      expect((await readRegistry(page)).rows, '守卫腿零落库').toEqual([projectAId])

      // ---- Step 2→3:检出通过 → 默认仓内 → 完成注册 B ----------------------
      await page.locator('[data-dsh-forge-wizard-next]').click()
      await expect(page.locator('[data-dsh-forge-wizard-step-doc]')).toBeVisible()
      // M3 翻转(1.7/G7):仓外应用管理路径为默认(预填 + 未授权则下一步禁用)。
      await expect(page.locator('[data-dsh-forge-wizard-doc-external]'), '默认仓外文档位置(应用管理路径)').toBeChecked()
      await expect(page.locator('[data-dsh-forge-wizard-external-default]')).toBeVisible()
      await page.locator('[data-dsh-forge-wizard-doc-in-repo]').click() // 本腿选回仓内注册
      await page.locator('[data-dsh-forge-wizard-next]').click()
      await expect(page.locator('[data-dsh-forge-wizard-step-summary]')).toBeVisible()
      await expect(page.locator('[data-dsh-forge-wizard-name-input]')).toHaveAttribute('placeholder', nameB)
      await page.locator('[data-dsh-forge-wizard-finish]').click()
      await expect(cardOf(page, nameB)).toBeVisible({ timeout: 30_000 })
      await expect(cardOf(page, nameB)).toHaveAttribute('data-active', 'false')
      await expect(page.locator('[data-dsh-forge-shell-toast]')).toContainText(nameB, { timeout: 10_000 })
      let registry = await readRegistry(page)
      expect(registry.rows).toHaveLength(2)
      expect(registry.activeProjectId, '单激活:register 不激活(实装链,见头注),指针仍在 A').toBe(projectAId)

      // ---- Step 3(显式激活)/ Step 4(切回 A 的前半):激活 B → 切回 A ----
      await cardOf(page, nameB).locator('[data-dsh-forge-card-action="activate"]').click()
      await expect(cardOf(page, nameB)).toHaveAttribute('data-active', 'true', { timeout: 10_000 })
      await expect(cardOf(page, nameA)).toHaveAttribute('data-active', 'false')
      await expect(page.locator('[data-dsh-forge-switcher-trigger]')).toContainText(nameB, { timeout: 10_000 })
      registry = await readRegistry(page)
      expect(registry.activeProjectId).not.toBe(projectAId)
      const projectBId = registry.rows.find(id => id !== projectAId) ?? ''
      expect(registry.activeProjectId, '单激活:指针指向 B').toBe(projectBId)

      // Step 4:切换回 A —— 三页数据完整切换(任务节点全集为判)。
      await page.locator('[data-dsh-forge-switcher-trigger]').click()
      await page.locator('[data-dsh-forge-switcher-menu] [data-dsh-forge-switcher-item]', { hasText: nameA }).click()
      await expect(page.locator('[data-dsh-forge-switcher-trigger]')).toContainText(nameA, { timeout: 10_000 })
      await page.getByRole('tab', { name: /^任务$|^Tasks$/ }).click()
      await waitForTreeNodes(page, setA.facts.taskCount, 60_000)
      await expect(page.locator('[data-dsh-forge-task-detail]'), '切换后无跨项目 dock 残留').toHaveCount(0)
      await expect(page.locator('[data-dsh-forge-badge="session-live"]')).toHaveCount(0)
      registry = await readRegistry(page)
      expect(registry.activeProjectId, '切换只写激活指针,单激活恒成立').toBe(projectAId)

      // ---- Step 5:移除非激活的 B(确认 + 文件树对拍)→ 重注册(槽位释放)--
      await page.getByRole('tab', { name: /^概览$|^Overview$/ }).click()
      await cardOf(page, nameB).locator('[data-dsh-forge-card-action="remove"]').click()
      await expect(page.locator('[data-dsh-forge-remove-confirm]')).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('[data-dsh-forge-remove-promise]'), '仅删除注册信息承诺文案').not.toHaveText('')
      await page.locator('[data-dsh-forge-remove-confirm]').click()
      await expect(cardOf(page, nameB)).toHaveCount(0, { timeout: 10_000 })
      registry = await readRegistry(page)
      expect(registry.rows, '移除只删工作台注册信息(行集) ').toEqual([projectAId])
      expect(registry.activeProjectId, '非激活移除不动激活指针').toBe(projectAId)
      // Journey Invariant:移除不改动项目文件(哈希对拍,不以「没报错」为据)。
      assertTreesIdentical('A codeRoot across the smoke journey', hashA, hashTree(projectA.codeRoot))
      assertTreesIdentical('B codeRoot across remove + re-register', hashB, hashTree(projectB.codeRoot))

      await page.locator('[data-dsh-forge-add-project]').click()
      await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-dsh-forge-wizard-path-input]').fill(projectB.codeRoot)
      await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-dsh-forge-wizard-next]').click()
      await page.locator('[data-dsh-forge-wizard-next]').click()
      await page.locator('[data-dsh-forge-wizard-finish]').click()
      await expect(cardOf(page, nameB), '同一 code_root 重注册成功(FT-036 槽位释放)').toBeVisible({ timeout: 30_000 })
      registry = await readRegistry(page)
      expect(registry.rows).toHaveLength(2)
      expect(registry.activeProjectId, '重注册不激活,单激活指针不变').toBe(projectAId)
      assertTreesIdentical('B codeRoot after re-register', hashB, hashTree(projectB.codeRoot))

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
