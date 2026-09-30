// @feature dsh-forge-m4 | @web-e2e | @journey task-session-roundtrip
// Traceability: docs/features/dsh-forge-m4/testing/task-session-roundtrip/
// contracts/step-6-subagent-metadata-roundtrip.md — Outcomes:
//   success — subagent 会话视图头部任务元数据条(bound 态):任务号/标题/
//             状态/所属 feature;点击跳回任务详情 dock(双向互通);
//   multi-task-ambiguity — 一话多任务:「该会话执行中」会话级标注(ambiguous
//             态;无任务号、无跳转);
//   unbound-no-metadata — 血缘反推零命中(祖先链零挂接 —— badge 路径覆盖
//             active AND ended,真零覆盖语料承载):元数据条不呈现(unbound
//             态渲染为空;契约原「ended 挂接→零命中」口径缺口见腿内注记)。
// fixture_spec: Project ×1 + Task(bound/ambiguous/unbound 三态语料)+
// SessionLink + Session + SubagentSession。
// Techniques: sc7 ⑤(metadata-bar 三态 + 查看任务双向跳回)。

import { expect, test } from '@playwright/test'
import {
  activateProjectByTreeRow, clickSelfUnmounting, clickStable, ensureProjectGroupExpanded,
  expandLinkRow, M4WorldManager, openTaskDetail, sessionOpenLanded, startAutoDismiss,
} from '../_lib/m4-world.ts'
import {
  SUB_AMB, SUB_OK, SUB_U, TASK_AMB1, TASK_MAIN, TITLE_MAIN, TOP_A, TOP_AMB, TOP_U,
  bootRtWorld, buildRtJourneyRoot, registerRtLinks,
} from './harness.ts'

