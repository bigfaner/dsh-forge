// forge-combo e2e 支撑层（plugin-forge-combo 1.5 脚本任务；1.15 扩 desktop 实锚读面）——
// 两条宿主路径最小链 spec（tests/forge/<journey>/）共用机械锚读取面。
//
// 被测物 = plugin-manager 正式安装的 @dsh-forge/forge 组合器 + 五件依赖闭包
// （AGENTS 1.8——junction/dev 形态不作证据）。锚值核销来源：
// - 插行/集成 config：plugins/forge/cordis.patch.yml（1.3 落盘——五条 insert 行、
//   四件持库件 dbFile = {DSH_HOME}/forge/db/forge/forge.db、expert-squad 裸行）
// - forge-bundle-absent 诊断：apps/host/src/boot/child.ts forgeBundleAbsentPayloads
//   （fix-1——event 'forge-bundle-absent'、warn、逐件携裸包名 + reason）
// - desktop profile 落点实锚（G3 核销，收口批 1.11 修订留痕）：apps/host/src/profile/
//   paths.ts resolveHostPaths——packaged 形态 profileDir = {userData}/profile；
//   {DSH_HOME}/profiles/desktop 恒不产生（反向锚）。诊断落盘面 = apps/host/src/
//   telemetry/host-wiring.ts——logsDir = {userData}/logs（app-YYYYMMDD.jsonl）。
// - 发布树（1.12 打包门交付物）：scripts/package-release.mjs assembleRelease 出树——
//   聚合 forge = <tree>/forge（五条相对 file: 兄弟依赖）、solo 变体 = <tree>/solo/forge
//   （零 file: 依赖 + 裸名插行原样）、五件成员 = <tree>/<bareId>/。
// 环境门（真机收口轮置位，避免常规跑批误入）：
//   FORGE_COMBO_E2E=1             总门（缺省整组 skip——台账 e2e/SMOKE-LEDGER.md）
//   FORGE_COMBO_DSH_HOME=<dir>    隔离 dsh home（profiles/* 与 forge/db 落此）
//   FORGE_COMBO_FORGE_DIR=<dir>   forge 目录（缺省 <repo>/plugins/forge）
//   FORGE_COMBO_RELEASE_TREE=<dir> 1.12 发布树（desktop solo 通道——CT-DISK-09 路 C 安装物）
//                                 fix-24：npm 通道安装源同锚（forgeInstallSource 单源——发布树 forge
//                                 优先，worktree 稳定路径 file: 虚拟 store CAS 陈旧副本规避）
//   FORGE_COMBO_DESKTOP_EXE=<exe> desktop 宿主安装产物 exe（旅程 1）
//   FORGE_COMBO_DESKTOP_DSH=<bin> desktop 通道 CLI（直跑形态——040 轮定谳为错锚形态
//                                 退役：643a40df GUI no-op + e65b24c8 store 错锚；现行
//                                 desktop 通道 CLI = 官方 packaged invocation（runDesktopChannelCli，
//                                 锚 FORGE_COMBO_DESKTOP_EXE））
//   FORGE_COMBO_NPM_SOURCE_DIR=<dir> npm 通道闭包物化安装源（bug 8c4b8e35 修复面——
//                                 build-forge-copy-variant.mjs 无 --strip-config 出树
//                                 forge 条目；link: add 不装依赖闭包，聚合源必须为
//                                 pnpm install 物化五件解析闭包的仓外副本）
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import Database from 'better-sqlite3'
import { PROFILE_ALLOW_BUILDS, allowBuildsYamlLine } from '../../apps/host/src/profile/template.js'

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

/** bundle patch 顶层 forge 行 id（异 id——bug 1102d9d8：≠ 官方 experimental-forge-bundle
 *  服务行 id `forge`，同 id 行合并整行替换官方服务行 → 官方 forge/forgeSession 缺席 → StartupError） */
export const FORGE_ROW_ID = 'dshforge'

/** 包名 → dump-config 插行行 id（forge 壳行 id = FORGE_ROW_ID 异 id，五件 = 裸名同值） */
export function rowIdForPkg(bare: string): string {
  return bare === FORGE_PKG ? FORGE_ROW_ID : bare.slice('@dsh-forge/'.length)
}

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
  /** 1.12 发布树（desktop solo 通道安装物——CT-DISK-09 路 C；收口轮置位） */
  readonly releaseTree?: string
  /** bug 8c4b8e35 修复面：npm 通道闭包物化安装源（build-forge-copy-variant.mjs 无
   * --strip-config 出树 forge 条目——聚合形态 + pnpm install 物化五件解析闭包） */
  readonly npmSourceDir?: string
}

/** 隔离环境面（总门开启后必填项缺失 = 配置错误 fail-loud，不静默 skip） */
export function comboEnv(): ComboEnv {
  // 收口期收集（--list/加载期）总门未开时不 fail-loud——整组 skip 下本返回值零消费
  if (!comboGateOn()) return { dshHome: '', dshBin: 'dsh', forgeDir: join(ROOT, 'plugins', 'forge'), desktopDshBin: 'dsh' }
  const dshHome = process.env.FORGE_COMBO_DSH_HOME
  const desktopExe = process.env.FORGE_COMBO_DESKTOP_EXE
  if (dshHome === undefined || dshHome === '') throw new Error('FORGE_COMBO_DSH_HOME 未置位（隔离 dsh home 必填）')
  const releaseTree = process.env.FORGE_COMBO_RELEASE_TREE
  const npmSourceDir = process.env.FORGE_COMBO_NPM_SOURCE_DIR
  return {
    dshHome,
    dshBin: process.env.FORGE_COMBO_DSH_BIN ?? 'dsh',
    forgeDir: process.env.FORGE_COMBO_FORGE_DIR ?? join(ROOT, 'plugins', 'forge'),
    ...(desktopExe === undefined ? {} : { desktopExe }),
    desktopDshBin: process.env.FORGE_COMBO_DESKTOP_DSH ?? 'dsh',
    ...(releaseTree === undefined || releaseTree === '' ? {} : { releaseTree }),
    ...(npmSourceDir === undefined || npmSourceDir === '' ? {} : { npmSourceDir }),
  }
}

/**
 * fix-24 安装通道单源 + bug 8c4b8e35 修复面：npm 通道 `file:` add 的安装物源目录
 * （CT-NPM-01/02/03 与 web 校准轮 add 共用本函数取源——安装通道配方单源化，禁 spec
 * 各自带路径；协议 = file: 而非 link:——link: 不装 link 目标依赖闭包，file: 把五件
 * 装载闭包物化进 profile 侧）。
 *
 * 闭包物化源优先：FORGE_COMBO_NPM_SOURCE_DIR 置位且 <dir>/forge/package.json 在场 →
 * 返回该目录（build-forge-copy-variant.mjs 出树的仓外闭包物化副本——聚合 forge +
 * pnpm install 物化五件解析闭包）。根因（bug 8c4b8e35 定谳）：npm 通道 `link:` add
 * 不安装 link 目标的依赖闭包（63a9a2b8 同一机械——fix-17 已实证），发布树聚合 forge
 * 的五条相对 file: 兄弟依赖在 profile 侧完全零物化（039 轮实锚：profile 侧仅 forge
 * junction、.pnpm 空）→ 五件冷启动解析缺席。fix-24 的发布树源只解决 CAS 陈旧副本
 * （键按源路径编码），不解决 link: 闭包零物化——闭包物化面补齐 = 安装源改仓外闭包
 * 物化副本（junction 指向副本，Node 解析经 junction 达副本内 node_modules——CT-NPM-05
 * GREEN 同配方）。置位但 forge 缺席 = 配置形漂移，fail-loud。
 *
 * 发布树次优：FORGE_COMBO_RELEASE_TREE 置位且 <tree>/forge/package.json 在场 →
 * 返回 <tree>/forge（聚合形态，五条相对 file: 兄弟依赖指向同代发布树成员）。
 * 根因（issues/fix-24/findings.md 定谳）：pnpm file: 依赖虚拟 store CAS 键按依赖
 * 源路径编码（store v11 顶层 `file+<相对路径编码>_<hash>` 键目录实测），worktree
 * 稳定路径逐代复用同键 CAS 副本——036 轮实证「先 install 后 build」固化无 dist
 * 陈旧副本后，删 .pnpm 副本重装仍命中（CAS 不刷新），装载闭包断裂。发布树为
 * 一次性目录（package-release 每代新出树），路径逐代不同 → CAS 键天然逐代不同，
 * 陈旧副本不可达。
 *
 * 双源均缺席回落 env.forgeDir（worktree 形——CAS 陈旧风险回归 + 闭包零物化回归，
 * 仅存开发自跑形态；真机收口轮必须置位 FORGE_COMBO_NPM_SOURCE_DIR）。
 */
