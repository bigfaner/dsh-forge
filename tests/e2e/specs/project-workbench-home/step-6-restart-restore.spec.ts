// @feature dsh-forge-m4 | @web-e2e | @journey project-workbench-home
// Traceability: docs/features/dsh-forge-m4/testing/project-workbench-home/
// contracts/step-6-restart-restore.md — Outcomes:
//   success — 重启后首屏仍为项目工作台,恢复最后活跃项目;首屏呈现 ≤2s
//             (500 任务规模计测,M2 继承口径:行 seam click → 500 节点 + 2rAF);
//   last-active-deleted — 上次活跃项目已删除:首屏落到其余项目或空态,不指向
//             已删项目、无报错残留(指针同事务清空,不自动激活下一项目)。
// fixture_spec: success 腿 = Project ×2 + Task 500(SC1 preset,真内核写径);
// deleted 腿 = AppState.active_project_id 悬挂(删除动词清指针)。
// Techniques: sc6 ①(500 任务语料 + 测量靴纪律 + project_ui_state 卫生)/
// sc1 ④(同 userData 重启 + 指针恢复)。
//
// 口径注记:首屏 ≤2s 的统计权威 = SC6 leg ①(median of 3 measured boots);
// 本腿在重启恢复靴上以同一 M2 口径计测单样本(硬门 ≤2s,样本值入 annotation)。

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchWorkbenchShell } from '../../helpers/app.ts'
import { assertNoActiveDshForgeInstances } from '../../helpers/instance-lock.ts'
import { seedLineageCorpus } from '../../stubs/lineage-corpus.ts'
import {
  bridgeInvoke, freshRoot, m4Env, M4WorldManager, startAutoDismiss,
} from '../_lib/m4-world.ts'
import { buildKernelWorld, handBuiltTaskSet } from '../_lib/journey-world.ts'
import { sc1TaskSet } from '../../../../apps/desktop/e2e/fixtures/task-generator.ts'
import { registerFixtureProject, writeForgeProject } from '../../../../apps/desktop/e2e/fixtures/forge-project.ts'
import { closeAndAwaitExit, openBoardPane, prepareBoardEntry, waitForTreeNodes } from '../../../../apps/desktop/e2e/tests/m2/helpers/restart-app.ts'

/** AC-2 口径:首屏可交互 ≤2s @ 500 任务(M2 SC1 继承预算)。 */
const FIRST_INTERACTIVE_BUDGET_MS = 2_000

