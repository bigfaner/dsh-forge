// @feature dsh-forge-m2 | @web-e2e | @journey multi-project-management
// Traceability: docs/features/dsh-forge-m2/testing/multi-project-management/contracts/step-4-switch-active-project.md
//
// Step 4(切换激活项目)的两条 Outcome 腿:
//   success — B(当前激活)上留下选中/过滤态(任务 dock + 搜索唯一任务),经
//     chrome 切换器切回 A:三页数据完整切换(任务节点全集、dock 关、过滤清、
//     feature 列表换、无跨项目徽标),active_project_id 更新(sc5 同款断言),
//     且挂接历史按项目呈现(bridge recordSessionLink 铺两项目各 ≥1 条 —— 挂接
//     索引为工作台自有 SoT、不可从 forge 文件推导,FT-035;A 的 dock 只见 A 的
//     挂接行,切回 B 只见 B 的)。
//   project-path-invalid — 移除非激活项目 B 的代码根目录:其卡片失联徽标 +
//     应用不崩溃 + 注册表行保留(不自动删除)+ 激活项目 A 的浏览不受影响。
//     注:contract Input 的「选择该项目」经切换器 = activateProject(失联项目),
//     实装对该动词无可读性预检语义记录于 sc5 失联腿之外 —— 本腿按 sc5 失联卡
//     口径断言(概览卡失联徽标 + 切换器仍列出该行 + A 数据面照常),不驱动
//     对失联项目的激活动词(避免把未定义语义编码为预期)。
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  BASE_BUNDLES, FORGE_WORKBENCH, FORGE_WORKBENCH_STAGED_AT, forgeWorkbenchTarball,
} from '../helpers/plugins.ts'
import { registerFixtureProject, writeForgeProject } from '../fixtures/forge-project.ts'
import { generateTaskSet } from '../fixtures/task-generator.ts'
import type { GeneratedTaskSet } from '../fixtures/task-generator.ts'
import { cleanupViewKey, closeAndAwaitExit, createAppSessionFactory, switchToWorkbench, waitForTreeNodes } from '../tests/m2/helpers/restart-app.ts'

/** The workbench-owned registry read (activation oracle, FT-030). */
async function readActive(page: Page): Promise<{ rows: string[]; activeProjectId: string | null }> {
  return await page.evaluate(async () => {
    type Bridge = { getState?: () => Promise<{ projects: Array<{ id: string }>; activeProjectId: string | null }> }
    const bridge = (globalThis as { dshForge?: { workbench?: Bridge } }).dshForge?.workbench
    const state = await bridge?.getState?.()
    return { rows: (state?.projects ?? []).map(row => row.id), activeProjectId: state?.activeProjectId ?? null }
  })
}

/** The sanctioned fixture channel for 挂接行(FT-035:SoT = 工作台自有库)。 */
async function bridgeRecordSessionLink(page: Page, input: { projectId: string; taskKey: string; sessionId: string }): Promise<void> {
  await page.evaluate(async (args: { projectId: string; taskKey: string; sessionId: string }) => {
    type Bridge = { recordSessionLink?: (row: { projectId: string; taskKey: string; sessionId: string }) => Promise<unknown> }
    const bridge = (globalThis as { dshForge?: { workbench?: Bridge } }).dshForge?.workbench
    if (bridge?.recordSessionLink === undefined) throw new Error('dshForge.workbench bridge is unavailable in the e2e renderer')
    await bridge.recordSessionLink(args)
  }, input)
}

function journeyBundles(): ReadonlyArray<{ name: string; source?: string; mandatory?: true }> {
  return [
    ...BASE_BUNDLES,
    { name: FORGE_WORKBENCH, source: `tarball:${FORGE_WORKBENCH_STAGED_AT}`, mandatory: true },
  ]
}

