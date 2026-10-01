// @feature dsh-forge-m2 | @web-e2e | @journey task-board-browsing
// Traceability: docs/features/dsh-forge-m2/testing/task-board-browsing/contracts/step-5-open-task-detail.md
//
// Step 5「打开任务详情」两 Outcome:
//
//   success —— 会话来源与终端来源执行记录任务各开一口(fixture 预置,来源
//   各 ≥1):描述 = 任务文件原文只读渲染(测试进程直读 <stem>.md 对拍)、
//   依赖链 = 上游 blocker 传递链拓扑序(buildDepChain 镜像,FT-055)、执行
//   记录 时间/类型/来源/摘要 与记录 .md frontmatter 逐项一致(FT-045 actor
//   透传)、记录来源徽标 [会话]/[终端] 与 forge 数据一致;挂接历史区空态
//   「该任务尚未挂接会话」(FT-052 detail.links.empty —— 挂接索引为工作台
//   自有 SoT,隔离 userData 零挂接写入足迹 ⇒ 确定为空);详情零写操作入口。
//
//   single-task-error —— 方言注记:契约的「记录文件损坏」注入无确定性
//   解析失败通道(记录 .md 损坏只会降级为记录区为空,不放大损伤);单任务
//   读取失败的等价确定性注入 = 结构性移除 —— 侧板开着的目标任务从其
//   index.json 移除(tasksIndexJson 于变异模型上重渲)→ 看板重扫判定结构
//   性缺席 → 侧板重读拒绝 → UF3 error 态([data-dsh-forge-detail-error] +
//   重试入口),不展示残缺的描述/依赖链/记录;看板其余任务不受影响;恢复
//   条目 → 重试 → 详情正常载入。
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { generateTaskSet } from '../fixtures/task-generator.ts'
import { registerFixtureProject, tasksIndexJson } from '../fixtures/forge-project.ts'
import { waitForTreeNodes, cleanupViewKey, closeAndAwaitExit, openTasksBoard } from '../tests/m2/helpers/restart-app.ts'
import {
  BOARD_SEED, disposeBoardJourney, expectedDepChain, featureWithoutTask, groundOf,
  pickTaskKey, setUpBoardJourney,
} from './helpers.ts'
import type { BoardJourneySetup, GroundTask } from './helpers.ts'

/** 采集一个任务侧板的观测面数据(仅 data-dsh-forge-* 钩子)。 */
async function dockDataOf(page: Page, taskKey: string) {
  return await page.evaluate((key: string) => {
    const root = document.querySelector(`[data-dsh-forge-task-detail="${key}"]`)
    if (root === null) return null
    return {
      depKeys: Array.from(root.querySelectorAll('[data-dsh-forge-detail-dep]'))
        .map(item => item.getAttribute('data-dsh-forge-detail-dep') ?? ''),
      descriptionText: root.querySelector('[data-dsh-forge-detail-section="description"]')?.textContent ?? '',
      recordsText: root.querySelector('[data-dsh-forge-detail-section="records"]')?.textContent ?? '',
      recordTimes: Array.from(root.querySelectorAll('[data-dsh-forge-detail-record] time'))
        .map(time => time.getAttribute('dateTime') ?? ''),
      recordBadges: Array.from(root.querySelectorAll('[data-dsh-forge-detail-record] [data-dsh-forge-badge]'))
        .map(badge => badge.getAttribute('data-dsh-forge-badge') ?? ''),
      linksEmptyHint: root.querySelector('[data-dsh-forge-detail-links-empty]') !== null,
      worktreeBadges: root.querySelectorAll('[data-dsh-forge-badge="worktree"]').length,
      buttonLabels: Array.from(root.querySelectorAll('button'))
        .map(button => `${button.getAttribute('aria-label') ?? ''}|${button.getAttribute('title') ?? ''}|${(button.textContent ?? '').trim()}`),
    }
  }, taskKey)
}

/** 测试进程直读任务描述 .md(oracle 文件)。 */
function descriptionFileOf(setup: BoardJourneySetup, task: GroundTask): string {
  const featureIndex = setup.project.indexPaths.find(row => row.slug === task.feature)
  if (featureIndex === undefined) throw new Error(`no index.json recorded for ${task.feature}`)
  const feature = setup.set.features.find(candidate => candidate.slug === task.feature)
  const modelTask = feature?.tasks.find(candidate => candidate.localId === task.localId)
  if (modelTask === undefined) throw new Error(`model lost ${task.key}`)
  return join(dirname(featureIndex.path), `${modelTask.stem}.md`)
}

