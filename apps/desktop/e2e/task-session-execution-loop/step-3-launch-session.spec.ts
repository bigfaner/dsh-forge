// @feature dsh-forge-m2 | @web-e2e | @journey task-session-execution-loop
// Traceability: docs/features/dsh-forge-m2/testing/task-session-execution-loop/contracts/step-3-launch-session.md
//
// Step 3「一键发起会话」五 Outcome(stub 会话通道,env 缝注入):
//
//   success —— ≤1 次有效点击(入口触发 1 次 pointer click;确认 = 默认焦点,
//   Enter 键确认非点击;打开侧板的行选择是任务导航不计入)→ 发起到会话界面
//   可交互 ≤3s(观测面 = keyed main slot 卸载工作台 shell,sc2 跳转口径);
//   会话经宿主通道创建(cwd = 注册项目代码根目录)且首条用户消息按队列模式
//   持久化;任务卡呈现会话运行中徽标;挂接行写入工作台自有 SQLite
//   (userData 内 workbench.db,FT-044:挂接写入后置于会话创建成功)。
//   「正在发起会话…」发起中指示渲染于确认面板的 initiating 层(代码事实,
//   LaunchStates spinner);stub ok 模式下链路毫秒级完成,指示窗口不可确
//   定性截获,本腿以确认面板可见(发起链的发起前面)承载发起前面断言。
//
//   no-prompt-disabled —— stub prompt mode 'fail'(exit 1 → ERR_NO_PROMPT,
//   FT-043):发起入口禁用 + 原因 tooltip(launch.reason.noPrompt),探测失败
//   不是错误面(无错误弹窗);无会话创建、无挂接索引写入;键合法 ⇒ 探测
//   确实 spawn 了 CLI(journal 留痕)。
//
//   launch-channel-failure —— FT-042 降级链方言注记:tier-1 stub create
//   'fail' 是 ROUTE 语义(路由到 tier-2 真实上游会话远端重试),从不作为
//   错误呈现;tier-2 成功恢复(跳转)同样是本腿的合法终态。三终态齐备、
//   无静默:45s 内接受 shell 卸载跳转(tier-2 恢复)/ 降级 toast(tier-3
//   剪贴板回退)/ 发起失败对话框(剪贴板被拒)任一;确定性不变量 = 发起/
//   确认态被离开(无静默挂起)、无半初始化挂接行(未跳转则该任务 links
//   为空)、恢复 stub 控制后可重试成功(tier-1 journal 带 create+prompt)。
//
//   duplicate-launch-supersede —— 同任务再次发起:4.2 supersede —— 旧
//   active 行置 ended(行保留,ended_at 写入)、新行为 active;详情可区分
//   多条目(新 active 与已 ended 并列);forge 数据不受影响(挂接为工作台
//   自有状态:codeRoot 树 md5 前后全等)。
//
//   interrupted-launch —— stub create 'hang'(create 腿挂起,10s 每腿护栏
//   之内)时硬杀 Electron 主进程 → 等进程退出 → 同 factory 重启(控制恢复
//   ok):无半初始化挂接行(该任务 links 为空)、看板健康、可重新发起成功。
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { hashTree } from '../helpers/plugins.ts'
import { isProcessAlive } from '../helpers/fixture-app.ts'
import { registerFixtureProject } from '../fixtures/forge-project.ts'
import { cleanupViewKey, closeAndAwaitExit, openTasksBoard } from '../tests/m2/helpers/restart-app.ts'
import {
  disposeJourney, launchOneClick, pickTaskKey, pollChannelJournal,
  readActiveProjectId, readTaskDetail, setUpJourney,
} from './helpers.ts'
import { zh } from '../../../../packages/plugins/forge-workbench/src/client/locale/zh.ts'
import { en } from '../../../../packages/plugins/forge-workbench/src/client/locale/en.ts'

/** 发起 → 会话界面可交互预算(契约 Output ≤3s;观测面 = shell 卸载)。 */
const LAUNCH_TO_SESSION_BUDGET_MS = 3_000

/** The dock's panel-primary launch entry of one task. */
const panelTriggerOf = (page: Page, taskKey: string) =>
  page.locator(`[data-dsh-forge-task-detail="${taskKey}"] [data-dsh-forge-launch-trigger][data-mount="panel-primary"]`)

/** Open the task's dock by activating its view-A node card (导航,不计点击预算)。 */
async function openDock(page: Page, taskKey: string): Promise<void> {
  await page.locator(`[data-dsh-forge-node-card="${taskKey}"]`).click()
  await expect(page.locator(`[data-dsh-forge-task-detail="${taskKey}"]`)).toBeVisible({ timeout: 15_000 })
}

