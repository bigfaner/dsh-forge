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
// 安装形态（CT-DISK-09 三路裁定）：desktop 通道唯一可行形态 = 路 C solo 逐件——
// 五件逐件 solo add + forge solo 变体（零 file: 兄弟依赖，1.12 发布树 <tree>/solo/forge）
// add；安装源 = 发布树（fix-24 单源衔接——发布树路径逐代不同，pnpm file: CAS 键逐代
// 不同，陈旧虚拟 store 副本结构性不可达）；原样包（聚合 file: 依赖）add 本代成功进层
// （bug 5213c7e8 实锚修订——1.11 世代 staging 断裂为历史判例留痕，不作现行预期）。
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
import { type ChildProcess } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, expect, test, type Browser, type Page } from '@playwright/test'
import Database from 'better-sqlite3'
import { closeBareCarrier, launchBareCarrier, type BareCarrier } from '../../../e2e/support/launch.js'
import { registerProject } from '../../../e2e/support/rpc.js'
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
  desktopRealUserData,
  findDispatchLogs,
  generationDriftViolations,
  insertEntryPattern,
  desktopCliChannel,
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

/** desktop 通道 CLI 执行（dshHome = {userData}/harness——与 app 消费面同 home 同 profile；零假隔离 env）。
 * bug 643a40df/e65b24c8 根修：直跑通道 CLI bin 为错锚形态（GUI 二进制 no-op 假成功 +
 * PATH pnpm store 错锚拒装）——现行执行面 = 官方 packaged invocation 单源
 * （e2e/support/forge-combo.ts runDesktopChannelCli：electron exe + harness-node-entry +
 * app.asar CLI entry + 打包 pnpm 注入），锚 FORGE_COMBO_DESKTOP_EXE（必填 fail-loud）。 */
function runDesktopDsh(env: ReturnType<typeof comboEnv>, args: readonly string[]) {
  if (env.desktopExe === undefined) throw new Error('FORGE_COMBO_DESKTOP_EXE 未置位（desktop 通道 CLI = 官方 packaged invocation，锚 exe 必填——bug 643a40df/e65b24c8 修复面）')
  return runDesktopChannelCli(desktopCliChannel(env.desktopExe), args, harnessHome())
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
/** 版本双校验 + M-3 五件代际漂移探针（AGENTS 1.8 取证顺序纪律——大取证前廉价校验，不符即停） */
function cheapGenerationGate(nodeModules: string): void {
  for (const { pkg, installed, source } of versionPairs(nodeModules)) {
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
  })
  // client 半侧装载观察面：client bundle 经宿主 client 注入通道取件——响应 URL 收集（行为锚）
  launched.page.on('response', (res) => {
    const url = res.url()
    if (url.includes('@dsh-forge/')) clientUrls.push(url)
  })
  await waitBootReady(launched.page)
  return { ...launched, clientUrls }
}

/** carrier 在场即复用、缺席即冷启动（worker 重启丢态自愈——案③配套；相位由调用侧保证） */
async function ensureCarrier(env: ReturnType<typeof comboEnv>): Promise<DesktopCarrier> {
  if (carrier !== undefined) return carrier
  carrier = await startCarrier(env)
  return carrier
}

