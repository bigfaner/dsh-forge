// @feature dsh-forge-m4 | @web-e2e | @journey project-lifecycle-projection
// Traceability: docs/features/dsh-forge-m4/testing/project-lifecycle-
// projection/contracts/step-5-delete-project.md — Outcomes:
//   success — 显式删除(经确认对话):forge 条目删除 + dsh workspace 移除 +
//             会话退未分组且历史不删除 + 布局记忆清除 + 工作台不指向已删 id;
//   archived-delete-branch — 归档态删除支路:与显式支路收敛同一终态;
//   layout-isolation-others — 其余项目布局恢复如删除前(按项目隔离);
//   confirm-cancel-zero-change — 确认对话取消:零变更(条目/workspace/分组/
//             布局记忆全保持,零投影写);
//   delete-projection-failure — 通道故障删除:本地删除生效(条目/布局/级联
//             清除),dsh 侧 workspace 逗留(内核注释口径;重试面注记见 header)。
// fixture_spec: Project ×2 + Session(cwd 落承载 workspace)+ LayoutMemory ×2
// (承载 + 其余项目;经 UI 用户径开 board pane 落库)。
// Techniques: sc3-sync ④(删除语义 + 退未分组 + 历史可读)/ sc4(readLayoutBlob
// 布局记忆面)/ lifecycle-hooks(removeProject = buildRemovalPlan 先于行删除)。
//
// VERIFY(kernel-comment ruling consumed, delete-projection-failure):删除投影
// push = fire-and-forget(buildRemovalPlan 先于行删除组装 → 行删除 → emit;
// FK cascade 随行清期望快照)。通道故障下无持久重试载体 —— 内核注释原文
// 「removal proceeds; dsh-side workspace may linger」;契约 Step 5e 自身即
// 补全口径(PRD 对账 open question)。本腿钉确定性核:本地删除生效 + 布局
// 清除 + workspace 逗留 + 零崩溃;「恢复后重试成功 → workspace 移除」随
// 5e 的 PRD 对账落缝(不伪造无载体的重试腿)。

import { expect, test } from '@playwright/test'
import { createProjectionFaultStub } from '../../stubs/projection-faults.ts'
import { readCorpusSession } from '../../stubs/lineage-corpus.ts'
import {
  activateProjectByTreeRow, bridgeInvoke, M4WorldManager, readLayoutBlob,
  readLiveRegistry, rowAtAnchor, startAutoDismiss, ungroupedSessionIds,
  waitForRegistry, waitForStatus,
} from '../_lib/m4-world.ts'
import { openBoardPane } from '../_lib/journey-world.ts'
import {
  CARRIER, SESS_A, archiveViaMenu, bootLcWorld, buildLcJourneyRoot,
  registerLcProjects, removeViaMenu,
} from './harness.ts'

