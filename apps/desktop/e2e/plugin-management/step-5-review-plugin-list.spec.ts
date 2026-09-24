// @feature dsh-forge-m2 | @web-e2e | @journey plugin-management
// Traceability: docs/features/dsh-forge-m2/testing/plugin-management/contracts/step-5-review-plugin-list.md
//
// Step 5(启停后回看插件列表)的两条 Outcome 腿:
//   success — 禁用→启用序列后回看:列表仍两级呈现,层级与必备标识不因启停
//     改变;产品清单条目未被改写(sha256 前后对拍,journey 配置字节对拍;
//     FT-048 必备清单对运行时启停只读)。「升级/重装不冲突」面 family-unowned
//     (留安装/升级验收),本旅程不作断言。
//   core-capability-unaffected — 装置直供目标禁用态(fixture 预置覆盖文件含
//     目标名、不含对照名;contract 明示不要求由 step-3/4 序列派生)下依次使用
//     核心能力:任务看板(依赖树 + 状态分组视图)、任务详情(dock)、一键发起
//     会话入口(launch probe = available,需 stub CLI + channel stub +
//     DSH_FORGE_PROJECT_ROOTS allowlist);另一启用中的第三方(sample-b)注入
//     不受影响;forge 数据零损坏(项目树哈希对拍)。
// Divergence note(记录):contract Output 的「第三方扩展内容退出说明显示」的
// 观察面在已落地源码中未钉(eval 已记:插件行 hint vs 挂接区,后者需会话链装
// 置且无 landed 标记)—— 本腿断言已停用第三方行的 hint 行文案非空(最近的
// landed 呈现面:「第三方插件 · 禁用仅退出其注入内容」)。
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { HELLO_WORLD, PRODUCT_CONFIG, expectRosterContains, expectRosterLacks, sha256File } from '../helpers/plugins.ts'
import { registerFixtureProject, writeForgeProject } from '../fixtures/forge-project.ts'
import { generateTaskSet } from '../fixtures/task-generator.ts'
import { materializeStubCli } from '../fixtures/stubs/cli.ts'
import { createChannelStub } from '../fixtures/stubs/channel.ts'
import { cleanupViewKey, closeAndAwaitExit, createAppSessionFactory, switchToWorkbench, waitForTreeNodes } from '../tests/m2/helpers/restart-app.ts'
import { assertTreesIdentical, hashTree } from '../tests/m2/helpers/tree-hash.ts'
import { expectTwoTierSectionCensus, journeyBundles, journeyStageTarballs, writeOverlayFile } from './helpers.ts'

const SAMPLE_B = '@dsh-forge/plugin-hello-world-sample-b'

test('step-5/success [@web-e2e @journey plugin-management]: after a disable→enable cycle the list still renders two tiers and the product manifest bytes never moved', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)

  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-pm5-'))
  const userDataDir = join(root, 'user-data')
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
      const configBytesBefore = shell.configBytes()

      // 启停序列:禁用(双确认)→ 启用(直接动词)。
      const helloRow = page.locator(`[data-dsh-forge-plugin-row="${HELLO_WORLD}"]`)
      await helloRow.locator('[data-dsh-forge-plugin-action="disable"]').click()
      await page.locator('[data-dsh-forge-plugin-confirm]').click()
      await expect(helloRow).toHaveAttribute('data-enabled', 'false', { timeout: 15_000 })
      await helloRow.locator('[data-dsh-forge-plugin-action="enable"]').click()
      await expect(helloRow).toHaveAttribute('data-enabled', 'true', { timeout: 15_000 })
      await expectRosterContains(shell, HELLO_WORLD)

      // Input/Output:启停完成后回看 —— 两级呈现复位(全启用、徽标在、
      // 层级不变),无中间态残留(对照行同)。
      await expectTwoTierSectionCensus(page, [HELLO_WORLD, SAMPLE_B])

      // State/Side-effect:产品清单条目未被改写(跨面字节对拍)。
      expect(sha256File(PRODUCT_CONFIG), '产品清单 sha256 跨启停序列不变').toBe(productShaBefore)
      expect(shell.configBytes(), 'journey 配置字节跨启停序列不变').toBe(configBytesBefore)

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

