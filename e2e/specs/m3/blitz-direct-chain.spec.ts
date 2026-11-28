// @feature:dsh-forge-m3-bootstrap-presets @web-e2e
// gen-test-scripts 产物 —— Journey: blitz-direct-chain（T-test-gen-scripts，proposal 域退役后
// fixed-migration 重建）。断言源 = docs/features/dsh-forge-m3-bootstrap-presets/testing/
// blitz-direct-chain/contracts/ step-{1..5}-*.md（eval-contract 982/1100 通过）。
//
// 载体纪律（Hard Rule）：零真实模型——容器播种经 features 域注册（FEATURES_CHANNELS.register
// ——proposal 域随域退役，容器 pill 菜单单源 = features 轨投影）+ addTask 直挂（slug 弱引用，
// 整数 ID 语义）；读面 = RPC 单发（refetchOnce 即时判据）+ 概览任务子 tab UI 面；
// 库级断言 = task-loop.db 域账（openTaskLoopDbFull——task_tasks/task_settlements 单源）
// ∪ 工作区 forge.db feature 域（openForgeDbAt——features/feature_records）。
//
// 退役面（plugin-spec proposal 域下线）：
//   - 原 Step2b（打回修订 + 空因拒绝——纯提案 verdict 对话框面）随域退役，整测删除；
//   - 提案 mode 溯源/五态/accepted 无 feature 行/提案卡 taskCount 等提案域断言面随域退役。
//
// Assertion depth: 33/36 behavioral（92%），其中 deep 14/33（42%）——两阈均过。

import { FEATURES_CHANNELS, TASKS_CHANNELS } from '@dsh-forge/lib-api/channels'
import { createSharedLaunchFixture, sharedOverlayText } from '../../support/fixtures.js'
import { expect } from '@playwright/test'
import { OFFICIAL_STACK_GATE_NOTE, officialStackConverged } from '../../support/official-stack-gate.js'
import { registerProject, forgeInvoke } from '../../support/rpc.js'
import { createBridgeDriver, refetchOnce } from '../../support/replay/executor.js'
import { openForgeDbAt } from '../../support/replay/db-insert.js'
import { openTaskLoopDbFull } from '../../support/sqlite.js'
import { openOverviewDock } from '../../support/navigation.js'
import { ovSubtabOf, ttCardOf, ttColOf, ttItemOf } from '../../support/anchors.js'
import { switchTaskView, presetSkillDirs } from '../../support/m3.js'
import { projectKeyOf } from '../../support/project-key.js'

const WS_NAME = 'ws-jbdc'

// e2e-fast-shared-launch 存量迁移（批次四a）：共享 launch fixture——launchHost 整 spec 一次；
// 夹具工作区 = 空白目录（本 spec 无夹具档案，任务账本 slug 隔离）；boot-overlay 判读经
// 支撑层单源 sharedOverlayText（SharedLaunchHandle.udDir 透传——魔法前缀扫描退役）。

// ── 共享 launch fixture ──
const { test } = createSharedLaunchFixture({
  seedWorkspace: () => undefined,
  workspaceName: WS_NAME,
  launch: { expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } },
})

