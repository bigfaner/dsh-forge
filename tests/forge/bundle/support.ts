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
// - skills 行锚 = `--dump-config` 合并实况 preset 子树嵌套实例 `- id: skill-filesystem-forge`
//   （preset-forge 子树）+ `- id: skill-filesystem-expert-squad`（preset-headhunter 子树）+
//   `providerName: filesystem-<…>`（1.34 技能预设独占收敛——顶层零成员 skills 行）；
// - order pin = dump-config 中 forge 预设行 `order: 2` 定值（CT-BPf-B3 反例注入载体）。
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

// ── 常量（cordis.patch.yml 直写正本同值——漂移即红） ──────
/** 五件成员裸名（cordis.patch.yml 六插行同序） */
export const MEMBERS = ['project', 'spec', 'task-loop', 'expert-squad', 'knowledge'] as const
export type Member = (typeof MEMBERS)[number]
/** 五件 skills 行 id（异 id——≠ 官方 base id `skill-filesystem`） */
export const memberSkillId = (member: Member): string => `skill-filesystem-${member}`
/** 五件 providerName（互异——≠ 默认名 `filesystem`） */
export const memberProvider = (member: Member): string => `filesystem-${member}`
/** 预设序位定值 pin（官方仓 preset 底稿核销 standard=1/forge=2） */
export const PRESET_FORGE_ORDER = 2
/** bundle patch 顶层 forge 行 id（异 id——bug 1102d9d8：≠ 官方 experimental-forge-bundle
 *  服务行 id `forge`，同 id 行合并整行替换官方服务行 → StartupError；
 *  用户裁定 2026-11-22 自 dshforge 改名 forge-bundle——官方同款构词） */
export const FORGE_ROW_ID = 'forge-bundle'
/** 六插行裸 id（forge 壳（id = FORGE_ROW_ID）+ 五件——dump-config insert 条目与详情页 RowsSection 同清单） */
export const SIX_ROW_IDS = [FORGE_ROW_ID, ...MEMBERS] as const

export { BARE_BUNDLES, COMBO_DB_REL, FORGE_PKG, SIX_PKGS, comboDbPath, comboEnv, comboGateOn, forgeInstallSource }
export type { ComboEnv }

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

// ── dump-config faces（skills 实例 / 六插行 / 预设 / db 派发） ─────────────────────────
export interface SkillRowFace {
  readonly id: string
  readonly providerName: string
  readonly customSkillDirsAnchored: boolean
  /** 行缩进列数（顶层承带行 ≤4、preset 子树嵌套实例 ≥6——1.34 技能预设独占判定锚） */
  readonly indent: number
}

/** 提取 dump-config 中的 skills 行（`- id: skill-filesystem*` 块：id + providerName + customSkillDirs 锚 + 缩进）。
 * 形态适配（真机收口轮实锚）：现行 dsh 世代 dump-config 的 skills 行随所属块缩进嵌套
 * （preset 行 6–8 空格 + providerName 在 config: 下）——行块按「下一个 `- id: ` 行」界定，
 * 不锁缩进字面。 */
export function skillRows(dump: string): readonly SkillRowFace[] {
  const lines = dump.split(/\r?\n/)
  const rows: SkillRowFace[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(/^(\s*)- id: (skill-filesystem\S*)\s*$/)
    if (m === null) continue
    const blockLines: string[] = []
    for (let j = i + 1; j < lines.length && !/^\s*- id: /.test(lines[j]!); j++) blockLines.push(lines[j]!)
    const block = blockLines.join('\n')
    const pm = block.match(/^[ \t]+providerName: (\S+)\s*$/m)
    rows.push({
      id: m[2]!,
      providerName: pm?.[1] ?? '(缺)',
      customSkillDirsAnchored: block.includes('customSkillDirs'),
      indent: m[1]!.length,
    })
  }
  return rows
}

/** 技能预设独占判定（1.34 收敛——CT-BIF-G8/G9 / CT-BPf-G4 / CT-BUn 同源判定）：
 * preset-forge 子树 skill-filesystem-forge 实例 + preset-headhunter 子树
 * skill-filesystem-expert-squad 实例在场（providerName + customSkillDirs 锚齐备）；
 * 标准模式（global 顶层）零成员 skills 行。 */
