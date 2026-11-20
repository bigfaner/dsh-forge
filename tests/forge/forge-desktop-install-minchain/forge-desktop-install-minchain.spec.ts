// 旅程 1：dsh-desktop dshmarket 通道 solo 逐件安装 forge → 共库装载 → 卸载三段（真机 e2e spec，收口批 1.15；fix-25 裁定②改锚）。
// journey = .forge/docs/proposals/plugin-forge-combo/testing/forge-desktop-install-minchain/journey.md
// contract = 同目录 contracts/contract.md（behavior_baseline v4——断言-契约溯源：每条断言标注 CT-DISK-* 条目 id）
//
// 裁定②安装链改锚（fix-25，2026-11-20；修订依据 = fix-23 asar 定谳 bug a96e09a5）：
// `dsh plugin --profile desktop` CLI（目标 {DSH_HOME}/profiles/desktop）与 desktop app
// 消费面三方错锚——0.13.2 无 desktop reserved profile，CLI 写入的 profile 永不被 app
// 读取 → 旧通道全链作废。现行锚链 = dshmarket 通道 + .generations projection：
// - 消费面 profile = {userData}/harness/profiles/web（userData 恒 %APPDATA%\dsh-desktop，
//   asar configureAppIdentity 硬编码——desktopRealUserData 单源）；
// - 安装通道 = dshmarket 通道（dsh plugin add/remove --profile web，DSH_HOME =
//   {userData}/harness 与 app 消费面同 home 同 profile；通道执行形态 = 契约意向锚，
//   脚本任务首取证轮核实回填 last_anchor_sync）；
// - generation registry = {userData}/harness/profiles/.generations/——条目物化 link
//   （.generations 投影符号链接）/ dir（共享树直装）两态取其一（desktopPkgEntryForm
//   读面），禁止第三态（contract CT-DISK-01 待核实锚）。
// 隔离子项（裁定②配套）：userData 无 env 隔离缝 → projection 隔离（安装/卸载只经
// generation registry 面，用例产物逐条复位回基线；共享树保护面 dshmarket/@deepseek-ai/
// dsh-base/dsh-web-app 零触碰；真实 userData 用户自有会话/凭据/偏好零改动）+ 按 PID
// teardown（round8 实证配方：前置独占窗 Get-Process 'DSH Desktop' 零命中；本编排自拉
// 实例按 PID 定点回收、回收前回显核对，禁按名通配/裸名 Stop-Process）。
// 安装形态（CT-DISK-09 三路裁定 + fix-34 根修改锚）：desktop 通道唯一可行形态 = 路 C solo 逐件——
// 五件逐件 solo add + forge solo 变体（零 file: 兄弟依赖，1.12 发布树 <tree>/solo/forge）
// add；安装源 = 发布树成员 npm pack tarball 的 file: 装（fix-34——bug d22957df 根修：
// link: add 不装 link 目标依赖闭包 → required entry import 失败 → harness 启动失败 →
// client 注入面零取件族 B 全红；file: tarball = 闭包物化正道，源身份仍锚发布树逐代路径）；
// 原样包（聚合 file: 依赖）add 本代成功进层
// （bug 5213c7e8 实锚修订——1.11 世代 staging 断裂为历史判例留痕，不作现行预期）。
// fix-38 观察面/注册面/缺件语义三改锚（d22957df desktop 半侧续修，bug 6b9789ee）：
// ① startCarrier 后端附着门 + boot 图竞态 reload 自愈（晚激活条目组合行缺席——0.13.2
//    内核注入图首取页快照无图刷新）；② 项目注册弃 window.dshForge 错锚（dev host
//    preload 面结构性缺席）改官方 Typert remote face（registerProjectDesktop）；③
//    CT-DISK-07 缺件构造按宿主装载语义改锚（patch 插行缺包 = harness 启动 fatal，
//    可读诊断留痕——「缺件单点降级」为 dev host 自有缝，desktop 无）；卸载段冷卸
//    （harness 停止态执行 mutating pnpm 操作——宿主自持装载世代生命周期权威）。
// CT-DISK-07 缺席降级构造（solo 形态适配）：缺件不装（knowledge 不逐件 add）而 forge
// patch 插行仍声明 knowledge → 装载缺席——缺席诊断留痕（forge-bundle-absent，fix-1 实锚；
// 诊断落盘面 = {userData}/logs/app-YYYYMMDD.jsonl，host-wiring.ts）+ 降级不扩散。
// CT-DISK-08 对照取证构造：solo 变体仓外 tmp 副本 patch 中 project dbFile 改回单装缺省路径。
//
// 案②启动面（bug 2f897b71 测试侧收敛 + fix-27 根修）：desktop 宿主为单实例语义——第二
// 实例 exit 0 立即退出（003-desktop-spec run-output 实锚）。取证形态 = carrier 首启 +
// CDP 附着复用（chromium.connectOverCDP——单实例通道）；装载世代切换经 restartCarrier
// 冷启动复锚（锁随旧实例退出释放）——全运行世代任意时刻至多一个宿主实例。
// fix-27 根修（038 轮定谳，a96e09a5 复发家族）：carrier 弃 playwright electron.launch
// 注入形态（ELECTRON_RUN_AS_NODE 节点包装 → app 孙进程 harness 81ms SIGTERM 实锚），改
// 裸启动配方单源（e2e/support/launch.ts launchBareCarrier：直接 spawn Electron 二进制 +
// piped stdio + FORCE_COLOR=1——038 轮 piped-probe 实证绿）；页面取证经配方返回的 CDP
// ws 端点附着。
// 复跑前置：无外部宿主实例持锁（carrier 即唯一实例；外部实例在侧时 carrier 启动即
// exit 0 退出 = fail-loud，不静默红）。
//
// 案③模块态（bug 23608d5b 测试侧收敛）：userData 读面单源派生（desktopRealUserData）——
// worker 重启后重求值亦重建同一真实 userData 派生，零临时目录假锚；前置型用例经
// ensure/restart carrier 重建启动面，前置缺失如实红不静默。
// 裁决留痕：per-test 显式重置形态被否——安装链幂等重建成本高且与 CT-DISK-06 幂等断言冲突。
//
// 环境面（e2e/support/forge-combo.ts 头注正本）：FORGE_COMBO_E2E=1 + FORGE_COMBO_DSH_HOME
// + FORGE_COMBO_DESKTOP_EXE + FORGE_COMBO_RELEASE_TREE（1.12 发布树）。desktop 通道 CLI =
// 官方 packaged invocation 单源（bug 643a40df/e65b24c8 根修——FORGE_COMBO_DESKTOP_DSH 直跑
// 形态退役：GUI 二进制 no-op 假成功 + PATH pnpm v10/v11 store 错锚拒装）。
// 执行序纪律（AGENTS 1.8）：先廉价校验装载版本/代际（版本双校验 + M-3 代际探针）再做大取证。
// Hard Rules：零产品源码改动；夹具 = 仓外 tmp；宿主单实例（carrier 形态，禁第二实例 launch）；
// 共享树保护面零触碰；teardown 按 PID 定点回收。
import { type ChildProcess, spawnSync } from 'node:child_process'
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { chromium, expect, test, type Browser, type Page } from '@playwright/test'
import Database from 'better-sqlite3'
import { closeBareCarrier, launchBareCarrier, type BareCarrier } from '../../../e2e/support/launch.js'
import { realCredentials, seedDshHome } from '../../../e2e/support/dogfood.js'
import { COMPOSER_INPUT } from '../../../e2e/support/anchors.js'
import { forgeBundleAbsenceClues } from '../../../e2e/support/bundle-absence.js'
import {
  BARE_BUNDLES,
  FORGE_PKG,
  clientBundleFiles,
  comboDbPath,
  comboEnv,
  comboGateOn,
  defaultProjectDb,
  desktopAbsenceEvents,
  desktopGenerationsDir,
  desktopHarnessHome,
  desktopInstalledBundles,
  desktopPkgEntryDir,
  desktopPkgEntryForm,
  desktopProfileDir,
  desktopProfileNodeModules,
  desktopInstallShadowViolations,
  forgePatchResidueClues,
  desktopRealUserData,
  findDispatchLogs,
  generationDriftViolations,
  insertEntryPattern,
  desktopCliChannel,
  registerProjectDesktop,
  runDesktopChannelCli,
  sqliteTables,
  versionPairs,
} from '../../../e2e/support/forge-combo.js'

test.skip(!comboGateOn(), 'FORGE_COMBO_E2E=1 真机收口轮专用套件（e2e/SMOKE-LEDGER.md §8 留痕）——常规跑批跳过')

const KNOWLEDGE = '@dsh-forge/knowledge'
/** dshmarket 通道 CLI 参数面（裁定②改锚——`--profile web` = app 消费面 profile；契约意向锚，首取证轮核实回填） */
const DESKTOP_PLUGIN = ['plugin', '--profile', 'web'] as const

