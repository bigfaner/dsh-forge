// @feature:dsh-forge-m2-pipeline @web-e2e
// gen-test-scripts 产物 —— Journey: task-session-linkage（T-test-gen-scripts）。
// 断言源 = docs/features/dsh-forge-m2-pipeline/testing/task-session-linkage/contracts/
//   step-{1..5}-*.md（eval-contract 913/1100 通过）。
//
// 会话夹具形态（fix-42 台账口径）：零凭据径 = 芯片流开户 + composer 一条消息（用户事件
// 落地 → 非 blank → 会话头常显；模型调用失败不影响会话建档——Hard Rule 零真实模型）。
// 会话 id = {userData}/dsh-home 账本（findFixtureSession）——pill 绑定渲染中会话；
// 派发/执行双源的「相异会话」以 真实会话 × 合成执行会话 构造（挂接/审计行均为库行，
// session_id 无会话存在性校验——数据面等价）。
//
// Fact Table 摘录（源码核实）：
//   - 会话头 pill（SessionTaskPills.tsx）：[data-dswf-stp-pill="<taskId>"] +
//     [data-dswf-stp-source="link|record"]（分型：link=挂接表派发⟞ / record=审计行执行⟞）；
//     ≤2 并排；>2 → [data-dswf-stp-more]（+N）开 Menu（[role=menu]，行
//     [data-dswf-stp-mrow] + 分型 [data-dswf-stp-msrc]）；零挂接 = 槽不渲染（空即无元素）；
//   - 读面（sessionLinks）：links ∪ records.session_id 双源分型（SC6③ 不合并解释——
//     同任务同会话双侧参与 = 两卡并存）；TaskCard.sessionCount = 双源去重计数
//     （列表副行 ⟞N 挂接——task-tab-model.ts:36）；
//   - 抽屉挂接区：[data-dswf-td-sess="<sessionId>"]（drawer README 台账）；
//   - pill 导航（UF-3 流程 7 左半段）：点击 → dock 开概览 + 任务子 tab 激活 +
//     feature 选中 + 任务抽屉开（sc6 已验径）；
//   - 挂接唯一性：task_session_links UNIQUE(task_id, session_id)——重领幂等不增行。
//
// Outcome → 测试映射：
//   Step1-5 success 链（计数→抽屉分型→pill→导航→双侧）…「冒烟：双源分型全链（计数 + 抽屉 + pill 导航）」
//   Step3 success（dispatcher 派发类 pill）…………………………………「Step3 派发类 pill：挂接表源分型（无执行残留）」
//   Step3 overflow-menu-beyond-two ……………………………………………………「Step3b 溢出：≤2 并排 + +N 菜单全量 + 菜单条目导航」
//   Step3 exactly-two-inline-no-overflow …………………………………………「Step3c 恰 2：全量并排无溢出（off-by-one 边界）」
//   Step3 re-claim-dedup-single-pill ……………………………………………………「Step3d 重领去重：幂等重入单一 pill（UNIQUE 约束）」
//   Step3 live-pill-on-new-claim ………………………………………………………………「Step3e 活体挂接：claim 后 pill 即时出现（事件驱动）」
//   Step5 success（executor 执行类 pill + 无残留）………………………「Step5 执行类 pill：审计行源分型（无派发残留）」
//   Step5 no-linkage-session-empty ………………………………………………………「Step5b 零挂接会话：无 pill 无占位（空输出）」
//
// Assertion depth: 54/57 behavioral (95%)，其中 deep 21/54 (39%)——两阈均过。
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { FEATURES_CHANNELS, TASKS_CHANNELS } from '../../../packages/contracts/src/channels.js'
import type { AddTaskResult, ClaimTaskResult, SessionTaskLinkCard, SubmitTaskResult, TaskCard } from '../../../packages/contracts/src/dto/forge.js'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { forgeInvoke, registerProject, selectWorkspaceViaChip } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { ensureNoBlockingDialog } from '../../support/modals.js'
import { findFixtureSession } from '../../support/session-files.js'
import { createBridgeDriver, refetchOnce } from '../../support/replay/executor.js'
import { openForgeDbAt } from '../../support/replay/db-insert.js'
import { COMPOSER_INPUT, OV_PANEL, TD_DRAWER, ovSubtabOf, projectRowOf, stpPillOf, ttFeatpillOf, ttItemOf } from '../../support/anchors.js'