export function expectPresetSkillInstances(dump: string): void {
  const rows = skillRows(dump)
  for (const [id, provider] of [
    ['skill-filesystem-forge', 'filesystem-forge'],
    ['skill-filesystem-expert-squad', 'filesystem-expert-squad'],
  ] as const) {
    const hit = rows.find((r) => r.id === id)
    expect(hit, `preset 子树 skills 实例在场 ${id}`).toBeDefined()
    expect(hit!.providerName, `providerName ${provider}`).toBe(provider)
    expect(hit!.customSkillDirsAnchored, `customSkillDirs 混合锚在场 ${id}`).toBe(true)
    expect(hit!.indent, `实例随 preset 子树嵌套（非顶层承带）${id}`).toBeGreaterThanOrEqual(6)
  }
  const globals = rows.filter((r) => r.indent <= 4)
  expect(globals.map((r) => r.id), '标准模式零顶层成员 skills 行（技能预设独占收敛）').toEqual([])
  expect(rows.map((r) => r.id), '零官方 base id 行（fefd5149 双改负断言）').not.toContain('skill-filesystem')
  const providers = rows.map((r) => r.providerName)
  expect(new Set(providers).size, 'providerName 互异（INV-4）').toBe(providers.length)
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

/** order pin 判定（CT-BPf-G1/G9 pin 载体；CT-BPf-B3 反例注入的断言函数本体）。
 * 形态适配（真机收口轮实锚）：现行 dsh 世代 dump-config 预设行 id = `preset-<id>`
 * （preset-standard/preset-forge），order 落在行块 config: 下——按预设行 id 定位行块
 * （至下一个顶层 `- id: `），不锁 persona 行字面。 */
export function presetOrderOf(dump: string, presetId = 'preset-forge'): number | undefined {
  const start = dump.indexOf(`- id: ${presetId}`)
  if (start < 0) return undefined
  let end = dump.indexOf('\n- id: ', start + 1)
  if (end < 0) end = dump.length
  const order = Number(dump.slice(start, end).match(/^ {4}order: (\d+)$/m)?.[1])
  return Number.isFinite(order) ? order : undefined
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

// ── 跑批前置预检：commit charge（windows-commit-exhaustion 判例配方） ────────────────
/** commit charge 占比拒跑阈值（默认 90%——判例正本 ≥95% 判耗尽，90% 预留跑批余量） */
export const COMMIT_CHARGE_LIMIT_RATIO = 0.9

/**
 * 跑批前置预检（fail-loud）：commit charge ≥ 阈值即抛出拒跑——环境级资源耗尽时症状
 * 随机落进程（判例 2026-10-16），先拒跑防把环境卡顿误判为测试回归。诊断指引就地输出
 * （正本 docs/conventions/windows-commit-exhaustion.md）。非 Windows 零操作。
 */
export function preflightCommitCharge(limitRatio: number = COMMIT_CHARGE_LIMIT_RATIO): void {
  if (process.platform !== 'win32') return
  const res = spawnSync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', '$os = Get-CimInstance Win32_OperatingSystem; "$($os.TotalVirtualMemorySize) $($os.FreeVirtualMemory)"'],
    { encoding: 'utf8', windowsHide: true, timeout: 30_000 },
  )
  const nums = (res.stdout ?? '').trim().split(/\s+/).map(Number).filter((n) => Number.isFinite(n) && n > 0)
  if (res.status !== 0 || nums.length < 2) {
    throw new Error(`commit charge 预检失败（无法读取，exit=${String(res.status)} stderr=${String(res.stderr).slice(-300)}）——按 docs/conventions/windows-commit-exhaustion.md 手工核查后再跑批`)
  }
  const [totalKb, freeKb] = [nums[0]!, nums[1]!]
  const usedMb = Math.round((totalKb - freeKb) / 1024)
  const limitMb = Math.round(totalKb / 1024)
  const ratio = (totalKb - freeKb) / totalKb
  if (ratio >= limitRatio) {
    throw new Error(
      `commit charge ${usedMb} MB / ${limitMb} MB（${Math.round(ratio * 100)}% ≥ ${Math.round(limitRatio * 100)}%）——环境级资源耗尽风险，拒跑。` +
      `诊断指引（windows-commit-exhaustion 判例）：先清理孤儿 --watch 子进程 ` +
      `(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match '--watch' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force })，` +
      `症状族（exit 3221226505 / heap OOM / 0x800705AF）在此状态下落进程纯看运气，非测试回归`,
    )
  }
}

// ── 宿主失败取证指针（fail-fast 失败信号携带 boot stdout/stderr 落盘路径） ─────────────
/** 取证落盘根（可用 FORGE_BUNDLE_E2E_FORENSICS_DIR 定向到任务日志目录） */
const forensicsDir = (): string =>
  process.env.FORGE_BUNDLE_E2E_FORENSICS_DIR ?? join(tmpdir(), 'dsh-forge-bundle-host-forensics')

/** boot stdout/stderr 落盘取证，返回指针路径（启动失败/中途死亡时供失败信号携带） */
export function writeBootForensics(port: number, stdout: string, stderr: string): string {
  const dir = forensicsDir()
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `boot-${port}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`)
  writeFileSync(file, `# stdout\n${stdout}\n# stderr\n${stderr}\n`, 'utf8')
  return file
}

