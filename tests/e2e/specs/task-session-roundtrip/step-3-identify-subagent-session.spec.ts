// @feature dsh-forge-m4 | @web-e2e | @journey task-session-roundtrip
// Traceability: docs/features/dsh-forge-m4/testing/task-session-roundtrip/
// contracts/step-3-identify-subagent-session.md — Outcomes:
//   success — 血缘推断命中的 origin=subagent 会话被标识,以「任务 id + title」
//             命名展示(命名约定 + 血缘双重校验;depth-2 递归;推断只读不落库);
//   no-subagent-hit — 血缘树内无 subagent(顶层自身执行):打开动作落到顶层
//             派发会话,不误报、无空转报错;
//   inference-degraded — DEFERRED(见 header VERIFY);
//   descendant-cap-fold — 后代列表呈现至 20 条上限 + 尾部「查看全部」折叠
//             (LINEAGE_DESCENDANT_LIMIT;溢出不破坏归拢)。
// fixture_spec: Project ×1 + Task(in_progress ∧ active)+ Session(顶层)+
// SubagentSession ×3/×24(超限语料)。
// Techniques: sc7 ①⑥(M 的 20 行上限 + 查看全部;行展开后代名 = 命名遵循)。
//
// VERIFY(deferred, inference-degraded):血缘推断降级的两触发源(快照缺席 =
// 上游 sessions 服务缺席 / 预算 >100ms;FT-106)在真链 e2e 均无确定性注错
// 缝 —— 快照随宿主常在;100ms 合作式死线在语料规模内不可确定性超限。权威
// 覆盖 = lineage/budget.ts + derive.ts 单测(两源 × degraded=true × 单行结构
// 日志 × 下次调用自动恢复);UI 降级面([data-dsh-forge-tree-degraded] +
// detail-lineage-off)在组件单测承载。

import { expect, test } from '@playwright/test'
import { MANY_DESCENDANT_COUNT } from '../../stubs/lineage-corpus.ts'
import {
  activateProjectByTreeRow, clickSelfUnmounting, expandLinkRow, M4WorldManager,
  openTaskDetail, sessionOpenLanded, startAutoDismiss,
} from '../_lib/m4-world.ts'
import { namingCompliantName } from '../../stubs/lineage-corpus.ts'
import {
  SUB_NESTED, SUB_OK, TASK_MAIN, TASK_PLAIN, TITLE_MAIN, TOP_A, TOP_M, TOP_PLAIN,
  bootRtWorld, buildRtJourneyRoot, registerRtLinks,
} from './harness.ts'

test.describe.serial('task-session-roundtrip / step 3: 识别执行 subagent 会话', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — 血缘标识 + 命名遵循 + 递归。
  test('step3/success: 行展开血缘后代 —— 命名遵循「任务 id + title」+ depth-2 递归 + 归拢非顶层', async ({ }, testInfo) => {
    testInfo.setTimeout(480_000)
    const built = await buildRtJourneyRoot()
    const world = await bootRtWorld(manager, 'main', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await registerRtLinks(page, kernel)

    await openTaskDetail(page, TASK_MAIN)
    await expandLinkRow(page, TOP_A)
    // 命名遵循:后代行名 = descriptor label = 「任务 id + title」。
    const subOkRow = page.locator(`[data-dsh-forge-detail-descendant="${SUB_OK}"]`)
    await expect(subOkRow, '行展开血缘后代(catalog 地址权威)').toBeVisible({ timeout: 10_000 })
    await expect(subOkRow, '命名遵循:行名 = 任务 id + title(双重校验之命名面)').toContainText(
      namingCompliantName(TASK_MAIN, TITLE_MAIN))
    // 血缘面:depth-2 递归(SUB_OK 的子)在展开态呈现(递归 DFS)。
    await expect(page.locator(`[data-dsh-forge-detail-descendant="${SUB_NESTED}"]`),
      'depth-2 后代在展开态(递归血缘 = 双重校验之血缘面)').toBeVisible({ timeout: 10_000 })
    // 归拢:subagent 不出现在左栏顶层(树面交叉)。
    await expect(page.locator('[data-dsh-forge-tree-kind="subagent"]'),
      'subagent 恒不出现顶层(归拢)').toHaveCount(0)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "no-subagent-hit" — 无 subagent:打开落到顶层,不误报。
  test('step3/no-subagent-hit: 血缘树无 subagent —— 绑定会话入口落到顶层派发会话(不误报/无空转)', async ({ }, testInfo) => {
    testInfo.setTimeout(480_000)
    const built = await buildRtJourneyRoot()
    const world = await bootRtWorld(manager, 'plain', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await registerRtLinks(page, kernel)

    await openTaskDetail(page, TASK_PLAIN)
    // 行呈现(TOP_PLAIN active)+ [打开] 顶层通道在场;行展开无后代(零误报)。
    await expect(page.locator(`[data-dsh-forge-detail-link="${TOP_PLAIN}"]`),
      'active 挂接行在场').toHaveAttribute('data-link-status', 'active', { timeout: 20_000 })
    await expandLinkRow(page, TOP_PLAIN)
    await expect(page.locator(`[data-dsh-forge-detail-link-body="${TOP_PLAIN}"] [data-dsh-forge-detail-descendant]`),
      '无 subagent 命中:展开面零后代行(不误报)').toHaveCount(0, { timeout: 10_000 })
    // 绑定会话入口 → 顶层会话打开(树行 aria-current;正常态非错误)。
    await clickSelfUnmounting(
      page, `[data-dsh-forge-detail-enter="${TOP_PLAIN}"]`,
      async () => await sessionOpenLanded(page)()
        && await page.locator(`[data-dsh-forge-tree-session="${TOP_PLAIN}"]`)
          .getAttribute('aria-current').catch(() => null) === 'true',
    )
    await expect(page.locator(`[data-dsh-forge-tree-session="${TOP_PLAIN}"]`),
      '打开动作落到顶层派发会话(树行选中)').toHaveAttribute('aria-current', 'true', { timeout: 15_000 })
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "descendant-cap-fold" — 20 上限 + 查看全部。
  test('step3/descendant-cap-fold: 后代超上限 —— 恰 20 行 + 尾部「查看全部 {n} 个」折叠(溢出不破坏归拢)', async ({ }, testInfo) => {
    testInfo.setTimeout(480_000)
    const built = await buildRtJourneyRoot()
    const world = await bootRtWorld(manager, 'cap', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await registerRtLinks(page, kernel)

    await openTaskDetail(page, TASK_MAIN)
    const mDescendants = page.locator(
      `[data-dsh-forge-detail-link-body="${TOP_M}"] [data-dsh-forge-detail-descendant]`)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expandLinkRow(page, TOP_M)
      if (await mDescendants.count().then(n => n === 20, () => false)) break
      await page.waitForTimeout(800)
    }
    await expect(mDescendants,
      `查看全部折叠:恰 20 行(LINEAGE_DESCENDANT_LIMIT,限 M 行体)`).toHaveCount(20, { timeout: 10_000 })
    await expect(page.locator(`[data-dsh-forge-detail-descendants-more="${String(MANY_DESCENDANT_COUNT)}"]`),
      `「查看全部 {n} 个」尾注(total = ${String(MANY_DESCENDANT_COUNT)})`).toBeVisible({ timeout: 10_000 })
    // 溢出不破坏归拢:subagent 仍不出现在顶层。
    await expect(page.locator('[data-dsh-forge-tree-kind="subagent"]'),
      '溢出不破坏归拢(顶层零 subagent)').toHaveCount(0)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })
})