test('step-3/success [@web-e2e @journey task-session-execution-loop]: one-click launch → session view ≤3s, cwd pinned, badge + persisted link', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)

  const setup = setUpJourney()
  const { set, channel, project, session } = setup
  // 首次发起对象:可执行 + 无执行记录 + 无挂接历史(契约 Preconditions)。
  const KEY = pickTaskKey(set,
    task => task.status === 'pending' && task.record === null && task.dependencies.length === 0,
    'pending + 无记录 + 无依赖(首发发起对象)')

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      await registerFixtureProject(page, project)
      await openTasksBoard(page, set.facts.taskCount)

      // 行选择打开侧板 = 任务导航(不计入发起流程的点击预算)。
      await openDock(page, KEY)
      const trigger = panelTriggerOf(page, KEY)
      await expect(trigger, 'panel-primary probe must reach available').toHaveAttribute('data-probe', 'available', { timeout: 20_000 })

      // ≤1 次点击 + ≤3s:点击 → 确认(默认焦点,Enter 键确认)→ 跳转。
      const t0 = Date.now()
      await trigger.click() // the ONE pointer click of the 发起 flow
      const confirm = page.locator('[data-dsh-forge-dialog="launch-confirm"]')
      await expect(confirm, '确认面板可见(发起链的发起前面)').toBeVisible({ timeout: 10_000 })
      const focusedOk = await page.evaluate(() =>
        document.activeElement?.getAttribute('data-dsh-forge-launch-confirm-ok') !== null)
      expect(focusedOk, 'AC「确认默认焦点」— Enter alone launches').toBe(true)
      await page.keyboard.press('Enter') // keyboard, not a click
      await page.waitForFunction(() => document.querySelectorAll('[data-dsh-forge-shell]').length === 0, undefined, { timeout: 15_000, polling: 50 })
      const t1 = Date.now()
      expect(
        t1 - t0,
        `发起到会话界面可交互 ${String(t1 - t0)}ms > ${String(LAUNCH_TO_SESSION_BUDGET_MS)}ms(观测面 = keyed main slot 卸载工作台 shell)`,
      ).toBeLessThanOrEqual(LAUNCH_TO_SESSION_BUDGET_MS)

      // State:会话经宿主通道创建,cwd = 注册项目代码根目录;首条用户消息
      // 按队列模式持久化(逐字符断言属 step-4,此处断言链序事实)。
      const create = await pollChannelJournal(channel, entry => entry.kind === 'create', 'the session create')
      const sessionId = create.sessionId ?? ''
      expect(sessionId).not.toBe('')
      expect((create.cwd ?? '').replaceAll('\\', '/'), 'session create cwd = registered codeRoot (FT-041)').toBe(project.codeRoot.replaceAll('\\', '/'))
      const promptEntry = await pollChannelJournal(
        channel, entry => entry.kind === 'prompt' && entry.sessionId === sessionId, 'the first session prompt')
      expect(promptEntry.mode, '首条用户消息按队列模式持久化').toBe('queue')

      // 成功链:挂接写入工作台自有 SQLite(userData 内 workbench.db)。
      expect(existsSync(join(setup.root, 'user-data', 'workbench', 'workbench.db')), 'workbench.db persists under the isolated userData').toBe(true)

      // 任务卡会话运行中徽标 + 侧板挂接行 active(FT-044 成功链序)。
      await openTasksBoard(page, set.facts.taskCount)
      await expect(
        page.locator(`[data-dsh-forge-node-card="${KEY}"] [data-dsh-forge-badge="session-live"]`),
        '任务卡呈现会话运行中徽标(携带会话标识)',
      ).toHaveAttribute('data-dsh-forge-session-id', sessionId, { timeout: 10_000 })
      await openDock(page, KEY)
      await expect(
        page.locator(`[data-dsh-forge-detail-link="${sessionId}"]`),
        '挂接历史呈现 active 行',
      ).toHaveAttribute('data-link-status', 'active', { timeout: 15_000 })

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    disposeJourney(setup)
  }
})

