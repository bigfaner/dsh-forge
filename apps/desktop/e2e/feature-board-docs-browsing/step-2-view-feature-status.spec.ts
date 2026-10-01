// @feature dsh-forge-m2 | @web-e2e | @journey feature-board-docs-browsing
// Traceability: docs/features/dsh-forge-m2/testing/feature-board-docs-browsing/contracts/step-2-view-feature-status.md
//
// Step 2 查看 feature 状态机:
//   success —— 依次点击双样板:详情子视图打开(FT-053 子视图寻址,slug 段);
//     状态 stepper 五态全称标签(FT-034 词表透传,[data-dsh-forge-stepper-
//     state="current"] 的 phase 属性 = manifest 原词);completed 样板 stepper
//     全已达(4 reached + 1 current),in-progress 样板 3 reached + 1
//     current + 1 pending;五类 tab 恒在,completed 全启用,in-progress 缺
//     ui 单类 = 禁用不隐藏(FT-054:aria-disabled + 「无此类文档」tooltip 槽)。
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { FORGE_WORKBENCH_STAGED_AT, forgeWorkbenchTarball } from '../helpers/plugins.ts'
import { registerFixtureProject, writeForgeProject } from '../fixtures/forge-project.ts'
import { cleanupViewKey, closeAndAwaitExit, createAppSessionFactory } from '../tests/m2/helpers/restart-app.ts'
import {
  COMPLETED_SAMPLE_SLUG, LIVE_SAMPLE_SLUG, boardTaskSet, openFeaturesTab, workbenchBundles,
} from './helpers.ts'

// [M4 1.8 e2e 迁移·迁移清单 第④行 · M3 阶段资产面板 / Feature 板(workbench/features)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
// P2 2.10 复核:断言锚定已退役宿主方言(旧向导/换台 chrome/提案板与
// Feature 板详情/阶段资产面板内部件),右栏 pane 族未承接 —— 挂起终态与恢复前置 = regression-inventory.md 开放项。
// 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。
test.fixme('step-2/success [@web-e2e @journey feature-board-docs-browsing]: stepper shows each sample\'s manifest status verbatim; five tabs always present, missing kind disabled not hidden (FT-054)', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  const set = boardTaskSet()
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-fb2-'))
  const project = writeForgeProject(set, { codeRoot: join(root, 'proj-fb2') })

  const session = createAppSessionFactory({
    bundles: workbenchBundles(),
    stageTarballs: [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }],
    rootDir: join(root, 'shell'),
    userDataDir: join(root, 'user-data'),
  })
  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      await registerFixtureProject(page, project)
      await openFeaturesTab(page)

      // ---- completed 样板:详情 + stepper(completed = 第 5 相,前 4 已达)。--
      await page.locator(`[data-dsh-forge-feature-card="${COMPLETED_SAMPLE_SLUG}"]`).click()
      const doneDetail = page.locator(`[data-dsh-forge-feature-detail="${COMPLETED_SAMPLE_SLUG}"]`)
      await expect(doneDetail).toBeVisible({ timeout: 15_000 })
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-feature-detail"]'),
        '详情子视图(FT-053 slug 段寻址)').toBeVisible()
      const doneStepper = doneDetail.locator('[data-dsh-forge-feature-stepper]')
      await expect(doneStepper).toBeVisible()
      await expect(doneStepper.locator('[data-dsh-forge-stepper-state="reached"]')).toHaveCount(4)
      const doneCurrent = doneStepper.locator('[data-dsh-forge-stepper-state="current"]')
      await expect(doneCurrent).toHaveCount(1)
      await expect(doneCurrent).toHaveAttribute('data-dsh-forge-stepper-phase', 'completed')
      await expect(doneCurrent).toContainText('completed') // 全称标签 = 词表原词(FT-034)
      await expect(doneStepper.locator('[data-dsh-forge-stepper-state="pending"]')).toHaveCount(0)
      // 详情头部状态 Pill 同词直通。
      await expect(doneDetail.locator('[data-dsh-forge-feature-status="completed"]')).toBeVisible()
      // 五类 tab 恒在且全启用(五类齐备样板)。
      for (const kind of ['manifest', 'prd', 'design', 'ui', 'tasks'] as const) {
        await expect(page.locator(`[data-dsh-forge-feature-doc-tab="${kind}"]`),
          `${kind} tab enabled on the all-kinds sample`).toBeEnabled()
      }

      // ---- 返回列表 → in-progress 样板:stepper 中段 + 缺类禁用矩阵。--------
      await page.locator('[data-dsh-forge-feature-back]').click()
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-features"]')).toBeVisible()
      await page.locator(`[data-dsh-forge-feature-card="${LIVE_SAMPLE_SLUG}"]`).click()
      const liveDetail = page.locator(`[data-dsh-forge-feature-detail="${LIVE_SAMPLE_SLUG}"]`)
      await expect(liveDetail).toBeVisible({ timeout: 15_000 })
      const liveStepper = liveDetail.locator('[data-dsh-forge-feature-stepper]')
      await expect(liveStepper.locator('[data-dsh-forge-stepper-state="reached"]')).toHaveCount(3)
      // M3 UF2(任务 4.4):样板无阶段资产 → 当前节点 = gate-pending 态
      // (warn 描边 + 下方「总结未生成」提示行),非 current;completed 未达。
      const liveGate = liveStepper.locator('[data-dsh-forge-stepper-state="gate-pending"]')
      await expect(liveGate).toHaveCount(1)
      await expect(liveGate).toHaveAttribute('data-dsh-forge-stepper-phase', 'in-progress')
      await expect(liveGate).toContainText('in-progress') // 连字符原词透传
      await expect(liveStepper.locator('[data-dsh-forge-stepper-state="current"]')).toHaveCount(0)
      await expect(liveStepper.locator('[data-dsh-forge-stepper-state="pending"]')).toHaveCount(1)
      // 门提示行在位(UF2 gate-pending 呈现面)。
      await expect(liveDetail.locator('[data-dsh-forge-gate-hint-line]')).toBeVisible()
      // 第六「阶段资产」tab 末位追加(详情 tab 数 5 → 6)。
      await expect(liveDetail.locator('[data-dsh-forge-feature-doc-tab="assets"]')).toBeVisible()
      await expect(liveDetail.locator('[data-dsh-forge-feature-doc-tab="tasks"]~[data-dsh-forge-feature-doc-tab="assets"]'))
        .toHaveCount(1)

      // 缺类(ui)禁用不隐藏;在场类启用。
      const uiTab = page.locator('[data-dsh-forge-feature-doc-tab="ui"]')
      await expect(uiTab, 'ui tab present(恒在不隐藏)').toHaveCount(1)
      await expect(uiTab).toBeDisabled()
      await expect(uiTab).toHaveAttribute('aria-disabled', 'true')
      await expect(uiTab).toHaveAttribute('title', /.+/) // 「无此类文档」tooltip 槽
      for (const kind of ['manifest', 'prd', 'design', 'tasks'] as const) {
        await expect(page.locator(`[data-dsh-forge-feature-doc-tab="${kind}"]`),
          `${kind} tab enabled on the ui-less sample`).toBeEnabled()
      }

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
