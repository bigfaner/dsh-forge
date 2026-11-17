// @feature:dsh-forge-m2-pipeline @web-e2e
// 5.2 SC6③ 挂接双侧（AC3）：双数据源相异断言（sessionLinks 分型读面——分型真相在库行）。
// tech-design Interface 1 sessionLinks（links ∪ records.session_id 双源分型卡）+ PRD SC6③。
// 锚迁移台账（plugin-spec/fix-8 族④B）：会话头 pill → 派发任务悬浮面板（m3.1 D6 继任面）
// → 悬浮面板/任务抽屉随 task-loop 接管批再退役（DispatchEventsPanel 接替——接管版承接测试
// 不在本批重写）：呈现面断言（面板行/计数/弹窗/几何）退役，双源分型数据断言（RPC 单发读）
// 全量保留。
//   · 会话夹具 = 零凭据径（fix-42 台账口径：芯片流开户 + composer 一条消息 = 用户事件
//     落地 → 非 blank → 会话头常显；模型调用失败不影响会话建档——Hard Rule 零真实模型）；
//   · 双源构造 = 回放主径 claim（link upsert-ignore 唯一写源 + claim 记录 session_id）——
//     同任务同会话双侧参与 → 两卡并存（§6-24④ 诚实审计：不合并解释）；
//   · 断言面：RPC 单发读（直读即见）+ 结算后状态刷新（detail 单发）+ 会话头零产品 pill
//     （D5 卸载断言——槽位退役恒零命中）。

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import type { SessionTaskLinkCard, TaskDetail } from '../../../packages/contracts/src/dto/forge.js'
import { FEATURES_CHANNELS, TASKS_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { forgeInvoke, registerProject, selectWorkspaceViaChip } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { ensureNoBlockingDialog } from '../../support/modals.js'
import { findFixtureSession } from '../../support/session-files.js'
import { COMPOSER_INPUT, SESSION_HEADER_ACTIONS, projectRowOf } from '../../support/anchors.js'
import { createBridgeDriver, refetchOnce } from '../../support/replay/executor.js'
import { projectKeyOf } from '../../../e2e/support/project-key.js'

/** 夹具工作区名（芯片选择/会话目录定位共用——注册名 = 目录名） */
const WS_NAME = 'ws-sc6'
/** 夹具 feature slug */
const FEATURE = 'sc6-feat'

test('@web-e2e @m2 5.2 SC6③：挂接双侧双源相异断言（sessionLinks 分型读面直读 + 结算状态刷新）', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-sc6-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-sc6-ud-'))
  const dshHome = join(userData, 'dsh-home')
  const launched: Launched = await launchHost({ userData, env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    // ── 底座：注册 + feature + 任务（回放主径写）──
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const projectKey = projectKeyOf(wsDir)
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: FEATURE, title: 'SC6③ 挂接双侧演示' })
    const driver = createBridgeDriver(app)
    const added = (await driver.call('forgeTasks', 'addTask', {
      projectKey,
      slug: FEATURE,
      title: 'SC6③ 挂接双侧任务',
      type: 'doc',
    })) as { taskId: string; slug: string; localId: string }

    // ── 零凭据会话夹具：芯片流选定工作区 → composer 一条消息（非 blank → 会话头常显）──
    await selectWorkspaceViaChip(page, WS_NAME)
    const composer = page.locator(COMPOSER_INPUT).last()
    await expect(composer, 'composer 在场（芯片流开户）').toBeVisible({ timeout: 60_000 })
    await composer.click()
    await page.keyboard.insertText('SC6③ 挂接双侧断言夹具消息（零凭据形态）')
    await page.keyboard.press('Enter')
    const block = page.locator(projectRowOf(projectId))
    await expect(block.locator('[data-dswf-session]'), '会话行入树（用户事件落地 = 非 blank）').toBeVisible({ timeout: 60_000 })
    // 零凭据形态：agent 失败可晚到挂载 API Key onboarding 模态（全屏 mask 拦指针）——先点掉
    await ensureNoBlockingDialog(page)
    const session = findFixtureSession(dshHome, WS_NAME)
    expect(session, '会话目录在盘（账本 sessionId 可定位）').toBeDefined()
    const sessionId = (session as { sessionId: string }).sessionId

    // ── 挂接前：RPC 双源空 + D5 会话头零产品 pill ──
    const before = await refetchOnce<SessionTaskLinkCard[]>(page, TASKS_CHANNELS.sessionLinks, { projectKey, sessionId })
    expect(before, '挂接前 sessionLinks 空').toEqual([])
    // D5 卸载断言：会话头动作带槽零产品件（4.2 首位注册退役——官方占用者不受扰）
    await expect(
      page.locator(SESSION_HEADER_ACTIONS).locator('[data-dswf-stp-pill], [data-dswf-stp], [data-dswf-dp]'),
      '会话头动作带零产品 pill（D5 卸载断言）',
    ).toHaveCount(0)

    // ── 双源构造：claim（回放主径写）→ link 行（派发会话）+ claim 记录 session_id（执行会话）──
    await driver.call('forgeTasks', 'claimTask', { projectKey, taskRef: { slug: added.slug, localId: added.localId }, sessionId })

    // RPC 单发读：双源两卡（同任务同会话双侧参与 → 两卡并存，source 分型相异）
    const cards = await refetchOnce<SessionTaskLinkCard[]>(page, TASKS_CHANNELS.sessionLinks, { projectKey, sessionId })
    expect(cards, 'sessionLinks 双源两卡并存（§6-24④ 不合并解释）').toHaveLength(2)
    expect(cards.map((c) => c.source).sort(), '分型相异：link + record 各一').toEqual(['link', 'record'])
    expect(cards.every((c) => c.taskId === added.taskId && c.sessionId === sessionId), '两卡同任务同会话（taskId 含卡）').toBe(true)

    // ── 结算（同会话执行）：submit success → detail 单发读刷新为 completed ──
    await driver.call('forgeTasks', 'submitTask', {
      projectKey,
      taskRef: { slug: added.slug, localId: added.localId },
      result: 'success',
      summary: 'SC6③ 挂接双侧结算（5.2 e2e）',
      gate: { compile: true, fmt: true, lint: true, test: true },
      sessionId,
    })
    const detail = await refetchOnce<TaskDetail>(page, TASKS_CHANNELS.detail, { projectKey, taskId: added.taskId })
    expect(detail.taskStatus, 'submit 后单次重取即见 completed（即时判据）').toBe('completed')
    // 分型末态复验：同任务同会话双侧两卡仍在（link 持久 + record 审计——不合并解释）
    const cardsAfter = await refetchOnce<SessionTaskLinkCard[]>(page, TASKS_CHANNELS.sessionLinks, { projectKey, sessionId })
    expect(cardsAfter.map((c) => c.source).sort(), '末态分型两卡并存（读面直读映射）').toEqual(['link', 'record'])

    // 零凭据形态的模型失败面不计入产品断言（pageerror 留痕诊断——不伪造凭据不遮蔽）
    if (pageErrors.length > 0) console.log(`[sc6-diagnostic] pageerror（零凭据模型失败面，非产品断言面）：${pageErrors.slice(-5).join(' | ')}`)
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})