test.describe.serial('project-workbench-home / step 6: 重启恢复活跃项目', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}
  let bigRoot = ''

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll({ removeRoot: false })
    if (bigRoot !== '') {
      const { rmSync } = await import('node:fs')
      try { rmSync(bigRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }) } catch { /* OS reclaims */ }
    }
  })

  // Outcome "success" — 重启恢复 + 首屏 ≤2s @ 500 任务(单样本 M2 口径)。
  test('step6/success: 重启恢复活跃项目 —— 首屏仍为项目工作台 + 500 任务首屏可交互 ≤2s', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })

    const root = freshRoot('m4-wb-home-step6')
    bigRoot = root
    const set = sc1TaskSet('wb-home-step6')
    expect(set.facts.taskCount, '语料前提:恰好 500 任务').toBe(500)
    const written = writeForgeProject(set, { codeRoot: join(root, 'sc6-corpus') })
    const dshHome = join(root, 'dsh-home')
    const userDataDir = join(root, 'user-data')
    mkdirSync(dshHome, { recursive: true })
    mkdirSync(userDataDir, { recursive: true })
    await seedLineageCorpus({
      dshHome,
      seeds: [{ sessionId: 'wb-home-s6-corpus', cwd: written.codeRoot, createdAt: Date.now() - 60_000, title: 'WB 重启会话语料', turnStart: true }],
    })
    const bootEnv = m4Env(dshHome)

    // ---- Warm-up boot(uncounted):真动词注册 + 首次看板全量节点核 --------
    let projectId = ''
    let shell = await launchWorkbenchShell({ userDataDir, rootDir: root, env: bootEnv })
    try {
      await shell.uiReady()
      stopAutoDismiss = startAutoDismiss(shell.page)
      projectId = (await registerFixtureProject(shell.page, written)).toString()
      expect(typeof projectId, '真动词注册完成(写径 = 注册动词)').toBe('string')
      await openBoardPane(shell.page)
      await waitForTreeNodes(shell.page, 500, 60_000)
      // 活跃指针 = 目标项目(重启恢复的期望基线)。
      const state = await bridgeInvoke<{ activeProjectId: string | null }>(shell.page, 'getState', [])
      expect(state.activeProjectId, 'warm-up 靴指针 = 目标项目').toBe(projectId)
      await shell.page.evaluate(() => { localStorage.removeItem('dsh.forge.workbench.view') }).catch(() => {})
      stopAutoDismiss()
      await closeAndAwaitExit(shell)
    } catch (error) {
      stopAutoDismiss()
      await shell.close().catch(() => {})
      throw error
    }

    // ---- Restart boot(= 重启恢复腿 + 计测靴)------------------------------
    assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })
    {
      const { DatabaseSync } = await import('node:sqlite')
      const db = new DatabaseSync(join(userDataDir, 'workbench', 'workbench.db'))
      try { db.exec('DELETE FROM project_ui_state') } finally { db.close() }
    }
    shell = await launchWorkbenchShell({ userDataDir, rootDir: root, env: bootEnv })
    manager.adopt({
      tag: 'big', shell, page: shell.page,
      kernel: { root, codeRoot: written.codeRoot, docsRoot: written.docsRoot, featuresRoot: join(written.docsRoot, 'docs', 'features'), userDataDir, projectId: '', featureSlug: '', set },
      root, dshHome, stub: null, mainLog: [],
    })
    const world = manager.live
    if (world === null) throw new Error('restart world adoption failed')
    try {
      await shell.uiReady()
      stopAutoDismiss = startAutoDismiss(shell.page)
      const page = shell.page
      // 重启恢复:首屏 = 项目工作台 + 活跃项目指针恢复(树行 aria-current)。
      const state = await bridgeInvoke<{ activeProjectId: string | null }>(page, 'getState', [])
      expect(state.activeProjectId, '重启后持久活跃项目在座(指针恢复)').toBe(projectId)
      const activeRow = page.locator(`[data-dsh-forge-tree-project="${state.activeProjectId}"]`)
      await expect(activeRow, '重启后活跃项目恢复(树行 aria-current)').toHaveAttribute('aria-current', 'true', { timeout: 30_000 })

      // 首屏计测(M2 继承口径):就绪 → 行 seam click(t0)→ 500 节点 + 2rAF(t1)。
      await prepareBoardEntry(page)
      const t0 = await page.evaluate(() => {
        const started = performance.now()
        const row = document.querySelector('[data-dsh-forge-overview-task]') as HTMLElement | null
        row?.click()
        return started
      })
      expect(typeof t0, '行 seam 在场(任务行点击 = 看板唯一开口)').toBe('number')
      await waitForTreeNodes(page, 500, 60_000)
      const t1 = await page.evaluate(() => new Promise<{ t1: number }>(resolve => {
        const settle = (): void => resolve({ t1: performance.now() })
        const frame = requestAnimationFrame(() => { requestAnimationFrame(settle) })
        setTimeout(() => { cancelAnimationFrame(frame); settle() }, 5_000)
      })).then(result => result.t1)
      const interactiveMs = t1 - t0
      testInfo.annotations.push({ type: 'wb-home-first-screen', description: `500 任务重启靴首屏可交互 = ${String(Math.round(interactiveMs))}ms(口径 = M2 SC1 继承;统计权威 = SC6 median-of-3)` })
      expect(interactiveMs,
        `重启靴首屏可交互 ${String(Math.round(interactiveMs))}ms > ${String(FIRST_INTERACTIVE_BUDGET_MS)}ms(500 任务规模)`).toBeLessThanOrEqual(FIRST_INTERACTIVE_BUDGET_MS)
      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      stopAutoDismiss()
    }
  })

  // Outcome "last-active-deleted" — 上次活跃已删除:落点合法、无报错残留。
  test('step6/last-active-deleted: 上次活跃项目已删除 —— 重启落到合法落点 + 指针不指向已删 id + 无报错', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })
    stopAutoDismiss()

    // 双项目世界:A 活跃承载 + B 存活;删除动词清 A(指针同事务清空)。
    const root = freshRoot('m4-wb-home-s6-del')
    const kernel = await buildKernelWorld(root, {
      feature: { slug: 'wb-s6-del-a', status: 'in-progress', docKinds: ['tasks'], seed: 'dsh-forge-m4-wb-s6-del-a' },
      tasks: [{ stem: '1.1', localId: '1.1', title: 'deleted carrier task', status: 'pending', type: 'coding.feature', dependencies: [] }],
    })
    const setB = handBuiltTaskSet(
      { slug: 'wb-s6-del-b', status: 'in-progress', docKinds: ['tasks'], seed: 'dsh-forge-m4-wb-s6-del-b' },
      [{ stem: '1.1', localId: '1.1', title: 'survivor task', status: 'pending', type: 'coding.feature', dependencies: [] }],
    )
    const writtenB = writeForgeProject(setB, { codeRoot: join(root, 'repo-b') })
    const dshHome = join(root, 'dsh-home')
    mkdirSync(dshHome, { recursive: true })
    const bootEnv = m4Env(dshHome)

    let shell = await launchWorkbenchShell({ userDataDir: kernel.userDataDir, rootDir: root, env: bootEnv })
    let survivorId = ''
    try {
      await shell.uiReady()
      stopAutoDismiss = startAutoDismiss(shell.page)
      const page = shell.page
      // 激活 A(用户径)→ 注册 B(真动词)→ 删除 A(真动词;确认语义经动词面)。
      const rowA = page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`)
      await expect(rowA).toBeVisible({ timeout: 30_000 })
      await rowA.click()
      await expect(rowA).toHaveAttribute('aria-current', 'true', { timeout: 15_000 })
      survivorId = (await registerFixtureProject(page, writtenB)).toString()
      await bridgeInvoke<unknown>(page, 'removeProject', [kernel.projectId])
      // State:删除后指针同事务清空、不自动激活下一项目(FT-134)。
      const afterRemove = await bridgeInvoke<{ activeProjectId: string | null; projects: Array<{ id: string }> }>(page, 'getState', [])
      expect(afterRemove.projects.map(row => row.id), '删除后注册表 = 余项目 B').toEqual([survivorId])
      expect(afterRemove.activeProjectId, '指针不指向已删 id(清空或合法落点)').not.toBe(kernel.projectId)
      await page.evaluate(() => { localStorage.removeItem('dsh.forge.workbench.view') }).catch(() => {})
      stopAutoDismiss()
      await closeAndAwaitExit(shell)
    } catch (error) {
      stopAutoDismiss()
      await shell.close().catch(() => {})
      throw error
    }

    // 重启:首屏落到其余项目或空态;不指向已删项目、无报错残留。
    assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })
    const reborn = await launchWorkbenchShell({ userDataDir: kernel.userDataDir, rootDir: root, env: bootEnv })
    manager.adopt({
      tag: 'del', shell: reborn, page: reborn.page, kernel,
      root, dshHome, stub: null, mainLog: [],
    })
    try {
      await reborn.uiReady()
      stopAutoDismiss = startAutoDismiss(reborn.page)
      const state = await bridgeInvoke<{ activeProjectId: string | null; projects: Array<{ id: string }> }>(reborn.page, 'getState', [])
      expect(state.projects.map(row => row.id), '重启后注册表 = 余项目 B(删除持久)').toEqual([survivorId])
      expect(state.activeProjectId, '重启后指针不指向已删 id').not.toBe(kernel.projectId)
      // 落点合法:指针为空(空态引导面)或 = 余项目(首屏仍为项目工作台)。
      if (state.activeProjectId !== null) {
        expect(state.activeProjectId, '指针落点 = 合法项目(余项目 B)').toBe(survivorId)
        await expect(reborn.page.locator(`[data-dsh-forge-tree-project="${survivorId}"]`),
          '余项目行在座(落点合法)').toBeVisible({ timeout: 30_000 })
      } else {
        await expect(reborn.page.locator('[data-dsh-forge-project-empty]'),
          '指针空 → 空态引导面(落点合法)').toBeVisible({ timeout: 30_000 })
      }
      // 已删项目行零残留。
      await expect(reborn.page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
        '已删项目行零残留').toHaveCount(0)
      expect(reborn.pageErrors, `renderer pageerrors: ${reborn.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      stopAutoDismiss()
    }
  })
})
