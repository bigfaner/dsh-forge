// @feature dsh-forge-m2 | @web-e2e | @journey task-session-execution-loop
// Traceability: docs/features/dsh-forge-m2/testing/task-session-execution-loop/contracts/step-1..step-7
//
// Journey smoke(happy path 全程串联,success Outcomes 依序执行,步间传递
// 状态:任务键 / sessionId;每步后断言其 Output 与 Journey Invariants):
//
//   Step 1 打开看板 —— 节点全集 + sync idle + 与 forge 文件直读全等 +
//           看板对人只读(FT-030 白名单,零任务写动词)。
//   Step 2 打开详情 —— 描述按原文渲染;根任务依赖链空态;零写操作入口。
//   Step 3 一键发起 —— 1 次点击 + Enter(默认焦点)→ 跳转会话视图;cwd =
//           注册代码根;徽标 + active 挂接行。
//   (Step 7 返回记忆,前置行使)从会话视图经「工作台」行返回 → 视图键回
//           workbench/tasks、侧板选中态保持、挂接恒 1 行。
//   Step 4 注入核验 —— 首条用户消息 = stub stdout 逐字节 + 一行 FORGE_ACTOR。
//   Step 5 回流 —— 挂接任务单笔 claim ≤5s [会话](分布打印,阈值不动)。
//   Step 6 重启回溯 —— 同 userData 第二靴:active 挂接仍在、徽标重亮。
//   Step 7 重入(code-faithful)—— 条目 active;「进入会话」缝未接线
//           (count 0,任务注记);往返零新挂接行。
//
// 计时口径:首屏 ≤2s 与发起 ≤3s 的单发计量属各 step 文件;smoke 只断言功能
// 输出与 ≤5s 回流(回流为全链功能预算,与 sc3 同口径不可豁免)。
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { registerFixtureProject } from '../fixtures/forge-project.ts'
import { cleanupViewKey, closeAndAwaitExit, openTasksBoard, switchToWorkbench } from '../tests/m2/helpers/restart-app.ts'
import { createFixtureMutator } from '../tests/m2/helpers/file-mutate.ts'
import {
  assertReadonlyBridgeFace, assertReflowWithinBudget, disposeJourney, launchOneClick,
  measureReflow, pickTaskKey, pollChannelJournal, readActiveProjectId, readBoard,
  readForgeIndexTruth, readTaskDetail, setUpJourney,
} from './helpers.ts'
import { composeFirstUserMessage, forgeActorValue } from '../../../../packages/plugins/forge-workbench/src/host/actor-env.ts'

