// @feature dsh-forge-m2 | @web-e2e | @journey plugin-management
// Journey smoke test (happy path): 健康启动(5 行两级)→ 禁用目标(双确认 →
// 覆盖文件恰含目标名)→ 核心看板不受影响 → 启用(覆盖文件清空)→ 产品清单
// 字节全程不变。步骤间传递状态;每步断言其 Output + Journey Invariants
// (两级模型恒成立;启停仅写覆盖文件;清单只读)。
// Traceability: docs/features/dsh-forge-m2/testing/plugin-management/contracts/step-{1..5}-*.md
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { HELLO_WORLD, PRODUCT_CONFIG, expectRosterContains, sha256File } from '../helpers/plugins.ts'
import { registerFixtureProject, writeForgeProject } from '../fixtures/forge-project.ts'
import { generateTaskSet } from '../fixtures/task-generator.ts'
import { cleanupViewKey, closeAndAwaitExit, createAppSessionFactory, switchToWorkbench, waitForTreeNodes, openBoardPane } from '../tests/m2/helpers/restart-app.ts'
import { expectTwoTierSectionCensus, journeyBundles, journeyStageTarballs, readOverlay } from './helpers.ts'

const SAMPLE_B = '@dsh-forge/plugin-hello-world-sample-b'

// [M4 1.8 e2e 迁移·迁移清单 第②行] 2.10 已按新宿主恢复:入口 = 右栏任务看板 pane
// (openTasksBoard/openBoardPane:概览任务行 seam + registerFixtureProject 的列表推送位);断言本体零删改。
test('plugin-management journey smoke: two-tier census → disable (confirm, overlay written) → board unaffected → enable (overlay cleared) → manifest bytes never move', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)

  const set = generateTaskSet({ seed: 'pmsmoke', taskCount: 8, featureCount: 2, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-pm-smoke-'))
  const project = writeForgeProject(set, { codeRoot: join(root, 'proj-pm-smoke') })
  const userDataDir = join(root, 'user-data')
  const overlayPath = join(userDataDir, 'plugin-runtime.json')
  const productShaBefore = sha256File(PRODUCT_CONFIG)

  const session = createAppSessionFactory({
    bundles: journeyBundles(),
    stageTarballs: journeyStageTarballs(),
    rootDir: join(root, 'shell'),
    userDataDir,
  })

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      await registerFixtureProject(page, project)
      const configBytesBefore = shell.configBytes()

      // ---- Step 1:打开插件管理区 —— 两级清单(3 必备 + 2 第三方)---------
      await switchToWorkbench(page)
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()
      await expectTwoTierSectionCensus(page, [HELLO_WORLD, SAMPLE_B])

      // ---- Step 2→3:发起禁用(双确认含影响说明)→ 确认 → 仅目标退出 ----
      const helloRow = page.locator(`[data-dsh-forge-plugin-row="${HELLO_WORLD}"]`)
      await helloRow.locator('[data-dsh-forge-plugin-action="disable"]').click()
      await expect(page.locator('[data-dsh-forge-plugin-confirm]')).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('[data-dsh-forge-plugin-impact]')).toContainText('注入内容')
      await page.locator('[data-dsh-forge-plugin-confirm]').click()
      await expect(helloRow).toHaveAttribute('data-enabled', 'false', { timeout: 15_000 })
      expect(readOverlay(overlayPath), '覆盖文件恰含目标第三方名').toEqual({ disabled: [HELLO_WORLD] })
      // 注:禁用只写 overlay,boot roster(靴期装配图,会话内静态)的折除
      // 收口在重启 — 会话内 roster 面不可变(产品规则);停用态由上行持有。
      await expectRosterContains(shell, SAMPLE_B)
      await expect(page.locator(`[data-dsh-forge-plugin-row="${SAMPLE_B}"]`), '对照第三方不受影响').toHaveAttribute('data-enabled', 'true')

      // 核心能力不受影响:任务看板照常渲染。
      await openBoardPane(page)
      await expect(page.locator('[data-dsh-forge-task-board]')).toBeVisible()
      await waitForTreeNodes(page, set.facts.taskCount, 60_000)

      // ---- Step 4→5:启用(直接动词)→ 回看:两级复位、清单字节不变 -------
      await switchToWorkbench(page)
      await helloRow.locator('[data-dsh-forge-plugin-action="enable"]').click()
      await expect(helloRow).toHaveAttribute('data-enabled', 'true', { timeout: 15_000 })
      expect(readOverlay(overlayPath), '启用后覆盖文件空集').toEqual({ disabled: [] })
      await expectRosterContains(shell, HELLO_WORLD)
      await expectTwoTierSectionCensus(page, [HELLO_WORLD, SAMPLE_B])

      // Journey Invariant:产品清单对运行时启停只读(跨面字节对拍)。
      expect(sha256File(PRODUCT_CONFIG), '产品清单 sha256 全程不变').toBe(productShaBefore)
      expect(shell.configBytes(), 'journey 配置字节全程不变').toBe(configBytesBefore)

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