export function forgeInstallSource(env: Pick<ComboEnv, 'forgeDir' | 'releaseTree' | 'npmSourceDir'>): string {
  if (env.npmSourceDir !== undefined && env.npmSourceDir !== '') {
    if (!existsSync(join(env.npmSourceDir, 'package.json'))) {
      throw new Error(`npm 通道闭包物化安装源 forge 目录缺席（${env.npmSourceDir}）——FORGE_COMBO_NPM_SOURCE_DIR 形漂移 fail-loud（bug 8c4b8e35）`)
    }
    return env.npmSourceDir
  }
  if (env.releaseTree !== undefined && env.releaseTree !== '') {
    const releaseForge = join(env.releaseTree, 'forge')
    if (!existsSync(join(releaseForge, 'package.json'))) {
      throw new Error(`发布树 forge 目录缺席（${releaseForge}）——FORGE_COMBO_RELEASE_TREE 形漂移 fail-loud（fix-24）`)
    }
    return releaseForge
  }
  return env.forgeDir
}
export interface VirtualStoreStaleViolation {
  readonly pkg: string
  readonly storeDir: string
  readonly detail: string
}

/**
 * fix-24 陈旧 CAS 副本守卫：扫描 profile 侧 pnpm 虚拟 store（node_modules/.pnpm）
 * 中 @dsh-forge 的 file: 依赖副本（目录名 `@dsh-forge+<bare>@file+<hash>` 形，
 * pnpm 11 观测截断为 `@fil_<hash>`），按各副本 manifest exports 解析 entry 指向物——
 * 指向物缺席 = 「先 install 后 build」固化无 dist 的陈旧 CAS 副本签名（036 轮
 * project/task-loop/expert-squad 装载闭包断裂实锚），返回违例清单供 expect 逐条断言。
 * store 根缺席（未安装/布局漂移）零贡献；无 exports 声明的副本不判（非 entry 契约面）。
 */
export function staleVirtualStoreCopies(profileNodeModules: string): readonly VirtualStoreStaleViolation[] {
  const storeRoot = join(profileNodeModules, '.pnpm')
  if (!existsSync(storeRoot)) return []
  const violations: VirtualStoreStaleViolation[] = []
  for (const entry of readdirSync(storeRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('@dsh-forge+') || !entry.name.includes('@fil')) continue
    const bare = entry.name.slice('@dsh-forge+'.length).split('@')[0]
    const storeDir = join(storeRoot, entry.name)
    const pkgDir = join(storeDir, 'node_modules', '@dsh-forge', bare)
    const pkgFile = join(pkgDir, 'package.json')
    if (!existsSync(pkgFile)) {
      violations.push({ pkg: `@dsh-forge/${bare}`, storeDir, detail: '虚拟 store 副本 manifest 缺席' })
      continue
    }
    const manifest = JSON.parse(readFileSync(pkgFile, 'utf8')) as { exports?: Record<string, string | { import?: string; default?: string }> }
    const e = manifest.exports?.['.']
    const rel = typeof e === 'string' ? e : e?.import ?? e?.default
    if (rel === undefined) continue
    if (!existsSync(join(pkgDir, rel))) {
      violations.push({ pkg: `@dsh-forge/${bare}`, storeDir, detail: `entry 指向物缺席 ${rel}（无 dist 陈旧 CAS 副本签名——fix-24）` })
    }
  }
  return violations
}
export interface CliResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

/**
 * CLI 子进程环境消毒（fix-17）：剥离宿主会话可能携带的 dsh profile 定向覆盖变量
 * （DSH_PROFILE/DSH_PROFILE_DIR——优先级高于 --profile/DSH_HOME，泄漏即子进程全部
 * 命令读到宿主 profile 而非隔离 home，取证面整轮失真），隔离 home 单点由 DSH_HOME
 * + --profile 显式承载。
 */
export function sanitizedCliEnv(dshHome: string, extraEnv: Record<string, string> = {}): Record<string, string> {
  const env = { ...process.env, DSH_HOME: dshHome } as Record<string, string>
  delete env.DSH_PROFILE
  delete env.DSH_PROFILE_DIR
  // 子进程解析面隔离（fix-20 单变量实证）：
  // ①NODE_PATH（playwright worker 注入宿主检出 .pnpm 模块根）——dsh CLI 模块解析泄漏进
  //   宿主依赖树（0.2.0-rc.2 世代混入安装闭包），dsh 版本门即拒装（allow-version 洪泛）；
  // ②INIT_CWD（npm exec 注入宿主检出路径）——pnpm 把宿主检出当执行工作区；
  // ③npm_config_registry（npm exec 自用户 .npmrc 注入镜像源）——registry 与 spec pin 非同源。
  // 三者剥离，安装闭包与 registry spec pin 单源同径、零宿主漂移。
  delete env.NODE_PATH
  delete env.INIT_CWD
  delete env.npm_config_registry
  // ④ELECTRON_RUN_AS_NODE（harness 宿主 electron 注入）——缺省剥离：定向 dsh 宿主
  //   electron 即纯 node 形态运行，web 宿主永不上线（fix-20 Run 9 实证「web 校准宿主
  //   上线」红）。
  delete env.ELECTRON_RUN_AS_NODE
  // extraEnv 在消毒删除之后合并（bug 643a40df/e65b24c8 修复面）——显式注入对冲消毒
  // 语义：desktop 通道官方 packaged invocation 需复注入 ELECTRON_RUN_AS_NODE=1 +
  // DSH_DESKTOP_PNPM_ENTRY/RUNNER（resources/packaged-pnpm-invocation.mjs 契约常量
  // PACKAGED_PNPM_ENTRY_ENV/PACKAGED_PNPM_RUNNER_ENV——0.14.0 实树核销），调用侧显式
  // 传参即定向覆盖，缺省形态仍全量剥离。
  return Object.assign(env, extraEnv)
}