test.describe.serial('project-lifecycle-projection / step 5: 删除项目(经确认对话)', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — 显式删除:四面板终态(条目/workspace/退组+历史/布局)。
  test('step5/success: 显式删除 —— 条目删除 + workspace 移除 + 会话退未分组(历史不删除)+ 布局记忆清除 + 指针不指向已删 id', async ({ }, testInfo) => {
    testInfo.setTimeout(540_000)
    const built = await buildLcJourneyRoot()
    const world = await bootLcWorld(manager, 'main', built)
    const { page, kernel, dshHome } = world
    const other = built.other
    stopAutoDismiss = startAutoDismiss(page)
    await registerLcProjects(built, page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await waitForStatus(page, kernel.projectId, row => row.state === 'healthy', 'A healthy(基线)')

    // 布局记忆就位(两项目各开 board pane → blob 落库;800ms 去抖 + settle)。
    await openBoardPane(page)
    await expect(page.locator('[data-dsh-forge-task-board]'), 'A board pane 在场(布局记忆语料)').toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(1_600)
    await expect.poll(async () => (await readLayoutBlob(kernel.userDataDir, kernel.projectId) === undefined ? 0 : 1),
      { timeout: 15_000, message: 'A 布局记忆行在座' }).toBe(1)
    await activateProjectByTreeRow(page, other.projectId)
    await openBoardPane(page)
    await page.waitForTimeout(1_600)
    await expect.poll(async () => (await readLayoutBlob(kernel.userDataDir, other.projectId) === undefined ? 0 : 1),
      { timeout: 15_000, message: 'B 布局记忆行在座' }).toBe(1)

    // 删除 A(当前活跃承载;⋯ 菜单 + 确认对话,必答⑤ copy 随行)。
    await activateProjectByTreeRow(page, kernel.projectId)
    await removeViaMenu(page, kernel.projectId)

    // State(forge 面):条目删除 + 指针不指向已删 id。
    const state = await bridgeInvoke<{ activeProjectId: string | null; projects: Array<{ id: string }> }>(page, 'getState', [])
    expect(state.projects.map(row => row.id), '注册表 = 余项目 B(条目删除)').toEqual([other.projectId])
    expect(state.activeProjectId, '指针不指向已删 id(同事务清空/合法落点)').not.toBe(kernel.projectId)
    await expect(page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
      '树行零残留').toHaveCount(0, { timeout: 15_000 })

    // State(dsh 实况):workspace 移除收敛。
    await waitForRegistry(page, dshHome, registry =>
      rowAtAnchor(registry, kernel.codeRoot) === undefined
      && rowAtAnchor(registry, other.codeRoot) !== undefined,
    '删除收敛:A workspace 移除,B 保留')

    // 会话退未分组(树消费面)+ 历史不删除(REAL backend 二次可读)。
    let ungrouped: string[] | null = null
    for (let round = 0; round < 30; round += 1) {
      ungrouped = await ungroupedSessionIds(page)
      if (ungrouped !== null && ungrouped.includes(SESS_A)) break
      await page.waitForTimeout(500)
    }
    expect(ungrouped, '会话退未分组(未分组块呈现)').toContain(SESS_A)
    const reread = await readCorpusSession({ dshHome, sessionId: SESS_A })
    expect(reread.header.id, '会话历史不删除(REAL backend 可读)').toBe(SESS_A)

    // 布局记忆:A 行随删除清除;B 行保持(级联隔离,深断言)。
    expect(await readLayoutBlob(kernel.userDataDir, kernel.projectId),
      '被删项目布局记忆随之清除').toBeUndefined()
    expect(await readLayoutBlob(kernel.userDataDir, other.projectId),
      '其余项目布局记忆保持(不牵连)').toBeDefined()
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "archived-delete-branch" — 归档态删除:同一终态。
  test('step5/archived-delete-branch: 归档态删除支路 —— 归档分区条目移除 + 终态与显式支路一致(workspace 移除/退未分组/历史不删除)', async ({ }, testInfo) => {
    testInfo.setTimeout(540_000)
    const built = await buildLcJourneyRoot()
    const world = await bootLcWorld(manager, 'arch', built)
    const { page, kernel, dshHome } = world
    const other = built.other
    stopAutoDismiss = startAutoDismiss(page)
    await registerLcProjects(built, page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await waitForStatus(page, kernel.projectId, row => row.state === 'healthy', 'A healthy(基线)')

    // 就位:归档(不经恢复)→ 归档行 ⋯ 删除。
    await archiveViaMenu(page, kernel.projectId)
    await expect(page.locator(`[data-dsh-forge-tree-archived-row="${kernel.projectId}"]`),
      'A 入归档分区').toBeVisible({ timeout: 15_000 })
    await removeViaMenu(page, kernel.projectId)

    // 终态与显式支路一致:条目移除 + workspace 移除 + 退未分组 + 历史不删除。
    await expect(page.locator(`[data-dsh-forge-tree-archived-row="${kernel.projectId}"]`),
      '归档分区条目移除').toHaveCount(0, { timeout: 15_000 })
    const state = await bridgeInvoke<{ projects: Array<{ id: string }> }>(page, 'getState', [])
    expect(state.projects.map(row => row.id), '注册表 = 余项目 B(两支路同终态)').toEqual([other.projectId])
    await waitForRegistry(page, dshHome, registry => rowAtAnchor(registry, kernel.codeRoot) === undefined,
      '归档态删除:workspace 移除(同显式支路)')
    let ungrouped: string[] | null = null
    for (let round = 0; round < 30; round += 1) {
      ungrouped = await ungroupedSessionIds(page)
      if (ungrouped !== null && ungrouped.includes(SESS_A)) break
      await page.waitForTimeout(500)
    }
    expect(ungrouped, '退未分组(同显式支路)').toContain(SESS_A)
    const reread = await readCorpusSession({ dshHome, sessionId: SESS_A })
    expect(reread.header.id, '历史不删除(同显式支路)').toBe(SESS_A)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "layout-isolation-others" — 其余项目布局恢复如删除前。
  test('step5/layout-isolation-others: 承载删除后重进其余项目 —— 布局恢复如删除前(记忆按项目隔离)', async ({ }, testInfo) => {
    testInfo.setTimeout(540_000)
    const built = await buildLcJourneyRoot()
    const world = await bootLcWorld(manager, 'iso', built)
    const { page, kernel } = world
    const other = built.other
    stopAutoDismiss = startAutoDismiss(page)
    await registerLcProjects(built, page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await waitForStatus(page, kernel.projectId, row => row.state === 'healthy', 'A healthy(基线)')

    // B 摆出布局(board pane)并落库;读取 B 离开前的 blob(恢复基线)。
    await activateProjectByTreeRow(page, other.projectId)
    await openBoardPane(page)
    await expect(page.locator('[data-dsh-forge-task-board]'), 'B board pane 在场').toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(1_600)
    const blobBefore = await readLayoutBlob(kernel.userDataDir, other.projectId)
    expect(blobBefore, 'B 布局记忆在座(删除前姿态)').toBeDefined()
    expect(JSON.stringify(blobBefore), 'B 布局含 board tab(真实姿态)').toContain('"board"')

    // 删除 A(承载)→ 重进 B。
    await activateProjectByTreeRow(page, kernel.projectId)
    await removeViaMenu(page, kernel.projectId)
    await expect(page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
      'A 条目删除').toHaveCount(0, { timeout: 15_000 })
    await activateProjectByTreeRow(page, other.projectId)

    // B 布局恢复如删除前:board pane 重放 + blob 内容保持(board 结构不变)。
    await expect(page.locator('[data-dsh-forge-task-board]'),
      '重进 B:board pane 重放恢复(布局如删除前)').toBeVisible({ timeout: 45_000 })
    await page.waitForTimeout(1_600)
    const blobAfter = await readLayoutBlob(kernel.userDataDir, other.projectId)
    expect(blobAfter, 'B 布局记忆行保持(不牵连)').toBeDefined()
    expect(JSON.stringify(blobAfter?.rightbar ?? blobAfter),
      'B pane 结构与删除前一致(按项目隔离)').toContain('"board"')
    expect(await readLayoutBlob(kernel.userDataDir, kernel.projectId),
      '被删项目记忆已清(隔离的另一半)').toBeUndefined()
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "confirm-cancel-zero-change" — 取消 = 零变更。
  test('step5/confirm-cancel-zero-change: 删除确认取消 —— 条目/workspace/分组/布局记忆全保持(零投影写)', async ({ }, testInfo) => {
    testInfo.setTimeout(540_000)
    const built = await buildLcJourneyRoot()
    const world = await bootLcWorld(manager, 'cancel', built)
    const { page, kernel, dshHome } = world
    stopAutoDismiss = startAutoDismiss(page)
    await registerLcProjects(built, page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await waitForStatus(page, kernel.projectId, row => row.state === 'healthy', 'A healthy(基线)')
    // 布局记忆就位(取消对照面的一员)。
    await openBoardPane(page)
    await page.waitForTimeout(1_600)
    await expect.poll(async () => (await readLayoutBlob(kernel.userDataDir, kernel.projectId) === undefined ? 0 : 1),
      { timeout: 15_000, message: 'A 布局记忆行在座' }).toBe(1)
    const registryBefore = readLiveRegistry(dshHome) as NonNullable<ReturnType<typeof readLiveRegistry>>
    const blobBefore = await readLayoutBlob(kernel.userDataDir, kernel.projectId)
    const surfaceBefore = JSON.stringify(registryBefore.order.map(row => ({ path: row.path, title: row.title, sessionIds: row.sessionIds })))

    // ⋯ 删除 → 确认对话 → 取消。
    await page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`).hover()
    await page.locator(`[data-dsh-forge-tree-project-more="${kernel.projectId}"]`).click()
    await page.locator(`[data-dsh-forge-tree-project-menu="${kernel.projectId}"] [role="menuitem"]`, { hasText: /删除项目/ }).click()
    const dialog = page.locator('[data-dsh-forge-dialog="project-remove-confirm"]')
    await expect(dialog, '删除确认 Dialog 在座(未决态)').toBeVisible({ timeout: 5_000 })
    await dialog.locator('[data-dsh-forge-project-remove-cancel]').click()
    await expect(dialog, '取消关闭对话').toHaveCount(0, { timeout: 5_000 })

    // State:两侧零变更(条目/树行/workspace/分组/布局记忆)。
    await page.waitForTimeout(1_200)
    const state = await bridgeInvoke<{ projects: Array<{ id: string }> }>(page, 'getState', [])
    expect(state.projects.length, '条目保持(零变更)').toBe(2)
    await expect(page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
      '树行保持').toBeVisible()
    expect(JSON.stringify((readLiveRegistry(dshHome) as NonNullable<ReturnType<typeof readLiveRegistry>>)
      .order.map(row => ({ path: row.path, title: row.title, sessionIds: row.sessionIds }))),
    'workspace/分组账全等(零投影写)').toBe(surfaceBefore)
    expect(await readLayoutBlob(kernel.userDataDir, kernel.projectId),
      '布局记忆保持(取消 = 未授权删除)').toEqual(blobBefore)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "delete-projection-failure" — 通道故障删除:本地删除生效 + 逗留。
  test('step5/delete-projection-failure: 通道故障删除 —— 本地删除生效(条目/布局/级联清除)+ dsh workspace 逗留 + 零崩溃', async ({ }, testInfo) => {
    testInfo.setTimeout(540_000)
    const built = await buildLcJourneyRoot()
    const faultStub = createProjectionFaultStub(`${built.root}\\stub`)
    const world = await bootLcWorld(manager, 'fault', built, faultStub.env)
    const { page, kernel, dshHome } = world
    stopAutoDismiss = startAutoDismiss(page)
    await registerLcProjects(built, page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await waitForStatus(page, kernel.projectId, row => row.state === 'healthy', 'A healthy(基线)')
    // 布局记忆就位(本地清除断言面)。
    await openBoardPane(page)
    await page.waitForTimeout(1_600)
    await expect.poll(async () => (await readLayoutBlob(kernel.userDataDir, kernel.projectId) === undefined ? 0 : 1),
      { timeout: 15_000, message: 'A 布局记忆行在座' }).toBe(1)

    // 故障在场 → 经确认对话删除。
    faultStub.failChannel()
    await page.waitForTimeout(1_200)
    await removeViaMenu(page, kernel.projectId)

    // State:本地删除生效(forge 条目 + 布局记忆 + 级联随清)。
    const state = await bridgeInvoke<{ projects: Array<{ id: string }> }>(page, 'getState', [])
    expect(state.projects.some(row => row.id === kernel.projectId),
      '本地删除生效(条目删除,BIZ-workbench-001)').toBe(false)
    await expect(page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
      '树行零残留').toHaveCount(0, { timeout: 15_000 })
    expect(await readLayoutBlob(kernel.userDataDir, kernel.projectId),
      '布局记忆随删除清除(本地链完整)').toBeUndefined()
    // dsh 侧:workspace 逗留(删除 push 未达;内核注释口径 —— may linger)。
    await page.waitForTimeout(1_500)
    expect(rowAtAnchor(readLiveRegistry(dshHome) as NonNullable<ReturnType<typeof readLiveRegistry>>, kernel.codeRoot),
      '通道故障:workspace 逗留(零投递;恢复承载随 5e PRD 对账)').toBeDefined()
    // 应用不崩溃(降级不静默:无渲染错误,工作台可继续)。
    await expect(page.locator('[data-dsh-forge-project-seat]'), '工作台在场(零崩溃)').toBeVisible()
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })
})
