// 官方宿主统一口径 setup 支撑（project-workspace-ux-official/1.11——J1/J2/J3 spec 共用）。
//
// 装载前置（统一口径，任务简报硬约束）：
//   ① 打包最新版本（plugins/project `pnpm pack` → tarball）；
//   ② plugin-manager 正式安装进被测官方宿主（插件页「添加插件」tarball 通道——1.7/1.10
//      RUN-LOG 既定真机口径；禁 junction/profile.dev 直载与 dist 直载形态）；
//   ③ setup 断言 manifest 版本一致（插件页详情版本 + profile 实体包 package.json 双校验）。
//
// 官方宿主舞台：官方 dsh web 宿主不在本 e2e harness 启动域内（外部进程），须先行启动
// 并经 env 注入地址——`E2E_OFFICIAL_WEB_URL`（如 http://127.0.0.1:19777）。缺席时
// `officialHostStage()` 返回 null，spec 据此留痕 skip（通道缺失记账，非退役候选）。
// 实体包双校验定位根经 `E2E_OFFICIAL_DSH_HOME`（官方宿主 dsh-home；缺席 = 仅 UI 侧
// 校验并在结果中如实标注单校形态）。
//
// 机械来源：cdp/w117b-install180.cjs + w117b-enable180.cjs + w117b-vercheck.cjs
// （1.7/1.10 真机驱动序列移植——同一 UI 词汇：插件页 → 添加插件 → 包路径 → 安装 →
//  允许/信任 → 重试 → 关闭 → 启用）。安装轮询有界（6 分钟上界），build-auth 允许/信任
// 分支显式处置。
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type Page } from '@playwright/test'

/** 仓库根（tests/<module>/<journey>/ 四级上溯——tests/project/support/official-host.ts） */
const HERE = fileURLToPath(import.meta.url)
export const PROJECT_PKG_DIR = join(HERE, '..', '..', '..', '..', 'plugins', 'project')

export interface OfficialHostStage {
  /** 官方宿主 web 地址（E2E_OFFICIAL_WEB_URL） */
  readonly webUrl: string
  /** 官方宿主 dsh-home 根（E2E_OFFICIAL_DSH_HOME；缺席 = undefined = 实体包校验降级为 UI 单校） */
  readonly dshHome?: string
}

/** 统一口径舞台读取：env 缺席 = null（调用侧留痕 skip——官方宿主未启动不可伪造） */
export function officialHostStage(): OfficialHostStage | null {
  const webUrl = process.env.E2E_OFFICIAL_WEB_URL
  if (webUrl === undefined || webUrl === '') return null
  const dshHome = process.env.E2E_OFFICIAL_DSH_HOME
  return { webUrl, ...(dshHome !== undefined && dshHome !== '' ? { dshHome } : {}) }
}

/** ① 打包最新版本：`pnpm pack`（run-once，禁 --watch 形态）→ tarball 绝对路径 */
export function buildProjectTarball(log: string[]): { tarball: string; version: string } {
  const manifest = JSON.parse(readFileSync(join(PROJECT_PKG_DIR, 'package.json'), 'utf8')) as { version: string }
  // shell:true——Windows 下 execFileSync('pnpm') 仅解析 .exe（pnpm 实体 = pnpm.cmd，无 shell
  // 即 ENOENT，runner 侧六度踩坑）；包路径与目的地均无空白字符，shell 拼接安全。
  const out = execFileSync('pnpm', ['pack', '--pack-destination', PROJECT_PKG_DIR], {
    cwd: PROJECT_PKG_DIR,
    encoding: 'utf8',
    timeout: 300_000,
    shell: true,
  })
  const filename = out.trim().split(/\r?\n/).at(-1) ?? ''
  const tarball = join(PROJECT_PKG_DIR, filename)
  expect(existsSync(tarball), `① 打包产物在盘（pnpm pack → ${filename}）`).toBe(true)
  log.push(`pack: ${filename} (manifest ${manifest.version})`)
  return { tarball, version: manifest.version }
}

/** 有界收模态（官方 UI 弹窗词汇——继续/知道了/开始使用/确定/完成/关闭，Escape 兜底） */
async function clearDialogs(page: Page): Promise<void> {
  for (let i = 0; i < 6; i++) {
    if ((await page.locator('[role="dialog"]').count()) === 0) return
    let clicked = false
    for (const name of ['继续', '知道了', '开始使用', '确定', '完成', '关闭']) {
      const button = page.getByRole('button', { name, exact: true }).first()
      if ((await button.count()) > 0) {
        await button.click({ force: true }).catch(() => {})
        clicked = true
        break
      }
    }
    if (!clicked) await page.keyboard.press('Escape')
    await page.waitForTimeout(2_000)
  }
}

export interface InstallResult {
  readonly version: string
  /** 实体包双校验形态：true = UI 详情 + profile 实体包双校；false = 仅 UI 详情（env 缺席，如实标注） */
  readonly entityVerified: boolean
}

