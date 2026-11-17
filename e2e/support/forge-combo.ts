// forge-combo e2e 支撑层（plugin-forge-combo 1.5 脚本任务）——两条宿主路径最小链
// spec（tests/forge/<journey>/）共用机械锚读取面。
//
// 被测物 = plugin-manager 正式安装的 @dsh-forge/forge 组合器 + 五件依赖闭包
// （AGENTS 1.8——junction/dev 形态不作证据）。锚值核销来源：
// - 插行/集成 config：plugins/forge/cordis.patch.yml（1.3 落盘——五条 insert 行、
//   四件持库件 dbFile = {DSH_HOME}/forge/db/forge/forge.db、expert-squad 裸行）
// - forge-bundle-absent 诊断：apps/host/src/boot/child.ts forgeBundleAbsentPayloads
//   （fix-1——event 'forge-bundle-absent'、warn、逐件携裸包名 + reason）
// 环境门（真机收口轮置位，避免常规跑批误入）：
//   FORGE_COMBO_E2E=1             总门（缺省整组 skip——台账 e2e/SMOKE-LEDGER.md）
//   FORGE_COMBO_DSH_HOME=<dir>    隔离 dsh home（profiles/* 与 forge/db 落此）
//   FORGE_COMBO_FORGE_DIR=<dir>   forge 目录（缺省 <repo>/plugins/forge）
//   FORGE_COMBO_DESKTOP_EXE=<exe> desktop 宿主安装产物 exe（旅程 1）
//   FORGE_COMBO_DESKTOP_DSH=<bin> desktop 通道 CLI（缺省 'dsh'——desktop profile
//                                 为保留名，npm CLI 拒管（CT-NPM-02）；desktop 通道经
//                                 Desktop 内置命令环境执行，旅程 1 契约 Input 同形）
import { execFile } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import Database from 'better-sqlite3'

const pexec = promisify(execFile)

/** 仓库根（e2e/support 同 launch.ROOT 三级口径） */
export const ROOT = join(import.meta.dirname, '..', '..')

/** forge 组合器插行声明的五件裸名行（cordis.patch.yml insert 序——契约锚） */
export const BARE_BUNDLES = [
  '@dsh-forge/project',
  '@dsh-forge/spec',
  '@dsh-forge/task-loop',
  '@dsh-forge/expert-squad',
  '@dsh-forge/knowledge',
] as const

/** 组合器包名（对账条目） */
export const FORGE_PKG = '@dsh-forge/forge'

/** 六包 = forge + 五件闭包（CT-DISK-01 State——六目录非空判据） */
export const SIX_PKGS: readonly string[] = [FORGE_PKG, ...BARE_BUNDLES]

/** patch 下发共库目标（{DSH_HOME} 占位符物化后的相对段——契约 CT-DISK-03/CT-NPM-04 锚值） */
export const COMBO_DB_REL = join('forge', 'db', 'forge', 'forge.db')

/** 单装缺省库相对段（回落对照面——CT-NPM-05 负向锚） */
export const DEFAULT_PROJECT_DB_REL = join('forge', 'db', 'project', 'project.db')
export const DEFAULT_TASKLOOP_DB_REL = join('forge', 'db', 'task-loop', 'task-loop.db')

/** 真机收口总门（缺省 skip——SMOKE-LEDGER 留痕） */
export function comboGateOn(): boolean {
  return process.env.FORGE_COMBO_E2E === '1'
}

export interface ComboEnv {
  readonly dshHome: string
  readonly dshBin: string
  readonly forgeDir: string
  readonly desktopExe?: string
  readonly desktopDshBin: string
}

