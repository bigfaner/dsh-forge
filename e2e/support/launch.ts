// e2e 宿主启动支撑层（fix-37 ① 收编）——launchHost（boot 就绪链 + 端口分配 + userData
// 管理）+ closeApp（进程退出等待 + 2s 静置——全员强制，吸收 fix-34③止血）单源。
//
// 分叉以参数承载并注取舍（review 裁决形态）：
// - dismiss：任何收起动作（点击「稍后配置」/Esc）写 dsh 侧客户态，同 userData 下一 boot
//   存在产品工作台挂载竞态（7/7 复现，dismiss 毒化——p1mvp e2e 纪律）→ RPC-only 前置段
//   传 dismiss:false（模态在场不阻塞 evaluate，仅拦指针），收起置于链路末段 UI boot。
// - providerOverlay：复启链路防毒化（provider 可服务 = API-key 弹窗不挂载）；单 boot
//   纯 UI 走查面不必（dismiss 兜底）——comp/kb/pr 沿用，sw/krf/hero 不用。
// - stablePhase：'wait'（30s 相位稳定门——常态）| 'probe'（复启链路 60s 逐拍留痕探针
//   ——comp 形态：settle 慢尾诊断）| 'none'（hero-control：相位由调用侧按项目态断言）。
// - timeouts：安装形态慢盘 120s（缺省 60/90/60）。
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, expect, type ElectronApplication, type Page } from '@playwright/test'
import { allocatePort } from './ports.js'
import { dismissOnboardingModals, READY_ANCHOR } from './modals.js'
import { writeProviderOverlay } from './dogfood.js'
import { WORKBENCH } from './anchors.js'

/** 仓库根（e2e/support/launch.ts 文件面 → 上三级：文件段 + support + e2e。
 *  fix-37 抽层时误减一级（join 是文本段运算，文件自身占一段）——ROOT 落在 e2e/ 使
 *  HOST_DIR 指向不存在目录，launchElectron 的 spawn cwd 非法 → 全体 electron 走查
 *  `spawn cmd.exe ENOENT` 即时失败（fix-40 勘察实证，回迁母本三段口径）。 */
export const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..')
export const HOST_DIR = join(ROOT, 'apps', 'host')

/**
 * harness 派生会话自愈（fix-9——1.34 归因分类 1 升级形态）：
 *  - 指纹 = DSH_SHELL === '1'（dispatch worker 会话 env 实测在案）。
 *  - E2E_ELECTRON_SWITCHES 缺省视为 '1'：派生进程树内 chromium sandbox 初始化即崩
 *    （0x80000003 实证），--no-sandbox 等开关必须自动启用——替代「跑批环境统一注入」
 *    （派发器 env 注入不可控，自愈一次落地全池受益）。
 *  - e2eUserDataRoot()：E2E_USER_DATA_ROOT 覆写优先；harness 派生 → <ROOT>/.e2e-ud
 *    （workspace 可写基目录，%TEMP% chromium 锁写拒实证）；真实终端 → tmpdir() 缺省
 *    零变化。与 sanitizedLaunchEnv 摘 ELECTRON_RUN_AS_NODE 同语义：e2e 支撑层对派生
 *    环境自愈，不依赖调用方手工置 env。
 */
const harnessDerived = process.env.DSH_SHELL === '1'

/** electron 启动开关门：显式 env 优先；缺省仅 harness 派生会话自愈启用 */
const e2eElectronSwitches = process.env.E2E_ELECTRON_SWITCHES ?? (harnessDerived ? '1' : undefined)

/** userData 基目录：env 覆写 → harness 派生 workspace 可写路径 → 真实终端 tmpdir() 缺省
 *  （覆写与自愈路径均 ensure 存在——消除调用侧预建依赖；tmpdir() 平台保证在场） */
export function e2eUserDataRoot(): string {
  const override = process.env.E2E_USER_DATA_ROOT
  if (override !== undefined && override !== '') {
    mkdirSync(override, { recursive: true })
    return override
  }
  if (harnessDerived) {
    const root = join(ROOT, '.e2e-ud')
    mkdirSync(root, { recursive: true })
    return root
  }
  return tmpdir()
}

/** electron 二进制（apps/host 依赖闭包解析——pnpm 隔离布局根 node_modules 无 electron） */
export const electronBinary = createRequire(join(HOST_DIR, 'package.json'))('electron') as unknown as string

