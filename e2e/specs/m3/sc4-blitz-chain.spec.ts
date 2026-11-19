// @feature:dsh-forge-m3-bootstrap-presets @web-e2e
// M3 5.2 SC4 突击直达链（PRD Goals SC4 / 图 12 上链——proposal 域退役后 fixed-migration）：
//   容器播种经 features 域注册（FEATURES_CHANNELS.register——proposal 域随域退役，容器 pill
//   菜单单源 = features 轨投影）+ addTask 直挂（slug 弱引用）→ 任务子 tab 容器 pill 切换
//   （蓝点·mode 恒 expedition）→ claim/submit → 三视图（列表/泳道/DAG）即时刷新
//   （写推送事件驱动——M2 机制）。
//
// 退役面（plugin-spec proposal 域下线——原 accepted-verdict / 零 feature 行断言 /
// 提案卡 taskCount / 提案子 tab 行状态等提案域断言面随域退役，不再重建）。
import { expect } from '@playwright/test'
import { OFFICIAL_STACK_GATE_NOTE, officialStackConverged } from '../../support/official-stack-gate.js'
import { FEATURES_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { registerProject, forgeInvoke } from '../../support/rpc.js'
import { createSharedLaunchFixture } from '../../support/fixtures.js'
import { createBridgeDriver } from '../../support/replay/executor.js'
import { openTaskLoopDbFull } from '../../support/sqlite.js'
import { openOverviewDock } from '../../support/navigation.js'
import { ovSubtabOf, ttCardOf, ttColOf, ttItemOf } from '../../support/anchors.js'
import { switchTaskView } from '../../support/m3.js'
import { projectKeyOf } from '../../support/project-key.js'

const WS_NAME = 'ws-sc4'
const PROP = 'sc4-blitz'

// e2e-fast-shared-launch 存量迁移（批次四b）：共享 launch fixture——launchHost 整 spec 一次；
// 夹具工作区 = 空白目录（单用例 spec——账本 slug 隔离即天然成立）。
const { test } = createSharedLaunchFixture({
  seedWorkspace: () => undefined,
  workspaceName: WS_NAME,
  launch: { expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } },
})

test('@web-e2e @m3 SC4·突击直达链：容器注册 + 直挂任务 + 容器 pill 切换 + 三视图即时刷新', async ({ sharedLaunch }) => {
  // 族① gate-environment（plugin-spec/fix-7，bug eb786e62）：官方 0.2.2 世代 web 栈收敛前
  // 挂环境前提门控（skip 留痕非红；整代 co-upgrade 落地后自动复跑）——同会话 GUI 会话
  // 打开面挂 conversation.view 槽位原生崩溃（projectUserText 取值落空），崩溃对话框
  // 掩码阻断概览 dock 交互链。
  test.skip(!officialStackConverged(), OFFICIAL_STACK_GATE_NOTE)
  test.setTimeout(480_000)
  const { app, page, pageErrors, wsDir, udDir } = sharedLaunch
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const projectKey = projectKeyOf(wsDir)
    const driver = createBridgeDriver(app)

    // ── 容器播种（回放主径）：features 域注册 + 任务清单直挂（slug 容器弱引用）──
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: PROP, title: 'SC4 突击直达链演示' })
    const t1 = (await driver.call('forgeTasks', 'addTask', {
      projectKey, slug: PROP, title: '突击任务甲', type: 'doc',
    })) as { taskId: string; slug: string; localId: string }
    const t2 = (await driver.call('forgeTasks', 'addTask', {
      projectKey, slug: PROP, title: '突击任务乙', type: 'doc', dependsOn: [t1.localId],
    })) as { taskId: string; slug: string; localId: string }
    // 任务账本（task-loop.db 域账单源——slug 容器弱引用两行）
    const tl0 = openTaskLoopDbFull(udDir)
    try {
      expect(tl0.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM task_tasks WHERE slug = ? AND project_key = ?`).get(PROP, projectKey)?.n, '任务直挂容器（slug 双列——两行）').toBe(2)
    } finally {
      tl0.close()
    }

    // ── 任务子 tab：容器 pill 切至注册容器（features 轨——蓝点·恒远征）+ 行加载 ──
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
    await expect(page.locator(ttItemOf(t1.taskId)).first(), '直挂任务行在场（列表视图）').toBeVisible({ timeout: 30_000 })

    // ── 派发（回放主径承载）：claim + submit 甲 → 三视图即时刷新 ──
    await driver.call('forgeTasks', 'claimTask', { projectKey, taskRef: { slug: t1.slug, localId: t1.localId }, sessionId: 'e2e-sc4-dispatch' })
    await driver.call('forgeTasks', 'submitTask', {
      projectKey, taskRef: { slug: t1.slug, localId: t1.localId }, result: 'success',
      summary: 'SC4 突击甲结算（三视图即时刷新断言）', gate: { compile: true, fmt: true, lint: true, test: true },
      sessionId: 'e2e-sc4-executor',
    })
    // 列表视图：行收敛已完成（写推送事件驱动重取——即时判据 UI 面）
    await expect(page.locator(ttItemOf(t1.taskId)).first(), '列表视图即时刷新 = 已完成').toContainText('已完成', { timeout: 30_000 })
    // 泳道视图：卡片落入 completed 列
    await switchTaskView(page, 'swim')
    await expect(page.locator(ttColOf('completed')).locator(ttCardOf(t1.taskId)), '泳道视图即时刷新（completed 列）').toBeVisible({ timeout: 30_000 })
    // DAG 视图：节点 is-completed
    await switchTaskView(page, 'dag')
    const node = page.locator(`[data-dswf-tt-node="${t1.taskId}"]`)
    await expect(node, 'DAG 视图节点在场').toBeVisible({ timeout: 30_000 })
    await expect(node).toHaveClass(/is-completed/)
    // 乙保持待处理（依赖未领——池态一致性）
    await expect(page.locator(`[data-dswf-tt-node="${t2.taskId}"]`), '依赖方节点在场（未领取）').toBeVisible()
    await expect(page.locator(`[data-dswf-tt-node="${t2.taskId}"]`)).not.toHaveClass(/is-completed/)

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    // 共享 launch 形态：app/夹具生命周期归 fixture 层收尾（用例退出不 closeApp）
  }
})
