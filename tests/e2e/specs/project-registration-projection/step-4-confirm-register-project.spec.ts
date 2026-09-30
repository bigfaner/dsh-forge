// @feature dsh-forge-m4 | @web-e2e | @journey project-registration-projection
// Traceability: docs/features/dsh-forge-m4/testing/project-registration-
// projection/contracts/step-4-confirm-register-project.md — Outcomes:
//   success — 「添加项目」→ forge 注册表权威条目 + 投影写入 dsh
//             workspaceRegistry 同名条目且顺序与项目列表一致(断言);投影
//             操作同步完成 ≤2s;
//   projection-write-failure — 通道注错 → 注册不被阻断(本地权威条目已写)
//             + 降级为无投影继续运行 + 可重试提示;恢复后重试成功即两侧一致;
//   writability-runtime-recheck — 注册后运行时探测不可写 → 可写性为运行时
//             状态(非注册门槛):不回滚注册(呈现面注记见 header)。
// fixture_spec: Project ×1(基线)+ CodeRoot(valid 态未注册)+ Workspace
// 投影通道就绪;failure 腿 = DSH_FORGE_PROJECTION_FAULTS 注错缝生效。
// Techniques: sc3-sync ①(注册同名同序 + 实况收敛)/ sc3-degrade ②③(通道
// 故障 + 重试恢复)/ sc6 ③(投影收敛窗 ≤2s)。
//
// VERIFY(deferred face, writability-runtime-recheck):「呈现降级状态与提示」
// 的运行时载体 = sync-error 事件通道(lostProjectIds → 概览 lost 卡),e2e 无
// 确定性注错缝;本腿钉契约 State 维度(注册条目保持、不回滚、零报错)。

import { rmSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { createProjectionFaultStub } from '../../stubs/projection-faults.ts'
import {
  bridgeInvoke, foldPath, M4WorldManager, openOverviewForActiveProject,
  rowAtAnchor, readLiveRegistry, startAutoDismiss, waitForRegistry, waitForStatus,
} from '../_lib/m4-world.ts'
import { activateProjectByTreeRow } from '../_lib/m4-world.ts'
import {
  DETECT_COPY, bootRegWorld, buildRegJourneyRoot, openAddCard, typeCodePath, waitDetect,
} from './harness.ts'

/** AC 口径:投影操作同步完成 ≤2s(收敛窗逐样本硬门)。 */
const PROJECTION_OP_BUDGET_MS = 2_000

test.describe.serial('project-registration-projection / step 4: 确认添加项目', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — 注册 + 投影同名同序 + 收敛窗 ≤2s。
  test('step4/success: 确认添加 —— forge 权威条目 + dsh 实况同名同序 + 投影收敛窗 ≤2s', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const built = await buildRegJourneyRoot()
    const world = await bootRegWorld(manager, 'main', built)
    const { page, kernel, dshHome } = world
    const fixtures = built.fixtures
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)

    // 卡内给定 git 仓(repo-new 档;docs 懒物化)→ 提交。
    await openAddCard(page)
    await typeCodePath(page, fixtures.gitOnlyRepo)
    await waitDetect(page, DETECT_COPY.git, 'valid 态就位')
    const registerT0 = Date.now()
    await page.locator('[data-dsh-forge-confirm-submit]').click()
    // 注册落位 toast(指针切换 + 原位生效)。
    await expect(page.locator('[data-dsh-forge-project-toast]'),
      '注册落位 toast').toBeVisible({ timeout: 30_000 })

    // State(forge 面):注册表新增行 + 顺序 = [基线, 新项目]。
    const state = await bridgeInvoke<{
      projects: Array<{ id: string; displayName: string; codeRoot: string }>
    }>(page, 'getState', [])
    expect(state.projects.length, '注册表 = 基线 + 新项目').toBe(2)
    const added = state.projects.find(row => foldPath(row.codeRoot) === foldPath(fixtures.gitOnlyRepo))
    expect(added, '新项目条目在座(权威条目已写)').toBeDefined()
    expect(state.projects.map(row => row.id)[1], '顺序与项目列表一致(新项目居次)').toBe(added?.id)

    // State(dsh 实况,深断言):同名 + 同序 + 收敛窗 ≤2s。
    const converged = await waitForRegistry(page, dshHome, registry =>
      registry.order.length === 2
      && foldPath(registry.order[1]?.path ?? '') === foldPath(fixtures.gitOnlyRepo)
      && rowAtAnchor(registry, fixtures.gitOnlyRepo)?.title === added?.displayName,
    '注册投影:实况同名同序收敛')
    expect(Date.now() - registerT0,
      `投影操作同步完成 ≤${String(PROJECTION_OP_BUDGET_MS)}ms(实测收敛窗 ${String(Date.now() - registerT0)}ms)`).toBeLessThanOrEqual(PROJECTION_OP_BUDGET_MS)
    expect(foldPath(converged.order[0]?.path ?? ''), '序一致:基线居首').toBe(foldPath(kernel.codeRoot))
    // 投影状态 healthy(内核面交叉)。
    const status = await waitForStatus(page, added?.id as string, row => row.state === 'healthy' && row.deviations.length === 0,
      '新项目投影 healthy')
    expect(status.lastError, '零降级残留').toBeNull()
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "projection-write-failure" — 通道故障:注册不被阻断 + 重试恢复。
  test('step4/projection-write-failure: 通道注错 —— 注册不被阻断 + degraded 可重试 + 恢复后两侧一致', async ({ }, testInfo) => {
    testInfo.setTimeout(480_000)
    const built = await buildRegJourneyRoot()
    const faultStub = createProjectionFaultStub(`${built.root}\\stub`)
    const world = await bootRegWorld(manager, 'fault', built, faultStub.env)
    const { page, kernel, dshHome } = world
    const fixtures = built.fixtures
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)

    // 通道故障注入 → 经卡注册(用户径)。
    faultStub.failChannel()
    await openAddCard(page)
    await typeCodePath(page, fixtures.gitOnlyRepo)
    await waitDetect(page, DETECT_COPY.git, 'valid 态就位')
    await page.locator('[data-dsh-forge-confirm-submit]').click()
    await expect(page.locator('[data-dsh-forge-project-toast]'),
      '注册落位 toast(降级不阻断注册)').toBeVisible({ timeout: 30_000 })

    // State:forge 权威条目已写(本地落库即业务成功)。
    const state = await bridgeInvoke<{ projects: Array<{ id: string; displayName: string; codeRoot: string }> }>(page, 'getState', [])
    const added = state.projects.find(row => foldPath(row.codeRoot) === foldPath(fixtures.gitOnlyRepo))
    expect(added, '降级不阻断:forge 条目已写(归属仅 forge 侧可见)').toBeDefined()
    // 内核状态面:degraded(ERR_PROJECTION_CHANNEL_UNAVAILABLE)+ plan 保留。
    const degraded = await waitForStatus(page, added?.id as string, row =>
      row.state === 'degraded' && (row.lastError ?? '').includes('ERR_PROJECTION_CHANNEL_UNAVAILABLE'),
    '新项目 degraded = 通道不可用')
    expect(degraded.pushedAt, 'plan 保留(期望在库禁静默丢弃)').toBeNull()
    // dsh 实况:零投递。
    await page.waitForTimeout(1_500)
    expect(rowAtAnchor(readLiveRegistry(dshHome) as NonNullable<ReturnType<typeof readLiveRegistry>>, fixtures.gitOnlyRepo),
      '实况零投递(降级为无投影继续运行)').toBeUndefined()

    // 恢复 + GUI 重试:[重试投影] → healthy + 实况落位(两侧一致)。
    await page.locator(`[data-dsh-forge-tree-project="${added?.id as string}"]`).click()
    await expect(page.locator(`[data-dsh-forge-tree-project="${added?.id as string}"]`),
      '新项目行激活').toHaveAttribute('aria-current', 'true', { timeout: 15_000 })
    await openOverviewForActiveProject(page, added?.displayName as string, `[data-dsh-forge-tree-project="${added?.id as string}"]`)
    const statusRow = page.locator('[data-dsh-forge-projection-status]')
    await expect(statusRow, 'degraded 状态行(降级提示)').toHaveAttribute('data-state', 'degraded', { timeout: 15_000 })
    const retryButton = page.locator('[data-dsh-forge-projection-retry]')
    await expect(retryButton, '[重试投影] 可达(可重试提示)').toBeVisible({ timeout: 10_000 })
    faultStub.clear()
    await retryButton.click()
    await expect(statusRow, '重试后 healthy(两侧一致)').toHaveAttribute('data-state', 'healthy', { timeout: 30_000 })
    await waitForRegistry(page, dshHome, registry =>
      rowAtAnchor(registry, fixtures.gitOnlyRepo)?.title === added?.displayName,
    '重试收敛:实况同名条目落位')
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "writability-runtime-recheck" — 可写性为运行时状态:不回滚注册。
  test('step4/writability-runtime-recheck: 注册后路径不可达 —— 注册条目保持(可写性非注册门槛,不回滚)', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const built = await buildRegJourneyRoot()
    const world = await bootRegWorld(manager, 'runtime', built)
    const { page, kernel } = world
    const fixtures = built.fixtures
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)

    // 注册成功(基线 + 新项目)。
    await openAddCard(page)
    await typeCodePath(page, fixtures.gitOnlyRepo)
    await waitDetect(page, DETECT_COPY.git, 'valid 态就位')
    await page.locator('[data-dsh-forge-confirm-submit]').click()
    await expect(page.locator('[data-dsh-forge-project-toast]'), '注册落位 toast').toBeVisible({ timeout: 30_000 })
    const before = await bridgeInvoke<{ projects: Array<{ id: string; codeRoot: string }> }>(page, 'getState', [])
    const added = before.projects.find(row => foldPath(row.codeRoot) === foldPath(fixtures.gitOnlyRepo))
    expect(added, '注册成功(条目在座)').toBeDefined()

    // 运行时布景:代码区目录不可达(注册后磁盘状态变化)。
    rmSync(fixtures.gitOnlyRepo, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    await page.waitForTimeout(1_200)

    // State:注册条目保持、不回滚(可写性为运行时状态,非注册门槛)。
    const after = await bridgeInvoke<{ projects: Array<{ id: string; codeRoot: string }> }>(page, 'getState', [])
    expect(after.projects.map(row => row.id), '注册条目保持(不回滚)').toEqual(before.projects.map(row => row.id))
    // 应用不崩溃不白屏(降级以呈现面承载)。
    await expect(page.locator('[data-dsh-forge-project-seat]'), '左栏座位仍在(不白屏)').toBeVisible()
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })
})