test('step-5/core-capability-unaffected [@web-e2e @journey plugin-management]: with the target preset-disabled the board, detail dock and launch entry all work; the enabled comparison plugin stays in', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)

  const set = generateTaskSet({ seed: 'pm5cc', taskCount: 10, featureCount: 2, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-pm5cc-'))
  const project = writeForgeProject(set, { codeRoot: join(root, 'proj-pm5cc') })
  const userDataDir = join(root, 'user-data')
  const overlayPath = join(userDataDir, 'plugin-runtime.json')
  // 装置直供终态:目标禁用、对照启用(fixture 预置,contract 明示)。
  writeOverlayFile(overlayPath, { disabled: [HELLO_WORLD] })

  const stub = materializeStubCli(join(root, 'stub-cli'))
  const channel = createChannelStub(join(root, 'stub-channel'))
  stub.attachProject(project.codeRoot)
  const productShaBefore = sha256File(PRODUCT_CONFIG)

  const session = createAppSessionFactory({
    bundles: journeyBundles(),
    stageTarballs: journeyStageTarballs(),
    rootDir: join(root, 'shell'),
    userDataDir,
    cwd: stub.launchCwd,
    env: {
      ...stub.env,
      ...channel.env,
      DSH_FORGE_PROJECT_ROOTS: JSON.stringify([project.codeRoot]),
    },
  })

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      // 装置面:目标退出装配、对照与必备在位。
      await expectRosterLacks(shell, HELLO_WORLD)
      await expectRosterContains(shell, SAMPLE_B)

      const hashProject = hashTree(project.codeRoot)
      const projectId = await registerFixtureProject(page, project)
      expect(typeof projectId).toBe('string')

      // 核心能力 1:任务看板 —— 依赖树(视图 A)全量渲染。
      await switchToWorkbench(page)
      await page.getByRole('tab', { name: /^任务$|^Tasks$/ }).click()
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-tasks"]')).toBeVisible()
      await waitForTreeNodes(page, set.facts.taskCount, 60_000)
      // …… 状态分组视图可切换并渲染(7 列 board)。
      await page.locator('[data-dsh-forge-board-view="grouped"]').click()
      await expect(page.locator('[data-dsh-forge-status-board]'), '状态分组视图渲染').toBeVisible({ timeout: 15_000 })
      await page.locator('[data-dsh-forge-board-view="tree"]').click()
      await waitForTreeNodes(page, set.facts.taskCount, 60_000)

      // 核心能力 2:任务详情可读(6.1:M2 发起会话入口随 ForgeBridge 退役;
      // 派发执行面归 UF1/SC3 腿)。
      const feature1 = set.features[0]
      const task1 = feature1?.tasks[0]
      if (feature1 === undefined || task1 === undefined) throw new Error('fixture set missing tasks')
      const taskKey = `${feature1.slug}/${task1.localId}`
      await page.locator(`[data-dsh-forge-node-card="${taskKey}"]`).click()
      await expect(page.locator(`[data-dsh-forge-task-detail="${taskKey}"]`), '任务详情可读').toBeVisible({ timeout: 15_000 })

      // 插件面:已停用目标行的退出说明 hint(最近 landed 面,见头注)非空;
      // 对照第三方行启用不受影响。
      await page.getByRole('tab', { name: /^概览$|^Overview$/ }).click()
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()
      const helloRow = page.locator(`[data-dsh-forge-plugin-row="${HELLO_WORLD}"]`)
      await expect(helloRow).toHaveAttribute('data-enabled', 'false', { timeout: 30_000 })
      await expect(helloRow.locator('p').last(), '第三方行 hint(禁用仅退出其注入内容)非空').not.toHaveText('')
      await expect(page.locator(`[data-dsh-forge-plugin-row="${SAMPLE_B}"]`), '另一启用中的第三方不受影响').toHaveAttribute('data-enabled', 'true')

      // 跨面:forge 数据零损坏 + 清单字节不变(测试进程直读对拍)。
      assertTreesIdentical('project tree across core-capability usage', hashProject, hashTree(project.codeRoot))
      expect(sha256File(PRODUCT_CONFIG), '产品清单 sha256 不变').toBe(productShaBefore)

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