/** The first task of a set's first feature, as a board-qualified key. */
function firstTaskKey(set: GeneratedTaskSet): { taskKey: string; localId: string } {
  const feature = set.features[0]
  const task = feature?.tasks[0]
  if (feature === undefined || task === undefined) throw new Error('fixture set has no tasks')
  return { taskKey: `${feature.slug}/${task.localId}`, localId: task.localId }
}

test('step-4/success [@web-e2e @journey multi-project-management]: switching back to the first project fully re-scopes board, features and per-project link history', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)

  const setA = generateTaskSet({ seed: 'mpm4a', taskCount: 12, featureCount: 2, danglingRate: 0, recordRate: 0 })
  const setB = generateTaskSet({ seed: 'mpm4b', taskCount: 15, featureCount: 3, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-mpm4-'))
  const projectA = writeForgeProject(setA, { codeRoot: join(root, 'proj-a-mpm4') })
  const projectB = writeForgeProject(setB, { codeRoot: join(root, 'proj-b-mpm4') })
  const nameA = 'proj-a-mpm4'
  const nameB = 'proj-b-mpm4'
  const featureA1 = setA.features[0]
  const featureB1 = setB.features[0]
  if (featureA1 === undefined || featureB1 === undefined) throw new Error('fixture sets missing features')
  const keyA = firstTaskKey(setA)
  const keyB = firstTaskKey(setB)
  // The one-task search needle: the FULL title of B's 8th task (titles end
  // `#<globalIndex>` — the full string is unique inside B).
  const flatB = setB.features.flatMap(feature => feature.tasks)
  const needleTask = flatB[7]
  if (needleTask === undefined) throw new Error('fixture set B has fewer than 8 tasks')
  const needle = needleTask.title
  const sessionA = 'session-mpm4-a-0001'
  const sessionB = 'session-mpm4-b-0001'

  const session = createAppSessionFactory({
    bundles: journeyBundles(),
    stageTarballs: [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }],
    rootDir: join(root, 'shell'),
    userDataDir: join(root, 'user-data'),
  })

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      // Setup:两项目在册;后注册者持有激活指针(当前激活 = 第二个项目)。
      const projectAId = await registerFixtureProject(page, projectA)
      const projectBId = await registerFixtureProject(page, projectB)
      expect((await readActive(page)).activeProjectId).toBe(projectBId)
      // 挂接行装置:两项目任务各至少 1 条(FT-035:SoT 铺设)。
      await bridgeRecordSessionLink(page, { projectId: projectAId, taskKey: keyA.taskKey, sessionId: sessionA })
      await bridgeRecordSessionLink(page, { projectId: projectBId, taskKey: keyB.taskKey, sessionId: sessionB })

      // ---- B 上留下选中态(dock)与过滤态(搜索唯一任务)--------------------
      await switchToWorkbench(page)
      await page.getByRole('tab', { name: /^任务$|^Tasks$/ }).click()
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-tasks"]')).toBeVisible()
      await waitForTreeNodes(page, setB.facts.taskCount, 60_000)
      await page.locator(`[data-dsh-forge-node-card="${keyB.taskKey}"]`).click()
      await expect(page.locator(`[data-dsh-forge-task-detail="${keyB.taskKey}"]`)).toBeVisible({ timeout: 15_000 })
      // 挂接历史按项目呈现(B 面):B 的挂接行在、A 的不在。
      await expect(page.locator(`[data-dsh-forge-detail-link="${sessionB}"]`)).toBeVisible({ timeout: 15_000 })
      await expect(page.locator(`[data-dsh-forge-detail-link="${sessionB}"] [data-dsh-forge-badge="link:active"]`)).toBeVisible()
      await expect(page.locator(`[data-dsh-forge-detail-link="${sessionA}"]`), '跨项目挂接行不呈现').toHaveCount(0)
      await page.locator('[data-dsh-forge-tasks-search]').fill(needle)
      await expect(page.locator('[data-dsh-forge-tasks-count]'))
        .toContainText(new RegExp(`1\\s*(?:of|\\/)\\s*${String(setB.facts.taskCount)}`), { timeout: 15_000 })

      // ---- 切换回 A(chrome 切换器的真实数据路径)--------------------------
      await page.locator('[data-dsh-forge-switcher-trigger]').click()
      await page.locator('[data-dsh-forge-switcher-menu] [data-dsh-forge-switcher-item]', { hasText: nameA }).click()
      await expect(page.locator('[data-dsh-forge-switcher-trigger]')).toContainText(nameA, { timeout: 10_000 })

      // 任务页完整切换:A 的任务全集(节点数)、旧 dock 关、过滤清、无跨项目徽标。
      await page.getByRole('tab', { name: /^任务$|^Tasks$/ }).click()
      await waitForTreeNodes(page, setA.facts.taskCount, 60_000)
      await expect(page.locator('[data-dsh-forge-task-detail]'), '跨项目 dock 选中态退役').toHaveCount(0)
      await expect(page.locator('[data-dsh-forge-tasks-count]'))
        .toContainText(new RegExp(`${String(setA.facts.taskCount)}\\s*(?:of|\\/)\\s*${String(setA.facts.taskCount)}`), { timeout: 15_000 })
      await expect(page.locator('[data-dsh-forge-badge="session-live"]'), '无跨项目会话徽标').toHaveCount(0)
      // 挂接历史按项目呈现(A 面):A 的挂接行在、B 的不在。
      await page.locator(`[data-dsh-forge-node-card="${keyA.taskKey}"]`).click()
      await expect(page.locator(`[data-dsh-forge-task-detail="${keyA.taskKey}"]`)).toBeVisible({ timeout: 15_000 })
      await expect(page.locator(`[data-dsh-forge-detail-link="${sessionA}"] [data-dsh-forge-badge="link:active"]`)).toBeVisible({ timeout: 15_000 })
      await expect(page.locator(`[data-dsh-forge-detail-link="${sessionB}"]`), '跨项目挂接行不呈现').toHaveCount(0)

      // feature 页切换可判:A 的卡片在、B 的卡片不在、无 stale 残留。
      await page.getByRole('tab', { name: /^feature$|^Features$/ }).click()
      await expect(page.locator(`[data-dsh-forge-feature-card="${featureA1.slug}"]`)).toBeVisible({ timeout: 30_000 })
      await expect(page.locator(`[data-dsh-forge-feature-card="${featureB1.slug}"]`)).toHaveCount(0)
      await expect(page.locator('[data-dsh-forge-feature-notfound]'), '无 stale feature-detail 残留').toHaveCount(0)

      // State:active_project_id 更新为目标项目(单激活,读数口径)。
      const after = await readActive(page)
      expect(after.activeProjectId).toBe(projectAId)
      expect(after.rows).toHaveLength(2)

      // ---- 切回 B:B 的挂接历史仍按项目呈现(可逆)------------------------
      await page.locator('[data-dsh-forge-switcher-trigger]').click()
      await page.locator('[data-dsh-forge-switcher-menu] [data-dsh-forge-switcher-item]', { hasText: nameB }).click()
      await expect(page.locator('[data-dsh-forge-switcher-trigger]')).toContainText(nameB, { timeout: 10_000 })
      await page.getByRole('tab', { name: /^任务$|^Tasks$/ }).click()
      await waitForTreeNodes(page, setB.facts.taskCount, 60_000)
      await page.locator(`[data-dsh-forge-node-card="${keyB.taskKey}"]`).click()
      await expect(page.locator(`[data-dsh-forge-task-detail="${keyB.taskKey}"]`)).toBeVisible({ timeout: 15_000 })
      await expect(page.locator(`[data-dsh-forge-detail-link="${sessionB}"] [data-dsh-forge-badge="link:active"]`)).toBeVisible({ timeout: 15_000 })

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
    expect(existsSync(root)).toBe(false)
  }
})