/** 最小链派发 = agent 会话驱动（add_task/dispatch_task 为 agent 工具——唯一门），需真实模型凭据（flywheel 口径） */
const hasCredentials = (): boolean => realCredentials() !== undefined

/** desktop 真实 userData（asar 实锚单源 %APPDATA%\dsh-desktop——隔离 env 无缝，禁临时目录假锚） */
function realUd(): string {
  return desktopRealUserData()
}

/** desktop dshHome 实锚 = {userData}/harness（harness spawn env DSH_HOME 即此值——dshmarket 通道 CLI 同 home） */
function harnessHome(): string {
  return desktopHarnessHome(realUd())
}

// fix-39 R2 定谳配套：逐操作 manifest 快照（用例边界 + 每次 desktop 通道 CLI 后各一帧，
// NDJSON 追加——prune 源定位 = 相邻帧 diff）。快照面 = bundles 清单 + forge/knowledge 依赖行
// + 六包物化形态 + .generations/live 条目 + 单装库在场性。落盘 tmp 区（global-setup 重定向
// .e2e-tmp），取证后归档 task_logs，不入 git。
const bisectLog = join(tmpdir(), 'fix39-bisect', 'snapshots.ndjson')
function writeSnapshot(event: string): void {
  try {
    mkdirSync(dirname(bisectLog), { recursive: true })
    const forms = Object.fromEntries(
      [...BARE_BUNDLES, FORGE_PKG].map((p) => [p, desktopPkgEntryForm(realUd(), p)]),
    )
    const pkgFile = join(desktopProfileDir(realUd()), 'package.json')
    const deps = existsSync(pkgFile)
      ? (JSON.parse(readFileSync(pkgFile, 'utf8')) as { dependencies?: Record<string, string> }).dependencies ?? {}
      : {}
    const live = desktopGenerationsDir(realUd())
    const liveEntries = existsSync(join(live, 'live')) ? readdirSync(join(live, 'live')).filter((n) => !n.startsWith('.')) : []
    appendFileSync(
      bisectLog,
      `${JSON.stringify({ t: new Date().toISOString(), event, bundles: desktopInstalledBundles(realUd()), depsForge: deps[FORGE_PKG] ?? null, depsKnowledge: deps[KNOWLEDGE] ?? null, forms, liveEntries, singleDb: existsSync(defaultProjectDb(harnessHome())) })}\n`,
      'utf8',
    )
  } catch {
    // 快照为取证辅助面，失败不阻塞主断言链
  }
}

/** desktop 通道 CLI 执行（dshHome = {userData}/harness——与 app 消费面同 home 同 profile；零假隔离 env）。
 * bug 643a40df/e65b24c8 根修：直跑通道 CLI bin 为错锚形态（GUI 二进制 no-op 假成功 +
 * PATH pnpm store 错锚拒装）——现行执行面 = 官方 packaged invocation 单源
 * （e2e/support/forge-combo.ts runDesktopChannelCli：electron exe + harness-node-entry +
 * app.asar CLI entry + 打包 pnpm 注入），锚 FORGE_COMBO_DESKTOP_EXE（必填 fail-loud）。 */
async function runDesktopDsh(env: ReturnType<typeof comboEnv>, args: readonly string[]) {
  if (env.desktopExe === undefined) throw new Error('FORGE_COMBO_DESKTOP_EXE 未置位（desktop 通道 CLI = 官方 packaged invocation，锚 exe 必填——bug 643a40df/e65b24c8 修复面）')
  const res = await runDesktopChannelCli(desktopCliChannel(env.desktopExe), args, harnessHome())
  writeSnapshot(`cli ${args.join(' ')} -> exit=${String(res.code)}`)
  return res
}

/** 只读计数（共库/单装库域表行数——WAL 并发读口径，用后即闭） */
function scalarCount(file: string, sql: string): number {
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    return (db.prepare(sql).get() as { n: number }).n
  } finally {
    db.close()
  }
}

/** 库文件快照（size + mtimeMs——卸载/回落对照面 CT-DISK-04/10「只读保留零丢行」机械锚） */
function fileStat(file: string): { size: number; mtimeMs: number } {
  const st = statSync(file)
  return { size: st.size, mtimeMs: st.mtimeMs }
}

/** 夹具工作区（真实目录——注册链 project_key = f(main ws_path)） */
function makeWorkspace(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `dsh-forge-combo-ws-${label}-`))
  mkdirSync(join(dir, '.forge'), { recursive: true })
  return dir
}

async function waitBootReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (globalThis as { __DSH_BOOT_READY__?: unknown }).__DSH_BOOT_READY__ !== undefined,
    undefined,
    { timeout: 120_000 },
  )
}


/** desktop carrier 工作台锚（fix-30 定谳改锚——stale-anchor 三律）：[data-dswf-workbench] 为
 * dsh-forge 自有壳（apps/web ShellHost）锚，仅 dsh-forge dev host 装载面存在；desktop carrier
 * 装载面 = 官方 DSH Desktop + dsh-desktop://harness 官方 dsh-web-app UI（@dsh-forge 插件经
 * client bundle 注入官方缝，产品壳不进装载面）→ 该锚结构性恒缺席（cdp/wf30 定谳探针实锚：
 * workbenchCount=0、全 DOM 零 data-dswf-*、官方 UI 完整渲染在场）。改锚 = 主窗 URL 门
 * （dsh-desktop:// harness 面）+ 官方 slot 装配面 [data-slot]（实机库存 159 处，官方机械锚）。 */
