// forge-aggregate-bundle 四旅程（bundle-install-fullchain / bundle-uninstall-fallback /
// bundle-solo-install / bundle-preset-forge-session）共享支撑面（任务 1.8）。
//
// 被测物 = plugin-manager 正式安装的 bundle 变体发布树（scripts/package-release.mjs bundle
// 通道，manifest channels.bundle dir 'forge'——forge 六插行 patch + 五件 file: 兄弟依赖）。
// 宿主 = 官方 dsh web 宿主（`dsh --profile web --no-open --port <port>`——AGENTS §1.8
// 真机纪律前置：manifest 版本双校验先于一切取证，junction/dist 直载与 dev 宿主不作证据）。
//
// 锚值（脚本任务回填，契约 last_anchor_sync 同步）：
// - 管理页卡片 = 官方 `[data-plugin-package="<pkg>"]`；详情页 = `[data-plugin-detail]`
//   （官方 plugin-manager 机械锚——probe-① 定谳 + expert-squad-default-routing e2e 同锚）；
// - 行/条目启停 = 详情页行内官方 Switch（role=switch）；状态后效锚 = profile
//   cordis.patch.yml user 层 override（仅 id+disabled 形态，上游 patch.ts:17 合并语义）+
//   `--dump-config` 组合实况（官方 CLI 公开面）；
// - 服务面 bundle 特有标记 = 六包 client 产物 banner 代际戳
//   `@dsh-forge-generation:<pkg>@<version>`（generationMarker——generationDriftViolations
//   manifest+服务面双校验）+ host `forge-bundle-apply` diag 事件（1.6 薄 apply emitDiag）；
// - skills 行锚 = `--dump-config` 合并实况 `- id: skill-filesystem-<member>` +
//   `providerName: filesystem-<member>`（五异 id/互异 providerName，fefd5149 双改行）；
// - order pin = dump-config 中 forge 预设行 `order: 2` 定值（CT-BPf-B3 反例注入载体）。
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, expect, type Locator, type Page } from '@playwright/test'
import {
  BARE_BUNDLES,
  COMBO_DB_REL,
  FORGE_PKG,
  SIX_PKGS,
  comboDbPath,
  comboEnv,
  comboGateOn,
  ensureProfileBuildApprovals,
  forgeInstallSource,
  generationDriftViolations,
  insertEntryPattern,
  profileNodeModules,
  runDsh,
  sanitizedCliEnv,
  versionPairs,
  type ComboEnv,
} from '../../../e2e/support/forge-combo.js'
import { establishWebAuthSession, extractBootToken, sessionReady } from '../../../e2e/support/web-boot-auth.js'

// ── 常量（生成器单源 plugins/forge/scripts/aggregate-assets.mjs 同值——漂移即红） ──────
/** 五件成员裸名（aggregate-assets.mjs MEMBERS 同序） */
export const MEMBERS = ['project', 'spec', 'task-loop', 'expert-squad', 'knowledge'] as const
export type Member = (typeof MEMBERS)[number]
/** 五件 skills 行 id（异 id——≠ 官方 base id `skill-filesystem`） */
export const memberSkillId = (member: Member): string => `skill-filesystem-${member}`
/** 五件 providerName（互异——≠ 默认名 `filesystem`；preset 层 = `filesystem-forge`） */
export const memberProvider = (member: Member): string => `filesystem-${member}`
/** preset-forge providerName + 预设序位定值 pin（官方仓 preset 底稿核销 standard=1/forge=2） */
export const PRESET_FORGE_PROVIDER = 'filesystem-forge'
export const PRESET_FORGE_ORDER = 2
/** 六插行裸 id（forge 壳 + 五件——dump-config insert 条目与详情页 RowsSection 同清单） */
export const SIX_ROW_IDS = ['forge', ...MEMBERS] as const

export { BARE_BUNDLES, COMBO_DB_REL, FORGE_PKG, SIX_PKGS, comboDbPath, comboEnv, comboGateOn, forgeInstallSource }

