// @feature dsh-forge-m4 | @web-e2e | @journey project-lifecycle-projection
// Traceability: docs/features/dsh-forge-m4/testing/project-lifecycle-
// projection/contracts/step-1-projection-status.md — Outcomes:
//   success — 投影状态 healthy(对账一致);生命周期动作与归档语义说明呈现;
//   degraded-retry — 降级态提示 + 手动 [重试投影];生命周期操作不被阻断;
//             重试成功即两侧一致;
//   deviation-renamed — dsh 手工改名 → deviation 明细(差异事实 + 处理建议),
//             不回流、任何入口不触发反向写;
//   deviation-deleted-reordered — dsh 手工删除/乱序 → deviation 明细;forge 侧
//             权威数据不被改动;
//   archived-sessions-zone — 已归档会话区(上游原生设置面承载,M4 零代码;
//             本腿断言接续效果 —— 见 header 的 anchor N/A 裁决消费)。
// fixture_spec: Project ×2(healthy)+ Workspace 同名同序;降级/偏差腿经
// DSH_FORGE_PROJECTION_FAULTS 注错缝与 submitWorkspaceSnapshot 手改注入承载。
// Techniques: sc3-degrade ①②③④(status 面 + 通道故障 + 静默门 + 手改注入)。
//
// VERIFY(anchor N/A ruling consumed, archived-sessions-zone):契约 anchor-note
// 裁决 = 会话归档恢复口为上游原生设置面「已归档会话」区(page-map 无元素条
// 目,不造页;M4 零代码,裁决 #25-⑥)。本腿断言 M4 可达面:UF3 会话行 ⋯ 菜单
// 归档(行从会话列表消失)+ 历史经 REAL backend 二次可读(解除归档的接续前
// 提在座);上游原生设置面的解除归档交互(非 M4 交付面)不在此伪造。

import { expect, test } from '@playwright/test'
import { createProjectionFaultStub } from '../../stubs/projection-faults.ts'
import { readCorpusSession } from '../../stubs/lineage-corpus.ts'
import {
  activateProjectByTreeRow, bridgeInvoke, clickMenuItem, M4WorldManager,
  openLifecycleMenu, openOverviewForActiveProject, projectionStatusRow,
  readLiveRegistry, rowAtAnchor, startAutoDismiss, waitForProjectionQuiescence,
  waitForRegistry, waitForStatus,
} from '../_lib/m4-world.ts'
import { clickStable } from '../_lib/m4-world.ts'
import { CARRIER, SESS_A, bootLcWorld, buildLcJourneyRoot, registerLcProjects, renameViaMenu } from './harness.ts'

/** 手工改名注入的 dsh 侧新名(≠ forge 期望名)。 */
const MANUAL_RENAMED = 'lc-手改名'

