// @feature dsh-forge-m4 | @web-e2e | @journey project-lifecycle-projection
// Traceability: docs/features/dsh-forge-m4/testing/project-lifecycle-
// projection/contracts/step-2-rename-project.md — Outcomes:
//   success — ⋯ 菜单改名 → forge 名更新 + 投影同步改名(dsh workspace 同名,
//             断言)+ 会话分组随 workspace 保持;
//   rename-projection-failure — 通道故障:改名本地生效不被阻断 + 投影待重试
//             (降级)+ 两侧最终一致可达成(重试);
//   rename-blank-input — 空/纯空白名:零变更、不发起投影写(实现面注记见
//             header;空名行为 = PRD open question)。
// fixture_spec: Project ×1(改名承载)+ Session(cwd 落 workspace 投影路径)。
// Techniques: sc3-sync ②(⋯ 菜单行内编辑 → 实况 title 收敛)/ sc3-degrade ④。
//
// VERIFY(implementation face, rename-blank-input):行内提交守卫 =
// ProjectRow.commitRename 的 trim-空 no-op(静默退出编辑态,零动词派发)——
// 无独立「校验提示」呈现面;本腿钉契约 State 维度(两侧零变更 + 零投影写:
// 实况投影面全等),提示面随 PRD 对账(契约自身已记 open question)。

import { expect, test } from '@playwright/test'
import { createProjectionFaultStub } from '../../stubs/projection-faults.ts'
import {
  activateProjectByTreeRow, bridgeInvoke, M4WorldManager, readLiveRegistry,
  rowAtAnchor, startAutoDismiss, waitForRegistry, waitForStatus,
} from '../_lib/m4-world.ts'
import { CARRIER, CARRIER_RENAMED, SESS_A, bootLcWorld, buildLcJourneyRoot, registerLcProjects, renameViaMenu } from './harness.ts'

