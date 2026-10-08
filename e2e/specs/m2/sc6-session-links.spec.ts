// @feature:dsh-forge-m2-pipeline @web-e2e
// 5.2 SC6③ 挂接双侧（AC3）：双数据源相异断言（sessionLinks 分型呈现 + pill 导航）。
// tech-design Interface 1 sessionLinks（links ∪ records.session_id 双源分型卡）+
// Integration #2（会话头 header.actions pill）+ PRD SC6③。
//   · 会话夹具 = 零凭据径（fix-42 台账口径：芯片流开户 + composer 一条消息 = 用户事件
//     落地 → 非 blank → 会话头常显；模型调用失败不影响会话建档——Hard Rule 零真实模型）；
//   · 双源构造 = 回放主径 claim（link upsert-ignore 唯一写源 + claim 记录 session_id）——
//     同任务同会话双侧参与 → 两卡并存（§6-24④ 诚实审计：不合并解释）；
//   · 断言面：pill 分型锚（data-dswf-stp-source link|record）+ RPC 单发读（直读即见）+
//     pill 点击导航全链路（dock 开概览 → 任务子 tab → feature 选中 → 抽屉开）。
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
import { COMPOSER_INPUT, TD_DRAWER, OV_PANEL, ovSubtabOf, projectRowOf, stpPillOf, ttContpillOf } from '../../support/anchors.js'
import { createBridgeDriver, refetchOnce } from '../../support/replay/executor.js'

/** 夹具工作区名（芯片选择/会话目录定位共用——注册名 = 目录名） */
const WS_NAME = 'ws-sc6'
/** 夹具 feature slug */
const FEATURE = 'sc6-feat'

test('@web-e2e @m2 5.2 SC6③：挂接双侧双源相异断言（分型呈现 + 事件刷新 + pill 导航全链路）', async () => {
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

    // ── 挂接前：pill 空态（零挂接 = 槽空输出）+ RPC 双源空 ──
    const before = await refetchOnce<SessionTaskLinkCard[]>(page, TASKS_CHANNELS.sessionLinks, { projectId, sessionId })
    expect(before, '挂接前 sessionLinks 空').toEqual([])
    await expect(page.locator('[data-dswf-stp-pill]'), '挂接前 pill 空态（零挂接不占会话头）').toHaveCount(0)

    // ── 双源构造：claim（回放主径写）→ link 行（派发会话）+ claim 记录 session_id（执行会话）──
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: added.slug, localId: added.localId }, sessionId })

    // RPC 单发读：双源两卡（同任务同会话双侧参与 → 两卡并存，source 分型相异）
    const cards = await refetchOnce<SessionTaskLinkCard[]>(page, TASKS_CHANNELS.sessionLinks, { projectId, sessionId })
    expect(cards, 'sessionLinks 双源两卡并存（§6-24④ 不合并解释）').toHaveLength(2)
    expect(cards.map((c) => c.source).sort(), '分型相异：link + record 各一').toEqual(['link', 'record'])
    expect(cards.every((c) => c.taskId === added.taskId && c.sessionId === sessionId), '两卡同任务同会话（taskId 含卡）').toBe(true)

    // UI 面：会话头 pill 双源呈现（事件驱动刷新收敛面）
    const linkPill = page.locator(stpPillOf(added.taskId, 'link')).first()
    const recordPill = page.locator(stpPillOf(added.taskId, 'record')).first()
    await expect(linkPill, 'pill 分型呈现：link（派发⟞）').toBeVisible({ timeout: 15_000 })
    await expect(linkPill).toContainText('派发')
    await expect(recordPill, 'pill 分型呈现：record（执行⟞）').toBeVisible({ timeout: 15_000 })
    await expect(recordPill).toContainText('执行')
    await expect(linkPill, 'pill 状态文本（claim 后进行中）').toContainText('进行中')

    // ── 结算（同会话执行）：submit success → pill 状态文本事件刷新 ──
    await driver.call('forgeTasks', 'submitTask', {
      projectId,
      taskRef: { slug: added.slug, localId: added.localId },
      result: 'success',
      summary: 'SC6③ 挂接双侧结算（5.2 e2e）',
      gate: { compile: true, fmt: true, lint: true, test: true },
      sessionId,
    })
    await expect(linkPill, 'pill 状态事件刷新为已完成').toContainText('已完成', { timeout: 15_000 })
    await expect(recordPill).toContainText('已完成', { timeout: 15_000 })

    // ── pill 导航全链路（UF-3 流程 7 左半段 → 右栏消费）：dock 开概览 + 任务子 tab +
    //    feature 选中 + 抽屉开（taskFocus nonce 对照应用）──
    await linkPill.click()
    await expect(page.locator(OV_PANEL).first(), 'dock 开概览 tab').toBeVisible({ timeout: 30_000 })
    await expect(page.locator(ovSubtabOf('tasks')), '任务子 tab 激活（聚焦切换）').toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    await expect(page.locator(ttContpillOf('feature', FEATURE)).first(), 'feature 选中（导航载荷富化——slug ≡ feature 不变量）').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(TD_DRAWER).first(), '任务抽屉开（聚焦抽屉面）').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(TD_DRAWER).locator('.dswf-td-status')).toHaveText(/已完成/)

    // 零凭据形态的模型失败面不计入产品断言（pageerror 留痕诊断——不伪造凭据不遮蔽）
    if (pageErrors.length > 0) console.log(`[sc6-diagnostic] pageerror（零凭据模型失败面，非产品断言面）：${pageErrors.slice(-5).join(' | ')}`)
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})
