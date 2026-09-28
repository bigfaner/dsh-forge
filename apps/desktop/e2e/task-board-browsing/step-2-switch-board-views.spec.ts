// @feature dsh-forge-m2 | @web-e2e | @journey task-board-browsing
// Traceability: docs/features/dsh-forge-m2/testing/task-board-browsing/contracts/step-2-switch-board-views.md
//
// Step 2「切换状态分组/列表视图」Outcome success:
//   - segmented 三视图控件切换:状态分组视图按 forge 7 态(FT-033)分组,
//     列计数与模型逐列相等;列表视图含执行分支名列 —— 方言注记(Hard Rule
//     不虚构):parse-task 对每个任务硬编码 branch = null / worktree = false,
//     索引器无视 git,今天不存在 fixture 通道能产出「非空执行分支名」(不
//     建 git worktree fixture)。code-faithful 形态 = 每行分支列渲染空占位
//     「—」(FT-032:branch 可空,不虚构 forge 未写的字段);契约的「带执行
//     分支的任务显示分支名」腿在当前方言下不可达,记为任务注记。
//   - 任务集合一致:两视图可见键集合与模型全集逐一对应(集合等价;排序键
//     未定约,不作全序断言);同一快照的不同投影 —— 视图切换前后桥面
//     getTaskBoard 读数全等(数据不变)。
//   - Hard Rule(代码事实):视图 A/B/C 切换不重置筛选 —— 设一个搜索筛选后
//     切换视图,搜索词与可见子集保持。
import { expect, test } from '@playwright/test'
import { generateTaskSet } from '../fixtures/task-generator.ts'
import { TASK_STATUSES } from '../fixtures/task-generator.ts'
import { registerFixtureProject } from '../fixtures/forge-project.ts'
import { cleanupViewKey, closeAndAwaitExit, openTasksBoard } from '../tests/m2/helpers/restart-app.ts'
import {
  BOARD_SEED, diffSamples, disposeBoardJourney, groundOf, readBoard,
  setUpBoardJourney,
} from './helpers.ts'

// [M4 1.8 e2e 迁移·迁移清单 第②行 · M2 看板(workbench/tasks 主视图)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
// P2 右栏 pane / 概览子 tab(2.1–2.4)落座后按新宿主恢复,2.10 全量复跑收口。
// 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。
test.fixme('step-2/success [@web-e2e @journey task-board-browsing]: grouped 7-state columns + list view fields vs the model; switch keeps filter, snapshot unchanged', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)

  const set = generateTaskSet({ seed: BOARD_SEED, taskCount: 12, featureCount: 2, danglingRate: 0.15, recordRate: 0.4 })
  const setup = setUpBoardJourney(set)
  const { project, session } = setup
  const { ground, byKey } = groundOf(set)
  const allKeys = [...byKey.keys()]

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      const projectId = await registerFixtureProject(page, project)
      await openTasksBoard(page, set.facts.taskCount)
      const boardBefore = await readBoard(page, projectId)

      // ---- 状态分组视图:7 态列 + 逐列计数(FT-033)-------------------------
      await page.locator('[data-dsh-forge-board-view="grouped"]').click()
      await expect(page.locator('[data-dsh-forge-board-panel="grouped"]')).toBeVisible({ timeout: 30_000 })
      const columns = await page.evaluate(() => Array.from(document.querySelectorAll('[data-dsh-forge-status-column]')).map(column => ({
        status: column.getAttribute('data-dsh-forge-status-column') ?? '',
        count: column.querySelector('[data-dsh-forge-status-count]')?.textContent ?? '',
        cardKeys: Array.from(column.querySelectorAll('[data-dsh-forge-task-card]')).map(card => card.getAttribute('data-dsh-forge-task-card') ?? ''),
      })))
      expect(columns.map(column => column.status), '分组词表 = forge 7 态(canonical 序)').toEqual([...TASK_STATUSES])
      const groupedKeys: string[] = []
      const countMismatches: string[] = []
      for (const column of columns) {
        const expected = ground.filter(task => task.status === column.status).map(task => task.key)
        if (column.count !== String(expected.length)) countMismatches.push(`${column.status}: ${column.count} != ${String(expected.length)}`)
        groupedKeys.push(...column.cardKeys)
      }
      expect(countMismatches, '逐列计数与模型相等').toEqual([])
      expect(diffSamples(allKeys, groupedKeys), '分组视图任务集合与 forge 数据一致(集合等价)').toEqual([])

      // ---- 列表视图:执行分支名列(方言:恒空占位「—」)+ 行字段全集 ------
      await page.locator('[data-dsh-forge-board-view="list"]').click()
      await expect(page.locator('[data-dsh-forge-board-panel="list"]')).toBeVisible({ timeout: 30_000 })
      const rows = await page.evaluate(() => Array.from(document.querySelectorAll('[data-dsh-forge-task-row]')).map(row => ({
        key: row.getAttribute('data-dsh-forge-task-row') ?? '',
        branch: row.children[4]?.textContent ?? '',
        worktree: row.children[5]?.textContent ?? '',
      })))
      expect(diffSamples(allKeys, rows.map(row => row.key)), '列表视图任务集合与 forge 数据一致(集合等价)').toEqual([])
      const nonPlaceholder = rows.filter(row => row.branch !== '—' || row.worktree !== '—')
      expect(nonPlaceholder, '分支列恒空占位「—」(不虚构 forge 未写的字段,FT-032;见头注)').toEqual([])

      // ---- 同一快照的不同投影:切换前后桥面读数全等 ------------------------
      const boardAfter = await readBoard(page, projectId)
      expect(
        boardAfter.tasks.map(task => `${task.key}:${task.status}`),
        '视图切换不改变任务数据(同一快照的不同投影)',
      ).toEqual(boardBefore.tasks.map(task => `${task.key}:${task.status}`))

      // ---- Hard Rule:视图切换不重置筛选(代码事实的行为断言)-------------
      const searchNeedle = ground[0]?.key ?? ''
      const search = page.locator('[data-dsh-forge-tasks-search]')
      await search.fill(searchNeedle)
      await expect(page.locator('[data-dsh-forge-task-row]')).toHaveCount(1, { timeout: 10_000 })
      await page.locator('[data-dsh-forge-board-view="grouped"]').click()
      await expect(page.locator('[data-dsh-forge-board-panel="grouped"]')).toBeVisible({ timeout: 30_000 })
      await expect(search, '搜索词跨视图保持(切换不重置筛选)').toHaveValue(searchNeedle)
      expect(await page.locator('[data-dsh-forge-task-card]').count(), '筛选子集跨视图保持').toBe(1)
      await page.locator('[data-dsh-forge-board-view="tree"]').click()
      await expect(page.locator('[data-dsh-forge-board-panel="tree"]')).toBeVisible({ timeout: 30_000 })
      await expect(search).toHaveValue(searchNeedle)
      expect(await page.locator('[data-dsh-forge-node-card]').count(), '树视图同一筛选子集').toBe(1)

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    disposeBoardJourney(setup)
  }
})