/** 冷启动复锚（装载世代切换——安装态变化后需冷启动判据的用例专用） */
async function restartCarrier(env: ReturnType<typeof comboEnv>): Promise<DesktopCarrier> {
  await shutdownCarrier()
  carrier = await startCarrier(env)
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

  test.afterAll(async () => {
    // 收尾（projection 隔离——只复位本编排安装条目，不删真实 userData 任何内容）：
    // carrier 先关释放锁（closeBareCarrier = carrier 进程 PID 定点进程树回收），再 best-effort
    // 卸 forge 复位（五件成员条目保留——各自独立安装物，非本编排 forge 残留）。
    await shutdownCarrier()
    await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'remove', FORGE_PKG])
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
    const beforeJson = await ensureProfileMaterialized()

    // 路 A/B（Input：发布树父目录 = 六包共置布局，两路输入同形——结构性排除判定面相同）
    const routeAB = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'add', tree])
    expect(routeAB.code, '路 A/B 父目录 add 被拒（非零退出）').not.toBe(0)
    expect(routeAB.stderr.length + routeAB.stdout.length, '路 A/B 错误信息可读（非空）').toBeGreaterThan(0)

    // State（路 A/B 反向锚）：已装清单零变化 + generation registry 零写入（CT-DISK-09 O1/O3）
    expect(JSON.stringify(desktopInstalledBundles(realUd())), '路 A/B rejection 后已装清单零变化').toBe(beforeJson)

    // 对照（原样包·bug 5213c7e8 实锚修订）：本代 generation-install 已按依赖闭包拷贝，
    // staging 断裂（ERR_PNPM_LINKED_PKG_DIR_NOT_FOUND，1.11 世代历史判例留痕）不再复现——
    // 现行预期 = exit 0 且 forge 进层
    const aggregate = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'add', `link:${join(tree, 'forge')}`])
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

  test('CT-DISK-07 #B2 O1：缺件不装 + patch 行在场——缺席降级可观察（诊断留痕 + 降级不扩散）', async () => {
    // d36710e5 廉价闸：solo add 前核销安装宿主 runtime 副本代际（遮蔽在场即 fail-loud）
    assertNoStaleRuntimeShadow(env)
    const four = BARE_BUNDLES.filter((b) => b !== KNOWLEDGE)
    // 构造（CT-DISK-07 Preconditions，solo 形态适配）：knowledge 不逐件 add、forge solo 变体
    // patch 插行仍声明 knowledge——装载缺席可观察构造（旅程 3 #B2 同判据 desktop 通道承载）
    for (const bare of four) {
      const add = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'add', `link:${memberDir(bare)}`])
      expect(add.code, `四件逐件 solo add 成功 ${bare}（exit=${String(add.code)}）`).toBe(0)
    }
    const addForge = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'add', `link:${soloForgeDir()}`])
    expect(addForge.code, `forge solo 变体 add 成功（exit=${String(addForge.code)}）`).toBe(0)

    // carrier 首启（boot 就绪门在 startCarrier 内；worker 重启后本用例自带安装构造可重建相位）
    const launched = await ensureCarrier(env)
    // Output（CT-DISK-07）：宿主正常启动（降级不扩散——O2 回归面：任一在场件不装载即红）
    await expectDesktopWorkbenchVisible(launched.page)
    // State：在场四件 client 半侧取件；缺席件（knowledge）零取件（负向精确——禁 OR 稀释）
    for (const bare of four) {
      expect(launched.clientUrls.some((u) => u.includes(bare)), `在场件 client 取件 ${bare}`).toBe(true)
    }
    expect(launched.clientUrls.some((u) => u.includes(KNOWLEDGE)), '缺席件 knowledge client 零取件').toBe(false)
    // State（CT-DISK-07 锚点·已回填实锚）：缺席诊断留痕含缺席包名（O3 静默缺席 = 红；
    // 落盘面 = {userData}/logs app-*.jsonl——异步队列，poll 等待落盘）
    await expect
      .poll(() => desktopAbsenceEvents(realUd()).filter((e) => e.message.includes(KNOWLEDGE)).length, { timeout: 30_000, intervals: [2_000] })
      .toBeGreaterThanOrEqual(1)
    // 复位：卸 forge（四件条目保留），后续用例重建完整六条目
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
    const addKn = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'add', `link:${memberDir(KNOWLEDGE)}`])
    expect(addKn.code, `knowledge 逐件 solo add 成功（exit=${String(addKn.code)}）`).toBe(0)
    const addForge = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'add', `link:${soloForgeDir()}`])
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
    const again = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'add', `link:${soloForgeDir()}`])
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
    // State 观察点 B：五件 client bundle 被宿主 client 注入通道实际取件（行为证据，非仅文件在场）
    for (const bare of BARE_BUNDLES) {
      expect(launched.clientUrls.some((u) => u.includes(bare)), `client 注入通道实际取件 ${bare}`).toBe(true)
    }
  })

  test('CT-DISK-03 #step-5 O1：共库落点——project_* 域表写入、单装库不存在', async () => {
    await ensureCarrier(env)
    const { browser, page } = await attachCarrier()
    try {
      // Input（CT-DISK-03）：添加项目（注册链经 RPC 项目面——workspaceDir = 真实目录夹具）
      const ws = makeWorkspace('proj')
      const row = await registerProject(page, ws, 'combo-minchain')
      expect(row.id, '项目注册成功（注册返回 projectId）').toBeTruthy()

      // State（CT-DISK-03）：共库 forge/forge.db 出现并写入 project 域（project_* 前缀表 + 注册行；
      // {DSH_HOME} = app 侧 harness home {userData}/harness）
      const comboDb = comboDbPath(harnessHome())
      expect(sqliteTables(comboDb), '共库含 project_* 前缀域表（project_projects）').toContain('project_projects')
      expect(scalarCount(comboDb, 'SELECT COUNT(*) AS n FROM project_projects'), 'project 域表有注册行（共库被写入）').toBeGreaterThanOrEqual(1)

      // State（CT-DISK-03）：单装库不存在（共库接管）
      expect(existsSync(defaultProjectDb(harnessHome())), '单装库 project/project.db 不存在（共库接管）').toBe(false)
    } finally {
      await closeAttach(browser)
    }
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
      await registerProject(page, ws, 'combo-dispatch')

      // Input（CT-DISK-03 步 6/7）：拆任务 + 派发 = agent 会话驱动（官方 composer 发指令；
      // add_task / dispatch_task 为 agent 工具唯一门——RPC 面无写动词）
      const composer = page.locator(COMPOSER_INPUT).last()
      await expect(composer, '官方 composer 在场').toBeVisible({ timeout: 60_000 })
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

    // Input（CT-DISK-08）：dshmarket 通道换装对照变体后添加项目
    const remove = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'remove', FORGE_PKG])
    expect(remove.code, `卸 forge（exit=${String(remove.code)}）`).toBe(0)
    const addVariant = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'add', `link:${variantForge}`])
    expect(addVariant.code, `对照变体 add 成功（exit=${String(addVariant.code)}）stderr=${addVariant.stderr.slice(-400)}`).toBe(0)
    // 冷启动复锚（对照变体生效——装载世代切换，案②形态）
    await restartCarrier(env)
    const { browser, page } = await attachCarrier()
    try {
      const ws = makeWorkspace('contrast')
      const row = await registerProject(page, ws, 'combo-contrast')
      expect(row.id, '对照轮项目注册成功').toBeTruthy()
    } finally {
      await closeAttach(browser)
    }

    // State（CT-DISK-08 O1）：单装库文件存在且含新行、共库零新行（O2 仍落共库 = patch 替换语义失效信号即红）
    const singleDb = defaultProjectDb(harnessHome())
    expect(existsSync(singleDb), '单装库 project/project.db 出现（对照取证：落点确由 patch config 下发驱动）').toBe(true)
    expect(sqliteTables(singleDb), '单装库含 project_* 前缀域表').toContain('project_projects')
    expect(scalarCount(singleDb, 'SELECT COUNT(*) AS n FROM project_projects'), '单装库有新注册行').toBeGreaterThanOrEqual(1)
    expect(scalarCount(comboDb, 'SELECT COUNT(*) AS n FROM project_projects'), '共库零新行（对照面）').toBe(projectCountBefore)

    // 复位：卸对照变体 → 重装 solo 正本（后续卸载三段 Preconditions 恢复）
    const removeVariant = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'remove', FORGE_PKG])
    expect(removeVariant.code, `卸对照变体（exit=${String(removeVariant.code)}）`).toBe(0)
    const addSolo = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'add', `link:${soloForgeDir()}`])
    expect(addSolo.code, `重装 solo 正本（exit=${String(addSolo.code)}）`).toBe(0)
    rmSync(variant, { recursive: true, force: true })
  })

  test('CT-DISK-10（卸载三段·一）O1：卸 forge——条目移除 + 五件条目完好 + 数据快照零变化', async () => {
    const comboDb = comboDbPath(harnessHome())
    // State 快照（锚点：共库/单装库文件快照卸载前后不变）
    const comboStatBefore = fileStat(comboDb)
    const comboRowsBefore = scalarCount(comboDb, 'SELECT COUNT(*) AS n FROM project_projects')

    // Input（CT-DISK-10）：dshmarket 通道 remove forge
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
    // 版本双校验 + 代际探针（残留件逐件成立——CT-DISK-11 Invariants）
    cheapGenerationGate(nodeModules)

    // Input：冷启动宿主（无额外参数——卸 forge 后装载世代切换，冷启动复锚）
    const launched = await restartCarrier(env)
    // Output：宿主正常启动（O2 残留件被拖垮 = 红）
    await expectDesktopWorkbenchVisible(launched.page)
    // State（锚点）：五件残留条目服务/client 双查——client 半侧逐件实际取件
    for (const bare of BARE_BUNDLES) {
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
    const { browser, page } = await attachCarrier()
    try {
      const ws = makeWorkspace('fallback')
      const row = await registerProject(page, ws, 'combo-fallback')
      expect(row.id, '回落轮项目注册成功').toBeTruthy()
    } finally {
      await closeAttach(browser)
    }

    // State（锚点）：回落新数据落单装库路径（文件出现且有新行）
    const singleDb = defaultProjectDb(harnessHome())
    expect(existsSync(singleDb), '回落单装库 project/project.db 出现（回落缺省 config 单装语义）').toBe(true)
    expect(sqliteTables(singleDb), '单装库含 project_* 前缀域表').toContain('project_projects')
    expect(scalarCount(singleDb, 'SELECT COUNT(*) AS n FROM project_projects'), '单装库有回落新行').toBeGreaterThanOrEqual(1)

    // State（锚点）：存量共库只读保留零丢行（O3 卸载丢数据 = 红）
    expect(fileStat(comboDb), '共库文件快照零变化（size + mtime——只读保留）').toEqual(comboStatBefore)
    expect(scalarCount(comboDb, 'SELECT COUNT(*) AS n FROM project_projects'), '共库行数零变化').toBe(comboRowsBefore)

    // State（锚点）：卸载后对账无 forge 条目、无孤儿 patch 行（dump-config 零 forge insert 条目——消费面同 home 同 profile）
    const bundles = desktopInstalledBundles(realUd())
    expect(bundles, '已装清单无 forge 条目（对账零残留）').not.toContain(FORGE_PKG)
    const dump = await runDesktopDsh(env, ['--profile', 'web', '--dump-config'])
    expect(dump.code, `dump-config 组合实况成功（exit=${String(dump.code)}）`).toBe(0)
    for (const bare of BARE_BUNDLES) {
      expect(dump.stdout, `无孤儿 patch insert 条目 ${bare}（组合器卸载零残留）`).not.toMatch(insertEntryPattern(bare))
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
