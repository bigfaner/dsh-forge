// @feature:dsh-forge-m2-pipeline @web-e2e
// gen-test-scripts 产物 —— Journey: task-session-linkage（T-test-gen-scripts）。
// 断言源 = docs/features/dsh-forge-m2-pipeline/testing/task-session-linkage/contracts/
//   step-{1..5}-*.md（eval-contract 913/1100 通过）。
//
// m3.1 D5/D6 锚迁移台账（断言零弱化——会话头挂接 pill 退役 → 派发任务悬浮面板）：
//   - 会话头 pill 断言族（stpPillOf/≤2 并排/+N 溢出菜单）随 D5 槽位卸载退役——继任面 =
//     悬浮面板行集（data-dswf-dp-row，仅 link 源，全量行滚动呈现无截员）；
//   - D33 残差①（1.18）：面板几何对照锚 MAIN_CONVERSATION → CONVERSATION_SCROLL（官方
//     SlotOutlet 洞包裹层 display:contents 零盒不可量测，pin ⑮-4——产品锚源同步退役，
//     DispatchPanel DP_CONV_SELECTOR 同值单点）；断言零弱化 = 右缘内收 16/顶 + 8/非左缘
//     钉位/dock 右缘联动四组几何断言就位（旧块仅 ≥/≤ 弱界）；
//   - pill 导航断言（dock 开概览 + 任务子 tab + feature 选中 + 弹窗）→ 行点击 = 弹窗
//     就地打开 + 零会话跳转 + 零 dock 强开（裁决 #1；taskFocus 聚焦链随写方退役——
//     bridge.openTaskFocus 消费面保留，见 workbench-bridge 台账）；
//   - 溢出/恰二边界断言语义随行语言变迁：pill 并排上限 → 面板全量行 + ⟡N 计数角标；
//   - 双源分型数据断言（sessionLinks RPC 直读）全量保留——分型真相在库行。
//
// 会话夹具形态（fix-42 台账口径）：零凭据径 = 芯片流开户 + composer 一条消息（用户事件
// 落地 → 非 blank → 会话头常显；模型调用失败不影响会话建档——Hard Rule 零真实模型）。
// 会话 id = {userData}/dsh-home 账本（findFixtureSession）——面板绑定主视图会话；
// 派发/执行双源的「相异会话」以 真实会话 × 合成执行会话 构造（挂接/审计行均为库行，
// session_id 无会话存在性校验——数据面等价）。
//
// Fact Table 摘录（源码核实）：
//   - 悬浮面板（DispatchPanel.tsx，m3.1 D6）：[data-dswf-dp]（role=complementary）+
//     [data-dswf-dp-row="<taskId>"]（行集仅 link 源——record 审计卡过滤）+
//     [data-dswf-dp-count]（行计数）+ [data-dswf-dp-session="<taskId>"]（行尾 ⟞ 开
//     worker 执行子会话）+ [data-dswf-dp-collapse]（▁ 折叠）/ [data-dswf-dp-badge]
//     （⟡N 角标）+ [data-dswf-dp-dragged]（拖后停自动锚定）；零派发 = 面板零挂载；
//   - 读面（sessionLinks）：links ∪ records.session_id 双源分型（SC6③ 不合并解释——
//     同任务同会话双侧参与 = 两卡并存）；TaskCard.sessionCount = 双源去重计数
//     （列表副行 ⟞N 挂接——task-tab-model.ts:36）；
//   - 弹窗挂接区：[data-dswf-td-sess="<sessionId>"]（drawer README 台账）；
//   - 行点击（D6 裁决 #1）：桥 openTaskDrawer → ShellHost 常驻树就地开弹窗（零会话
//     跳转/零 dock 强开）；弹窗内会话 pill 跳会话 + 关弹窗（m31-tm-sess 两动作一体）；
//   - 挂接唯一性：task_session_links UNIQUE(task_id, session_id)——重领幂等不增行。
//
// Outcome → 测试映射：
//   Step1-5 success 链（计数→分型→面板→行点击→双侧）…「冒烟：双源分型全链（计数 + 面板行 + 弹窗零跳转）」
//   Step3 success（dispatcher 派发类面板行）……………………………「Step3 派发类行：挂接表源过滤（record 卡不入行集）」
//   Step3 overflow-menu-beyond-two …………………………………………「Step3b 多任务：全量行呈现 + 计数角标（滚动列表无截员）」
//   Step3 exactly-two-inline-no-overflow …………………………………「Step3c 恰 2：两行全量 + 零角标（off-by-one 边界）」
//   Step3 re-claim-dedup-single-pill …………………………………………「Step3d 重领去重：幂等重入单一行（UNIQUE 约束）」
//   Step3 live-pill-on-new-claim ………………………………………………「Step3e 活体挂接：claim 后行即时出现（事件驱动）」
//   Step5 success（executor 执行源会话零面板）…………………………「Step5 执行源会话：零面板（link 源过滤——record 不入行集）」
//   Step5 no-linkage-session-empty ……………………………………………「Step5b 零挂接会话：无面板无角标（空输出）」
//   m3.1 D6 新增 …………………………………………………………………………「悬浮面板几何与交互：默认落位/dock 左移/拖移停锚定/折叠往返/⟞ 树零联动」
//
// Assertion depth: 迁移后台账见上（数据面断言全量保留 + 呈现面断言随行语言等量迁移）。
// M3 drift 台账（5.2 落定）：featureSlug → source:ContainerRef 容器化（1.1/2.4）+ INSERT 列
// source_kind/source_id（schema v1 直改）+ 4.6 v22 容器 pill/视图下拉锚随迁；claimTask 桥直调
// = core 服务 API 保留面（3.5 tool 退役——drift #1 处置：回放主径零波及）。

