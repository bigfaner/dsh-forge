// @feature dsh-forge-m2 | @web-e2e | @journey plugin-management
// Traceability: docs/features/dsh-forge-m2/testing/plugin-management/contracts/step-4-re-enable.md
//
// Step 4(重新启用)的两条 Outcome 腿:
//   success — 禁用态行点「启用」(直接动词,无确认)→ 行回启用态、注入内容
//     恢复(roster 回含该插件);覆盖文件 disabled 集移出目标名;数据完整
//     (项目树哈希 + 产品清单 sha256 + journey 配置字节对拍)。
//   restart-persistence — 目标禁用 + 对照启用的装置直接重启(同 factory:同
//     config root + 同 userData;每次启动前单实例探测,进程退出 + 锁释放后
//     再启,FT-006 教训):行仍已停用、roster 缺目标含对照、必备全在位、
//     覆盖文件跨靴持久,核心看板照常渲染(注册项目随 userData 持久)。
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  HELLO_WORLD, PRODUCT_CONFIG, expectRosterContains, expectRosterLacks, sha256File,
} from '../helpers/plugins.ts'
import { registerFixtureProject, writeForgeProject } from '../fixtures/forge-project.ts'
import { generateTaskSet } from '../fixtures/task-generator.ts'
import { cleanupViewKey, closeAndAwaitExit, createAppSessionFactory, openTasksBoard, switchToWorkbench } from '../tests/m2/helpers/restart-app.ts'
import { assertTreesIdentical, hashTree } from '../tests/m2/helpers/tree-hash.ts'
import { MANDATORY_NAMES, journeyBundles, journeyStageTarballs, readOverlay } from './helpers.ts'

const SAMPLE_B = '@dsh-forge/plugin-hello-world-sample-b'

