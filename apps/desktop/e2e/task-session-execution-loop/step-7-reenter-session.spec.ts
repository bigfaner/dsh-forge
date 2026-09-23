// @feature dsh-forge-m2 | @web-e2e | @journey task-session-execution-loop
// Traceability: docs/features/dsh-forge-m2/testing/task-session-execution-loop/contracts/step-7-reenter-session.md
//
// Step 7「从挂接条目重入会话」Outcome success —— 方言注记(代码现实):
// 契约的输入面是挂接条目上的「进入会话」按钮,其渲染条件是 LinkHistory 的
// onEnterSession seam(TaskDetailPanel 透传)—— 当前装配(TaskBoardPage,
// 已核对 src 与 built lib)不传该 prop,故 [data-dsh-forge-detail-enter]
// 今天不挂载(缝在、按钮不渲染;不虚构交互面)。本腿按 code-faithful 形态
// 断言:
//   - 挂接条目可见且 active(携带会话标识/时间),「进入会话」控件不渲染
//     (count 0 —— 与 seam 未接线的代码事实一致,记为任务注记);
//   - 壳级视图切换的原样可观测面 = 发起成功的跳转(UF5 onLaunched →
//     uiWorkspace.openSession,keyed main slot 卸载工作台 shell);从会话
//     视图经上游侧栏「工作台」行返回(switchToWorkbench)= 契约的「从会话
//     界面返回」输入,断言视图键回到 workbench/tasks 且看板/选中任务态
//     (侧板停留在原任务)恢复;
//   - 重入/往返不产生新的挂接行(既有 active 挂接原样使用;links 恒 1 行,
//     会话标识不变,徽标不变)。
import { expect, test } from '@playwright/test'
import { registerFixtureProject } from '../fixtures/forge-project.ts'
import { cleanupViewKey, closeAndAwaitExit, openTasksBoard, switchToWorkbench } from '../tests/m2/helpers/restart-app.ts'
import {
  disposeJourney, launchOneClick, pickTaskKey, pollChannelJournal, readTaskDetail, setUpJourney,
} from './helpers.ts'

test('step-7/success [@web-e2e @journey task-session-execution-loop]: session-view round trip restores workbench/tasks + dock selection; the active link is reused, no new row', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)

  const setup = setUpJourney()
  const { set, channel, project, session } = setup
  const KEY = pickTaskKey(set, task => task.status === 'pending' && task.record === null && task.dependencies.length === 0, '重入对象')

  try {
    const shell = await session.boot()
    let sessionId = ''
    try {
      const { page } = shell
      const projectId = await registerFixtureProject(page, project)
      await openTasksBoard(page, set.facts.taskCount)

      // 行激活打开侧板(任务导航)—— 使「返回后选中任务态保持」可断言。
      await page.locator(`[data-dsh-forge-node-card="${KEY}"]`).click()
      await expect(page.locator(`[data-dsh-forge-task-detail="${KEY}"]`)).toBeVisible({ timeout: 15_000 })

      // 建立进行中(active)挂接并发起跳转(UF5 成功链,侧板主入口)。
      await launchOneClick(page, `[data-dsh-forge-task-detail="${KEY}"] [data-dsh-forge-launch-trigger][data-mount="panel-primary"]`)
      const created = await pollChannelJournal(channel, entry => entry.kind === 'create', 'the session create')
      sessionId = created.sessionId ?? ''
      expect(sessionId).not.toBe('')
      expect(await page.locator('[data-dsh-forge-shell]').count(), '发起成功 = 壳级切换至会话视图(view key → session)').toBe(0)

      // ---- 从会话界面返回(上游侧栏「工作台」行)----------------------------
      await switchToWorkbench(page)
      await expect(
        page.locator('[data-dsh-forge-view="dsh-forge-view-tasks"]'),
        '返回后视图键回到 workbench/tasks',
      ).toBeVisible({ timeout: 15_000 })
      await expect(
        page.locator(`[data-dsh-forge-node-card="${KEY}"]`),
        '看板恢复渲染(先前选中任务节点在列)',
      ).toBeVisible({ timeout: 15_000 })
      await expect(
        page.locator(`[data-dsh-forge-task-detail="${KEY}"]`),
        '选中任务态保持 —— 侧板停留在原任务(工作台状态会话期保持)',
      ).toBeVisible({ timeout: 15_000 })

      // ---- 挂接条目:active、可回溯;「进入会话」缝未接线(见头注)------
      const linkRow = page.locator(`[data-dsh-forge-detail-link="${sessionId}"]`)
      await expect(linkRow, '挂接条目可见且 active').toHaveAttribute('data-link-status', 'active', { timeout: 15_000 })
      await expect(linkRow.locator('time'), '条目携带时间').toBeVisible()
      expect(
        await page.locator('[data-dsh-forge-detail-enter]').count(),
        '「进入会话」按钮不渲染(当前装配不接 onEnterSession seam —— code-faithful,记为任务注记)',
      ).toBe(0)

      // 重入/往返不产生新的挂接行:恒 1 行、会话标识不变。
      expect(await page.locator('[data-dsh-forge-detail-link]').count(), '既有 active 挂接原样使用(零新行)').toBe(1)
      const detail = await readTaskDetail(page, projectId, KEY)
      expect(detail.links.length, '挂接索引读数同为 1 行').toBe(1)
      expect(detail.links[0]?.sessionId).toBe(sessionId)
      expect(detail.links[0]?.status).toBe('active')
      await expect(
        page.locator(`[data-dsh-forge-node-card="${KEY}"] [data-dsh-forge-badge="session-live"]`),
        '徽标不变(同一会话)',
      ).toHaveAttribute('data-dsh-forge-session-id', sessionId, { timeout: 10_000 })

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    disposeJourney(setup)
  }
})