import { mkdtempSync, existsSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { FEATURES_CHANNELS, TASKS_CHANNELS } from '../../../packages/contracts/src/channels.js'
import type { AddTaskResult, ClaimTaskResult, SessionTaskLinkCard, SubmitTaskResult, TaskCard } from '../../../packages/contracts/src/dto/forge.js'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { forgeInvoke, registerProject, selectWorkspaceViaChip } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { ensureNoBlockingDialog } from '../../support/modals.js'
import { bestSessionLog, findFixtureSession } from '../../support/session-files.js'
import { createBridgeDriver, refetchOnce } from '../../support/replay/executor.js'
import { openForgeDbAt } from '../../support/replay/db-insert.js'
import { newBlankSession } from '../../support/m3.js'
import {
  COLLAPSE_RIGHTBAR_BUTTON,
  COMPOSER_INPUT,
  CONVERSATION_CONTENT,
  CONVERSATION_SCROLL,
  DP_BADGE,
  DP_COLLAPSE,
  DP_HEAD,
  DP_PANEL,
  DP_ROW_ANY,
  DP_SESSION_ANY,
  OV_PANEL,
  RIGHTBAR_COLLAPSED,
  SESSION_HEADER_ACTIONS,
  SESSION_ROW_ANY,
  SIDEBAR_RIGHT_EXPAND,
  TABS_ROW,
  TD_DRAWER,
  dpRowOf,
  projectRowOf,
  sessionRowOf,
} from '../../support/anchors.js'

/** 夹具工作区名（芯片选择 / 会话目录定位共用——注册名 = 目录名） */
const WS_NAME = 'ws-tsl'
/** 合成执行会话 id（与真实 dispatcher 会话相异可判——SC6③ 双源前提；dp/ex 两测试沿用） */
const EXEC_SESSION = 'e2e-tsl-executor-synth'
/** dispatcher 会话夹具消息（D22 pill 跳转断言锚——对话面板转录判据） */
const DISPATCH_MESSAGE = 'tsl 挂接双侧断言夹具消息（零凭据形态）'
/** worker 会话夹具消息（D22 双源 pill 分别跳转——执行会话转录判据；⟞ 树零联动判据） */
const WORKER_MESSAGE = 'tsl worker 执行会话夹具消息（零凭据形态）'

/** 夹具工作区全部会话 id（盘侧目录扫描——mtime 升序；D22 双会话定位 = 创建前后差集） */
function fixtureSessionIds(dshHome: string, fixtureSegment: string): string[] {
  const sessionsDir = join(dshHome, 'sessions')
  const found: { id: string; mtime: number }[] = []
  if (existsSync(sessionsDir)) {
    for (const wsDir of readdirSync(sessionsDir, { withFileTypes: true })) {
      if (!wsDir.isDirectory() || !wsDir.name.includes(fixtureSegment)) continue
      for (const sDir of readdirSync(join(sessionsDir, wsDir.name), { withFileTypes: true })) {
        if (!sDir.isDirectory()) continue
        const log = bestSessionLog(join(sessionsDir, wsDir.name, sDir.name))
        found.push({ id: sDir.name, mtime: log !== undefined ? statSync(log).mtimeMs : 0 })
      }
    }
  }
  return found.sort((a, b) => a.mtime - b.mtime).map((entry) => entry.id)
}

/** 零凭据会话开户（fix-42 台账径）：芯片流选定工作区 → composer 一条消息 → 账本定位会话 id */
async function openRealSession(page: Page, userData: string, projectId: string): Promise<string> {
  await selectWorkspaceViaChip(page, WS_NAME)
  const composer = page.locator(COMPOSER_INPUT).last()
  await expect(composer, 'composer 在场（芯片流开户）').toBeVisible({ timeout: 60_000 })
  await composer.click()
  await page.keyboard.insertText(DISPATCH_MESSAGE)
  await page.keyboard.press('Enter')
  await expect(page.locator(projectRowOf(projectId)).locator('[data-dswf-session]'), '会话行入树（用户事件落地 = 非 blank）').toBeVisible({ timeout: 60_000 })
  await ensureNoBlockingDialog(page)
  const session = findFixtureSession(join(userData, 'dsh-home'), WS_NAME)
  expect(session, '会话目录在盘（账本 sessionId 可定位）').toBeDefined()
  return (session as { sessionId: string }).sessionId
}

/** 第二真实会话（m3.1 D22：worker 执行源——pill 跳转对面对话面板断言需真会话）：官方新会话
 *  入口（首会话非 blank 后真新建）+ composer 落地 + 盘侧创建前后差集定位 id。 */
async function openWorkerSession(page: Page, userData: string, before: readonly string[]): Promise<string> {
  await newBlankSession(page)
  // 晚到模态处置：dispatcher 会话零凭据模型调用异步失败 → API Key onboarding 可在开户
  // ensureNoBlockingDialog 之后才挂载（modals.ts 既有「晚到再点掉」径——点击面防拦截）
  await ensureNoBlockingDialog(page)
  const composer = page.locator(COMPOSER_INPUT).last()
  await expect(composer, 'composer 在场（worker 会话开户）').toBeVisible({ timeout: 60_000 })
  await composer.click()
  await page.keyboard.insertText(WORKER_MESSAGE)
  await page.keyboard.press('Enter')
  await expect(page.locator(CONVERSATION_CONTENT).first(), 'worker 消息入转录（用户事件落地）').toContainText(WORKER_MESSAGE, { timeout: 60_000 })
  await ensureNoBlockingDialog(page)
  const dshHome = join(userData, 'dsh-home')
  const deadline = Date.now() + 30_000
  for (;;) {
    const fresh = fixtureSessionIds(dshHome, WS_NAME).find((id) => !before.includes(id))
    if (fresh !== undefined) return fresh
    if (Date.now() > deadline) throw new Error('worker 会话目录未出现（30s 超时——盘侧差集定位）')
    await page.waitForTimeout(2_000)
  }
}

/** 底座 + 一条已挂接任务（真实会话 claim）——返回任务与真实会话 id */
async function linkedTask(
  page: Page,
  driver: ReturnType<typeof createBridgeDriver>,
  projectId: string,
  userData: string,
  feature: string,
  title: string,
): Promise<{ added: AddTaskResult; sessionId: string }> {
  const added = (await driver.call('forgeTasks', 'addTask', {
    projectId, source: { kind: 'feature', slug: feature }, title, type: 'doc',
  })) as AddTaskResult
  const sessionId = await openRealSession(page, userData, projectId)
  return { added, sessionId }
}

test('@web-e2e @m2 挂接双侧·冒烟：双源分型全链（副行计数 + 面板行 + 行点击弹窗零跳转）', async () => {
  test.setTimeout(600_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tsl-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tsl-ud-'))
  const launched: Launched = await launchHost({ userData, env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'tsl-feat'
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: FEATURE, title: '挂接双侧演示' })
    const driver = createBridgeDriver(app)
    const { added, sessionId } = await linkedTask(page, driver, projectId, userData, FEATURE, '挂接双侧冒烟任务')

    // ── 挂接前基线：零挂接（面板零挂载 + 双源空 + D5 会话头零产品 pill）──
    const before = await refetchOnce<SessionTaskLinkCard[]>(page, TASKS_CHANNELS.sessionLinks, { projectId, sessionId })
    expect(before, '挂接前 sessionLinks 空').toEqual([])
    await expect(page.locator(DP_PANEL), '挂接前面板零挂载（零挂接不占对话区）').toHaveCount(0)
    await expect(
      page.locator(SESSION_HEADER_ACTIONS).locator('[data-dswf-stp-pill], [data-dswf-stp], [data-dswf-dp]'),
      '会话头动作带零产品 pill（D5 卸载断言）',
    ).toHaveCount(0)

    // ── 双源构造（m3.1 D22 真双会话）：worker 真实会话 B（执行源——pill 跳转断言需真会话）
    //    + claim 真实会话 A（link 派发源）+ submit 会话 B（record 执行源）──
    const beforeWorker = fixtureSessionIds(join(userData, 'dsh-home'), WS_NAME)
    const workerSession = await openWorkerSession(page, userData, beforeWorker)
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: added.slug, localId: added.localId }, sessionId })
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: added.slug, localId: added.localId }, result: 'success',
      summary: 'tsl 冒烟：执行会话结算', gate: { compile: true, fmt: true, lint: true, test: true }, sessionId: workerSession,
    })
    // 回 dispatcher 会话 A（面板断言面——worker 开户后主视图切到了 B）
    await page.locator(sessionRowOf(sessionId)).first().click()

    // ── Step 1：任务列表副行挂接计数（双源去重 = 2）──
    const cards = await refetchOnce<TaskCard[]>(page, TASKS_CHANNELS.list, { projectId, source: { kind: 'feature', slug: FEATURE } })
    const card = cards.find((c) => c.taskId === added.taskId)
    expect(card?.sessionCount, '副行承重数据：挂接计数 = 2（link + record 去重）').toBe(2)

    // ── Step 2：详情分型（两类各自与来源库记录一致）──
    const detailCards = await refetchOnce<SessionTaskLinkCard[]>(page, TASKS_CHANNELS.sessionLinks, { projectId, sessionId: workerSession })
    expect(detailCards, '执行会话侧：record 分型单卡').toEqual([
      { taskId: added.taskId, slug: added.slug, localId: added.localId, title: '挂接双侧冒烟任务', taskStatus: 'completed', sessionId: workerSession, source: 'record' },
    ])
    const realCards = await refetchOnce<SessionTaskLinkCard[]>(page, TASKS_CHANNELS.sessionLinks, { projectId, sessionId })
    // §6-24④ 诚实审计：claim 审计行也带本会话 id → 派发会话两卡并存（link + record——
    // sc6-session-links.spec 已钉死；此处 record 卡源于 claim 审计行，非 submit 执行会话）
    expect(realCards.map((c) => c.source).sort(), '派发会话侧：link + record 两卡并存（§6-24④）').toEqual(['link', 'record'])
    expect(realCards.every((c) => c.sessionId === sessionId), '两卡均 = 真实 dispatcher 会话（与执行会话相异可判）').toBe(true)

    // ── Step 3：dispatcher 悬浮面板（link 源行——record 卡过滤恒单行）──
    const row = page.locator(dpRowOf(added.taskId)).first()
    await expect(page.locator(DP_PANEL).first(), '悬浮面板在场（对话列内浮层）').toBeVisible({ timeout: 30_000 })
    await expect(row, '派发任务行在场（挂接表源）').toBeVisible({ timeout: 30_000 })
    await expect(row).toContainText(`${added.slug}/${added.localId}`)
    await expect(row, '行状态文本（结算后已完成）').toContainText('已完成')
    await expect(page.locator(DP_ROW_ANY), '面板恒单行（claim 审计 record 卡过滤——D6 裁决 #2）').toHaveCount(1)

    // ── Step 4：行点击 = 弹窗就地打开（零会话跳转/零 dock 强开——裁决 #1）──
    await row.click()
    await expect(page.locator(TD_DRAWER).first(), '任务弹窗开（就地打开）').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(TD_DRAWER).first()).toContainText('挂接双侧冒烟任务')
    await expect(page.locator(TD_DRAWER).first(), '弹窗默认简要形态（裁决 #11 不记忆展开态）').toHaveAttribute('data-dswf-td-form', 'brief')
    // 零 dock 强开：右栏保持收起 + 概览 tab body 零挂载（行点击不开概览——旧 pill 导航链退役）
    await expect(page.locator(RIGHTBAR_COLLAPSED).first(), '右栏保持收起（零 dock 强开）').toBeAttached()
    await expect(page.locator(OV_PANEL).locator(TD_DRAWER), '概览 tab body 零弹窗节点').toHaveCount(0)
    // 零会话跳转：主视图仍为派发会话 A（转录判据 + 面板仍在场）
    await expect(page.locator(CONVERSATION_CONTENT).first(), '零会话跳转（转录仍 = 派发会话 A）').toContainText(DISPATCH_MESSAGE, { timeout: 30_000 })
    await expect(page.locator(DP_PANEL).first(), '面板仍在场（零会话跳转）').toBeVisible()
    // m3.1 D22：⤢ 展开后挂接 pill 可见（完整形态时间线双源 pill）
    await page.locator(TD_DRAWER).first().locator('[data-dswf-td-expand]').click()
    // 弹窗挂接区：双源会话 pill 并存（真实 dispatcher + 真实 worker——不混示为同一会话）
    await expect(page.locator(`[data-dswf-td-sess="${sessionId}"]`).first(), '弹窗挂接区：派发会话 pill（dispatcher）').toBeVisible()
    await expect(page.locator(`[data-dswf-td-sess="${workerSession}"]`).first(), '弹窗挂接区：执行会话 pill（worker——相异可判）').toBeVisible()

    // ── Step 6（m3.1 D22）：双源会话 pill 分别跳对应对话面板（+ 弹窗关闭——原型 m31-tm-sess 两动作一体）──
    // 当前主视图 = dispatcher 会话 A → 先点 worker pill（真导航可判）
    await page.locator(`[data-dswf-td-sess="${workerSession}"]`).first().click()
    await expect(page.locator(TD_DRAWER), 'pill 点击 = 弹窗关闭（跳会话两动作一体）').toHaveCount(0)
    await expect(page.locator(CONVERSATION_CONTENT).first(), 'worker pill → 对话面板 = 执行会话 B（转录判据）').toContainText(WORKER_MESSAGE, { timeout: 30_000 })
    // worker 会话零派发 → 面板退场（仅本会话派发 link 源——自然结果断言）
    await expect(page.locator(DP_PANEL), 'worker 会话零面板（link 源过滤——面板仅本会话派发）').toHaveCount(0, { timeout: 15_000 })
    // 回派发会话 A → 面板复现 + 行点击重开弹窗（默认简要——D22 不记忆展开态）→ dispatcher pill 跳回
    await page.locator(sessionRowOf(sessionId)).first().click()
    await expect(page.locator(DP_PANEL).first(), '回派发会话 → 面板复现（主视图会话锚驱动）').toBeVisible({ timeout: 30_000 })
    await page.locator(dpRowOf(added.taskId)).first().click()
    await expect(page.locator(TD_DRAWER).first(), '重开弹窗在场').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(TD_DRAWER).first(), '重开回默认简要形态（裁决 #11 不记忆展开态）').toHaveAttribute('data-dswf-td-form', 'brief')
    await page.locator(TD_DRAWER).first().locator('[data-dswf-td-expand]').click()
    await page.locator(`[data-dswf-td-sess="${sessionId}"]`).first().click()
    await expect(page.locator(TD_DRAWER), 'dispatcher pill 点击 = 弹窗关闭').toHaveCount(0)
    await expect(page.locator(CONVERSATION_CONTENT).first(), 'dispatcher pill → 对话面板 = 派发会话 A（转录判据）').toContainText(DISPATCH_MESSAGE, { timeout: 30_000 })

    // 零凭据形态的模型失败面不计入产品断言（pageerror 留痕诊断——不伪造凭据不遮蔽）
    if (pageErrors.length > 0) console.log(`[tsl-diagnostic] pageerror（零凭据模型失败面，非产品断言面）：${pageErrors.slice(-5).join(' | ')}`)
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @m2 挂接双侧·Step3 派发类行：挂接表源过滤（record 卡不入行集）', async () => {
  test.setTimeout(480_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tsl-dp-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tsl-dp-ud-'))
  const launched: Launched = await launchHost({ userData, env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page } = launched
  try {
    const FEATURE = 'tsl-dp'
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: FEATURE, title: '派发行演示' })
    const driver = createBridgeDriver(app)
    const { added, sessionId } = await linkedTask(page, driver, projectId, userData, FEATURE, '派发面板任务')

    // claim 绑真实会话（link 源）；submit 绑合成执行会话（record 源不在本会话面板）
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: added.slug, localId: added.localId }, sessionId })
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: added.slug, localId: added.localId }, result: 'success',
      summary: 'dp：执行会话结算', gate: { compile: true, fmt: true, lint: true, test: true }, sessionId: EXEC_SESSION,
    })

    const row = page.locator(dpRowOf(added.taskId)).first()
    await expect(row, '面板行在场（link 源——挂接表）').toBeVisible({ timeout: 30_000 })
    await expect(row, '行状态文本（结算后已完成）').toContainText('已完成')
    await expect(page.locator('[data-dswf-dp-count]').first(), '行计数 = 1').toHaveText('1')
    // claim 审计行也带本会话 id → record 卡并存于读面（§6-24④）但不入面板行集（两侧相异可判）
    await expect(page.locator(DP_ROW_ANY), '面板恒单行（record 审计卡过滤）').toHaveCount(1)

    // 分型数据面：本会话 sessionLinks = link + claim record 两卡（§6-24④）
    const cards = await refetchOnce<SessionTaskLinkCard[]>(page, TASKS_CHANNELS.sessionLinks, { projectId, sessionId })
    expect(cards.map((c) => c.source).sort(), 'sessionLinks 两卡并存（读面直读映射）').toEqual(['link', 'record'])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @m2 挂接双侧·Step3b 多任务：全量行呈现 + 计数角标（滚动列表无截员）', async () => {
  test.setTimeout(600_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tsl-ov-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tsl-ov-ud-'))
  const launched: Launched = await launchHost({ userData, env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page } = launched
  try {
    const FEATURE = 'tsl-ov'
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: FEATURE, title: '全量行演示' })
    const driver = createBridgeDriver(app)

    // 三任务全挂真实会话（跨任务多次 claim 累积）。§6-24④ 双源：每任务 link 卡 + claim
    // 审计 record 卡 = 读面 6 卡——面板行集 = 3 link 行全量（record 过滤；滚动列表无截员
    // ——pill ≤2 并排 + +N 溢出菜单随 D5 槽位卸载退役，全量行呈现语义等量迁移）
    const sessionId = await openRealSession(page, userData, projectId)
    const tasks: AddTaskResult[] = []
    for (let i = 1; i <= 3; i++) {
      const added = (await driver.call('forgeTasks', 'addTask', {
        projectId, source: { kind: 'feature', slug: FEATURE }, title: `全量行任务 ${i}`, type: 'doc',
      })) as AddTaskResult
      await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: added.slug, localId: added.localId }, sessionId })
      tasks.push(added)
    }

    await expect(page.locator(DP_ROW_ANY), '三任务 = 三行全量呈现（滚动列表无截员）').toHaveCount(3, { timeout: 30_000 })
    await expect(page.locator('[data-dswf-dp-count]').first(), '行计数 = 3（⟡N 角标同源计数）').toHaveText('3')
    for (const task of tasks) {
      await expect(page.locator(dpRowOf(task.taskId)).first(), `任务 ${task.localId} 行在场（完整成员呈现）`).toBeVisible()
    }
    // 退役锚负向断言：+N 溢出菜单锚零在场（pill 形态退役——锚随面死）
    await expect(page.locator('[data-dswf-stp-more]'), '+N 溢出菜单退役（D5 槽位卸载）').toHaveCount(0)

    // 菜单条目点击导航（旧 Step3b 尾段）→ 继任 = 行点击弹窗就地打开（与冒烟 Step4 同径）
    await page.locator(dpRowOf(tasks[2]!.taskId)).first().click()
    await expect(page.locator(TD_DRAWER).first(), '行点击 → 任务弹窗开（就地）').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(TD_DRAWER).first()).toContainText('全量行任务 3')
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @m2 挂接双侧·Step3c 恰 2：两行全量 + 零角标（off-by-one 边界）', async () => {
  test.setTimeout(540_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tsl-e2-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tsl-e2-ud-'))
  const launched: Launched = await launchHost({ userData, env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page } = launched
  try {
    const FEATURE = 'tsl-e2'
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: FEATURE, title: '恰二演示' })
    const driver = createBridgeDriver(app)
    const sessionId = await openRealSession(page, userData, projectId)
    // 恰 2 行边界（off-by-one 语义随行语言迁移：pill 双卡并排 → 面板双任务行）：
    // 两任务各 claim → 2 link 行全量（每任务 claim 审计 record 卡过滤——读面 4 卡）
    for (let i = 1; i <= 2; i++) {
      const added = (await driver.call('forgeTasks', 'addTask', {
        projectId, source: { kind: 'feature', slug: FEATURE }, title: `恰二任务 ${i}`, type: 'doc',
      })) as AddTaskResult
      await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: added.slug, localId: added.localId }, sessionId })
    }

    await expect(page.locator(DP_ROW_ANY), '恰 2 = 两行全量展示').toHaveCount(2, { timeout: 30_000 })
    await expect(page.locator(DP_BADGE), '零折叠角标（面板展开态）').toHaveCount(0)
    const cards = await refetchOnce<SessionTaskLinkCard[]>(page, TASKS_CHANNELS.sessionLinks, { projectId, sessionId })
    expect(cards, '库行双源四卡（读面——行集 = link 过滤投影）').toHaveLength(4)
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @m2 挂接双侧·Step3d 重领去重：幂等重入单一行（UNIQUE 约束）', async () => {
  test.setTimeout(540_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tsl-dd-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tsl-dd-ud-'))
  const launched: Launched = await launchHost({ userData, env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page } = launched
  try {
    const FEATURE = 'tsl-dd'
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: FEATURE, title: '重领去重演示' })
    const driver = createBridgeDriver(app)
    const { added, sessionId } = await linkedTask(page, driver, projectId, userData, FEATURE, '重领去重任务')

    // 首 claim + 同会话二次 claim（幂等重入——挂接表 UNIQUE 不增行）
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: added.slug, localId: added.localId }, sessionId })
    const reentry = (await driver.call('forgeTasks', 'claimTask', {
      projectId, taskRef: { slug: added.slug, localId: added.localId }, sessionId,
    })) as ClaimTaskResult
    expect(reentry.reclaimed, '二次 claim = 幂等重入').toBe(true)

    await expect(page.locator(dpRowOf(added.taskId)).first(), '任务 T 派发行在场').toBeVisible({ timeout: 30_000 })
    await expect(page.locator(DP_ROW_ANY), '恒单行（重领不增——record 审计卡过滤）').toHaveCount(1)
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })).dir
    const db = openForgeDbAt(dir)
    try {
      expect(db.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM task_session_links WHERE task_id = ? AND session_id = ?`,
      ).get(added.taskId, sessionId)?.n, '库 UNIQUE(task_id, session_id)：二次 claim 后仍 1 行').toBe(1)
    } finally {
      db.close()
    }
    const cards = await refetchOnce<SessionTaskLinkCard[]>(page, TASKS_CHANNELS.sessionLinks, { projectId, sessionId })
    expect(cards, '读面恒两卡（重领幂等不产生重复）').toHaveLength(2)
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @m2 挂接双侧·Step3e 活体挂接：claim 后行即时出现（事件驱动）', async () => {
  test.setTimeout(540_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tsl-live-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tsl-live-ud-'))
  const launched: Launched = await launchHost({ userData, env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page } = launched
  try {
    const FEATURE = 'tsl-live'
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: FEATURE, title: '活体挂接演示' })
    const driver = createBridgeDriver(app)

    // 会话视图已渲染（订阅层活跃）+ 任务 X 尚未挂接
    const sessionId = await openRealSession(page, userData, projectId)
    const x = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'feature', slug: FEATURE }, title: '活体挂接任务 X', type: 'doc',
    })) as AddTaskResult
    await expect(page.locator(DP_PANEL), 'claim 前无面板（零挂接不占对话区）').toHaveCount(0)

    // 停留在会话视图（不切换会话不重开页签）完成 claim → 行在当前视图出现
    // （subscribeTasksChanged 写推送静默重取——≤500ms 反映归订阅层契约 events 断言面；
    //  e2e 断言 = 写后行呈现收敛）
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: x.slug, localId: x.localId }, sessionId })
    // 数据面即时判据：写入返回后单发重取即见新值（事件订阅驱动的数据前提）
    const cards = await refetchOnce<SessionTaskLinkCard[]>(page, TASKS_CHANNELS.sessionLinks, { projectId, sessionId })
    expect(cards.map((c) => c.taskId), '单发重取即见 X 挂接（双源两卡同任务——§6-24④）').toEqual([x.taskId, x.taskId])
    // UI 面：行出现在当前视图（事件驱动渲染收敛）
    await expect(page.locator(dpRowOf(x.taskId)).first(), 'X 行在当前视图出现（即时刷新）').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(DP_ROW_ANY), '面板恰单行（link——record 审计卡过滤）').toHaveCount(1)
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @m2 挂接双侧·Step5 执行源会话：零面板（link 源过滤——record 不入行集）', async () => {
  test.setTimeout(540_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tsl-ex-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tsl-ex-ud-'))
  const launched: Launched = await launchHost({ userData, env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page } = launched
  try {
    const FEATURE = 'tsl-ex'
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: FEATURE, title: '执行源演示' })
    const driver = createBridgeDriver(app)
    const { added, sessionId } = await linkedTask(page, driver, projectId, userData, FEATURE, '执行源任务')

    // claim 绑合成派发会话（link 源不在本会话面板）；submit 绑真实会话（record 源）
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: added.slug, localId: added.localId }, sessionId: EXEC_SESSION })
    const submit = (await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: added.slug, localId: added.localId }, result: 'success',
      summary: 'ex：真实会话作为执行会话结算', gate: { compile: true, fmt: true, lint: true, test: true }, sessionId,
    })) as SubmitTaskResult
    expect(submit.status, '结算落账 completed').toBe('completed')

    // 本会话读面 = record 单卡（审计行源）→ 面板零挂载 + 零角标（D6 裁决 #2：仅 link 源——
    // 执行源归 worker 会话与任务详情时间线）
    await expect(page.locator(DP_PANEL), '执行源会话零面板（link 源过滤）').toHaveCount(0, { timeout: 15_000 })
    await expect(page.locator(DP_BADGE), '执行源会话零角标').toHaveCount(0)
    const cards = await refetchOnce<SessionTaskLinkCard[]>(page, TASKS_CHANNELS.sessionLinks, { projectId, sessionId })
    expect(cards.map((c) => c.source), '本会话读面 = record 单卡（审计行源）').toEqual(['record'])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @m2 挂接双侧·Step5b 零挂接会话：无面板无角标（空输出）', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tsl-empty-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tsl-empty-ud-'))
  const launched: Launched = await launchHost({ userData, env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page } = launched
  try {
    const FEATURE = 'tsl-empty'
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: FEATURE, title: '零挂接演示' })
    // 从未 claim 的会话（也无以其为执行会话的审计行）——两源零匹配
    const sessionId = await openRealSession(page, userData, projectId)

    await expect(page.locator(DP_PANEL), '无面板（零匹配行即无展示元素）').toHaveCount(0)
    await expect(page.locator(DP_BADGE), '无折叠角标（空输出）').toHaveCount(0)
    const cards = await refetchOnce<SessionTaskLinkCard[]>(page, TASKS_CHANNELS.sessionLinks, { projectId, sessionId })
    expect(cards, '双源读面零匹配（links ∪ records 均无行）').toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @m2 挂接双侧·m3.1 D6 悬浮面板几何与交互：默认落位/dock 左移/拖移停锚定/折叠往返/⟞ 树零联动', async () => {
  test.setTimeout(600_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tsl-geo-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tsl-geo-ud-'))
  const launched: Launched = await launchHost({ userData, env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page } = launched
  try {
    const FEATURE = 'tsl-geo'
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: FEATURE, title: '几何交互演示' })
    const driver = createBridgeDriver(app)
    const { added, sessionId } = await linkedTask(page, driver, projectId, userData, FEATURE, '几何交互任务')

    // worker 真实会话 B + claim A + submit B（⟞ 可解析执行会话）
    const beforeWorker = fixtureSessionIds(join(userData, 'dsh-home'), WS_NAME)
    const workerSession = await openWorkerSession(page, userData, beforeWorker)
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: added.slug, localId: added.localId }, sessionId })
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: added.slug, localId: added.localId }, result: 'success',
      summary: 'geo：执行会话结算', gate: { compile: true, fmt: true, lint: true, test: true }, sessionId: workerSession,
    })
    // 回派发会话 A（面板断言面）
    await page.locator(sessionRowOf(sessionId)).first().click()

    const panel = page.locator(DP_PANEL).first()
    await expect(panel, '悬浮面板在场').toBeVisible({ timeout: 30_000 })

    // ── 几何：对话列内、工具栏之下右上角（E 区断言组；D33 残差①收口——锚源迁移台账：
    //    对话面几何对照锚 MAIN_CONVERSATION → CONVERSATION_SCROLL 真盒（官方 SlotOutlet
    //    洞包裹层 display:contents 零盒，pin ⑮-4——旧对照锚不可量测；零弱化 = 断言只增）──
    const tabsBox = await page.locator(TABS_ROW).first().boundingBox()
    const convBox = await page.locator(CONVERSATION_SCROLL).first().boundingBox()
    const dpBox0 = await panel.boundingBox()
    expect(dpBox0, '面板几何在场').not.toBeNull()
    expect(tabsBox, '页签行几何在场').not.toBeNull()
    expect(convBox, '对话滚动面几何在场（真盒锚）').not.toBeNull()
    expect(dpBox0!.x, `面板非视口左缘钉位（x=${Math.round(dpBox0!.x)} > 拖移钳制 4——display:contents 断锚防回归）`).toBeGreaterThan(4)
    expect(
      Math.abs(dpBox0!.x + dpBox0!.width - (convBox!.x + convBox!.width - 16)),
      `面板右缘 = 对话面右缘内收 16（差 ≤2：${Math.round(dpBox0!.x + dpBox0!.width)} vs ${Math.round(convBox!.x + convBox!.width - 16)}）`,
    ).toBeLessThanOrEqual(2)
    expect(
      Math.abs(dpBox0!.y - (tabsBox!.y + tabsBox!.height + 8)),
      `面板顶 = 页签行下沿 + 8（${Math.round(dpBox0!.y)} vs ${Math.round(tabsBox!.y + tabsBox!.height + 8)}）`,
    ).toBeLessThanOrEqual(2)

    // ── dock 展开自动左移（对话列收窄 → 面板随之左移，右缘随对话面右缘实时联动——真 rect 上生效）──
    await expect(page.locator(RIGHTBAR_COLLAPSED).first(), '右栏基线收起').toBeAttached()
    await page.locator(SIDEBAR_RIGHT_EXPAND).first().click()
    await expect(page.locator(RIGHTBAR_COLLAPSED), '右栏展开（收起标记退场）').toHaveCount(0, { timeout: 15_000 })
    await page.waitForTimeout(600) // 锚定重算收敛（ResizeObserver → 态更新 → 绘制）
    const dpBox1 = await panel.boundingBox()
    const convBox1 = await page.locator(CONVERSATION_SCROLL).first().boundingBox()
    expect(dpBox1, '展开后面板几何在场').not.toBeNull()
    expect(convBox1, '展开后对话滚动面几何在场').not.toBeNull()
    expect(
      Math.abs(dpBox1!.x + dpBox1!.width - (convBox1!.x + convBox1!.width - 16)),
      `展开后面板右缘仍贴对话面右缘内收 16（${Math.round(dpBox1!.x + dpBox1!.width)} vs ${Math.round(convBox1!.x + convBox1!.width - 16)}）`,
    ).toBeLessThanOrEqual(2)
    expect(dpBox0!.x - dpBox1!.x, `dock 展开 → 面板自动左移（${Math.round(dpBox0!.x)} → ${Math.round(dpBox1!.x)}）`).toBeGreaterThan(20)

    // ── 头可拖（拖后停自动锚定——收起右栏面板不再回锚）──
    const headBox = await page.locator(DP_HEAD).first().boundingBox()
    expect(headBox, '面板头几何在场').not.toBeNull()
    const hx = headBox!.x + headBox!.width / 2
    const hy = headBox!.y + headBox!.height / 2
    await page.mouse.move(hx, hy)
    await page.mouse.down()
    await page.mouse.move(hx - 140, hy + 90, { steps: 6 })
    await page.mouse.up()
    await expect(panel, '拖移标记在场（拖后停自动锚定）').toHaveAttribute('data-dswf-dp-dragged', '', { timeout: 15_000 })
    const draggedBox = await panel.boundingBox()
    expect(draggedBox, '拖移后面板几何在场').not.toBeNull()
    expect(draggedBox!.x, '拖移 = 位移生效（向左下）').toBeLessThan(dpBox1!.x - 60)
    // 收起右栏（对话列变宽）——拖后面板保持用户位（零回锚）
    await page.locator(COLLAPSE_RIGHTBAR_BUTTON).first().click()
    await expect(page.locator(RIGHTBAR_COLLAPSED).first(), '右栏已收起').toBeAttached({ timeout: 15_000 })
    await page.waitForTimeout(600)
    const afterCollapseBox = await panel.boundingBox()
    expect(afterCollapseBox, '收起后面板几何在场').not.toBeNull()
    expect(Math.round(afterCollapseBox!.x), '拖后停自动锚定（收起右栏零回锚）').toBe(Math.round(draggedBox!.x))

    // ── ▁ 折叠 ⟡N 角标往返 ──
    await page.locator(DP_COLLAPSE).first().click()
    await expect(panel, '折叠 = 面板退场').toHaveCount(0)
    const badge = page.locator(DP_BADGE).first()
    await expect(badge, '折叠角标在场（⟡N）').toBeVisible()
    await expect(badge.locator('[data-dswf-dp-badge-count]'), '角标计数 = 1').toHaveText('1')
    await badge.click()
    await expect(page.locator(DP_PANEL).first(), '角标点击展开（面板复现）').toBeVisible({ timeout: 15_000 })

    // ── 行尾 ⟞ = 打开 worker 执行子会话 + 树零联动 ──
    const treeRowsBefore = await page.locator(SESSION_ROW_ANY).count()
    await page.locator(DP_SESSION_ANY).first().click()
    await expect(page.locator(CONVERSATION_CONTENT).first(), '⟞ → 对话面板 = worker 执行会话（转录判据）').toContainText(WORKER_MESSAGE, { timeout: 30_000 })
    const treeRowsAfter = await page.locator(SESSION_ROW_ANY).count()
    expect(treeRowsAfter, `树零联动（行数不变：${treeRowsBefore} → ${treeRowsAfter}）`).toBe(treeRowsBefore)
    // worker 会话零面板（主视图锚切 worker——仅本会话派发的自然结果）
    await expect(page.locator(DP_PANEL), 'worker 会话零面板').toHaveCount(0, { timeout: 15_000 })
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})
