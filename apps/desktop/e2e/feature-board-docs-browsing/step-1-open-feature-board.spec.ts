// @feature dsh-forge-m2 | @web-e2e | @journey feature-board-docs-browsing
// Traceability: docs/features/dsh-forge-m2/testing/feature-board-docs-browsing/contracts/step-1-open-feature-board.md
//
// Step 1 进入 feature 看板:
//   success —— 双样板(completed 五类齐备/全完成 vs in-progress 缺 ui 类/
//     部分完成)。断言双侧(eval 残差「徽标二分未锚定」的裁决式解法——断
//     BOTH):
//     ① 每张卡携带 [data-dsh-forge-feature-status={status}] 状态 Pill
//        (FT-034 manifest 词表透传,原型对每卡都渲染);
//     ② completed-only 完成徽标二分([data-dsh-forge-feature-complete] 属
//        性 + [data-dsh-forge-feature-completed] 徽标仅在全完成样板上);
//     ③ 计数全满/部分:progressbar aria-valuenow/valuemax/valuetext(sc4
//        先例),且与 fixture 文件直读的任务状态分布对拍。
//   empty-state —— 零 feature 项目(.forge 在 → FT-038 检出通过;docs/
//     features 目录显式建空,扫描干净):[data-dsh-forge-feature-empty] 空
//     态引导,非错误。
//   loading-state —— 就绪门控:feature tab 点击前装 MutationObserver
//     (观察点先于就绪信号注入),skeleton 出现过、empty/error 未出现;
//     就绪后转正常列表。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { FORGE_WORKBENCH_STAGED_AT, forgeWorkbenchTarball } from '../helpers/plugins.ts'
import { registerFixtureProject, writeForgeProject } from '../fixtures/forge-project.ts'
import type { WrittenForgeProject } from '../fixtures/forge-project.ts'
import { cleanupViewKey, closeAndAwaitExit, createAppSessionFactory } from '../tests/m2/helpers/restart-app.ts'
import {
  COMPLETED_SAMPLE_SLUG, LIVE_SAMPLE_SLUG, armFeatureLoadObserver, boardTaskSet, emptyTaskSet,
  openFeaturesTab, readFeatureLoadTrace, workbenchBundles,
} from './helpers.ts'

/** fixture 直读:某 feature 名下任务状态分布(计数对拍锚点,测试进程口径)。 */
function fileTaskCounts(project: WrittenForgeProject, slug: string): { total: number; completed: number } {
  const indexPath = project.indexPaths.find(row => row.slug === slug)?.path ?? ''
  const parsed = JSON.parse(readFileSync(indexPath, 'utf8')) as { tasks: Record<string, { status: string }> }
  const statuses = Object.values(parsed.tasks).map(entry => entry.status)
  return { total: statuses.length, completed: statuses.filter(status => status === 'completed').length }
}