// ── 套件互斥锁（Workers=2 并行互扰修复——bundle 四套件共享隔离 home/profile 独占态，
// spec 文件按 workers 并行分派时共享夹具状态文件与正装互踩；跨文件串行化 = 隔离 home
// 级互斥锁承载，beforeAll 取锁 / afterAll 放锁） ─────────────────────────────────────
const SUITE_LOCK_POLL_MS = 1_000
/** 锁等待上界（FORGE_BUNDLE_E2E_LOCK_TIMEOUT_MS 可覆盖；缺省 45min——四套件串行全长余量） */
export const SUITE_LOCK_TIMEOUT_MS =
  Number.parseInt(process.env.FORGE_BUNDLE_E2E_LOCK_TIMEOUT_MS ?? '', 10) || 45 * 60_000

/** beforeAll 钩子上界（套件互斥锁等待 + 正装建成余量——锁等待可长达整套件时长） */
export const SUITE_HOOK_TIMEOUT_MS = SUITE_LOCK_TIMEOUT_MS + 120_000

const suiteLockFile = (env: ComboEnv): string => join(env.dshHome, '.forge-bundle-e2e-suite.lock')

function readSuiteLock(env: ComboEnv): string | null {
  try {
    const row = JSON.parse(readFileSync(suiteLockFile(env), 'utf8')) as { token?: string }
    return typeof row.token === 'string' && row.token !== '' ? row.token : null
  } catch {
    return null
  }
}

/**
 * 套件互斥锁获取（beforeAll 调用）：token = `${suiteId}@${pid}@${ts}`。在场锁持有进程
 * 已死（crash 泄漏）→ 陈旧锁强夺自愈；获取 = 写后复验自身 token（锁文件非原子读写——
 * 双写竞态时后写者复验失配退避重试）；超时 fail-loud。
 */
export async function acquireSuiteLock(env: ComboEnv, suiteId: string, timeoutMs: number = SUITE_LOCK_TIMEOUT_MS): Promise<void> {
  mkdirSync(env.dshHome, { recursive: true })
  const token = `${suiteId}@${process.pid}@${Date.now()}`
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const holder = readSuiteLock(env)
    const holderAlive = holder !== null && pidAlive(Number(holder.split('@')[1] ?? Number.NaN))
    if (holder === null || !holderAlive) {
      writeFileSync(suiteLockFile(env), JSON.stringify({ token }), 'utf8')
      if (readSuiteLock(env) === token) return
    }
    await new Promise((r) => setTimeout(r, SUITE_LOCK_POLL_MS))
  }
  throw new Error(`套件互斥锁获取超时（${String(timeoutMs)}ms）——当前持有者 ${String(readSuiteLock(env))}，锁文件 ${suiteLockFile(env)}`)
}

