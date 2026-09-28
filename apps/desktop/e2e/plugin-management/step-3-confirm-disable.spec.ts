// @feature dsh-forge-m2 | @web-e2e | @journey plugin-management
// Traceability: docs/features/dsh-forge-m2/testing/plugin-management/contracts/step-3-confirm-disable.md
//
// Step 3(确认禁用)的四条 Outcome 腿:
//   success — 确认 → 行转已停用(状态 + 「启用」动作);另一第三方(对照
//     sample-b)不受影响;任务看板/挂接等核心能力不受影响;forge 数据零损坏
//     (项目目录树哈希前后对拍 + 产品清单 sha256 + journey 配置字节);
//     覆盖文件恰含目标第三方名(FT-048:结构上仅容第三方名)。
//   double-click-guard — 启停执行窗口(transitioning)不可确定性把持(写入
//     快,实装 pendingName 单飞守卫在毫秒级窗口内;UF6 transitioning 态语义
//     已在 UI 层落地)。按不变量编码:确认后对(已转为「启用」的)动作快速
//     连点,终态收敛为单次操作结果,覆盖文件中该名的 disabled 占位恒 ≤1、
//     无中间损坏态。transitioning 窗口不可把持已记录为任务注记。
//   cancel-no-op — 对话框取消:零状态变化,覆盖文件字节与预置完全一致
//     (装置钉死存在性:预置 {disabled:[]} 为对拍基线)。
//   first-write-creates-overlay — 全新 userData(无覆盖文件 = 空覆盖 = 全启用,
//     FT-048)首次禁用 → 文件由无到有,内容恰为只含该插件名的 disabled 集;
//     产品清单字节不变。
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { HELLO_WORLD, PRODUCT_CONFIG, sha256File } from '../helpers/plugins.ts'
import { registerFixtureProject, writeForgeProject } from '../fixtures/forge-project.ts'
import { generateTaskSet } from '../fixtures/task-generator.ts'
import { cleanupViewKey, closeAndAwaitExit, createAppSessionFactory, switchToWorkbench, waitForTreeNodes } from '../tests/m2/helpers/restart-app.ts'
import { assertTreesIdentical, hashTree } from '../tests/m2/helpers/tree-hash.ts'
import { expectTwoTierSectionCensus, journeyBundles, journeyStageTarballs, readOverlay, writeOverlayFile } from './helpers.ts'

const SAMPLE_B = '@dsh-forge/plugin-hello-world-sample-b'

