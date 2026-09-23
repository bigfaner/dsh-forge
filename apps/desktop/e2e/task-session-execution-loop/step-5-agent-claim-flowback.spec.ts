// @feature dsh-forge-m2 | @web-e2e | @journey task-session-execution-loop
// Traceability: docs/features/dsh-forge-m2/testing/task-session-execution-loop/contracts/step-5-agent-claim-flowback.md
//
// Step 5「agent 执行任务操作并回流看板」三 Outcome。e2e 驱动面注记(契约
// 头注):agent 动作不由 web 面驱动 —— 以 fixture 任务文件变更 + FORGE_ACTOR
// 标记模拟 agent 的 claim(tech-design SC2/SC3 e2e 腿口径),回流与来源断言
// 不受模拟方式影响;审批走主窗口现有会话 UI 一节随 agent 面一并由文件变
// 更通道承载。
//
//   success —— 挂接会话运行中(先经 step-3 链路真实发起),单笔 claim 落
//   文件(挂接推断主路径:path ②,FT-045)→ ≤5s 免手动刷新回流,来源
//   [会话](source:session 徽标翻转);≤5s 计量 = sc3 口径原样搬入
//   helpers.ts(t0 = 最后一次 writeFileSync 返回,t1 = 页内首见目标徽标 +
//   新状态短标签;预算 5000ms 恒定,重试一次 + 打印分布,阈值不动)。
//
//   sync-degraded —— 方言注记:UF2「读取失败」error 态在本腿物化为 FT-056
//   sync-error 工具栏指示([data-dsh-forge-tasks-sync="error"] + 静默重试),
//   看板错误卡片([data-dsh-forge-task-board-error])只在「首次 getTaskBoard
//   即拒绝」时出现 —— 该通道无确定性 fixture 注入面(注册探测先行拒绝),
//   本腿以「健康载入后注入 index.json 损坏」驱动等价错误腿:sync-error 工具
//   栏亮起、最后良好看板保留(tasks = null 的 feature 行不参与 diff,无结构
//   性删除)、零 updating 标记(超时本身不触发任何专用看板状态 —— updating
//   仅在变更事件到达时点亮);修复文件 → 点重试 → 看板收敛(与 forge 文件
//   直读全等;FT-056 静默重试可能先行治愈,重试点击为尽力而为)。
//
//   multi-change-flowback —— 连续三笔状态变更(claim → transition → submit
//   的 e2e 模拟 = 三次连续 index.json 状态翻转,首笔前落 FORGE_ACTOR 记录)
//   逐笔 ≤5s 回流、来源逐笔 [会话];无丢失、无错误合并:每笔各自计量,
//   终态与 forge 文件直读全等。
import { readFileSync, writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { registerFixtureProject } from '../fixtures/forge-project.ts'
import { cleanupViewKey, closeAndAwaitExit, openTasksBoard } from '../tests/m2/helpers/restart-app.ts'
import { createFixtureMutator } from '../tests/m2/helpers/file-mutate.ts'
import type { FixtureMutator } from '../tests/m2/helpers/file-mutate.ts'
import {
  assertReflowWithinBudget, disposeJourney, launchOneClick, measureReflow,
  pickTaskKey, pollChannelJournal, readBoard, readForgeIndexTruth, setUpJourney,
} from './helpers.ts'

test('step-5/success [@web-e2e @journey task-session-execution-loop]: simulated claim on the linked task reflows ≤5s with the [会话] source flip', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)

  const setup = setUpJourney()
  const { set, channel, project, session } = setup
  const KEY = pickTaskKey(set, task => task.status === 'pending' && task.record === null && task.dependencies.length === 0, '挂接会话对象(pending + 无记录)')
  const mutator: FixtureMutator = createFixtureMutator(set, project)

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      await registerFixtureProject(page, project)
      await openTasksBoard(page, set.facts.taskCount)

      // ---- 建立挂接(挂接会话运行中)--------------------------------------
      await launchOneClick(page, `[data-dsh-forge-node-card="${KEY}"] [data-dsh-forge-launch-trigger][data-mount="node-hover"]`)
      const created = await pollChannelJournal(channel, entry => entry.kind === 'create', 'the session create')
      const sessionId = created.sessionId ?? ''
      expect(sessionId).not.toBe('')
      await openTasksBoard(page, set.facts.taskCount)
      await expect(
        page.locator(`[data-dsh-forge-node-card="${KEY}"] [data-dsh-forge-badge="session-live"]`),
      ).toHaveAttribute('data-dsh-forge-session-id', sessionId, { timeout: 10_000 })

      // 基线:记录缺失 + 扫描时无挂接 ⇒ [终端];本腿必须翻转它。
      await expect(
        page.locator(`[data-dsh-forge-node-card="${KEY}"] [data-dsh-forge-badge="source:terminal"]`),
        '基线 = [终端](回流腿必须翻转)',
      ).toBeVisible()

      // ---- 单笔 claim(挂接推断主路径:path ②)→ ≤5s [会话] ----------------
      const claimMutation = (): (() => Promise<number>) => () => {
        const next = mutator.nextStatusOf(KEY)
        return measureReflow(page, KEY, 'session', next,
          () => { mutator.mutateStatus(KEY, next) })
      }
      await assertReflowWithinBudget('step-5 claim-by-active-link (linked task, no actor record)', [
        claimMutation(),
        claimMutation(),
      ])

      // 终态与 forge 文件直读全等(forge 文件恒为事实源)。
      const truth = readForgeIndexTruth(project)
      expect(truth.get(KEY)?.status, 'index.json 携带新状态').toBe(mutator.statusOf(KEY))

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    disposeJourney(setup)
  }
})

