// @feature:dsh-forge-m2-pipeline @web-e2e
// 5.2 SC7 真闭环（AC1）：tool 写（回放主径——主侧测试钩子 + hand 夹具，零在场模型）→
// 列表/图/详情读面单次重取即见新值 + 账本轨迹面自证 + 面分治运行面自证。
//   · 写入径 = 5.1 回放执行器（createFixtureBuilder hand 夹具 + replayWrites）；
//   · 即时判据（Hard Rule）：写入返回后 refetchOnce 单发产品读面（list/graph/detail）
//     即见新值，禁轮询兜底；
//   · 事件 ≤500ms 断言面：退役——写推送事件广播链（child→main onEvent）在 task-loop
//     接管架构无生产者（装配 events 单例无宿主转发缝），观测载体随退（缺口范围外上报，
//     bug 16b58953 台账承接）；账本轨迹面（task_records verb 链）承载对账；
//   · UI 无 transitionTask tool 面（AC1 尾款）：两通道运行面自证保留——preload RPC 面
//     allowlist 拒写动词 + 测试钩子可达面拒绝 transitionTask；
//   · 旧概览 UI 面（任务子 tab/列表行/泳道列/抽屉）随 task-loop 接管退役——接管版承接
//     测试不在本批重写。
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
import { forgeInvoke, registerProject } from '../../support/rpc.js'
import { projectKeyOf } from '../../../e2e/support/project-key.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { openTaskLoopDbFull } from '../../support/sqlite.js'
import { createBridgeDriver, refetchOnce, replayWrites } from '../../support/replay/executor.js'
import { createFixtureBuilder } from '../../support/replay/fixtures.js'

/** 派发/执行会话标记（SC7 断言只看写入面——会话 id 形态不敏感） */
const DISPATCH_SESSION = 'e2e-sc7-dispatch'
const EXEC_SESSION = 'e2e-sc7-exec'

test('@web-e2e @m2 5.2 SC7：tool 写 → 三读面单次重取即见新值 + 账本轨迹链 + 无 transitionTask tool 面', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-sc7-'))
  const wsDir = join(fixtureRoot, 'ws-sc7')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-sc7-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    // ── 底座：注册 + feature 登记（人类径 RPC）──
    const project = await registerProject(page, wsDir, 'SC7 真闭环')
    const projectKey = projectKeyOf(wsDir)
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId: project.id, slug: 'sc7-feat', title: 'SC7 真闭环演示' })

    // ── 回放主径写段（hand 夹具）：addTask → 单次重取即见 pending ──
    const driver = createBridgeDriver(app)
    const addFixture = createFixtureBuilder({ source: 'hand', note: '5.2 SC7 写段' })
      .verb('forgeTasks', 'addTask', {
        projectKey,
        slug: 'sc7-feat',
        title: 'SC7 真闭环任务（列表/抽屉/泳道三面）',
        type: 'coding-feature',
        priority: 'P0',
      })
      .build()
    const addOutcomes = await replayWrites(driver, addFixture)
    const added = (addOutcomes[0] as { result: { taskId: string; slug: string; localId: string; reused: boolean } }).result
    expect(added.reused).toBe(false)
    const cards0 = await refetchOnce<TaskCard[]>(page, TASKS_CHANNELS.list, { projectKey, slug: 'sc7-feat' })
    expect(cards0.find((c) => c.taskId === added.taskId)?.taskStatus, 'add 后单次重取即见 pending').toBe('pending')

    // ── claim（回放主径）：三读面单次重取即见 in_progress + 账本 claim 行 ──
    const claimFixture = createFixtureBuilder({ source: 'hand', note: '5.2 SC7 claim 段' })
      .verb('forgeTasks', 'claimTask', { projectKey, taskRef: { slug: added.slug, localId: added.localId }, sessionId: DISPATCH_SESSION })
      .build()
    await replayWrites(driver, claimFixture)
    // 即时判据：claim 返回后单发读面（无等待兜底）——list/graph/detail 三读面
    const listAfterClaim = await refetchOnce<TaskCard[]>(page, TASKS_CHANNELS.list, { projectKey, slug: 'sc7-feat' })
    expect(listAfterClaim.find((c) => c.taskId === added.taskId)?.taskStatus, '列表读面：claim 后单次重取即见 in_progress').toBe('in_progress')
    const graphAfterClaim = await refetchOnce<{ tasks: TaskCard[] }>(page, TASKS_CHANNELS.graph, { projectKey, slug: 'sc7-feat' })
    expect(graphAfterClaim.tasks.find((c) => c.taskId === added.taskId)?.taskStatus, '图读面（泳道数据源）：单次重取即见 in_progress').toBe('in_progress')
    const detailAfterClaim = await refetchOnce<TaskDetail>(page, TASKS_CHANNELS.detail, { projectKey, taskId: added.taskId })
    expect(detailAfterClaim.taskStatus, '详情读面（抽屉数据源）：单次重取即见 in_progress').toBe('in_progress')
    const dbAfterClaim = openTaskLoopDbFull(userData)
    try {
      expect(dbAfterClaim.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM task_records WHERE task_id = ? AND verb = 'claim'`,
      ).get(added.taskId)?.n, '账本 claim 行在场（轨迹面对账）').toBe(1)
    } finally {
      dbAfterClaim.close()
    }

    // ── submit success（回放主径）：结算 → 单次重取即见 completed + 账本轨迹链 ──
    const submitFixture = createFixtureBuilder({ source: 'hand', note: '5.2 SC7 结算段' })
      .verb('forgeTasks', 'submitTask', {
        projectKey,
        taskRef: { slug: added.slug, localId: added.localId },
        result: 'success',
        summary: 'SC7 真闭环结算（5.2 e2e）',
        gate: { compile: true, fmt: true, lint: true, test: true },
        sessionId: EXEC_SESSION,
      })
      .build()
    const submitOutcomes = await replayWrites(driver, submitFixture)
    expect((submitOutcomes[0] as { result: { status: string } }).result.status).toBe('completed')
    const detailAfterSubmit = await refetchOnce<TaskDetail>(page, TASKS_CHANNELS.detail, { projectKey, taskId: added.taskId })
    expect(detailAfterSubmit.taskStatus, '详情读面：submit 后单次重取即见 completed').toBe('completed')
    expect(detailAfterSubmit.records.length, 'submit 记录水化（时间线数据源同步即见）').toBeGreaterThanOrEqual(3) // add + claim + submit
    const dbAfterSubmit = openTaskLoopDbFull(userData)
    try {
      const verbs = dbAfterSubmit.prepare<unknown[], { verb: string }>(
        `SELECT verb FROM task_records WHERE task_id = ? ORDER BY rowid`,
      ).all(added.taskId).map((r) => r.verb)
      expect(verbs, '账本审计链 append-only：add → claim → submit').toEqual(['add', 'claim', 'submit'])
    } finally {
      dbAfterSubmit.close()
    }

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
    const toolFaceRejection = await callAny('forgeTasks', 'transitionTask', { projectKey, taskId: added.taskId, toStatus: 'skipped', reason: '面分治探针' })
      .then(() => 'unexpectedly-resolved', (cause: unknown) => String((cause as Error)?.message ?? cause))
    expect(toolFaceRejection, 'tool 传输面拒绝 transitionTask（注册面缺席的运行面自证——G1-11 pin 呼应）').toContain('不在测试钩子可达面')

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})
