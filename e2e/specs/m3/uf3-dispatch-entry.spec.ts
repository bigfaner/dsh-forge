// @feature:dsh-forge-m3-bootstrap-presets @web-e2e
// M3 5.2 UF-3 派发入口四断言（PRD UF-3 / 图 13 v22 ㊱–㊳ / ui-design v24 ㊵）：
//   ① 新开 + 自动发送：容器对应模式（feature → 远征 / 突击提案 → 突击）+ 「/run-tasks
//      <标识>」单行自动发送（v23 最小消息——dispatchTask 唯一必要参数 contextSlug）；
//   ② 执行中在场跳转不重发：执行中任务有最新派发挂接 → jump（openSession 按会话 id
//      ——不新建不重发不切模式；观测面 = 主会话面切换至挂接会话 + 转录零派发指令）；
//   ③ 全终态置灰：stats 单源终态判定 → disabled + 深灰实底 + tooltip「全部任务已处于
//      终态——无可派发任务」（data-dswf-tt-dispatch="off"）；
//   ④ 任务行详情无单任务执行入口（Hard Rule v22 ㊳——抽屉面零「执行」动作）。
// 载体：写动词经测试钩子直调（回放主径）；会话夹具 = 零凭据 composer 消息（M2 SC6③ 同径）。
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { registerProject, selectWorkspaceViaChip } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { ensureNoBlockingDialog } from '../../support/modals.js'
import { findFixtureSession } from '../../support/session-files.js'
import { openOverviewDock } from '../../support/navigation.js'
import { createBridgeDriver } from '../../support/replay/executor.js'
import { COMPOSER_INPUT, CONVERSATION_CONTENT, OV_PANEL, TD_DRAWER, ovSubtabOf, ttItemOf } from '../../support/anchors.js'
import { awaitNoLateModals, awaitPresetHeaderLabel, newBlankSession } from '../../support/m3.js'
import { forgeInvoke } from '../../support/rpc.js'

const WS_NAME = 'ws-uf3'
const FEATURE = 'uf3-feat'
const MARKER = 'UF3-JUMP-MARKER 跳转目标会话夹具消息'