// [M4 1.8 e2e 迁移·迁移清单 第②行 · M2 看板(workbench/tasks 主视图)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
// P2 右栏 pane / 概览子 tab(2.1–2.4)落座后按新宿主恢复,2.10 全量复跑收口。
// 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。
test.fixme('step-3/success [@web-e2e @journey plugin-management]: confirm disables only the target — overlay exactly {disabled:[target]}, comparison row intact, forge data zero-damage', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)

  const set = generateTaskSet({ seed: 'pm3ok', taskCount: 8, featureCount: 1, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-pm3-'))
  const project = writeForgeProject(set, { codeRoot: join(root, 'proj-pm3') })
  const userDataDir = join(root, 'user-data')
  const overlayPath = join(userDataDir, 'plugin-runtime.json')
  // 常规装置:plugin-runtime.json 预置存在,disabled 不含目标与对照第三方名。
  writeOverlayFile(overlayPath, { disabled: [] })

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
      const projectId = await registerFixtureProject(page, project)
      expect(typeof projectId).toBe('string')
      const productShaBefore = sha256File(PRODUCT_CONFIG)
      const configBytesBefore = shell.configBytes()
      const hashProject = hashTree(project.codeRoot)

      await switchToWorkbench(page)
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()
      await expectTwoTierSectionCensus(page, [HELLO_WORLD, SAMPLE_B])

      // 确认禁用。
      const helloRow = page.locator(`[data-dsh-forge-plugin-row="${HELLO_WORLD}"]`)
      await helloRow.locator('[data-dsh-forge-plugin-action="disable"]').click()
      await expect(page.locator('[data-dsh-forge-plugin-confirm]')).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-dsh-forge-plugin-confirm]').click()

      // Output:行转已停用态(状态 + 「启用」动作);对照第三方不受影响。
      await expect(helloRow).toHaveAttribute('data-enabled', 'false', { timeout: 15_000 })
      await expect(helloRow.locator('[data-dsh-forge-plugin-action="enable"]')).toBeVisible()
      await expect(page.locator(`[data-dsh-forge-plugin-row="${SAMPLE_B}"]`), '对照第三方行不受影响').toHaveAttribute('data-enabled', 'true')

      // State:覆盖文件恰含目标插件名;清单态与行态刷新(清单只读口径)。
      expect(readOverlay(overlayPath), '禁用写且仅写覆盖文件(恰含目标名)').toEqual({ disabled: [HELLO_WORLD] })

      // 核心能力不受影响:任务看板照常渲染。
      await page.getByRole('tab', { name: /^任务$|^Tasks$/ }).click()
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-tasks"]')).toBeVisible()
      await waitForTreeNodes(page, set.facts.taskCount, 60_000)

      // 跨面:forge 数据零损坏 + 产品清单/journey 配置字节不变。
      assertTreesIdentical('project tree across disable', hashProject, hashTree(project.codeRoot))
      expect(sha256File(PRODUCT_CONFIG), '产品清单 sha256 不变').toBe(productShaBefore)
      expect(shell.configBytes(), 'journey 配置字节不变').toBe(configBytesBefore)

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

test('step-3/double-click-guard [@web-e2e @journey plugin-management]: rapid repeat clicks on the transitioning action converge to the single-op final state with no intermediate corruption', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)

  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-pm3dc-'))
  const userDataDir = join(root, 'user-data')
  const overlayPath = join(userDataDir, 'plugin-runtime.json')
  writeOverlayFile(overlayPath, { disabled: [] })

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
      await switchToWorkbench(page)
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()

      // 前置:确认一次禁用(写入快;transitioning 窗口不可确定性把持 —— 见
      // 头注,窗口期断言收敛为终态不变量)。
      const helloRow = page.locator(`[data-dsh-forge-plugin-row="${HELLO_WORLD}"]`)
      await helloRow.locator('[data-dsh-forge-plugin-action="disable"]').click()
      await page.locator('[data-dsh-forge-plugin-confirm]').click()
      await expect(helloRow).toHaveAttribute('data-enabled', 'false', { timeout: 15_000 })
      expect(readOverlay(overlayPath)).toEqual({ disabled: [HELLO_WORLD] })

      // 在(现为「启用」的)动作上快速连点两次 —— 不等待任何中间态。
      const enable = helloRow.locator('[data-dsh-forge-plugin-action="enable"]')
      await enable.click()
      await enable.click()

      // 不变量:终态收敛为单次操作结果;disabled 集对该名的占位恒 ≤1
      // (无重复写/中间损坏态 —— pendingName 单飞守卫吞掉窗口期重复点击)。
      await expect(helloRow, '终态 = 单次启用结果').toHaveAttribute('data-enabled', 'true', { timeout: 15_000 })
      const settled = readOverlay(overlayPath)
      expect(settled, '终态覆盖文件为空集').toEqual({ disabled: [] })
      const occurrences = (settled?.disabled ?? []).filter(name => name === HELLO_WORLD).length
      expect(occurrences, '该名在 disabled 集的占位 ≤1(无中间损坏)').toBeLessThanOrEqual(1)

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

test('step-3/cancel-no-op [@web-e2e @journey plugin-management]: cancelling the confirm dialog changes nothing — row stays enabled, overlay bytes exactly the preset', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)

  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-pm3cx-'))
  const userDataDir = join(root, 'user-data')
  const overlayPath = join(userDataDir, 'plugin-runtime.json')
  // 取消腿装置:覆盖文件预置存在且 disabled 不含目标/对照 —— 字节级对拍基线。
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
      await switchToWorkbench(page)
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()

      const helloRow = page.locator(`[data-dsh-forge-plugin-row="${HELLO_WORLD}"]`)
      await helloRow.locator('[data-dsh-forge-plugin-action="disable"]').click()
      await expect(page.locator('[data-dsh-forge-plugin-confirm]')).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-dsh-forge-plugin-cancel]').click()
      await expect(page.locator('[data-dsh-forge-plugin-confirm]'), '对话框关闭').toHaveCount(0)

      // Output:无任何状态变化 —— 行仍启用、注入内容保持在线(对照行同)。
      await expect(helloRow, '该插件仍启用').toHaveAttribute('data-enabled', 'true')
      await expect(page.locator(`[data-dsh-forge-plugin-row="${SAMPLE_B}"]`)).toHaveAttribute('data-enabled', 'true')
      // State:覆盖文件未被写入(字节与预置一致,不以「没报错」为据)。
      expect(readFileSync(overlayPath, 'utf8'), '覆盖文件字节与预置完全一致').toBe(presetBytes)

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

test('step-3/first-write-creates-overlay [@web-e2e @journey plugin-management]: the first disable on a fresh userData creates plugin-runtime.json with exactly {disabled:[target]}', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)

  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-pm3fw-'))
  const userDataDir = join(root, 'user-data')
  const overlayPath = join(userDataDir, 'plugin-runtime.json')
  const productShaBefore = sha256File(PRODUCT_CONFIG)

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
      await switchToWorkbench(page)
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()

      // 装置钉死:全新 userData 尚无覆盖文件(缺失 = 空覆盖 = 全启用,FT-048)。
      expect(existsSync(overlayPath), '首次启停前覆盖文件不存在').toBe(false)
      await expectTwoTierSectionCensus(page, [HELLO_WORLD, SAMPLE_B])

      const helloRow = page.locator(`[data-dsh-forge-plugin-row="${HELLO_WORLD}"]`)
      await helloRow.locator('[data-dsh-forge-plugin-action="disable"]').click()
      await page.locator('[data-dsh-forge-plugin-confirm]').click()
      await expect(helloRow, '禁用生效(行转已停用)').toHaveAttribute('data-enabled', 'false', { timeout: 15_000 })

      // State:覆盖文件由无到有,disabled 集恰含目标插件名(单一写路径)。
      expect(existsSync(overlayPath), '覆盖文件被创建').toBe(true)
      expect(readOverlay(overlayPath), '内容恰为只含该插件名的 disabled 集').toEqual({ disabled: [HELLO_WORLD] })
      expect(sha256File(PRODUCT_CONFIG), '产品清单字节不变').toBe(productShaBefore)

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
