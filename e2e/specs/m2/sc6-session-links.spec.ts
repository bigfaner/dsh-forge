// @feature:dsh-forge-m2-pipeline @web-e2e
// 5.2 SC6③ 挂接双侧（AC3）：双数据源相异断言（sessionLinks 分型读面 + 悬浮面板呈现）。
// tech-design Interface 1 sessionLinks（links ∪ records.session_id 双源分型卡）+
// PRD SC6③。m3.1 D5/D6 锚迁移台账（断言零弱化）：会话头挂接 pill 退役（槽位卸载）
// ——监视面 = 派发任务悬浮面板（ShellHost 常驻树，仅 link 源行）；pill 双源分型呈现
// 断言迁面板 link 行 + RPC 双源读面（record 分型数据断言保留——分型真相在库行）；
// pill 点击导航（dock 开概览 + 任务子 tab + feature 选中）随 UF-3 流程 7 旧链退役
// ——继任断言 = 行点击就地开任务详情弹窗（零会话跳转/零 dock 强开，裁决 #1）。
//   · 会话夹具 = 零凭据径（fix-42 台账口径：芯片流开户 + composer 一条消息 = 用户事件
//     落地 → 非 blank → 会话头常显；模型调用失败不影响会话建档——Hard Rule 零真实模型）；
//   · 双源构造 = 回放主径 claim（link upsert-ignore 唯一写源 + claim 记录 session_id）——
//     同任务同会话双侧参与 → 两卡并存（§6-24④ 诚实审计：不合并解释）；
//   · 断言面：悬浮面板行锚（data-dswf-dp-row）+ 会话头零产品 pill（D5 卸载断言）+
//     RPC 单发读（直读即见）+ 行点击 = 弹窗就地打开（ShellHost 常驻树直开——挂载独立
//     于 dock 概览 tab）+ 写推送状态刷新（subscribeTasksChanged 既有机制）。
// M3 drift 台账（5.2 落定）：featureSlug → source:ContainerRef 容器化（1.1/2.4）+ INSERT 列
// source_kind/source_id（schema v1 直改）+ 4.6 v22 容器 pill/视图下拉锚随迁；claimTask 桥直调
// = core 服务 API 保留面（3.5 tool 退役——drift #1 处置：回放主径零波及）。

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import type { SessionTaskLinkCard } from '../../../packages/contracts/src/dto/forge.js'
import { FEATURES_CHANNELS, TASKS_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { forgeInvoke, registerProject, selectWorkspaceViaChip } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { ensureNoBlockingDialog } from '../../support/modals.js'
import { findFixtureSession } from '../../support/session-files.js'
import {
  COMPOSER_INPUT,
  DP_PANEL,
  DP_ROW_ANY,
  OV_PANEL,
  RIGHTBAR_COLLAPSED,
  SESSION_HEADER_ACTIONS,
  TD_DRAWER,
  dpRowOf,
  projectRowOf,
} from '../../support/anchors.js'
import { createBridgeDriver, refetchOnce } from '../../support/replay/executor.js'

/** 夹具工作区名（芯片选择/会话目录定位共用——注册名 = 目录名） */
const WS_NAME = 'ws-sc6'
/** 夹具 feature slug */
const FEATURE = 'sc6-feat'

test('@web-e2e @m2 5.2 SC6③：挂接双侧双源相异断言（悬浮面板呈现 + 事件刷新 + 行点击弹窗零跳转）', async () => {
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
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: FEATURE, title: 'SC6③ 挂接双侧演示' })
    const driver = createBridgeDriver(app)
    const added = (await driver.call('forgeTasks', 'addTask', {
      projectId,
      source: { kind: 'feature', slug: FEATURE },
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

    // ── 挂接前：面板空态（零挂接不占对话区）+ RPC 双源空 + D5 会话头零产品 pill ──
    const before = await refetchOnce<SessionTaskLinkCard[]>(page, TASKS_CHANNELS.sessionLinks, { projectId, sessionId })
    expect(before, '挂接前 sessionLinks 空').toEqual([])
    await expect(page.locator(DP_PANEL), '挂接前面板不出场（零挂接零占位）').toHaveCount(0)
    // D5 卸载断言：会话头动作带槽零产品件（4.2 首位注册退役——官方占用者不受扰）
    await expect(
      page.locator(SESSION_HEADER_ACTIONS).locator('[data-dswf-stp-pill], [data-dswf-stp], [data-dswf-dp]'),
      '会话头动作带零产品 pill（D5 卸载断言）',
    ).toHaveCount(0)

    // ── 双源构造：claim（回放主径写）→ link 行（派发会话）+ claim 记录 session_id（执行会话）──
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: added.slug, localId: added.localId }, sessionId })

    // RPC 单发读：双源两卡（同任务同会话双侧参与 → 两卡并存，source 分型相异）
    const cards = await refetchOnce<SessionTaskLinkCard[]>(page, TASKS_CHANNELS.sessionLinks, { projectId, sessionId })
    expect(cards, 'sessionLinks 双源两卡并存（§6-24④ 不合并解释）').toHaveLength(2)
    expect(cards.map((c) => c.source).sort(), '分型相异：link + record 各一').toEqual(['link', 'record'])
    expect(cards.every((c) => c.taskId === added.taskId && c.sessionId === sessionId), '两卡同任务同会话（taskId 含卡）').toBe(true)

    // UI 面：悬浮面板 link 行呈现（事件驱动刷新收敛面；record 卡过滤——面板恒单行）
    const row = page.locator(dpRowOf(added.taskId)).first()
    await expect(page.locator(DP_PANEL).first(), '悬浮面板在场（对话列内浮层）').toBeVisible({ timeout: 15_000 })
    await expect(row, '面板行在场（link 源——键 + 标题）').toBeVisible({ timeout: 15_000 })
    await expect(row).toContainText(`${added.slug}/${added.localId}`)
    await expect(row).toContainText('SC6③ 挂接双侧任务')
    await expect(row, '行状态文本（claim 后进行中）').toContainText('进行中')
    await expect(page.locator(DP_ROW_ANY), '面板恒单行（record 审计卡过滤——D6 裁决 #2）').toHaveCount(1)

    // ── 结算（同会话执行）：submit success → 行状态文本写推送刷新（subscribeTasksChanged）──
    await driver.call('forgeTasks', 'submitTask', {
      projectId,
      taskRef: { slug: added.slug, localId: added.localId },
      result: 'success',
      summary: 'SC6③ 挂接双侧结算（5.2 e2e）',
      gate: { compile: true, fmt: true, lint: true, test: true },
      sessionId,
    })
    await expect(row, '行状态写推送刷新为已完成').toContainText('已完成', { timeout: 15_000 })

    // ── 行点击 = 任务详情弹窗就地打开（裁决 #1：零会话跳转/零 dock 强开）──
    await row.click()
    await expect(page.locator(TD_DRAWER).first(), '任务弹窗开（就地打开）').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(TD_DRAWER).locator('.dswf-td-status')).toHaveText(/已完成/)
    // 弹窗宿主 = ShellHost 常驻树（shell.overlay 槽——对话中就地打开，挂载独立于 dock 概览 tab）
    await expect(
      page.locator('[data-dswf-workbench]').locator(TD_DRAWER).first(),
      '弹窗宿主 = ShellHost 常驻树',
    ).toBeVisible()
    await expect(
      page.locator(OV_PANEL).locator(TD_DRAWER),
      '概览 tab body 内零弹窗节点（挂载独立于 dock 概览 tab）',
    ).toHaveCount(0)
    // 零 dock 强开：右栏保持收起（行点击不开概览——旧 pill 导航链已随 D5 退役）
    await expect(page.locator(RIGHTBAR_COLLAPSED).first(), '右栏保持收起（零 dock 强开）').toBeAttached()
    // 零会话跳转：面板仍在场（主视图未跳其它会话面——worker/其它会话无 link 行集）
    await expect(page.locator(DP_PANEL).first(), '面板仍在场（零会话跳转）').toBeVisible()

    // 零凭据形态的模型失败面不计入产品断言（pageerror 留痕诊断——不伪造凭据不遮蔽）
    if (pageErrors.length > 0) console.log(`[sc6-diagnostic] pageerror（零凭据模型失败面，非产品断言面）：${pageErrors.slice(-5).join(' | ')}`)
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})
