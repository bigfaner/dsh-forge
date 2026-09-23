// @feature dsh-forge-m2 | @web-e2e | @journey sc6-plugin-model
// Traceability: docs/features/dsh-forge-m2/tasks/6.5-sc67-plugin-model-dual-form.md
//
// SC6 验收腿(两级插件模型,tech-design Interface 4 / PRD SC6 + Story7)。
// hello-world 升格为「第三方可启停」仅发生在 journey 的测试 profile 配置里
// (产品清单 apps/desktop/resources/plugin-bundles.json 语义不动 —— Hard Rule
// 哈希对拍对象);必备名单与产品清单同语义:dsh-base / dsh-web-app /
// forge-workbench 三条 mandatory。
//
//   SC6-2 畸形 plugin-runtime.json 两型(写入 journey userData 后再启动 ——
//     6.1 的 DSH_FORGE_USER_DATA 钉住 overlay 路径,预置即生效):
//     ① 塞必备名(schema 合法,disabled 同时含三个必备名 + hello-world)→
//       启动不阻断;违规条目内存剔除:必备全载(清单态赢),同文件里的
//       第三方名仍生效(hello-world 被 held out —— 精确清洗,非整文件作
//       废);覆盖文件字节不变(违规路径不重写文件);
//     ② 坏 JSON(parse 失败)→ 启动不阻断;原文件隔离 `.corrupt-*`(原字
//       节保留)+ 空 overlay 原位重建 → 四包全载(重建后全启用)。
//   SC6-1 纵深两层:
//     DOM 层(5.12 结构守卫)—— 必备行零可写控件(逐行查 button/select/
//     input/textarea/a[href]/[role=button|switch|checkbox] 家族 + 启停动作
//     属性族),必备徽标在;第三方行恰一个启停控件(对照组,证明查询有
//     效且两级分化真实渲染);
//     IPC 层(3.1 单写路径守卫)—— renderer 直调 setPluginEnabled(逐个
//     必备名)reject ERR_PLUGIN_MANDATORY(envelope code 断言),守卫先于
//     写:覆盖文件未被创建。
//   SC6-3 第三方启停往返:
//     禁用(「禁用」→ 双确认对话框 → 确认)→ 覆盖文件落 { disabled:
//     [hello-world] } → 重启:hello-world 退出装配(boot roster + profile
//     清单),工作台核心不受影响(已注册项目看板照常渲染)→ 启用(直接
//     动词)→ 再重启:恢复;覆盖文件跨靴持久。全程产品清单字节不变
//     (Hard Rule:仓内产品清单文件 sha256 前后对拍 + journey 配置字节对
//     拍,不以「没报错」为据)。
//
// Hard Rules:每次启动前单实例探测(createAppSessionFactory 内建);跑腿前
// pnpm build:plugins && pnpm stage:plugin-tarballs。
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  BASE_BUNDLES, FORGE_WORKBENCH, FORGE_WORKBENCH_STAGED_AT, HELLO_WORLD, PRODUCT_CONFIG,
  expectRosterContains, expectRosterLacks, forgeWorkbenchTarball, helloWorldTarball,
  readProfileBundles, sha256File,
} from '../../helpers/plugins.ts'
import type { BundleEntry } from '../../helpers/plugins.ts'
import { registerFixtureProject, writeForgeProject } from '../../fixtures/forge-project.ts'
import { generateTaskSet } from '../../fixtures/task-generator.ts'
import { cleanupViewKey, closeAndAwaitExit, createAppSessionFactory, switchToWorkbench, waitForTreeNodes } from './helpers/restart-app.ts'

/** hello-world 的 staged tarball 通道(3.2 scaffold 同款约定,journey 自带)。 */
const HELLO_WORLD_STAGED_AT = 'plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz'
/** 测试 profile 的必备名单(与产品清单 plugin-bundles.json 同语义的三条)。 */
const MANDATORY_NAMES: readonly string[] = [...BASE_BUNDLES.map(entry => entry.name), FORGE_WORKBENCH]
/** 全量 profile 顺序(配置序)。 */
const PROFILE_ALL: readonly string[] = [...MANDATORY_NAMES, HELLO_WORLD]

/** 测试 profile:基座两条 + 必备 forge 核心 + 第三方 hello-world(不标 mandatory)。 */
function sc6Bundles(): readonly BundleEntry[] {
  return [
    ...BASE_BUNDLES.map((entry): BundleEntry => ({ name: entry.name, mandatory: true })),
    { name: FORGE_WORKBENCH, source: `tarball:${FORGE_WORKBENCH_STAGED_AT}`, mandatory: true },
    { name: HELLO_WORLD, source: `tarball:${HELLO_WORLD_STAGED_AT}` },
  ]
}