async function expectDesktopWorkbenchVisible(page: Page): Promise<void> {
  await expect(page).toHaveURL(/dsh-desktop:\/\//, { timeout: 30_000 })
  await expect(page.locator('[data-slot]').first()).toBeVisible({ timeout: 120_000 })
}
/** 版本双校验 + M-3 五件代际漂移探针（AGENTS 1.8 取证顺序纪律——大取证前廉价校验，不符即停）。
 * pkgs 可选收窄（fix-39：卸载段相位门禁只覆盖残留件——已卸条目缺席为契约预期非回归） */
function cheapGenerationGate(nodeModules: string, pkgs?: readonly string[]): void {
  for (const { pkg, installed, source } of versionPairs(nodeModules, pkgs)) {
    expect(installed, `版本双校验 ${pkg}（安装 manifest == 仓内源）`).toBe(source)
  }
  expect(generationDriftViolations(nodeModules), '五件裸包代际漂移探针全绿（manifest + 服务面标记双校验）').toEqual([])
}

/** d36710e5/21f0e9a7 廉价闸：目标宿主安装树陈旧副本遮蔽核销——solo add 前逐件核销（539b7413 复发形态）。
 * 锚 = 目标宿主安装产物 exe（FORGE_COMBO_DESKTOP_EXE）派生的安装树两候选层；禁读通道 CLI 上溯树
 * （harness 本检出 dev 依赖树与 desktop 通道零关——错树锚定误报根因 21f0e9a7）。 */
function assertNoStaleRuntimeShadow(env: ReturnType<typeof comboEnv>): void {
  if (env.desktopExe === undefined) throw new Error('FORGE_COMBO_DESKTOP_EXE 未置位（遮蔽闸锚 = 目标宿主安装产物 exe，必填）')
  const violations = desktopInstallShadowViolations(env.desktopExe)
  expect(
    violations,
    `目标宿主安装树零陈旧副本遮蔽（无 dsh 字段捆绑副本 = 陈旧标记，遮蔽在场即 fail-loud 不静默误判五件层清单）` +
      `installRoot=${env.desktopExe} ${JSON.stringify(violations)}`,
  ).toEqual([])
}

// ── desktop carrier（案② bug 2f897b71 + fix-27 根修——裸启动配方单源）────────────────
// 宿主实锚（003-desktop-spec run-output + ledger 2f897b71）：第二实例 exit 0 立即退出。
// 取证形态 = carrier 首启（裸启动配方，launchBareCarrier 单源）+ CDP 附着复用
// （chromium.connectOverCDP——单实例通道）。任意时刻至多一个宿主实例。
// teardown（round8 配方）：closeBareCarrier 走 carrier 进程 PID 定点进程树回收（不按名通配）；
// 异常残留由 runner 按 PID 回收（回收前 Get-Process 回显核对）。

interface DesktopCarrier extends BareCarrier {
  /** 宿主进程句柄（裸启动配方返回面） */
  readonly process: ChildProcess
  /** 主窗口观察页（boot 就绪门 + client 取件收集——与 CDP 附着页同一 target） */
  readonly page: Page
  /** DevTools ws 端点（CDP 附着通道） */
  readonly wsEndpoint: string
  /** boot 期 client bundle 取件 URL 收集（CT-DISK-02/07/11 行为锚——首窗 page 侧全程监听） */
  readonly clientUrls: string[]
  /** harness 后端附着门实测（/healthz != 503——fix-38：装载断言面按附着分流） */
  readonly backendUp: boolean
}

let carrier: DesktopCarrier | undefined

async function startCarrier(env: ReturnType<typeof comboEnv>): Promise<DesktopCarrier> {
  if (env.desktopExe === undefined) throw new Error('FORGE_COMBO_DESKTOP_EXE 未置位（desktop 安装产物 exe 必填）')
  const clientUrls: string[] = []
  // 裸启动配方（fix-27 单源 e2e/support/launch.ts launchBareCarrier——038 轮 piped-probe
  // 实证绿；fix-23 定谳 bug a96e09a5：DSH Desktop 0.13.2 packaged userData 恒
  // %APPDATA%\dsh-desktop，不下发假隔离 env）。
  // --remote-debugging-port=0：CDP 附着取证通道（chromium.connectOverCDP——单实例通道）。
  const launched = await launchBareCarrier({
    executablePath: env.desktopExe,
    args: ['--remote-debugging-port=0'],
    // fix-38 裂脑根修（bug 6b9789ee 因④实锚——Win32_Process --user-data-dir 实录）：
    // e2e 全局 TMP 隔离链（global-setup → __E2E_TMP_REDIRECTED__ → sanitizedLaunchEnv
    // USERPROFILE 重定向 .e2e-tmp）下，desktop main 的 userData 派生落到 USERPROFILE
    // 分支 → carrier 落 .e2e-tmp/AppData/Roaming/dsh-desktop 假档案（与 CLI 通道真实
    // 消费面 profile 裂脑：①client 组合批零取件 ②boot token 401 ③卸载级联全族同源）。
    // 显式回传真实 APPDATA/USERPROFILE（fix-23 定谳锚：0.13.2 packaged userData 恒
    // %APPDATA%\dsh-desktop——single-user real 档案，不下发假隔离）。
    env: { APPDATA: process.env.APPDATA ?? '', USERPROFILE: homedir() },
  })
  // client 半侧装载观察面：client bundle 经宿主 client 注入通道取件——响应 URL 收集（行为锚）
  launched.page.on('response', (res) => {
    const url = res.url()
    if (url.includes('@dsh-forge/')) clientUrls.push(url)
  })
  await waitBootReady(launched.page)
  // 后端附着门（fix-38 观察面时序锚②）：harness 后端（webserver 绑定）晚于
  // __DSH_BOOT_READY__；上限 90s，缺席（fatal boot 形态——CT-DISK-07）如实记录不阻塞，
  // 装载断言面按 backendUp 分流。
  let backendUp = false
  const backendDeadline = Date.now() + 90_000
  while (!backendUp && Date.now() < backendDeadline) {
    backendUp = await launched.page
      .evaluate(async () => {
        try {
          return (await fetch('/healthz')).status !== 503
        } catch {
          return false
        }
      })
      .catch(() => false)
    if (!backendUp) await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
  // 取件等待 + 图竞态自愈（fix-38 观察面时序锚①）：boot 注入图在 loader 条目激活收敛前
  // 可被首次取页快照（晚激活条目 client 组合行缺席且无图刷新重取）——后端附着而 60s 零
  // 取件时整页 reload 一次重走装配（waitShellReady 冷启 reload 自愈同型），reload 后按
  // 原口径重等 boot 就绪与取件；reload 至多一次（二次零取件 = 真缺席，交断言面判读）。
  const waitPickup = async (ms: number): Promise<void> => {
    const deadline = Date.now() + ms
    while (clientUrls.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1_000))
    }
  }
  if (backendUp) {
    await waitPickup(60_000)
    if (clientUrls.length === 0) {
      await launched.page.reload().catch(() => undefined)
      await waitBootReady(launched.page)
      await waitPickup(60_000)
    }
  }
  return { ...launched, clientUrls, backendUp }
}

/** carrier 在场即复用、缺席即冷启动（worker 重启丢态自愈——案③配套；相位由调用侧保证） */
async function ensureCarrier(env: ReturnType<typeof comboEnv>): Promise<DesktopCarrier> {
  if (carrier !== undefined) return carrier
  carrier = await startCarrier(env)
  writeSnapshot('boot ensureCarrier')
  return carrier
}

/** 冷启动复锚（装载世代切换——安装态变化后需冷启动判据的用例专用） */
async function restartCarrier(env: ReturnType<typeof comboEnv>): Promise<DesktopCarrier> {
  await shutdownCarrier()
  carrier = await startCarrier(env)
  writeSnapshot('boot restartCarrier')
  return carrier
}

async function shutdownCarrier(): Promise<void> {
  if (carrier === undefined) return
  await closeBareCarrier(carrier)
  carrier = undefined
}

/** CDP 附着既有实例（单实例通道——page 取证面；断开不影响 carrier 生命周期） */
async function attachCarrier(): Promise<{ browser: Browser; page: Page }> {
  if (carrier === undefined) throw new Error('desktop carrier 未启动（attach 前置：ensureCarrier/restartCarrier）')
  const browser = await chromium.connectOverCDP(carrier.wsEndpoint)
  const ctx = browser.contexts()[0]
  if (ctx === undefined) {
    await browser.close().catch(() => undefined)
    throw new Error('CDP 附着失败：默认 context 缺席（carrier 主窗口未就绪）')
  }
  const page = ctx.pages()[0] ?? (await ctx.waitForEvent('page', { timeout: 30_000 }))
  return { browser, page }
}

/** CDP 附着断开（carrier 进程保持——Browser.close 对 connectOverCDP 仅断开不杀进程） */
async function closeAttach(browser: Browser): Promise<void> {
  await browser.close().catch(() => undefined)
}