test('step-3/no-prompt-disabled [@web-e2e @journey task-session-execution-loop]: probe unavailable disables the entry with a reason tooltip, no error surface, no session/link writes', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)

  const setup = setUpJourney()
  const { set, stub, channel, project, session } = setup
  const KEY = pickTaskKey(set, task => task.status === 'pending', 'pending task')
  // ERR_NO_PROMPT 通道:键合法但 stub prompt 非零退出(FT-039/FT-043)。
  stub.writeControl({ prompt: { mode: 'fail', stderr: 'ERROR_CODE: ERR_NO_PROMPT\nERROR: stub orchestrated no-prompt\n' } })

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      const projectId = await registerFixtureProject(page, project)
      await openTasksBoard(page, set.facts.taskCount)

      const trigger = page.locator(`[data-dsh-forge-node-card="${KEY}"] [data-dsh-forge-launch-trigger][data-mount="node-hover"]`)
      await expect(trigger, 'probe must reach unavailable (stub CLI failed)').toHaveAttribute('data-probe', 'unavailable', { timeout: 20_000 })
      await expect(trigger, '入口禁用(前置不满足,UF5 校验映射)').toBeDisabled()
      await expect(trigger, '原因说明 tooltip = launch.reason.noPrompt(双语任一)').toHaveAttribute('title', new RegExp(`${zh['launch.reason.noPrompt'].replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${en['launch.reason.noPrompt'].replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))

      // 尝试点击(force,禁用态)不得弹任何错误/确认面。
      await trigger.click({ force: true }).catch(() => {})
      await page.waitForTimeout(500)
      expect(await page.locator('[data-dsh-forge-dialog]').count(), '探测失败不是错误面 — 零对话框').toBe(0)

      // 键合法 ⇒ 探测确实 spawn 了 CLI(journal 留痕 argv)。
      expect(
        stub.readJournal().some(invocation => invocation.argv[0] === 'prompt' && invocation.argv[2] === KEY.slice(KEY.lastIndexOf('/') + 1)),
        'probe spawned `forge prompt get-by-task-id <localId>`',
      ).toBe(true)

      // 无会话创建、无挂接索引写入。
      expect(channel.readJournal().filter(entry => entry.kind === 'create'), '零会话创建').toEqual([])
      expect(await page.locator('[data-dsh-forge-badge="session-live"]').count(), '零会话运行中徽标').toBe(0)
      const detail = await readTaskDetail(page, projectId, KEY)
      expect(detail.links, '无挂接索引写入').toEqual([])

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    disposeJourney(setup)
  }
})

test('step-3/launch-channel-failure [@web-e2e @journey task-session-execution-loop]: tier-1 fail routes (FT-042) — non-silent terminal ≤45s, no half-initialized link, retry succeeds via tier-1', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)

  const setup = setUpJourney()
  const { set, channel, project, session } = setup
  const KEY = pickTaskKey(set, task => task.status === 'pending' && task.record === null, 'pending + 无记录')

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      const projectId = await registerFixtureProject(page, project)
      await openTasksBoard(page, set.facts.taskCount)
      await openDock(page, KEY)
      const trigger = panelTriggerOf(page, KEY)
      await expect(trigger).toHaveAttribute('data-probe', 'available', { timeout: 20_000 })

      // tier-1 create 'fail' = ROUTE(FT-042),从不作为错误呈现。
      channel.writeControl({ create: 'fail', createError: 'stub tier-1 create failed (orchestrated)' })
      const failLegCreateId = await (async () => {
        await trigger.click()
        await expect(page.locator('[data-dsh-forge-dialog="launch-confirm"]')).toBeVisible({ timeout: 10_000 })
        await page.keyboard.press('Enter')
        return await pollChannelJournal(channel, entry => entry.kind === 'create', 'the failed-leg create journal line').then(entry => entry.sessionId ?? '')
      })()
      expect(failLegCreateId).not.toBe('')

      // 三终态齐备、无静默:45s 内接受 tier-2 恢复跳转 / 降级 toast / 失败对话框。
      let terminal: 'jump' | 'degraded-toast' | 'failed-dialog' | null = null
      const deadline = Date.now() + 45_000
      while (Date.now() < deadline && terminal === null) {
        if (await page.locator('[data-dsh-forge-shell]').count() === 0) terminal = 'jump'
        else if (await page.locator('[data-dsh-forge-launch-toast]').count() > 0) terminal = 'degraded-toast'
        else if (await page.locator('[data-dsh-forge-launch-error-detail]').count() > 0) terminal = 'failed-dialog'
        else await page.waitForTimeout(250)
      }
      expect(terminal, '发起链以三终态之一收束(FT-042:tier-2 恢复跳转同为合法 ROUTE 终态)— 无静默').not.toBeNull()
      // 发起/确认态被离开:确认对话框不再占据(跳转卸载 shell / toast / 错误框替代)。
      if (terminal !== 'jump') {
        await expect(page.locator('[data-dsh-forge-dialog="launch-confirm"]')).toHaveCount(0, { timeout: 10_000 })
      }

      // 无半初始化挂接行:未跳转 ⇒ 该任务 links 为空(挂接仅在会话创建成功后写入)。
      if (terminal !== 'jump') {
        await openTasksBoard(page, set.facts.taskCount)
        await openDock(page, KEY)
        const detail = await readTaskDetail(page, projectId, KEY)
        expect(detail.links, '失败腿不残留半初始化挂接记录').toEqual([])
      }

      // 恢复 stub 控制(control 逐调用重读)→ 重试成功:tier-1 journal 带 create+prompt。
      channel.writeControl({})
      // 收掉失败/降级终态的浮层(错误框关闭钮 / 降级 toast 知道了),让入口回到 idle。
      const errorClose = page.locator('[data-dsh-forge-launch-error-close]')
      if (await errorClose.count() > 0) await errorClose.first().click().catch(() => {})
      const toastDismiss = page.locator('[data-dsh-forge-launch-toast-dismiss]')
      if (await toastDismiss.count() > 0) await toastDismiss.first().click().catch(() => {})
      await openTasksBoard(page, set.facts.taskCount)
      await openDock(page, KEY)
      await launchOneClick(page, `[data-dsh-forge-task-detail="${KEY}"] [data-dsh-forge-launch-trigger][data-mount="panel-primary"]`)
      const retriedCreate = await pollChannelJournal(
        channel, entry => entry.kind === 'create' && entry.sessionId !== failLegCreateId, 'the retried tier-1 create')
      const retriedId = retriedCreate.sessionId ?? ''
      expect(retriedId).not.toBe(failLegCreateId)
      await pollChannelJournal(channel, entry => entry.kind === 'prompt' && entry.sessionId === retriedId, 'the retried tier-1 prompt')
      await openTasksBoard(page, set.facts.taskCount)
      await expect(
        page.locator(`[data-dsh-forge-node-card="${KEY}"] [data-dsh-forge-badge="session-live"]`),
        '重试成功后徽标点亮',
      ).toHaveAttribute('data-dsh-forge-session-id', retriedId, { timeout: 10_000 })

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    disposeJourney(setup)
  }
})

test('step-3/duplicate-launch-supersede [@web-e2e @journey task-session-execution-loop]: second launch ends the prior active row (kept), new row active, forge tree byte-identical', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)

  const setup = setUpJourney()
  const { set, channel, project, session } = setup
  const KEY = pickTaskKey(set, task => task.status === 'pending' && task.record === null, 'pending + 无记录')

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      await registerFixtureProject(page, project)
      await openTasksBoard(page, set.facts.taskCount)

      // 第一次发起(node-hover 入口)。
      await launchOneClick(page, `[data-dsh-forge-node-card="${KEY}"] [data-dsh-forge-launch-trigger][data-mount="node-hover"]`)
      const firstCreate = await pollChannelJournal(channel, entry => entry.kind === 'create', 'the first session create')
      const sessionIdOne = firstCreate.sessionId ?? ''
      expect(sessionIdOne).not.toBe('')
      // forge 树基线(挂接只写工作台自有状态 —— codeRoot 不得有任何字节变化)。
      const forgeTreeBaseline = hashTree(project.codeRoot)

      // 同任务再次发起(panel-primary 入口)。
      await openTasksBoard(page, set.facts.taskCount)
      await openDock(page, KEY)
      await launchOneClick(page, `[data-dsh-forge-task-detail="${KEY}"] [data-dsh-forge-launch-trigger][data-mount="panel-primary"]`)
      const secondCreate = await pollChannelJournal(
        channel, entry => entry.kind === 'create' && entry.sessionId !== sessionIdOne, 'the second session create')
      const sessionIdTwo = secondCreate.sessionId ?? ''
      expect(sessionIdTwo).not.toBe(sessionIdOne)

      // 挂接索引:多条挂接可辨 —— 新 active 与已 ended 并列(新→旧),行保留。
      await openTasksBoard(page, set.facts.taskCount)
      await openDock(page, KEY)
      await expect.poll(async () => {
        const rows = page.locator('[data-dsh-forge-detail-link]')
        if (await rows.count() < 2) return []
        return await rows.evaluateAll(nodes => nodes.map(node => ({
          sessionId: node.getAttribute('data-dsh-forge-detail-link') ?? '',
          status: node.getAttribute('data-link-status') ?? '',
        })))
      }, { timeout: 15_000 }).toEqual([
        { sessionId: sessionIdTwo, status: 'active' },
        { sessionId: sessionIdOne, status: 'ended' },
      ])
      // 徽标跟随新会话;旧挂接会话本体不被强制结束(仅挂接行状态迁移)。
      await expect(
        page.locator(`[data-dsh-forge-node-card="${KEY}"] [data-dsh-forge-badge="session-live"]`),
      ).toHaveAttribute('data-dsh-forge-session-id', sessionIdTwo, { timeout: 10_000 })

      // forge 数据不受影响(挂接为工作台自有状态 —— 唯一事实源不被第二化)。
      expect(hashTree(project.codeRoot), 'codeRoot 树 md5 前后全等(零 forge 写入)').toBe(forgeTreeBaseline)

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    disposeJourney(setup)
  }
})

test('step-3/interrupted-launch [@web-e2e @journey task-session-execution-loop]: hard kill mid-hanging create → reboot leaves no half-initialized link and relaunch succeeds', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)

  const setup = setUpJourney()
  const { set, channel, project, session } = setup
  const KEY = pickTaskKey(set, task => task.status === 'pending' && task.record === null, 'pending + 无记录')

  try {
    let shell = await session.boot()
    let hungCreateId = ''
    try {
      const { page } = shell
      await registerFixtureProject(page, project)
      await openTasksBoard(page, set.facts.taskCount)
      await openDock(page, KEY)
      const trigger = panelTriggerOf(page, KEY)
      await expect(trigger).toHaveAttribute('data-probe', 'available', { timeout: 20_000 })

      // 发起链进行中:create 腿挂起(10s 每腿护栏之内)⇒ 硬杀 Electron 主进程。
      channel.writeControl({ create: 'hang' })
      await trigger.click()
      await expect(page.locator('[data-dsh-forge-dialog="launch-confirm"]')).toBeVisible({ timeout: 10_000 })
      await page.keyboard.press('Enter')
      const hungCreate = await pollChannelJournal(channel, entry => entry.kind === 'create', 'the hung create journal line')
      hungCreateId = hungCreate.sessionId ?? ''
      expect(hungCreateId).not.toBe('')

      const mainPid = await shell.electronApp.evaluate(() => process.pid)
      process.kill(mainPid) // 发起链中途强制退出(契约 Preconditions 的测试通道)
      const exitDeadline = Date.now() + 20_000
      while (Date.now() < exitDeadline) {
        if (!isProcessAlive(mainPid)) break
        await new Promise(resolve => setTimeout(resolve, 250))
      }
      expect(isProcessAlive(mainPid), `electron main pid ${String(mainPid)} died after the hard kill`).toBe(false)
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }

    // 重启(同 factory:同 userData + 同 config root;控制恢复 ok)。
    channel.writeControl({})
    shell = await session.boot()
    try {
      const { page } = shell
      const projectId = await readActiveProjectId(page)
      expect(typeof projectId, '重启后注册项目仍在(workbench.db,沿用 M1 崩溃恢复)').toBe('string')
      await openTasksBoard(page, set.facts.taskCount)

      // 无半初始化挂接行:该任务 links 为空;零徽标。
      await openDock(page, KEY)
      const detail = await readTaskDetail(page, projectId ?? '', KEY)
      expect(detail.links, '中断不残留指向不存在会话的 active 行(挂接索引原子性)').toEqual([])
      expect(await page.locator('[data-dsh-forge-badge="session-live"]').count(), '零会话运行中徽标').toBe(0)

      // 可重新发起会话:重试成功(journal 新 create ≠ 挂起腿 id)。
      await launchOneClick(page, `[data-dsh-forge-task-detail="${KEY}"] [data-dsh-forge-launch-trigger][data-mount="panel-primary"]`)
      const relaunched = await pollChannelJournal(
        channel, entry => entry.kind === 'create' && entry.sessionId !== hungCreateId, 'the relaunched create')
      const relaunchedId = relaunched.sessionId ?? ''
      expect(relaunchedId).not.toBe(hungCreateId)
      await openTasksBoard(page, set.facts.taskCount)
      await expect(
        page.locator(`[data-dsh-forge-node-card="${KEY}"] [data-dsh-forge-badge="session-live"]`),
      ).toHaveAttribute('data-dsh-forge-session-id', relaunchedId, { timeout: 10_000 })

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    disposeJourney(setup)
  }
})
