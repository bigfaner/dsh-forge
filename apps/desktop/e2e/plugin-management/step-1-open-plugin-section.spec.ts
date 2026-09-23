// @feature dsh-forge-m2 | @web-e2e | @journey plugin-management
// Traceability: docs/features/dsh-forge-m2/testing/plugin-management/contracts/step-1-open-plugin-section.md
//
// Step 1(打开插件管理区)的四条 Outcome 腿。插件装置 = 测试 profile 清单变体
// (contract state_requirements:插件行集唯一来源 = 清单文件,listPlugins 行集 =
// manifest.map,FT-048):产品 3 必备 + 2 第三方样例(hello-world + 重打包
// sample-b 克隆,见 ./helpers.ts)。跨面断言口径:文件面(产品清单 sha256、
// 覆盖文件字节、profile 清单)由测试进程直读;浏览器侧只读 roster/页面。
//
//   mandatory-no-disable — 浏览器面(渲染层)腿:必备行零可写控件(不渲染,
//     非 rendered-disabled)。纵深第二层(IPC 守卫拒绝对必备名的启停写请求,
//     ERR_PLUGIN_MANDATORY,FT-049)由 sc6 验收,本腿不重复。
//   overlay-invalid — 两型预置:①塞必备名(schema 合法)→ 违规条目内存剔除
//     (精确清洗:同文件第三方名仍生效)+ 覆盖文件字节不变;②坏 JSON → 隔离
//     .corrupt-* + 空 overlay 原位重建(FT-050)。两型均启动不阻断、插件区
//     按清单态呈现两级行。
//   load-error-retry — 记录为不可达(SKIPPED-infeasible):listPlugins 首载拒绝
//     无确定性注入通道(动词只读清单+覆盖文件;清单缺失即启动全断,覆盖文件
//     任意形态都拦不住 listPlugins 成功)。需要主进程侧注入口(如动词失败
//     seam),已记录为任务注记;本测试同时承载最近的可观察面(健康启动下
//     section 的 skeleton→ready 路径)作为若解除 skip 即生效的代理断言。
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  HELLO_WORLD, PRODUCT_CONFIG, expectRosterContains, expectRosterLacks, readProfileBundles, sha256File,
} from '../helpers/plugins.ts'
import {
  MANDATORY_NAMES, PROFILE_ALL, expectTwoTierSectionCensus, journeyBundles, journeyStageTarballs,
  readOverlay, rowControlCensus, writeOverlayFile,
} from './helpers.ts'
import { cleanupViewKey, closeAndAwaitExit, createAppSessionFactory, switchToWorkbench } from '../tests/m2/helpers/restart-app.ts'

test('step-1/success [@web-e2e @journey plugin-management]: the section renders the two-tier census — 3 mandatory (badge, status-only) + 2 enabled third-party rows', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)

  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-pm1-'))
  const session = createAppSessionFactory({
    bundles: journeyBundles(),
    stageTarballs: journeyStageTarballs(),
    rootDir: join(root, 'shell'),
    userDataDir: join(root, 'user-data'),
  })

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      // 插件区与项目注册无关(OverviewPage:every ready branch renders it)——
      // 无注册项目直接进概览即可打开插件管理区。
      await switchToWorkbench(page)
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()

      // Output:两级呈现 —— 必备 = 「必备」徽标 + 仅状态展示(零禁用入口);
      // 第三方 = 启用状态 + 「禁用」动作恰一个。
      await expectTwoTierSectionCensus(page, [HELLO_WORLD, '@dsh-forge/plugin-hello-world-sample-b'])

      // 装置面自证(也验证 sample-b 克隆配方):两第三方注入共存,零 pageerror。
      for (const name of MANDATORY_NAMES) await expectRosterContains(shell, name)
      await expectRosterContains(shell, HELLO_WORLD)
      await expectRosterContains(shell, '@dsh-forge/plugin-hello-world-sample-b')
      expect(readProfileBundles(shell.profileDir), 'profile 清单 = 测试 profile 全量(5 项)').toEqual([...PROFILE_ALL])

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

test('step-1/mandatory-no-disable [@web-e2e @journey plugin-management]: mandatory rows render zero disable affordances — no browser-face write channel exists', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)

  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-pm1m-'))
  const session = createAppSessionFactory({
    bundles: journeyBundles(),
    stageTarballs: journeyStageTarballs(),
    rootDir: join(root, 'shell'),
    userDataDir: join(root, 'user-data'),
  })

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      await switchToWorkbench(page)
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()

      // 渲染面:必备行不渲染禁用入口(逐行可写控件家族普查 = 0)。
      for (const name of MANDATORY_NAMES) {
        const row = page.locator(`[data-dsh-forge-plugin-row="${name}"]`)
        await expect(row, `row of ${name}`).toBeVisible({ timeout: 30_000 })
        await expect(row).toHaveAttribute('data-tier', 'mandatory')
        await expect(row.locator('[data-dsh-forge-plugin-mandatory-badge]')).toBeVisible()
        const census = await rowControlCensus(page, name)
        expect(census.writable, `${name} 行零可写控件(不渲染,非 rendered-disabled)`).toBe(0)
        expect(census.actions, `${name} 行零启停动作`).toBe(0)
      }
      // 渲染面不存在禁用 forge 核心插件的通道:页面上所有启停动作都挂在
      // third-party 行(对照:两级分化真实渲染)。
      const allActions = await page.evaluate(() => document.querySelectorAll(
        '[data-dsh-forge-plugins-section] [data-dsh-forge-plugin-action]',
      ).length)
      expect(allActions, '全 section 启停动作数 = 第三方行数(2),必备行无通道').toBe(2)

      // 纵深第二层(ERR_PLUGIN_MANDATORY 守卫拒绝)属 sc6 验收面,此处不重复。
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