/** 会话/终端双来源 subjects 的共同断言面。 */
async function assertDetailFace(
  page: Page,
  setup: BoardJourneySetup,
  byKey: ReadonlyMap<string, GroundTask>,
  task: GroundTask,
  projectId: string,
  expectedSource: 'session' | 'terminal',
): Promise<void> {
  await page.locator(`[data-dsh-forge-node-card="${task.key}"]`).click()
  const dock = page.locator(`[data-dsh-forge-task-detail="${task.key}"]`)
  await expect(dock).toBeVisible({ timeout: 15_000 })
  await expect(dock.locator('[data-dsh-forge-detail-section="description"]')).toBeVisible({ timeout: 15_000 })
  const detail = await dockDataOf(page, task.key)
  expect(detail, `dock content for ${task.key}`).not.toBeNull()

  // 描述:任务文件原文只读渲染(直读对拍)。
  const fileBody = readFileSync(descriptionFileOf(setup, task), 'utf8')
  const bodyLine = `Fixture task body for ${task.key} (status: ${task.status}, type: ${task.type}).`
  expect(fileBody).toContain(bodyLine)
  expect(detail?.descriptionText, `描述按 forge 原文渲染(${task.key})`).toContain(bodyLine)

  // 依赖链:上游 blocker 传递链,拓扑序。
  const expectedChain = expectedDepChain(byKey, task.key)
  expect(detail?.depKeys, `depChain(${task.key}): ${expectedChain.join(' → ')}`).toEqual(expectedChain)

  // 执行记录:时间/kind/来源/摘要 与记录 .md 逐项一致(FT-055 无虚构字段)。
  const record = task.record
  if (record === null) throw new Error(`${task.key} was picked with a record`)
  expect(detail?.recordTimes, `记录时间戳 verbatim(${task.key})`).toEqual([record.completed])
  expect(detail?.recordsText, `记录摘要 verbatim(${task.key})`).toContain(record.summary)
  expect(detail?.recordsText, `记录 kind = 任务 type(${task.key})`).toContain(task.type)
  expect(detail?.recordBadges, `记录来源徽标 = [${expectedSource === 'session' ? '会话' : '终端'}]`).toEqual([`source:${expectedSource}`])

  // 挂接历史空态(FT-052):隔离 userData 零挂接足迹 ⇒ 确定空态。
  expect(detail?.linksEmptyHint, `挂接历史区空态说明(${task.key})`).toBe(true)

  // 无 worktree 标识(方言恒 false);详情零任务写操作入口。
  expect(detail?.worktreeBadges).toBe(0)
  const writeAffordances = (detail?.buttonLabels ?? []).filter(label =>
    /认领|提交|重开|claim|submit|reopen|transition|addtask/i.test(label))
  expect(writeAffordances, `dock 零写操作入口(${task.key})`).toEqual([])

  // 数据面深读:summary 投影与 records/links 同口径。
  const bridgeDetail = await page.evaluate(async (input: { id: string; key: string }) => {
    const bridge = (globalThis as {
      dshForge?: {
        workbench?: {
          getTaskDetail?: (id: string, key: string) => Promise<{
            records: Array<{ source: string | null }>
            links: unknown[]
          }>
        }
      }
    }).dshForge?.workbench
    return await bridge?.getTaskDetail?.(input.id, input.key)
  }, { id: projectId, key: task.key })
  expect(bridgeDetail?.records.map(record => record.source), '桥面记录来源与 forge 一致').toEqual([expectedSource])
  expect(bridgeDetail?.links, '桥面挂接历史为空(工作台自有 SoT 钉零)').toEqual([])

  await page.locator('[data-dsh-forge-detail-close]').click()
  await expect(page.locator('[data-dsh-forge-task-detail]')).toHaveCount(0)
}

// [M4 1.8 e2e 迁移·迁移清单 第②行] 2.10 已按新宿主恢复:入口 = 右栏任务看板 pane
// (openTasksBoard/openBoardPane:概览任务行 seam + registerFixtureProject 的列表推送位);断言本体零删改。
test('step-5/success [@web-e2e @journey task-board-browsing]: detail dock renders description/dep-chain/records for both record sources + links empty state', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)

  const set = generateTaskSet({ seed: BOARD_SEED, taskCount: 12, featureCount: 2, danglingRate: 0.15, recordRate: 0.4 })
  expect(set.facts.recordsWithSessionActor).toBeGreaterThan(0)
  expect(set.facts.recordsWithTerminalActor).toBeGreaterThan(0)
  const setup = setUpBoardJourney(set)
  const { project, session } = setup
  const { byKey } = groundOf(set)
  const sessionSubject = byKey.get(pickTaskKey(set, task => task.record !== null && task.record.actor.startsWith('session:'), '会话来源记录任务'))
  const terminalSubject = byKey.get(pickTaskKey(set, task => task.record?.actor === 'terminal', '终端来源记录任务'))
  if (sessionSubject === undefined || terminalSubject === undefined) throw new Error('ground model lost a record subject')

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      const projectId = await registerFixtureProject(page, project)
      await openTasksBoard(page, set.facts.taskCount)

      // 会话来源记录任务 + 终端来源记录任务各开一口(同断言面)。
      await assertDetailFace(page, setup, byKey, sessionSubject, projectId, 'session')
      await assertDetailFace(page, setup, byKey, terminalSubject, projectId, 'terminal')

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    disposeBoardJourney(setup)
  }
})