/**
 * ②③ plugin-manager 正式安装 + 启用 + manifest 版本一致断言。
 * UI 词汇与断言锚：插件页按钮「插件」→「添加插件」→ input[aria-label="包名或地址"]
 * →「安装」→ 允许/信任（build-auth）→ 关闭；行内「启用」→ 运行中标记。
 * 版本双校验：UI 详情页版本文本含 manifest version；实体包 =
 * {E2E_OFFICIAL_DSH_HOME} 下有界深搜 node_modules/@dsh-forge/project/package.json（任意层级）。
 */
export async function installViaPluginManager(page: Page, stage: OfficialHostStage, log: string[]): Promise<InstallResult> {
  const { tarball, version } = buildProjectTarball(log)
  await page.goto(stage.webUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForTimeout(12_000)
  await clearDialogs(page)
  await page.getByRole('button', { name: '插件', exact: true }).first().click({ force: true })
  await page.waitForTimeout(5_000)
  // ② tarball 正式安装（禁 junction/dist 直载——通道本体即 plugin-manager 安装面）
  await page.getByText('添加插件', { exact: true }).first().click({ force: true })
  const input = page.locator('input[aria-label="包名或地址"]')
  await input.waitFor({ state: 'visible', timeout: 30_000 })
  await input.fill(tarball)
  await page.getByRole('button', { name: '安装', exact: true }).first().click({ force: true })
  // 安装轮询（有界 6 分钟；build-auth 允许/信任 → 重试分支显式处置；已装同版本 = 收敛）
  let resultText = ''
  let alreadyInstalled = false
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(4_000)
    const dialog = page.locator('[role="dialog"]')
    resultText = (await dialog.count()) > 0 ? await dialog.first().innerText() : '(no dialog)'
    const allow = page.getByRole('button', { name: /允许|信任/ }).first()
    if ((await allow.count()) > 0) {
      log.push('build-auth dialog -> allow')
      await allow.click({ force: true }).catch(() => {})
      await page.waitForTimeout(2_000)
      const retry = page.getByRole('button', { name: /^重试$/ }).first()
      if ((await retry.count()) > 0) await retry.click({ force: true }).catch(() => {})
      continue
    }
    if (/这个包已经安装/.test(resultText)) {
      alreadyInstalled = true
      log.push('install: already installed (same version) — 收敛跳过安装')
      break
    }
    if (/失败|成功|完成|已安装/.test(resultText) || resultText === '(no dialog)') break
  }
  if (!alreadyInstalled) {
    expect(resultText, `② plugin-manager 正式安装收敛（末态：${resultText.slice(0, 120)}）`).not.toMatch(/失败/)
  }
  log.push(`install: ${resultText.replace(/\n/g, ' | ').slice(0, 160)}`)
  const close = page.getByRole('button', { name: /关闭|知道了|确定|完成/ }).first()
  if ((await close.count()) > 0) await close.click({ force: true }).catch(() => {})
  await page.waitForTimeout(2_000)

  // ③-a UI 详情 manifest 版本断言（列表行卡无版本文本；点开行卡 → 详情面板 v{version} 在席）
  const row = page.locator('[data-dockkit-row], [role="listitem"], li').filter({ hasText: '@dsh-forge/project' }).first()
  await expect(row, '③-a 已安装插件行在场（@dsh-forge/project）').toBeVisible({ timeout: 30_000 })
  await row.click({ force: true })
  await page.waitForTimeout(2_000)
  await expect(page.locator('body'), `③-a UI manifest 版本一致（详情面 v${version}）`).toContainText(`v${version}`)

  // ③-b 实体包版本断言（dsh-home profile 树 @dsh-forge/project/package.json——env 缺席如实降级；
  //  web profile 优先，陈旧遗留实体不采纳）
  let entityVerified = false
  if (stage.dshHome !== undefined) {
    // 实体包定位有界重试（1.26 支撑面收口——安装/启用收尾与 profile 实体物化存在竞态窗口，
    // 单次深搜偶发 0 候选；3s×4 有界重试收敛，超界如实失败）
    let entities = findInstalledPackageJsons(stage.dshHome, 0)
    for (let i = 0; entities.length === 0 && i < 3; i++) {
      await page.waitForTimeout(3_000)
      entities = findInstalledPackageJsons(stage.dshHome, 0)
    }
    const webProfileEntity = entities.find((p) => p.replace(/\\/g, '/').includes('/profiles/web/'))
    const entityPkg = webProfileEntity ?? entities.find((p) => (JSON.parse(readFileSync(p, 'utf8')) as { version: string }).version === version) ?? null
    expect(entityPkg, `③-b profile 实体包 @dsh-forge/project/package.json 在盘（候选 ${entities.length} 份：${entities.map((p) => p.replace(/\\/g, '/')).join(' , ') || 'none'}）`).toBeTruthy()
    const entityVersion = (JSON.parse(readFileSync(entityPkg as string, 'utf8')) as { version: string }).version
    expect(entityVersion, `③-b 实体包版本一致（${entityVersion} = ${version}）`).toBe(version)
    entityVerified = true
    log.push(`entity: ${entityPkg} (${entityVersion})${webProfileEntity ? '' : ' [web-profile 缺席，全树兜底]'}`)
  } else {
    log.push('entity check skipped: E2E_OFFICIAL_DSH_HOME 缺席（UI 单校形态，如实标注）')
  }

  // 启用（正式安装后运行态——「启用」钮 → 已启用/运行中标记）
  const enable = page.getByRole('button', { name: /^启用$/ }).first()
  if ((await enable.count()) > 0) {
    await enable.click({ force: true })
    await page.waitForTimeout(3_000)
    log.push('enable clicked')
  }
  await returnToMainView(page, log)
  return { version, entityVerified }
}