// ─── 原始启动面（壳级/harness 形态：host-boot/web-shell/installer-pipeline/安装套件） ───

export interface RawLaunchOptions {
  /** 安装产物 exe（缺省 dev electron + apps/host cwd） */
  readonly executablePath?: string
  readonly cwd?: string
  readonly args?: readonly string[]
  /** 追加 env（TEMP/TMP 重定向、RESOURCES_DIR、MATERIALIZE_ONLY 等；端口缺省经分配器） */
  readonly env?: Record<string, string>
  /** 缺省 allocatePort()——显式传入仅在 harness 自管端口形态 */
  readonly port?: number
}

/**
 * 子会话环境净化（fix-7 环境纪律——DSH 宿主链会话继承的两枚毒化变量在启动面摘除）：
 *  - ELECTRON_RUN_AS_NODE=1：harness .desktop-bin node.cmd shim 注入——electron 以 Node
 *    模式启动即秒败（首轮池全体 journey 秒败根因；e2e/fixtures README 同记）。
 *  - DSH_HOME：真 home 数据界——在场即压过 fix-26 缺省隔离（paths.ts 第三层，main.ts
 *    `??=` 让位），e2e 变读污染真 home：官方工作区账本/会话恢复/凭据全串味（官方 dsh 继承
 *    真 home 工作区标题→hero 芯片文案锚失配 + 真 home 状态拖慢 boot + 存储/凭据串场；
 *    「仅调试/特殊布局有意使用」——e2e 恒隔离，paths.ts resolveDshHome 层注记同口径）。
 *  显式口不动：DSH_FORGE_DSH_HOME（paths.ts 第一层显式覆盖）照传；凭据播种归 dogfood
 *  specs 自管（launch 层不播种——零凭据 Hard Rule，见 launchHost 内注记），真 home 凭据
 *  读面（~/.dsh）不经 DSH_HOME，零波及。
 */
function sanitizedLaunchEnv(): Record<string, string> {
  const env = { ...process.env } as Record<string, string>
  delete env.ELECTRON_RUN_AS_NODE
  delete env.DSH_HOME
  // fix-11 根因伴生面：回退浏览器起始根 = 宿主 os.homedir()（fs-rpc listDir 缺省）。
  // fix-10 dispatch TMP 重定向在期（env 标记随进程树继承）→ 夹具落重定向根，与真 home
  // 常跨盘符（行双击无法跨盘）——宿主 USERPROFILE 对齐重定向根，起始根 = 夹具所在根；
  // 真实终端无标记零变化。
  const redirected = process.env.__E2E_TMP_REDIRECTED__
  if (redirected !== undefined && redirected !== '') env.USERPROFILE = redirected
  return env
}

/** 薄宿主原始启动（不做就绪链——调用侧自定义等待面） */
export async function launchElectron(opts: RawLaunchOptions = {}): Promise<ElectronApplication> {
  const { _electron } = await import('@playwright/test')
  const installed = opts.executablePath !== undefined && opts.executablePath !== electronBinary
  // 双主题取证（fix-2）：E2E_COLOR_SCHEME=dark|light → Playwright colorScheme（Electron
  // nativeTheme 强制——dsh 主题面 prefers-color-scheme 跟随，client-ui-theme ui-theme service）
  const colorScheme = process.env.E2E_COLOR_SCHEME
  return _electron.launch({
    executablePath: opts.executablePath ?? electronBinary,
    ...(colorScheme === 'dark' || colorScheme === 'light' ? { colorScheme } : {}),
    ...(installed
      ? {}
      : {
          args: [
            // chromium 启动开关（置于 app 路径前才生效——electron 参数序：switches * 前置）。
            // --no-sandbox：宿主派生进程树内 chromium sandbox 初始化即崩（0x80000003 实证）
            //   ——仅 e2e 隔离面放行；真实终端非必需、无害。
            // --disable-gpu：无头 e2e 无渲染保真诉求。
            // --no-proxy-server：系统代理会劫持 LAN origin 页面导航（node fetch 绕代理而
            //   chromium 不绕——jar 可达而 page.goto 挂起实证）；e2e 直连。
            ...(e2eElectronSwitches === '1'
              ? ['--no-sandbox', '--disable-gpu', '--no-proxy-server']
              : []),
            ...(opts.args ?? []),
            '.',
          ],
          cwd: opts.cwd ?? HOST_DIR,
        }),
    env: {
      ...sanitizedLaunchEnv(),
      DSH_FORGE_PORT: String(opts.port ?? allocatePort()),
      // e2e 无头形态（缺省开）：DSH_FORGE_WINDOW_HIDDEN=1 → 宿主不显窗（人不可见，缝语义见
      // apps/host/src/window/create.ts 头注；devtools 已无自动开路径——main.ts F12 按需，e2e
      // 零弹窗）。E2E_WINDOW_VISIBLE=1 一键恢复可见（调试/走查形态）；置于 opts.env 之前
      // ——调用侧 env 仍可显式覆盖。
      ...(process.env.E2E_WINDOW_VISIBLE === '1' ? {} : { DSH_FORGE_WINDOW_HIDDEN: '1' }),
      ...opts.env,
    } as Record<string, string>,
  })
}

