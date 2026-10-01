// @feature dsh-forge-m4 | @web-e2e | @journey split-pane-layout-memory
// Traceability: docs/features/dsh-forge-m4/testing/split-pane-layout-memory/
// contracts/step-5-leave-reenter-restore.md — Outcomes:
//   success — 离开后重进:pane 结构、比例、subagent 收起状态与溢出折叠状态
//             恢复(恢复态 = 离开前布局);
//   cross-project-layout-isolation — 两项目各自摆过不同布局:切换重进互不
//             串扰,各自恢复各自姿态;
//   restore-target-missing — 记忆布局中某 pane 视图目标数据已删除:恢复不
//             崩溃;缺失目标降级呈现(空态/可替换),其余 pane 正常恢复。
// fixture_spec: Project ×1~2 + LayoutMemory(stored:true,多 pane + 钳制比例 +
// tree 展开/收起)。missing 腿 = doc tab pane 指向已删除文档。
// Techniques: sc4 ②(重放 = open 序列;切换 + 冷重启两路径;补开第二 board
// 后分隔条 = 重放恢复的模型态)/ sc2(文档 tab 打开路径 + doc-error 降级面)。

import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  activateProjectByTreeRow, clickStable, commitSplitRatioToFloor,
  ensureProjectGroupExpanded, ensureSplitActive, focusOverviewSubtab,
  M4WorldManager, openTreeSession, pickSplitBoard, readLayoutBlob,
  splitRatioPercent, startAutoDismiss, expandRightbar,
} from '../_lib/m4-world.ts'
import { openBoardPane } from '../_lib/journey-world.ts'
import { launchWorkbenchShell } from '../../helpers/app.ts'
import { bootSpWorld, buildSpJourneyRoot, composerInput, SUB_A, TOP_A, TOP_B } from './harness.ts'

