// @feature dsh-forge-m2 | @web-e2e | @journey plugin-management
// Traceability: docs/features/dsh-forge-m2/testing/plugin-management/contracts/step-2-initiate-disable.md
//
// Step 2(发起禁用第三方插件)的两条 Outcome 腿:
//   success(常规启停)— 对 hello-world 点「禁用」→ 二次确认对话框打开,影响
//     说明在(仅该插件注入内容退出;forge 数据与工作台核心能力不受影响);
//     发起阶段零写入(对话框打开时覆盖文件字节不变,装置预置 {disabled:[]}).
//   in-session-disable — 经桥接 recordSessionLink 铺 active 挂接(FT-035:挂接
//     索引为工作台自有 SoT;会话链装置的 fixture 直排通道)后禁用 + 确认:仅该
//     插件名入 disabled 集,任务挂接行仍 active(会话本体不中断的可观察代理),
//     看板照常渲染。
// Divergence note(记录,不伪编码):contract Output 的「挂接区显示第三方扩展
// 内容退出说明(third-party-disabled 态)」在已落地源码中无对应标记
// (PluginSection/TaskDetailPanel/LinkHistory grep 无 third-party-disabled 呈现
// 面)—— 本腿断言挂接行/看板的存续面,退出说明面记录为任务注记。
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { HELLO_WORLD } from '../helpers/plugins.ts'
import { registerFixtureProject, writeForgeProject } from '../fixtures/forge-project.ts'
import { generateTaskSet } from '../fixtures/task-generator.ts'
import { cleanupViewKey, closeAndAwaitExit, createAppSessionFactory, switchToWorkbench, waitForTreeNodes } from '../tests/m2/helpers/restart-app.ts'
import { expectTwoTierSectionCensus, journeyBundles, journeyStageTarballs, readOverlay, writeOverlayFile } from './helpers.ts'

const SAMPLE_B = '@dsh-forge/plugin-hello-world-sample-b'

/** The sanctioned fixture channel for 挂接行(FT-035:SoT = 工作台自有库)。 */
async function bridgeRecordSessionLink(page: Page, input: { projectId: string; taskKey: string; sessionId: string }): Promise<void> {
  await page.evaluate(async (args: { projectId: string; taskKey: string; sessionId: string }) => {
    type Bridge = { recordSessionLink?: (row: { projectId: string; taskKey: string; sessionId: string }) => Promise<unknown> }
    const bridge = (globalThis as { dshForge?: { workbench?: Bridge } }).dshForge?.workbench
    if (bridge?.recordSessionLink === undefined) throw new Error('dshForge.workbench bridge is unavailable in the e2e renderer')
    await bridge.recordSessionLink(args)
  }, input)
}

test('step-2/success [@web-e2e @journey plugin-management]: disable click opens the double-confirm with impact copy — the overlay is not yet written', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)

  const set = generateTaskSet({ seed: 'pm2ok', taskCount: 6, featureCount: 1, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-pm2-'))
  const project = writeForgeProject(set, { codeRoot: join(root, 'proj-pm2') })
  const userDataDir = join(root, 'user-data')
  const overlayPath = join(userDataDir, 'plugin-runtime.json')
  // 常规装置:覆盖文件预置存在,disabled 集不含目标与对照第三方名。
  const presetBytes = writeOverlayFile(overlayPath, { disabled: [] })

  const session = createAppSessionFactory({
    bundles: journeyBundles(),
    stageTarballs: journeyStageTarballs(),
    rootDir: join(root, 'shell'),
    userDataDir,
  })

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      await registerFixtureProject(page, project)
      await switchToWorkbench(page)
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()
      await expectTwoTierSectionCensus(page, [HELLO_WORLD, SAMPLE_B])

      // Input:对第三方插件点击「禁用」。
      const helloRow = page.locator(`[data-dsh-forge-plugin-row="${HELLO_WORLD}"]`)
      await helloRow.locator('[data-dsh-forge-plugin-action="disable"]').click()

      // Output:二次确认打开,说明影响(对话框的存在意义)。
      const confirm = page.locator('[data-dsh-forge-plugin-confirm]')
      await expect(confirm, '双确认对话框打开').toBeVisible({ timeout: 10_000 })
      const impact = page.locator('[data-dsh-forge-plugin-impact]')
      await expect(impact, '影响说明在(仅该插件注入内容退出/核心不受影响)').toBeVisible()
      await expect(impact).toContainText('注入内容')

      // State:启停尚未执行 —— 覆盖文件字节不变 + 行态不乐观翻转。
      expect(readFileSync(overlayPath, 'utf8'), '对话框打开时覆盖文件未被写入').toBe(presetBytes)
      await expect(helloRow, '行仍启用(未乐观翻转)').toHaveAttribute('data-enabled', 'true')

      // 关闭对话框离开(取消路径的零副作用在 step-3 持有)。
      await page.locator('[data-dsh-forge-plugin-cancel]').click()
      await expect(confirm).toHaveCount(0)

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    expect(existsSync(root)).toBe(false)
  }
})