// ─── 裸启动 carrier 面（fix-27 根修——038 轮定谳：electron.launch 注入形态退役） ───

/**
 * 裸启动 carrier 配方（038 轮取证实证单源——piped-probe.log 20s harnessPhase ready 全绿；
 * 039 轮根修 a96e09a5 复发家族）：直接 spawn Electron 二进制 + piped stdio + FORCE_COLOR=1
 * + sanitizedLaunchEnv（ELECTRON_RUN_AS_NODE 摘除）。禁 `_electron.launch` 注入形态——
 * 其 ELECTRON_RUN_AS_NODE 节点包装会杀 app 孙进程 harness（81ms SIGTERM 实锚，
 * 038-forensics/desktop-attempt1/harness.log.tail）。复刻探针与 e2e carrier 共用本配方
 * （禁两套漂移）。
 */
export interface BareCarrierOptions {
  /** 宿主二进制（安装产物 exe） */
  readonly executablePath: string
  /** 追加 chromium 开关（如 --remote-debugging-port=0——CDP 附着取证通道） */
  readonly args?: readonly string[]
  /** 追加 env（叠加于 sanitizedLaunchEnv + FORCE_COLOR=1） */
  readonly env?: Record<string, string>
  /** 进程 cwd（缺省 exe 所在目录） */
  readonly cwd?: string
  /** DevTools ws 端点捕获上限（缺省 30s）；进程提前退出即抛 */
  readonly wsTimeoutMs?: number
}

/** 裸启动 carrier 返回形态 */
export interface BareCarrier {
  readonly process: ChildProcess
  /** DevTools ws 端点（CDP 附着通道——chromium.connectOverCDP） */
  readonly wsEndpoint: string
  /** 主窗口观察页（CDP 附着取件——与 launchElectron firstWindow 同面） */
  readonly page: Page
  /** CDP 附着句柄（断开不影响 carrier 进程生命周期） */
  readonly browser: import('@playwright/test').Browser
  /** stdout/stderr 收集 tail（stderr 判据源：reportSkippedBundles 直落面等） */
  readonly stdoutTail: (max?: number) => string
  readonly stderrTail: (max?: number) => string
}