test.describe.serial('project-lifecycle-projection / step 1: 查看投影状态', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — healthy 状态行 + 生命周期动作呈现。
  test('step1/success: 投影状态 healthy —— 状态行与 dsh 侧一致 + 生命周期动作在概览可达', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const built = await buildLcJourneyRoot()
    const world = await bootLcWorld(manager, 'main', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await registerLcProjects(built, page)
    await activateProjectByTreeRow(page, kernel.projectId)

    // 投影 healthy(内核面)+ 概览状态行(消费面)一致呈现。
    await waitForStatus(page, kernel.projectId, row => row.state === 'healthy' && row.deviations.length === 0,
      '承载项目投影 healthy(对账一致)')
    await openOverviewForActiveProject(page, CARRIER, `[data-dsh-forge-tree-project="${kernel.projectId}"]`)
    const statusRow = projectionStatusRow(page)
    await expect(statusRow, '状态行在座(UF8 投影与生命周期)').toBeVisible({ timeout: 15_000 })
    await expect(statusRow, 'healthy 状态行(与 dsh 侧一致文案)').toHaveAttribute('data-state', 'healthy', { timeout: 15_000 })
    await expect(statusRow, 'healthy 文案 = 与 dsh 侧一致').toContainText('与 dsh 侧一致')
    // 生命周期动作可达(⋯ 菜单词汇:重命名/归档项目/删除项目)。
    await openLifecycleMenu(page, kernel.projectId)
    const menu = page.locator(`[data-dsh-forge-tree-project-menu="${kernel.projectId}"]`)
    for (const label of [/重命名/, /归档项目/, /删除项目/]) {
      await expect(menu.locator('[role="menuitem"]', { hasText: label }),
        `生命周期动作在座:${String(label)}`).toBeVisible()
    }
    await clickStable(page, `[data-dsh-forge-tree-project-menu="${kernel.projectId}"]`)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "degraded-retry" — 降级呈现 + 重试恢复 + 生命周期不被阻断。
  test('step1/degraded-retry: 通道故障注册 → degraded 提示 + [重试投影] + 生命周期不阻断 + 恢复两侧一致', async ({ }, testInfo) => {
    testInfo.setTimeout(540_000)
    const built = await buildLcJourneyRoot()
    const faultStub = createProjectionFaultStub(`${built.root}\\stub`)
    const world = await bootLcWorld(manager, 'fault', built, faultStub.env)
    const { page, kernel, dshHome } = world
    stopAutoDismiss = startAutoDismiss(page)
    // 注册先行(故障未注入:期望/快照基线在座),再注入故障触发首个 degraded push。
    await registerLcProjects(built, page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await waitForStatus(page, kernel.projectId, row => row.state === 'healthy', 'A healthy(基线)')
    faultStub.failChannel()
    // 触发一次 push(改名经 ⋯ 菜单 = 生命周期操作;同时证「不被阻断」)。
    await activateProjectByTreeRow(page, kernel.projectId)
    await renameViaMenu(page, kernel.projectId, `${CARRIER}-故障期改名`)
    await expect(page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
      '改名本地生效(生命周期操作不被投影失败阻断)').toContainText('故障期改名', { timeout: 15_000 })
    await waitForStatus(page, kernel.projectId, row =>
      row.state === 'degraded' && (row.lastError ?? '').includes('ERR_PROJECTION_CHANNEL_UNAVAILABLE'),
    '改名 push degraded = 通道不可用')
    // 实况零投递(改名不达 dsh 侧)。
    await page.waitForTimeout(1_500)
    expect(rowAtAnchor(readLiveRegistry(dshHome) as NonNullable<ReturnType<typeof readLiveRegistry>>, kernel.codeRoot)?.title,
      '实况仍为旧名(零投递)').not.toContain('故障期改名')

    // 概览:degraded 状态行 + [重试投影];恢复 → healthy + 两侧一致。
    await openOverviewForActiveProject(page, `${CARRIER}-故障期改名`, `[data-dsh-forge-tree-project="${kernel.projectId}"]`)
    const statusRow = projectionStatusRow(page)
    await expect(statusRow, 'degraded 状态行(降级提示)').toHaveAttribute('data-state', 'degraded', { timeout: 20_000 })
    const retry = page.locator('[data-dsh-forge-projection-retry]')
    await expect(retry, '手动 [重试投影] 入口在场').toBeVisible({ timeout: 10_000 })
    faultStub.clear()
    await retry.click()
    await expect(statusRow, '重试后 healthy(两侧一致)').toHaveAttribute('data-state', 'healthy', { timeout: 30_000 })
    await waitForRegistry(page, dshHome, registry =>
      rowAtAnchor(registry, kernel.codeRoot)?.title === `${CARRIER}-故障期改名`,
    '重试收敛:实况 = 改名后新名(两侧一致)')
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcomes "deviation-renamed" + "deviation-deleted-reordered" — 手改注入族。
  test('step1/deviation-renamed+deleted-reordered: dsh 手改(改名/删除/乱序)→ deviation 明细呈现 + 零反向写 + forge 权威不动', async ({ }, testInfo) => {
    testInfo.setTimeout(540_000)
    const built = await buildLcJourneyRoot()
    const world = await bootLcWorld(manager, 'drift', built)
    const { page, kernel, dshHome } = world
    const other = built.other
    stopAutoDismiss = startAutoDismiss(page)
    await registerLcProjects(built, page)
    await activateProjectByTreeRow(page, kernel.projectId)
    // 前置:全行 healthy 收敛 + 投影面静默(手改注入的前置门,sc3-degrade ①)。
    await waitForStatus(page, kernel.projectId, row => row.state === 'healthy' && row.deviations.length === 0, 'A healthy')
    await waitForStatus(page, other.projectId, row => row.state === 'healthy' && row.deviations.length === 0, 'B healthy')
    await waitForProjectionQuiescence(page, world.mainLog)

    // 注入手改:A 改名 + 前插至 B 之前(乱序)+ B 删除(经 submitWorkspaceSnapshot
    // = Implementation Notes 的「手改 dsh 侧」形态:快照仅含 A-改名行)。
    const before = readLiveRegistry(dshHome) as NonNullable<ReturnType<typeof readLiveRegistry>>
    const rowA = rowAtAnchor(before, kernel.codeRoot)
    const rowB = rowAtAnchor(before, other.codeRoot)
    expect(rowA, '手改基线:A workspace 在座').toBeDefined()
    expect(rowB, '手改基线:B workspace 在座').toBeDefined()
    const projectionSurfaceBefore = JSON.stringify(before.order.map(row => ({ path: row.path, title: row.title })))
    const drifted = [
      { workspaceId: (rowA as { workspaceId: string }).workspaceId, path: (rowA as { path: string }).path, title: MANUAL_RENAMED, orderIdx: 0 },
    ]
    await bridgeInvoke(page, 'submitWorkspaceSnapshot', [{ workspaces: drifted }])

    // 偏差呈现:A renamed + reordered;B deleted(明细 = 差异事实)。
    const aDeviation = await waitForStatus(page, kernel.projectId, row =>
      row.state === 'deviation'
      && row.deviations.some(d => d.type === 'renamed' && d.detail.includes(MANUAL_RENAMED))
      && row.deviations.some(d => d.type === 'reordered' && d.detail.includes('order drift')),
    'A deviation:renamed(手改新名)+ reordered(order drift)')
    expect(aDeviation.deviations.find(d => d.type === 'renamed')?.detail,
      'renamed detail 携两侧名(差异事实)').toContain(CARRIER)
    await waitForStatus(page, other.projectId, row =>
      row.state === 'deviation' && row.deviations.some(d => d.type === 'deleted' && d.detail.includes('workspace gone')),
    'B deviation:deleted(workspace gone)')
    // 处理建议面:概览偏差明细折叠区(pill + kernel detail 串 + 零交互元素)。
    await openOverviewForActiveProject(page, CARRIER, `[data-dsh-forge-tree-project="${kernel.projectId}"]`)
    const statusRow = projectionStatusRow(page)
    await expect(statusRow, 'deviation 状态行').toHaveAttribute('data-state', 'deviation', { timeout: 15_000 })
    await expect(statusRow, 'deviation 文案 = 与 dsh 侧存在偏差').toContainText('与 dsh 侧存在偏差')
    const details = page.locator('[data-dsh-forge-projection-details]')
    await expect(details, '[偏差明细 N] 折叠钮在场').toBeVisible({ timeout: 10_000 })
    await details.click()
    const fold = page.locator('[data-dsh-forge-projection-deviations]')
    await expect(fold, '偏差明细折叠区展开').toBeVisible({ timeout: 10_000 })
    await expect(fold.locator('[data-dsh-forge-deviation-row="renamed"] [data-dsh-forge-deviation-pill]'),
      '改名 pill(类型词面)').toHaveText('改名')
    await expect(fold.locator('[data-dsh-forge-deviation-row="renamed"]'),
      'renamed 行携 kernel detail 串(手改新名证据)').toContainText(MANUAL_RENAMED)
    const interactive = await page.evaluate(() =>
      document.querySelectorAll('[data-dsh-forge-projection-deviations] button, [data-dsh-forge-projection-deviations] a').length)
    expect(interactive, '偏差明细区零交互元素(禁反向写入口,BIZ-006)').toBe(0)

    // 零反向写(深断言):实况投影面不动 + forge 权威名不被覆写。
    await page.waitForTimeout(1_200)
    const after = readLiveRegistry(dshHome) as NonNullable<ReturnType<typeof readLiveRegistry>>
    expect(JSON.stringify(after.order.map(row => ({ path: row.path, title: row.title }))),
      '零反向写:实况投影面不动(forge 未把 dsh 侧改回)').toBe(projectionSurfaceBefore)
    const state = await bridgeInvoke<{ projects: Array<{ id: string; displayName: string }> }>(page, 'getState', [])
    expect(state.projects.find(row => row.id === kernel.projectId)?.displayName,
      'forge 权威名不被 dsh 手改名覆写(单向投影)').toBe(CARRIER)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "archived-sessions-zone" — 会话归档接续(M4 可达面 + N/A 裁决消费)。
  test('step1/archived-sessions-zone: UF3 会话归档 —— 行从会话列表消失 + 历史经 REAL backend 二次可读(恢复口 = 上游原生,M4 零代码)', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const built = await buildLcJourneyRoot()
    const world = await bootLcWorld(manager, 'zone', built)
    const { page, kernel, dshHome } = world
    stopAutoDismiss = startAutoDismiss(page)
    await registerLcProjects(built, page)
    await activateProjectByTreeRow(page, kernel.projectId)

    // 会话行在场(归档前对照)→ ⋯ 菜单归档(UF3 公共面)。
    const sessionRow = page.locator(`[data-dsh-forge-tree-session="${SESS_A}"]`)
    await sessionRow.waitFor({ state: 'attached', timeout: 45_000 })
    await page.locator(`[data-dsh-forge-tree-session="${SESS_A}"]`).first().hover()
    const more = page.locator(`[data-dsh-forge-tree-session-more="${SESS_A}"]`)
    await expect(more, '会话行 ⋯ 尾动作在场(hover 揭示)').toBeVisible({ timeout: 5_000 })
    await more.click()
    await expect(page.locator(`[data-dsh-forge-tree-session-menu="${SESS_A}"]`),
      '会话 ⋯ 菜单在座').toBeVisible({ timeout: 5_000 })
    await page.locator(`[data-dsh-forge-tree-session-menu="${SESS_A}"] [role="menuitem"]`, { hasText: /归档/ }).click()
    // 接续效果:会话行即时从会话列表消失(归档 ≠ 删除 —— 历史仍在)。
    await expect(page.locator(`[data-dsh-forge-tree-session="${SESS_A}"]`),
      '归档会话行从会话列表消失').toHaveCount(0, { timeout: 15_000 })
    // 历史 = REAL backend 二次可读(解除归档后回树分组所依;上游承载,非 M4 面)。
    const reread = await readCorpusSession({ dshHome, sessionId: SESS_A })
    expect(reread.header.id, '会话 artifact 仍在(历史不删除,REAL backend 可读)').toBe(SESS_A)
    // 会话归档 ≠ 项目归档(两个归档面互不混淆):项目行不受会话归档影响。
    await expect(page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
      '项目行保持活跃(会话归档 ≠ 项目归档)').toBeVisible()
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })
})