/** 套件互斥锁释放（afterAll 调用——仅持有者本人 suiteId 命中才删，防误删后继持有者） */
export function releaseSuiteLock(env: ComboEnv, suiteId: string): void {
  const holder = readSuiteLock(env)
  if (holder !== null && holder.startsWith(`${suiteId}@`)) {
    try {
      rmSync(suiteLockFile(env), { force: true })
    } catch {
      // 幂等（并发释放竞态零危害——后继持有者 token 不匹配即不删）
    }
  }
}

// ── 基建夹具共享（跨用例/跨套件持久态——两套件共用一次正装与一次宿主拉起） ───────────────
/**
 * 共享夹具状态以状态文件承载（落点 = 隔离 home，共享域 = FORGE_COMBO_DSH_HOME）。
 * 判例实证（1.15 第 003–005 轮探针）：本仓 Playwright 1.63 形态每用例独立进程/模块/
 * globalThis——worker fixture 亦逐用例重建，跨用例共享唯一可行缝 = 持久状态文件。
 * - installed：bundle 正装已建成（复用前状态复验：六包在场 + 代际门）
 * - host：共享宿主进程档案（pid/port/token/boot stdout 落盘）——存活即免 boot 附着复用；
 *   主动 stop 清档案；非主动死亡 → fatal
 * - fatal：fail-fast 闩——宿主拉起/存活失败置位，后续 ensureHost 秒级抛出整套中止
 *   （不再逐例吃 30–60s 断言超时）；仅成功拉起新宿主或共享正装重建时清除
 */
interface SharedHostRecord {
  readonly pid: number
  readonly port: number
  readonly token: string
  /** boot stdout 取证文件路径（附着侧 hostStdout 读面源） */
  readonly stdoutFile: string
}
interface SharedFixtureFile {
  fatal: string | null
  installed: boolean
  host: SharedHostRecord | null
}

const sharedStateFile = (env: ComboEnv): string => join(env.dshHome, '.forge-bundle-e2e-shared.json')

function readSharedState(env: ComboEnv): SharedFixtureFile {
  const file = sharedStateFile(env)
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as SharedFixtureFile
  } catch {
    return { fatal: null, installed: false, host: null }
  }
}

function writeSharedState(env: ComboEnv, patch: Partial<SharedFixtureFile>): void {
  const next = { ...readSharedState(env), ...patch }
  writeFileSync(sharedStateFile(env), JSON.stringify(next), 'utf8')
}

/** pid 存活探测（零子进程——process.kill 0 号信号探测） */
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function killByPid(pid: number): void {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // 已退出——幂等
    }
  }
}