/** 夹具工作区名（芯片选择 / 会话目录定位共用——注册名 = 目录名） */
const WS_NAME = 'ws-tsl'
/** 合成执行会话 id（与真实 dispatcher 会话相异可判——SC6③ 双源前提） */
const EXEC_SESSION = 'e2e-tsl-executor-synth'

/** 零凭据会话开户（fix-42 台账径）：芯片流选定工作区 → composer 一条消息 → 账本定位会话 id */
async function openRealSession(page: Page, userData: string, projectId: string): Promise<string> {
  await selectWorkspaceViaChip(page, WS_NAME)
  const composer = page.locator(COMPOSER_INPUT).last()
  await expect(composer, 'composer 在场（芯片流开户）').toBeVisible({ timeout: 60_000 })
  await composer.click()
  await page.keyboard.insertText('tsl 挂接双侧断言夹具消息（零凭据形态）')
  await page.keyboard.press('Enter')
  await expect(page.locator(projectRowOf(projectId)).locator('[data-dswf-session]'), '会话行入树（用户事件落地 = 非 blank）').toBeVisible({ timeout: 60_000 })
  await ensureNoBlockingDialog(page)
  const session = findFixtureSession(join(userData, 'dsh-home'), WS_NAME)
  expect(session, '会话目录在盘（账本 sessionId 可定位）').toBeDefined()
  return (session as { sessionId: string }).sessionId
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
    projectId, featureSlug: feature, title, type: 'doc',
  })) as AddTaskResult
  const sessionId = await openRealSession(page, userData, projectId)
  return { added, sessionId }
}