/**
 * 装载后回主视图（1.26 支撑面收口——非断言改动）：安装序列把主视图切到插件页/插件详情面，
 * hero 区（conversation.hero.workspace chip）随主视图离场不在 DOM——G4 前置「hero 芯片
 * （未绑定词汇）」结构性缺席 = 舞台装载形态缺席 skip 的成因。回主视图 = 「新会话」官方钮
 * （新建未绑定会话为活跃上下文——hero chip 回到「选择工作区」未绑定词汇态，与 WYSIWYG
 * 创建语义一致）；按钮缺席时 Escape 兜底（可能停留在可用视图）。失败 fail-soft（log 记账），
 * 不阻断装载前置成立。
 */
async function returnToMainView(page: Page, log: string[]): Promise<void> {
  const back = async (): Promise<boolean> =>
    (await page.locator('button').evaluateAll((els) =>
      els.some((b) => /默认工作区|选择工作区/.test((b.getAttribute('aria-label') || b.textContent || '').trim())),
    )) || (await page.locator('[data-dswf-hero]').count()) > 0
  // 插件重装载收敛等待（新版本实装后顶替面板重挂载窗口——行集稳定后再交还 spec）
  await page.waitForFunction(
    (min) => document.querySelectorAll("[data-dswf-project]").length >= min,
    1,
    { timeout: 30_000 },
  ).catch(() => {})
  for (let i = 0; i < 3 && !(await back()); i++) {
    const newSession = page.getByRole('button', { name: /新会话/ }).first()
    if ((await newSession.count()) > 0) {
      await newSession.click({ force: true }).catch(() => {})
      log.push(`return-to-main: 新会话 clicked (round ${String(i + 1)})`)
    } else {
      await page.keyboard.press('Escape')
      log.push(`return-to-main: 新会话钮缺席——Escape 兜底 (round ${String(i + 1)})`)
    }
    await page.waitForTimeout(3_000)
  }
}

/** 有界深搜实体包 package.json 全候选（深度 6 封顶——定位 node_modules/@dsh-forge/project/package.json） */
function findInstalledPackageJsons(root: string, depth: number, acc: string[] = []): string[] {
  if (depth > 6) return acc
  let names: string[]
  try {
    names = readdirSync(root)
  } catch {
    return acc
  }

  if (names.includes('@dsh-forge')) {
    const candidate = join(root, '@dsh-forge', 'project', 'package.json')
    if (existsSync(candidate)) acc.push(candidate)
  }
  for (const name of names) {
    findInstalledPackageJsons(join(root, name), depth + 1, acc)
  }
  return acc
}

/** 官方宿主页面句柄（headless chromium → 统一口径舞台 URL；console error 采集回传） */
export interface OfficialPage {
  readonly page: Page
  readonly consoleErrors: string[]
  close(): Promise<void>
}

/** 打开官方宿主 web 舞台页（headless——官方宿主进程本体在 harness 域外，先经 env 注入；
 *  locale 固定 zh-CN：runner 上下文默认 en-US 会把官方宿主 UI 渲染成英文面，中文锚点全失配） */
export async function openOfficialPage(stage: OfficialHostStage): Promise<OfficialPage> {
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, locale: 'zh-CN' })
  const consoleErrors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300))
  })
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message))
  await page.goto(stage.webUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForTimeout(12_000)
  return {
    page,
    consoleErrors,
    close: async () => {
      await browser.close()
    },
  }
}

/**
 * host 真值软通道：renderer dshForge preload 桥直读（forge:* 读面——host 登记对照真值）。
 * 桥缺席（官方宿主形态差异）返回 null——调用侧留痕记账，不伪造对照断言。
 */
export async function tryForgeInvoke<T>(page: Page, channel: string, payload?: unknown): Promise<T | null> {
  try {
    return await page.evaluate(async ({ ch, args }) => {
      const forge = (globalThis as { dshForge?: { invoke(c: string, p?: unknown): Promise<{ ok: boolean; data?: unknown }> } }).dshForge
      if (forge === undefined) return null
      const envelope = await forge.invoke(ch, args)
      return envelope.ok ? (envelope.data as T) : null
    }, { ch: channel, args: payload })
  } catch {
    return null
  }
}
