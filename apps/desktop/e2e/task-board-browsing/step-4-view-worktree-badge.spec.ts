// @feature dsh-forge-m2 | @web-e2e | @journey task-board-browsing
// Traceability: docs/features/dsh-forge-m2/testing/task-board-browsing/contracts/step-4-view-worktree-badge.md
//
// Step 4「查看 worktree 标识」Outcome success —— 方言注记(代码现实,Hard
// Rule 不虚构):契约的 fixture 前置要求「真实 git worktree + 执行痕迹写入 +
// 非空执行分支名」,但 parse-task.ts 对每个任务硬编码 branch = null /
// worktree = false(任务文件不携带这些字段,缺失即空,不推断),索引器完全
// 无视 git —— 今天不存在任何 fixture 通道能产出 worktree = true 或非空
// branch(不建 git worktree fixture)。本腿按 code-faithful 形态断言(与
// task-board step-2 分支列口径互补,并覆盖契约 eval 携带的「树/分组视图缺
// worktree 徽标否定断言」盲区):
//   - 三视图(依赖树/状态分组/列表)全 DOM 零 worktree 徽标 —— 不存在就
//     不打标,不虚构;
//   - 桥面每个任务 worktree === false / branch === null(FT-032 如实投影);
//   - 任务详情侧板:无 worktree 徽标,summary.worktree/branch 如实为空;
//   - worktree 筛选开关初始未按下(aria-pressed false)。
// 契约的「worktree 标识可见」腿在当前方言下不可达,记为任务注记。
import { expect, test } from '@playwright/test'
import { generateTaskSet } from '../fixtures/task-generator.ts'
import { registerFixtureProject } from '../fixtures/forge-project.ts'
import { cleanupViewKey, closeAndAwaitExit, openTasksBoard } from '../tests/m2/helpers/restart-app.ts'
import {
  BOARD_SEED, disposeBoardJourney, groundOf, readBoard, setUpBoardJourney,
} from './helpers.ts'

test('step-4/success [@web-e2e @journey task-board-browsing]: code-faithful form — zero worktree badge in all three views, bridge projects the dialect (branch 恒 null / worktree 恒 false)', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)

  const set = generateTaskSet({ seed: BOARD_SEED, taskCount: 12, featureCount: 2, danglingRate: 0.15, recordRate: 0.4 })
  const setup = setUpBoardJourney(set)
  const { project, session } = setup
  const { ground } = groundOf(set)

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      const projectId = await registerFixtureProject(page, project)
      await openTasksBoard(page, set.facts.taskCount)

      // 桥面:每个任务 worktree = false / branch = null(FT-032 如实投影)。
      const board = await readBoard(page, projectId)
      const fabricated = board.tasks.filter(row => row.branch !== null || row.worktree !== false)
      expect(fabricated, '方言恒 null/false —— 任何值都是虚构').toEqual([])

      // 视图 A(依赖树):零 worktree 徽标。
      expect(await page.locator('[data-dsh-forge-badge="worktree"]').count(), '视图 A 零 worktree 徽标(不虚构)').toBe(0)

      // 视图 B(状态分组):零 worktree 徽标(否定断言 —— 契约 eval 盲区)。
      await page.locator('[data-dsh-forge-board-view="grouped"]').click()
      await expect(page.locator('[data-dsh-forge-board-panel="grouped"]')).toBeVisible({ timeout: 30_000 })
      expect(await page.locator('[data-dsh-forge-badge="worktree"]').count(), '视图 B 零 worktree 徽标').toBe(0)

      // 视图 C(列表):零 worktree 徽标 + worktree 列恒空占位。
      await page.locator('[data-dsh-forge-board-view="list"]').click()
      await expect(page.locator('[data-dsh-forge-board-panel="list"]')).toBeVisible({ timeout: 30_000 })
      expect(await page.locator('[data-dsh-forge-badge="worktree"]').count(), '视图 C 零 worktree 徽标').toBe(0)
      const worktreeCells = await page.evaluate(() => Array.from(document.querySelectorAll('[data-dsh-forge-task-row]'))
        .map(row => row.children[5]?.textContent ?? ''))
      expect(worktreeCells.filter(cell => cell !== '—'), 'worktree 列恒「—」空占位').toEqual([])

      // 任务详情侧板:无 worktree 徽标;summary 如实为空(单任务深读)。
      const subject = ground.find(task => task.dependencies.length > 0)
      if (subject === undefined) throw new Error('fixture carries no task with dependencies')
      await page.locator(`[data-dsh-forge-task-row="${subject.key}"]`).click()
      const dock = page.locator(`[data-dsh-forge-task-detail="${subject.key}"]`)
      await expect(dock).toBeVisible({ timeout: 15_000 })
      await expect(dock.locator('[data-dsh-forge-badge="worktree"]'), '详情内无 worktree 标识').toHaveCount(0)
      const detail = await page.evaluate(async (input: { id: string; key: string }) => {
        const bridge = (globalThis as {
          dshForge?: {
            workbench?: {
              getTaskDetail?: (id: string, key: string) => Promise<{
                summary: { branch: string | null; worktree: boolean }
              }>
            }
          }
        }).dshForge?.workbench
        return await bridge?.getTaskDetail?.(input.id, input.key)
      }, { id: projectId, key: subject.key })
      expect(detail?.summary.branch, '详情 summary.branch 如实为 null').toBeNull()
      expect(detail?.summary.worktree, '详情 summary.worktree 如实为 false').toBe(false)

      // worktree 筛选开关:初始未按下(数据面无 worktrace 可筛)。
      await expect(page.locator('[data-dsh-forge-tasks-worktree]')).toHaveAttribute('aria-pressed', 'false')

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    disposeBoardJourney(setup)
  }
})