/** 裸启动 carrier（配方见 BareCarrierOptions 头注——单源，禁另起灶台） */
export async function launchBareCarrier(opts: BareCarrierOptions): Promise<BareCarrier> {
  const env = {
    ...sanitizedLaunchEnv(),
    FORCE_COLOR: '1',
    ...opts.env,
  } as Record<string, string>
  const proc = spawn(opts.executablePath, [...(opts.args ?? [])], {
    cwd: opts.cwd ?? dirname(opts.executablePath),
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  })
  let stdout = ''
  let stderr = ''
  proc.stdout?.on('data', (chunk: Buffer) => {
    stdout += String(chunk)
  })
  proc.stderr?.on('data', (chunk: Buffer) => {
    stderr += String(chunk)
  })
  const wsTimeoutMs = opts.wsTimeoutMs ?? 30_000
  const wsDeadline = Date.now() + wsTimeoutMs
  let wsEndpoint: string | undefined
  while (Date.now() < wsDeadline) {
    wsEndpoint = stderr.match(/DevTools listening on (ws:\/\/\S+)/)?.[1]
    if (wsEndpoint !== undefined || proc.exitCode !== null) break
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  if (wsEndpoint === undefined) {
    throw new Error(
      `裸启动 carrier 失败：DevTools ws 端点未捕获（exit=${String(proc.exitCode)}，上限 ${String(wsTimeoutMs / 1000)}s）` +
        `stderr=${stderr.slice(-600)}`,
    )
  }
  // 单实例移交 fail-loud（fix-38——静默错锚根修）：desktop 宿主单实例语义下，外部实例
  // 在侧时本 spawn 秒退（exit 0）且其 DevTools 短暂可见——ws 已捕获但进程已退 = 取证面
  // 挂到旧实例（旧装载世代 boot 图），client 取件等观察面全部错锚。进程已退即抛。
  if (proc.exitCode !== null) {
    throw new Error(
      `裸启动 carrier 失败：ws 已捕获但进程已退（exit=${String(proc.exitCode)}）——desktop 单实例移交形态，` +
        `外部宿主实例在侧（复跑前置：Get-Process 零命中），零静默错锚`,
    )
  }
  const browser = await chromium.connectOverCDP(wsEndpoint)
  // CDP 附着后二次核验（fix-38）：附着窗口期内进程退出（单实例移交竞态）= 取证面已错锚
  if (proc.exitCode !== null) {
    await browser.close().catch(() => undefined)
    throw new Error(`裸启动 carrier 失败：CDP 附着后进程已退（exit=${String(proc.exitCode)}）——单实例移交，外部实例在侧`)
  }
  const ctx = browser.contexts()[0]
  if (ctx === undefined) {
    await browser.close().catch(() => undefined)
    throw new Error('裸启动 carrier 失败：CDP 默认 context 缺席（主窗口未就绪）')
  }
  const page = ctx.pages()[0] ?? (await ctx.waitForEvent('page', { timeout: 30_000 }))
  return {
    process: proc,
    wsEndpoint,
    page,
    browser,
    stdoutTail: (max = 600) => stdout.slice(-max),
    stderrTail: (max = 600) => stderr.slice(-max),
  }
}

/**
 * 裸启动 carrier 关闭（closeApp 同语义有界形态）：先优雅 taskkill（无 /F——WM_CLOSE，
 * 宿主走 graceful quit 通道：日志 flush/锁释放），15s 未决再强制进程树回收
 * （taskkill /T /F）→ exit 等待（10s 兜底）→ 2s 静置（端口/句柄复用竞态防护）。
 */
export async function closeBareCarrier(carrier: Pick<BareCarrier, 'process'>): Promise<void> {
  const proc = carrier.process
  const pid = proc.pid
  if (proc.exitCode === null && pid !== undefined && process.platform === 'win32') {
    // 优雅面：WM_CLOSE（无 /F）——宿主 graceful quit（日志 flush + 单实例锁释放）
    spawn('taskkill', ['/PID', String(pid)], { stdio: 'ignore' })
    const gracefulDeadline = Date.now() + 15_000
    while (proc.exitCode === null && Date.now() < gracefulDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  if (proc.exitCode === null) {
    killProcessTree(pid, () => proc.kill('SIGKILL'))
  }
  if (proc.exitCode === null) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 10_000)
      proc.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
  await new Promise((resolve) => setTimeout(resolve, 2_000))
}

// ─── 就绪链族 ───

/** 全局标记读取形态（page.evaluate 内联判读用） */
interface ShellGlobals {
  __DSH_BOOT_READY__?: unknown
  __ModuleLoader__?: { mode: string }
  __DSH_FORGE_CLIENT__?: unknown
}

/** 壳 boot 就绪链：就绪门 → 模块系统 live → CLIENT 就绪（冷启窗口自愈——1.26/002 判例）。
 *
 * 冷启等待策略（宿主冷启后 __ModuleLoader__ live 但 __DSH_FORGE_CLIENT__ 就绪存在窗口
 * ——002 轮 waitShellReady 90s 超时判例，四轮同错家族收口）：
 *  - ModuleLoader live 后轮询 __DSH_FORGE_CLIENT__ 至就绪，上限放宽至 180s；
 *  - 就绪前宽限 45s 未就绪 → 整页 reload 一次（冷启装配竞态自愈），reload 后 boot 就绪门
 *    与模块 live 门按原口径重等（各 60s/90s），再继续 CLIENT 轮询至总上限；
 *  - reload 至多一次（防无限循环——二次未就绪 = 真阻塞，超时上抛交调用侧归因）。
 */
export async function waitShellReady(
  page: Page,
  timeouts: {
    readonly bootReady?: number
    readonly loaderLive?: number
    readonly clientReady?: number
  } = {},
): Promise<void> {
  await page.waitForFunction(
    () => (globalThis as unknown as ShellGlobals).__DSH_BOOT_READY__ !== undefined,
    undefined,
    { timeout: timeouts.bootReady ?? 60_000 },
  )
  await page.waitForFunction(
    () => (globalThis as unknown as ShellGlobals).__ModuleLoader__?.mode === 'live',
    undefined,
    { timeout: timeouts.loaderLive ?? 90_000 },
  )
  const clientReadyMs = timeouts.clientReady ?? 180_000
  const deadline = Date.now() + clientReadyMs
  const graceMs = 45_000
  const startedAt = Date.now()
  let reloaded = false
  for (;;) {
    const clientReady = await page
      .evaluate(() => (globalThis as unknown as ShellGlobals).__DSH_FORGE_CLIENT__ !== undefined)
      .catch(() => false)
    if (clientReady) return
    if (Date.now() > deadline) {
      throw new Error(
        `waitShellReady：__DSH_FORGE_CLIENT__ 就绪超时（上限 ${String(clientReadyMs / 1000)}s，整页 reload 已试=${String(reloaded)}）`,
      )
    }
    if (!reloaded && Date.now() - startedAt > graceMs) {
      // 冷启窗口自愈：loader live 而 CLIENT 未就绪的装配竞态——整页 reload 一次重走装配
      reloaded = true
      await page.reload().catch(() => undefined)
      await page.waitForFunction(
        () => (globalThis as unknown as ShellGlobals).__DSH_BOOT_READY__ !== undefined,
        undefined,
        { timeout: timeouts.bootReady ?? 60_000 },
      ).catch(() => undefined)
      await page.waitForFunction(
        () => (globalThis as unknown as ShellGlobals).__ModuleLoader__?.mode === 'live',
        undefined,
        { timeout: timeouts.loaderLive ?? 90_000 },
      ).catch(() => undefined)
    }
    await page.waitForTimeout(2_000)
  }
}

/** 相位稳定门返回形态 */
export type WorkbenchPhase = 'hero' | 'session'

/** 相位稳定门（settling 收敛——hero/session 二态；waitForFunction 30s 形态；就绪锚选择器
 *  与 modals READY_ANCHOR 单源——F8 相位就绪锚知识不双写） */
export async function stablePhase(page: Page, timeoutMs = 30_000): Promise<WorkbenchPhase> {
  await page.waitForFunction(
    (anchor) => document.querySelector(anchor) !== null,
    READY_ANCHOR,
    { timeout: timeoutMs },
  )
  return page.locator(WORKBENCH).first().getAttribute('data-dswf-phase') as Promise<WorkbenchPhase>
}

/** 工作台桥导航（fix-25：官方面板径——showSession = layout.selectPanel(null) 回官方
 *  会话面板；无产品会话行期的载体适配，台账口径保持） */
export async function bridgeDispatch(page: Page, type: string): Promise<void> {
  await page.evaluate((eventType) => {
    const bridge = (globalThis as { __DSH_FORGE_WORKBENCH__?: { showSession(): void } }).__DSH_FORGE_WORKBENCH__
    if (eventType === 'show-session') bridge?.showSession()
  }, type)
}

// ─── 组合启动面（16 specs 主形态） ───

export interface LaunchHostOptions {
  /** 隔离 userData（e2e 单实例纪律——调用侧 mkdtemp 创建、finally 清理） */
  readonly userData: string
  /** boot 叠层路径（DSH_FORGE_PATCH_FILES——dogfood 模型叠层等） */
  readonly overlay?: string
  /** 是否收起官方首启引导模态（缺省 true；RPC-only 前置段传 false——毒化面，见头注） */
  readonly dismiss?: boolean
  /** 向导走查归回退面（缺省 off——fix-14：OS 对话框不可 e2e，preload 桥降级开关） */
  readonly directoryPickerOff?: boolean
  /** dev profile 掌舵（缺省 true——安装形态 exe 自掌舵传 false） */
  readonly devProfile?: boolean
  /** provider 叠层（复启链路防毒化：API-key 弹窗预免——comp/kb/pr 形态） */
  readonly providerOverlay?: boolean
  /** 相位稳定门形态（缺省 'wait'；'probe' = 复启链路 60s 逐拍留痕；'none' = 调用侧自管） */
  readonly stablePhase?: 'wait' | 'probe' | 'none'
  /** 稳定后相位断言（如 fresh 零项目 boot 断 hero——pr 形态） */
  readonly expectPhase?: WorkbenchPhase
  /** console 收集（缺省 false——comp 诊断形态：末 60 条环形缓冲） */
  readonly collectConsole?: boolean
  /** 安装产物 exe（缺省 dev electron） */
  readonly executablePath?: string
  /** 追加 env（TEMP/TMP 重定向等） */
  readonly env?: Record<string, string>
  /** 就绪链超时（安装形态慢盘 120s；缺省 60/90/180——firstWindow 缺省 playwright 30s：
   *  bootDshHost（child spawn + profile 装配）先于首窗，内存受限/慢盘环境首窗可越 30s；
   *  clientReady = 冷启窗口 CLIENT 就绪轮询上限（1.26/002 判例收口）） */
  readonly timeouts?: {
    readonly firstWindow?: number
    readonly bootReady?: number
    readonly loaderLive?: number
    readonly clientReady?: number
    readonly workbenchVisible?: number
  }
}

export interface Launched {
  readonly app: ElectronApplication
  readonly page: Page
  /** renderer 未捕获异常（pageerror 面——多数套件终态断言空） */
  readonly pageErrors: string[]
  /** console 环形缓冲（仅 collectConsole:true——相位稳定探针诊断面） */
  readonly consoleTail: string[]
  /** 本启动写入的叠层路径（providerOverlay:true 时在场——finally 清理责任在调用侧） */
  readonly overlayPath?: string
}

/** 组合启动：env 装配 → 就绪链 → 工作台可见 → 模态处置（可选）→ 相位稳定门 */
export async function launchHost(opts: LaunchHostOptions): Promise<Launched> {
  const {
    userData,
    overlay,
    dismiss = true,
    directoryPickerOff = true,
    devProfile = true,
    providerOverlay = false,
    stablePhase: settleMode = 'wait',
    expectPhase,
    collectConsole = false,
    executablePath,
    env,
    timeouts,
  } = opts
  const overlayPath = providerOverlay ? writeProviderOverlay() : undefined
  // 凭据播种不在本层（fix-7 cycle-3 定性收口）：隔离 dsh-home 缺 .credentials.yaml = 官方
  // 零凭据形态（模型调用失败不影响会话建档——fix-42 台账 Hard Rule 零真实模型，tsl 族
  // fixture 即此形态；launch 层无条件播种曾令零凭据 spec 变真实模型活会话——转录判据
  // 被活体 agent 面污染，m2 tsl :173/:538 实证）。dogfood specs 自带播种（seedDshHome
  // 同文件同字节）+ 叠层，launch 层零重复；onboarding 模态 = 既有 dismiss 纪律处置。
  const app = await launchElectron({
    executablePath,
    env: {
      ...(devProfile ? { DSH_FORGE_DEV_PROFILE: 'dev' } : {}),
      ...(overlay === undefined ? {} : { DSH_FORGE_PATCH_FILES: overlay }),
      ...(overlayPath === undefined ? {} : { DSH_FORGE_PATCH_FILES: overlayPath }),
      DSH_FORGE_USER_DATA: userData,
      ...(directoryPickerOff ? { DSH_FORGE_DIRECTORY_PICKER: 'off' } : {}),
      ...env,
    },
  })
  const page = await app.firstWindow({ timeout: timeouts?.firstWindow })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  const consoleTail: string[] = []
  if (collectConsole) {
    page.on('console', (msg) => {
      const text = `[${msg.type()}] ${msg.text()}`
      consoleTail.push(text.slice(0, 300))
      if (consoleTail.length > 60) consoleTail.shift()
    })
  }
  await waitShellReady(page, timeouts)
  await expect(page.locator(WORKBENCH).first()).toBeVisible({
    timeout: timeouts?.workbenchVisible ?? 60_000,
  })
  if (dismiss) await dismissOnboardingModals(page)
  if (settleMode === 'probe') {
    // 复启链路相位稳定门（60s 采样轮询 + 逐拍留痕——comp 形态：settle 收敛偶有慢尾）
    const settleDeadline = Date.now() + 60_000
    for (;;) {
      const probe = await page.evaluate(() => ({
        phase: document.querySelector('[data-dswf-workbench]')?.getAttribute('data-dswf-phase') ?? null,
        workbenchCount: document.querySelectorAll('[data-dswf-workbench]').length,
        bodyText: document.body.innerText.slice(0, 200),
        rootHtmlLen: document.getElementById('root')?.innerHTML.length ?? -1,
        clientLive: (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__ !== undefined,
        loaderMode: (globalThis as { __ModuleLoader__?: { mode: string } }).__ModuleLoader__?.mode ?? null,
      }))
      if (probe.phase === 'hero' || probe.phase === 'session') break
      if (Date.now() > settleDeadline) {
        throw new Error(
          `相位稳定超时（60s）：phase=${String(probe.phase)} workbench=${String(probe.workbenchCount)} clientLive=${String(probe.clientLive)} loader=${String(probe.loaderMode)} rootLen=${String(probe.rootHtmlLen)} windows=${String(app.windows().length)} body=${probe.bodyText}\nconsoleTail=${consoleTail.slice(-25).join(' || ')}`,
        )
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000))
    }
  } else if (settleMode === 'wait') {
    await stablePhase(page)
  }
  if (expectPhase !== undefined) {
    await expect(page.locator(WORKBENCH)).toHaveAttribute('data-dswf-phase', expectPhase, {
      timeout: 30_000,
    })
  }
  return { app, page, pageErrors, consoleTail, overlayPath }
}

/**
 * closeApp 有界看门狗（fix-20 防御性加固——fix-19 裁决②，非缺陷修复）：
 * 判例留档——1.72 基线单次 closeApp 挂死（480s 测试超时 + 60s teardown = 540s 代价），
 * 四次定向复现全绿且退出链全链有界核销在案（bug 3fe6d3f5 裁决「环境级疑似而非代码缺陷」，
 * 与 AGENTS.md「Windows commit 耗尽」症状族一致——随机进程冻结，与代码路径无关）。
 * 本看门狗是防御面：优雅 close 30s 未决 → taskkill /T /F 强制进程树回收，把单次偶发
 * 挂死代价封顶到 ~30s；正常路径优雅 close 秒级完成，永不触及 kill 分支。
 */
const CLOSE_WATCHDOG_MS = 30_000

/** 进程树强杀：Windows taskkill /T /F（含子进程树）；其余平台 SIGKILL 直杀主进程；
 *  pid 缺席（进程已退出竞态）退回 playwright 进程句柄 kill 兜底 */
function killProcessTree(pid: number | undefined, fallback: () => void): void {
  if (pid !== undefined) {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // 进程已退出——竞态无害
      }
    }
  } else {
    fallback()
  }
}