/** 隔离环境面（总门开启后必填项缺失 = 配置错误 fail-loud，不静默 skip） */
export function comboEnv(): ComboEnv {
  // 收口期收集（--list/加载期）总门未开时不 fail-loud——整组 skip 下本返回值零消费
  if (!comboGateOn()) return { dshHome: '', dshBin: 'dsh', forgeDir: join(ROOT, 'plugins', 'forge'), desktopDshBin: 'dsh' }
  const dshHome = process.env.FORGE_COMBO_DSH_HOME
  const desktopExe = process.env.FORGE_COMBO_DESKTOP_EXE
  if (dshHome === undefined || dshHome === '') throw new Error('FORGE_COMBO_DSH_HOME 未置位（隔离 dsh home 必填）')
  return {
    dshHome,
    dshBin: process.env.FORGE_COMBO_DSH_BIN ?? 'dsh',
    forgeDir: process.env.FORGE_COMBO_FORGE_DIR ?? join(ROOT, 'plugins', 'forge'),
    ...(desktopExe === undefined ? {} : { desktopExe }),
    desktopDshBin: process.env.FORGE_COMBO_DESKTOP_DSH ?? 'dsh',
  }
}

export interface CliResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

/** run-once CLI 执行（DSH_HOME 定向隔离 home；非零退出码捕获不抛——失败面断言用） */
export async function runDsh(bin: string, args: readonly string[], dshHome: string): Promise<CliResult> {
  const env = { ...process.env, DSH_HOME: dshHome } as Record<string, string>
  try {
    const { stdout, stderr } = await pexec(bin, [...args], { env, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
    return { code: 0, stdout, stderr }
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string }
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? String(err) }
  }
}

/** profile 对账面：{DSH_HOME}/profiles/<name>/package.json → dsh.profile.bundles */
export function installedBundles(dshHome: string, profile: string): readonly string[] {
  const file = join(dshHome, 'profiles', profile, 'package.json')
  if (!existsSync(file)) return []
  const pkg = JSON.parse(readFileSync(file, 'utf8')) as { dsh?: { profile?: { bundles?: string[] } } }
  return pkg.dsh?.profile?.bundles ?? []
}

export function profileNodeModules(dshHome: string, profile: string): string {
  return join(dshHome, 'profiles', profile, 'node_modules')
}

/** 安装闭包目录读面（@dsh-forge/<short> 形） */
export function installedPkgDir(nodeModules: string, pkg: string): string {
  return join(nodeModules, '@dsh-forge', pkg.slice('@dsh-forge/'.length))
}

/** 仓内源包目录（闭包零改写对照 + 版本双校验源侧） */
export function sourcePkgDir(pkg: string): string {
  return join(ROOT, 'plugins', pkg.slice('@dsh-forge/'.length))
}

function readPkgJson(dir: string): { version?: string; dsh?: { client?: { platform?: string } } } {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version?: string; dsh?: { client?: { platform?: string } } }
}

/** 版本双校验（AGENTS 1.8 前置——安装 manifest 版本 == 仓内源版本；不符调用侧即停取证） */
export function versionPairs(nodeModules: string): readonly { pkg: string; installed: string; source: string }[] {
  return SIX_PKGS.map((pkg) => {
    const installed = readPkgJson(installedPkgDir(nodeModules, pkg)).version ?? '(缺)'
    const source = readPkgJson(sourcePkgDir(pkg)).version ?? '(缺)'
    return { pkg, installed, source }
  })
}

/**
 * 版本双校验——单包形态（bug c26a8c2a fix-4：pnpm 11.0.9 将 link: 依赖物化进链接包自身
 * node_modules，profile 侧六包布局锚结构性失效；npm 通道（CT-NPM-*）版本双校验收窄至
 * forge 组合器条目——add 目标直挂物化，与依赖物化布局无关）。
 */
export function comboEntryVersionPair(nodeModules: string): { pkg: string; installed: string; source: string } {
  const installed = readPkgJson(installedPkgDir(nodeModules, FORGE_PKG)).version ?? '(缺)'
  const source = readPkgJson(sourcePkgDir(FORGE_PKG)).version ?? '(缺)'
  return { pkg: FORGE_PKG, installed, source }
}

