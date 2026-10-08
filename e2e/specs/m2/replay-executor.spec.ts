// @feature:dsh-forge-m2-pipeline @web-e2e
// 5.1 录制-回放执行器运行面自证（回放基建——AC1/AC2/AC4/AC5 运行判据；spec 面 = 5.2 消费同径）：
//   ① 主侧测试钩子在位（env DSH_FORGE_TEST_BRIDGE=1 门控）——globalThis 挂点经
//      electronApp.evaluate 主进程面可达，经 host.services 桥代理直调写动词；
//   ② 手工夹具回放（同格式可用）：add×2（优先级定序）→ claim（dispatchPrompt 全文 +
//      digest 形状）→ submit success——动词链全程零模型；
//   ③ 即时判据本体（Hard Rule）：写入返回后单次重取即见新值——refetchOnce 单发产品
//      读面 invoke，无任何轮询/等待兜底；
//   ④ 事件记账面：主进程收讫 tasks-changed 记录在案（fix 链事件流观测位；≤500ms 计时
//      归 5.2）；
//   ⑤ G1 pin 相容口径（AC5）：钩子在位时产品 RPC 面仍拒绝写动词（preload allowlist 守卫
//      运行面自证）+ env 缺席启动 = 挂点零注册（发布构建零痕迹——缺席态审计）；
//   ⑥ 备选通道（AC2）：forge.db 直插（派生目录取自产品面单源 RPC）→ 单次重取即见
//      （直读保证——直插无事件亦可单发读见）。
// M3 drift 台账（5.2 落定）：featureSlug → source:ContainerRef 容器化（1.1/2.4）+ INSERT 列
// source_kind/source_id（schema v1 直改）+ 4.6 v22 容器 pill/视图下拉锚随迁；claimTask 桥直调
// = core 服务 API 保留面（3.5 tool 退役——drift #1 处置：回放主径零波及）。

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import type { TaskCard } from '../../../packages/contracts/src/dto/forge.js'
import { FEATURES_CHANNELS, PROJECTS_M2_CHANNELS, TASKS_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { forgeInvoke, registerProject } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { createFixtureBuilder } from '../../support/replay/fixtures.js'
import { createBridgeDriver, refetchOnce, replayWrites } from '../../support/replay/executor.js'
import { openForgeDbAt, seedProposalRow } from '../../support/replay/db-insert.js'

test('@web-e2e @m2 5.1 回放主径：env 门控钩子 + 手工夹具回放 + 单次重取即见 + 事件记账 + 产品面守卫', async () => {
  test.setTimeout(300_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-replay-'))
  const wsDir = join(fixtureRoot, 'ws-demo')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-replay-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    // ── 夹具底座：产品面注册项目 + feature 登记（人类径 RPC——回放写动词外的产品写面） ──
    const project = await registerProject(page, wsDir, '回放演示')
    const projectId = project.id
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: 'demo-feature', title: '演示特性' })

    // ── ①③ 手工夹具回放：add×2（P0/P2 定序——就绪选择确定性）→ 单次重取即见 pending ──
    const driver = createBridgeDriver(app)
    const addFixture = createFixtureBuilder({ source: 'hand', note: '5.1 运行面自证·写段' })
      .verb('forgeTasks', 'addTask', { projectId, source: { kind: 'feature', slug: 'demo-feature' }, title: '任务甲（回放）', type: 'coding-feature', priority: 'P0' })
      .verb('forgeTasks', 'addTask', { projectId, source: { kind: 'feature', slug: 'demo-feature' }, title: '任务乙（回放）', type: 'test-run', priority: 'P2' })
      .build()
    const addOutcomes = await replayWrites(driver, addFixture)
    expect(addOutcomes.map((o) => o.verb)).toEqual(['addTask', 'addTask'])
    const addA = addOutcomes[0]!.result as { taskId: string; slug: string; localId: string; reused: boolean }
    const addB = addOutcomes[1]!.result as { localId: string }
    expect(addA.reused).toBe(false)
    // 即时判据①：add 返回后单次重取即见两任务（pending——无轮询等待兜底）
    let cards = await refetchOnce<TaskCard[]>(page, TASKS_CHANNELS.list, { projectId, source: { kind: 'feature', slug: 'demo-feature' } })
    expect(cards.map((c) => [c.localId, c.taskStatus]).sort()).toEqual([
      [addA.localId, 'pending'],
      [addB.localId, 'pending'],
    ])

    // ── ② claim：就绪选择（P0 优先）→ dispatchPrompt 全文 + digest 12hex（observed 载荷面同构） ──
    const claim = (await driver.call('forgeTasks', 'claimTask', { projectId, source: { kind: 'feature', slug: 'demo-feature' }, sessionId: 'e2e-replay-dispatch' })) as {
      task: { taskId: string; slug: string; localId: string } | null
      dispatchPrompt: string
      digest: string
      reclaimed: boolean
    }
    expect(claim.task?.taskId).toBe(addA.taskId)
    expect(claim.reclaimed).toBe(false)
    expect(claim.dispatchPrompt.length).toBeGreaterThan(200) // 全文简报（人格段 + 三标签块）
    expect(claim.digest).toMatch(/^[0-9a-f]{12}$/)
    // 即时判据②：claim 返回后单次重取即见 in_progress
    cards = await refetchOnce<TaskCard[]>(page, TASKS_CHANNELS.list, { projectId, source: { kind: 'feature', slug: 'demo-feature' } })
    expect(cards.find((c) => c.taskId === addA.taskId)?.taskStatus).toBe('in_progress')

    // ── ②③ submit success（夹具收尾段——taskRef 取 claim 结算自然键）→ 单次重取即见 completed ──
    const tailFixture = createFixtureBuilder({ source: 'hand', note: '5.1 运行面自证·结算段' })
      .verb('forgeTasks', 'submitTask', {
        projectId,
        taskRef: { slug: claim.task!.slug, localId: claim.task!.localId },
        result: 'success',
        summary: '回放演示提交（5.1）',
        gate: { compile: true, fmt: true, lint: true, test: true },
        sessionId: 'e2e-replay-exec',
      })
      .build()
    const [submitOutcome] = await replayWrites(driver, tailFixture)
    expect((submitOutcome!.result as { status: string }).status).toBe('completed')
    cards = await refetchOnce<TaskCard[]>(page, TASKS_CHANNELS.list, { projectId, source: { kind: 'feature', slug: 'demo-feature' } })
    expect(cards.find((c) => c.taskId === addA.taskId)?.taskStatus).toBe('completed')
    expect(cards.find((c) => c.localId === addB.localId)?.taskStatus).toBe('pending')

    // ── ④ 事件记账：写动词（add×2 + claim + submit）主进程收讫 tasks-changed ≥4、载荷同 projectId ──
    const events = await driver.events()
    expect(events.length).toBeGreaterThanOrEqual(4)
    expect(events.every((e) => e.channel === 'forge:events/tasks-changed' && e.payload.projectId === projectId)).toBe(true)

    // ── ⑤ 产品面守卫：钩子在位，preload RPC 面仍拒绝写动词（不在 allowlist——fail-loud） ──
    const rejection = await page.evaluate(async () => {
      const forge = (globalThis as { dshForge?: { invoke(channel: string, payload?: unknown): Promise<unknown> } }).dshForge
      try {
        await forge!.invoke('forge:tasks/addTask', {})
        return 'unexpectedly-resolved'
      } catch (e) {
        return String((e as Error)?.message ?? e)
      }
    })
    expect(rejection).toContain('不在 allowlist')

    // ── ⑥ 备选通道：派生目录（产品面单源 RPC）→ forge.db 直插 proposal → 单次重取即见（直读） ──
    const derived = await refetchOnce<{ dir: string }>(page, PROJECTS_M2_CHANNELS.deriveTaskStoreDir, { workspaceDir: wsDir })
    const db = openForgeDbAt(derived.dir)
    try {
      seedProposalRow(db, { slug: 'direct-insert-proposal', title: '直插提案', status: 'under-review' })
    } finally {
      db.close()
    }
    const proposals = await refetchOnce<Array<{ slug: string }>>(page, 'forge:proposals/list', { projectId })
    expect(proposals.map((p) => p.slug)).toContain('direct-insert-proposal')

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @m2 5.1 缺席态审计：env 缺席启动 → 测试钩子零注册（发布构建零痕迹——G1 pin 相容口径）', async () => {
  test.setTimeout(240_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-replay-absent-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' }) // 不带 DSH_FORGE_TEST_BRIDGE
  const { app, pageErrors } = launched
  try {
    const present = await app.evaluate(() => (globalThis as { __DSH_FORGE_TEST_BRIDGE__?: unknown }).__DSH_FORGE_TEST_BRIDGE__ !== undefined)
    expect(present, 'env 缺席 = globalThis 挂点零注册（发布构建零痕迹）').toBe(false)
    expect(pageErrors).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(userData)
  }
})