/** 真机总门（FORGE_COMBO_E2E=1——缺省整组 skip，SMOKE-LEDGER 留痕口径同 minchain 套件） */
export const requireGate = (): ComboEnv => {
  const env = comboEnv()
  return env
}

/** bundle 变体安装源（<发布树>/forge——forgeInstallSource 单源；缺席 fail-loud） */
export function requireBundleSource(env: ComboEnv): string {
  const dir = forgeInstallSource(env)
  expect(existsSync(join(dir, 'cordis.patch.yml')), `bundle 变体安装源 patch 在场 ${dir}`).toBe(true)
  return dir
}

/** solo 成员安装源 = 发布树成员目录（bundle 变体发布树五件兄弟共置） */
export const memberSource = (env: ComboEnv, member: Member): string => {
  const treeRoot = join(requireBundleSource(env), '..')
  return join(treeRoot, member)
}

/** npm pack 成员 tarball（file: 闭包物化正道——fix-34 判例同径） */
export function packTarball(dir: string): string {
  const dest = mkdtempSync(join(tmpdir(), 'dsh-forge-bundle-pack-'))
  // shell:true 承载 PATH 解析（Node ≥22 spawnSync 对 .cmd 无 shell 直接 EINVAL）
  const res = spawnSync('npm', ['pack', '--pack-destination', dest], { cwd: dir, encoding: 'utf8', windowsHide: true, shell: process.platform === 'win32' })
  if (res.status !== 0) throw new Error(`npm pack 失败（${dir}）：${String(res.error ?? res.stderr).slice(-400)}`)
  const line = (res.stdout ?? '').split(/\r?\n/).filter(Boolean).at(-1) ?? ''
  const tgz = join(dest, line.trim())
  expect(existsSync(tgz), `打包产物在盘 ${tgz}`).toBe(true)
  return tgz
}