test('step-1/overlay-invalid [@web-e2e @journey plugin-management]: preset mandatory-stuffed and corrupt-JSON overlays never block startup — manifest state wins, exact cleansing', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)

  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-pm1o-'))
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
    // ---- ①塞必备名:schema 合法,disabled 同时含三必备名 + hello-world ----
    const stuffedBytes = writeOverlayFile(overlayPath, { disabled: [...MANDATORY_NAMES, HELLO_WORLD] })
    {
      const shell = await session.boot()
      try {
        const { page } = shell
        // 启动不阻断;清单态赢:必备全载,hello-world 被-held-out,违规条目
        // 仅内存剔除 → 同文件里的第三方名仍生效(sample-b 仍装配 —— 精确清洗)。
        for (const name of MANDATORY_NAMES) await expectRosterContains(shell, name)
        await expectRosterLacks(shell, HELLO_WORLD)
        await expectRosterContains(shell, '@dsh-forge/plugin-hello-world-sample-b')

        // 插件区按清单态呈现:两级行齐、必备全启用带徽标;hello-world 行
        // 呈已停用(其 disabled 条目合法)、sample-b 行启用不受违规内容影响。
        await switchToWorkbench(page)
        await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()
        await expectTwoTierSectionCensus(page, ['@dsh-forge/plugin-hello-world-sample-b'])
        await expect(page.locator('[data-dsh-forge-plugins-error]'), '不呈现残缺/错误列表').toHaveCount(0)

        // 覆盖文件字节不变(违规路径不重写文件)+ 产品清单只读。
        expect(readFileSync(overlayPath, 'utf8'), '① 塞必备名:覆盖文件未被重写').toBe(stuffedBytes)
        expect(sha256File(PRODUCT_CONFIG), '① 产品清单字节不变').toBe(productShaBefore)
        expect(shell.pageErrors, `① renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
      } finally {
        await cleanupViewKey(shell.page)
        await closeAndAwaitExit(shell)
      }
    }

    // ---- ②坏 JSON:parse 失败 → 隔离 + 空 overlay 原位重建 ---------------
    const badBytes = '{ "disabled": ['
    mkdirSync(userDataDir, { recursive: true })
    writeFileSync(overlayPath, badBytes)
    {
      const shell = await session.boot()
      try {
        const { page } = shell
        // 启动不阻断;空 overlay 重建 → 全量 5 包装配。
        for (const name of MANDATORY_NAMES) await expectRosterContains(shell, name)
        await expectRosterContains(shell, HELLO_WORLD)
        await expectRosterContains(shell, '@dsh-forge/plugin-hello-world-sample-b')

        // 守卫处置文件终态:原坏字节隔离为 .corrupt-*,原位重建空 overlay。
        expect(readOverlay(overlayPath), '② 重建后的 overlay 在位且为空集').toEqual({ disabled: [] })
        const isolated = readdirSync(userDataDir).filter(name => name.startsWith('plugin-runtime.json.corrupt-'))
        expect(isolated, '② 原文件被隔离为 .corrupt-*').toHaveLength(1)
        expect(readFileSync(join(userDataDir, isolated[0] ?? ''), 'utf8'), '② 隔离件保留原坏字节').toBe(badBytes)

        // 插件区按清单态呈现:两级行齐、全启用、无残缺列表。
        await switchToWorkbench(page)
        await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()
        await expectTwoTierSectionCensus(page, [HELLO_WORLD, '@dsh-forge/plugin-hello-world-sample-b'])
        expect(sha256File(PRODUCT_CONFIG), '② 产品清单字节不变').toBe(productShaBefore)
        expect(shell.pageErrors, `② renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
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

test('step-1/load-error-retry [@web-e2e @journey plugin-management]: [SKIPPED-infeasible] first-load rejection has no deterministic injection channel — healthy skeleton→ready path encoded as the proxy', async ({ }, testInfo) => {
  // 任务注记(recorded,不伪造):listPlugins 首载失败(load-error 错误卡 +
  // 重试 + 失败重列保底)在本旅程装置下不可确定性注入 ——
  //   · listPlugins 只读 manifest + plugin-runtime.json:清单缺失/不可解析 =
  //     启动装配整体失败(boot 层拦住,轮不到插件区首载);
  //   · 覆盖文件任意形态(缺失/坏 JSON/塞必备名)都被启动解析守卫归一
  //     (FT-050),listPlugins 仍成功;
  //   · 挂载面(PluginSection)无 face-level failure poke 通道(仅 mock 孪生
  //     的单测装置有)。
  // 解除本 skip 需要:主进程/预加载侧的动词失败注入口(verb failure seam)。
  // 代理断言(若解除 skip 即生效):健康启动下 section 走 skeleton → ready,
  // 不呈现空白或错误卡。
  test.skip(true, 'listPlugins first-load rejection needs a main-process failure seam (recorded for task notes; see header)')
  testInfo.setTimeout(420_000)

  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-pm1lr-'))
  const session = createAppSessionFactory({
    bundles: journeyBundles(),
    stageTarballs: journeyStageTarballs(),
    rootDir: join(root, 'shell'),
    userDataDir: join(root, 'user-data'),
  })

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      await switchToWorkbench(page)
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()
      // The healthy proxy: skeleton resolves into the ready two-tier rows.
      await expect(page.locator('[data-dsh-forge-plugins-section]')).toBeVisible({ timeout: 30_000 })
      await expect(page.locator('[data-dsh-forge-plugins-error]'), 'no load-error card on a healthy boot').toHaveCount(0)
      await expectTwoTierSectionCensus(page, [HELLO_WORLD, '@dsh-forge/plugin-hello-world-sample-b'])
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