// [M4 1.8 e2e 迁移·迁移清单 第②行 · M2 看板(workbench/tasks 主视图)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
// P2 右栏 pane / 概览子 tab(2.1–2.4)落座后按新宿主恢复,2.10 全量复跑收口。
// 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。
test.fixme('step-2/in-session-disable [@web-e2e @journey plugin-management]: disabling while a recorded session link is active retires only the plugin — the link row and board survive', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)

  const set = generateTaskSet({ seed: 'pm2in', taskCount: 8, featureCount: 2, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-pm2in-'))
  const project = writeForgeProject(set, { codeRoot: join(root, 'proj-pm2in') })
  const userDataDir = join(root, 'user-data')
  const overlayPath = join(userDataDir, 'plugin-runtime.json')
  writeOverlayFile(overlayPath, { disabled: [] })
  const feature1 = set.features[0]
  const task1 = feature1?.tasks[0]
  const task2 = feature1?.tasks[1]
  if (feature1 === undefined || task1 === undefined || task2 === undefined) throw new Error('fixture set needs two tasks in feature 1')

  const session = createAppSessionFactory({
    bundles: journeyBundles(),
    stageTarballs: journeyStageTarballs(),
    rootDir: join(root, 'shell'),
    userDataDir,
  })

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      // 装置:active 挂接(fixture 直排 session_links;FT-035)+ 健康看板。
      const projectId = await registerFixtureProject(page, project)
      await bridgeRecordSessionLink(page, {
        projectId,
        taskKey: `${feature1.slug}/${task1.localId}`,
        sessionId: 'session-pm2-in-0001',
      })

      // 会话在线使用面:看板 + 任务 dock 内该挂接行 active。
      await switchToWorkbench(page)
      await page.getByRole('tab', { name: /^任务$|^Tasks$/ }).click()
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-tasks"]')).toBeVisible()
      await waitForTreeNodes(page, set.facts.taskCount, 60_000)
      const taskKey1 = `${feature1.slug}/${task1.localId}`
      await page.locator(`[data-dsh-forge-node-card="${taskKey1}"]`).click()
      const dock = page.locator(`[data-dsh-forge-task-detail="${taskKey1}"]`)
      await expect(dock).toBeVisible({ timeout: 15_000 })
      const linkRow = page.locator('[data-dsh-forge-detail-link="session-pm2-in-0001"]')
      await expect(linkRow, '挂接行在(在线使用态)').toBeVisible({ timeout: 15_000 })
      await expect(linkRow.locator('[data-dsh-forge-badge="link:active"]')).toBeVisible()

      // Input:此在线使用状态下发起禁用并确认。
      await page.getByRole('tab', { name: /^概览$|^Overview$/ }).click()
      const helloRow = page.locator(`[data-dsh-forge-plugin-row="${HELLO_WORLD}"]`)
      await helloRow.locator('[data-dsh-forge-plugin-action="disable"]').click()
      await expect(page.locator('[data-dsh-forge-plugin-confirm]')).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('[data-dsh-forge-plugin-impact]'), '二次确认明确提示影响').toContainText('不受影响')
      await page.locator('[data-dsh-forge-plugin-confirm]').click()

      // Output/State:仅该插件名入 disabled 集;会话本体与挂接关系保持。
      await expect(helloRow).toHaveAttribute('data-enabled', 'false', { timeout: 15_000 })
      expect(readOverlay(overlayPath), '覆盖文件恰含目标第三方名').toEqual({ disabled: [HELLO_WORLD] })
      // 看板仍渲染 + 挂接关系保持(存续面;退出说明面未落地 —— 见头注
      // divergence note)。工作台 tab 往返会重挂视图、dock 选择不复原 ——
      // 契约面是「会话本体与挂接关系保持」:重开 dock 断言挂接行仍 active。
      await page.getByRole('tab', { name: /^任务$|^Tasks$/ }).click()
      await waitForTreeNodes(page, set.facts.taskCount, 60_000)
      await page.locator(`[data-dsh-forge-node-card="${taskKey1}"]`).click()
      await expect(dock, '任务 dock 可再开(会话使用面存续)').toBeVisible({ timeout: 15_000 })
      await expect(linkRow.locator('[data-dsh-forge-badge="link:active"]'), '挂接行仍 active(会话本体不中断代理)').toBeVisible({ timeout: 15_000 })
      // 换任务再切回 → 全新 getTaskDetail 读数同样保留挂接行。
      await page.locator(`[data-dsh-forge-node-card="${feature1.slug}/${task2.localId}"]`).click()
      await expect(page.locator(`[data-dsh-forge-task-detail="${feature1.slug}/${task2.localId}"]`)).toBeVisible({ timeout: 15_000 })
      await page.locator(`[data-dsh-forge-node-card="${taskKey1}"]`).click()
      await expect(page.locator('[data-dsh-forge-detail-link="session-pm2-in-0001"] [data-dsh-forge-badge="link:active"]'))
        .toBeVisible({ timeout: 15_000 })
      // 对照:另一第三方不受影响(「仅该插件」收敛)— 插件行在概览页。
      await page.getByRole('tab', { name: /^概览$|^Overview$/ }).click()
      await expect(page.locator(`[data-dsh-forge-plugin-row="${SAMPLE_B}"]`)).toHaveAttribute('data-enabled', 'true')

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    expect(existsSync(root)).toBe(false)
  }
})