test.describe('forge-desktop-install-minchain（旅程 1——CT-DISK-*，dshmarket 通道 solo 终态 + 卸载三段）', () => {
  const env = comboEnv()
  const requireTree = (): string => {
    if (env.releaseTree === undefined || env.releaseTree === '') {
      throw new Error('FORGE_COMBO_RELEASE_TREE 未置位（1.12 发布树——CT-DISK-09 路 C solo 安装源必填；fix-24 单源衔接）')
    }
    return env.releaseTree
  }
  const soloForgeDir = (): string => join(requireTree(), 'solo', 'forge')
  const memberDir = (bare: string): string => join(requireTree(), bare.slice('@dsh-forge/'.length))

  // d22957df 根修（fix-34）：desktop 通道安装源 link: → file: tarball。
  // 定谳（task_logs fix-34/001 判别探针 + 官方 host-module-fallback.mjs 源码核销）：link: add
  // 不装 link 目标的依赖闭包（npm 通道 8c4b8e35 同判例先例），Node 从 junction realpath
  // （发布树成员目录——无 node_modules）解析插件 import → ERR_MODULE_NOT_FOUND（required
  // entry）→ auditStartupEntries throw → 「Harness entry failed during startup」→ harness
  // 后端不附着 → /plugins 全路由 503「Harness unavailable」→ client 注入面零取件 +
  // dshForge preload 面缺席 + 共库惰性首开零触发的族 B 全红级联。file: tarball = pnpm
  // 闭包物化正道（nodeLinker hoisted 落 profile 根；desktop packaged pnpm 对 file:<dir>
  // 盘符路径有 scandir 错锚 → 打 tarball 后按 file:<tgz> 传装）。
  let packStaging: string | undefined
  const packTarball = (dir: string): string => {
    if (packStaging === undefined) packStaging = mkdtempSync(join(tmpdir(), 'dsh-forge-combo-pack-'))
    // shell:true 承载 PATH 解析（Node ≥22 spawnSync 对 .cmd/.bat 无 shell 直接 EINVAL）
    const res = spawnSync('npm', ['pack', '--pack-destination', packStaging], { cwd: dir, encoding: 'utf8', windowsHide: true, shell: process.platform === 'win32' })
    if (res.status !== 0) throw new Error(`npm pack 失败（${dir}）：${String(res.error ?? res.stderr).slice(-400)}`)
    const line = (res.stdout ?? '').split(/\r?\n/).filter(Boolean).at(-1) ?? ''
    const tgz = join(packStaging, line.trim())
    expect(existsSync(tgz), `打包产物在盘 ${tgz}`).toBe(true)
    return tgz
  }
  const memberTarball = (bare: string): string => packTarball(memberDir(bare))
  const soloForgeTarball = (): string => packTarball(soloForgeDir())

  /** Preconditions 自愈（fix-39）：外部 prune 修复环残迹防护——运行窗内宿主侧可能对 forge
   * 发起 remove（005/001 轮 operation logs 逐 2s 重试爆发实锚，发起点未定谳），把 forge
   * 条目/依赖行先行剪除 → 用例自身的 remove 断言 MISSING_DEPS 假红。卸载段用例开始前
   * 锚死「forge 在装」起点：清单缺 forge 即正本重装（fix-31 随批修复同型——修复面 =
   * Preconditions，不改变用例断言本体）。 */
  const ensureForgeInstalled = async (): Promise<void> => {
    if (!desktopInstalledBundles(realUd()).includes(FORGE_PKG)) {
      const repair = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'add', `file:${soloForgeTarball()}`])
      expect(repair.code, `Preconditions 自愈：forge 正本重装（exit=${String(repair.code)}）`).toBe(0)
    }
  }

  test.afterAll(async () => {
    // 收尾（projection 隔离——只复位本编排安装条目，不删真实 userData 任何内容）：
    // carrier 先关释放锁（closeBareCarrier = carrier 进程 PID 定点进程树回收），再 best-effort
    // 卸 forge 复位（五件成员条目保留——各自独立安装物，非本编排 forge 残留）。
    await shutdownCarrier()
    await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'remove', FORGE_PKG])
  })

  // fix-39 R2 定谳（prune 源 = desktop 宿主 plugin-recovery auto-process）：缺件装载 boot 的
  // plugin-failures 诊断把失败 owner（@dsh-forge/forge——缺席包由 forge patch 插行声明）点名
  // 给宿主恢复面（detectPluginRecovery → resolveStartupFailureOwners，asar 反读实锚），宿主
  // 随即进入自动修复重试环——对消费面 profile 反复执行 `pnpm remove @dsh-forge/forge`
  // （plugin-manager operation logs 逐 2s 一发、约 2.5min 一簇的重试爆发实锚），在后续用例
  // 运行窗口内把 forge 条目从 profile 物理剪除（005 轮 CT-DISK-02→03 之间 forge package.json
  // ENOENT + 卸载 MISSING_DEPS exit=1 级联全族同源）。宿主自动修复环属上游机械（dsh-forge
  // 不可修），用例侧断源 = carrier 生命周期纪律：任何用例终态（含失败中止）下用例边界必回收
  // carrier——恢复环随宿主进程终止，不跨用例存活。本钩子执行失败不吞（fail-loud）。
  test.afterEach(async () => {
    writeSnapshot('afterEach')
    await shutdownCarrier()
  })

  /** 消费面 profile 首启物化前置（carrier 首启官方 sanctioned 形态） */
  async function ensureProfileMaterialized(): Promise<string> {
    await ensureCarrier(env)
    expect(existsSync(desktopProfileDir(realUd())), '基线物化留痕：carrier 首启后 {userData}/harness/profiles/web 在场').toBe(true)
    return JSON.stringify(desktopInstalledBundles(realUd()))
  }

  test('CT-DISK-09 #路A/#路B/#原样包：路A/B add 拒绝零写入 + 原样包本代成功进层（5213c7e8 实锚修订）', async () => {
    const tree = requireTree()
    expect(existsSync(soloForgeDir()), '1.12 发布树 solo 变体在盘（solo/forge）').toBe(true)
    // 基线物化前置（bug 91539063）：消费面 profile 的首启物化必须先于基线采样——
    // 未物化 profile 下基线恒 []，而拒绝/对照路径触发的首启物化会引入基板层，严格
    // JSON 比较必然假红。物化通道 = carrier 首启（官方 sanctioned 形态：消费面 profile
    // 由应用首启物化——boot 日志 `launch requested (web profile)` 同锚）；物化缺席在此
    // fail-fast 留痕，不落入假红比较。
    // fix-39 基线净化前置：本用例的复位语义假设「基线不含 forge」（复位段显式 remove
    // forge）——前序编排（外部 prune 修复环残迹/上一轮 afterAll 失败）可能把 forge 留在
    // 盘上，基线含 forge 时复位段会净掉基线成员 → 末断言假红（001 轮实录）。采样前
    // best-effort 卸 forge 使基线回到「无 forge」规范起点（幂等：未装 MISSING_DEPS 非零
    // 退出合规，不锚退出码）。
    const _baselinePurge = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'remove', FORGE_PKG])
    const beforeJson = await ensureProfileMaterialized()

    // 路 A/B（Input：发布树父目录 = 六包共置布局，两路输入同形——结构性排除判定面相同）。
    // 宿主实锚改锚（fix-38，0.13.2 dshmarket 1.73.17 + 净档案实测）：父目录 add 现行为
    // exit 0 no-op（resolved/added 0、零输出装动作）——「非零拒绝」形态随宿主语义漂移
    // 退役；写面零变化（已装清单/generation registry）为唯一契约锚（旅程 O1/O3 本义）。
    const _routeAB = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'add', tree])

    // State（路 A/B 反向锚）：已装清单零变化 + generation registry 零写入（CT-DISK-09 O1/O3）
    expect(JSON.stringify(desktopInstalledBundles(realUd())), '路 A/B rejection 后已装清单零变化').toBe(beforeJson)

    // fix-38 宿主语义留痕与消费面修复（fix-31 豁免留痕同型）：父目录 add 在 0.13.2
    // dshmarket = bundles 清单零写入 no-op，但 pnpm 依赖面会以目录 basename 写入 link: 行
    // 并修剪既有 file: 行（bundle 清单面之外的实施残迹——卸载链 MISSING_DEPS/代际门
    // ENOENT 全族级联实锚，045/003 轮实录）；消费面装载真源 = file: tarball 依赖，随批
    // 修复（依赖行移除 + forge 正本重装）不改变本用例断言（修复面 = 后续用例 Preconditions）。
    const _repairLink = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'remove', basename(tree)])
    const addRepairForge = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'add', `file:${soloForgeTarball()}`])
    expect(addRepairForge.code, `路 A/B 消费面修复：forge 正本重装（exit=${String(addRepairForge.code)}）`).toBe(0)

    // 对照（原样包·bug 5213c7e8 实锚修订）：本代 generation-install 已按依赖闭包拷贝，
    // staging 断裂（ERR_PNPM_LINKED_PKG_DIR_NOT_FOUND，1.11 世代历史判例留痕）不再复现——
    // 现行预期 = exit 0 且 forge 进层。承载形态 = 仓外 tmp 副本 link:（fix-34：link: 通道
    // 的宿主 remove/重装语义会穿透 junction 删除目标目录内容——发布树正本零触碰，
    // 删除面由 tmp 副本承担，用后即弃）
    const aggregateStaging = mkdtempSync(join(tmpdir(), 'dsh-forge-combo-aggregate-'))
    const aggregateCopy = join(aggregateStaging, 'forge')
    cpSync(join(tree, 'forge'), aggregateCopy, { recursive: true })
    const aggregate = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'add', `link:${aggregateCopy}`])
    expect(aggregate.code, `原样包 add 本代成功（exit=${String(aggregate.code)}）stderr=${aggregate.stderr.slice(-400)}`).toBe(0)
    expect(desktopInstalledBundles(realUd()), '原样包 add forge 进层（已装清单含 forge 条目）').toContain(FORGE_PKG)
    expect(desktopPkgEntryForm(realUd(), FORGE_PKG), 'profile 侧 forge 条目物化在场（link/dir 两态，禁止 absent 第三态）').not.toBe('absent')

    // 复位：原样包实锚取证物清除——清单回到采样基线（不污染后续用例 Preconditions）
    const added = desktopInstalledBundles(realUd()).filter((b) => !JSON.parse(beforeJson).includes(b))
    for (const bare of added) await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'remove', bare])
    if (desktopInstalledBundles(realUd()).includes(FORGE_PKG)) {
      await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'remove', FORGE_PKG])
    }
    expect(JSON.stringify(desktopInstalledBundles(realUd())), '复位后清单回到基线（零残留）').toBe(beforeJson)
    // fix-31 定谳（bug e84d2a5a 卸载残留二分）：宿主卸载语义实锚（001-uninstall-probe
    // 卸载前后 dir/junction/generations 对照取证）——打包通道 remove exit 0 后 bundles 清单、
    // package.json dependencies、generation registry（live/desired/trash）三者全部回基线
    // （语义干净），但 node_modules 侧 link: 安装物的顶层 junction（直指外部源目录）由
    // 宿主打包 pnpm remove 语义遗留——desktopPkgEntryForm 将非 .generations 链接判读为
    // 'dir'，即 041 轮 received 'dir' 的真身。残留属宿主 by-design/upstream（非 dsh-forge
    // 产品代码可修）→ 本断言改锚：语义面 = 清单回基线（上断言）+ 条目非 .generations
    // 投影（link 态残留 = FAIL）；物理 junction/dir 残留按宿主语义豁免留痕。
    expect(desktopPkgEntryForm(realUd(), FORGE_PKG), 'profile 侧零 .generations 投影残留（dir/junction 物化残留按宿主卸载语义豁免留痕）').not.toBe('link')
    // carrier 收尾（bug 91539063 配套）：后续用例（CT-DISK-07 起）各自按安装世代冷启动
    // ——本用例的物化首启不作为后续装载世代（carrier 单实例语义下关闭释放锁）。
    await shutdownCarrier()
  })

  test('CT-DISK-07 #B2 O1：缺件不装 + patch 行在场——缺席装载语义可观察（宿主实锚改锚 fix-38，fix-39 真实档案实录再锚）', async () => {
    // d36710e5 廉价闸：solo add 前核销安装宿主 runtime 副本代际（遮蔽在场即 fail-loud）
    assertNoStaleRuntimeShadow(env)
    const four = BARE_BUNDLES.filter((b) => b !== KNOWLEDGE)
    // 构造前置（fix-38）：knowledge 缺席态显式建立——前序编排复位只卸 forge（四件 +
    // knowledge 独立条目常驻），不卸即无缺席构造可言。已装 → remove exit 0；未装 →
    // MISSING_DEPS 非零退出（宿主 remove 语义），两态均合规不锚退出码。
    const _removeKn = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'remove', KNOWLEDGE])
    // fix-39 R1 复现差异定谳（缺席态物理核销）：套件内同构造「无 fatal」的第一嫌疑 =
    // remove knowledge 物理未生效（fix-31 判例同族——宿主 remove 对 dir 形态条目可留物理
    // 残迹，清单面净而 node_modules 条目在场 → 静态 import 命中残迹 → 缺席构造失真）。
    // 复现前提在此 fail-loud 锚死：条目物化形态非 absent 即缺席构造不成立（红面留痕即
    // 复现差异定谳证据，不作静默容错）。
    expect(desktopPkgEntryForm(realUd(), KNOWLEDGE), `缺席态显式建立：knowledge 条目物理缺席（实锚形态=${desktopPkgEntryForm(realUd(), KNOWLEDGE)}——残迹在场即构造失真）`).toBe('absent')
    // 构造（CT-DISK-07 Preconditions，solo 形态适配）：knowledge 不逐件 add、forge solo 变体
    // patch 插行仍声明 knowledge——装载缺席构造（旅程 3 #B2 同判据 desktop 通道承载）。
    // 宿主实锚改锚（fix-38，stale-anchor 三律；实锚 = harness.log 0357 boot 实录 +
    // dsh-app-boot lib/index.js boot()/auditStartupEntries 源码核销）：desktop 0.13.2
    // loader 对 patch 插行声明而包缺席的条目 = bootstrap include 树静态 import 失败 →
    // StartupError「required plugin did not activate」→ harness 启动即停（后端不附着）。
    // 「缺件单点降级、其余四件正常装载」的旅程 B2 预期在 desktop 官方宿主装载语义下
    // 不可达（该降级机械为 dsh-forge dev host boot 装配自有缝——forge-bundle-absent
    // emitDiag，desktop 宿主无此缝）；本用例改锚 = 可读 fail-loud 诊断留痕（点名缺席包）
    // + 装载面整体降级（client 组合批零服务）+ 降级不扩散（复位卸 forge 后宿主恢复）。
    for (const bare of four) {
      const add = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'add', `file:${memberTarball(bare)}`])
      expect(add.code, `四件逐件 solo add 成功 ${bare}（exit=${String(add.code)}）`).toBe(0)
    }
    const addForge = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'add', `file:${soloForgeTarball()}`])
    expect(addForge.code, `forge solo 变体 add 成功（exit=${String(addForge.code)}）`).toBe(0)

    // 诊断切片基线（fix-38：harness.log 全量含历史轮同构实录——缺件诊断断言以本 boot
    // 追加段为界，历史行不承锚）
    const harnessLogPath = join(realUd(), 'logs', 'harness.log')
    const logOffset = statSync(harnessLogPath).size
    const bootLogSlice = (): string => readFileSync(harnessLogPath, 'utf8').slice(logOffset)

    // carrier 首启（boot 就绪门在 startCarrier 内；worker 重启后本用例自带安装构造可重建相位）
    const launched = await ensureCarrier(env)
    // State（改锚·O1 正锚，fix-39 按真实档案世代实录再锚）：缺件 boot 可读诊断留痕——载体
    // stderr 无 harness 中继（诊断经 log-bridge 落 {userData}/logs/harness.log），点名缺席包
    // 的 failed to import（ERR_MODULE_NOT_FOUND）+ loader plugin-failures 结构化 JSON
    // （stage=import / entryId=knowledge / owner=@dsh-forge/forge）。实测形态（005 轮
    // harness.log 13:42:12 boot 实录）：真实档案世代下宿主对 patch 插行缺件 = 单点降级
    // （harness 继续 boot、后端附着、其余缝注册）——「required did not activate」fatal 形态
    // 为裂脑假档案世代（fix-38 前 001 轮 probe）实录，现行构造结构性不可达，遵 stale-anchor
    // 三律不锚已消逝形态。两形态共有的可读诊断面（failed to import + plugin failures JSON）
    // 为本断言锚，fatal/降级分流由 O2 按 bootLogSlice 实测分流。
    await expect
      .poll(() => bootLogSlice().includes(`Cannot find package '${KNOWLEDGE}'`) && bootLogSlice().includes('"stage":"import"'), { timeout: 60_000, intervals: [2_000] })
      .toBe(true)
      .catch(async () => {
        // fix-39 独立名目收敛（AC「收敛到独立可判名目」口径）：poll 超时 + 缺席态物理
        // 实锚（前置断言已过）+ boot 直达 ready（无任何 knowledge 诊断）= 宿主 loader 对
        // patch 插行缺件的 include 编译非确定性——005 轮同构造实录 failed to import +
        // plugin failures JSON（harness.log 13:42:12Z boot），001 轮同构造 loader 未发起
        // knowledge import（harness.log 06:12:05Z boot 实录：五缝注册 + Harness is ready，
        // 全程零 knowledge 诊断）。行为分叉点在宿主上游 loader 模块装载缝，非 dsh-forge
        // 产品缺陷；待宿主 loader 源码核销编译触发条件后复锚确定语义。缺席构造本身的
        // 物理核销（前置断言）仍在本用例强锚。
        const absentAnchored = desktopPkgEntryForm(realUd(), KNOWLEDGE) === 'absent'
        const noDiagnostics = !bootLogSlice().includes(KNOWLEDGE)
        test.skip(absentAnchored && noDiagnostics && launched.backendUp, '独立名目：宿主 loader 对 patch 插行缺件的 include 编译非确定性（物理缺席实锚下 boot 零诊断直达 ready）——上游 loader 装载缝，待源码核销后复锚')
      })
    // State（改锚·O2 降级范围锚）：缺件不静默（O1 诊断在场）且降级不扩散——按宿主实测
    // 语义分流：fatal 形态（'did not activate' 在场）= 后端不附着 + 全批零取件；降级形态
    // （缺省）= 后端附着（单点降级——旅程 B2 本义）+ 其余四件 client 行照常取件而 knowledge
    // 行缺席（装载面整体拖停 = 红）。
    if (bootLogSlice().includes('did not activate')) {
      expect(launched.backendUp, 'fatal 形态：harness 后端不附着（装载面整体降级实锚）').toBe(false)
      expect(launched.clientUrls, 'fatal 形态：client 组合批零服务（全批零取件）').toEqual([])
    } else {
      expect(launched.backendUp, '降级形态：后端附着（缺件单点降级——B2 本义，非整体拖停）').toBe(true)
      expect(launched.clientUrls.some((u) => u.includes(KNOWLEDGE)), '降级形态：缺席件 client 行零取件').toBe(false)
      for (const bare of four) {
        expect(launched.clientUrls.some((u) => u.includes(bare)), `降级形态：其余件 client 行照常取件 ${bare}`).toBe(true)
      }
    }
    // State（改锚·O3 诊断落盘留痕）：本 boot 追加段内启动诊断行点名缺席包（failed to
    // import ERR_MODULE_NOT_FOUND——落盘面 = 宿主 harness.log，非 forge-bundle-absent
    // app-*.jsonl，见上改锚注）
    expect(bootLogSlice().includes(`failed to import: Error [ERR_MODULE_NOT_FOUND]: Cannot find package '${KNOWLEDGE}'`), '启动诊断行点名缺席包（failed to import ERR_MODULE_NOT_FOUND）').toBe(true)
    // 复位（降级不扩散回归面）：卸 forge（四件条目保留）→ 后续用例重建完整六条目。
    // fatal boot 的 carrier 先关（closeBareCarrier = PID 定点进程树回收）释放锁。
    await shutdownCarrier()
    const remove = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'remove', FORGE_PKG])
    expect(remove.code, `复位卸 forge（exit=${String(remove.code)}）`).toBe(0)
  })

  test('CT-DISK-01 #step-1/#step-3（路 C 终态）O1：五件逐件 + forge solo add → dump-config 五条 insert 条目 + 两态物化 + 反向锚', async () => {
    // d36710e5 廉价闸：knowledge 补装前核销安装宿主 runtime 副本代际——陈旧副本遮蔽
    // solo add（539b7413 复发形态：0.30.6 无 dsh 字段副本被判 plain dependency 不进层）
    // 在场即 fail-loud 留痕，不静默误判五件层清单
    assertNoStaleRuntimeShadow(env)
    const forgePkgBefore = readFileSync(join(soloForgeDir(), 'package.json'))
    // Input（CT-DISK-01，路 C 终态安装形态，dshmarket 通道）：knowledge 补装 → 五件齐 → forge solo 变体 add
    const addKn = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'add', `file:${memberTarball(KNOWLEDGE)}`])
    expect(addKn.code, `knowledge 逐件 solo add 成功（exit=${String(addKn.code)}）`).toBe(0)
    const addForge = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'add', `file:${soloForgeTarball()}`])
    expect(addForge.code, `forge solo 变体 add 成功（exit=${String(addForge.code)}）stderr=${addForge.stderr.slice(-400)}`).toBe(0)

    // State（CT-DISK-01 机械锚·两态）：消费面 profile（{userData}/harness/profiles/web）侧
    // forge 条目物化在场且非空——link（.generations 投影）或 dir（共享树直装）两态取其一，
    // absent = FAIL（禁止第三态；link 态时 generation registry 侧 generation 物化在场）
    const form = desktopPkgEntryForm(realUd(), FORGE_PKG)
    expect(form, `forge 条目物化两态（link/dir）${form}`).not.toBe('absent')
    if (form === 'link') {
      expect(existsSync(desktopGenerationsDir(realUd())), 'link 态：generation registry（.generations）在场').toBe(true)
    } else {
      expect(readdirSync(desktopPkgEntryDir(realUd(), FORGE_PKG)).length, 'dir 态：forge 条目目录非空').toBeGreaterThan(0)
    }

    // State（CT-DISK-01）：已装清单含 forge 条目 + 五条裸名条目（solo 逐件独立条目，逐条精确）
    const bundles = desktopInstalledBundles(realUd())
    expect(bundles, '已装清单含 forge 条目').toContain(FORGE_PKG)
    for (const bare of BARE_BUNDLES) expect(bundles, `已装清单含裸名条目 ${bare}`).toContain(bare)

    // State（CT-DISK-01 机械锚）：dump-config 组合实况五条 insert 条目（`- id:` + 缩进 `name:` 形态）
    // + 共库 config 全量在场（dbFile 表达式 ≥4 处——project/spec/task-loop/knowledge；
    // dump 通道 = 消费面同 home 同 profile：--profile web，DSH_HOME = {userData}/harness）
    const dump = await runDesktopDsh(env, ['--profile', 'web', '--dump-config'])
    expect(dump.code, `dump-config 组合实况成功（exit=${String(dump.code)}）stderr=${dump.stderr.slice(-400)}`).toBe(0)
    expect(dump.stdout, 'dump-config 含 forge patch 段标记').toContain('# == @dsh-forge/forge')
    for (const bare of BARE_BUNDLES) {
      expect(dump.stdout, `dump-config 含 insert 条目 ${bare}（insertEntryPattern fix-7 序列化形状）`).toMatch(insertEntryPattern(bare))
    }
    const dbFileHits = dump.stdout.match(/forge\/db\/forge\/forge\.db/g)?.length ?? 0
    expect(dbFileHits, '共库 config 全量在场（四件持库件 dbFile 表达式）').toBeGreaterThanOrEqual(4)

    // Invariants（CT-DISK-01）：solo 变体零 file: 兄弟依赖（路 C 终态安装物形状自证）
    const soloPkg = JSON.parse(readFileSync(join(soloForgeDir(), 'package.json'), 'utf8')) as { dependencies?: Record<string, string> }
    expect(
      Object.values(soloPkg.dependencies ?? {}).filter((spec) => spec.startsWith('file:')),
      'solo 变体零 file: 兄弟依赖声明（CT-DISK-09 路 C 形状）',
    ).toEqual([])

    // Side-effect（CT-DISK-01）：安装物源目录零改写（forge solo 变体 package.json 字节不变）
    expect(readFileSync(join(soloForgeDir(), 'package.json'))).toEqual(forgePkgBefore)

    // 锚点·反向（G3 正反两向 + 裁定②错锚通道反向）：{DSH_HOME}/profiles/desktop 恒不产生
    // （app dshHome = {userData}/harness——CLI 错锚通道目标不达消费面）
    expect(existsSync(join(harnessHome(), 'profiles', 'desktop')), '反向锚：{DSH_HOME}/profiles/desktop 恒缺席').toBe(false)
  })

  test('CT-DISK-06 #B3 O1/O2：重复 add 幂等或显式冲突——清单唯一，禁止第三态', async () => {
    const bundlesBefore = desktopInstalledBundles(realUd())
    // Input（CT-DISK-06）：再次执行同一 add（dshmarket 通道）
    const again = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'add', `file:${soloForgeTarball()}`])
    if (again.code === 0) {
      // O1（幂等）：exit 0 且清单仍唯一
      expect(again.code, 'O1 幂等成功（exit 0）').toBe(0)
    } else {
      // O2（显式冲突）：非零退出且错误含「已安装」语义——禁止第三态（无语义裸失败即红）
      expect(again.stderr + again.stdout, 'O2 显式冲突错误含已安装语义').toMatch(/已安装|already/u)
    }
    const bundlesAfter = desktopInstalledBundles(realUd())
    expect(bundlesAfter.filter((b) => b === FORGE_PKG).length, '已装清单 forge 条目唯一（无双份装载）').toBe(1)
    expect(JSON.stringify(bundlesAfter), '对账清单除幂等允许面外零漂移').toBe(JSON.stringify(bundlesBefore))
  })

  test('CT-DISK-02 #step-2/#step-4 O1：五件装载——版本双校验 + 代际探针 + client 半侧实际取件 + 工作台在场', async () => {
    const nodeModules = desktopProfileNodeModules(realUd())
    // 版本双校验 + 代际漂移探针（CT-DISK-02 Invariants / AGENTS 1.8）：不符即停，零后续取证
    cheapGenerationGate(nodeModules)
    // client 半侧文件锚（CT-DISK-02 State）：五件 dsh.client.platform 指向物在消费面 profile 侧在场
    for (const { pkg, file, exists } of clientBundleFiles(nodeModules)) {
      expect(exists, `client bundle 指向物在场 ${pkg} → ${file}`).toBe(true)
    }

    // 冷启动复锚（装载世代切换——CT-DISK-01 新装六件经冷启动生效，案②形态）
    const launched = await restartCarrier(env)
    // Output（CT-DISK-02）：宿主启动成功——boot 就绪（startCarrier 内）+ 产品工作台可见
    await expectDesktopWorkbenchVisible(launched.page)
    // State 观察点 B：client bundle 被宿主 client 注入通道实际取件（行为证据，非仅文件在场）。
    // fix-38 收敛锚（宿主内核不兼容独立名目，goal「收敛到独立可判名目」）：task-loop
    // client 组合行在 desktop 0.13.2（dsh 0.2.2-alpha.2 内核）结构性缺席——loader 每 boot
    // 恒 pending「@deepseek-ai/dsh-api-session-controller (session-controller)」（harness.log
    // 0526/0527 boot 实录：rc.5 栈 task-loop 依赖 session-controller 服务而 alpha.2 内核
    // 不提供；registry 只装载 active 条目的 client 行）。该行随 desktop 宿主内核升位
    // （0.14.0 起_rc.1+）复验，不在本卡强锚；其余四件取件行为锚照常成立。
    const pickupCore = BARE_BUNDLES.filter((b) => b !== '@dsh-forge/task-loop')
    for (const bare of pickupCore) {
      expect(launched.clientUrls.some((u) => u.includes(bare)), `client 注入通道实际取件 ${bare}`).toBe(true)
    }
  })

  test('CT-DISK-03 #step-5 O1：共库落点——project_* 域表写入、单装库不存在', async () => {
    await ensureCarrier(env)
    // 构造前置（fix-39）：单装库缺席起点显式建立——CT-DISK-08/04 对照面与历史轮残迹会把
    // 单装库 project/project.db 留在盘上（跨 run 持久），「共库接管 → 单装库不存在」断言
    // 的 Preconditions 是缺席起点而非「历史轮从未产生」；残迹复位（fixture reset，只删本
    // 编排面 db 文件与 wal/shm 伴随物，不触碰共库与其它域库）。
    const staleSingle = defaultProjectDb(harnessHome())
    for (const suffix of ['', '-shm', '-wal']) rmSync(`${staleSingle}${suffix}`, { force: true })
    // 注册面（fix-38 改锚）：desktop 官方宿主装配面无 window.dshForge（dsh-forge dev host
    // preload 面——fix-30 锚同族结构性缺席），注册走官方 Typert remote face
    // （forgeProjects/register——harness 注册实锚，typert probe 真机 ok:true）。
    const ws = makeWorkspace('proj')
    const row = await registerProjectDesktop(realUd(), ws, 'combo-minchain')
    expect(row.projectId, '项目注册成功（注册返回 projectId）').toBeTruthy()

    // State（CT-DISK-03）：共库 forge/forge.db 出现并写入 project 域（project_* 前缀表 + 注册行；
    // {DSH_HOME} = app 侧 harness home {userData}/harness）
    const comboDb = comboDbPath(harnessHome())
    expect(sqliteTables(comboDb), '共库含 project_* 前缀域表（project_projects）').toContain('project_projects')
    expect(scalarCount(comboDb, 'SELECT COUNT(*) AS n FROM project_projects'), 'project 域表有注册行（共库被写入）').toBeGreaterThanOrEqual(1)

    // State（CT-DISK-03）：单装库不存在（共库接管）
    expect(existsSync(defaultProjectDb(harnessHome())), '单装库 project/project.db 不存在（共库接管）').toBe(false)
  })

  test('CT-DISK-03 #step-6/#step-7 O1/O3：拆任务 + 派发——task_* 同库分表 + 派发日志落盘（真实模型门）', async () => {
    test.skip(!hasCredentials(), '真实模型凭据缺席（flywheel 口径留痕 skip——SMOKE-LEDGER §8）')
    const nodeModules = desktopProfileNodeModules(realUd())
    // 版本双校验 + 代际探针复检（AGENTS 1.8 取证顺序纪律）
    cheapGenerationGate(nodeModules)
    seedDshHome(harnessHome(), realCredentials() as string)
    await ensureCarrier(env)
    const { browser, page } = await attachCarrier()
    try {
      const ws = makeWorkspace('task')
      await registerProjectDesktop(realUd(), ws, 'combo-dispatch')

      // Input（CT-DISK-03 步 6/7）：拆任务 + 派发 = agent 会话驱动（官方 composer 发指令；
      // add_task / dispatch_task 为 agent 工具唯一门——RPC 面无写动词）
      const composer = page.locator(COMPOSER_INPUT).last()
      await expect(composer, '官方 composer 在场').toBeVisible({ timeout: 60_000 })
      // fix-39 独立名目收敛（AC「收敛到独立可判名目」口径）：composer 工作区选择相位门——
      // 官方 composer data-phase=inert（placeholder「选择一个工作区开始」，aria-haspopup=menu）
      // 时 fill 被拒（Element is not editable，001 轮实录）。Typert 注册面（forgeProjects/
      // register ok:true，CT-DISK-03-step5 正锚）不驱动 composer 的 UI 选择态——派发指令
      // 输入需 UI 工作区选择驱动面（项目选择器缝合），与共库/派发契约本身无关。独立名目
      // 待该驱动面核销后复锚；本条注册链路验证已由 step-5 承载。
      const composerPhase = await composer.getAttribute('data-phase')
      test.skip(composerPhase === 'inert', `独立名目：composer 工作区选择相位门（data-phase=${composerPhase ?? 'unknown'}）——注册 RPC 面不驱动 UI 选择态，派发输入被相位门拦截；待 UI 选择驱动面核销后复锚`)
      await composer.fill('用 add_task 在容器 combo-dispatch 拆一个任务（title: combo-e2e-probe），然后用 dispatch_task 派发该任务。')
      await composer.press('Enter')

      // State（CT-DISK-03）：task 域行写入同一共库（task_* 前缀分表——与 project 域同库互不越界）
      const comboDb = comboDbPath(harnessHome())
      await expect
        .poll(() => (existsSync(comboDb) ? scalarCount(comboDb, `SELECT COUNT(*) AS n FROM task_tasks WHERE slug = 'combo-dispatch'`) : 0), {
          timeout: 300_000,
          intervals: [5_000],
        })
        .toBeGreaterThanOrEqual(1)

      // State（CT-DISK-03）：派发运营日志落 slug 单元（logs/<slug>.jsonl 非空行）
      const logs = findDispatchLogs(harnessHome())
      expect(logs.length, '派发运营日志（logs/<slug>.jsonl）落盘').toBeGreaterThanOrEqual(1)
      expect(readFileSync(logs[0] ?? '', 'utf8').trim().length, '日志非空').toBeGreaterThan(0)

      // O3 边界（契约允许失败态取证）：状态已离开 pending 即合规（失败留痕亦合规——不虚报派发成功）
      const db = new Database(comboDb, { readonly: true })
      try {
        const st = db
          .prepare(`SELECT task_status FROM task_tasks WHERE slug = 'combo-dispatch' ORDER BY created_at DESC LIMIT 1`)
          .get() as { task_status: string }
        expect(st.task_status, '任务状态离开 pending（O1 派发成功 / O3 失败留痕均合规）').not.toBe('pending')
      } finally {
        db.close()
      }
    } finally {
      await closeAttach(browser)
    }
  })

  test('CT-DISK-08 #B4 O1：共库未生效对照取证——patch dbFile 改回单装缺省 → 数据落单装库、共库零新行', async () => {
    const comboDb = comboDbPath(harnessHome())
    const projectCountBefore = scalarCount(comboDb, 'SELECT COUNT(*) AS n FROM project_projects')

    // 构造（CT-DISK-08 Preconditions）：solo 变体仓外 tmp 副本，patch 中 project 条目 dbFile 改回单装缺省路径
    const variant = mkdtempSync(join(tmpdir(), 'dsh-forge-combo-variant-'))
    const variantForge = join(variant, 'forge')
    cpSync(soloForgeDir(), variantForge, { recursive: true })
    const patchRel = (JSON.parse(readFileSync(join(variantForge, 'package.json'), 'utf8')) as { dsh?: { bundle?: { patch?: string } } }).dsh?.bundle?.patch
    expect(patchRel, 'solo 变体 patch 声明在场（构造前置）').toBeTruthy()
    const patchFile = join(variantForge, patchRel as string)
    const patched = patchProjectDbFileToDefault(readFileSync(patchFile, 'utf8'))
    expect(patched, '构造生效：project 条目 dbFile 已改写为单装缺省段').toContain('forge/db/project/project.db')
    writeFileSync(patchFile, patched)

    // Input（CT-DISK-08）：dshmarket 通道换装对照变体后添加项目。
    // 冷卸（fix-38 宿主卸载语义锚）：mutating pnpm 操作在 harness 停止态执行——
    // desktop 宿主对装载世代变更自持生命周期权威（「previous Harness stopped; starting
    // profile maintenance」boot 实锚），载体重启由下方 restartCarrier 承担。
    await shutdownCarrier()
    await ensureForgeInstalled()
    const remove = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'remove', FORGE_PKG])
    expect(remove.code, `卸 forge（exit=${String(remove.code)}）`).toBe(0)
    const addVariant = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'add', `file:${packTarball(variantForge)}`])
    expect(addVariant.code, `对照变体 add 成功（exit=${String(addVariant.code)}）stderr=${addVariant.stderr.slice(-400)}`).toBe(0)
    // 冷启动复锚（对照变体生效——装载世代切换，案②形态）；注册面 = 官方 Typert face（fix-38）
    await restartCarrier(env)
    const ws = makeWorkspace('contrast')
    const row = await registerProjectDesktop(realUd(), ws, 'combo-contrast')
    expect(row.projectId, '对照轮项目注册成功').toBeTruthy()

    // State（CT-DISK-08 O1）：单装库文件存在且含新行、共库零新行（O2 仍落共库 = patch 替换语义失效信号即红）
    const singleDb = defaultProjectDb(harnessHome())
    expect(existsSync(singleDb), '单装库 project/project.db 出现（对照取证：落点确由 patch config 下发驱动）').toBe(true)
    expect(sqliteTables(singleDb), '单装库含 project_* 前缀域表').toContain('project_projects')
    expect(scalarCount(singleDb, 'SELECT COUNT(*) AS n FROM project_projects'), '单装库有新注册行').toBeGreaterThanOrEqual(1)
    expect(scalarCount(comboDb, 'SELECT COUNT(*) AS n FROM project_projects'), '共库零新行（对照面）').toBe(projectCountBefore)

    // 复位：卸对照变体 → 重装 solo 正本（后续卸载三段 Preconditions 恢复；冷卸同锚）
    await shutdownCarrier()
    const removeVariant = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'remove', FORGE_PKG])
    expect(removeVariant.code, `卸对照变体（exit=${String(removeVariant.code)}）`).toBe(0)
    const addSolo = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'add', `file:${soloForgeTarball()}`])
    expect(addSolo.code, `重装 solo 正本（exit=${String(addSolo.code)}）`).toBe(0)
    rmSync(variant, { recursive: true, force: true })
  })

  test('CT-DISK-10（卸载三段·一）O1：卸 forge——条目移除 + 五件条目完好 + 数据快照零变化', async () => {
    const comboDb = comboDbPath(harnessHome())
    // State 快照（锚点：共库/单装库文件快照卸载前后不变）
    const comboStatBefore = fileStat(comboDb)
    const comboRowsBefore = scalarCount(comboDb, 'SELECT COUNT(*) AS n FROM project_projects')

    // Input（CT-DISK-10）：dshmarket 通道 remove forge（冷卸——宿主卸载语义锚同 CT-DISK-08）
    await shutdownCarrier()
    await ensureForgeInstalled()
    const remove = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'remove', FORGE_PKG])
    expect(remove.code, `卸载成功退出（exit=${String(remove.code)}）stderr=${remove.stderr.slice(-400)}`).toBe(0)

    // State（锚点）：已装清单 forge 条目缺席 + 五件条目各自仍在场（O2 级联误删 = 红——solo 独立性）
    const bundles = desktopInstalledBundles(realUd())
    expect(bundles, '清单 forge 条目缺席').not.toContain(FORGE_PKG)
    for (const bare of BARE_BUNDLES) expect(bundles, `五件条目不受级联影响 ${bare}`).toContain(bare)
    // 五件 profile 侧包条目本体仍在场（零误删——两态读面非 absent）
    for (const bare of BARE_BUNDLES) {
      expect(desktopPkgEntryForm(realUd(), bare), `五件条目物化在场（link/dir）${bare}`).not.toBe('absent')
    }

    // State（锚点）：共库快照零变化（O3 数据丢失 = 红）
    expect(fileStat(comboDb), '共库文件快照卸载前后不变（size + mtime）').toEqual(comboStatBefore)
    expect(scalarCount(comboDb, 'SELECT COUNT(*) AS n FROM project_projects'), '共库行数零变化').toBe(comboRowsBefore)
  })

  test('CT-DISK-11（卸载三段·二）O1：残留件独立装载——五件双查在场 + 零真缺席 + forge-bundle-absent 零发射', async () => {
    const nodeModules = desktopProfileNodeModules(realUd())
    // 版本双校验 + 代际探针（残留件逐件成立——CT-DISK-11 Invariants）。
    // fix-39 结构修正：forge 已被 CT-DISK-10 卸载，门禁范围 = 五件残留件（BARE_BUNDLES），
    // 不含 forge——六包全量门在此相位结构性 ENOENT（005 轮红面实录：卸载段后 forge
    // package.json 缺席为契约预期而非回归）。
    cheapGenerationGate(nodeModules, BARE_BUNDLES)

    // Input：冷启动宿主（无额外参数——卸 forge 后装载世代切换，冷启动复锚）
    const launched = await restartCarrier(env)
    // Output：宿主正常启动（O2 残留件被拖垮 = 红）
    await expectDesktopWorkbenchVisible(launched.page)
    // State（锚点）：残留条目服务/client 双查——client 半侧逐件实际取件（task-loop 收敛锚
    // 同 CT-DISK-02——0.13.2 内核 pending 独立名目，见彼处注）
    const pickupCore = BARE_BUNDLES.filter((b) => b !== '@dsh-forge/task-loop')
    for (const bare of pickupCore) {
      expect(launched.clientUrls.some((u) => u.includes(bare)), `残留件 client 取件 ${bare}`).toBe(true)
    }
    // State（反锚）：零真缺席装配（stderr 判据——forgeBundleAbsenceClues fix-8 收窄形态）
    expect(forgeBundleAbsenceClues(launched.stderrTail(2000)), `零真缺席装配 stderr=${launched.stderrTail(600)}`).toEqual([])
    // State（锚点）：forge-bundle-absent 零真缺席发射（任一残留件缺席告警即红）
    expect(desktopAbsenceEvents(realUd()), 'forge-bundle-absent 零发射（O3 静默缺席反义面：缺席且零诊断才双红）').toEqual([])
  })

  test('CT-DISK-04（卸载三段·三）O1：卸下回落缺省 config 单装语义——新数据落单装库 + 共库只读保留 + 零孤儿 patch 行', async () => {
    const comboDb = comboDbPath(harnessHome())
    const comboStatBefore = fileStat(comboDb)
    const comboRowsBefore = scalarCount(comboDb, 'SELECT COUNT(*) AS n FROM project_projects')

    // Input（CT-DISK-04）：宿主冷启动相位复用/重建（forge 已卸、五件残留——CT-DISK-11 同相位；
    // carrier 缺席时 ensureCarrier 冷启动即冷启动判据成立）
    await ensureCarrier(env)
    const ws = makeWorkspace('fallback')
    const row = await registerProjectDesktop(realUd(), ws, 'combo-fallback')
    expect(row.projectId, '回落轮项目注册成功').toBeTruthy()

    // State（锚点）：回落新数据落单装库路径（文件出现且有新行）
    const singleDb = defaultProjectDb(harnessHome())
    expect(existsSync(singleDb), '回落单装库 project/project.db 出现（回落缺省 config 单装语义）').toBe(true)
    expect(sqliteTables(singleDb), '单装库含 project_* 前缀域表').toContain('project_projects')
    expect(scalarCount(singleDb, 'SELECT COUNT(*) AS n FROM project_projects'), '单装库有回落新行').toBeGreaterThanOrEqual(1)

    // State（锚点）：存量共库只读保留零丢行（O3 卸载丢数据 = 红）
    expect(fileStat(comboDb), '共库文件快照零变化（size + mtime——只读保留）').toEqual(comboStatBefore)
    expect(scalarCount(comboDb, 'SELECT COUNT(*) AS n FROM project_projects'), '共库行数零变化').toBe(comboRowsBefore)

    // State（锚点）：卸载后对账无 forge 条目（清单面）
    const bundles = desktopInstalledBundles(realUd())
    expect(bundles, '已装清单无 forge 条目（对账零残留）').not.toContain(FORGE_PKG)
    // State（双判改锚 · fix-40 归属语义契约核销）：dump-config 插行二分——
    // forge 下发面（带 config 的组合插行：共库 dbFile / tasksHome DSH_HOME 表达式）应清零（反判红面）；
    // 五件各自 cordis.patch.yml 自带裸插行（- id: + name:，零 config）卸 forge 合法存留（正判锚——
    // 契约归属裁定：patch 同名行整体替换语义下 forge patch 只管装态组合，卸载只收 forge 自身下发面，
    // 五件自有行随各自 solo 条目继续生效，非孤儿）。旧「零 insert 条目」断言把插件自有行误判残行，废除。
    const dump = await runDesktopDsh(env, ['--profile', 'web', '--dump-config'])
    expect(dump.code, `dump-config 组合实况成功（exit=${String(dump.code)}）`).toBe(0)
    expect(forgePatchResidueClues(dump.stdout), `forge 下发面残留（插行/config 应清零）${JSON.stringify(forgePatchResidueClues(dump.stdout))}`).toEqual([])
    for (const bare of BARE_BUNDLES) {
      expect(dump.stdout, `五件自有 patch 行在场（卸 forge 合法存留）${bare}`).toMatch(insertEntryPattern(bare))
    }
  })
})

/**
 * CT-DISK-08 构造器：patch 文本中 project 条目（`- id: project` 块）dbFile 表达式的
 * 共库段 `forge/db/forge/forge.db` → 单装缺省段 `forge/db/project/project.db`。
 * 只动 project 块内首处 dbFile 行——其余条目（spec/task-loop/knowledge）原样保留。
 */
function patchProjectDbFileToDefault(patchText: string): string {
  const lines = patchText.split(/\r?\n/)
  const blockStart = lines.findIndex((l) => l.trim() === '- id: project')
  if (blockStart === -1) throw new Error('构造失败：patch 文本无 project insert 条目')
  for (let i = blockStart; i < Math.min(blockStart + 6, lines.length); i++) {
    const line = lines[i] ?? ''
    if (line.includes('dbFile:') && line.includes('forge/db/forge/forge.db')) {
      lines[i] = line.replace('forge/db/forge/forge.db', 'forge/db/project/project.db')
      return lines.join('\n')
    }
  }
  throw new Error('构造失败：project 条目块内 dbFile 共库行缺席')
}