test.describe.serial('split-pane-layout-memory / step 5: 离开并重进恢复', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — 离开重进:布局恢复(结构/比例/收起状态)。
  test('step5/success: 离开重进 —— pane 结构/比例/subagent 收起状态恢复(恢复态 = 离开前布局)', async ({ }, testInfo) => {
    testInfo.setTimeout(540_000)
    const built = await buildSpJourneyRoot()
    const world = await bootSpWorld(manager, 'main', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await ensureProjectGroupExpanded(page, kernel.projectId)
    await openTreeSession(page, TOP_B)
    await expect(composerInput(page), '会话体挂载').toBeVisible({ timeout: 20_000 })

    // 摆布局:split-active + 比例 30% + subagent 收起调整(TOP_A 展开→收起)。
    await expandRightbar(page)
    await pickSplitBoard(page)
    await ensureSplitActive(page)
    await commitSplitRatioToFloor(page)
    await expect.poll(() => splitRatioPercent(page),
      { timeout: 10_000, message: '比例落位 30' }).toBe('30')
    // subagent 收起姿态调整(TOP_A 展开→收起):单次 caret 点击会把默认收起的
    // 组展开 —— 先证展开、再收起,「离开前 = 收起」前提坐实(可验证,不裸点)。
    await clickStable(page, `[data-dsh-forge-tree-caret="${TOP_A}"]`)
    await expect(page.locator(`[data-dsh-forge-tree-session="${SUB_A}"]`),
      'TOP_A 展开(subagent 后代行呈现)').toBeVisible({ timeout: 10_000 })
    await clickStable(page, `[data-dsh-forge-tree-caret="${TOP_A}"]`)
    await expect(page.locator(`[data-dsh-forge-tree-session="${SUB_A}"]`),
      'TOP_A 收起(离开前姿态 = 收起)').toHaveCount(0, { timeout: 10_000 })
    await page.waitForTimeout(1_600)
    await expect.poll(async () => (await readLayoutBlob(kernel.userDataDir, kernel.projectId))?.rightbar,
      { timeout: 15_000, message: '布局入 blob(widthPct=30)' }).toMatchObject({ widthPct: 30 })

    // 离开重进(sc4 路径二:关 app → 同 userData 冷重启;写离已随去抖落库,
    // 重放 = open 序列,恢复态断言与切换路径同口径)。
    const userDataDir = kernel.userDataDir
    const rootDir = world.root
    const dshHome = world.dshHome
    stopAutoDismiss()
    // tree-kill + 等真正退出(manager.release;裸 shell.close() 后 host 子进程
    // (19387)可能仍在,首线探针即误报外部实例)。
    await manager.release()
    const { assertNoActiveDshForgeInstances } = await import('../../helpers/instance-lock.ts')
    assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })
    const reborn = await launchWorkbenchShell({ userDataDir, rootDir, env: { DSH_HOME: dshHome, DEEPSEEK_API_KEY: 'm4-e2e-stub-key' } })
    manager.adopt({
      tag: 'reborn', shell: reborn, page: reborn.page, kernel,
      root: rootDir, dshHome, stub: null, mainLog: [],
    })
    try {
      await reborn.uiReady()
      stopAutoDismiss = startAutoDismiss(reborn.page)
      const page2 = reborn.page
      // 重进:活跃项目恢复 + board pane 重放恢复 + 树姿态恢复。
      await expect(page2.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
        '重进:活跃项目恢复').toHaveAttribute('aria-current', 'true', { timeout: 30_000 })
      await expect(page2.locator('[data-dsh-forge-task-board]'),
        '重进:board pane 重放恢复(pane 结构恢复)').toBeVisible({ timeout: 45_000 })
      await ensureProjectGroupExpanded(page2, kernel.projectId)
      await openTreeSession(page2, TOP_B)
      // 比例恢复(补开第二 board 后分隔条 = 重放恢复的模型态;4.5 口径)。
      await ensureSplitActive(page2)
      await expect.poll(() => splitRatioPercent(page2),
        { timeout: 10_000, message: '重进:比例恢复(30)' }).toBe('30')
      // subagent 收起状态恢复(SUB_A 行承载 kind=subagent;离开前 = 收起)。
      await expect(page2.locator(`[data-dsh-forge-tree-session="${SUB_A}"]`),
        '重进:subagent 收起状态恢复(离开前 = 收起)').toHaveCount(0)
      expect(reborn.pageErrors, `renderer pageerrors: ${reborn.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      stopAutoDismiss()
    }
  })

  // Outcome "cross-project-layout-isolation" — 两项目布局互不串扰。
  test('step5/cross-project-layout-isolation: 两项目各自摆过不同布局 —— 切换重进各自恢复各自姿态(零串扰)', async ({ }, testInfo) => {
    testInfo.setTimeout(540_000)
    const built = await buildSpJourneyRoot({ dual: true })
    const world = await bootSpWorld(manager, 'dual', built)
    const { page, kernel } = world
    const other = built.other
    if (other === null) throw new Error('dual world must carry the second project')
    stopAutoDismiss = startAutoDismiss(page)

    // A 摆布局:split-active + 比例 30%。
    await activateProjectByTreeRow(page, kernel.projectId)
    await ensureProjectGroupExpanded(page, kernel.projectId)
    await openTreeSession(page, TOP_B)
    await expect(composerInput(page), 'A 会话体挂载').toBeVisible({ timeout: 20_000 })
    await expandRightbar(page)
    await pickSplitBoard(page)
    await ensureSplitActive(page)
    await commitSplitRatioToFloor(page)
    await expect.poll(() => splitRatioPercent(page), { timeout: 10_000, message: 'A 比例 30' }).toBe('30')
    await page.waitForTimeout(1_600)

    // 切到 B(写离:A 的 blob 即已含离开前布局;B 侧默认姿态)。
    const rowB = page.locator(`[data-dsh-forge-tree-project="${other.projectId}"]`)
    await rowB.click()
    await expect(rowB).toHaveAttribute('aria-current', 'true', { timeout: 15_000 })
    await expect(page.locator('[data-dsh-forge-task-board]'),
      '换台重置:B 侧无 A 的 board pane(A 布局零串扰)').toHaveCount(0, { timeout: 15_000 })
    await expect.poll(async () => (await readLayoutBlob(kernel.userDataDir, kernel.projectId))?.rightbar,
      { timeout: 15_000, message: '写离:A 的 blob 在 B 侧可读(widthPct=30)' }).toMatchObject({ widthPct: 30 })

    // B 摆自己的布局(board pane,比例保持默认 50)。
    await ensureProjectGroupExpanded(page, other.projectId)
    await openBoardPane(page)
    await page.waitForTimeout(1_600)
    // B 的 blob 独立(与 A 不同行)。
    expect(await readLayoutBlob(kernel.userDataDir, other.projectId),
      'B 布局记忆独立成行(按项目隔离)').toBeDefined()

    // 重进 A:恢复 A 的姿态(比例 30);再重进 B:恢复 B 的姿态(无 A 的 30)。
    await activateProjectByTreeRow(page, kernel.projectId)
    await expect(page.locator('[data-dsh-forge-task-board]'),
      '重进 A:board pane 重放恢复').toBeVisible({ timeout: 45_000 })
    await ensureProjectGroupExpanded(page, kernel.projectId)
    await openTreeSession(page, TOP_B)
    await ensureSplitActive(page)
    await expect.poll(() => splitRatioPercent(page),
      { timeout: 10_000, message: '重进 A:比例恢复 30(各自姿态)' }).toBe('30')
    await activateProjectByTreeRow(page, other.projectId)
    await expect(page.locator('[data-dsh-forge-task-board]'),
      '重进 B:B 的 board pane 恢复(各自姿态)').toBeVisible({ timeout: 45_000 })
    const blobB = await readLayoutBlob(kernel.userDataDir, other.projectId)
    expect((blobB?.rightbar as { widthPct?: number } | undefined)?.widthPct ?? 50,
      'B 比例 ≠ A 的 30(零串扰;B 未调比例 = 默认/自身值)').not.toBe(30)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "restore-target-missing" — 缺失目标降级,其余 pane 正常恢复。
  test('step5/restore-target-missing: 记忆 pane 目标已删除 —— 恢复不崩溃 + 缺失面降级呈现 + 其余 pane 正常恢复', async ({ }, testInfo) => {
    testInfo.setTimeout(540_000)
    const built = await buildSpJourneyRoot()
    const world = await bootSpWorld(manager, 'missing', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await ensureProjectGroupExpanded(page, kernel.projectId)
    await openTreeSession(page, TOP_B)
    await expect(composerInput(page), '会话体挂载').toBeVisible({ timeout: 20_000 })

    // 摆布局:board pane(健全目标)+ doc tab(将被删除的目标)。
    // r3 语料修正:doc 目标 = manifest(真单文件:在世可读、删除是真删除)。
    // 原 tasks 行是迁移世界的幽灵档 —— v3 迁移把 tasks/index.json 归档为
    // index.json.migrated-*,readFeatureDoc('tasks') 在【删除前】就 ENOENT
    // (world1 即错误卡),而 rmSync(tasks.md) 删的是从未存在的文件(空操作),
    // 「健全 pane → 删除目标 → 重进降级」的前提从未成立。manifest.md 由
    // fixture 恒写、读取走 DOC_KIND_ANCHORS 同锚点 —— 前提坐实。
    await expandRightbar(page)
    await pickSplitBoard(page)
    await expect(page.locator('[data-dsh-forge-task-board]'), 'board pane 在场(健全 pane)').toBeVisible({ timeout: 20_000 })
    await focusOverviewSubtab(page, 'features', '[data-dsh-forge-overview-features]')
    await clickStable(page, `[data-dsh-forge-overview-doc="features/sp-split/manifest"]`)
    await expect(page.locator(`[data-dsh-forge-doc="docs/features/sp-split/manifest"]`),
      'doc tab 打开且正文可读(pane 目标语料 = 健全目标)').toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-dsh-forge-doc-error]'), '健全目标零错误面').toHaveCount(0)
    await page.waitForTimeout(1_600)

    // 布景:删除 doc 目标文件(重进后该 pane 的目标缺失)。
    const docPath = join(kernel.featuresRoot, 'sp-split', 'manifest.md')
    rmSync(docPath, { force: true, maxRetries: 20, retryDelay: 250 })

    // 离开重进(冷重启路径)。
    const userDataDir = kernel.userDataDir
    const rootDir = world.root
    const dshHome = world.dshHome
    stopAutoDismiss()
    // tree-kill + 等真正退出(manager.release;裸 shell.close() 后 host 子进程
    // (19387)可能仍在,首线探针即误报外部实例)。
    await manager.release()
    const { assertNoActiveDshForgeInstances } = await import('../../helpers/instance-lock.ts')
    assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })
    const reborn = await launchWorkbenchShell({ userDataDir, rootDir, env: { DSH_HOME: dshHome, DEEPSEEK_API_KEY: 'm4-e2e-stub-key' } })
    manager.adopt({
      tag: 'missing-reborn', shell: reborn, page: reborn.page, kernel,
      root: rootDir, dshHome, stub: null, mainLog: [],
    })
    try {
      await reborn.uiReady()
      stopAutoDismiss = startAutoDismiss(reborn.page)
      const page2 = reborn.page
      // 恢复不崩溃:零 pageErrors + 三区骨架在场。
      await expect(page2.locator('[data-dsh-forge-project-seat]'),
        '恢复不崩溃(左栏座位在场)').toBeVisible({ timeout: 30_000 })
      await expect(page2.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
        '重进:活跃项目恢复').toHaveAttribute('aria-current', 'true', { timeout: 30_000 })
      // 其余 pane 正常恢复(board pane 重放)。
      await expect(page2.locator('[data-dsh-forge-task-board]'),
        '其余 pane 正常恢复(board 重放)').toBeVisible({ timeout: 45_000 })
      // 缺失目标降级呈现:doc pane 呈错误/空态面,或该 tab 已降级不重放
      // (两种降级形态均为「不崩溃 + 可替换」的契约面;FT-122 逐 op 守护)。
      await page2.waitForTimeout(2_000)
      const degradedDoc = await page2.evaluate(() => ({
        docPanes: document.querySelectorAll('[data-dsh-forge-doc]').length,
        docErrors: document.querySelectorAll('[data-dsh-forge-doc-error]').length,
      }))
      expect(degradedDoc.docPanes === 0 || degradedDoc.docErrors > 0,
        `缺失目标降级呈现(空态/错误面或降级不重放):${JSON.stringify(degradedDoc)}`).toBe(true)
      expect(reborn.pageErrors, `renderer pageerrors: ${reborn.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      stopAutoDismiss()
    }
  })
})