test('step-4/project-path-invalid [@web-e2e @journey multi-project-management]: a removed code root turns its card lost while the app, registry rows and the active project stay healthy', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)

  const setA = generateTaskSet({ seed: 'mpm4ia', taskCount: 10, featureCount: 2, danglingRate: 0, recordRate: 0 })
  const setB = generateTaskSet({ seed: 'mpm4ib', taskCount: 8, featureCount: 1, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-mpm4i-'))
  const projectA = writeForgeProject(setA, { codeRoot: join(root, 'proj-a-mpm4i') })
  const projectB = writeForgeProject(setB, { codeRoot: join(root, 'proj-b-mpm4i') })
  const nameA = 'proj-a-mpm4i'
  const nameB = 'proj-b-mpm4i'

  const session = createAppSessionFactory({
    bundles: journeyBundles(),
    stageTarballs: [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }],
    rootDir: join(root, 'shell'),
    userDataDir: join(root, 'user-data'),
  })

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      // Setup:B 先注册、A 后注册并激活 —— A 为当前激活,B 为路径失效受害者。
      const projectBId = await registerFixtureProject(page, projectB)
      const projectAId = await registerFixtureProject(page, projectA)
      expect((await readActive(page)).activeProjectId).toBe(projectAId)

      // 激活项目的数据面健康基线(「其余项目浏览不受影响」的非空洞前提)。
      await switchToWorkbench(page)
      await page.getByRole('tab', { name: /^任务$|^Tasks$/ }).click()
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-tasks"]')).toBeVisible()
      await waitForTreeNodes(page, setA.facts.taskCount, 60_000)

      // 路径失效注入(fixture 临时目录内删除,随 fixture 清理)。
      rmSync(projectB.codeRoot, { recursive: true, force: true })

      // B 卡片失联(FT-047 watch 链感知 → sync error → 失联徽标,sc5 同款)。
      // 注:概览失联卡([data-dsh-forge-overview-lost] + 重新指向)只随 ACTIVE
      // 项目渲染 —— 非激活失联项目的引导面 = 卡片失联徽标 + 行内动作仍在
      // (移除通道),按源码实状断言。
      await page.getByRole('tab', { name: /^概览$|^Overview$/ }).click()
      const cardB = page.locator('[data-dsh-forge-project-card]', { hasText: nameB }).first()
      await expect(cardB.locator('[data-dsh-forge-card-lost-badge]'), '失联/不可访问提示').toBeVisible({ timeout: 60_000 })
      await expect(cardB).toHaveAttribute('data-lost', 'true')
      await expect(cardB.locator('[data-dsh-forge-card-action="remove"]'), '移除引导通道仍在').toBeVisible()

      // 应用不崩溃 + 注册表行保留(不自动删除)。
      expect(shell.pageErrors, `失联后 renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
      const after = await readActive(page)
      expect(after.rows, '注册表行保留').toEqual([projectBId, projectAId].sort())
      expect(after.activeProjectId, '激活指针不受牵连').toBe(projectAId)

      // 切换器仍列出全部在册项目(浏览/切换通道不受影响),A 仍为当前。
      await page.locator('[data-dsh-forge-switcher-trigger]').click()
      await expect(page.locator('[data-dsh-forge-switcher-menu]')).toBeVisible()
      await expect(page.locator('[data-dsh-forge-switcher-menu] [data-dsh-forge-switcher-item]', { hasText: nameB })).toBeVisible()
      await expect(page.locator('[data-dsh-forge-switcher-trigger]')).toContainText(nameA)
      await page.keyboard.press('Escape')

      // A 的数据面照常(失联不波及其余项目浏览)。
      await page.getByRole('tab', { name: /^任务$|^Tasks$/ }).click()
      await waitForTreeNodes(page, setA.facts.taskCount, 60_000)

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
    expect(existsSync(root)).toBe(false)
  }
})