/** The writable-element family a mandatory row must render ZERO of (SC6-1 DOM 层). */
const WRITABLE_FAMILY = 'button, select, input, textarea, a[href], [role="button"], [role="switch"], [role="checkbox"]'

/** One plugin row's control census (-1 row = row absent). */
async function rowControlCensus(page: Page, name: string): Promise<{ writable: number; actions: number }> {
  return await page.evaluate((input: { name: string; family: string }) => {
    const row = document.querySelector(`[data-dsh-forge-plugin-row="${input.name}"]`)
    if (row === null) return { writable: -1, actions: -1 }
    return {
      writable: row.querySelectorAll(input.family).length,
      actions: row.querySelectorAll('[data-dsh-forge-plugin-action]').length,
    }
  }, { name, family: WRITABLE_FAMILY })
}

/** IPC 直调 setPluginEnabled;reject 时带回 error.message(序列化 envelope)。 */
async function ipcSetPluginEnabled(page: Page, name: string, enabled: boolean): Promise<{ ok: boolean; message: string }> {
  return await page.evaluate(async (input: { name: string; enabled: boolean }) => {
    const bridge = (globalThis as {
      dshForge?: { workbench?: { setPluginEnabled?: (name: string, enabled: boolean) => Promise<unknown> } }
    }).dshForge?.workbench
    if (bridge?.setPluginEnabled === undefined) throw new Error('dshForge.workbench.setPluginEnabled bridge unavailable in the e2e renderer')
    try {
      await bridge.setPluginEnabled(input.name, input.enabled)
      return { ok: true, message: '' }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, message }
    }
  }, { name, enabled })
}

/** The serialized `{ code, message }` envelope's code inside an IPC reject message. */
function envelopeCode(message: string): string | undefined {
  const match = /\{.*\}/s.exec(message)
  if (match === null) return undefined
  try {
    const parsed = JSON.parse(match[0]) as { code?: unknown }
    return typeof parsed.code === 'string' ? parsed.code : undefined
  } catch {
    return undefined
  }
}

/** Parsed overlay content, when the file exists. */
function readOverlay(overlayPath: string): { disabled: string[] } | undefined {
  if (!existsSync(overlayPath)) return undefined
  return JSON.parse(readFileSync(overlayPath, 'utf8')) as { disabled: string[] }
}