/** boot stdout 读面（取证文件 stdout 段——G6 forge-bundle-apply 切片源；spec hostStdout 面） */
export function sharedHostStdout(env: ComboEnv): string {
  const record = readSharedState(env).host
  if (record === null || !existsSync(record.stdoutFile)) return ''
  const text = readFileSync(record.stdoutFile, 'utf8')
  return text.replace(/^# stdout\r?\n/, '').split(/\r?\n# stderr\r?\n/)[0] ?? ''
}

/** boot 取证全文读面（stdout + stderr——INV-3 loud-fail 断言切片源；激活失败落 stderr） */
export function sharedHostBootForensics(env: ComboEnv): string {
  const record = readSharedState(env).host
  if (record === null || !existsSync(record.stdoutFile)) return ''
  return readFileSync(record.stdoutFile, 'utf8')
}


/**
 * bundle 正装共享建成（幂等单次：purge → plugin add → 廉价代际门；已建成且状态复验
 * 通过即跳过——套件间状态隔离边界不破坏：卸载方 afterAll 须 invalidateInstalledShared；
 * 共享正装重建 = 新跑批基线，顺带清除 fail-fast 闩）。
 */
export async function ensureInstalledShared(env: ComboEnv, profile = 'web'): Promise<void> {
  const state = readSharedState(env)
  if (state.installed) {
    const nm = nodeModulesOf(env, profile)
    let intact = true
    try {
      expectSixPkgsPresent(nm)
      cheapGenerationGate(nm)
    } catch {
      intact = false
    }
    if (intact) return
  }
  await purgeBaseline(env, profile)
  const add = await pluginAdd(env, requireBundleSource(env), profile)
  expect(add.code, `bundle 正装（共享夹具单次建成，exit=${String(add.code)}）stderr=${add.stderr.slice(-400)}`).toBe(0)
  cheapGenerationGate(nodeModulesOf(env, profile))
  writeSharedState(env, { installed: true, fatal: null })
}

/** 正装共享态失效（卸载方 afterAll 调用——下一套件重建，零陈旧复用） */
export function invalidateInstalledShared(env: ComboEnv): void {
  writeSharedState(env, { installed: false })
}

/** 共享宿主取用（存活即免 boot 附着复用；fail-fast 闩置位即秒级抛出；拉起成功清闩） */
export async function ensureHostShared(env: ComboEnv, port: number): Promise<WebHost> {
  const state = readSharedState(env)
  if (state.fatal !== null) throw new Error(state.fatal)
  if (state.host !== null) {
    const record = state.host
    if (!pidAlive(record.pid)) {
      // 非主动 stop 的中途死亡 = 宿主环境级失败 → fail-fast 整套中止（取证指针就地落盘）
      writeSharedState(env, { host: null, fatal: `共享宿主进程中途退出（pid=${String(record.pid)}）——fail-fast 整套中止，boot stdout 见 ${record.stdoutFile}` })
      throw new Error(readSharedState(env).fatal!)
    }
    try {
      return await attachWebHost(env, record)
    } catch {
      // 附着失败（宿主 hang / WS 断连 / 共享态 pid 记录失配）→ 重试策略：定点回收旧
      // 实例 + 清档案 + 冷重建（不 fail-fast——pid 活但宿主不可服务属可恢复瞬态）
      killByPid(record.pid)
      writeSharedState(env, { host: null })
    }
  }
  try {
    const host = await launchWebHost(env, port)
    writeSharedState(env, { fatal: null })
    return host
  } catch (e) {
    writeSharedState(env, { fatal: e instanceof Error ? e.message : String(e) })
    throw e
  }
}

// ── chromium face 回收登记（套件侧泄漏修复——1.33 002 轮定谳） ────────────────────────
// stopHostShared 原只杀宿主进程不关 chromium：每个用例的浏览器 face（launchWebHost/
// attachWebHost 各一棵）逐用例泄漏——14 用例连跑后整机 commit charge 91% 触发
// preflightCommitCharge 拒跑（整套件环境级拒绝）+ WS 稳定性劣化。宿主 face 在创建时
// 登记于此，stopHostShared 统一回收（幂等：close 后 dispose 再关一次零危害）。
interface WebFaceHandle { dispose(): Promise<void> }
const liveWebFaces = new Set<WebFaceHandle>()

function registerWebFace(dispose: () => Promise<void>): void {
  const face: WebFaceHandle = {
    dispose: async () => {
      await dispose()
      liveWebFaces.delete(face)
    },
  }
  liveWebFaces.add(face)
}

/** 共享宿主主动停用（B3 类重启边界与 afterAll 回收——清档案不清闩，闩由成功拉起清除；
 * 附带回收全部在册 chromium face——零浏览器进程泄漏） */
export async function stopHostShared(env: ComboEnv): Promise<void> {
  for (const face of Array.from(liveWebFaces)) {
    await face.dispose().catch(() => undefined)
  }
  const record = readSharedState(env).host
  writeSharedState(env, { host: null })
  if (record !== null) killByPid(record.pid)
}

/**
 * web 页面上线锚等待（[data-slot]）——WS Reconnecting 卡滞死锁修复：bounded 重载重试
 * （3 次 × 45s，含 page.reload 连接面瞬态恢复；不无限等待、不弱化就绪锚语义），
 * 终败 fail-loud 携最后错误。
 */
// 预算收敛（1.33：重试预算必须落在 project 级 300s 测试超时内——预算超界时 Playwright
// 以裸 Test timeout 掩盖 fail-loud 信号，失败归因不可读）：2 次含重载重试，单次锚等待
// 30s，含 goto 全预算 ≤ ~2min——WS 卡滞宿主在测试超时前给出明确失败信号。
const SLOT_READY_ATTEMPTS = 2
const SLOT_READY_TIMEOUT_MS = 30_000

/** 首轮引导弹层关闭（官方 0.2 首轮「开始使用」登录门 / 「预览版说明」弹层——不关闭则
 * 页面交互面整体被遮挡）。缺席（非首轮附着）短窗探测即返回；在场则逐个经
 * 关闭/继续/跳过 按钮关闭（bounded，不无限等待）。 */
async function dismissFirstRunDialog(page: Page): Promise<void> {
  const dialogCount = async (): Promise<number> => await page.locator('[role="dialog"], dialog').count()
  if ((await dialogCount()) === 0) {
    await page.waitForSelector('[role="dialog"], dialog', { timeout: 5_000 }).catch(() => undefined)
  }
  const deadline = Date.now() + 20_000
  while ((await dialogCount()) > 0 && Date.now() < deadline) {
    const dialog = page.locator('[role="dialog"], dialog').first()
    const btn = dialog.getByRole('button', { name: /继续|关闭|跳过/ }).first()
    if ((await btn.count()) === 0) break
    await btn.click({ timeout: 3_000 }).catch(() => undefined)
    await new Promise((r) => setTimeout(r, 400))
  }
}
async function gotoSlotReady(page: Page, baseUrl: string, token: string): Promise<void> {
  let lastError = ''
  for (let attempt = 1; attempt <= SLOT_READY_ATTEMPTS; attempt++) {
    try {
      await page.goto(`${baseUrl}/?token=${encodeURIComponent(token)}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      await expect(page.locator('[data-slot]').first()).toBeVisible({ timeout: SLOT_READY_TIMEOUT_MS })
      await dismissFirstRunDialog(page)
      return
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined)
    }
  }
  throw new Error(
    `web 页面上线锚未就绪（[data-slot] ×${SLOT_READY_ATTEMPTS} 次含重载重试均超时——WS Reconnecting 卡滞/宿主未上线）：${lastError.slice(-400)}`,
  )
}

/**
 * 拉起官方 web 宿主（`dsh --profile web --no-open --port <port>`）+ Playwright chromium
 * 附着（boot stdout 提取 token URL → 303 cookie 会话 → 上线）。boot 就绪锚 = 官方 slot
 * 装配面 `[data-slot]`（官方机械锚——desktop 走查 precedent 同径；WS 卡滞经 gotoSlotReady
 * bounded 重载重试恢复）。成功即写共享宿主档案（pid/port/token/boot stdout 取证落盘）——
 * 后续 ensureHostShared 免 boot 附着复用。
 */
export async function launchWebHost(env: ComboEnv, port: number): Promise<WebHost> {
  const child = spawn(env.dshBin, ['--profile', 'web', '--no-open', '--port', String(port)], {
    env: { ...sanitizedCliEnv(env.dshHome), FORCE_COLOR: '1' },
    cwd: mkdtempSync(join(tmpdir(), 'dsh-forge-bundle-host-')),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    // shell:true 承载 PATH 解析（Node ≥22 spawn 对 .cmd shim 无 shell 直接 EINVAL——packTarball 同径判例）
    shell: process.platform === 'win32',
  })
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (c: Buffer) => { stdout += String(c) })
  child.stderr?.on('data', (c: Buffer) => { stderr += String(c) })
  const deadline = Date.now() + 120_000
  let token: string | undefined
  while (token === undefined && Date.now() < deadline) {
    token = extractBootToken(stdout, port)
    if (child.exitCode !== null) {
      const pointer = writeBootForensics(port, stdout, stderr)
      throw new Error(`web 宿主提前退出（exit=${String(child.exitCode)}）stderr 尾部=${stderr.slice(-600)}——fail-fast 取证指针=${pointer}`)
    }
    await new Promise((r) => setTimeout(r, 1_000))
  }
  if (token === undefined) {
    const pointer = writeBootForensics(port, stdout, stderr)
    throw new Error(`boot token 未出现（120s）stdout 尾部=${stdout.slice(-600)}——fail-fast 取证指针=${pointer}`)
  }
  const baseUrl = `http://127.0.0.1:${port}`
  const session = await establishWebAuthSession(baseUrl, token)
  expect(session, 'boot token → cookie 会话建立（零 Set-Cookie 即 fail-loud）').toBeDefined()
  expect(await sessionReady(baseUrl, session!.cookie), 'cookie 会话 GET / ok = web 宿主上线').toBe(true)

  const browser = await chromium.launch()
  const page = await browser.newContext({ locale: 'zh-CN' }).then((ctx) => ctx.newPage())
  const clientUrls: string[] = []
  page.on('response', (res) => {
    const url = res.url()
    if (url.includes('/node_modules/@dsh-forge/')) clientUrls.push(url)
  })
  registerWebFace(async () => { await browser.close().catch(() => undefined) })
  await gotoSlotReady(page, baseUrl, token)
  // 共享宿主档案（pid/port/token + boot stdout 取证落盘——附着侧免 boot 复用）
  const stdoutFile = writeBootForensics(port, stdout, stderr)
  writeSharedState(env, {
    host: { pid: child.pid!, port, token, stdoutFile },
  })
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

/**
 * 附着既有共享宿主（免 boot 复用——pid/token 档案命中）：cookie 会话 + chromium 附着，
 * 与 launchWebHost 同构（同一 slot 就绪锚 + WS 卡滞 bounded 重载重试）；child 以 pid
 * 存活探测的轻量替身承载（exitCode 惰性求值——G5/G8 宿主存活断言语义不变）。
 */
async function attachWebHost(env: ComboEnv, record: SharedHostRecord): Promise<WebHost> {
  const baseUrl = `http://127.0.0.1:${record.port}`
  const session = await establishWebAuthSession(baseUrl, record.token)
  expect(session, '共享宿主附着：boot token → cookie 会话建立').toBeDefined()
  expect(await sessionReady(baseUrl, session!.cookie), '共享宿主附着：cookie 会话 GET / ok = 宿主上线').toBe(true)
  const browser = await chromium.launch()
  const page = await browser.newContext({ locale: 'zh-CN' }).then((ctx) => ctx.newPage())
  const clientUrls: string[] = []
  page.on('response', (res) => {
    const url = res.url()
    if (url.includes('/node_modules/@dsh-forge/')) clientUrls.push(url)
  })
  registerWebFace(async () => { await browser.close().catch(() => undefined) })
  await gotoSlotReady(page, baseUrl, record.token)
  const child = {
    pid: record.pid,
    get exitCode(): number | null {
      return pidAlive(record.pid) ? null : 1
    },
  } as unknown as ChildProcess
  return {
    child,
    page,
    baseUrl,
    clientUrls,
    get stdout() { return sharedHostStdout(env) },
    close: async () => {
      await browser.close().catch(() => undefined)
      writeSharedState(env, { host: null })
      killByPid(record.pid)
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

// ── client apply 面（1.31 apply 化新形态锚——G10 装载往返判定面） ─────────────────────
/**
 * 安装副本 client face 入口文件（exports["./client"].default 声明物——1.31 client apply
 * 化后的装载面契约锚；声明缺席/指向物缺席 fail-loud）。
 */
export function clientFaceFile(nodeModules: string, pkg: string): string {
  const dir = join(nodeModules, '@dsh-forge', pkg.slice('@dsh-forge/'.length))
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    exports?: Record<string, { default?: string }>
  }
  const rel = manifest.exports?.['./client']?.default
  expect(rel, `client face 入口声明在场（exports["./client"].default）${pkg}`).toBeTruthy()
  const file = join(dir, ...rel!.replace(/^\.\//, '').split('/'))
  expect(existsSync(file), `client face bundle 在盘 ${file}`).toBe(true)
  return file
}