test('@web-e2e @m3 突击直达链·冒烟：features 注册容器 → 直挂任务（整数 ID）→ 全绿三视图（Step1-4 success 全链——proposal 域退役后 fixed-migration）', async ({ sharedLaunch }) => {
  // 族① gate-environment（plugin-spec/fix-7，bug eb786e62）：官方 0.2.2 世代 web 栈收敛前
  // 挂环境前提门控（skip 留痕非红；整代 co-upgrade 落地后自动复跑）——本用例含 GUI 会话
  // 派发/转录面（conversation.view 槽位原生崩溃 + 崩窗掩码阻断概览 dock 交互链）；
  // 库级用例（Step3b/4b 受阻结算）不挂门、照跑。
  test.skip(!officialStackConverged(), OFFICIAL_STACK_GATE_NOTE)
  test.setTimeout(480_000)
  const { app, page, pageErrors, wsDir, udDir } = sharedLaunch
  const project = await registerProject(page, wsDir, WS_NAME)
  try {
    const projectId = project.id
    const projectKey = projectKeyOf(wsDir)
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })).dir
    const driver = createBridgeDriver(app)
    const PROP = 'jbdc-blitz'

    // ── Step1：容器播种（回放主径）——features 域注册 + 直挂任务清单（整数 ID 语义）──
    const feature = (await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: PROP, title: 'Jbdc 突击直达演示' })) as { featureId: string; slug: string }
    const db0 = openForgeDbAt(dir)
    try {
      const audit = db0.prepare<unknown[], { verb: string; actor: string }>(
        `SELECT verb, actor FROM feature_records WHERE feature_id = ? ORDER BY id`,
      ).all(feature.featureId)
      expect(audit, '注册审计伴随行（register·actor=plugin-tool——单事务伴随非补写）').toEqual([{ verb: 'register', actor: 'plugin-tool' }])
    } finally {
      db0.close()
    }
    const t1 = (await driver.call('forgeTasks', 'addTask', {
      projectKey, slug: PROP, title: '突击任务甲', type: 'doc',
    })) as { taskId: string; slug: string; localId: string }
    const t2 = (await driver.call('forgeTasks', 'addTask', {
      projectKey, slug: PROP, title: '突击任务乙', type: 'doc', dependsOn: [t1.localId],
    })) as { taskId: string; slug: string; localId: string }
    expect(/^\d+(\.\d+)?$/.test(t1.localId), `突击整数 ID 语义（localId=${t1.localId}——无 stage-gate 段，sc3 同口径）`).toBe(true)
    expect(/^\d+(\.\d+)?$/.test(t2.localId), '乙同为整数 ID（依赖前置声明可解析）').toBe(true)
    // 任务账本（task-loop.db 域账单源——slug 容器弱引用两行）
    const tl0 = openTaskLoopDbFull(udDir)
    try {
      expect(tl0.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM task_tasks WHERE slug = ? AND project_key = ?`).get(PROP, projectKey)?.n, '任务直挂容器（slug 双列——两行）').toBe(2)
    } finally {
      tl0.close()
    }

    // ── Step2 尾 → Step3 前置：任务子 tab 容器（features 轨——蓝点·恒远征）──
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('tasks')).click()
    await expect(page.locator(ovSubtabOf('tasks'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    await page.locator('[data-dswf-tt-contpill]').first().click()
    const menuItem = page.locator(`[data-dswf-tt-mcont="feature:${PROP}"]`).first()
    await expect(menuItem, '容器菜单含注册容器（features 轨投影——proposal 域退役）').toBeVisible({ timeout: 15_000 })
    await menuItem.click()
    const pill = page.locator(`[data-dswf-tt-contpill="feature:${PROP}"]`)
    await expect(pill, '容器 pill 切至注册容器').toBeVisible({ timeout: 15_000 })
    await expect(pill.locator('.dswf-tt-contdot'), '蓝点 = feature 容器（mode 恒 expedition——container-pill.ts 单源投影）').toHaveAttribute('data-mode', 'expedition')

    // ── Step4：worker submit 全绿（回放主径）+ 单次重取即见（即时判据——无 watch）──
    const cards0 = await refetchOnce<readonly { taskId: string; taskStatus: string }[]>(page, TASKS_CHANNELS.list, { projectKey, slug: PROP })
    expect(cards0.find((c) => c.taskId === t1.taskId)?.taskStatus, '写前读面 = pending（对照锚）').toBe('pending')
    await driver.call('forgeTasks', 'claimTask', { projectKey, taskRef: { slug: t1.slug, localId: t1.localId }, sessionId: 'e2e-jbdc-dispatch' })
    const COMMIT = '1357bdf02468ace1357bdf02468ace1357bdf0'
    await driver.call('forgeTasks', 'submitTask', {
      projectKey, taskRef: { slug: t1.slug, localId: t1.localId }, result: 'success',
      summary: 'Jbdc 突击甲结算（全绿三视图断言）', gate: { compile: true, fmt: true, lint: true, test: true },
      commitHash: COMMIT, sessionId: 'e2e-jbdc-executor',
    })
    // concurrent-browsing-single-refetch：写入返回后单发重取即见新值（概览页签全程开着——读路径活跃）
    const cards1 = await refetchOnce<readonly { taskId: string; taskStatus: string }[]>(page, TASKS_CHANNELS.list, { projectKey, slug: PROP })
    expect(cards1.find((c) => c.taskId === t1.taskId)?.taskStatus, '写入返回后单次重取即见 completed（即时判据）').toBe('completed')
    expect(cards1.find((c) => c.taskId === t2.taskId)?.taskStatus, '依赖方保持待处理（池态一致）').toBe('pending')
    // 列表视图即时刷新（事件驱动 UI 收敛）
    await expect(page.locator(ttItemOf(t1.taskId)).first(), '列表视图即时刷新 = 已完成').toContainText('已完成', { timeout: 30_000 })
    // 泳道视图：卡片落入 completed 列
    await switchTaskView(page, 'swim')
    await expect(page.locator(ttColOf('completed')).locator(ttCardOf(t1.taskId)), '泳道视图即时刷新（completed 列）').toBeVisible({ timeout: 30_000 })
    // DAG 视图：节点 is-completed + 依赖方未完成
    await switchTaskView(page, 'dag')
    const node = page.locator(`[data-dswf-tt-node="${t1.taskId}"]`)
    await expect(node, 'DAG 节点在场').toBeVisible({ timeout: 30_000 })
    await expect(node).toHaveClass(/is-completed/)
    await expect(page.locator(`[data-dswf-tt-node="${t2.taskId}"]`), '依赖方节点在场（未领取）').toBeVisible()
    await expect(page.locator(`[data-dswf-tt-node="${t2.taskId}"]`)).not.toHaveClass(/is-completed/)
    // 结算 commit_hash（task-loop.db task_settlements 域账单源——records 镜像列随域退役）
    const tl = openTaskLoopDbFull(udDir)
    try {
      const rec = tl.prepare<unknown[], { commit_hash: string | null }>(
        `SELECT commit_hash FROM task_settlements WHERE task_id = ? AND result = 'success'`,
      ).get(t1.taskId)
      expect(rec?.commit_hash, '结算行含提交哈希（入自身库）').toBe(COMMIT)
    } finally {
      tl.close()
    }

    // ── Step5：全程技能清单核查（L1 数据直证——SC2① 同源）──
    const overlay = sharedOverlayText(udDir)
    const blitzDirs = presetSkillDirs(overlay, 'blitz')
    expect(blitzDirs.every((d) => !d.toLowerCase().includes('skills-blitz')), 'plugin-spec 1.9 skills-blitz 退役：突击组合零专属技能目录（grilling 迁 spec）').toBe(true)
    expect(blitzDirs.every((d) => !d.toLowerCase().includes('plugin-forge')), '旧包技能目录物理缺席（M1 阶段B 退役——枚举面即证）').toBe(true)
    expect(blitzDirs.every((d) => !d.toLowerCase().includes('plugin-forge-spec')), '规格技能目录物理缺席（七者零在场——枚举面即证）').toBe(true)
    expect(overlay.includes('!!js'), '物化零 !!js（绝对路径 only）').toBe(false)

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    // 共享 launch 形态：app/夹具生命周期归 fixture 层收尾（用例退出不 closeApp）
  }
})

// 退役（plugin-spec proposal 域下线——提案 verdict 流转面随域退役）：原 Step2b（打回修订
// under-review → draft + 空因拒绝留场零写库）整测删除，评审流转对话框/五态机断言面不再重建。

test('@web-e2e @m3 突击直达链·Step3b/4b：受阻结算落账 + AC 缺证据拒绝（清单逐行 + 状态不变零记录）', async ({ sharedLaunch }) => {
  test.setTimeout(420_000)
  const { app, page, pageErrors, wsDir, udDir } = sharedLaunch
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const projectKey = projectKeyOf(wsDir)
    const driver = createBridgeDriver(app)
    const PROP = 'jbdc-block'
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: PROP, title: 'Jbdc 受阻与证据门演示' })
    const tBlocked = (await driver.call('forgeTasks', 'addTask', {
      projectKey, slug: PROP, title: '受阻任务', type: 'doc',
    })) as { taskId: string; slug: string; localId: string }
    const AC = ['[AC-1] 突击证据甲在场（Jbdc）', '[AC-2] 突击证据乙含清单（Jbdc）']
    const tAc = (await driver.call('forgeTasks', 'addTask', {
      projectKey, slug: PROP, title: '带清单任务', type: 'doc', acceptanceCriteria: AC,
    })) as { taskId: string; slug: string; localId: string }

    // ── worker-blocked：submitTask result=blocked（reason 必带）→ 落账 + 审计行 ──
    await driver.call('forgeTasks', 'claimTask', { projectKey, taskRef: { slug: tBlocked.slug, localId: tBlocked.localId }, sessionId: 'e2e-jbdc3-dispatch' })
    await driver.call('forgeTasks', 'submitTask', {
      projectKey, taskRef: { slug: tBlocked.slug, localId: tBlocked.localId }, result: 'blocked',
      reason: 'Jbdc 受阻演示（重大问题——逃生通道前缀语义归 worker-provisioning 旅程）', sessionId: 'e2e-jbdc3-executor',
      blockClassification: { kind: 'new-problem' },
    })
    const tl = openTaskLoopDbFull(udDir)
    try {
      expect(tl.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM task_tasks WHERE id = ?`).get(tBlocked.taskId)?.task_status, '受阻落账 = blocked').toBe('blocked')
      expect(tl.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM task_settlements WHERE task_id = ? AND result = 'blocked'`).get(tBlocked.taskId)?.n, '受阻结算行在场（reason 载荷单源）').toBeGreaterThanOrEqual(1)
      expect(tl.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM task_records WHERE task_id = ? AND verb = 'submit'`).get(tBlocked.taskId)?.n, '受阻 submit 审计行在场（轨迹）').toBeGreaterThanOrEqual(1)
    } finally {
      tl.close()
    }

    // ── ac-evidence-missing：带 AC 任务缺测试证据 → 拒绝且错误信息含 AC 清单逐行 ──
    await driver.call('forgeTasks', 'claimTask', { projectKey, taskRef: { slug: tAc.slug, localId: tAc.localId }, sessionId: 'e2e-jbdc3-dispatch' })
    const noEvidence = await rejectMessage(driver.call('forgeTasks', 'submitTask', {
      projectKey, taskRef: { slug: tAc.slug, localId: tAc.localId }, result: 'success',
      summary: '缺测试证据的结算（应被拒）', gate: { compile: true, fmt: true, lint: true, test: false },
      sessionId: 'e2e-jbdc3-executor',
    }))
    expect(noEvidence, '拒绝面 = 缺测试证据（人话——非裸错误码）').toContain('缺测试证据')
    expect(noEvidence, '错误信息含 AC 清单逐行（甲）').toContain(AC[0] as string)
    expect(noEvidence, '错误信息含 AC 清单逐行（乙）').toContain(AC[1] as string)
    const tl2 = openTaskLoopDbFull(udDir)
    try {
      expect(tl2.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM task_tasks WHERE id = ?`).get(tAc.taskId)?.task_status, '任务状态不变更（保持 in_progress）').toBe('in_progress')
      expect(tl2.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM task_records WHERE task_id = ? AND verb = 'submit'`).get(tAc.taskId)?.n, '零 submit 记录（单事务全成全败）').toBe(0)
      expect(tl2.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM task_settlements WHERE task_id = ?`).get(tAc.taskId)?.n, '零结算行（拒绝零部分写）').toBe(0)
    } finally {
      tl2.close()
    }
    // 补齐证据后过门（gate 纪律不折扣——补证放行）
    await driver.call('forgeTasks', 'submitTask', {
      projectKey, taskRef: { slug: tAc.slug, localId: tAc.localId }, result: 'success',
      summary: 'Jbdc 补齐测试证据结算', gate: { compile: true, fmt: true, lint: true, test: true },
      sessionId: 'e2e-jbdc3-executor',
    })
    const tl3 = openTaskLoopDbFull(udDir)
    try {
      expect(tl3.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM task_tasks WHERE id = ?`).get(tAc.taskId)?.task_status, '补证后过门 = completed').toBe('completed')
    } finally {
      tl3.close()
    }

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    // 共享 launch 形态：app/夹具生命周期归 fixture 层收尾（用例退出不 closeApp）
  }
})

/** 写动词拒绝面捕获（bridge 直调错误 message = core typed error 文案——sc7 同径） */
async function rejectMessage(promise: Promise<unknown>): Promise<string> {
  return promise.then(() => 'unexpectedly-resolved', (cause: unknown) => String((cause as Error)?.message ?? cause))
}