test('@web-e2e @m2 挂接双侧·冒烟：双源分型全链（副行计数 + 抽屉分型 + pill 导航）', async () => {
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

    // ── 挂接前基线：零挂接（空输出 + 双源空）──
    const before = await refetchOnce<SessionTaskLinkCard[]>(page, TASKS_CHANNELS.sessionLinks, { projectId, sessionId })
    expect(before, '挂接前 sessionLinks 空').toEqual([])
    await expect(page.locator('[data-dswf-stp-pill]'), '挂接前 pill 空态（零挂接不占会话头）').toHaveCount(0)

    // ── 双源构造：claim（真实会话 → link 行）+ submit（合成执行会话 → record 行）──
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: added.slug, localId: added.localId }, sessionId })
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: added.slug, localId: added.localId }, result: 'success',
      summary: 'tsl 冒烟：执行会话结算', gate: { compile: true, fmt: true, lint: true, test: true }, sessionId: EXEC_SESSION,
    })

    // ── Step 1：任务列表副行挂接计数（双源去重 = 2）──
    const cards = await refetchOnce<TaskCard[]>(page, TASKS_CHANNELS.list, { projectId, featureSlug: FEATURE })
    const card = cards.find((c) => c.taskId === added.taskId)
    expect(card?.sessionCount, '副行承重数据：挂接计数 = 2（link + record 去重）').toBe(2)

    // ── Step 2：详情抽屉挂接区分型（两类各自与来源库记录一致）──
    const detailCards = await refetchOnce<SessionTaskLinkCard[]>(page, TASKS_CHANNELS.sessionLinks, { projectId, sessionId: EXEC_SESSION })
    expect(detailCards, '执行会话侧：record 分型单卡').toEqual([
      { taskId: added.taskId, slug: added.slug, localId: added.localId, title: '挂接双侧冒烟任务', taskStatus: 'completed', sessionId: EXEC_SESSION, source: 'record' },
    ])
    const realCards = await refetchOnce<SessionTaskLinkCard[]>(page, TASKS_CHANNELS.sessionLinks, { projectId, sessionId })
    expect(realCards.map((c) => c.source), '派发会话侧：link 分型单卡').toEqual(['link'])
    expect(realCards[0]?.sessionId, 'link 卡 = 真实 dispatcher 会话（与执行会话相异可判）').toBe(sessionId)

    // ── Step 3：dispatcher 会话头 pill（派发类）──
    const linkPill = page.locator(stpPillOf(added.taskId, 'link')).first()
    await expect(linkPill, '派发类 pill 在场（挂接表源）').toBeVisible({ timeout: 30_000 })
    await expect(linkPill).toContainText('派发')
    await expect(page.locator(stpPillOf(added.taskId, 'record')), '执行类 pill 不在 dispatcher 会话头（record 绑执行会话）').toHaveCount(0)

    // ── Step 4：pill 导航（dock 开概览 + 任务子 tab + feature 选中 + 抽屉开）──
    await linkPill.click()
    await expect(page.locator(OV_PANEL).first(), 'dock 开概览 tab').toBeVisible({ timeout: 30_000 })
    await expect(page.locator(ovSubtabOf('tasks')), '任务子 tab 激活（聚焦切换）').toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    await expect(page.locator(ttFeatpillOf(FEATURE)).first(), 'feature 选中（导航载荷富化）').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(TD_DRAWER).first(), '任务抽屉开（聚焦抽屉面）').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(TD_DRAWER).first()).toContainText('挂接双侧冒烟任务')
    // 抽屉挂接区：双源会话 pill 并存（真实 + 合成执行——不混示为同一会话）
    await expect(page.locator(`[data-dswf-td-sess="${sessionId}"]`).first(), '抽屉挂接区：派发会话 pill').toBeVisible()
    await expect(page.locator(`[data-dswf-td-sess="${EXEC_SESSION}"]`).first(), '抽屉挂接区：执行会话 pill（相异可判）').toBeVisible()

    // ── Step 5（数据面）：executor 侧 record 分型（上面已断言）+ 副行 UI 计数 ──
    await expect(page.locator(ttItemOf(added.taskId)).first(), '任务行在场（导航后列表）').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(`[data-dswf-tt-sub="${added.taskId}"]`).first(), '副行呈现挂接计数（⟞2 挂接）').toContainText('2')

    // 零凭据形态的模型失败面不计入产品断言（pageerror 留痕诊断——不伪造凭据不遮蔽）
    if (pageErrors.length > 0) console.log(`[tsl-diagnostic] pageerror（零凭据模型失败面，非产品断言面）：${pageErrors.slice(-5).join(' | ')}`)
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 挂接双侧·Step3 派发类 pill：挂接表源分型（无执行残留）', async () => {
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
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: FEATURE, title: '派发 pill 演示' })
    const driver = createBridgeDriver(app)
    const { added, sessionId } = await linkedTask(page, driver, projectId, userData, FEATURE, '派发 pill 任务')

    // claim 绑真实会话（link 源）；submit 绑合成执行会话（record 源不在本会话头）
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: added.slug, localId: added.localId }, sessionId })
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: added.slug, localId: added.localId }, result: 'success',
      summary: 'dp：执行会话结算', gate: { compile: true, fmt: true, lint: true, test: true }, sessionId: EXEC_SESSION,
    })

    const pill = page.locator(stpPillOf(added.taskId, 'link')).first()
    await expect(pill, 'pill 分型标识 = 派发（link 源）').toContainText('派发', { timeout: 30_000 })
    await expect(pill, 'pill 状态文本（结算后已完成）').toContainText('已完成')
    await expect(page.locator(stpPillOf(added.taskId, 'record')), '无执行类残留（record 绑执行会话）').toHaveCount(0)

    // 分型数据面：本会话 sessionLinks 仅 link 卡（与库中挂接行一致）
    const cards = await refetchOnce<SessionTaskLinkCard[]>(page, TASKS_CHANNELS.sessionLinks, { projectId, sessionId })
    expect(cards, 'sessionLinks = link 单卡（读面直读映射）').toHaveLength(1)
    expect(cards[0]?.source, '分型 = link').toBe('link')
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 挂接双侧·Step3b 溢出：≤2 并排 + +N 菜单全量 + 菜单条目导航', async () => {
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
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: FEATURE, title: '溢出演示' })
    const driver = createBridgeDriver(app)

    // 三任务全挂真实会话（跨任务多次 claim 累积）
    const sessionId = await openRealSession(page, userData, projectId)
    const tasks: AddTaskResult[] = []
    for (let i = 1; i <= 3; i++) {
      const added = (await driver.call('forgeTasks', 'addTask', {
        projectId, featureSlug: FEATURE, title: `溢出任务 ${i}`, type: 'doc',
      })) as AddTaskResult
      await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: added.slug, localId: added.localId }, sessionId })
      tasks.push(added)
    }

    // ≤2 并排 + 其余 +N 溢出（N = 余量任务数 = 1）
    await expect(page.locator('[data-dswf-stp-pill]'), '并排 pill ≤2').toHaveCount(2, { timeout: 30_000 })
    const more = page.locator('[data-dswf-stp-more]').first()
    await expect(more, '+N 溢出菜单触发在场（N = 1）').toHaveText('+1', { timeout: 15_000 })

    // 打开菜单：全部其余挂接任务可见（含分型标注）+ 第三任务在列
    await more.click()
    const menu = page.locator('[role="menu"]').first()
    await expect(menu).toBeVisible({ timeout: 15_000 })
    await expect(menu.locator('[data-dswf-stp-mrow]'), '菜单行 ≥1（余量全量呈现）').not.toHaveCount(0)
    await expect(menu.locator('[data-dswf-stp-msrc="link"]').first(), '菜单行分型标注（派发）').toBeVisible()
    await expect(menu, '第三任务在菜单（完整列表）').toContainText('溢出任务 3')

    // 菜单条目点击 → 与 Step4 同一导航（dock 开概览 + 任务子 tab + 抽屉开）
    await menu.locator('[data-dswf-stp-mrow]').last().click()
    await expect(page.locator(OV_PANEL).first(), '菜单条目导航：dock 开概览').toBeVisible({ timeout: 30_000 })
    await expect(page.locator(ovSubtabOf('tasks')), '任务子 tab 激活').toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    await expect(page.locator(TD_DRAWER).first(), '任务抽屉开').toBeVisible({ timeout: 15_000 })
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 挂接双侧·Step3c 恰 2：全量并排无溢出（off-by-one 边界）', async () => {
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
    for (let i = 1; i <= 2; i++) {
      const added = (await driver.call('forgeTasks', 'addTask', {
        projectId, featureSlug: FEATURE, title: `恰二任务 ${i}`, type: 'doc',
      })) as AddTaskResult
      await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: added.slug, localId: added.localId }, sessionId })
    }

    await expect(page.locator('[data-dswf-stp-pill]'), '恰 2 = 两 pill 并排全量展示').toHaveCount(2, { timeout: 30_000 })
    await expect(page.locator('[data-dswf-stp-more]'), '无 +N 溢出菜单（off-by-one 边界——恰 2 不触发）').toHaveCount(0)
    const cards = await refetchOnce<SessionTaskLinkCard[]>(page, TASKS_CHANNELS.sessionLinks, { projectId, sessionId })
    expect(cards, '库行双挂接（读面两卡）').toHaveLength(2)
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 挂接双侧·Step3d 重领去重：幂等重入单一 pill（UNIQUE 约束）', async () => {
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

    await expect(page.locator(stpPillOf(added.taskId, 'link')).first(), '任务 T 仍呈单一 pill').toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-dswf-stp-pill]'), '无重复 pill（恒单一展示）').toHaveCount(1)
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
    expect(cards, '读面单卡（重领不产生重复 pill 的数据面）').toHaveLength(1)
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 挂接双侧·Step3e 活体挂接：claim 后 pill 即时出现（事件驱动刷新）', async () => {
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

    // 会话头部已渲染（订阅层活跃）+ 任务 X 尚未挂接
    const sessionId = await openRealSession(page, userData, projectId)
    const x = (await driver.call('forgeTasks', 'addTask', {
      projectId, featureSlug: FEATURE, title: '活体挂接任务 X', type: 'doc',
    })) as AddTaskResult
    await expect(page.locator('[data-dswf-stp-pill]'), 'claim 前无 X pill（会话头部零挂接）').toHaveCount(0)

    // 停留在会话头部（不切换会话不重开页签）完成 claim → pill 在当前头部出现
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: x.slug, localId: x.localId }, sessionId })
    // 数据面即时判据：写入返回后单发重取即见新值（事件订阅驱动的数据前提）
    const cards = await refetchOnce<SessionTaskLinkCard[]>(page, TASKS_CHANNELS.sessionLinks, { projectId, sessionId })
    expect(cards.map((c) => c.taskId), '单发重取即见 X 挂接').toEqual([x.taskId])
    // UI 面：pill 出现在当前头部（事件驱动渲染收敛）
    await expect(page.locator(stpPillOf(x.taskId, 'link')).first(), 'X pill 在当前头部出现（即时刷新）').toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-dswf-stp-pill]')).toHaveCount(1)
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 挂接双侧·Step5 执行类 pill：审计行源分型（无派发残留）', async () => {
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
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: FEATURE, title: '执行 pill 演示' })
    const driver = createBridgeDriver(app)
    const { added, sessionId } = await linkedTask(page, driver, projectId, userData, FEATURE, '执行 pill 任务')

    // claim 绑合成派发会话（link 源不在本会话头）；submit 绑真实会话（record 源）
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: added.slug, localId: added.localId }, sessionId: EXEC_SESSION })
    const submit = (await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: added.slug, localId: added.localId }, result: 'success',
      summary: 'ex：真实会话作为执行会话结算', gate: { compile: true, fmt: true, lint: true, test: true }, sessionId,
    })) as SubmitTaskResult
    expect(submit.status, '结算落账 completed').toBe('completed')

    // 头部展示挂接任务，pill 分型 = 执行（record 源）；不残留派发类展示
    const recordPill = page.locator(stpPillOf(added.taskId, 'record')).first()
    await expect(recordPill, 'pill 分型标识 = 执行（record 源）').toContainText('执行', { timeout: 30_000 })
    await expect(recordPill, 'pill 状态文本（已完成）').toContainText('已完成')
    await expect(page.locator(stpPillOf(added.taskId, 'link')), '无派发类残留（link 绑合成派发会话）').toHaveCount(0)

    const cards = await refetchOnce<SessionTaskLinkCard[]>(page, TASKS_CHANNELS.sessionLinks, { projectId, sessionId })
    expect(cards.map((c) => c.source), '本会话读面 = record 单卡（审计行源）').toEqual(['record'])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 挂接双侧·Step5b 零挂接会话：无 pill 无占位（空输出）', async () => {
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

    await expect(page.locator('[data-dswf-stp-pill]'), '无挂接 pill（零匹配行即无展示元素）').toHaveCount(0)
    await expect(page.locator('[data-dswf-stp]'), '槽不渲染空占位（pills.length === 0 → null）').toHaveCount(0)
    const cards = await refetchOnce<SessionTaskLinkCard[]>(page, TASKS_CHANNELS.sessionLinks, { projectId, sessionId })
    expect(cards, '双源读面零匹配（links ∪ records 均无行）').toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});
