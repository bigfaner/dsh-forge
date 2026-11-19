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
//   FORGE_COMBO_DESKTOP_EXE=<exe> desktop 宿主安装产物 exe（旅程 1）
//   FORGE_COMBO_DESKTOP_DSH=<bin> desktop 通道 CLI（缺省 'dsh'——desktop profile
//                                 为保留名，npm CLI 拒管（CT-NPM-02）；desktop 通道经
//                                 Desktop 内置命令环境执行，旅程 1 契约 Input 同形）
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
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
}

/** 隔离环境面（总门开启后必填项缺失 = 配置错误 fail-loud，不静默 skip） */
export function comboEnv(): ComboEnv {
  // 收口期收集（--list/加载期）总门未开时不 fail-loud——整组 skip 下本返回值零消费
  if (!comboGateOn()) return { dshHome: '', dshBin: 'dsh', forgeDir: join(ROOT, 'plugins', 'forge'), desktopDshBin: 'dsh' }
  const dshHome = process.env.FORGE_COMBO_DSH_HOME
  const desktopExe = process.env.FORGE_COMBO_DESKTOP_EXE
  if (dshHome === undefined || dshHome === '') throw new Error('FORGE_COMBO_DSH_HOME 未置位（隔离 dsh home 必填）')
  const releaseTree = process.env.FORGE_COMBO_RELEASE_TREE
  return {
    dshHome,
    dshBin: process.env.FORGE_COMBO_DSH_BIN ?? 'dsh',
    forgeDir: process.env.FORGE_COMBO_FORGE_DIR ?? join(ROOT, 'plugins', 'forge'),
    ...(desktopExe === undefined ? {} : { desktopExe }),
    desktopDshBin: process.env.FORGE_COMBO_DESKTOP_DSH ?? 'dsh',
    ...(releaseTree === undefined || releaseTree === '' ? {} : { releaseTree }),
  }
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
  const env = { ...process.env, DSH_HOME: dshHome, ...extraEnv } as Record<string, string>
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
  // ④ELECTRON_RUN_AS_NODE（harness 宿主 electron 注入）——定向 dsh 宿主 electron 即纯
  //   node 形态运行，web 宿主永不上线（fix-20 Run 9 实证「web 校准宿主上线」红）。
  delete env.ELECTRON_RUN_AS_NODE
  return env
}

/** run-once CLI 执行（DSH_HOME 定向隔离 home；extraEnv 补充 desktop 通道 userData 面等；非零退出码捕获不抛——失败面断言用） */
export async function runDsh(bin: string, args: readonly string[], dshHome: string, extraEnv: Record<string, string> = {}): Promise<CliResult> {
  const env = sanitizedCliEnv(dshHome, extraEnv)
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
  const bareId = bare.slice('@dsh-forge/'.length)
  return new RegExp(`^- id: ${bareId}$\\r?\\n^  name: '${bare}'$`, 'm')
}
