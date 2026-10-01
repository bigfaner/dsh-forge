// @feature dsh-forge-m4 | @web-e2e | @journey project-workbench-home
// Traceability: docs/features/dsh-forge-m4/testing/project-workbench-home/
// contracts/step-5-forge-views-adoption.md — Outcome:
//   success — 逐视图巡检(提案板/feature 任务浏览/阶段资产/任务看板):每个
//             视图均处项目上下文(孤儿视图 0,以全量路由归属枚举核验);
//             M2 看板保持独立视图;M3 面收纳零缩水;发起链原位保留。
// fixture_spec: Project ×1 + Proposal ×2 + Feature ×1 + Task ×3 + StageAsset ×2。
// Techniques: sc2-full ②(收纳零缩水逐面)/ sc1 ③(孤儿视图全量路由归属
// 枚举 —— retired TabBar/三容器/rail 零残留 = 全量入口均处项目上下文)。

import { expect, test } from '@playwright/test'
import {
  activateProjectByTreeRow, clickStable, focusOverviewSubtab, M4WorldManager,
  newSessionButton, startAutoDismiss,
} from '../_lib/m4-world.ts'
import { openBoardPane } from '../_lib/journey-world.ts'
import { bootMainWorld, buildMainJourneyRoot, FEATURE, PROP_LINKED, PROP_ORPHAN, TASK_EXEC, TASK_FREE, TASK_DEP } from './harness.ts'

test.describe.serial('project-workbench-home / step 5: 巡检 forge 视图归属与收纳零缩水', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — 全量 forge 视图处于项目上下文 + 收纳零缩水。
  test('step5/success: forge 视图巡检 —— 全部处项目上下文(孤儿 0)+ M3 面收纳零缩水 + 发起链原位保留', async ({ }, testInfo) => {
    testInfo.setTimeout(480_000)
    const built = await buildMainJourneyRoot()
    const world = await bootMainWorld(manager, 'main', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await newSessionButton(page).waitFor({ state: 'visible', timeout: 30_000 })

    // ---- 提案板(M3 提案板 → 概览 proposals 子 tab 收纳;功能面完整)-------
    await focusOverviewSubtab(page, 'proposals', '[data-dsh-forge-overview-proposals]')
    await expect(page.locator(`[data-dsh-forge-overview-prop-dir="${PROP_LINKED}"]`),
      '提案目录行在场(收纳零缩水:目录树方言)').toBeVisible({ timeout: 20_000 })
    await expect(page.locator(`[data-dsh-forge-overview-prop-dir="${PROP_ORPHAN}"]`),
      '孤儿提案目录行在场(全量提案枚举)').toBeVisible()
    await expect(page.locator(`[data-dsh-forge-overview-prop-feature="${FEATURE}"]`),
      '提案↔feature 互跳 chip 在场(M3 互跳面保留)').toBeVisible()

    // ---- feature/任务浏览(M3 feature 面 → 概览 features 子 tab 收纳)------
    await focusOverviewSubtab(page, 'features', '[data-dsh-forge-overview-features]')
    await expect(page.locator(`[data-dsh-forge-overview-feature-dir="${FEATURE}"]`),
      'feature 目录行在场').toBeVisible({ timeout: 20_000 })
    // 展开目录 → 文档行(prd/design/tasks = 语料 docKinds;阶段资产 = stages
    // 目录的 StageAsset 面承载,M3 阶段资产面板零缩水收纳)。首个目录行在
    // fresh board 落位时已自动展开(§4.4②)—— 以 aria-expanded 为准补点击,
    // 盲点会把它收起。
    const featureDir = page.locator(`[data-dsh-forge-overview-feature-dir="${FEATURE}"]`)
    if (await featureDir.getAttribute('aria-expanded') !== 'true') {
      await clickStable(page, `[data-dsh-forge-overview-feature-dir="${FEATURE}"]`)
    }
    await expect(featureDir).toHaveAttribute('aria-expanded', 'true', { timeout: 10_000 })
    for (const kind of ['prd', 'design', 'tasks'] as const) {
      await expect(page.locator(`[data-dsh-forge-overview-doc="features/${FEATURE}/${kind}"]`),
        `feature 文档行 ${kind} 在场(M3 docKind 集完整)`).toBeVisible({ timeout: 20_000 })
    }

    // ---- 任务看板(M2 看板 = 独立视图,右栏 board pane 双宿主)--------------
    await openBoardPane(page)
    for (const key of [TASK_EXEC, TASK_FREE, TASK_DEP]) {
      await expect(page.locator(`[data-dsh-forge-node-card="${key}"]`),
        `看板节点全集含 ${key}(DAG 视图 = 默认视图 A)`).toBeVisible({ timeout: 30_000 })
    }
    // 发起链原位保留(挂接写入不变):派发入口 → 多选链可达 → 取消。
    const entry = page.locator('[data-dsh-forge-dispatch-entry]')
    await expect(entry, '派发入口在场(发起链原位保留)').toBeVisible({ timeout: 15_000 })
    await expect(entry).toHaveAttribute('data-dsh-forge-dispatch-entry-active', 'false', { timeout: 20_000 })
    await clickStable(page, '[data-dsh-forge-dispatch-entry]')
    await expect(page.locator('[data-dsh-forge-selection-layer="active"]'),
      '多选链进入(选择层激活)').toBeVisible({ timeout: 10_000 })
    await clickStable(page, `[data-dsh-forge-select-chk="${TASK_FREE}"] [data-dsh-forge-select-chk-input]`)
    await expect(page.locator('[data-dsh-forge-dispatch-count]'), '选中计数在座').toContainText('1')
    await clickStable(page, '[data-dsh-forge-dispatch-cancel]')
    await expect(page.locator('[data-dsh-forge-selection-layer="active"]'),
      '取消退出选择层(链路可退出)').toHaveCount(0, { timeout: 10_000 })

    // ---- 孤儿视图 0(全量路由归属枚举,SC1 口径)---------------------------
    // retired M2/M3 全局面零残留 = 任何 forge 视图入口均处项目上下文。
    await expect(page.locator('[data-dsh-forge-tab]'), 'retired TabBar 面零残留(孤儿清零 ①)').toHaveCount(0)
    for (const retired of ['tasks', 'features', 'proposals'] as const) {
      await expect(page.locator(`[data-dsh-forge-view="dsh-forge-view-${retired}"]`),
        `retired 容器 dsh-forge-view-${retired} 零挂载(孤儿清零 ②)`).toHaveCount(0)
    }
    await expect(page.locator('[data-dsh-forge-rail]'), '降级 rail 不在场(孤儿清零 ③)').toHaveCount(0)
    await expect(page.locator('[data-dsh-forge-add-project]'), 'retired TopBar 添加入口零残留').toHaveCount(0)
    await expect(page.locator('[data-dsh-forge-switcher-trigger]'), 'retired ProjectSwitcher 零残留').toHaveCount(0)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })
})