test('@web-e2e @m3 UF-3·派发入口：执行中跳转不重发 + 全终态置灰 + 无单任务执行入口', async () => {
  test.setTimeout(480_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-uf3-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-uf3-ud-'))
  const dshHome = join(userData, 'dsh-home')
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const driver = createBridgeDriver(app)
    await forgeInvoke(page, 'forge:features/register', { projectId, slug: FEATURE, title: 'UF-3 派发入口演示' })
    const t1 = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'feature', slug: FEATURE }, title: 'UF-3 演示任务甲', type: 'doc',
    })) as { taskId: string; slug: string; localId: string }
    const t2 = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'feature', slug: FEATURE }, title: 'UF-3 演示任务乙', type: 'doc', dependsOn: [t1.localId],
    })) as { taskId: string; slug: string; localId: string }

    // ── 跳转目标会话夹具：芯片流 → 夹具消息（会话 A·非 blank）→ 新开 blank（会话 B·hero 面）──
    await selectWorkspaceViaChip(page, WS_NAME)
    const composer = page.locator(COMPOSER_INPUT).last()
    await composer.click()
    await page.keyboard.insertText(MARKER)
    await page.keyboard.press('Enter')
    await ensureNoBlockingDialog(page)
    const sessionA = findFixtureSession(dshHome, WS_NAME)
    expect(sessionA, '跳转目标会话在盘').toBeDefined()
    const jumpSessionId = (sessionA as { sessionId: string }).sessionId
    await newBlankSession(page)
    await expect(page.locator(CONVERSATION_CONTENT).first(), '新 blank 会话转录空（hero 面）').not.toContainText(MARKER)
    await awaitNoLateModals(page)

    // ── 任务子 tab 装载 ──
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('tasks')).click()
    await expect(page.locator(ovSubtabOf('tasks'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    await expect(page.locator(ttItemOf(t1.taskId)).first(), '任务行在场').toBeVisible({ timeout: 30_000 })

    // ── ④ 无单任务执行入口：行 → 抽屉（零「执行」动作——Hard Rule v22 ㊳）──
    await page.locator(ttItemOf(t1.taskId)).first().click()
    const drawer = page.locator(TD_DRAWER).first()
    await expect(drawer, '任务抽屉开').toBeVisible({ timeout: 15_000 })
    await expect(drawer.getByRole('button', { name: /执行/ }), '抽屉零单任务执行入口').toHaveCount(0)
    await drawer.locator('[data-dswf-td-close]').click()
    await expect(drawer).toBeHidden({ timeout: 10_000 })

    // ── ② 执行中在场跳转不重发：claim（挂接 = 会话 A）→ 派发 → jump ──
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: t1.slug, localId: t1.localId }, sessionId: jumpSessionId })
    const dispatchOn = page.locator('[data-dswf-tt-dispatch="on"]').first()
    await expect(dispatchOn, '派发按钮亮起（执行中在场）').toBeVisible({ timeout: 30_000 })
    await dispatchOn.click()
    // jump 观测面：主会话面切换至挂接会话 A（转录含夹具消息）+ 零派发指令（不重发）
    await expect(page.locator(CONVERSATION_CONTENT).first(), '跳转至派发挂接会话（转录 = 会话 A）').toContainText(MARKER, { timeout: 30_000 })
    await expect(page.locator(CONVERSATION_CONTENT).first(), '跳转不重发（转录零派发指令）').not.toContainText('/run-tasks')

    // ── ③ 全终态置灰：结算双任务 → 终态全集 → 深灰实底 + tooltip ──
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: t1.slug, localId: t1.localId }, result: 'success',
      summary: 'UF-3 甲结算', gate: { compile: true, fmt: true, lint: true, test: true }, sessionId: jumpSessionId,
    })
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: t2.slug, localId: t2.localId }, sessionId: jumpSessionId })
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: t2.slug, localId: t2.localId }, result: 'success',
      summary: 'UF-3 乙结算', gate: { compile: true, fmt: true, lint: true, test: true }, sessionId: jumpSessionId,
    })
    const dispatchOff = page.locator('[data-dswf-tt-dispatch="off"]').first()
    await awaitNoLateModals(page)
    await openOverviewDock(page) // 会话编排后 dock 激活面可被取代——幂等重开（keyed body 官方语义）
    await page.locator(ovSubtabOf('tasks')).click()
    await expect(dispatchOff, '全终态置灰（data-dswf-tt-dispatch=off）').toBeVisible({ timeout: 30_000 })
    await expect(dispatchOff).toBeDisabled()
    await expect(dispatchOff).toHaveAttribute('title', '全部任务已处于终态——无可派发任务')
    await expect(page.locator(OV_PANEL).first(), '概览面板持续在场（读路径活跃）').toBeVisible()

    if (pageErrors.length > 0) console.log(`[uf3-diagnostic] pageerror（零凭据模型失败面）：${pageErrors.slice(-3).join(' | ')}`)
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @m3 UF-3·新开路由：突击提案容器派发 → 突击模式新会话 + /run-tasks 单行自动发送', async () => {
  test.setTimeout(480_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-uf3b-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-uf3b-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  const PROP = 'uf3-blitz-prop'
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const driver = createBridgeDriver(app)
    await driver.call('forgeProposals', 'createProposal', { projectId, slug: PROP, title: 'UF-3 突击容器演示', mode: 'blitz' })
    await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'proposal', slug: PROP }, title: 'UF-3 突击容器任务', type: 'doc',
    })
    await selectWorkspaceViaChip(page, WS_NAME)

    // 任务子 tab → 切突击提案容器（琥珀点容器——pill 双轨）
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('tasks')).click()
    await expect(page.locator(ovSubtabOf('tasks'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    await page.locator('[data-dswf-tt-contpill]').first().click()
    const menuItem = page.locator(`[data-dswf-tt-mcont="proposal:${PROP}"]`).first()
    await expect(menuItem, '容器菜单含突击提案容器').toBeVisible({ timeout: 15_000 })
    await menuItem.click()
    await expect(page.locator(`[data-dswf-tt-contpill="proposal:${PROP}"]`), '容器切换收敛').toBeVisible({ timeout: 15_000 })

    // 派发 → 新开（容器对应模式 = 突击）+ 单行指令自动发送
    const dispatchOn = page.locator('[data-dswf-tt-dispatch="on"]').first()
    await expect(dispatchOn, '派发按钮亮起').toBeVisible({ timeout: 30_000 })
    await dispatchOn.click()
    await expect(page.locator(CONVERSATION_CONTENT).first(), '自动发送 /run-tasks 单行（容器标识 = 提案 slug）').toContainText(`/run-tasks ${PROP}`, { timeout: 30_000 })
    await awaitPresetHeaderLabel(page, '突击模式')

    if (pageErrors.length > 0) console.log(`[uf3b-diagnostic] pageerror（零凭据模型失败面）：${pageErrors.slice(-3).join(' | ')}`)
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})
