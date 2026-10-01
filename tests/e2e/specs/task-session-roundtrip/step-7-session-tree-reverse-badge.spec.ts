// @feature dsh-forge-m4 | @web-e2e | @journey task-session-roundtrip
// Traceability: docs/features/dsh-forge-m4/testing/task-session-roundtrip/
// contracts/step-7-session-tree-reverse-badge.md — Outcomes:
//   success — 会话树反向标识:subagent 归拢于 parent 血缘树下默认收起(行尾
//             ▾ 递归展开),不出现在顶层列表;树徽标与任务详情 dock 两侧均
//             能识别该任务归属(反查互证);
//   rename-vs-lineage-conflict — 手工改名桩(命名约定被破坏):血缘仍为唯一
//             权威 —— 归拢/标识/打开不受改名影响(C6 条静默纠偏;行名 = 会话
//             名自持,两面分立)。
// fixture_spec: Project ×1 + Task + SessionLink(active)+ Session(parent)+
// SubagentSession(改名桩语料:label 遵循 / durable title = 手工改名)。
// Techniques: sc7 ④⑦(归拢 + caret 递归;改名桩 → C6 以血缘为准 + 行名自持)。

import { expect, test } from '@playwright/test'
import { namingCompliantName } from '../../stubs/lineage-corpus.ts'
import {
  activateProjectByTreeRow, clickSelfUnmounting, clickStable, ensureProjectGroupExpanded,
  expandLinkRow, M4WorldManager, openTaskDetail, sessionOpenLanded,
  startAutoDismiss,
} from '../_lib/m4-world.ts'
import {
  RENAME_STUB, SUB_NESTED, SUB_OK, SUB_RENAMED, TASK_MAIN, TITLE_MAIN, TOP_A,
  bootRtWorld, buildRtJourneyRoot, registerRtLinks,
} from './harness.ts'