/** run-once CLI 执行（DSH_HOME 定向隔离 home；extraEnv 补充 desktop 通道 userData 面等；非零退出码捕获不抛——失败面断言用） */
export async function runDsh(bin: string, args: readonly string[], dshHome: string, extraEnv: Record<string, string> = {}): Promise<CliResult> {
  const env = sanitizedCliEnv(dshHome, extraEnv)
  try {
    const { stdout, stderr } = await pexec(bin, [...args], { env, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024, shell: process.platform === 'win32' })
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

/** 版本双校验（AGENTS 1.8 前置——安装 manifest 版本 == 仓内源版本；不符调用侧即停取证）。
 * pkgs 可选收窄（fix-39：卸载段相位只校验残留件——已卸条目物理缺席为契约预期非回归） */
export function versionPairs(nodeModules: string, pkgs?: readonly string[]): readonly { pkg: string; installed: string; source: string }[] {
  return (pkgs ?? SIX_PKGS).map((pkg) => {
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
 * 代际戳标记（M-3 五件代际漂移程序化探针——服务面特有标记）。
 * 各件 bundle-client.mjs 在 bundle banner 注入 `@dsh-forge-generation:<pkg>@<version>`
 * 注释标记（构建期单点写入，
 * 随安装世代快照拷贝——1.8 轮陈旧代际事故的教训固化：manifest 版本一致 ≠ 服务面
 * bundle 同代，服务面文件必须自证其代际）。
 */
export function generationMarker(pkg: string, version: string): string {
  return `@dsh-forge-generation:${pkg}@${version}`
}

export interface GenerationViolation {
  readonly pkg: string
  readonly kind: 'manifest' | 'service-face'
  readonly detail: string
}

export interface GenerationDriftOptions {
  /** 仓内五件源包根（缺省 ROOT/plugins；单测夹具可注入隔离目录） */
  readonly sourcePluginsRoot?: string
}

/** 装载面入口读面：exports["./client"].default（manifest 声明的服务面 bundle 文件——不锁物化布局） */
function clientFaceRel(dir: string): string | undefined {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    exports?: Record<string, { default?: string }>
  }
  const rel = pkg.exports?.['./client']?.default
  return typeof rel === 'string' && rel !== '' ? rel : undefined
}

/**
 * 冷启动解析读面（bug a9404b5d 再锚机械）：从解析基 roots 逐个以 Node 解析 <pkg>
 * 入口（package.json "." 声明），命中后上溯定位包目录（package.json 所在层）。
 * 判据 = 装载行为面（运行期冷启动解析）而非物化布局——解析基为包目录（profile 目录
 * /forge 条目目录），Node 按装载链同径查 node_modules（直挂物化 / 嵌套物化 / 回链
 * 安装源均命中；dir 已名 node_modules 时 Node 跳过该层——故锚 profile 目录而非
 * node_modules 本身）。全 roots 解析缺席 → undefined（调用侧 fail-loud）。
 */
const anchorRequire = createRequire(join(ROOT, 'package.json'))

/** 解析命中后自入口文件上溯定位包目录（package.json 所在层，至多五层） */
function pkgDirFromEntry(entry: string): string | undefined {
  let dir = dirname(entry)
  for (let depth = 0; depth < 5; depth++) {
    if (existsSync(join(dir, 'package.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

/**
 * 解析基下的包目录候选（Node node_modules 上溯语义：解析基本身已名 node_modules 时
 * 不再叠一层——嵌套物化解析基 node_modules/@dsh-forge/forge/node_modules 直接承载包条目）。
 */
function pkgDirCandidates(root: string, pkg: string): readonly string[] {
  const segments = pkg.split('/')
  return basename(root) === 'node_modules' ? [join(root, ...segments)] : [join(root, 'node_modules', ...segments)]
}

/** ESM-only 解析回落（bug b4c4d1d7）：exports["."] 声明物（import/default 条件）存在性探针 */
function esmEntryPkgDir(root: string, pkg: string): string | undefined {
  for (const dir of pkgDirCandidates(root, pkg)) {
    const pkgFile = join(dir, 'package.json')
    if (!existsSync(pkgFile)) continue
    const manifest = JSON.parse(readFileSync(pkgFile, 'utf8')) as {
      exports?: Record<string, string | { import?: string; default?: string }>
    }
    const entry = manifest.exports?.['.']
    const rel =
      typeof entry === 'string'
        ? entry
        : typeof entry?.import === 'string'
          ? entry.import
          : typeof entry?.default === 'string'
            ? entry.default
            : undefined
    if (rel === undefined) continue
    const faceFile = join(dir, ...rel.replace(/^\.\//, '').split('/'))
    if (existsSync(faceFile)) return dir
  }
  return undefined
}

function resolveInstalledPkgDir(resolutionRoots: readonly string[], pkg: string): string | undefined {
  // 形态①（CJS 条件可达——exports["."] 声明 require/default 条件）：require.resolve
  for (const root of resolutionRoots) {
    try {
      const entry = anchorRequire.resolve(pkg, { paths: [root] })
      const dir = pkgDirFromEntry(entry)
      if (dir !== undefined) return dir
    } catch {
      // 该解析基解析缺席——下一解析基（不锁单一物化位置）
    }
  }
  // 形态②（bug b4c4d1d7：ESM-only exports["."]——真实五件 types+import 双条件、无
  // require/default，CJS 解析恒 ERR_PACKAGE_PATH_NOT_EXPORTED 误判解析缺席）。探针
  // 运行形态核销 = Node ESM（vitest，node ≥22.12）——冷启动装载走 ESM import 条件，
  // 回落 exports["."] import/default 声明物存在性探针（与装载行为同判据），双形态兼容。
  for (const root of resolutionRoots) {
    const dir = esmEntryPkgDir(root, pkg)
    if (dir !== undefined) return dir
  }
  return undefined
}

/**
 * 代际探针解析基（bug a9404b5d 再锚）：①profile 目录解析基（profile package.json
 * 所在层——冷启动解析主路径：add 目标直挂物化 + 运行期回链安装源均经 Node 解析命中）；
 * ②forge 条目嵌套 node_modules 候选（pnpm v11 link: 依赖嵌套物化位——c26a8c2a fix-4
 * 同径回落；判据本体不锚布局，此根仅扩解析候选集）。
 */
function generationResolutionRoots(nodeModules: string): readonly string[] {
  const roots = [dirname(nodeModules)]
  const nested = join(nodeModules, '@dsh-forge', 'forge', 'node_modules')
  if (existsSync(nested)) roots.push(nested)
  return roots
}

/**
 * 仓外副本五件 entry 冷启动解析缺口（bug 63a9a2b8 行为锚——fix-17）：
 * npm 通道 link: add 不安装 link 目标依赖闭包，五件成员必须自副本解析基经 Node
 * node_modules 上溯解析可达。判据 = 装载/解析行为面（resolveInstalledPkgDir 同径
 * 双形态：CJS require.resolve + ESM exports["."] 声明物存在性），不锁物化布局——
 * 解析基由调用侧给（典型 = [副本 forge 目录, 副本根]；物化在 forge 自身
 * node_modules 或根级 hoist 均命中）。全基解析缺席逐件回报，调用侧 expect([]) fail-loud。
 */
export function bundleResolutionGaps(resolutionRoots: readonly string[], pkgs: readonly string[] = BARE_BUNDLES): readonly string[] {
  const gaps: string[] = []
  for (const pkg of pkgs) {
    if (resolveInstalledPkgDir(resolutionRoots, pkg) === undefined) gaps.push(`${pkg}: 副本解析基冷启动解析缺席（解析基 ${resolutionRoots.join(' | ')} 均不可达——解析闭包断裂）`)
  }
  return gaps
}

/**
 * M-3 五件裸包代际漂移程序化探针——安装/装载后逐件双校验，任一件代际陈旧即违例
 * （调用侧 expect 违例清单 == [] 即 fail-loud；AGENTS 1.8 廉价校验前置纪律）：
 * ① manifest：冷启动解析安装件 → package.json version == 仓内源 version；
 * ② 服务面：安装 exports["./client"] 指向物含现行代际标记 generationMarker（陈旧
 *    世代快照的 bundle 无现行标记 → 红）。
 * 装载行为锚（bug a9404b5d 再锚——stale-anchor 三律判例「锚布局不锚行为」）：先经
 * 冷启动 Node 解析定位安装件（不锁 pnpm 物化布局），解析缺席/版本漂移/服务面缺席/
 * 标记缺席逐件回报，一次收全清单；解析基正反自证见 generation-drift 单测（嵌套
 * 物化形态正向绿 + 陈旧嵌套副本反向红 + 闭包断裂反向红）。
 */
export function generationDriftViolations(nodeModules: string, opts: GenerationDriftOptions = {}): readonly GenerationViolation[] {
  const sourceRoot = opts.sourcePluginsRoot ?? join(ROOT, 'plugins')
  const resolutionRoots = generationResolutionRoots(nodeModules)
  const violations: GenerationViolation[] = []
  for (const pkg of BARE_BUNDLES) {
    const short = pkg.slice('@dsh-forge/'.length)
    const sourceVersion = readPkgJson(join(sourceRoot, short)).version ?? '(缺)'
    const installedDir = resolveInstalledPkgDir(resolutionRoots, pkg)
    if (installedDir === undefined) {
      violations.push({ pkg, kind: 'manifest', detail: `冷启动解析缺席（解析基均无法解析 ${pkg} 入口——装载闭包断裂）` })
      continue
    }
    const installedVersion = readPkgJson(installedDir).version ?? '(缺)'
    if (installedVersion !== sourceVersion) {
      violations.push({ pkg, kind: 'manifest', detail: `安装 manifest ${installedVersion} ≠ 仓内源 ${sourceVersion}（代际陈旧）` })
    }
    const rel = clientFaceRel(installedDir)
    if (rel === undefined) {
      violations.push({ pkg, kind: 'service-face', detail: 'exports["./client"] 服务面入口未声明' })
      continue
    }
    const faceFile = join(installedDir, ...rel.replace(/^\.\//, '').split('/'))
    if (!existsSync(faceFile)) {
      violations.push({ pkg, kind: 'service-face', detail: `服务面 bundle 缺席 ${faceFile}` })
      continue
    }
    const marker = generationMarker(pkg, sourceVersion)
    if (!readFileSync(faceFile, 'utf8').includes(marker)) {
      violations.push({ pkg, kind: 'service-face', detail: `服务面缺现行代际标记 ${marker}（陈旧 bundle）` })
    }
  }
  return violations
}

/**
 * bug d36710e5 陈旧副本遮蔽探针——安装宿主 runtime node_modules 内五件裸包捆绑副本
 * 代际核销（539b7413 复发形态）：desktop 通道 resolveBundleDir installation-first——
 * runtime 已捆绑的副本会遮蔽 solo add 的 link: 安装物；副本无 dsh 字段 = 陈旧标记
 * （0.30.6 世代捆绑副本无 dsh.bundle/dsh.client 声明 → 组装判「plain dependency」
 * 不进层）。副本在场且无 dsh 字段 → 违例清单非空，调用侧 fail-loud 留痕（不静默
 * 误判五件层清单）；无捆绑副本或副本带 dsh 字段 → 零违例。
 */
export interface RuntimeShadowViolation {
  readonly pkg: string
  readonly path: string
  readonly version: string
  readonly detail: string
}

export function staleRuntimeShadowCopies(
  runtimeNodeModules: string,
  opts: GenerationDriftOptions = {},
): readonly RuntimeShadowViolation[] {
  const sourceRoot = opts.sourcePluginsRoot ?? join(ROOT, 'plugins')
  const violations: RuntimeShadowViolation[] = []
  for (const pkg of BARE_BUNDLES) {
    const dir = installedPkgDir(runtimeNodeModules, pkg)
    const pkgFile = join(dir, 'package.json')
    if (!existsSync(pkgFile)) continue
    const manifest = JSON.parse(readFileSync(pkgFile, 'utf8')) as { version?: string; dsh?: unknown }
    if (manifest.dsh !== undefined) continue
    const sourceVersion = readPkgJson(join(sourceRoot, pkg.slice('@dsh-forge/'.length))).version ?? '(缺)'
    violations.push({
      pkg,
      path: dir,
      version: manifest.version ?? '(缺)',
      detail: `安装宿主 runtime 陈旧副本遮蔽：${pkg}@${manifest.version ?? '(缺)'} 无 dsh 字段` +
        `（仓内源 ${sourceVersion}，组装判 plain dependency 不进层）——solo add 装载前先换装现行宿主世代或卸除该副本`,
    })
  }
  return violations
}

/**
 * desktop 目标宿主安装树发现面（bug 21f0e9a7/d36710e5 遮蔽闸错树锚定修正）：
 * 自目标宿主安装产物 exe（FORGE_COMBO_DESKTOP_EXE）单源派生安装根与其下两处
 * 陈旧副本候选层——①resources/runtime/node_modules（runtime 捆绑层）、
 * ②resources/app.asar.unpacked/node_modules（asar 解包捆绑层）。
 * 锚定纪律：禁自通道 CLI bin 上溯发现——CLI bin 可解析至 harness 本检出 dev 依赖树
 * （与 desktop 通道零关——0.30.6 误报根因即错读该树）；候选层缺席 = 目标宿主
 * 零捆绑副本实态，空段贡献（不 throw）。
 */
export interface DesktopInstallShadowLayers {
  readonly installRoot: string
  readonly runtimeNodeModules?: string
  readonly asarUnpackedNodeModules?: string
}

export function desktopInstallShadowLayers(desktopExe: string): DesktopInstallShadowLayers {
  // 第三读路径关断（033 轮遮蔽读点核销——fix-21）：dsh-forge.exe 为 harness 本体旧打包
  // 安装树（其 resources/runtime 捆绑 @dsh-forge 0.30.6 无 dsh 字段副本——033 轮「遮蔽
  // 未消」误报实读源，真机核销：目标宿主 'DSH Desktop' 安装树两候选层零 @dsh-forge），
  // 与目标 desktop 宿主零关。锚到该树 = 结构性错树，fail-loud 拒读（不静默产出遮蔽判读）。
  if (basename(desktopExe).toLowerCase() === 'dsh-forge.exe') {
    throw new Error(
      `遮蔽闸错锚（第三读路径关断）：${desktopExe} 为 dsh-forge harness 本体安装树` +
        '（resources/runtime 捆绑 @dsh-forge 0.30.6 陈旧副本，033 轮遮蔽误报实读源），非目标 desktop 宿主安装产物' +
        "——FORGE_COMBO_DESKTOP_EXE 须锚目标宿主 exe（'DSH Desktop.exe' 形）",
    )
  }
  const installRoot = dirname(resolve(desktopExe))
  const runtimeNodeModules = join(installRoot, 'resources', 'runtime', 'node_modules')
  const asarUnpackedNodeModules = join(installRoot, 'resources', 'app.asar.unpacked', 'node_modules')
  return {
    installRoot,
    ...(existsSync(join(runtimeNodeModules, '@dsh-forge')) ? { runtimeNodeModules } : {}),
    ...(existsSync(join(asarUnpackedNodeModules, '@dsh-forge')) ? { asarUnpackedNodeModules } : {}),
  }
}

/**
 * d36710e5 遮蔽闸（目标宿主安装树锚）：两候选层逐层 staleRuntimeShadowCopies，
 * 在场层核销陈旧副本（无 dsh 字段 = 陈旧标记）、缺席层零贡献——目标宿主
 * resources/runtime 目录不存在 + app.asar.unpacked 无 @dsh-forge 捆绑副本的实态下
 * 恒零违例（GREEN）。
 */
export function desktopInstallShadowViolations(
  desktopExe: string,
  opts: GenerationDriftOptions = {},
): readonly RuntimeShadowViolation[] {
  const layers = desktopInstallShadowLayers(desktopExe)
  const violations: RuntimeShadowViolation[] = []
  for (const nodeModules of [layers.runtimeNodeModules, layers.asarUnpackedNodeModules]) {
    if (nodeModules !== undefined) violations.push(...staleRuntimeShadowCopies(nodeModules, opts))
  }
  return violations
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
 * client 半侧装载锚（CT-DISK-02/CT-NPM-03 step-4）双面：
 * - file = manifest exports["./client"] 声明物（default/import 条件——物理 face 文件，
 *   与 generationDriftViolations clientFaceRel 同一契约锚；存在性断言面）；
 * - urlSeg = `<pkg 短名>/<dsh.client.platform>`（历史观察段——HTTP 取件路由经 fix-34
 *   根修改锚（bug d22957df）：官方 client-modules 组合 URL `plugins/??<pkg>/client.js,…&rev=`，
 *   `/node_modules/<urlSeg>` 非官方路由恒 404；urlSeg 仅存留作 platform 字面量观察面。
 *   platform = 'web' 字面量为官方 resolveMeta 等值判定键，非文件路径）。
 * 解析随装载链（bug c26a8c2a fix-4：不锁单一物化布局）——先查 profile 侧
 * node_modules，缺席则回落链接包自身 node_modules。
 */
export function clientBundleFiles(nodeModules: string): readonly { pkg: string; urlSeg: string; file: string; exists: boolean }[] {
  const fallbackRoot = join(installedPkgDir(nodeModules, FORGE_PKG), 'node_modules')
  return BARE_BUNDLES.map((pkg) => {
    const short = pkg.slice('@dsh-forge/'.length)
    const roots = [nodeModules, fallbackRoot]
    let urlSeg = `${short}/web`
    const face = roots.map((root) => {
      const dir = installedPkgDir(root, pkg)
      if (!existsSync(join(dir, 'package.json'))) return undefined
      const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
        exports?: Record<string, string | { default?: string; import?: string }>
        dsh?: { client?: { platform?: string } }
      }
      const platform = manifest.dsh?.client?.platform
      if (typeof platform === 'string' && platform !== '') urlSeg = `${short}/${platform}`
      const e = manifest.exports?.['./client']
      const rel = typeof e === 'string' ? e : e?.default ?? e?.import
      return typeof rel === 'string' && rel !== '' ? rel : undefined
    }).find((p) => p !== undefined)
    if (face === undefined) return { pkg, urlSeg, file: '(未声明)', exists: false }
    const root = roots.find((r) => existsSync(join(installedPkgDir(r, pkg), ...face.replace(/^\.\//, '').split('/')))) ?? roots[0]
    const file = join(installedPkgDir(root, pkg), ...face.replace(/^\.\//, '').split('/'))
    return { pkg, urlSeg, file, exists: existsSync(file) }
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
 * fix-9 落点单一事实源：task-loop tasksHome（{DSH_HOME} 占位 !!js 表达式，fix-9
 * b90e94bf patch 下发键）——自 plugins/forge/cordis.patch.yml 正本现读，不在本文件
 * 硬编码目录字面（bug c422e5f0：落点再迁移时本锚自动跟迁，不再发同族 stale-anchor）。
 * 求值为封闭枚举：表达式仅允许 `process.env.DSH_HOME && (process.env.DSH_HOME + '<字面段>')`
 * 形状，字面段取自正本、本文件零目录字面；形状漂移即 fail-loud。
 */
export function taskLoopTasksHome(dshHome: string): string {
  const yml = readFileSync(join(ROOT, 'plugins', 'forge', 'cordis.patch.yml'), 'utf8')
  const expr = yml.match(/^\s*tasksHome:\s*!!js\s+(.+)$/m)?.[1]
  if (expr === undefined) throw new Error('单一事实源断裂：cordis.patch.yml task-loop tasksHome 表达式缺席（fix-9 落点锚）')
  const literal = expr.match(/^process\.env\.DSH_HOME && \(process\.env\.DSH_HOME \+ '(\/.+?)'\)$/)?.[1]
  if (literal === undefined) throw new Error(`单一事实源漂移：tasksHome 表达式形状超出封闭枚举（fix-9 落点锚）：${expr}`)
  return join(dshHome, ...literal.split('/').filter((seg) => seg !== ''))
}

/**
 * 派发运营日志发现面：task-loop tasksHome（fix-9 落点 = taskLoopTasksHome 单一事实源——
 * bug c422e5f0 自 {DSH_HOME}/forge-workspaces 旧落点跟迁）下递归收集 logs/<slug>.jsonl
 * （task_home = {tasksHome}/{flatten}@{hash8}——deriveDirName 派生，slug 层单文件追加；
 * 域路径不预设——父目录名 = 'logs' 即收集，机械锚）。
 */
export function findDispatchLogs(dshHome: string): readonly string[] {
  const root = taskLoopTasksHome(dshHome)
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

// ── 构建脚本批准面固化（bug a85b6816 / 台账留痕 dff389f6 —— fix-20）──────────────────
//
// registry 通道 add 新初始化 profile（dsh CLI init 落 pnpm-workspace.yaml，allowBuilds
// 全占位值 `set this to true or false` = 未批准）→ pnpm 11 拦截构建脚本 exit 1
//（ERR_PNPM_IGNORED_BUILDS，026-webloop 与 fix-20/001-repro 双轮同签名）。修复 =
// 消费侧批准面固化：安装前把单源批准表（apps/host template.ts PROFILE_ALLOW_BUILDS）
// 逐键写 true——dsh init 对已存在文件零触碰（fix-20/001-repro Round B 实证），add
// 即 exit 0，零临场交互。

/** profile pnpm-workspace.yaml 路径 */
export function profileWorkspaceFile(dshHome: string, profile: string): string {
  return join(dshHome, 'profiles', profile, 'pnpm-workspace.yaml')
}

/**
 * 批准面缺口读面：单源批准表逐键核对 profile pnpm-workspace.yaml `allowBuilds` 块——
 * 文件缺席 / allowBuilds 块缺席 / 键缺席 / 值非 true（含 dsh init 占位值）逐条回报。
 * 调用侧 expect([]) fail-loud；ensureProfileBuildApprovals 后恒零缺口。
 */
export function profileBuildApprovalGaps(dshHome: string, profile: string): readonly string[] {
  const file = profileWorkspaceFile(dshHome, profile)
  if (!existsSync(file)) {
    return Object.keys(PROFILE_ALLOW_BUILDS).map((pkg) => `${pkg}: pnpm-workspace.yaml 缺席 ${file}`)
  }
  const text = readFileSync(file, 'utf8')
  const block = text.match(/^allowBuilds:\r?\n((?:[ \t]+.*\r?\n?)*)/m)?.[1] ?? ''
  return Object.entries(PROFILE_ALLOW_BUILDS).flatMap(([pkg, allowed]) => {
    const line = block.match(new RegExp(`^[ \\t]+'?${pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'?:[ \\t]*(.+)$`, 'm'))?.[1]?.trim()
    if (line === undefined) return [`${pkg}: allowBuilds 键缺席`]
    if (line !== String(allowed)) return [`${pkg}: allowBuilds 值 '${line}' ≠ '${String(allowed)}'（未批准/漂移）`]
    return []
  })
}

/** 最小 profile workspace yaml（单源批准表全键 true——round B 实证形态） */
function minimalWorkspaceYaml(): string {
  return [
    'packages:',
    '  - .',
    '',
    'nodeLinker: hoisted',
    'autoInstallPeers: false',
    'allowBuilds:',
    ...Object.entries(PROFILE_ALLOW_BUILDS).map(([pkg, allowed]) => allowBuildsYamlLine(pkg, allowed)),
    '',
  ].join('\n')
}

/**
 * 批准面固化（消费侧写入）：profile pnpm-workspace.yaml 缺席 → 写最小 yaml（单源
 * 全键 true）；在场 → 缺口键就地补齐（缺 allowBuilds 块补块、缺键/占位值/漂移值改
 * true，其余行零触碰）。dsh init 对已存在文件零触碰（001-repro Round B 实证）——
 * add 前调用即固化，registry 通道安装零临场交互。
 */
export function ensureProfileBuildApprovals(dshHome: string, profile: string): void {
  const file = profileWorkspaceFile(dshHome, profile)
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, minimalWorkspaceYaml(), 'utf8')
    return
  }
  const text = readFileSync(file, 'utf8')
  let next = text
  const approved = Object.entries(PROFILE_ALLOW_BUILDS)
    .map(([pkg, allowed]) => allowBuildsYamlLine(pkg, allowed))
    .join('\n')
  if (/^allowBuilds:\r?$/m.test(next)) {
    for (const [pkg, allowed] of Object.entries(PROFILE_ALLOW_BUILDS)) {
      const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const linePattern = new RegExp(`^([ \\t]+'?${escaped}'?:)[ \\t]*(.*)$`, 'm')
      const hit = next.match(linePattern)
      if (hit === null || hit[2]!.trim() !== String(allowed)) {
        next = hit === null
          ? next.replace(/^allowBuilds:\r?$/m, `allowBuilds:\n${allowBuildsYamlLine(pkg, allowed)}`)
          : next.replace(linePattern, `$1 ${String(allowed)}`)
      }
    }
  } else {
    next = next.replace(/\r?\n?$/, `\nallowBuilds:\n${approved}\n`)
  }
  if (next !== text) writeFileSync(file, next, 'utf8')
}

/**
 * registry 校准 profile 固化（消费侧预物化，bug a85b6816 / dff389f6 fix-20 闭环面）：
 * dsh CLI 对 package.json 缺席的 profile 走 initProfile 默认背板（按 CLI 安装世代 pin
 * 基座包——与 registry spec pin 混代即触发 dsh 版本门「installation rejected …
 * incompatible / allow-version --accept-risk」，fix-20 真机 Round C 实证）；package.json
 * 在场则 init 整体跳过（dsh-app-boot `!existsSync(package.json)` 门——Round D 实证
 * exit 0）。本面在 add 前预物化：
 * ①package.json（spec pins 直挂 dependencies + dsh.profile.bundles——已存在零触碰）；
 * ②pnpm-workspace.yaml 构建脚本批准面（ensureProfileBuildApprovals 单源全键 true）。
 * registry 通道 add 即零临场交互 exit 0。
 */
export function ensureRegistryProfile(dshHome: string, profile: string, specs: readonly string[]): void {
  const dir = join(dshHome, 'profiles', profile)
  const pkgFile = join(dir, 'package.json')
  if (!existsSync(pkgFile)) {
    const deps: Record<string, string> = {}
    for (const spec of specs) {
      const at = spec.lastIndexOf('@')
      if (at <= 0) throw new Error(`registry spec 形状超封闭枚举（须 name@version）：${spec}`)
      deps[spec.slice(0, at)] = spec.slice(at + 1)
    }
    const pkg = {
      name: `dsh-profile-${profile}`,
      private: true,
      version: '0.0.0',
      dependencies: deps,
      dsh: { profile: { bundles: Object.keys(deps) } },
    }
    mkdirSync(dir, { recursive: true })
    writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
  }
  ensureProfileBuildApprovals(dshHome, profile)
}

// ── desktop 通道实锚读面（fix-23 定谳改锚——0.13.2 asar 实锚；bug a96e09a5） ──────────
// 定谳（asar 反读 D:/software/DSH Desktop/resources/app.asar out/main/index.js 实锚）：
// 0.13.2 packaged 形态 userData 恒 = %APPDATA%\dsh-desktop（configureAppIdentity 硬编码
// app.setPath，全 main 零 DSH_FORGE_USER_DATA/DSH_HOME 消费——隔离 env 无缝，app 永不读
// 临时目录）；profile 实锚 = {userData}/harness/profiles/web（web profile + .generations
// projection；G3 旧锚 {userData}/profile 为 0.12.x 世代残留，0.13.2 无 "desktop" reserved
// profile，boots "launch requested (web profile)"）。本组读面入参语义同步改锚：
// userData = desktop 真实 userData（desktopRealUserData() 单源派生），禁传临时目录。

/** desktop 真实 userData（asar 实锚单源：%APPDATA%\dsh-desktop——0.13.2 packaged 恒读此路径） */
export function desktopRealUserData(): string {
  const appData = process.env.APPDATA
  if (appData === undefined || appData === '') throw new Error('APPDATA 未置位（desktop 真实 userData 派生必填）')
  return join(appData, 'dsh-desktop')
}

/** desktop harness home（{userData}/harness——desktop main dshHome 实锚，harness spawn env DSH_HOME 即此值） */
export function desktopHarnessHome(userData: string): string {
  return join(userData, 'harness')
}

// ── desktop 通道 CLI = 官方 packaged invocation（bug 643a40df/e65b24c8 修复面；1.23
// 0.14.0 实树真锚改锚）─────────────────────────────────────────────────────────────
// 核销纪律留痕（AGENTS 1.1——承重假设到官方包源码核销；本机 0.14.0 实树取证）：
// ①643a40df GUI no-op：直跑 Electron GUI 二进制（DSH Desktop.exe 形）作 CLI——子进程走
//   GUI 形态：`plugin add` 秒退 exit 0、零安装、零输出（假成功）。GUI 二进制不承载 CLI
//   执行形态，直跑即错锚。
// ②e65b24c8 store 错锚：CLI 直跑形态下 plugin-manager 走 PATH `pnpm`（v11 全局 store），
//   而消费面 profile 由 desktop app 官方链以打包 pnpm 10.9 物化（v10 store）→
//   ERR_PNPM_UNEXPECTED_STORE 拒装。官方采纳点 = DSH_DESKTOP_PNPM_ENTRY/RUNNER env
//   契约（resources/packaged-pnpm-invocation.mjs buildPackagedPnpmInvocation 实锚：
//   读 env → { command: execPath, args:[runner?, entry], env:{ELECTRON_RUN_AS_NODE:'1'} }
//   → runCli({ packageManager })）。
// ③checkout 桌面源码落后于已装版——harness-node-entry.mjs 为臆造锚（官方 checkout
//   d593e52 全树零匹配 + 本机 0.14.0 实树 resources/ 无该文件），已删除；锚以实树为准。
// 0.14.0 实树真锚三件套（asar 反读 out/main/index.js + out/main/host.js 核销）：
// - resources/packaged-pnpm-invocation.mjs（官方 packaged invocation 契约面——env 常量
//   与 buildPackagedPnpmInvocation 定义体，实文件 fail-loud 可探测）；
// - app.asar 内 node_modules/@deepseek-ai/dsh/lib/bin.js（CLI entry——host.js
//   registerOfficeEngineResolution 同径实锚；asar 内路径纯 node fs 不可探测，运行期自证）；
// - ELECTRON_RUN_AS_NODE=1 注入面（desktop main desktopNodeEnvironment + host.js
//   packageManager.env + .desktop-bin pnpm.cmd shim 三处同锚——electron 二进制以 node
//   形态运行 CLI/pnpm 子进程链）。
// 配套实锚：打包 pnpm entry = app.asar.unpacked/node_modules/pnpm/bin/pnpm.cjs
// （asar.unpacked 实文件，主进程 pnpmEntryPath() 同径——fail-loud 可探测）；lock-recovery
// runner = app.asar 内 dsh-desktop-market-installer/pnpm-runner.mjs（主进程
// pluginPnpmRunnerPath() 同径，运行期自证）。
// 根修 = 复用官方缝（reuse-first）：desktop 通道 CLI 一律经官方 packaged invocation
// 形态执行——electron 二进制 + ELECTRON_RUN_AS_NODE=1 + app.asar 内 CLI entry +
// DSH_DESKTOP_PNPM_ENTRY/RUNNER 注入 → 打包 pnpm 10.9 + v10 store 对齐，add 真安装
// （拒装消除 + 假成功消除）。

export interface DesktopCliChannel {
  /** desktop 宿主安装产物 exe（electron 二进制——ELECTRON_RUN_AS_NODE=1 下作 node 运行面） */
  readonly electronBin: string
  /** resources/packaged-pnpm-invocation.mjs（官方 packaged invocation 契约面——0.14.0 实树真锚） */
  readonly invocationModule: string
  /** app.asar 内 dsh CLI entry（@deepseek-ai/dsh/lib/bin.js——host.js installAnchor 同径） */
  readonly cliEntry: string
  /** app.asar.unpacked 内打包 pnpm entry（pnpm/bin/pnpm.cjs——DSH_DESKTOP_PNPM_ENTRY 值） */
  readonly pnpmEntry: string
  /** app.asar 内 lock-recovery runner（pnpm-runner.mjs——DSH_DESKTOP_PNPM_RUNNER 值） */
  readonly pnpmRunner: string
}

/**
 * desktop 通道 CLI 通道发现面：自目标宿主安装产物 exe 单源派生官方 packaged invocation
 * 全参（0.14.0 实树真锚——desktop main pnpmEntryPath/pluginPnpmRunnerPath 同径）。
 * 结构性锚（实文件逐条 fail-loud）= exe 在场 + resources/packaged-pnpm-invocation.mjs
 * 在场 + resources/app.asar 在场 + app.asar.unpacked 打包 pnpm entry 在场；
 * cliEntry/pnpmRunner 为 asar 内路径（纯 node fs 不可探测），运行期自证（CLI 版本输出
 * + 安装行为断言）。
 */
export function desktopCliChannel(desktopExe: string): DesktopCliChannel {
  const installRoot = dirname(resolve(desktopExe))
  const resources = join(installRoot, 'resources')
  const invocationModule = join(resources, 'packaged-pnpm-invocation.mjs')
  const appAsar = join(resources, 'app.asar')
  const asarRoot = join(appAsar, 'node_modules')
  const unpackedRoot = join(resources, 'app.asar.unpacked', 'node_modules')
  if (!existsSync(desktopExe)) throw new Error(`desktop 宿主 exe 缺席：${desktopExe}（desktop 通道锚必填——643a40df）`)
  if (!existsSync(invocationModule)) throw new Error(`packaged-pnpm-invocation.mjs 缺席：${invocationModule}（官方 packaged invocation 契约面——0.14.0 实树结构锚，非 desktop 宿主安装树即错锚）`)
  if (!existsSync(appAsar)) throw new Error(`app.asar 缺席：${appAsar}（CLI entry/pnpm runner 承载面——错锚 fail-loud）`)
  const pnpmEntry = join(unpackedRoot, 'pnpm', 'bin', 'pnpm.cjs')
  if (!existsSync(pnpmEntry)) throw new Error(`打包 pnpm entry 缺席：${pnpmEntry}（app.asar.unpacked 实文件——desktop main pnpmEntryPath 同径实锚，非 desktop 宿主安装树即错锚）`)
  return {
    electronBin: resolve(desktopExe),
    invocationModule,
    cliEntry: join(asarRoot, '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
    pnpmEntry,
    pnpmRunner: join(asarRoot, 'dsh-desktop-market-installer', 'pnpm-runner.mjs'),
  }
}

/**
 * desktop 通道 CLI 执行环境：官方 packaged invocation 注入面——ELECTRON_RUN_AS_NODE=1
 * （electron 二进制以 node 形态运行 CLI 及其 pnpm 子进程链——0.14.0 host.js
 * packageManager.env + desktop main desktopNodeEnvironment 同锚语义）+
 * DSH_DESKTOP_PNPM_ENTRY/RUNNER（resources/packaged-pnpm-invocation.mjs 契约常量——
 * buildPackagedPnpmInvocation 读入 → runCli({ packageManager }) → 打包 pnpm 10.9 →
 * 消费面 v10 store 对齐——e65b24c8 拒装消除）。经 sanitizedCliEnv(extraEnv) 消毒后
 * 合并（显式注入对冲缺省剥离）。
 */
export function desktopCliChannelEnv(channel: DesktopCliChannel): Record<string, string> {
  return {
    ELECTRON_RUN_AS_NODE: '1',
    DSH_DESKTOP_PNPM_ENTRY: channel.pnpmEntry,
    DSH_DESKTOP_PNPM_RUNNER: channel.pnpmRunner,
    // fix-38 裂脑根修（bug 6b9789ee 因④）：e2e 全局 TMP 隔离链把 USERPROFILE 重定向
    // .e2e-tmp（global-setup → sanitizedLaunchEnv 同族）——desktop 官方 packaged invocation
    // 的 pnpm 子进程链在重定向 env 下 remove 语义断裂（add 可过/remove exit 1 实录，
    // 044/045/003 轮同构）；desktop 通道 = single-user real 档案（fix-23 定谳锚），显式
    // 回传真实 APPDATA/USERPROFILE 对齐官方装载面。
    APPDATA: process.env.APPDATA ?? '',
    USERPROFILE: homedir(),
  }
}

/**
 * desktop 通道 CLI run-once 执行：electron 二进制 [cliEntry, ...args]（ELECTRON_RUN_AS_NODE=1
 * 注入面——0.14.0 实树无 harness-node-entry.mjs 中间缝，CLI entry 直跑即官方 node 形态）+
 * desktopCliChannelEnv 注入（官方 packaged invocation 全形）。非零退出码捕获不抛
 * （runDsh 同径——失败面断言用）。
 */
export async function runDesktopChannelCli(channel: DesktopCliChannel, args: readonly string[], dshHome: string): Promise<CliResult> {
  return runDsh(channel.electronBin, [channel.cliEntry, ...args], dshHome, desktopCliChannelEnv(channel))
}

/** desktop profile 落点实锚（0.13.2：{userData}/harness/profiles/web——bootstrap DesktopStorageManager + profile maintenance 实锚） */
export function desktopProfileDir(userData: string): string {
  return join(userData, 'harness', 'profiles', 'web')
}

export function desktopProfileNodeModules(userData: string): string {
  return join(desktopProfileDir(userData), 'node_modules')
}

/** desktop 已装清单：{userData}/profile/package.json → dsh.profile.bundles */
export function desktopInstalledBundles(userData: string): readonly string[] {
  const file = join(desktopProfileDir(userData), 'package.json')
  if (!existsSync(file)) return []
  const pkg = JSON.parse(readFileSync(file, 'utf8')) as { dsh?: { profile?: { bundles?: string[] } } }
  return pkg.dsh?.profile?.bundles ?? []
}

/** desktop profile 侧包条目目录（@dsh-forge/<short> 形） */
export function desktopPkgEntryDir(userData: string, pkg: string): string {
  return join(desktopProfileNodeModules(userData), '@dsh-forge', pkg.slice('@dsh-forge/'.length))
}

/** desktop generation registry（`.generations` projection——0.13.2 asar 实锚：generation 物化目录 + desired 清单落此） */
export function desktopGenerationsDir(userData: string): string {
  return join(userData, 'harness', 'profiles', '.generations')
}

/** desktop profile 侧包条目物化形态（CT-DISK-01/10 两态锚——禁止第三态）：link = `.generations` 投影符号链接；dir = 共享树直装；absent = 条目缺席 */
export type DesktopPkgEntryForm = 'link' | 'dir' | 'absent'

/** 条目物化形态读面（asar 判据 `target.includes('.generations')`——链接指 .generations 外目标归 dir 域外，不作 link） */
export function desktopPkgEntryForm(userData: string, pkg: string): DesktopPkgEntryForm {
  const entry = desktopPkgEntryDir(userData, pkg)
  const st = lstatSync(entry, { throwIfNoEntry: false })
  if (st === undefined) return 'absent'
  try {
    if (readlinkSync(entry).includes('.generations')) return 'link'
  } catch {
    // 非链接条目（真实目录）——dir 态
  }
  return 'dir'
}

/** desktop 诊断事件行（host-wiring logsDir = {userData}/logs app-YYYYMMDD.jsonl——非 JSON 行容忍跳过） */
export interface DesktopDiagEvent {
  readonly file: string
  readonly line: number
  readonly level: string
  readonly event: string
  readonly message: string
}

export function desktopDiagEvents(userData: string): readonly DesktopDiagEvent[] {
  const logsDir = join(userData, 'logs')
  const out: DesktopDiagEvent[] = []
  if (!existsSync(logsDir)) return out
  const files = readdirSync(logsDir).filter((n) => /^app-\d{8}\.jsonl$/u.test(n)).sort()
  for (const name of files) {
    const file = join(logsDir, name)
    const lines = readFileSync(file, 'utf8').split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? ''
      if (line.trim() === '') continue
      try {
        const o = JSON.parse(line) as { event?: unknown; message?: unknown; level?: unknown }
        if (typeof o.event === 'string') {
          out.push({ file, line: i + 1, level: typeof o.level === 'string' ? o.level : '', event: o.event, message: typeof o.message === 'string' ? o.message : '' })
        }
      } catch {
        // 非 JSON 行（截断/写中）容忍跳过——诊断读面为只读观察，不判 FAIL
      }
    }
  }
  return out
}

/** desktop forge-bundle-absent 事件全集（CT-DISK-07 留痕正锚 / CT-DISK-11 零发射反锚） */
export function desktopAbsenceEvents(userData: string): readonly DesktopDiagEvent[] {
  return desktopDiagEvents(userData).filter((e) => e.event === FORGE_BUNDLE_ABSENT_EVENT)
}

/**
 * dump-config insert 条目断言字面（bug 13ffb081 fix-7 序列化形状——
 * `- id: <bareId>` 行 + 缩进 `  name: '<bare>'` 行，\r?\n CRLF 容忍；
 * 实锚样本 = task_logs 1.6/007-fcombo16c/dump-config.txt L373-400）。
 */
export function insertEntryPattern(bare: string): RegExp {
  const rowId = rowIdForPkg(bare)
  return new RegExp(`^- id: ${rowId}$\\r?\\n^  name: '${bare}'$`, 'm')
}
/**
 * forge 下发面残留判据（CT-DISK-04 归属语义改锚 · fix-40）：卸 forge 后 dump-config
 * 中插行的归属二分——
 * - **forge 下发面**（应清零）：forge 组合器 patch（`plugins/forge/cordis.patch.yml`）
 *   五条带 config 的组合插行——其 config 只经 forge patch 进入组合实况，特征标记 =
 *   共库 `forge/db/forge/forge.db` dbFile 表达式 + `tasksHome` DSH_HOME 表达式；
 * - **五件自有行**（卸 forge 合法存留）：project/spec/task-loop/expert-squad/knowledge
 *   五件各自自带 `cordis.patch.yml` 裸插行（`- id: <bareId>` + `name:`，零 config 段），
 *   forge 卸载后随各自 solo 条目继续生效——非孤儿（patch 同名行整体替换语义下 forge
 *   patch 只管装态组合，卸载只收 forge patch 自身下发面）。
 *
 * 返回非空 = forge 下发面残留（红面）；空数组 = forge 源行/config 清零（正判半边）。
 * 五件自有行在场半边由调用方配 `insertEntryPattern` 正锚逐件断言（双判）。
 * 反例注入自证 = `tests/forge/forge-desktop-install-minchain/desktop-anchors.test.ts`
 * forgePatchResidueClues describe 块。
 */
export function forgePatchResidueClues(dumpStdout: string): string[] {
  const clues: string[] = []
  if (dumpStdout.includes('forge/db/forge/forge.db')) {
    clues.push("forge/db/forge/forge.db dbFile 表达式在场（forge patch config 残留——卸 forge 后应清零）")
  }
  if (/tasksHome: !!js process\.env\.DSH_HOME/.test(dumpStdout)) {
    clues.push('tasksHome DSH_HOME 表达式在场（forge patch config 残留——卸 forge 后应清零）')
  }
  return clues
}

// ── desktop 官方 Typert remote face（fix-38——window.dshForge 错锚退役面）────────────
// window.dshForge = dsh-forge dev host（apps/host）Electron preload 暴露面，desktop
// 官方宿主装载面结构性恒缺席（fix-30 [data-dswf-workbench] 锚同族）。desktop 载体的
// forge RPC 正门 = harness Typert remote face：POST /api/<endpoint> + boot token 交换
// cookie（harness.log `dsh web:` 行单源；真机实证 forgeProjects/register → ok:true，
// task_logs fix-38/002-typert-verify）。

/** boot token URL 读面（harness.log 最新 `dsh web: http...?token=` 行——载体首启即落盘） */
export function desktopLatestBootTokenUrl(userData: string): string {
  const log = join(userData, 'logs', 'harness.log')
  if (!existsSync(log)) throw new Error(`harness.log 缺席：${log}（desktop carrier 未曾首启——boot token 读面必填）`)
  const line = readFileSync(log, 'utf8').split(/\r?\n/).filter((l) => l.includes('dsh web: http')).at(-1)
  const url = line?.match(/dsh web: (\S+)/)?.[1]
  if (url === undefined) throw new Error(`harness.log 无 boot token 行（harness 未附着）：${log}`)
  return url
}

/** Typert remote 单次调用（cookie 交换 → POST /api/<endpoint>；信封 {ok,value|error} 解包） */
export async function desktopTypertInvoke<T>(userData: string, endpoint: string, args: Record<string, unknown>): Promise<T> {
  const tokenUrl = desktopLatestBootTokenUrl(userData)
  const exchange = await fetch(tokenUrl, { redirect: 'manual' })
  if (exchange.status !== 303) throw new Error(`boot token 交换失败 HTTP ${String(exchange.status)}（${tokenUrl}）`)
  const cookie = exchange.headers.get('set-cookie')?.split(';', 1)[0]
  const origin = new URL(tokenUrl).origin
  const res = await fetch(`${origin}/api/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie === undefined ? {} : { cookie }) },
    body: JSON.stringify({ type: 'client-request', rpcId: `e2e-${randomUUID()}`, method: endpoint, payload: { args } }),
  })
  const body = await res.json() as { result?: { ok?: boolean; value?: T; error?: { code?: string; message?: string } } }
  const result = body.result
  if (result?.ok !== true) throw new Error(`typert ${endpoint} 失败：${JSON.stringify(result?.error ?? body).slice(-400)}`)
  return result.value as T
}

/** Typert 注册返回面（RegisterResult 骨架——projectId 断言面） */
export interface DesktopRegisterResult {
  readonly projectId: string
  readonly workspaceId: string
  readonly attachedToExisting: boolean
}

/**
 * desktop 载体项目注册（官方 Typert face——fix-38 根修：CT-DISK-03/04 弃 window.dshForge
 * 错锚）。注册 + 清单收敛轮询（registered 行入列——与 rpc.registerProject 收敛语义同型）。
 */
export async function registerProjectDesktop(
  userData: string,
  dir: string,
  name: string,
  timeoutMs = 30_000,
): Promise<DesktopRegisterResult> {
  const registered = await desktopTypertInvoke<DesktopRegisterResult>(userData, 'forgeProjects/register', {
    input: { workspaceDir: dir, name, forgeDir: join(dir, '.forge') },
  })
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const projects = await desktopTypertInvoke<readonly { id: string }[]>(userData, 'forgeProjects/list', {})
    if (projects.some((p) => p.id === registered.projectId)) return registered
    if (Date.now() > deadline) throw new Error(`注册行未入列（typert 收敛超时）：${registered.projectId}`)
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
}
