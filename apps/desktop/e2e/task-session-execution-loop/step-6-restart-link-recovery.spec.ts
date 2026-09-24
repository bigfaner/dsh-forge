// @feature dsh-forge-m2 | @web-e2e | @journey task-session-execution-loop
// Traceability: docs/features/dsh-forge-m2/testing/task-session-execution-loop/contracts/step-6-restart-link-recovery.md
//
// Step 6「重启应用后回溯挂接」两 Outcome(sc2 boot-2 形:同 factory 第二靴 =
// 同 userData + 同 config root,单实例锁经 closeAndAwaitExit 释放后重启):
//
//   success —— 重启前恰一条 active 挂接:重启后挂接关系仍在(session_links
//   持久于工作台自有 SQLite —— userData 内 workbench.db;应用退出不收敛
//   active 行);任务卡会话运行中徽标经侧板的权威读(getTaskDetail.links)
//   重新点亮;历史挂接列表可回溯(每条含会话标识/时间)。
//
//   multi-history-recovery —— 同任务先后两个会话(1 active + 1 ended 并存):
//   重启后列表完整、按开始时间倒序(新→旧),每条含会话标识/时间与状态;
//   与挂接索引读数(bridge getTaskDetail.links —— 工作台自有状态的读面)
//   逐项一致;ended 行不删行(endedAt 写入)。
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { registerFixtureProject } from '../fixtures/forge-project.ts'
import { cleanupViewKey, closeAndAwaitExit, openTasksBoard } from '../tests/m2/helpers/restart-app.ts'
import {
  disposeJourney, linkSessionViaBridge, pickTaskKey,
  readActiveProjectId, readTaskDetail, setUpJourney,
} from './helpers.ts'

/** 打开任务侧板(行激活 = 任务导航)。 */
async function openDock(page: Page, taskKey: string): Promise<void> {
  await page.locator(`[data-dsh-forge-node-card="${taskKey}"]`).click()
  await expect(page.locator(`[data-dsh-forge-task-detail="${taskKey}"]`)).toBeVisible({ timeout: 15_000 })
}

test('step-6/success [@web-e2e @journey task-session-execution-loop]: restart keeps the active link — badge re-lights off the authoritative read', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)

  const setup = setUpJourney()
  const { set, project, session } = setup
  const KEY = pickTaskKey(set, task => task.status === 'pending' && task.record === null && task.dependencies.length === 0, '重启挂接对象')

  try {
    // ---- Boot 1:写入唯一 active 挂接(6.1:内核动词直调)-----------------
    let shell = await session.boot()
    let sessionId = ''
    try {
      const { page } = shell
      const projectId = await registerFixtureProject(page, project)
      await openTasksBoard(page, set.facts.taskCount)
      sessionId = await linkSessionViaBridge(page, projectId, KEY, 'session-step6-success')
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
    expect(existsSync(join(setup.root, 'user-data', 'workbench', 'workbench.db')), 'workbench.db lives under the isolated userData').toBe(true)

    // ---- Boot 2(同 userData + config root):挂接关系仍在 ------------------
    shell = await session.boot()
    try {
      const { page } = shell
      const activeProjectId = await readActiveProjectId(page)
      expect(activeProjectId, '注册项目跨重启保持(workbench.db)').toBeTruthy()
      await openTasksBoard(page, set.facts.taskCount)

      // 侧板权威读 → 挂接历史回溯(会话标识/时间);徽标经 reconcile 重亮。
      await openDock(page, KEY)
      const linkRow = page.locator(`[data-dsh-forge-detail-link="${sessionId}"]`)
      await expect(linkRow, '重启后挂接关系仍存在').toHaveAttribute('data-link-status', 'active', { timeout: 15_000 })
      await expect(linkRow.locator('time'), '每条挂接含时间').toBeVisible()
      await expect(
        page.locator(`[data-dsh-forge-node-card="${KEY}"] [data-dsh-forge-badge="session-live"]`),
        '任务卡会话运行中徽标(重启后重亮)',
      ).toHaveAttribute('data-dsh-forge-session-id', sessionId, { timeout: 15_000 })

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    disposeJourney(setup)
  }
})

test('step-6/multi-history-recovery [@web-e2e @journey task-session-execution-loop]: restart keeps the full link history — newest-first active + ended rows match the index read', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)

  const setup = setUpJourney()
  const { set, project, session } = setup
  const KEY = pickTaskKey(set, task => task.status === 'pending' && task.record === null && task.dependencies.length === 0, '多历史挂接对象')

  try {
    // ---- Boot 1:两次挂接(6.1:内核动词直调;supersede → 1 active + 1
    // ended 并存 —— recordSessionLink 的同任务第二行置 ended 第一行)------
    let shell = await session.boot()
    let sessionIdOne = ''
    let sessionIdTwo = ''
    try {
      const { page } = shell
      const projectId = await registerFixtureProject(page, project)
      await openTasksBoard(page, set.facts.taskCount)
      sessionIdOne = await linkSessionViaBridge(page, projectId, KEY, 'session-step6-hist-1')
      sessionIdTwo = await linkSessionViaBridge(page, projectId, KEY, 'session-step6-hist-2')
      expect(sessionIdTwo).not.toBe(sessionIdOne)
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }

    // ---- Boot 2:历史完整、新→旧、与挂接索引读数一致 ----------------------
    shell = await session.boot()
    try {
      const { page } = shell
      const projectId = await readActiveProjectId(page)
      expect(typeof projectId).toBe('string')
      await openTasksBoard(page, set.facts.taskCount)
      await openDock(page, KEY)

      // DOM 面:新→旧(active 在前,ended 在后),每条含时间。
      await expect.poll(async () => {
        const rows = page.locator('[data-dsh-forge-detail-link]')
        if (await rows.count() < 2) return []
        return await rows.evaluateAll(nodes => nodes.map(node => ({
          sessionId: node.getAttribute('data-dsh-forge-detail-link') ?? '',
          status: node.getAttribute('data-link-status') ?? '',
          hasTime: node.querySelector('time') !== null,
        })))
      }, { timeout: 15_000 }).toEqual([
        { sessionId: sessionIdTwo, status: 'active', hasTime: true },
        { sessionId: sessionIdOne, status: 'ended', hasTime: true },
      ])

      // 数据面:与挂接索引读数(bridge getTaskDetail.links)逐项一致。
      const detail = await readTaskDetail(page, projectId ?? '', KEY)
      expect(detail.links.map(link => `${link.sessionId}:${link.status}`), '挂接历史 = 索引读数(新→旧)').toEqual([
        `${sessionIdTwo}:active`,
        `${sessionIdOne}:ended`,
      ])
      const endedRow = detail.links.find(link => link.sessionId === sessionIdOne)
      expect(endedRow?.endedAt, 'ended 行保留且 endedAt 写入(不删行)').not.toBeNull()
      const activeRow = detail.links.find(link => link.sessionId === sessionIdTwo)
      expect(activeRow?.endedAt, 'active 行无结束时间').toBeNull()

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    disposeJourney(setup)
  }
})