test.describe.serial('task-session-roundtrip / step 7: 会话树反向标识', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — 归拢 + 默认收起 + 递归 + 两侧互证。
  test('step7/success: 会话树反向标识 —— subagent 归拢 parent 树下默认收起 + 递归展开 + 树/dock 两侧反查互证', async ({ }, testInfo) => {
    testInfo.setTimeout(540_000)
    const built = await buildRtJourneyRoot()
    const world = await bootRtWorld(manager, 'main', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await registerRtLinks(page, kernel)
    await ensureProjectGroupExpanded(page, kernel.projectId)

    // 归拢:默认收起(零 subagent 行渲染)+ 顶层列表零 subagent 条目。
    await expect(page.locator(`[data-dsh-forge-tree-session="${TOP_A}"]`),
      'parent 会话行在座').toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-dsh-forge-tree-kind="subagent"]'),
      '默认收起:零 subagent 行渲染').toHaveCount(0)
    // 行尾 ▾ 展开 → 归拢于 parent 血缘树下;depth-2 逐级递归收起。
    await clickStable(page, `[data-dsh-forge-tree-caret="${TOP_A}"]`)
    await expect(page.locator(`[data-dsh-forge-tree-session="${SUB_OK}"]`),
      'A 展开后直属 subagent 行在场(归拢非顶层)').toBeVisible({ timeout: 10_000 })
    await expect(page.locator(`[data-dsh-forge-tree-session="${SUB_NESTED}"]`),
      'depth-2 后代默认仍收起(逐级收起)').toHaveCount(0)
    await clickStable(page, `[data-dsh-forge-tree-caret="${SUB_OK}"]`)
    await expect(page.locator(`[data-dsh-forge-tree-session="${SUB_NESTED}"][data-dsh-forge-tree-kind="subagent"]`),
      'C1 展开后 depth-2 后代在场(递归血缘)').toBeVisible({ timeout: 10_000 })

    // 反查互证:dock 侧行展开亦识别同一任务归属(命名遵循行 + 任务 id)。
    // 命名面前置 = 先开 TOP_A(catalog 随 open 加载,sc7 ①⑥ 纪律;calibration
    // r2 同 step-3):cold 行只承结构,行名退 displayTitle = cwd 尾段「repo」。
    await openTaskDetail(page, TASK_MAIN)
    await clickSelfUnmounting(
      page, `[data-dsh-forge-detail-enter="${TOP_A}"]`,
      sessionOpenLanded(page),
    )
    // sc7 fix-1 重入纪律:会话切换卸载板内 dock → 同一用户径重开。
    await openTaskDetail(page, TASK_MAIN)
    await expandLinkRow(page, TOP_A)
    await expect(page.locator(`[data-dsh-forge-detail-descendant="${SUB_OK}"]`),
      'dock 侧血缘行在场(两侧互证)').toBeVisible({ timeout: 10_000 })
    await expect(page.locator(`[data-dsh-forge-detail-descendant="${SUB_OK}"]`),
      '两侧同一命名约定(树徽标 ↔ dock 反查互证)').toContainText(
      namingCompliantName(TASK_MAIN, TITLE_MAIN))
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "rename-vs-lineage-conflict" — 改名桩:血缘为准,归拢/标识/打开不受影响。
  test('step7/rename-vs-lineage-conflict: 手工改名桩 —— 血缘为唯一权威(归拢/打开不受改名影响;C6 静默纠偏 vs 行名自持两面分立)', async ({ }, testInfo) => {
    testInfo.setTimeout(540_000)
    const built = await buildRtJourneyRoot()
    const world = await bootRtWorld(manager, 'renamed', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await registerRtLinks(page, kernel)
    await ensureProjectGroupExpanded(page, kernel.projectId)

    // 树面:改名桩行仍归拢于 parent 树下(血缘结构不因改名变化)。
    await clickStable(page, `[data-dsh-forge-tree-caret="${TOP_A}"]`)
    await expect(page.locator(`[data-dsh-forge-tree-session="${SUB_RENAMED}"][data-dsh-forge-tree-kind="subagent"]`),
      '改名桩行仍归拢 parent 树下(血缘为准)').toBeVisible({ timeout: 10_000 })
    // dock 面:行展开呈现改名桩行(冷 catalog 行名 = descriptor label;打开后
    // 会话名自持投影到列表 —— 与 C6 血缘面分立)。
    await openTaskDetail(page, TASK_MAIN)
    await expandLinkRow(page, TOP_A)
    const renamedRow = page.locator(`[data-dsh-forge-detail-descendant="${SUB_RENAMED}"]`)
    await expect(renamedRow, '改名桩行在场(dock 反查不受改名影响)').toBeVisible({ timeout: 10_000 })

    // 打开不受改名影响(SubagentAddress 走血缘地址;打开后 C6 以血缘推导)。
    // calibration r2 同 step-6:先开 TOP_A(catalog 加载;否则冷行兜底地址
    // one-shot → 只读形态打开,conversation.input.dock 不挂载,C6 条所在面
    // 结构性缺席)→ sc7 fix-1 同用户径重入 → 再开改名桩后代。
    await openTaskDetail(page, TASK_MAIN)
    await clickSelfUnmounting(
      page, `[data-dsh-forge-detail-enter="${TOP_A}"]`,
      sessionOpenLanded(page),
    )
    await openTaskDetail(page, TASK_MAIN)
    await expandLinkRow(page, TOP_A)
    await clickSelfUnmounting(
      page, `[data-dsh-forge-detail-descendant-open="${SUB_RENAMED}"]`,
      sessionOpenLanded(page),
    )
    const bar = page.locator('[data-dsh-forge-metadata-bar]')
    await expect(bar, '改名桩会话视图元数据条在场(血缘覆盖)').toBeVisible({ timeout: 20_000 })
    await expect(bar, '任务号 = 血缘推导(非会话名;静默纠偏)').toHaveAttribute('data-dsh-forge-metadata-task', TASK_MAIN)
    await expect(bar, 'C6 条不携会话手改名(血缘为准)').not.toContainText(RENAME_STUB)

    // 行名自持(会话名面):重进 dock 后行名呈 durable title = 手工改名
    //(打开使宿主投影会话名进列表;两面分立 —— 命名辅助/血缘权威)。
    await openTaskDetail(page, TASK_MAIN)
    await expandLinkRow(page, TOP_A)
    await expect(renamedRow, '命名辅助:改名桩行名 = 手工改名(会话名自持)').toContainText(RENAME_STUB)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })
})