/**
 * CT-DISK-01 通道专用：六包物化目录在场且非空（pnpm 嵌套相对 file: 依赖解析物化——
 * 目录存在 + 至少一个条目；返回缺陷清单供 expect 逐条断言）。
 * 注（bug c26a8c2a fix-4）：npm 通道（CT-NPM-*）不再用本锚——link: 依赖物化位置随
 * 包管理器版本漂移，闭包解析改锚运行期冷启动装载行为（CT-NPM-03）。
 */
export function closureGaps(nodeModules: string): readonly string[] {
  const gaps: string[] = []
  for (const pkg of SIX_PKGS) {
    const dir = installedPkgDir(nodeModules, pkg)
    if (!existsSync(dir)) {
      gaps.push(`${pkg}: 目录缺席 ${dir}`)
      continue
    }
    if (readdirSync(dir).length === 0) gaps.push(`${pkg}: 目录为空 ${dir}`)
  }
  return gaps
}

/**
 * dsh.client.platform 指向物（client 半侧装载文件锚——CT-DISK-02/CT-NPM-03）。
 * 解析随装载链（bug c26a8c2a fix-4：不锁单一物化布局）——先查 profile 侧
 * node_modules，缺席则回落链接包自身 node_modules（pnpm 11.x link: 依赖物化位）。
 */
export function clientBundleFiles(nodeModules: string): readonly { pkg: string; file: string; exists: boolean }[] {
  const fallbackRoot = join(installedPkgDir(nodeModules, FORGE_PKG), 'node_modules')
  return BARE_BUNDLES.map((pkg) => {
    const roots = [nodeModules, fallbackRoot]
    const declared = roots.map((root) => {
      const dir = installedPkgDir(root, pkg)
      return existsSync(join(dir, 'package.json')) ? (readPkgJson(dir).dsh?.client?.platform ?? undefined) : undefined
    }).find((p) => p !== undefined)
    if (declared === undefined) return { pkg, file: '(未声明)', exists: false }
    const root = roots.find((r) => existsSync(join(installedPkgDir(r, pkg), declared))) ?? roots[0]
    const file = join(installedPkgDir(root, pkg), declared)
    return { pkg, file, exists: existsSync(file) }
  })
}

/** 共库/单装缺省库绝对路径 */
export function comboDbPath(dshHome: string): string {
  return join(dshHome, COMBO_DB_REL)
}
export function defaultProjectDb(dshHome: string): string {
  return join(dshHome, DEFAULT_PROJECT_DB_REL)
}
export function defaultTaskLoopDb(dshHome: string): string {
  return join(dshHome, DEFAULT_TASKLOOP_DB_REL)
}

/** SQLite 只读开库（WAL 并发读口径；调用侧负责 close） */
export function openSqliteReadonly(file: string): Database.Database {
  return new Database(file, { readonly: true, fileMustExist: true })
}

/** 库内用户表名全集（sqlite_master——排除 sqlite 内部表） */
export function sqliteTables(file: string): readonly string[] {
  const db = openSqliteReadonly(file)
  try {
    const rows = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
      .all() as readonly { name: string }[]
    return rows.map((r) => r.name)
  } finally {
    db.close()
  }
}

/**
 * 派发运营日志发现面：{DSH_HOME}/forge-workspaces 下递归收集 logs/<slug>.jsonl
 * （task_home = {tasksHome}/{flatten}@{hash8}——deriveDirName 派生，slug 层单文件追加；
 * 域路径不预设——父目录名 = 'logs' 即收集，机械锚）。
 */
export function findDispatchLogs(dshHome: string): readonly string[] {
  const root = join(dshHome, 'forge-workspaces')
  const hits: string[] = []
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && entry.name.endsWith('.jsonl') && entry.parentPath !== undefined && entry.parentPath.split(/[\\/]/).pop() === 'logs') {
        hits.push(full)
      }
    }
  }
  walk(root)
  return hits
}

/** forge-bundle-absent 诊断事件名（fix-1 实锚——CT-DISK-07/CT-NPM-06 意向锚回填形态） */
export const FORGE_BUNDLE_ABSENT_EVENT = 'forge-bundle-absent'