test('step-5/single-task-error [@web-e2e @journey task-board-browsing]: structural removal while the dock is open → UF3 error card + retry; other tasks unaffected; restore reloads', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)

  const set = generateTaskSet({ seed: BOARD_SEED, taskCount: 12, featureCount: 2, danglingRate: 0.15, recordRate: 0.4 })
  const setup = setUpBoardJourney(set)
  const { project, session } = setup
  const { byKey } = groundOf(set)
  const VICTIM = pickTaskKey(set, task => task.record === null && task.dependencies.length > 0, '单任务移除对象(无记录 + 带依赖)')
  const victim = byKey.get(VICTIM)
  if (victim === undefined) throw new Error(`ground model lost ${VICTIM}`)
  const OTHER = pickTaskKey(set, task => `${task.localId}` !== victim.localId, '另一任务(其余任务不受影响的判据)')
  const victimFeature = set.features.find(feature => feature.slug === victim.feature)
  const victimIndex = project.indexPaths.find(row => row.slug === victim.feature)
  if (victimFeature === undefined || victimIndex === undefined) throw new Error(`fixture lost the ${victim.feature} feature`)

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      const projectId = await registerFixtureProject(page, project)
      await openTasksBoard(page, set.facts.taskCount)

      // 侧板开着目标任务的 healthy 详情。
      await page.locator(`[data-dsh-forge-node-card="${VICTIM}"]`).click()
      const dock = page.locator(`[data-dsh-forge-task-detail="${VICTIM}"]`)
      await expect(dock).toBeVisible({ timeout: 15_000 })
      await expect(dock.locator('[data-dsh-forge-detail-section="description"]')).toBeVisible({ timeout: 15_000 })

      // 单任务读取失败注入(方言等价面,见头注):结构性移除目标任务条目。
      const originalBytes = readFileSync(victimIndex.path, 'utf8')
      writeFileSync(victimIndex.path, tasksIndexJson(featureWithoutTask(victimFeature, victim.localId)))

      // 看板重扫 → 结构性缺席 → 侧板重读拒绝 → UF3 error 态。
      await expect(dock.locator('[data-dsh-forge-detail-error]'), '单任务数据异常 → 详情 error 态').toBeVisible({ timeout: 20_000 })
      await expect(dock.locator('[data-dsh-forge-detail-retry]'), '重试入口可见').toBeVisible()
      expect(await dock.locator('[data-dsh-forge-detail-section]').count(), '不展示残缺的描述/依赖链/记录(error 卡替代内容)').toBe(0)

      // 其余任务不受影响:看板少 1 节点;另一任务的数据面详情照常可读。
      await waitForTreeNodes(page, set.facts.taskCount - 1, 20_000)
      const otherDetail = await page.evaluate(async (input: { id: string; key: string }) => {
        const bridge = (globalThis as {
          dshForge?: {
            workbench?: {
              getTaskDetail?: (id: string, key: string) => Promise<{ summary: { key: string } }>
            }
          }
        }).dshForge?.workbench
        return await bridge?.getTaskDetail?.(input.id, input.key)
      }, { id: projectId, key: OTHER })
      expect(otherDetail?.summary.key, '失败面收敛于被读对象 —— 其余任务不受影响').toBe(OTHER)

      // 恢复条目 → 看板收敛回全集 → 点击重试 → 详情正常载入。
      writeFileSync(victimIndex.path, originalBytes)
      await waitForTreeNodes(page, set.facts.taskCount, 20_000)
      await dock.locator('[data-dsh-forge-detail-retry]').click()
      await expect(dock.locator('[data-dsh-forge-detail-error]'), '重试成功 → error 卡退场').toHaveCount(0, { timeout: 15_000 })
      await expect(dock.locator('[data-dsh-forge-detail-section="description"]'), '详情正常载入').toBeVisible({ timeout: 15_000 })

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    disposeBoardJourney(setup)
  }
})