test('step-5/sync-degraded [@web-e2e @journey task-session-execution-loop]: corrupt index.json after a healthy load → FT-056 sync-error toolbar + last-good board retained → retry converges', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)

  const setup = setUpJourney()
  const { set, project, session } = setup
  const corrupted = project.indexPaths[0]
  if (corrupted === undefined) throw new Error('fixture carries no feature index.json')

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      const projectId = await registerFixtureProject(page, project)
      await openTasksBoard(page, set.facts.taskCount)
      const healthy = await readBoard(page, projectId)
      expect(healthy.tasks.length).toBe(set.facts.taskCount)

      // ---- 注入:index.json 损坏(健康载入之后)---------------------------
      const originalBytes = readFileSync(corrupted.path, 'utf8')
      writeFileSync(corrupted.path, '{"tasks": [CORRUPT — not json\n')

      // sync-error 工具栏亮起(FT-056;watcher 400ms 防抖 + 重扫 + sync 事件推送)。
      await expect(
        page.locator('[data-dsh-forge-tasks-sync="error"]'),
        '感知链故障呈现 sync-error 工具栏指示',
      ).toBeVisible({ timeout: 20_000 })
      await expect(page.locator('[data-dsh-forge-tasks-sync-retry]'), '工具栏携带重试入口').toBeVisible()

      // 最后良好看板保留:节点数不降(tasks = null 的 feature 不参与 diff)。
      expect(await page.locator('[data-dsh-forge-node-card]').count(), 'last-good 节点全集保留').toBe(set.facts.taskCount)
      const duringError = await readBoard(page, projectId)
      expect(duringError.tasks.length, '不展示残缺数据').toBe(set.facts.taskCount)

      // 超时本身不触发任何专用看板状态:失败扫描只推 sync 事件(零
      // task_updated)⇒ 零 updating 高亮(updating 仅在变更事件到达时点亮)。
      expect(await page.locator('[data-dsh-forge-updating]').count(), '降级窗口零 updating 标记').toBe(0)

      // ---- 修复 + 重试 → 收敛(forge 文件恒为事实源;快照可重建)---------
      writeFileSync(corrupted.path, originalBytes)
      // FT-056 静默重试(watcher 自动重扫)可能与手动重试竞速:尽力点击,
      // 收敛断言才是判据。
      const retry = page.locator('[data-dsh-forge-tasks-sync-retry]')
      if (await retry.isVisible().catch(() => false)) await retry.click({ force: true }).catch(() => {})
      await expect.poll(async () => (await readBoard(page, projectId)).sync.state, { timeout: 20_000 }).toBe('idle')
      const converged = await readBoard(page, projectId)
      expect(converged.tasks.length).toBe(set.facts.taskCount)
      const truth = readForgeIndexTruth(project)
      const mismatches = converged.tasks
        .filter(task => task.status !== truth.get(task.key)?.status)
        .map(task => `${task.key}: ${task.status} != ${String(truth.get(task.key)?.status)}`)
      expect(mismatches, '收敛后看板与 forge 文件直读全等(diff samples)').toEqual([])
      expect(await page.locator('[data-dsh-forge-node-card]').count(), '看板恢复渲染全量节点').toBe(set.facts.taskCount)

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    disposeJourney(setup)
  }
})

test('step-5/multi-change-flowback [@web-e2e @journey task-session-execution-loop]: three consecutive changes each reflow ≤5s as [会话], final state equals the forge files', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)

  const setup = setUpJourney()
  const { set, channel, project, session } = setup
  const KEY = pickTaskKey(set, task => task.status === 'pending' && task.record === null && task.dependencies.length === 0, '连续变更对象')
  const mutator: FixtureMutator = createFixtureMutator(set, project)

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      const projectId = await registerFixtureProject(page, project)
      await openTasksBoard(page, set.facts.taskCount)

      // 挂接会话运行中 + FORGE_ACTOR 标记(判定序 path ① 的透传槽形态)。
      await launchOneClick(page, `[data-dsh-forge-node-card="${KEY}"] [data-dsh-forge-launch-trigger][data-mount="node-hover"]`)
      const created = await pollChannelJournal(channel, entry => entry.kind === 'create', 'the session create')
      const sessionId = created.sessionId ?? ''
      expect(sessionId).not.toBe('')
      await openTasksBoard(page, set.facts.taskCount)

      // 连续三笔:claim → transition → submit 的 e2e 模拟(状态行走
      // pending→in_progress→completed→rejected;首笔前落 actor 记录 —
      // 记录先、状态后,单次扫描两件俱见)。
      const walk: Array<{ readonly label: string; readonly status: 'in_progress' | 'completed' | 'rejected' }> = [
        { label: 'claim (pending → in_progress)', status: 'in_progress' },
        { label: 'transition (in_progress → completed)', status: 'completed' },
        { label: 'submit (completed → rejected)', status: 'rejected' },
      ]
      mutator.writeRecord(KEY, `session:${sessionId}`)
      for (const leg of walk) {
        await assertReflowWithinBudget(`step-5 multi ${leg.label} on ${KEY}`, [
          () => measureReflow(page, KEY, 'session', leg.status,
            () => { mutator.mutateStatus(KEY, leg.status) }),
        ])
      }

      // 无丢失、无错误合并:终态三面对齐(模型 = 文件 = 看板)。
      const truth = readForgeIndexTruth(project)
      expect(truth.get(KEY)?.status, 'index.json 终态').toBe('rejected')
      const boardRows = await readBoard(page, projectId)
      expect(boardRows.tasks.find(task => task.key === KEY)?.status, '看板终态与 forge 文件一致').toBe('rejected')

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    disposeJourney(setup)
  }
})
