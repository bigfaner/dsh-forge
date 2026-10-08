// @feature:dsh-forge-m2-pipeline @web-e2e
// 5.2 SC7 真闭环（AC1）：tool 写（回放主径——主侧测试钩子 + hand 夹具，零在场模型）→
// 列表/抽屉/泳道单次重取即见新值 + 写推送事件 ≤500ms + 面分治运行面自证。
//   · 写入径 = 5.1 回放执行器（createFixtureBuilder hand 夹具 + replayWrites——tech-design
//     §录制-回放「手工构造夹具同格式可用」；dogfood 首录夹具的 verb 载荷绑定录制期
//     projectId，不可跨库重放，消费径 = 同机构造 hand 夹具）；
//   · 即时判据（Hard Rule）：写入返回后 refetchOnce 单发产品读面（list/graph/detail——
//     列表/泳道/抽屉三消费面的数据源）即见新值，禁轮询兜底；
//   · 事件 ≤500ms：计时基准 = 主侧收讫时戳（test-bridge events() `at`——Implementation
//     Notes 口径：不测渲染尾延迟）；观测轮询面向主侧记账（预算即断言——超窗即红）；
//   · UI 无 transitionTask tool 面（AC1 尾款）：两通道运行面自证——preload RPC 面
//     allowlist 拒写动词（addTask 不上 RPC）+ 测试钩子可达面拒绝 transitionTask（工具
//     传输面同 dispatchRpc 入口的封闭性）——与 G1-11 pin（tool 注册面六在场/两缺席）呼应；
//   · UI 面：概览 dock 任务子 tab 先开（初始 pending 可见）→ 写 → 事件驱动刷新断言行
//     状态标签（列表行/泳道列/抽屉头三面）。
// M3 drift 台账（5.2 落定）：featureSlug → source:ContainerRef 容器化（1.1/2.4）+ INSERT 列
// source_kind/source_id（schema v1 直改）+ 4.6 v22 容器 pill/视图下拉锚随迁；claimTask 桥直调
// = core 服务 API 保留面（3.5 tool 退役——drift #1 处置：回放主径零波及）。

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import type { TaskCard, TaskDetail } from '../../../packages/contracts/src/dto/forge.js'
import { FEATURES_CHANNELS, TASKS_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { switchTaskView } from '../../support/m3.js'
import { forgeInvoke, registerProject } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { openOverviewDock } from '../../support/navigation.js'
import { OV_PANEL, TD_DRAWER, ovSubtabOf, ttCardOf, ttColOf, ttItemOf } from '../../support/anchors.js'
import { createBridgeDriver, refetchOnce, replayWrites, type ReplayEventRecord, type ReplayWriteDriver } from '../../support/replay/executor.js'
import { createFixtureBuilder } from '../../support/replay/fixtures.js'

/** 事件推送预算（tech-design 交互一/二：写入 → renderer 通知 ≤500ms；主侧收讫时戳口径） */
const EVENT_BUDGET_MS = 500
/** 派发/执行会话标记（SC7 断言只看写入面——会话 id 形态不敏感） */
const DISPATCH_SESSION = 'e2e-sc7-dispatch'
const EXEC_SESSION = 'e2e-sc7-exec'

/**
 * 写后事件到达观测（≤500ms 预算内轮询主侧记账快照——观测面轮询，非产品读面兜底；
 * 预算即断言：超窗未达 = 事件推送契约违反即红）。返回最新一条（多写并发下取末位）。
 */
async function awaitTasksChangedEvent(driver: ReplayWriteDriver, baseline: number): Promise<ReplayEventRecord> {
  const deadline = Date.now() + EVENT_BUDGET_MS
  for (;;) {
    const events = await driver.events()
    if (events.length > baseline) return events[events.length - 1] as ReplayEventRecord
    if (Date.now() > deadline) {
      throw new Error(`写推送事件 ${EVENT_BUDGET_MS}ms 内未达主侧记账（baseline=${baseline}，实际 ${events.length} 条）——事件 ≤500ms 契约违反`)
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

test('@web-e2e @m2 5.2 SC7：tool 写 → 三读面单次重取即见新值 + 事件 ≤500ms + 无 transitionTask tool 面', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-sc7-'))
  const wsDir = join(fixtureRoot, 'ws-sc7')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-sc7-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    // ── 底座：注册 + feature 登记（人类径 RPC）──
    const project = await registerProject(page, wsDir, 'SC7 真闭环')
    const projectId = project.id
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: 'sc7-feat', title: 'SC7 真闭环演示' })

    // ── 回放主径写段（hand 夹具）：addTask → 单次重取即见 pending ──
    const driver = createBridgeDriver(app)
    const addFixture = createFixtureBuilder({ source: 'hand', note: '5.2 SC7 写段' })
      .verb('forgeTasks', 'addTask', {
        projectId,
        source: { kind: 'feature', slug: 'sc7-feat' },
        title: 'SC7 真闭环任务（列表/抽屉/泳道三面）',
        type: 'coding-feature',
        priority: 'P0',
      })
      .build()
    const addOutcomes = await replayWrites(driver, addFixture)
    const added = (addOutcomes[0] as { result: { taskId: string; slug: string; localId: string; reused: boolean } }).result
    expect(added.reused).toBe(false)
    const cards0 = await refetchOnce<TaskCard[]>(page, TASKS_CHANNELS.list, { projectId, source: { kind: 'feature', slug: 'sc7-feat' } })
    expect(cards0.find((c) => c.taskId === added.taskId)?.taskStatus, 'add 后单次重取即见 pending').toBe('pending')

    // ── UI 预开：概览 dock → 任务子 tab → 列表行初始态可见（事件刷新断言的对照面）──
    await openOverviewDock(page)
    await expect(page.locator(OV_PANEL).first()).toBeVisible()
    await page.locator(ovSubtabOf('tasks')).click()
    await expect(page.locator(ovSubtabOf('tasks'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    const row = page.locator(ttItemOf(added.taskId)).first()
    await expect(row, '任务子 tab 列表行在场（初始 pending）').toBeVisible({ timeout: 30_000 })
    await expect(row.locator('.dswf-tt-tag')).toHaveText(/待处理/)

    // ── claim（回放主径）：三读面单次重取即见 in_progress + 事件 ≤500ms ──
    const eventsBeforeClaim = (await driver.events()).length
    const claimFixture = createFixtureBuilder({ source: 'hand', note: '5.2 SC7 claim 段' })
      .verb('forgeTasks', 'claimTask', { projectId, taskRef: { slug: added.slug, localId: added.localId }, sessionId: DISPATCH_SESSION })
      .build()
    const t0 = Date.now()
    await replayWrites(driver, claimFixture)
    // 即时判据：claim 返回后单发读面（无等待兜底）——列表（列表视图源）/graph（泳道源）/detail（抽屉源）
    const listAfterClaim = await refetchOnce<TaskCard[]>(page, TASKS_CHANNELS.list, { projectId, source: { kind: 'feature', slug: 'sc7-feat' } })
    expect(listAfterClaim.find((c) => c.taskId === added.taskId)?.taskStatus, '列表读面：claim 后单次重取即见 in_progress').toBe('in_progress')
    const graphAfterClaim = await refetchOnce<{ tasks: TaskCard[] }>(page, TASKS_CHANNELS.graph, { projectId, source: { kind: 'feature', slug: 'sc7-feat' } })
    expect(graphAfterClaim.tasks.find((c) => c.taskId === added.taskId)?.taskStatus, '图读面（泳道数据源）：单次重取即见 in_progress').toBe('in_progress')
    const detailAfterClaim = await refetchOnce<TaskDetail>(page, TASKS_CHANNELS.detail, { projectId, taskId: added.taskId })
    expect(detailAfterClaim.taskStatus, '详情读面（抽屉数据源）：单次重取即见 in_progress').toBe('in_progress')
    // 事件 ≤500ms（主侧收讫时戳——evt.at 距写发起时刻；含动词执行时间的保守超集口径）
    const claimEvent = await awaitTasksChangedEvent(driver, eventsBeforeClaim)
    expect(claimEvent.payload.projectId).toBe(projectId)
    expect(claimEvent.at - t0, `claim 事件推送 ≤${EVENT_BUDGET_MS}ms（实测 ${claimEvent.at - t0}ms——主侧收讫时戳）`).toBeLessThanOrEqual(EVENT_BUDGET_MS)
    // UI 事件驱动刷新（渲染收敛等待面——非即时判据本体）
    await expect(row.locator('.dswf-tt-tag'), '列表行状态标签事件刷新为进行中').toHaveText(/进行中/, { timeout: 15_000 })

    // ── submit success（回放主径）：结算 → 单次重取即见 completed + 第二条事件 ≤500ms ──
    const eventsBeforeSubmit = (await driver.events()).length
    const submitFixture = createFixtureBuilder({ source: 'hand', note: '5.2 SC7 结算段' })
      .verb('forgeTasks', 'submitTask', {
        projectId,
        taskRef: { slug: added.slug, localId: added.localId },
        result: 'success',
        summary: 'SC7 真闭环结算（5.2 e2e）',
        gate: { compile: true, fmt: true, lint: true, test: true },
        sessionId: EXEC_SESSION,
      })
      .build()
    const t1 = Date.now()
    const submitOutcomes = await replayWrites(driver, submitFixture)
    expect((submitOutcomes[0] as { result: { status: string } }).result.status).toBe('completed')
    const detailAfterSubmit = await refetchOnce<TaskDetail>(page, TASKS_CHANNELS.detail, { projectId, taskId: added.taskId })
    expect(detailAfterSubmit.taskStatus, '详情读面：submit 后单次重取即见 completed').toBe('completed')
    expect(detailAfterSubmit.records.length, 'submit 记录水化（时间线数据源同步即见）').toBeGreaterThanOrEqual(3) // add + claim + submit
    const submitEvent = await awaitTasksChangedEvent(driver, eventsBeforeSubmit)
    expect(submitEvent.payload.projectId).toBe(projectId)
    expect(submitEvent.at - t1, `submit 事件推送 ≤${EVENT_BUDGET_MS}ms（实测 ${submitEvent.at - t1}ms）`).toBeLessThanOrEqual(EVENT_BUDGET_MS)
    await expect(row.locator('.dswf-tt-tag'), '列表行状态标签事件刷新为已完成').toHaveText(/已完成/, { timeout: 15_000 })

    // ── 泳道面：切 swim 视图 → completed 列含本任务卡（先于抽屉——抽屉覆盖任务栏遮挡指针）──
    await switchTaskView(page, 'swim')
    await expect(page.locator(ttColOf('completed')).locator(ttCardOf(added.taskId)), '泳道 completed 列含任务卡').toBeVisible({ timeout: 15_000 })

    // ── 抽屉面：卡片点击 → 抽屉开 + 头部状态 = 已完成（detail 单源消费）──
    await page.locator(ttCardOf(added.taskId)).click()
    await expect(page.locator(TD_DRAWER).first(), '任务抽屉开（卡片点击径）').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(TD_DRAWER).locator('.dswf-td-status')).toHaveText(/已完成/)

    // ── 面分治运行面自证（AC1 尾款：UI 无 transitionTask tool 面）──
    // ① preload RPC 面：写动词不在 allowlist（add/claim/submit = agent tool 专属，SC7 断言面）
    const rpcRejection = await page.evaluate(async () => {
      const forge = (globalThis as { dshForge?: { invoke(channel: string, payload?: unknown): Promise<unknown> } }).dshForge
      try {
        await forge!.invoke('forge:tasks/addTask', {})
        return 'unexpectedly-resolved'
      } catch (e) {
        return String((e as Error)?.message ?? e)
      }
    })
    expect(rpcRejection, 'RPC 面拒绝写动词（tool 专属——不上 RPC）').toContain('不在 allowlist')
    // ② 工具传输面（桥代理——与 tool 面同一 dispatchRpc 入口）：transitionTask 不在可达面。
    //    类型面收窄为五写动词——探针刻意传面外动词，经 string 面绕开编译期收窄（运行期
    //    拒绝即断言本体，非类型面缺口）
    const callAny = driver.call as unknown as (service: string, verb: string, args: unknown) => Promise<unknown>
    const toolFaceRejection = await callAny('forgeTasks', 'transitionTask', { projectId, taskId: added.taskId, toStatus: 'skipped', reason: '面分治探针' })
      .then(() => 'unexpectedly-resolved', (cause: unknown) => String((cause as Error)?.message ?? cause))
    expect(toolFaceRejection, 'tool 传输面拒绝 transitionTask（注册面缺席的运行面自证——G1-11 pin 呼应）').toContain('不在测试钩子可达面')

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})