test.describe.serial('project-lifecycle-projection / step 2: 改名项目', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — GUI 改名 + 双侧同名 + 会话分组保持。
  test('step2/success: ⋯ 菜单改名 —— forge 名更新 + dsh workspace 同名 + 会话分组随 workspace 保持', async ({ }, testInfo) => {
    testInfo.setTimeout(480_000)
    const built = await buildLcJourneyRoot()
    const world = await bootLcWorld(manager, 'main', built)
    const { page, kernel, dshHome } = world
    stopAutoDismiss = startAutoDismiss(page)
    await registerLcProjects(built, page)
    await activateProjectByTreeRow(page, kernel.projectId)

    // 改名(⋯ 菜单行内编辑,用户径)。
    await renameViaMenu(page, kernel.projectId, CARRIER_RENAMED)
    await expect(page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
      'forge 树行呈现新名').toContainText(CARRIER_RENAMED, { timeout: 15_000 })
    // State(forge 面):displayName 更新。
    const state = await bridgeInvoke<{ projects: Array<{ id: string; displayName: string }> }>(page, 'getState', [])
    expect(state.projects.find(row => row.id === kernel.projectId)?.displayName,
      'forge displayName 更新').toBe(CARRIER_RENAMED)
    // State(dsh 实况,深断言):workspace 同名收敛。
    await waitForRegistry(page, dshHome, registry =>
      rowAtAnchor(registry, kernel.codeRoot)?.title === CARRIER_RENAMED,
    `改名同步:dsh workspace title = ${CARRIER_RENAMED}`)
    // 会话分组随 workspace 保持(实况 sessionIds 命中不变)。
    const after = readLiveRegistry(dshHome) as NonNullable<ReturnType<typeof readLiveRegistry>>
    expect(rowAtAnchor(after, kernel.codeRoot)?.sessionIds,
      '会话仍按项目 workspace 分组(改名不迁移)').toContain(SESS_A)
    await waitForStatus(page, kernel.projectId, row => row.state === 'healthy' && row.deviations.length === 0, '改名后 healthy')
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "rename-projection-failure" — 故障下改名本地生效 + 重试后一致。
  test('step2/rename-projection-failure: 通道故障改名 —— 本地生效不被阻断 + degraded 待重试 + 恢复后两侧同名', async ({ }, testInfo) => {
    testInfo.setTimeout(540_000)
    const built = await buildLcJourneyRoot()
    const faultStub = createProjectionFaultStub(`${built.root}\\stub`)
    const world = await bootLcWorld(manager, 'fault', built, faultStub.env)
    const { page, kernel, dshHome } = world
    stopAutoDismiss = startAutoDismiss(page)
    await registerLcProjects(built, page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await waitForStatus(page, kernel.projectId, row => row.state === 'healthy', 'A healthy(基线)')

    // 故障在场 → 改名(用户径)。
    faultStub.failChannel()
    await page.waitForTimeout(1_200) // 通道缺席重试窗收口(确定性:探测仍假)
    await renameViaMenu(page, kernel.projectId, CARRIER_RENAMED)
    await expect(page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
      '改名本地生效(不被投影失败阻断)').toContainText(CARRIER_RENAMED, { timeout: 15_000 })
    await waitForStatus(page, kernel.projectId, row =>
      row.state === 'degraded' && (row.lastError ?? '').includes('ERR_PROJECTION_CHANNEL_UNAVAILABLE'),
    '改名 push degraded(待重试)')
    await page.waitForTimeout(1_500)
    expect(rowAtAnchor(readLiveRegistry(dshHome) as NonNullable<ReturnType<typeof readLiveRegistry>>, kernel.codeRoot)?.title,
      '实况仍为旧名(零投递)').not.toBe(CARRIER_RENAMED)

    // 恢复 → 重试(动词面)→ 两侧同名(最终一致可达成)。
    faultStub.clear()
    await bridgeInvoke<unknown>(page, 'retryProjection', [{ projectId: kernel.projectId }])
    await waitForStatus(page, kernel.projectId, row => row.state === 'healthy' && row.deviations.length === 0, '重试后 healthy')
    await waitForRegistry(page, dshHome, registry =>
      rowAtAnchor(registry, kernel.codeRoot)?.title === CARRIER_RENAMED,
    '重试收敛:实况同名(两侧最终一致)')
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "rename-blank-input" — 空名零变更(提交守卫 no-op)。
  test('step2/rename-blank-input: 空/纯空白名 —— 两侧零变更 + 不发起投影写(实况投影面全等)', async ({ }, testInfo) => {
    testInfo.setTimeout(480_000)
    const built = await buildLcJourneyRoot()
    const world = await bootLcWorld(manager, 'blank', built)
    const { page, kernel, dshHome } = world
    stopAutoDismiss = startAutoDismiss(page)
    await registerLcProjects(built, page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await waitForStatus(page, kernel.projectId, row => row.state === 'healthy', 'A healthy(基线)')
    const surfaceBefore = JSON.stringify((readLiveRegistry(dshHome) as NonNullable<ReturnType<typeof readLiveRegistry>>)
      .order.map(row => ({ path: row.path, title: row.title })))

    // 空名 + 纯空白提交(两种形态各一次)。
    for (const blank of ['', '   ']) {
      await renameViaMenu(page, kernel.projectId, blank)
      await page.waitForTimeout(800)
    }
    // State:forge 名保持(零变更)。
    const state = await bridgeInvoke<{ projects: Array<{ id: string; displayName: string }> }>(page, 'getState', [])
    expect(state.projects.find(row => row.id === kernel.projectId)?.displayName,
      'forge displayName 零变更(空名提交 no-op)').toBe(CARRIER)
    await expect(page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
      '树行仍呈既有名').toContainText(CARRIER, { timeout: 10_000 })
    // State(dsh 实况,深断言):投影面全等(零投影写)。
    await page.waitForTimeout(1_200)
    expect(JSON.stringify((readLiveRegistry(dshHome) as NonNullable<ReturnType<typeof readLiveRegistry>>)
      .order.map(row => ({ path: row.path, title: row.title }))),
    '不发起投影写:实况投影面全等').toBe(surfaceBefore)
    await waitForStatus(page, kernel.projectId, row => row.state === 'healthy' && row.deviations.length === 0, '零变更(healthy 保持)')
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })
})