test('6.5/sc6-plugin-model [@web-e2e @journey sc6-plugin-model]: mandatory rows carry no disable channel + malformed-overlay guard + third-party toggle roundtrip', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)

  // --- journey fixtures:小型 forge 项目(重启后看板仍可渲染的证物)---------
  const set = generateTaskSet({ seed: 'sc6', taskCount: 8, featureCount: 1, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-sc6-'))
  const project = writeForgeProject(set, { codeRoot: join(root, 'proj-sc6') })
  const userDataDir = join(root, 'user-data')
  const overlayPath = join(userDataDir, 'plugin-runtime.json')

  // Hard Rule 基线:产品清单(仓内文件)哈希 + journey 配置字节(首个 boot 后取)。
  const productManifestShaBefore = sha256File(PRODUCT_CONFIG)

  const session = createAppSessionFactory({
    bundles: sc6Bundles(),
    stageTarballs: [
      { at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() },
      { at: HELLO_WORLD_STAGED_AT, from: helloWorldTarball() },
    ],
    rootDir: join(root, 'shell'),
    userDataDir,
  })

  let journeyConfigBytes = ''
  try {
    // ======================================================================
    // SC6-2① 塞必备名:schema 合法但 disabled 含三个必备名 + hello-world。
    // ======================================================================
    const overlayMandatoryBytes = `${JSON.stringify({ disabled: [...MANDATORY_NAMES, HELLO_WORLD] }, undefined, 2)}\n`
    mkdirSync(userDataDir, { recursive: true })
    writeFileSync(overlayPath, overlayMandatoryBytes)
    {
      const shell = await session.boot()
      journeyConfigBytes = shell.configBytes()
      try {
        // 启动不阻断 + 必备全载(roster 先断在,「lacks」才有意义)。
        await expectRosterContains(shell, FORGE_WORKBENCH)
        await expectRosterLacks(shell, HELLO_WORLD)
        expect(readProfileBundles(shell.profileDir), '① 必备全载 + 第三方名仍生效(精确清洗)').toEqual([...MANDATORY_NAMES])
        // 覆盖文件字节不变:违规条目仅内存剔除(区别于 ② 的隔离重建)。
        expect(readFileSync(overlayPath, 'utf8'), '① 覆盖文件未被重写').toBe(overlayMandatoryBytes)
        expect(shell.pageErrors, `① renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
      } finally {
        await closeAndAwaitExit(shell)
      }
    }

    // ======================================================================
    // SC6-2② 坏 JSON:parse 失败 → 隔离 + 空 overlay 重建,启动不阻断。
    // ======================================================================
    const badBytes = '{ "disabled": ['
    writeFileSync(overlayPath, badBytes)
    {
      const shell = await session.boot()
      try {
        await expectRosterContains(shell, FORGE_WORKBENCH)
        await expectRosterContains(shell, HELLO_WORLD)
        expect(readProfileBundles(shell.profileDir), '② 空 overlay 重建后四包全载').toEqual([...PROFILE_ALL])
        // 守卫处置的文件终态:原文件隔离(.corrupt-* 保留原字节)+ 原位重建空 overlay。
        const overlay = readOverlay(overlayPath)
        expect(overlay, '② 重建后的 overlay 在位').toEqual({ disabled: [] })
        const isolated = readdirSync(userDataDir).filter(name => name.startsWith('plugin-runtime.json.corrupt-'))
        expect(isolated.length, '② 原文件被隔离为 .corrupt-*').toBe(1)
        expect(readFileSync(join(userDataDir, isolated[0] ?? ''), 'utf8'), '② 隔离件保留原坏字节').toBe(badBytes)
        expect(shell.pageErrors, `② renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
      } finally {
        await closeAndAwaitExit(shell)
      }
    }

    // ======================================================================
    // SC6-1 纵深两层(干净 overlay 起点)+ SC6-3 禁用腿。
    // ======================================================================
    rmSync(overlayPath, { force: true })
    {
      const shell = await session.boot()
      try {
        const { page } = shell
        await expectRosterContains(shell, FORGE_WORKBENCH)
        await expectRosterContains(shell, HELLO_WORLD)
        expect(readProfileBundles(shell.profileDir)).toEqual([...PROFILE_ALL])

        // 注册 + 激活项目(重启腿的工作台核心证物;SC6-3 禁用后看板照常)。
        const projectId = await registerFixtureProject(page, project)
        expect(typeof projectId).toBe('string')

        await switchToWorkbench(page)
        await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()

        // ---- SC6-1 DOM 层:逐行控件普查 -----------------------------------
        const section = page.locator('[data-dsh-forge-plugins-section]')
        await expect(section).toBeVisible()
        for (const name of MANDATORY_NAMES) {
          const row = page.locator(`[data-dsh-forge-plugin-row="${name}"]`)
          await expect(row, `row of ${name}`).toBeVisible({ timeout: 30_000 })
          await expect(row).toHaveAttribute('data-tier', 'mandatory')
          await expect(row).toHaveAttribute('data-enabled', 'true')
          await expect(row.locator('[data-dsh-forge-plugin-mandatory-badge]'), `必备徽标 on ${name}`).toBeVisible()
          const census = await rowControlCensus(page, name)
          expect(census.writable, `${name} 行可写控件家族计数(结构守卫:不渲染,非 rendered-disabled)`).toBe(0)
          expect(census.actions, `${name} 行启停动作计数`).toBe(0)
        }
        const helloRow = page.locator(`[data-dsh-forge-plugin-row="${HELLO_WORLD}"]`)
        await expect(helloRow).toBeVisible({ timeout: 30_000 })
        await expect(helloRow).toHaveAttribute('data-tier', 'third-party')
        await expect(helloRow).toHaveAttribute('data-enabled', 'true')
        const helloCensus = await rowControlCensus(page, HELLO_WORLD)
        expect(helloCensus.writable, '第三方行恰一个可写控件(对照组:查询有效 + 两级分化真实渲染)').toBe(1)
        expect(helloCensus.actions).toBe(1)

        // ---- SC6-1 IPC 层:renderer 直调,守卫逐必备名拒绝 ----------------
        for (const name of MANDATORY_NAMES) {
          const rejection = await ipcSetPluginEnabled(page, name, false)
          expect(rejection.ok, `setPluginEnabled(${name}, false) 必须 reject`).toBe(false)
          expect(rejection.message).toContain('ERR_PLUGIN_MANDATORY')
          expect(envelopeCode(rejection.message), `${name} 拒绝 envelope code`).toBe('ERR_PLUGIN_MANDATORY')
        }
        expect(existsSync(overlayPath), '守卫先行:三次拒绝未创建覆盖文件').toBe(false)
        // 拒绝不动行态(纵深第二层从不依赖 UI 自觉,也不反向影响它)。
        await expect(page.locator(`[data-dsh-forge-plugin-row="${FORGE_WORKBENCH}"]`)).toHaveAttribute('data-enabled', 'true')

        // ---- SC6-3 禁用:双确认对话框 → 覆盖文件落盘 ----------------------
        await helloRow.locator('[data-dsh-forge-plugin-action="disable"]').click()
        const confirmButton = page.locator('[data-dsh-forge-plugin-confirm]')
        await expect(confirmButton, '双确认对话框打开').toBeVisible({ timeout: 10_000 })
        await expect(page.locator('[data-dsh-forge-plugin-impact]'), '影响说明在(对话框的存在意义)').toBeVisible()
        await confirmButton.click()
        await expect(helloRow).toHaveAttribute('data-enabled', 'false', { timeout: 15_000 })
        await expect(helloRow.locator('[data-dsh-forge-plugin-action="enable"]')).toBeVisible()
        expect(readOverlay(overlayPath), '禁用写且仅写覆盖文件').toEqual({ disabled: [HELLO_WORLD] })
        // Hard Rule:产品清单(journey 配置)字节不变 —— 「没报错」不算据。
        expect(shell.configBytes(), 'journey 配置字节跨禁用不变').toBe(journeyConfigBytes)
        expect(sha256File(PRODUCT_CONFIG), '仓内产品清单 sha256 跨腿不变').toBe(productManifestShaBefore)
        expect(shell.pageErrors, `SC6-1/3 renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
      } finally {
        await cleanupViewKey(shell.page)
        await closeAndAwaitExit(shell)
      }
    }

    // ======================================================================
    // SC6-3 重启(禁用态):注入内容退出装配,工作台核心不受影响 → 启用。
    // ======================================================================
    {
      const shell = await session.boot()
      try {
        const { page } = shell
        await expectRosterContains(shell, FORGE_WORKBENCH)
        await expectRosterLacks(shell, HELLO_WORLD)
        expect(readProfileBundles(shell.profileDir), '禁用跨靴持久:profile 清单缺第三方').toEqual([...MANDATORY_NAMES])

        // 工作台核心不受影响:已注册项目的看板照常渲染。
        await switchToWorkbench(page)
        await page.getByRole('tab', { name: /^任务$|^Tasks$/ }).click()
        await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-tasks"]')).toBeVisible()
        await waitForTreeNodes(page, set.facts.taskCount, 60_000)

        // 启用(直接动词,无确认)→ 行态翻转 + 覆盖文件清空。
        await page.getByRole('tab', { name: /^概览$|^Overview$/ }).click()
        await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()
        const helloRow = page.locator(`[data-dsh-forge-plugin-row="${HELLO_WORLD}"]`)
        await expect(helloRow).toBeVisible({ timeout: 30_000 })
        await expect(helloRow, '禁用态跨靴持久(行呈现已停用)').toHaveAttribute('data-enabled', 'false')
        await helloRow.locator('[data-dsh-forge-plugin-action="enable"]').click()
        await expect(helloRow).toHaveAttribute('data-enabled', 'true', { timeout: 15_000 })
        expect(readOverlay(overlayPath), '启用后覆盖文件空集').toEqual({ disabled: [] })
        expect(shell.pageErrors, `启用腿 renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
      } finally {
        await cleanupViewKey(shell.page)
        await closeAndAwaitExit(shell)
      }
    }

    // ======================================================================
    // SC6-3 再重启(启用态):恢复 + 终态哈希对拍。
    // ======================================================================
    {
      const shell = await session.boot()
      try {
        await expectRosterContains(shell, FORGE_WORKBENCH)
        await expectRosterContains(shell, HELLO_WORLD)
        expect(readProfileBundles(shell.profileDir), '启用跨靴恢复:profile 清单回全量').toEqual([...PROFILE_ALL])
        expect(readOverlay(overlayPath), 'overlay 终态持久').toEqual({ disabled: [] })
        // Hard Rule 终拍:两处清单字节全程不变。
        expect(shell.configBytes(), 'journey 配置字节全程不变').toBe(journeyConfigBytes)
        expect(sha256File(PRODUCT_CONFIG), '仓内产品清单 sha256 全程不变').toBe(productManifestShaBefore)
        expect(shell.pageErrors, `恢复腿 renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
      } finally {
        await closeAndAwaitExit(shell)
      }
    }
  } finally {
    // Journey cleanup(6.1 Hard Rule:测试后清理)。
    rmSync(root, { recursive: true, force: true })
    expect(existsSync(root)).toBe(false)
  }
})