// [M4 1.8 e2e 迁移·迁移清单 第④行 · M3 阶段资产面板 / Feature 板(workbench/features)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
// P2 2.10 复核:断言锚定已退役宿主方言(旧向导/换台 chrome/提案板与
// Feature 板详情/阶段资产面板内部件),右栏 pane 族未承接 —— 挂起终态与恢复前置 = regression-inventory.md 开放项。
// 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。
test.fixme('step-1/success [@web-e2e @journey feature-board-docs-browsing]: dual-sample board renders status Pill on every card + completed-only badge + full/partial counts matching the fixture files', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  const set = boardTaskSet()
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-fb1-'))
  const project = writeForgeProject(set, { codeRoot: join(root, 'proj-fb1') })
  // 模型自检(断言基数字面;计数对拍锚点)。
  expect(fileTaskCounts(project, COMPLETED_SAMPLE_SLUG)).toEqual({ total: 4, completed: 4 })
  expect(fileTaskCounts(project, LIVE_SAMPLE_SLUG)).toEqual({ total: 3, completed: 1 })

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

      const doneCard = page.locator(`[data-dsh-forge-feature-card="${COMPLETED_SAMPLE_SLUG}"]`)
      const liveCard = page.locator(`[data-dsh-forge-feature-card="${LIVE_SAMPLE_SLUG}"]`)
      await expect(doneCard, 'completed 样板卡').toBeVisible({ timeout: 30_000 })
      await expect(liveCard, 'in-progress 样板卡').toBeVisible({ timeout: 30_000 })

      // ① 状态 Pill:每卡携带 manifest 原词(FT-034 透传,含 in-progress 连字符)。
      await expect(doneCard.locator('[data-dsh-forge-feature-status="completed"]')).toBeVisible()
      await expect(liveCard.locator('[data-dsh-forge-feature-status="in-progress"]')).toBeVisible()

      // ② completed-only 徽标二分(sc4 口径:attr + 徽标节点)。
      await expect(doneCard).toHaveAttribute('data-dsh-forge-feature-complete', '')
      await expect(doneCard.locator('[data-dsh-forge-feature-completed]')).toBeVisible()
      await expect(liveCard).not.toHaveAttribute('data-dsh-forge-feature-complete', '')
      await expect(liveCard.locator('[data-dsh-forge-feature-completed]')).toHaveCount(0)

      // ③ 计数:progressbar 值域 + valuetext,与 fixture 文件直读分布对拍。
      const doneCounts = fileTaskCounts(project, COMPLETED_SAMPLE_SLUG)
      await expect(doneCard.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(doneCounts.completed))
      await expect(doneCard.getByRole('progressbar')).toHaveAttribute('aria-valuemax', String(doneCounts.total))
      await expect(doneCard.getByRole('progressbar')).toHaveAttribute('aria-valuetext', new RegExp(`${String(doneCounts.completed)}\\s*/\\s*${String(doneCounts.total)}`))
      const liveCounts = fileTaskCounts(project, LIVE_SAMPLE_SLUG)
      await expect(liveCard.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(liveCounts.completed))
      await expect(liveCard.getByRole('progressbar')).toHaveAttribute('aria-valuemax', String(liveCounts.total))
      await expect(liveCard.getByRole('progressbar')).toHaveAttribute('aria-valuetext', new RegExp(`${String(liveCounts.completed)}\\s*/\\s*${String(liveCounts.total)}`))

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

test.fixme('step-1/empty-state [@web-e2e @journey feature-board-docs-browsing]: zero-feature project shows the 无 feature guidance, not an error', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  const set = emptyTaskSet()
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-fb1e-'))
  const project = writeForgeProject(set, { codeRoot: join(root, 'proj-fb1-empty') })
  // FT-038:.forge 目录在 → forge 检出通过;docs/features 显式建空(干净空扫)。
  expect(existsSync(join(project.codeRoot, '.forge'))).toBe(true)
  mkdirSync(join(project.codeRoot, 'docs', 'features'), { recursive: true })

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

      await expect(page.locator('[data-dsh-forge-feature-empty]'), '空态引导卡(无 feature)').toBeVisible({ timeout: 30_000 })
      await expect(page.locator('[data-dsh-forge-feature-error]'), '空态 ≠ 错误态').toHaveCount(0)
      await expect(page.locator('[data-dsh-forge-feature-card]'), '零 feature = 零卡').toHaveCount(0)

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

test.fixme('step-1/loading-state [@web-e2e @journey feature-board-docs-browsing]: skeleton precedes the populated list and no empty/error leaks during the unreadiness window', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  const set = boardTaskSet()
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-fb1l-'))
  const project = writeForgeProject(set, { codeRoot: join(root, 'proj-fb1-loading') })

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
      // 就绪门控:观察点先于数据就绪信号注入(feature tab 点击 = 挂载 +
      // 首载触发),loading 断言不依赖竞态时序。
      await armFeatureLoadObserver(page)
      await openFeaturesTab(page)

      // 就绪信号为界:卡片出现 = 就绪;trace 只记就绪前窗口。
      await expect(page.locator(`[data-dsh-forge-feature-card="${COMPLETED_SAMPLE_SLUG}"]`),
        '就绪后转入正常列表').toBeVisible({ timeout: 30_000 })
      const trace = await readFeatureLoadTrace(page)
      expect(trace.skeleton, '未就绪期间先行显示 loading 骨架').toBe(true)
      expect(trace.empty, '未就绪期间不误判为空态').toBe(false)
      expect(trace.error, '未就绪期间不误判为错误态').toBe(false)

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