// ── CLI 面（plugin add/remove / dump-config——官方公开接口） ─────────────────────────
export function pluginAdd(env: ComboEnv, source: string, profile = 'web'): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return runDsh(env.dshBin, ['plugin', '--profile', profile, 'add', `file:${source}`], env.dshHome)
}
export function pluginRemove(env: ComboEnv, pkg: string, profile = 'web'): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return runDsh(env.dshBin, ['plugin', '--profile', profile, 'remove', pkg], env.dshHome)
}
/** dump-config = 组合实况（官方 CLI 公开面——bundle 层 + user 层 patch 合并后的黑盒事实） */
export function dumpConfig(env: ComboEnv, profile = 'web'): Promise<string> {
  return runDsh(env.dshBin, ['--profile', profile, '--dump-config'], env.dshHome).then((r) => {
    expect(r.code, `dump-config 成功（exit=${String(r.code)}）stderr=${r.stderr.slice(-400)}`).toBe(0)
    return r.stdout
  })
}
/** profile 侧 node_modules */
export const nodeModulesOf = (env: ComboEnv, profile = 'web'): string => profileNodeModules(env.dshHome, profile)
/** profile user 层 patch 文件（行/条目启停 override 落点——宿主持久化事实） */
export const profilePatchFile = (env: ComboEnv, profile = 'web'): string => join(env.dshHome, 'profiles', profile, 'cordis.patch.yml')
export function readProfilePatch(env: ComboEnv, profile = 'web'): string {
  const file = profilePatchFile(env, profile)
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

/**
 * AGENTS §1.8 取证顺序纪律前置门：manifest 版本双校验 + 五件服务面代际戳探针。
 * 失败即抛（立即停——CT-BIF-B7/O-G3-2 语义：不符即停，零后续取证），调用侧无需再判。
 */
export function cheapGenerationGate(nodeModules: string, pkgs?: readonly string[]): void {
  for (const { pkg, installed, source } of versionPairs(nodeModules, pkgs)) {
    expect(installed, `版本双校验 ${pkg}（安装 manifest == 仓内源）`).toBe(source)
  }
  expect(generationDriftViolations(nodeModules), '五件服务面代际戳探针（manifest + bundle-client banner 双校验）').toEqual([])
}

/** profile node_modules 六包目录逐一在场（CT-BIF-G1/O-G1-1 机械锚） */
export function expectSixPkgsPresent(nodeModules: string): void {
  for (const pkg of SIX_PKGS) {
    const dir = join(nodeModules, '@dsh-forge', pkg.slice('@dsh-forge/'.length))
    expect(existsSync(dir) && readdirSync(dir).length > 0, `六包目录在场且非空 ${pkg}`).toBe(true)
  }
}
/** 六包目录逐一缺席（卸载回落负断言——CT-BUn-G2） */
export function expectSixPkgsAbsent(nodeModules: string): void {
  for (const pkg of SIX_PKGS) {
    expect(existsSync(join(nodeModules, '@dsh-forge', pkg.slice('@dsh-forge/'.length))), `六包目录缺席 ${pkg}`).toBe(false)
  }
}

// ── dump-config faces（skills 行 / 六插行 / 预设 / db 派发） ─────────────────────────
export interface SkillRowFace {
  readonly id: string
  readonly providerName: string
  readonly customSkillDirsAnchored: boolean
}

/** 提取 dump-config 中的 skills 行（`- id: skill-filesystem*` 块：id + providerName + customSkillDirs 锚） */
export function skillRows(dump: string): readonly SkillRowFace[] {
  const rows: SkillRowFace[] = []
  for (const m of dump.matchAll(/^- id: (skill-filesystem\S*)$\r?\n(?:^  .*$\r?\n)*?^    providerName: (\S+)$/gm)) {
    const blockStart = m.index ?? 0
    const block = dump.slice(blockStart, blockStart + 800)
    rows.push({
      id: m[1]!,
      providerName: m[2]!,
      customSkillDirsAnchored: /customSkillDirs:.*dist['",\s]+'skills'/.test(block) || block.includes("dist', 'skills'") || block.includes(`'skills', '`),
    })
  }
  return rows
}

/** 五件 global 层 skills 行三谓词 + 负断言（CT-BIF-G8 / CT-BSo-G3 同源判定） */
export function expectFiveGlobalSkillRows(dump: string): void {
  const rows = skillRows(dump)
  for (const member of MEMBERS) {
    const hit = rows.find((r) => r.id === memberSkillId(member))
    expect(hit, `skills 行在场 ${memberSkillId(member)}`).toBeDefined()
    expect(hit!.providerName, `providerName 互异值 ${memberProvider(member)}`).toBe(memberProvider(member))
    expect(hit!.customSkillDirsAnchored, `customSkillDirs 自锚本包 dist/skills/${member}`).toBe(true)
  }
  const ids = rows.map((r) => r.id)
  expect(new Set(ids).size, '五异 id（互异可判）').toBe(ids.length)
  expect(ids, '零官方 base id 行（fefd5149 双改负断言）').not.toContain('skill-filesystem')
  const providers = rows.map((r) => r.providerName)
  expect(new Set(providers).size, 'providerName 五实例互异（INV-4）').toBe(providers.length)
  expect(providers, '零默认名 providerName').not.toContain('filesystem')
}

/** 六插行 insert 条目逐一在场（CT-BIF-G3 dump-config face——详情页 RowsSection 六行的组合实况对偶） */
export function expectSixInsertEntries(dump: string): void {
  for (const pkg of SIX_PKGS) {
    expect(dump, `insert 条目在场 ${pkg}`).toMatch(insertEntryPattern(pkg))
  }
}

/** 四持库件 dbFile 派发单源（共库落点 {DSH_HOME}/forge/db/forge/forge.db——CT-BIF-G7 config face） */
export function expectSharedDbDispatch(dump: string): void {
  const hits = dump.match(/forge\/db\/forge\/forge\.db/g)?.length ?? 0
  expect(hits, `共库 dbFile 派发表达式 ≥4 处（project/spec/task-loop/knowledge）实际 ${hits}`).toBeGreaterThanOrEqual(4)
}

/** order pin 判定（CT-BPf-G1/G9 pin 载体；CT-BPf-B3 反例注入的断言函数本体） */
export function presetOrderOf(dump: string): number | undefined {
  const m = dump.match(/- id: persona$\r?\n(?:^  .*$\r?\n)*?^    order: (\d+)$/m)
  return m === null ? undefined : Number(m[1])
}
export function expectPresetForgeOrderPin(dump: string): void {
  const order = presetOrderOf(dump)
  expect(order, 'preset-forge order pin（定值 2——漂移即红，官方升级随真机批次复校）').toBe(PRESET_FORGE_ORDER)
}

/** user 层 disabled override face（probe-uninstall 定谳：override 仅 id+disabled 形态） */
export function overrideDisabled(patchText: string, bareId: string): boolean {
  return new RegExp(`^- id: ${bareId}$\\r?\\n(?:(?!^- id:)[^\\r\\n]*$\\r?\\n)*?^[ \\t]+disabled: true$`, 'm').test(patchText)
}

/** host diag 事件读面（{DSH_HOME} logs app-*.jsonl 候选层扫描——forge-bundle-apply 标记） */
export function readForgeDiagEvents(dshHome: string): readonly string[] {
  const events: string[] = []
  for (const dir of [join(dshHome, 'logs'), join(dshHome, 'data', 'logs')]) {
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir).filter((n: string) => n.startsWith('app-') && n.endsWith('.jsonl'))) {
      for (const line of readFileSync(join(dir, name), 'utf8').split('\n')) {
        try {
          const row = JSON.parse(line) as { event?: string }
          if (typeof row.event === 'string' && row.event.startsWith('forge-bundle')) events.push(row.event)
        } catch {
          // 非对象行跳过（多行/半行容错）
        }
      }
    }
  }
  return events
}