/**
 * 关闭宿主并等待主进程退出 + 2s 静置（句柄/端口复用竞态防护——既有 specs 同源；
 * fix-34 止血形态，fix-37 收编单源——全员强制消费，禁止裸 app.close()）。
 * 优雅退出链（app.close → exit 等待）整体置于 30s 看门狗之下（头注判例）。
 */
export async function closeApp(app: ElectronApplication): Promise<void> {
  const proc = app.process()
  let watchdog: NodeJS.Timeout | undefined
  let watchdogFired = false
  const deadline = new Promise<void>((resolve) => {
    watchdog = setTimeout(() => {
      watchdogFired = true
      killProcessTree(proc.pid, () => {
        proc.kill('SIGKILL')
      })
      resolve()
    }, CLOSE_WATCHDOG_MS)
  })
  proc.once('exit', () => {
    if (watchdog !== undefined) clearTimeout(watchdog)
  })
  try {
    await app.close().catch(() => undefined)
    if (proc.exitCode === null) {
      await Promise.race([
        new Promise<void>((resolve) => proc.once('exit', resolve)),
        deadline,
      ])
    }
  } finally {
    if (watchdog !== undefined) clearTimeout(watchdog)
    // 看门狗已强杀（或 exit 尚未落地）时仍等待进程真正退出——有界 10s 兜底
    if (proc.exitCode === null) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 10_000)
        proc.once('exit', () => {
          clearTimeout(timer)
          resolve()
        })
      })
    }
    if (watchdogFired) {
      console.warn(`[closeApp] 优雅退出超 ${CLOSE_WATCHDOG_MS / 1000}s，看门狗强制进程树回收 (pid=${String(proc.pid)})`)
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 2_000))
}