test.describe.serial('task-session-roundtrip / step 6: 查看 subagent 会话任务元数据并双向互达', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — bound 元数据条 + 点击跳回任务详情(双向)。
  test('step6/success: bound 元数据条 —— 任务号/标题呈现 + 点击「查看任务」跳回任务详情 dock(双向互通)', async ({ }, testInfo) => {
    testInfo.setTimeout(540_000)
    const built = await buildRtJourneyRoot()
    const world = await bootRtWorld(manager, 'main', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await registerRtLinks(page, kernel)

    // 打开 subagent 会话(血缘命中唯一任务 = TASK_MAIN 的 active 挂接)。
    // calibration r2:先开 TOP_A —— catalog(refreshSubagents)随 open 加载后,
    // 后代行的地址 mode = descriptor verbatim(continuable);cold 行走 byId
    // 回填兜底地址(one-shot)→ 会话以只读形态打开,conversation.input.dock
    // 不挂载,C6 条所在 dock 面结构性缺席(sc7 ①⑥ 同款已证口径)。
    await openTaskDetail(page, TASK_MAIN)
    await clickSelfUnmounting(
      page, `[data-dsh-forge-detail-enter="${TOP_A}"]`,
      sessionOpenLanded(page),
    )
    // sc7 fix-1 重入纪律:会话切换卸载板内 dock → 同一用户径重开。
    await openTaskDetail(page, TASK_MAIN)
    await expandLinkRow(page, TOP_A)
    await clickSelfUnmounting(
      page, `[data-dsh-forge-detail-descendant-open="${SUB_OK}"]`,
      sessionOpenLanded(page),
    )
    // bound 元数据条:任务号 + 标题(+ 状态/feature 由条承载)。
    const bar = page.locator('[data-dsh-forge-metadata-bar]')
    await expect(bar, 'C6 元数据条 bound(血缘命中唯一任务)').toBeVisible({ timeout: 20_000 })
    await expect(bar, 'bound 态').toHaveAttribute('data-dsh-forge-metadata-state', 'bound')
    await expect(bar, '任务号 = 血缘推导').toHaveAttribute('data-dsh-forge-metadata-task', TASK_MAIN)
    await expect(bar, '标题呈现(元数据四件之一)').toContainText(TITLE_MAIN)
    // 双向:点击「查看任务」→ C5 任务详情 dock(会话侧 ↔ 任务侧互通)。
    await page.locator('[data-dsh-forge-metadata-open]').click()
    await expect(page.locator(`[data-dsh-forge-task-detail="${TASK_MAIN}"]`),
      '查看任务 → 任务详情 dock(双向互通)').toBeVisible({ timeout: 20_000 })
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "multi-task-ambiguity" — ambiguous:会话级标注,无任务号无跳转。
  test('step6/multi-task-ambiguity: 一话多任务 —— 「该会话执行中」会话级标注(无任务号、无跳转)', async ({ }, testInfo) => {
    testInfo.setTimeout(540_000)
    const built = await buildRtJourneyRoot()
    const world = await bootRtWorld(manager, 'amb', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await registerRtLinks(page, kernel)

    // 双任务共用 TOP_AMB(两条 active 挂接)→ 打开 SUB_AMB。
    // calibration r2 同 success 腿:先开 TOP_AMB(catalog 地址 mode = verbatim,
    // 非冷行 one-shot 兜底),再开 SUB_AMB。
    await openTaskDetail(page, TASK_AMB1)
    await clickSelfUnmounting(
      page, `[data-dsh-forge-detail-enter="${TOP_AMB}"]`,
      sessionOpenLanded(page),
    )
    await openTaskDetail(page, TASK_AMB1)
    await expandLinkRow(page, TOP_AMB)
    await clickSelfUnmounting(
      page, `[data-dsh-forge-detail-descendant-open="${SUB_AMB}"]`,
      sessionOpenLanded(page),
    )
    const bar = page.locator('[data-dsh-forge-metadata-bar]')
    await expect(bar, 'C6 条在场(ambiguous 形态)').toBeVisible({ timeout: 20_000 })
    await expect(bar, 'ambiguous 态(会话级标注)').toHaveAttribute('data-dsh-forge-metadata-state', 'ambiguous')
    // 无任务号(不误指单一任务)+ 无跳转入口。
    expect(await bar.getAttribute('data-dsh-forge-metadata-task'),
      '无任务号(任务级精度为 M5 重构备注)').toBeNull()
    await expect(page.locator('[data-dsh-forge-metadata-open]'),
      '无跳转入口(ambiguous 无任务号可跳)').toHaveCount(0)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "unbound-no-metadata" — unbound:零命中,条不呈现。
  test('step6/unbound-no-metadata: 血缘反推零命中(ended 挂接)—— 元数据条不呈现(原生会话视图保持)', async ({ }, testInfo) => {
    testInfo.setTimeout(540_000)
    const built = await buildRtJourneyRoot()
    const world = await bootRtWorld(manager, 'unbound', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await registerRtLinks(page, kernel)

    // 零覆盖布景(calibration r2):TOP_U 语料对无任何挂接 → SUB_U 祖先链对
    // 任何任务零命中。契约原布景「ended 挂接 → 零命中」与产品钉死口径冲突
    // (metadata-bar.spec:97「an ENDED link still covers — badges span active
    // AND ended links」;ended 挂接行照常 badge)—— unbound 面改由真零覆盖
    // 语料承载(断言本体零改动;契约口径缺口已记录 eval-consistency 随行)。
    // 树径打开(零挂接会话不经任何 dock 行):展开 TOP_U → 行点击 = 原生打开。
    await ensureProjectGroupExpanded(page, kernel.projectId)
    await clickStable(page, `[data-dsh-forge-tree-caret="${TOP_U}"]`)
    await clickSelfUnmounting(
      page, `[data-dsh-forge-tree-session="${SUB_U}"]`,
      sessionOpenLanded(page),
    )
    // unbound:条不呈现(零任务号/状态/跳转;原生会话视图形态保持)。
    await page.waitForTimeout(1_500)
    await expect(page.locator('[data-dsh-forge-metadata-bar]'),
      'unbound 态:元数据条零渲染').toHaveCount(0)
    await expect(page.locator('[data-dsh-forge-metadata-open]'),
      '零跳转入口').toHaveCount(0)
    // 原生会话视图功能不受影响(composer 在场 = 会话视图保持原生形态)。
    await expect(page.locator('[data-composer-card] [contenteditable="true"]'),
      '原生会话视图保持(composer 在场)').toBeVisible({ timeout: 20_000 })
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })
})