// ── 官方 dsh web 宿主（AGENTS §1.8——后台拉起 + boot token 落盘 + 浏览器附着） ────────
export interface WebHost {
  readonly child: ChildProcess
  readonly page: Page
  readonly baseUrl: string
  /** boot 起 client 注入通道取件 URL（五件 client 行为锚——CT-BIF-G6） */
  readonly clientUrls: string[]
  /** boot stdout（diag/启动诊断切片源） */
  stdout: string
  close(): Promise<void>
}

function killTree(child: ChildProcess): void {
  if (child.pid !== undefined && process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    child.kill('SIGKILL')
  }
}

/**
 * 拉起官方 web 宿主（`dsh --profile web --no-open --port <port>`）+ Playwright chromium
 * 附着（boot stdout 提取 token URL → 303 cookie 会话 → 上线）。boot 就绪锚 = 官方 slot
 * 装配面 `[data-slot]`（官方机械锚——desktop 走查 precedent 同径）。
 */
export async function launchWebHost(env: ComboEnv, port: number): Promise<WebHost> {
  const child = spawn(env.dshBin, ['--profile', 'web', '--no-open', '--port', String(port)], {
    env: { ...sanitizedCliEnv(env.dshHome), FORCE_COLOR: '1' },
    cwd: mkdtempSync(join(tmpdir(), 'dsh-forge-bundle-host-')),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (c: Buffer) => { stdout += String(c) })
  child.stderr?.on('data', (c: Buffer) => { stderr += String(c) })
  const deadline = Date.now() + 120_000
  let token: string | undefined
  while (token === undefined && Date.now() < deadline) {
    token = extractBootToken(stdout, port)
    if (child.exitCode !== null) throw new Error(`web 宿主提前退出（exit=${String(child.exitCode)}）stderr=${stderr.slice(-600)}`)
    await new Promise((r) => setTimeout(r, 1_000))
  }
  if (token === undefined) throw new Error(`boot token 未出现（120s）stdout 尾部=${stdout.slice(-600)}`)
  const baseUrl = `http://127.0.0.1:${port}`
  const session = await establishWebAuthSession(baseUrl, token)
  expect(session, 'boot token → cookie 会话建立（零 Set-Cookie 即 fail-loud）').toBeDefined()
  expect(await sessionReady(baseUrl, session!.cookie), 'cookie 会话 GET / ok = web 宿主上线').toBe(true)

  const browser = await chromium.launch()
  const page = await browser.newPage()
  const clientUrls: string[] = []
  page.on('response', (res) => {
    const url = res.url()
    if (url.includes('/node_modules/@dsh-forge/')) clientUrls.push(url)
  })
  await page.goto(`${baseUrl}/?token=${encodeURIComponent(token)}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await expect(page.locator('[data-slot]').first()).toBeVisible({ timeout: 120_000 })
  return {
    child,
    page,
    baseUrl,
    clientUrls,
    get stdout() { return stdout },
    close: async () => {
      await browser.close().catch(() => undefined)
      killTree(child)
      await new Promise<void>((resolve) => {
        if (child.exitCode !== null) resolve()
        else child.once('exit', () => resolve())
      })
    },
  }
}

// ── 官方 plugin-manager UI 面（probe-① 定谳机械锚） ─────────────────────────────────
export const pluginCard = (pkg: string): string => `[data-plugin-package="${pkg}"]`
export const PLUGIN_DETAIL = '[data-plugin-detail]'

/** 打开插件管理页（左栏「插件」面板——官方 plugin-manager main keyed 入口） */
export async function openPluginManager(page: Page): Promise<void> {
  await page.locator('[aria-label="插件"]').first().click()
  await expect(page.locator(pluginCard(FORGE_PKG)).first()).toBeVisible({ timeout: 60_000 })
}

/** 打开 forge 详情页（卡片 → data-plugin-detail 面板区） */
export async function openForgeDetail(page: Page): Promise<Locator> {
  await page.locator(pluginCard(FORGE_PKG)).first().click()
  const detail = page.locator(PLUGIN_DETAIL)
  await expect(detail).toBeVisible({ timeout: 30_000 })
  return detail
}

/** 行/条目启停（官方 dockkit Switch——role=switch；锚不唯一即红，test-run 校准点） */
export async function toggleRowSwitch(detail: Locator, bareId: string, enabled: boolean): Promise<void> {
  const row = detail.locator(`[data-row-id="${bareId}"], [data-plugin-row="${bareId}"]`).first()
  const fallback = detail.getByRole('switch').first()
  const target = (await row.count()) > 0 ? row : fallback
  const sw = target.getByRole('switch').first()
  await expect(sw).toBeVisible({ timeout: 10_000 })
  const before = await sw.getAttribute('aria-checked')
  const want = enabled ? 'true' : 'false'
  if (before !== want) {
    await sw.click()
    await expect(sw).toHaveAttribute('aria-checked', want, { timeout: 30_000 })
  }
}

/** 世代冻结判据探测（CT-BIF-B8——命中即条件 skip，SMOKE-LEDGER 唯一留痕处）：
 * profile 侧 forge patch 与正源 patch 同版本不同内容 = 上游 dsh-app-boot 对同名换装包
 * 首装世代冻结（desktop minchain CT-DISK-08 判例同源判据）。 */
export function generationFrozen(env: ComboEnv, profile = 'web'): boolean {
  const installedPatch = join(nodeModulesOf(env, profile), '@dsh-forge', 'forge', 'cordis.patch.yml')
  if (!existsSync(installedPatch)) return false
  const installed = readFileSync(installedPatch, 'utf8')
  const source = readFileSync(join(requireBundleSource(env), 'cordis.patch.yml'), 'utf8')
  return installed !== source && versionPairs(nodeModulesOf(env, profile), [FORGE_PKG]).every((p) => p.installed === p.source)
}

/** 基线净化（幂等 best-effort——隔离 home 内零真机污染） */
export async function purgeBaseline(env: ComboEnv, profile = 'web'): Promise<void> {
  await pluginRemove(env, FORGE_PKG, profile)
  for (const bare of BARE_BUNDLES) await pluginRemove(env, bare, profile)
  ensureProfileBuildApprovals(env.dshHome, profile)
}