test('task-session-execution-loop journey smoke [@web-e2e @journey task-session-execution-loop]: board → detail → launch → injection → reflow → restart → reenter', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)

  const setup = setUpJourney()
  const { set, stub, channel, project, session } = setup
  const KEY = pickTaskKey(set, task => task.status === 'pending' && task.record === null && task.dependencies.length === 0, '主线对象')
  const localId = KEY.slice(KEY.lastIndexOf('/') + 1)
  const mutator = createFixtureMutator(set, project)
  // Step 4 的 oracle 锚定:发起前先 spawn 一次 stub CLI,固定 prompt stdout。
  const promptRun = spawnSync(stub.cliPath, ['prompt', 'get-by-task-id', localId], { cwd: project.codeRoot, encoding: 'utf8', windowsHide: true })
  expect(promptRun.status).toBe(0)
  const promptStdout = promptRun.stdout

  try {
    // ========================================================================
    // Boot 1 — Steps 1..5(含 Step 7 的返回记忆行使)。
    // ========================================================================
    let shell = await session.boot()
    let sessionId = ''
    try {
      const { page } = shell
      const projectId = await registerFixtureProject(page, project)

      // ---- Step 1:打开任务看板浏览依赖树 ----------------------------------
      await openTasksBoard(page, set.facts.taskCount)
      expect(await page.locator('[data-dsh-forge-node-card]').count(), '依赖树节点全集').toBe(set.facts.taskCount)
      const board = await readBoard(page, projectId)
      expect(board.sync.state, 'sync idle(FT-056)').toBe('idle')
      const truth = readForgeIndexTruth(project)
      const statusMismatches = board.tasks
        .filter(task => task.status !== truth.get(task.key)?.status)
        .map(task => `${task.key}: ${task.status} != ${String(truth.get(task.key)?.status)}`)
      expect(statusMismatches, 'Step 1:任务状态与 forge 文件直读全等').toEqual([])
      expect(await page.locator('[data-dsh-forge-badge="worktree"]').count(), 'Invariant:零 worktree 徽标虚构').toBe(0)
      await assertReadonlyBridgeFace(page)

      // ---- Step 2:打开任务详情 -------------------------------------------
      await page.locator(`[data-dsh-forge-node-card="${KEY}"]`).click()
      const dock = page.locator(`[data-dsh-forge-task-detail="${KEY}"]`)
      await expect(dock).toBeVisible({ timeout: 15_000 })
      await expect(dock.locator('[data-dsh-forge-detail-section="description"]')).toBeVisible({ timeout: 15_000 })
      const dockText = await dock.locator('[data-dsh-forge-detail-section="description"]').textContent()
      expect(dockText, 'Step 2:描述按 forge 原文渲染').toContain(`Fixture task body for ${KEY} `)
      await expect(dock.locator('[data-dsh-forge-detail-dep-empty]'), '根任务依赖链空态(无上游依赖)').toBeVisible()

      // ---- Step 3:一键发起会话 -------------------------------------------
      await launchOneClick(page, `[data-dsh-forge-task-detail="${KEY}"] [data-dsh-forge-launch-trigger][data-mount="panel-primary"]`)
      const created = await pollChannelJournal(channel, entry => entry.kind === 'create', 'the session create')
      sessionId = created.sessionId ?? ''
      expect(sessionId).not.toBe('')
      expect((created.cwd ?? '').replaceAll('\\', '/'), 'cwd = 注册项目代码根目录').toBe(project.codeRoot.replaceAll('\\', '/'))
      await openTasksBoard(page, set.facts.taskCount)
      await expect(
        page.locator(`[data-dsh-forge-node-card="${KEY}"] [data-dsh-forge-badge="session-live"]`),
        'Step 3:任务卡会话运行中徽标',
      ).toHaveAttribute('data-dsh-forge-session-id', sessionId, { timeout: 10_000 })
      await page.locator(`[data-dsh-forge-node-card="${KEY}"]`).click()
      await expect(
        page.locator(`[data-dsh-forge-detail-link="${sessionId}"]`),
        'Step 3:挂接历史 active 行',
      ).toHaveAttribute('data-link-status', 'active', { timeout: 15_000 })

      // ---- (Step 7 前置行使)会话视图 → 返回:视图键 + 选中态保持 ---------
      // 跳转已在 Step 3 发生;再走一次「发起 → 返回」环,行使返回来源记忆。
      await launchOneClick(page, `[data-dsh-forge-task-detail="${KEY}"] [data-dsh-forge-launch-trigger][data-mount="panel-primary"]`)
      const relaunchCreate = await pollChannelJournal(
        channel, entry => entry.kind === 'create' && entry.sessionId !== sessionId, 'the round-trip create')
      const roundTripSessionId = relaunchCreate.sessionId ?? ''
      expect(roundTripSessionId).not.toBe(sessionId)
      sessionId = roundTripSessionId // supersede:新行 active,旧行 ended(Step 3d 口径)
      await switchToWorkbench(page)
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-tasks"]'), 'Step 7:返回后视图键回到 workbench/tasks').toBeVisible({ timeout: 15_000 })
      await expect(page.locator(`[data-dsh-forge-task-detail="${KEY}"]`), 'Step 7:侧板选中态保持').toBeVisible({ timeout: 15_000 })
      expect(await page.locator('[data-dsh-forge-detail-link]').count(), 'Step 7:往返后挂接行(新 active + 旧 ended,零额外行)').toBe(2)
      await page.locator('[data-dsh-forge-detail-close]').click()
      await expect(page.locator('[data-dsh-forge-task-detail]')).toHaveCount(0)

      // ---- Step 4:确认任务执行 prompt 自动注入 ----------------------------
      const promptEntry = await pollChannelJournal(
        channel, entry => entry.kind === 'prompt' && entry.sessionId === sessionId, 'the injected first user message')
      const expectedMessage = composeFirstUserMessage(promptStdout, forgeActorValue(sessionId))
      expect(promptEntry.mode).toBe('queue')
      expect(promptEntry.text, 'Step 4:首条用户消息 = stub stdout 逐字节 + 一行 FORGE_ACTOR').toBe(expectedMessage)
      expect((promptEntry.text ?? '').startsWith(promptStdout), 'Step 4:prompt 原文不改写').toBe(true)

      // ---- Step 5:agent 执行任务操作并回流看板 ---------------------------
      const next = mutator.nextStatusOf(KEY)
      await assertReflowWithinBudget('smoke claim-by-active-link', [
        () => measureReflow(page, KEY, 'session', next, () => { mutator.mutateStatus(KEY, next) }),
      ])

      expect(shell.pageErrors, `boot-1 renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }

    // ========================================================================
    // Boot 2(同 factory:同 userData + config root)— Steps 6..7。
    // ========================================================================
    expect(existsSync(join(setup.root, 'user-data', 'workbench', 'workbench.db')), '挂接持久于工作台自有 SQLite').toBe(true)
    shell = await session.boot()
    try {
      const { page } = shell
      const projectId = await readActiveProjectId(page)
      expect(typeof projectId).toBe('string')
      await openTasksBoard(page, set.facts.taskCount)

      // ---- Step 6:重启后回溯挂接 -----------------------------------------
      await page.locator(`[data-dsh-forge-node-card="${KEY}"]`).click()
      await expect(
        page.locator(`[data-dsh-forge-detail-link="${sessionId}"]`),
        'Step 6:重启后 active 挂接仍在',
      ).toHaveAttribute('data-link-status', 'active', { timeout: 15_000 })
      await expect(
        page.locator(`[data-dsh-forge-node-card="${KEY}"] [data-dsh-forge-badge="session-live"]`),
        'Step 6:徽标经权威读重亮',
      ).toHaveAttribute('data-dsh-forge-session-id', sessionId, { timeout: 15_000 })

      // ---- Step 7:从挂接条目重入(code-faithful,见头注)----------------
      const detail = await readTaskDetail(page, projectId ?? '', KEY)
      expect(detail.links.length, 'Step 7:重启后挂接历史完整(1 active + 1 ended)').toBe(2)
      expect(detail.links[0]?.sessionId).toBe(sessionId)
      expect(detail.links[0]?.status).toBe('active')
      expect(await page.locator('[data-dsh-forge-detail-enter]').count(), 'Step 7:「进入会话」缝未接线(count 0,任务注记)').toBe(0)

      expect(shell.pageErrors, `boot-2 renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    disposeJourney(setup)
  }
})