test('step-4/success [@web-e2e @journey plugin-management]: enable restores the row and the injection, overlay clears the target, data intact', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)

  const set = generateTaskSet({ seed: 'pm4ok', taskCount: 6, featureCount: 1, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-pm4-'))
  const project = writeForgeProject(set, { codeRoot: join(root, 'proj-pm4') })
  const userDataDir = join(root, 'user-data')
  const overlayPath = join(userDataDir, 'plugin-runtime.json')

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
      const productShaBefore = sha256File(PRODUCT_CONFIG)
      const configBytesBefore = shell.configBytes()
      const hashProject = hashTree(project.codeRoot)

      // 前置:先经用户面禁用(首个启停亦创建覆盖文件 —— step-3 腿持有该面)。
      await switchToWorkbench(page)
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()
      const helloRow = page.locator(`[data-dsh-forge-plugin-row="${HELLO_WORLD}"]`)
      await helloRow.locator('[data-dsh-forge-plugin-action="disable"]').click()
      await page.locator('[data-dsh-forge-plugin-confirm]').click()
      await expect(helloRow).toHaveAttribute('data-enabled', 'false', { timeout: 15_000 })
      expect(readOverlay(overlayPath)).toEqual({ disabled: [HELLO_WORLD] })
      await expectRosterLacks(shell, HELLO_WORLD)

      // Input:对已停用行点「启用」(直接动词,无确认)。
      await helloRow.locator('[data-dsh-forge-plugin-action="enable"]').click()

      // Output:行回启用态 + 注入内容恢复(roster)+ 覆盖文件清空目标名。
      await expect(helloRow).toHaveAttribute('data-enabled', 'true', { timeout: 15_000 })
      await expectRosterContains(shell, HELLO_WORLD)
      expect(readOverlay(overlayPath), '目标名移出 disabled 集').toEqual({ disabled: [] })
      await expect(page.locator(`[data-dsh-forge-plugin-row="${SAMPLE_B}"]`), '对照第三方不受牵连').toHaveAttribute('data-enabled', 'true')

      // 跨面:数据完整(哈希/字节对拍,不以「没报错」为据)。
      assertTreesIdentical('project tree across the toggle cycle', hashProject, hashTree(project.codeRoot))
      expect(sha256File(PRODUCT_CONFIG), '产品清单 sha256 不变').toBe(productShaBefore)
      expect(shell.configBytes(), 'journey 配置字节不变').toBe(configBytesBefore)

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

test('step-4/restart-persistence [@web-e2e @journey plugin-management]: the disabled state survives a restart — roster, overlay and the core board all persist', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)

  const set = generateTaskSet({ seed: 'pm4rb', taskCount: 8, featureCount: 2, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-pm4rb-'))
  const project = writeForgeProject(set, { codeRoot: join(root, 'proj-pm4rb') })
  const userDataDir = join(root, 'user-data')
  const overlayPath = join(userDataDir, 'plugin-runtime.json')

  const session = createAppSessionFactory({
    bundles: journeyBundles(),
    stageTarballs: journeyStageTarballs(),
    rootDir: join(root, 'shell'),
    userDataDir,
  })

  try {
    // ---- 靴 1:注册项目(持久于 userData)+ 禁用目标(对照保持启用)------
    {
      const shell = await session.boot()
      try {
        const { page } = shell
        await registerFixtureProject(page, project)
        await switchToWorkbench(page)
        await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()
        const helloRow = page.locator(`[data-dsh-forge-plugin-row="${HELLO_WORLD}"]`)
        await helloRow.locator('[data-dsh-forge-plugin-action="disable"]').click()
        await page.locator('[data-dsh-forge-plugin-confirm]').click()
        await expect(helloRow).toHaveAttribute('data-enabled', 'false', { timeout: 15_000 })
        expect(readOverlay(overlayPath), '重启前装置:恰含目标名').toEqual({ disabled: [HELLO_WORLD] })
        expect(shell.pageErrors, `靴1 renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
      } finally {
        await cleanupViewKey(shell.page)
        await closeAndAwaitExit(shell)
      }
    }

    // ---- 靴 2:重启(同 factory;boot 内建单实例探测)----------------------
    {
      const shell = await session.boot()
      try {
        const { page } = shell
        // 该插件禁用状态保持:行仍已停用、注入内容仍退出(roster)。
        const helloRow = page.locator(`[data-dsh-forge-plugin-row="${HELLO_WORLD}"]`)
        await expectRosterLacks(shell, HELLO_WORLD)
        await expectRosterContains(shell, SAMPLE_B)
        // 对照第三方不受牵连 + forge 核心必备仍以必备身份在位。
        for (const name of MANDATORY_NAMES) await expectRosterContains(shell, name)

        // 核心能力:已注册项目看板照常(注册随 userData 跨靴持久)。
        await openTasksBoard(page, set.facts.taskCount)

        await page.getByRole('tab', { name: /^概览$|^Overview$/ }).click()
        await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()
        await expect(helloRow, '禁用态跨靴持久(行呈现已停用)').toHaveAttribute('data-enabled', 'false', { timeout: 30_000 })
        await expect(page.locator(`[data-dsh-forge-plugin-row="${SAMPLE_B}"]`), '对照行启用态不受牵连').toHaveAttribute('data-enabled', 'true')
        for (const name of MANDATORY_NAMES) {
          const row = page.locator(`[data-dsh-forge-plugin-row="${name}"]`)
          await expect(row).toBeVisible({ timeout: 30_000 })
          await expect(row).toHaveAttribute('data-tier', 'mandatory')
          await expect(row, '核心插件必备身份在位').toHaveAttribute('data-enabled', 'true')
        }
        // State:覆盖文件跨启动持久(userData 内)。
        expect(readOverlay(overlayPath), 'overlay 持久').toEqual({ disabled: [HELLO_WORLD] })
        expect(shell.pageErrors, `靴2 renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
      } finally {
        await cleanupViewKey(shell.page)
        await closeAndAwaitExit(shell)
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
    expect(existsSync(root)).toBe(false)
  }
})
