// dsh 宿主 boot 子进程入口（fix-1 child 形态；定位：基础）。
// 形态：ELECTRON_RUN_AS_NODE=1 --expose-internals 子进程（官方 Desktop 同款；由
// run.ts spawn，母本 = S1 spike main.mjs run3）。动机：direct-in-main 形态 boot
// 可跑但 agent 工具派发恒挂起（4.2 dogfood 插桩实证），修复方向 = boot 切 child 形态。
// 职责：argv 收 BootDshOptions JSON → loadProfileDirectory → boot overlay →
// runProfile（direct 形态原路径原序，整体平移）→ ready 消息面世
// {url, injections, 六服务在场位（P1 双服务 + M2 四域）}；随后常驻应答 rpc（bridge.dispatchRpc）与
// shutdown（ProcessShutdown.shutdown(0)——有界 5s 升级强退自带）。
// boot 链模块实例经 boot-chain.ts 统一解析（fix-20：dev 形态与插件树同拷贝，
// 消 bootstrapIncludes WeakMap 分裂——见该文件动机）。
// 以下 type-only 引入仅为拉入 cordis Context 模块增强（ctx.connection / ctx.webServer 类型）
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { renderIndexInjections } from '@deepseek-ai/dsh-host-webserver'
// mobile-remote-approval fix-2：ctx.approval 具名服务类型（disc-1 配方——type-only import
// 官方包 + 运行期存在性检查承担 fail-soft；禁 ctx.reflect.get 丢类型取法）
import type {} from '@deepseek-ai/dsh-user-approval'
import { dirname, join, sep } from 'node:path'
import { spawn as nodeSpawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { networkInterfaces, tmpdir } from 'node:os'
import { TunnelManager, type TunnelDeps, type TunnelState } from '../tunnel/index.js'
import { createChildProcessHandle } from '../tunnel/process-handle.js'
import {
  approvalWaterfallAnswer,
  createApprovalRelay,
  dispatchRpc,
  extraPatchFiles,
  parseChildOptions,
  pairRedirectOf,
  isTunnelHost,
  redactTokenQuery,
  remoteViewFilePathOf,
  remoteViewIndexTap,
  renderRemoteDistMissingPage,
  REMOTE_VIEW_MOUNT,
  sanitizeLogLine,
  sendGuarded,
  type ApprovalRelay,
  type BridgeServiceName,
  type ChildToMainMessage,
  type MainToChildMessage,
} from './bridge.js'
import { loadBootChain } from './boot-chain.js'
import { writeBootOverlay } from './overlay.js'
import { lanIpv4Of, remotePairUrlOf, tunnelPairUrlOf } from './manifest.js'
import {
  PAIRING_TTL_MS,
  createPairingIssuer,
  createPinIssuer,
  pinOfSubmission,
  renderPairingPinErrorPage,
  renderPairingPinPage,
  type PinPersist,
} from './pairing.js'
import { authorizeRemoteRpc, handleRemoteHttpRpc, isRemoteHttpRpcRequest } from './remote-http-rpc.js'
// mobile-ui 1.11：PSK v3 host 侧 + forge:proxy 通道族 + 加密 forge-stream（tunnel-psk v3.1）
import { isPskEnforcedHost, staticSignatureHeaders, writeConstant401 } from './psk.js'
import {
  createStreamSealer,
  ensurePskPersist,
  loadPskPersist,
  loadWatermarks,
  pskTrioOf,
  rotatePsk,
  saveWatermarks,
  type PskGateDeps,
} from './psk-gate.js'
import { createForgeStreamHandler, isForgeStreamRequest, subscribeOfficialEvents } from './forge-stream.js'
import type { ProxyCommandsFace, ProxySessionFace, ProxyUserQuestionsFace } from './proxy-channels.js'
import { apiLoopbackGuardListener } from './api-loopback-guard.js'
import type { RemoteChannelService } from '../ipc/remote-rpc.js'
import { refreshKnowledgeBindings } from '../ipc/bindings.js'
import { createWorktreeIdentity, GIT_WORKTREE_IDENTITY_SERVICE } from '../ipc/worktree-identity.js'
import {
  createWorktreeRpcService,
  interceptRequiredBinding,
  interceptSessionSends,
  verifySendGuardInstalled,
  type SessionControllerFace,
  type SessionPersistenceFace,
  type WorktreeRpcService,
} from '../ipc/worktree-rpc.js'
// fix-4：ctx.gitWorktree 具名消费的类型面（@dsh-forge/git-worktree declare module 扩充
// @deepseek-ai/cordis Context——本 import 拉入扩充；type-only 官方包裁决同径）
import type {} from '@dsh-forge/git-worktree'
import type { ProjectService } from '@dsh-forge/contracts'
import { MIME, resolveMobileDistDir } from '../window/web-document.js'
import { isDevProfile } from '../profile/paths.js'
import { loadPresetPatches } from '../profile/presets.js'
import { productPackagePresent } from '../profile/paths.js'
import {
  createDiagContextStore,
  emitDiag,
  relayDiagOverBridge,
  runWithDiagContext,
} from '../telemetry/index.js'
import { attachGatewayFoldDiag, type GatewayFoldFace } from '../telemetry/gateway-fold.js'
import type { PromptTraceSpan } from '../ipc/worktree-rpc.js'

/** cordis ctx 的服务解析窄面（reflect.provide 的逆查询；真 Context.get 结构兼容） */
interface ServiceGetFace {
  get(name: string): unknown
}

/** cordis 可选具名服务惰性取法（AGENTS.md 裁决——具名访问 + 运行期存在性检查承担 fail-soft；
 *  服务未装载/未 provide = undefined 降级，不抛） */
function lazyCordisService(face: ServiceGetFace, name: string): unknown {
  try {
    return face.get(name) ?? undefined
  } catch {
    return undefined
  }
}

/** 官方 ToolRuntime 的结构化窄面（tools 服务——dsh-tools Service，super(ctx, "tools") 注册名） */
interface ToolRuntimeFace {
  schemas(scope?: unknown): readonly { readonly name?: unknown }[]
}

/** ToolRuntime 已注册 tool 名全集（全局视图；读取/形状异常 = undefined 观测降级不抛） */
function toolNamesOf(face: ServiceGetFace): readonly string[] | undefined {
  try {
    const tools = face.get('tools') as ToolRuntimeFace | undefined
    if (tools === undefined || typeof tools.schemas !== 'function') return undefined
    return tools
      .schemas()
      .map((s) => (typeof s.name === 'string' ? s.name : ''))
      .filter((name) => name !== '')
  } catch {
    return undefined
  }
}

// fix-33 ① send 防护：IPC 序列化抛错（BigInt/循环引用）不落 unhandled rejection——
// rpc-result 面回填保 id 降级 error-result（主侧 pending 可结算）。见 bridge.sendGuarded。
const send = (message: ChildToMainMessage): void => {
  sendGuarded(message, (m) => process.send?.(m))
}

// fix-23 诊断日志落盘链（Root cause: fix-22 的 [pair-diag] 用 console.log——child stdio
// inherit 只回流主控台，打包 GUI 形态无控制台亦无任何写盘链，harness.log 恒零记录）。
// 修法 = 产品日志 sink：诊断行经桥 diag 消息送达主进程（main.ts → noteHarnessLog 落
// harness.log），console 保留供 dev 形态观测（双写，零成本）。
const diag = (line: string): void => {
  send({ type: 'diag', line })
  console.log(line)
}

// 消息处理器换芯位：ready 面世前静默丢弃（主侧约定不先发——ready 收到前无 rpc/shutdown），
// boot 完成后置换为真处理器；listen 常驻不拆（消息零丢失窗）。
/** trace_id 生成（child 侧——链 B prompt 入口；crypto.randomUUID 同 preload 口径） */
const newTraceIdChild = (): string => {
  try {
    return globalThis.crypto.randomUUID()
  } catch {
    return `tr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}
let handleMessage: (message: MainToChildMessage) => void = () => {}
process.on('message', (message: unknown) => {
  handleMessage(message as MainToChildMessage)
})

// 主进程消亡（IPC 断开）→ 有界优雅关停（已 boot：ProcessShutdown.shutdown 自带 5s
// 升级强退；未 boot：直接退出——不留孤儿 webserver 持端口）。
let shutdownTree: (() => Promise<void>) | undefined
// dsh-mobile-tunnel：隧道停机缝（装配在场时由分支内赋值——有界杀当前句柄，无孤儿）
let tunnelStop: () => Promise<void> = async () => {}
// fix-17 ②：tab 切换重连缝（装配在场时由分支内赋值——隧道离线即建立，在线重推读数）
let tunnelToggle: () => void = () => {}
// fix-18：显式换线缝（装配在场时由分支内赋值——TunnelManager.fallback 停旧链起新链）
let tunnelFallback: () => void = () => {}
// fix-18：PIN 重置缝（装配在场时由分支内赋值——pinIssuer.rotate 新 PIN 经 pair 消息回推）
let pinRotate: () => void = () => {}
// fix-26：长效密码开关缝（装配在场时由分支内赋值——setDurable + pair 消息回推）
let pinConsentToggle: (consent: boolean) => void = () => {}
// fix-26：长效密码位（pin-consent 缝驱动——pair/ready 载荷 PIN 面双态单源）
let pinDurable = false
// fix-25：worker 侧审批中继（fix-2 桥——/remote/__rpc 审批端点与 main 侧 forge:remote/
// approval 转发器共用同一中继单源；装配段赋值，缺席 = 端点内 fail-soft unavailable）
let approvalRelay: ApprovalRelay | undefined
// fix-2 worktree 发送拦截补撤销缝（装配段赋值——shutdownTree 关停链消费）
let revokeWorktreeSendGuard: (() => void) | undefined

/**
 * fix-18 ⑤：手机受限视图入口 cookie（/pair 与 /pair/verify 成功面 Set-Cookie）。官方
 * BrowserAuth 对携 token 的 GET / 铸会话 cookie 后 303 重定向到 "./"——查询串（含产品
 * forgeRemote=1 分支位）被结构性剥除，手机落地桌面版；第一方 cookie 跨重定向存活，
 * web 入口（main.ts isRestrictedRemoteViewCookie）据此分流受限移动视图。Host-only +
 * 30 天（手机书签重开仍落手机版——产品预期形态）。
 */
const REMOTE_VIEW_COOKIE = 'dswf_forge_remote=1; Path=/; Max-Age=2592000; SameSite=Lax'
// fix-22 诊断日志面：cookie 属性描述（日志行用——不携值本体之外的敏感面）
const REMOTE_VIEW_COOKIE_DESC = 'dswf_forge_remote=1(Path=/;Max-Age=2592000;SameSite=Lax)'
process.on('disconnect', () => {
  // fix-36：拒绝面补 catch——shutdown 链 reject 不落 unhandled rejection（仅记日志；
  // 5s 强退升级若也已失效，孤儿回收归 OS 进程树清理，不再额外改退出码）
  if (shutdownTree !== undefined) {
    void shutdownTree().catch((error: unknown) => {
      console.error('[boot-child] shutdown 关停失败', error)
    })
  } else process.exit(0)
})

/**
 * 手机远程暴露开关装配期读数（fix-3）：直读 forge-settings.json 顶层 remoteApproval.enabled
 * （严格 === true 才开——畸形值 = 关；文件缺席/读失败 = 关 fail-soft）。只读不建文件不抛
 * （装配期失败不阻 boot——远程暴露缺省回环形制）。
 */
function remoteApprovalEnabledOf(settingsFile: string | undefined): boolean {
  if (settingsFile === undefined) return false
  try {
    const parsed: unknown = JSON.parse(readFileSync(settingsFile, 'utf8'))
    const section = (parsed as Record<string, unknown> | null)?.['remoteApproval']
    return (section as Record<string, unknown> | undefined)?.['enabled'] === true
  } catch {
    return false
  }
}

/**
 * dsh-desktop cloudflared 种子候选（userData/bin——main.js:22502 `join(app.getPath
 * ("userData"), "bin")`；二进制名 win32=cloudflared.exe 其余=cloudflared，:578）。仅作字节
 * 来源：sha256 对 pin 清单校验一致才拷贝进产品缓存；缺席环境（无 APPDATA/HOME、未装
 * dsh-desktop）= 空候选，纯下载链自洽。平台化：win=APPDATA，darwin/linux=Electron
 * appData 锚（见函数体）。
 */
export function officialCloudflaredSeedCandidates(): string[] {
  // Electron appData 锚（main.js:22502 join(app.getPath('userData'), 'bin')）：
  // win=%APPDATA%、darwin=~/Library/Application Support、linux=~/.config
  if (process.platform === 'win32') {
    const roaming = process.env['APPDATA']
    if (roaming === undefined || roaming === '') return []
    return [`${roaming.replace(/[\\/]+$/, '')}\\dsh-desktop\\bin\\cloudflared.exe`]
  }
  const home = process.env['HOME']
  if (home === undefined || home === '') return []
  const appData =
    process.platform === 'darwin'
      ? `${home}/Library/Application Support`
      : `${home}/.config`
  return [`${appData}/dsh-desktop/bin/cloudflared`]
}

/**
 * dsh-mobile-tunnel 隧道层 node 依赖面装配（TunnelDeps 全真实实现——下载/哈希/缓存/
 * 子进程/stdout 逐行捕获；外部依赖面单点收口归隧道层，此处只装配不实现语义）。
 */
function createNodeTunnelDeps(): TunnelDeps {
  return {
    fetch: async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer()),
    sha256: (data) => createHash('sha256').update(data).digest('hex'),
    fs: {
      exists: (path) => existsSync(path),
      readFile: (path) => readFile(path),
      writeFile: (path, data) => writeFile(path, data),
      mkdir: async (path) => {
        await mkdir(path, { recursive: true })
      },
      chmod: (path, mode) => chmod(path, mode),
    },
    tmpDir: () => tmpdir(),
    spawn: (command, args) => {
      const child = nodeSpawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
      // bug 3c98e297：URL 行在 stderr（cloudflared 实测 stdout 零行）——双流合并句柄
      return createChildProcessHandle(child)
    },
    now: Date.now,
    sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  }
}

/**
 * fix-30 ③：durable PIN 持久缝文件实现（本机文件 = dsh-home 根 remote-pin.json，0600 +
 * tmp/rename 原子换新；读写失败 fail-soft = 回内存语义，不阻配对面装配）。官方语义锚
 * main.js:1138/1140-1143——长效密码保存在本机，断开不动；断开/隧道路径零触碰（无重置调用）。
 */
function createFilePinPersist(file: string): PinPersist {
  return {
    load: () => {
      try {
        const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
        const pin = (parsed as Record<string, unknown> | null)?.['pin']
        const durable = (parsed as Record<string, unknown> | null)?.['durable']
        if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) return undefined
        return { pin, durable: durable === true }
      } catch {
        return undefined // 文件缺席/畸形 = 无长效态（fail-soft）
      }
    },
    save: (state) => {
      const tmp = `${file}.tmp`
      try {
        writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 })
        renameSync(tmp, file)
      } catch {
        // 持久面写失败不阻配对面——durable 退回 worker 内存语义
      }
    },
  }
}

async function main(): Promise<void> {
  const options = parseChildOptions(process.argv)
  if (options === undefined) {
    send({ type: 'fatal', message: 'boot child：argv[2] 缺席/非法 BootDshOptions JSON（spawn 约定见 run.ts）' })
    process.exitCode = 1
    return
  }
  const { dshAppBoot, runProfile } = await loadBootChain(options.profileDir)
  const profile = dshAppBoot.loadProfileDirectory('dsh', options.profileDir, options.installAnchor)
  dshAppBoot.reportSkippedBundles('dsh', profile)
  // 产品插件行 config 装配期注入（用户层之后应用的 patchFiles 叠层——见 overlay.ts 动机）
  // M3 3.7 预设装配：三底稿（presets/）+ 双技能目录物化锚入同一 overlay——预设行每启
  // 注行产品工件（customSkillDirs 物化当形态绝对路径）；底稿缺席 fail-soft 不注行。
  // 产品裁决（2026-10-09）：skillsDir 仅作预设 customSkillDirs[core] 物化锚——无全局
  // skill-filesystem 行（forge 技能/工具仅预设组合，标准模式零 forge 面）。
  const presetPatches = loadPresetPatches()
  // mobile-remote-approval fix-3（重启生效形态）：手机远程暴露开关 = 产品自有配置
  // forge-settings.json 的 remoteApproval.enabled（官方 remote.settings 无 webserver 可写
  // 命名空间且拒绝运行期 rebind——开关写产品配置，宿主装配期读之决定绑定，下次启动生效）。
  // 直读文件（core forgeSettings 服务尚未装配——本进程 runProfile 之前唯一读缝）；文件
  // 缺席/畸形 = 未开启（fail-soft 默认回环形制）。
  const remoteExpose = remoteApprovalEnabledOf(options.settingsFile)
  // 1.7 git-worktree 插件行注行门（overlay 与装配段共用单源——插件在 profile 树才装载+注入）。
  // 2026-10-18 打包启动崩 fix：探测改双形态（dev profile 树 ∪ installAnchor 邻接树——
  // productPackagePresent）。旧口径单探 profileDir/node_modules，而打包形态 profile 目录无
  // node_modules（anchor = {resources}/runtime/package.json 邻接拓扑）→ 包已 staging 也恒
  // false：不注行 + 装配段跳过 = 能力恒 absent，git 项目 W2 fail-closed 双入口拒绝。
  const gitWorktreeRow = productPackagePresent(options.profileDir, options.installAnchor, '@dsh-forge/git-worktree')
  // bug 2ffb0a82：knowledge 插件装载位（与 overlay 注行门同源单值——child 侧唯一探测点，
  // ready 消息上送 renderer 知识面门控；dev 树在场 true / 打包形态暂不含 false）
  const knowledgeRow = existsSync(join(options.profileDir, 'node_modules', '@dsh-forge', 'knowledge', 'package.json'))
  const overlayPath = writeBootOverlay(join(dirname(options.stateDb), 'boot-overlay.yml'), {
    stateDb: options.stateDb,
    bindingsFile: options.bindingsFile,
    tasksHome: options.tasksHome, // 3.4 M2 派生根（缺席 = core 四域降级——P1 面零变化）
    settingsFile: options.settingsFile, // M3 3.8 设置域存储（缺席 = forgeSettings 服务降级缺席）
    knowledgeRow, // 知识库插件行注行门（dev 树在场才注——打包形态暂不含该插件）
    gitWorktreeRow, // 1.7 git-worktree 插件行注行门（dev 树 link 在场才注——打包形态暂不含该插件）
    credentialsPath: options.credentialsPath, // fix-26 凭据桥（隔离态 undefined 不桥）
    remoteExpose, // fix-3 装配期绑定暴露缝（true = webserver 行覆写全卡绑定——重启生效）
    port: options.port, // fix-3 webserver 覆写行 port 字面量单源（boot 实参）
    ...(presetPatches !== undefined
      ? {
          presets: {
            ...presetPatches,
            coreSkillsDir: options.skillsDir, // customSkillDirs[core]（plugin-forge skills 同源）
            specSkillsDir: options.specSkillsDir, // customSkillDirs[spec]（缺席 = spec 技能面降级）
            blitzSkillsDir: options.blitzSkillsDir, // customSkillDirs[blitz]（缺席 = blitz 技能面降级）
            bindingsFile: options.bindingsFile, // fix-1/drift #9：预设行内产品行 config 物化（与全局行同值单源）
          },
        }
      : {}),
  })
  const { ctx, shutdown: processShutdown } = await runProfile({
    environment: dshAppBoot.loadLayeredEnv('dsh'),
    profile: 'dsh-forge',
    resolvedProfile: { profile, installAnchor: options.installAnchor },
    patchFiles: [overlayPath, ...extraPatchFiles(process.env)],
    args: ['--no-open', '--port', String(options.port)],
  })
  const url = ctx.connection.authenticatedUrl(`http://127.0.0.1:${ctx.webServer.port}`)
  // app-observability 1.2：诊断事件域 child 半边接线——
  //   ① relay：ctx 'diag/log' 事件 → 结构化 JSON 行经桥 diag 消息回 main（main 转译入
  //      appender 单源；ALS trace_id 在订阅回调内同步读入行负载）。
  //   ② ALS 单实例：prompt 拦截 trace 包裹 + bridge rpc 复原共用（链 B 进程内贯穿）。
  //   ③ fail-open 计数：拦截层降级放行每笔落诊断事件（UI 零呈现——方案 9）。
  const diagAls = createDiagContextStore()
  relayDiagOverBridge(ctx, (line) => send({ type: 'diag', line }), diagAls)
  const failOpenDiag = (line: string): void => {
    diag(line) // 既有 harness.log 链保留（双轨兼容——评审 Note-2）
    try {
      emitDiag(ctx, { level: 'warn', process: 'child', event: 'fail-open', message: line })
    } catch {
      // 诊断面异常不反压拦截层（红线①同构）
    }
  }
  // 网关折叠点落栈（方案 3——官方缝 wrap，官方包零改制）：typertGateway 服务惰性解析
  // （cordis Service 激活晚于本装配段可达——250ms 轮询，60s 放弃；形状不符 = 零挂接 fail-soft）。
  {
    let foldAttached = false
    const attachFold = (): void => {
      if (foldAttached) return
      let gateway: GatewayFoldFace | undefined
      try {
        gateway = (ctx as unknown as { get(name: string): unknown }).get('typertGateway') as GatewayFoldFace | undefined
      } catch {
        gateway = undefined
      }
      if (
        gateway === undefined ||
        typeof (gateway as Record<string, unknown>)['prepareInvocation'] !== 'function' ||
        typeof (gateway as Record<string, unknown>)['invokePrepared'] !== 'function'
      ) {
        return
      }
      foldAttached = true
      attachGatewayFoldDiag(
        gateway,
        (error, phase) => {
        try {
          const err = error as Error | undefined
          emitDiag(ctx, {
            level: 'error',
            process: 'child',
            event: 'gateway-fold',
            message: `[gateway/${phase}] ${String(err?.message ?? error)}`,
            stack: err?.stack,
          })
        } catch {
          // 诊断面异常不反压网关（红线①同构）
        }
      }, { causeStack: isDevProfile(process.env) }) // dev 生境错误回包 details 附原始栈（fix-1 方案 6）
      diag('[diag] 网关折叠点挂接完成（typertGateway wrap——gateway/internal 类错误原始栈落日志）')
    }
    const foldGate = setInterval(attachFold, 250)
    foldGate.unref?.()
    setTimeout(() => {
      clearInterval(foldGate)
      attachFold()
    }, 60_000).unref?.()
    attachFold()
  }
  // 1.32 /api 非回环拦截（connection/request waterfall 硬化）：remoteExpose（fix-3 行覆写
  // 0.0.0.0）使 /api 面 LAN 可达——官方围栏自动信任 IP 字面量 Host + 会话 cookie 明文可嗅。
  // 官方多听者插槽 `connection/request`（dsh-client-connection README「Browser authentication
  // and request trust」节，桌面安装锁同缝先例；勿用 registerInterceptor 单槽——组合内已有
  // 占用风险）：时序 = 官方 admit（围栏 + 认证）之后、body 之前——围栏 403 与本拦截双保险
  // （trustedHosts/隧道域被围栏放行的非回环形态由本面恒定 403 收口）。回环 → next() 放行，
  // 桌面 /api 零影响；/__rpc、/remote、/pair 走 webserver 具名路由不经此 waterfall，不受扰。
  try {
    ctx.on('connection/request', apiLoopbackGuardListener(diag))
  } catch {
    // 监听器注册失败 = 拦截面缺席（围栏仍在），boot 不受阻——fail-soft 同 /pair 缝先例
  }
  // fix-25：cordis 服务解析窄面（/remote/__rpc 端点惰性取 forgeTasks/forgeProjects 只读切片）
  const servicesFace = ctx as unknown as ServiceGetFace
  // fix-2：worktree RPC 域服务（gitWorktree 行在场时装配段构造——见下方装配块）
  let worktreeRpcService: WorktreeRpcService | undefined
  // worktree-branch-management 1.7 扩展点注入装配：插件行在 profile 树时，把归并实现 +
  // worktree_dir 提供者注入插件缝服务（函数值扩展点不可经 YAML config 承载——cordis ctx
  // 服务面唯一跨插件缝；插件惰性 reflect.get 消费，激活早于本 provide 不受阻）。
  // forgeProjects 缺席 / provide 失败 = 零注入 fail-soft（插件退默认实现 = 独立 worktree 模式）。
  // 1.7 扩展点注入装配（见上）+ fix-2 装配缺口承接（同门单源）：
  //   ① forgeWorktree 桥服务——worktree RPC 通道域本体（ipc/worktree-rpc 透传插件域 ops
  //      + 挂靠事件唯一写入口 + 建会话 meta.cwd 注入 + 封存判定快照）；gitWorktree 能力
  //      服务惰性取法（在场性探测后台收口——provide 晚于本装配段可达）。
  //   ② 发送拦截——assertSendable 接入 host 消息处理链（sessionController.prompt/
  //      updateQueue 前置封存校验，封存会话 host 拒绝 + 明确错误提示——「不可发送」硬保证）。
  //   缺席/失败 = 零装配 fail-soft（通道未注册、拦截不接线——宿主不受影响）。
  if (gitWorktreeRow) {
    try {
      const forgeProjects = servicesFace.get('forgeProjects') as
        | Pick<ProjectService, 'listProjects' | 'getProject'>
        | undefined
      const provide = (
        ctx as unknown as { reflect?: { provide?: (name: string, value?: unknown) => unknown } }
      ).reflect?.provide
      if (forgeProjects !== undefined && typeof provide === 'function') {
        provide.call(
          (ctx as unknown as { reflect: object }).reflect,
          GIT_WORKTREE_IDENTITY_SERVICE,
          createWorktreeIdentity(forgeProjects, undefined, (line) => diag(line)),
        )
      } else {
        diag('[git-worktree] forgeProjects 缺席或 reflect.provide 不可用——扩展点零注入（插件退独立模式）')
      }
    } catch (cause) {
      diag(`[git-worktree] 扩展点注入失败（插件退独立模式，宿主不受影响）：${String(cause)}`)
    }
    try {
      // W2 缺席拒绝面判定源：60s 能力轮询放弃路径盖 'absent'（注入 createWorktreeRpcService
      // ——sessionCreate/prompt 两入口据此判定是否跑 core git 探针显式拒绝）。
      let worktreeGuardState: 'absent' | undefined
      // fix-4 具名消费（AGENTS.md Cordis 具名服务取法裁决）：gitWorktree 能力服务经模块
      // 扩充的具名属性取（类型面 = @dsh-forge/git-worktree declare module 扩充——type-only
      // import 官方包裁决同径）；运行期存在性检查承担 fail-soft（provide 异步晚于本装配段
      // 可达——惰性取法；具名访问在服务缺席时由 ctx proxy 抛错 → catch 降级独立模式）。
      let capabilitySeen = false
      const getGitWorktree = (): unknown => {
        try {
          const capability: unknown = ctx.gitWorktree
          if (capability !== undefined && capability !== null && !capabilitySeen) {
            capabilitySeen = true
            diag('[git-worktree] gitWorktree 能力服务已解析（具名消费）')
          }
          return capability ?? undefined
        } catch {
          return undefined // 服务未 provide（探测未收口/插件未装载）——独立模式面
        }
      }
      // fix-4 解析留痕：装配 8s 后仍缺席 → diag 留痕（harness.log 可见——插件行未装载/
      // git 缺席/provide 失败三态共因收口，不再静默恒独立模式）
      setTimeout(() => {
        if (!capabilitySeen) {
          diag('[git-worktree] gitWorktree 能力服务未解析（插件未装载/git 缺席/provide 失败）——worktree RPC 恒独立模式')
        }
      }, 8_000).unref?.()
      const sessionController = servicesFace.get('sessionController') as SessionControllerFace | undefined
      const sessionPersistence = servicesFace.get('sessionPersistence') as SessionPersistenceFace | undefined
      // bug 925c96d5：官方 workspaceRegistry 惰性取法（具名 ctx 属性 + 运行期存在性检查
      // ——AGENTS.md Cordis 可选具名服务取法裁决同径）；缺席 = 零归属面降级（宿主不受影响）。
      const getWorkspaceRegistry = (): unknown => {
        try {
          const registry: unknown = (ctx as unknown as { workspaceRegistry?: unknown }).workspaceRegistry
          return registry ?? undefined
        } catch {
          return undefined // 服务未装载（旧环境/插件行缺席）——零归属面
        }
      }
      const worktreeRpc: WorktreeRpcService = createWorktreeRpcService({
        gitWorktree: getGitWorktree as never,
        guardState: () => worktreeGuardState,
        sessionController,
        sessionPersistence,
        workspaceRegistry: getWorkspaceRegistry as never,
        // 绑定表失效锚（worktree 集合变化 + 树首次挂会话——含外部裸建树首次使用）：
        // 全量现算重写 knowledge-bindings.json（boot/registerProject 两锚之外的第三锚，
        // 消费端 knowledge 插件/forge 工具路由零改动）。服务缺席 = 零刷新 fail-soft。
        // bug 9eb9d6cb 后续性能收口：带 worktreePath 的调用（预铸挂会话——每次新会话点击）
        // 先查绑定行在册，在册即跳过（省 N×git worktree list + 文件重写，~百 ms/点击）；
        // 缺席（新树首次使用/建删树无路径）才全量刷新。读失败 = 现状全量刷新（fail-soft）。
        onWorktreeSetChanged: async (worktreePath?: string) => {
          let projects: Pick<ProjectService, 'listProjects'> | undefined
          try {
            projects = servicesFace.get('forgeProjects') as Pick<ProjectService, 'listProjects'> | undefined
          } catch {
            projects = undefined
          }
          if (projects === undefined) return
          if (worktreePath !== undefined) {
            try {
              const { readFileSync } = await import('node:fs')
              const raw = readFileSync(options.bindingsFile, 'utf8')
              const parsed = JSON.parse(raw) as { projects?: readonly { wsPath?: unknown }[] }
              const normalized = worktreePath.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()
              const present = (parsed.projects ?? []).some(
                (row) =>
                  typeof row.wsPath === 'string' &&
                  row.wsPath.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase() === normalized,
              )
              if (present) return // 绑定行已在册——锚目的（首次入表）已达成，零刷新
            } catch {
              // 读失败（首建/损坏）→ 落全量刷新现状
            }
          }
          await refreshKnowledgeBindings(projects, options.bindingsFile, (line) => diag(line))
        },
        // 权限补钉锚（bug e5059ee1——机制正本 docs/conventions/session-permission-presets.md）：
        // adopt = resume 既有日志 → 官方恢复链补 end-seed → permission 钉档走「已种子化」
        // 分支按组合缺省落档，绕过 defaultPreset（设置>通用>权限）。官方正缝修正：live
        // session 上经 permissionPresets.set（UI 选择器同径公共 API）补钉解析后的用户缺省
        // 档；服务/会话缺席、已同档或 custom = no-op fail-soft。
        onSessionAdopted: async (sessionId: string) => {
          let presets: unknown
          let sessions: unknown
          try {
            presets = servicesFace.get('permissionPresets')
            sessions = servicesFace.get('sessions')
          } catch {
            return
          }
          const face = presets as
            | {
                readonly defaultPreset: string
                current(session: unknown): string
                set(session: unknown, name: string): void
              }
            | undefined
          const store = sessions as { get(id: string): unknown } | undefined
          if (face === undefined || store === undefined) return
          const session = store.get(sessionId)
          if (session === undefined) return
          const target = face.defaultPreset
          if (target === 'custom' || face.current(session) === target) return
          face.set(session, target)
        },
        // bug eae18b5c：官方 agentPresets registry 惰性取法（可选具名服务同径）——
        // resolve(undefined) = 当前默认 preset（composeAgent 同源）；缺席 = 头缺席零猜测。
        resolveDefaultPreset: async () => {
          let presets: unknown
          try {
            presets = (ctx as unknown as { agentPresets?: unknown }).agentPresets
          } catch {
            return undefined
          }
          const resolve = (presets as { resolve?: (id?: string) => Promise<{ id: string }> } | undefined)?.resolve
          if (typeof resolve !== 'function') return undefined
          return (await resolve.call(presets, undefined)).id
        },
        warn: (line) => diag(line),
        // app-observability fix-3：拦截链派生失败（judge 判读链 fail-open）诊断 emit 缝——
        // failOpenDiag = diag 双轨 + emitDiag（ALS 上下文内被调 → 行带链 B trace_id）。
        failOpenDiag,
      })
      worktreeRpcService = worktreeRpc

      // G7① wrap 装配门（1.30）：拦截 wrap 只在 gitWorktree 能力解析成功后装配——git 缺席
      // 宿主零 wrap、零每消息开销（非介入面零固定税）。能力 provide 异步晚于本装配段可达：
      // 轮询探测，60s 仍未解析 = 放弃（保持零 wrap，diag 留痕）。
      let sendGuardInstalled = false
      const installSendGuard = (): void => {
        if (sendGuardInstalled) return
        sendGuardInstalled = true
        if (sessionController === undefined) {
          diag('[git-worktree] sessionController 缺席——发送拦截未接线（封存硬保证降级）')
          return
        }
        const disposers: Array<() => void> = []
        // W4 装载自证留底：wrap 前的官方 prompt 引用（换芯判读基准）
        const promptBefore = (sessionController as unknown as Record<string, unknown>)['prompt']
        disposers.push(
          interceptSessionSends(sessionController, (sessionId) => worktreeRpc.seal({ sessionId }), failOpenDiag),
        )
        // 1.30 第二层必绑拦截（A2/G2 拒绝 + 编排重路由；A5 cwd 漂移拒绝）——叠加封存层之上
        const guard = worktreeRpc.requiredBindingGuard()
        if (guard !== undefined) {
          // app-observability 1.2 链 B：prompt dispatch 入口生成 trace_id + ALS 包裹整链
          const traceSpan: PromptTraceSpan = {
            next: () => newTraceIdChild(),
            run: <T,>(traceId: string, sessionId: string | undefined, fn: () => Promise<T>): Promise<T> =>
              runWithDiagContext(diagAls, { traceId, sessionId }, fn),
          }
          disposers.push(interceptRequiredBinding(sessionController, guard, failOpenDiag, traceSpan))
        } else {
          diag('[git-worktree] 必绑拦截 guard 缺席（sessionPersistence 缺席）——仅封存层接线')
        }
        revokeWorktreeSendGuard = () => {
          for (const dispose of disposers) {
            try {
              dispose()
            } catch {
              // 拦截撤销失败不阻关停链
            }
          }
        }
        // W4 装载自证（session-binding-guarantee §W4）：wrap 换芯读回——controller.prompt 已换
        // （≠ 装配前留底）+ 必绑 guard 非空；任一不满足 = 发送拦截静默残缺 → fail-loud 上抛
        // （不静默降级为无拦截宿主）。
        verifySendGuardInstalled(sessionController, { promptBefore, guardPresent: guard !== undefined })
      }
      const wrapGate = setInterval(() => {
        if (getGitWorktree() !== undefined) {
          clearInterval(wrapGate)
          installSendGuard()
        }
      }, 250)
      wrapGate.unref?.()
      setTimeout(() => {
        clearInterval(wrapGate)
        if (!sendGuardInstalled) {
          // W2 能力缺席 fail-closed 收口：盖缺席状态位 + 接线拒绝面（judge/sessionCreate
          // 入口对 git 项目显式拒绝；非 git 探针 null 走官方原流零差异）。能力在场路径
          // （wrapGate 命中先行安装）零改动。
          worktreeGuardState = 'absent'
          diag('[git-worktree] gitWorktree 能力未解析（60s 放弃）——guardState 盖 absent，缺席拒绝面接线')
          installSendGuard()
        }
      }, 60_000).unref?.()
    } catch (cause) {
      diag(`[git-worktree] forgeWorktree 服务装配失败（RPC/拦截零装配，宿主不受影响）：${String(cause)}`)
    }
  }
  // fix-3：实际绑定 host（快照面单源——UI pending/listening 判读 = 产品配置意图 × 本值；
  // 经 ready 消息 → boot manifest 透传 renderer）
  const remoteHost = ctx.webServer.host
  // fix-5 官方配对地址：真宿主载体为自定 scheme（页面 location.hostname 非可达地址）——
  // 全卡绑定实况下由宿主构造 authenticatedUrl（LAN IPv4 + 端口 + Host 令牌）作 UI QR/
  // 地址行单源；回环绑定 / 无局域网 IPv4 = 缺席（UI 空态回退，不自造地址）。
  const lanIpv4 = lanIpv4Of(Object.values(networkInterfaces()))
  // fix-6 路线 B（用户裁决 2026-10-14）：官方 /pair 配对协议缝——替代 fix-5 的 host 认证
  // URL 直通。语义逐位对照官方 LanMobileBridge（DSH Desktop 0.10.0 闭源壳 bundle，npm 零
  // 可复用组件）：签发 randomBytes(32) base64url token、TTL 整 5min、timingSafeEqual 恒时
  // 校验；扫码 GET /pair?token= 校验通过 → 302 官方认证 URL（ctx.connection.
  // authenticatedUrl）→ 官方 BrowserAuth 铸 HttpOnly SameSite=Strict 会话 cookie（官方
  // dsh_mobile 同语义——会话 cookie 归官方既有机制，产品零自持）。轮换：签发器惰性过期 +
  // 每 TTL 定时强推 pair 消息（run.ts 刷新 manifest——桌面 QR 倒计时到期重取即得新 token）。
  // 全卡绑定 × 局域网 IPv4 在场才启用；回环绑定 / 无 LAN = 缺席（UI 空态回退，不自造地址）。
  const issuer = createPairingIssuer()
  // dsh-mobile-tunnel：PIN 层（官方 /pair/verify 同位扩展——隧道模式手机输入 6 位 PIN 换
  // 会话；签发/校验/限速/TTL 全语义在 pairing.ts 纯逻辑面，此处只装配路由）。
  // fix-30 ③：durable 态持久化到 dsh-home（跨 boot worker 存活——断开/重启不动长效）。
  const pinIssuer = createPinIssuer(Date.now, createFilePinPersist(join(dirname(options.stateDb), 'remote-pin.json')))
  // mobile-ui 1.11 PSK v3 host 侧装配（tunnel-psk v3.1 §3/§5）：密钥文件（0600——remote-pin
  // 同型缝）+ 水位账本（持久化——host 重启防重放窗）+ epoch TTL 清理。门未配置（密钥文件
  // 缺席）= 旧门语义过渡期；PIN 读法逐请求取——PIN 轮换 = 通信密钥重派生即旧密文作废。
  const pskFile = join(dirname(options.stateDb), 'remote-psk.json')
  const pskWatermarkFile = join(dirname(options.stateDb), 'remote-psk-watermarks.json')
  const pskWatermarks = loadWatermarks(pskWatermarkFile)
  setInterval(() => {
    pskWatermarks.sweep(Date.now())
    saveWatermarks(pskWatermarkFile, pskWatermarks)
  }, 60_000).unref?.()
  const pskGate: PskGateDeps = {
    load: () => loadPskPersist(pskFile),
    pin: () => pinIssuer.current().pin,
    watermarks: pskWatermarks,
    now: Date.now,
  }
  // 1.107 装配期 ensure 单源（tunnel-psk v3.1）：无持久化 → 生成并落盘（新钥 + 新签名钥对）；
  // 有 → 原样加载。IO 失败 fail-soft——门未配置 = 旧门语义过渡期，boot 不受阻。
  try {
    ensurePskPersist(pskFile)
  } catch (cause) {
    diag(`[pair-diag] remote-psk ensure 失败（门未配置降级——旧门语义）：${String(cause)}`)
  }
  // fix-31 bug df86240d：长效位自持久态回读（Root cause: pinDurable 模块变量默认 false 且
  // ready 恒发临时面——重启后 issuer 虽回读文件恢复长效 grant，manifest 长效位仍恒 false
  // + remotePinExpiresAt = 假 TTL，UI 重启/重开恒未勾选 = 用户视角「长效被取消」）。
  pinDurable = pinIssuer.isDurable()
  const pairPort = ctx.webServer.port
  const pairGrant = issuer.current()
  // fix-17 ③：PIN 签发读数（与 token 同刻度 5min——ready/轮换随 manifest 透传 UI PIN 卡）
  const pinGrant = pinIssuer.current()
  let currentPairToken = pairGrant.token // dsh-mobile-tunnel：隧道 URL 换签锚（随轮换换新）
  let remotePairUrl: string | undefined
  if (remoteHost === '0.0.0.0' && lanIpv4 !== undefined) {
    try {
      ctx.webServer.register({
        kind: 'exact',
        path: '/pair',
        handler: (req, res) => {
          // fix-16：authority 尊重请求 Host 头（官方 main.js:1489 同形）——隧道域 → https；
          // 回环/LAN 本身/缺席 → 回退构造 LAN 权威 + http（零开放重定向：authority 仅取自本次请求 Host）
          const { origin } = pairRedirectOf(req.headers.host, lanIpv4, pairPort)
          const token =
            new URL(req.url ?? '/', origin).searchParams.get('token') ?? ''
          const tokenOk = issuer.verify(token)
          // fix-22 诊断日志面①：握手决策链（token 校验读数——手机扫码一次全链可回放）
          diag(`[pair-diag] /pair host=${JSON.stringify(req.headers.host ?? '')} tokenVerify=${tokenOk ? 'pass' : 'fail'}`)
          if (!tokenOk) {
            res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
            res.end('配对二维码已过期——请在桌面端重新扫码')
            return
          }
          // fix-28（bug 1025e719 安全级）：隧道 Host（公网可达）token 通过后不直接 302 落地
          // ——呈官方 renderPairingPinPage 同位 PIN 输入页，/pair/verify（TTL/限速既有）
          // 通过才铸会话（第二因子强制）；LAN Host（同网段信任，官方同形）保持直连 302。
          // Root cause: /pair 对隧道域 token 校验通过即 302 authenticatedUrl——隧道 URL 任何
          // 持有者绕过 PIN 直接入受限视图，PIN 第二因子在隧道模式失效。
          if (tokenOk && isTunnelHost(req.headers.host, lanIpv4)) {
            diag(`[pair-diag] /pair tunnel host → PIN page（第二因子强制）`)
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
            res.end(renderPairingPinPage())
            return
          }
          // fix-7：握手成功 → 主侧抬 manifest remoteDeviceConnected（粘性位——UI「手机已
          // 连接」态卡单源；guard 路径外发，重复扫码重复发亦幂等）
          send({ type: 'pair-connected' })
          // 302 移动面入口（fix-22 真机修复 bug cbb9131e）：authenticatedUrl 包住 /remote/——
          // token 认证语义经官方 BrowserAuth 保持（authorizeIndex 只认 GET /，/remote/ 携
          // token 到达 → 302 官方根交换；官方 303 "/" 后 tapIndex 弹射脚本跳回 /remote/）。
          // dswf_forge_remote cookie 跨重定向存活，产品 bundle 内 viaCookie 命中受限视图。
          const target = ctx.connection.authenticatedUrl(`${origin}${REMOTE_VIEW_MOUNT}/`)
          // fix-22 诊断日志面①：302 目标（token 脱敏）+ 签发 cookie 属性（不含敏感值）
          diag(`[pair-diag] /pair ok → 302 ${redactTokenQuery(target)} set-cookie ${REMOTE_VIEW_COOKIE_DESC}`)
          res.writeHead(302, { location: target, 'set-cookie': REMOTE_VIEW_COOKIE })
          res.end()
        },
      })
      // fix-22 诊断日志面③（fix-23 改造：POST /forge-remote-log + admit 鉴权 → GET /__rvdiag
      // 只读上报端点——beacon 在手机落地任何认证态都可达，鉴权信箱是落地诊断的盲区）。
      // 受限单页 web 入口（main.ts）落地判定经 GET /__rvdiag?line=… fire-and-forget 上报；
      // 载荷经 sanitizeLogLine 消毒 → harness.log（diag 桥）。只读：不碰任何状态、不掷 Cookie。
      ctx.webServer.register({
        kind: 'exact',
        path: '/__rvdiag',
        handler: (req, res) => {
          const raw = new URL(req.url ?? '/', 'http://diag.invalid').searchParams.get('line') ?? ''
          diag(`[pair-diag] web-entry ${sanitizeLogLine(raw)}`)
          res.writeHead(204)
          res.end()
        },
      })
      // fix-22 真机修复（bug cbb9131e 架构级根因：产品 dist 仅经 dsh-forge://app 自定义协议
      // 在主窗分发——webServer 面 fallback 服务的是官方 web 前端，手机 302 链落地「桌面版」
      // 实为官方工作台，beacon 零到达）。①/remote 前缀路由 = webserver 移动面静态服务产品
      // dist（mobile-ui 1.7 AD-3：dist 根改指 apps/mobile/dist——resolveMobileDistDir 局部
      // 装配单源，共享 resolveWebDistDir 主窗语义不动；桌面 web-app 产物不再进 /remote/）；
      // ②官方 index tapIndex 弹射（dswf cookie 在场 → /remote/——根交换落 "/" 后的唯一合缝
      // 跳转点，不改写官方面行为）；③入口 HTML no-store（防手机端缓存旧态）；
      // ④dist 缺席 fail-soft 降级提示页（AD-5——bridge.renderRemoteDistMissingPage + diag）。
      const webDistRoot = resolveMobileDistDir({
        ...process.env,
        ...(options.resourcesDir !== undefined && options.resourcesDir !== ''
          ? { DSH_FORGE_RESOURCES_DIR: options.resourcesDir }
          : {}),
      })
      ctx.webServer.register({
        kind: 'prefix',
        path: REMOTE_VIEW_MOUNT,
        handler: (req, res) => {
          const method = req.method ?? 'GET'
          const requestUrl = req.url ?? '/'
          // 携 token 到达 = 认证交换腿——官方 authorizeIndex 只认 GET /，302 回官方根交换
          // （无效 token 由官方 401 面；本路由不自行验证 launch token——认证语义零自持）
          let token: string | null = null
          try {
            token = new URL(requestUrl, 'http://dsh.invalid').searchParams.get('token')
          } catch {
            token = null
          }
          if (token !== null && token !== '') {
            let origin = `http://${lanIpv4}:${pairPort}`
            try {
              origin = pairRedirectOf(req.headers.host, lanIpv4, pairPort).origin
            } catch {
              // Host 头畸形 → 回退 LAN 权威（pairRedirectOf 本身不抛，防御面）
            }
            const exchangeTarget = ctx.connection.authenticatedUrl(`${origin}/?forgeRemote=1`)
            diag(`[pair-diag] /remote token → 302 ${redactTokenQuery(exchangeTarget)}`)
            res.writeHead(302, { location: exchangeTarget, 'cache-control': 'no-store' })
            res.end()
            return
          }
          // mobile-ui connection 探针：官方注入行的 combo URL 是文档相对路径（plugins/??…，
          // 官方根挂载下解析为 /plugins）——/remote/ 挂载下浏览器解析为 /remote/plugins/…。
          // 302 弹回官方根组合路由（client-modules Node half 的既有服务面，零新服务逻辑；
          // 同 origin cookie 全随）。
          if (requestUrl.startsWith(`${REMOTE_VIEW_MOUNT}/plugins/`)) {
            res.writeHead(302, { location: requestUrl.slice(REMOTE_VIEW_MOUNT.length), 'cache-control': 'no-store' })
            res.end()
            return
          }
          // 官方 client http transport 以文档相对 URL 发单呼（`${channel}/${endpoint}`.slice(1)
          // ——/remote/ 挂载下解析为 /remote/api/…）。307 保方法重定向回官方 /api 通道
          // （302 会把 POST 降级为 GET——信封体丢失）；同 origin cookie 全随。
          if (requestUrl.startsWith(`${REMOTE_VIEW_MOUNT}/api/`)) {
            res.writeHead(307, { location: requestUrl.slice(REMOTE_VIEW_MOUNT.length), 'cache-control': 'no-store' })
            res.end()
            return
          }
          // fix-25 webserver HTTP RPC 桥分诊（POST /remote/__rpc——受限只读 + 审批端点：
          // progress = listTasks/taskStats 装配只读、projects/list = 项目上下文只读、
          // approval = 决策转发——与 forge:remote/* 通道同语义。鉴权 = 会话 cookie 在场
          // 才可达（官方 BrowserAuth 会话，未配对官方 401/403）；请求经 diag 落 harness.log）
          if (isRemoteHttpRpcRequest(method, requestUrl)) {
            void handleRemoteHttpRpc(req, res, {
              // bug 7d26b074：getter 走 lazyCordisService 守卫——cordis 解析抛错 = undefined
              // 降级（handler 内 fail-soft 错误信封语义），不因 getter 异常升级成 handler 抛错
              get tasks() {
                return lazyCordisService(servicesFace, 'forgeTasks') as RemoteChannelService | undefined
              },
              get projects() {
                return lazyCordisService(servicesFace, 'forgeProjects') as Pick<ProjectService, 'listProjects' | 'getProject'> | undefined
              },
              forwardApproval: (input) =>
                approvalRelay?.deposit(input) ?? Promise.resolve({ forwarded: false, reason: 'unavailable' as const }),
              // mobile-ui 1.11 forge:proxy/* 代理通道族装配（官方能力 in-process 直调——
              // 控制器/commands/userQuestions 惰性取法 + 运行期存在性检查承担 fail-soft；
              // worktrees = worktreeRpc 桥单源；disconnect = pair-disconnected 对偶缝）
              proxy: {
                get session() {
                  return lazyCordisService(servicesFace, 'sessionController') as ProxySessionFace | undefined
                },
                get commands() {
                  return lazyCordisService(servicesFace, 'commands') as ProxyCommandsFace | undefined
                },
                get userQuestions() {
                  return lazyCordisService(servicesFace, 'userQuestions') as ProxyUserQuestionsFace | undefined
                },
                get agentPresets() {
                  return lazyCordisService(servicesFace, 'agentPresets') as { remoteExportList?(): Promise<unknown> } | undefined
                },
                get projects() {
                  return servicesFace.get('forgeProjects') as Pick<ProjectService, 'listProjects' | 'getProject'> | undefined
                },
                get worktrees() {
                  return worktreeRpcService === undefined
                    ? undefined
                    : { list: (request: { readonly projectRoot: string }) => worktreeRpcService!.list(request) }
                },
                disconnect: () => send({ type: 'pair-disconnected' }),
              },
              // PSK 准入门（隧道域强制位——门未配置 = 旧门语义过渡期）
              psk: pskGate,
              // fix-27 bug b9bfb9d3：__rpc 门 = 官方 authorizeIndex 优先 + dswf_forge_remote
              // cookie 自持兜底（配对握手已认证语义；官方会话门仅用于 GET 页面——隧道域下
              // 手机 POST 被官方 Host 绑定会话门拒绝，真断点由 401 诊断行真机定位）
              authorize: (rq, rs) => authorizeRemoteRpc(rq, rs, (q, s) => ctx.connection.authorizeIndex(q as Parameters<typeof ctx.connection.authorizeIndex>[0], s as Parameters<typeof ctx.connection.authorizeIndex>[1])),
              diag,
            })
            return
          }
          // mobile-ui 1.11 加密 forge-stream SSE（tunnel-psk v3 §4.1——事件镜像逐帧推送；
          // 隧道域 + PSK 配置在场 = 逐帧 AEAD + host 签名（sid/epoch 经查询串注册），
          // LAN/回环 = 明文镜像旧门语义。缺席订阅名 fail-soft 零装配）
          if (isForgeStreamRequest(method, requestUrl)) {
            const tunnelDomain = isPskEnforcedHost(typeof req.headers.host === 'string' ? req.headers.host : undefined)
            const pskOn = loadPskPersist(pskFile) !== undefined
            let sealer: ((event: unknown) => string) | undefined
            if (tunnelDomain && pskOn) {
              let sid = ''
              let epoch = 0
              try {
                const query = new URL(requestUrl, 'http://dsh.invalid').searchParams
                sid = query.get('sid') ?? ''
                const epochRaw = Number(query.get('epoch') ?? '')
                epoch = Number.isInteger(epochRaw) && epochRaw >= 0 ? epochRaw : -1
              } catch {
                sid = ''
              }
              sealer = sid !== '' && epoch >= 0 ? createStreamSealer(pskGate, sid, epoch) : undefined
              if (sealer === undefined) {
                // 隧道域强制位：无有效封帧参数 = 统一 401（零明文降级路径）
                writeConstant401(res)
                return
              }
            }
            createForgeStreamHandler({
              subscribe: (push) =>
                subscribeOfficialEvents(
                  (name, handler) =>
                    (ctx as unknown as { on?: (event: string, h: (payload: unknown) => void) => unknown }).on?.(name, handler),
                  push,
                  diag,
                ),
              seal: (event) => (sealer !== undefined ? sealer(event) : JSON.stringify(event)),
              diag,
            })(req, res)
            return
          }
          // 会话门 = 官方 authorizeIndex（cookie 认证语义全归官方 BrowserAuth——零自持；
          // 已认证 = true 且不拥有响应，未认证 = 官方 401 面已写毕）
          if (!ctx.connection.authorizeIndex(req, res)) return
          if (!['GET', 'HEAD'].includes(method)) {
            res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' })
            res.end()
            return
          }
          const rel = remoteViewFilePathOf(requestUrl)
          if (rel === undefined) {
            res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
            res.end()
            return
          }
          const target = join(webDistRoot, rel)
          if (!target.startsWith(webDistRoot + sep)) {
            res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
            res.end()
            return
          }
          readFile(target)
            .then(async (body) => {
              const isIndex = rel === 'index.html'
              const ext = target.slice(target.lastIndexOf('.'))
              // mobile-ui connection 探针（R9 证伪续作）：index 响应注入官方结构化行
              // （ModuleLoader facade + client bundle 组合脚本 + __DSH_BOOT__ 图）——与官方
              // frontend-static 同缝。用 renderIndexInjections（官方导出纯函数）而非
              // renderIndex：tapIndex 弹射（dswf cookie → location.replace('/remote/')）
              // 对移动面自身是自跳环（探针 netLog ⇄ nav 实证），弹射终点 = 本页，跳过。
              const out = isIndex
                ? renderIndexInjections(body.toString('utf8'), ctx.webServer.collectIndexInjections())
                : body
              // mobile-ui 1.11 静态资源签名头（tunnel-psk v3.1 §4.5——X-Forge-Sig 覆盖
              // path‖body，mobile 动态资源验签后才执行；PSK 未配置 = 钥未生成 → 头缺席）
              const pskShape = loadPskPersist(pskFile)
              const sigHeaders = pskShape !== undefined ? staticSignatureHeaders(pskShape.signing, `/${rel}`, out) : undefined
              res.writeHead(200, {
                'content-type': MIME[ext] ?? 'application/octet-stream',
                // 入口 HTML no-store（④）；hash 命名资产默认缓存（content-type 已按扩展名钉）
                ...(isIndex ? { 'cache-control': 'no-store' } : {}),
                ...sigHeaders,
              })
              res.end(method === 'HEAD' ? undefined : out)
            })
            .catch((error: unknown) => {
              if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
                // mobile-ui 1.7 AD-5：index 缺席 = mobile dist 未构建——fail-soft 提示页
                // （含诊断行，diag 落 harness.log）；非 index 资产缺席保持 404 既有语义。
                if (rel === 'index.html') {
                  diag(`[pair-diag] /remote mobile dist 缺席 root=${webDistRoot} → fail-soft 提示页`)
                  res.writeHead(503, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
                  res.end(method === 'HEAD' ? undefined : renderRemoteDistMissingPage(webDistRoot))
                  return
                }
                res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
                res.end()
                return
              }
              res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
              res.end()
            })
        },
      })
      // ②官方 index 弹射注入（tapIndex 由官方 fallback owner 在每次 index 渲染时应用——
      // dsh-host-webserver 契约面；非 dswf cookie 访客官方面行为零变化）
      ctx.webServer.tapIndex(remoteViewIndexTap)
      // dsh-mobile-tunnel：/pair/verify（官方锚 :1199-1215/:1231-1234 同语义）——POST
      // {pin}（JSON body；query ?pin= 兜底）→ PIN 正确 = 同 /pair 成功语义（pair-connected
      // + 302 官方认证 URL）；错误/超时失效/限速锁定 = 403。限速状态机归 pinIssuer。
      ctx.webServer.register({
        kind: 'exact',
        path: '/pair/verify',
        handler: (req, res) => {
          const chunks: Buffer[] = []
          req.on('data', (chunk: Buffer) => chunks.push(chunk))
          req.on('end', () => {
            // fix-16：同 /pair——authority 尊重请求 Host 头 + scheme 按到达域判定
            const { origin } = pairRedirectOf(req.headers.host, lanIpv4, pairPort)
            const queryPin = new URL(req.url ?? '/', origin).searchParams.get('pin') ?? ''
            // fix-28 bug cad43954：解析单源 pinOfSubmission——query 优先 → JSON → urlencoded
            // 表单体（renderPairingPinPage 原生 form POST 即 urlencoded；畸形 = 空串不抛）
            const pin = pinOfSubmission(queryPin, Buffer.concat(chunks).toString('utf8'))
            const pinOk = pinIssuer.verify(pin)
            // fix-22 诊断日志面②：PIN 校验读数（不携 pin 值本体）
            diag(`[pair-diag] /pair/verify host=${JSON.stringify(req.headers.host ?? '')} pinVerify=${pinOk ? 'pass' : 'fail'}`)
            if (!pinOk) {
              // fix-29：403 页内反馈（同族错误卡替代裸 text/plain——状态语义不变）
              res.writeHead(403, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
              res.end(renderPairingPinErrorPage())
              return
            }
            send({ type: 'pair-connected' }) // fix-7 同语义：握手成功粘性位（幂等）
            // fix-10 bug 3620685f：PIN 认证成功同 /pair 语义——落地受限移动视图（不落完整工作台）
            // fix-22 真机修复：302 目标同 /pair——authenticatedUrl 包住 /remote/ 移动面入口。
            const target = ctx.connection.authenticatedUrl(`${origin}${REMOTE_VIEW_MOUNT}/`)
            // fix-22 诊断日志面②：同 /pair——302 目标（脱敏）+ cookie 属性
            diag(`[pair-diag] /pair/verify ok → 302 ${redactTokenQuery(target)} set-cookie ${REMOTE_VIEW_COOKIE_DESC}`)
            res.writeHead(302, { location: target, 'set-cookie': REMOTE_VIEW_COOKIE })
            res.end()
          })
        },
      })
      remotePairUrl = remotePairUrlOf(lanIpv4, pairPort, pairGrant.token)
      // dsh-mobile-tunnel：隧道管理器装配（互联网连接模式——隧道 URL 与 LAN remotePairUrl
      // 并存同一 /pair 缝）。TunnelManager 状态事件 → tunnel 消息推送（run.ts 原位重建
      // manifest 隧道面：激活/换线即换新，关闭/失效即撤除——WiFi 面不受影响）；token 轮换
      // → 隧道 URL 换签重推（Pinggy TTL 读数随 pair 旋转刷新——fix-7 pair 通道同形态）。
      let tunnelManager: TunnelManager | undefined
      const sendTunnelState = (state: TunnelState | undefined): void => {
        if (state === undefined) {
          send({ type: 'tunnel' }) // 零载荷 = 关闭/失效撤除面
          return
        }
        if (state.remainingTtlMs === 0) {
          // fix-19 ⑦（Root cause：remainingTtlMs===0 唯一来源 = TunnelManager 自动兜底双链路
          // 皆败的死亡 emit——即官方 :1188 unexpectedlyClosed 语义）：意外死亡撤面事件携位，
          // UI 一次性守卫（reopeningDeadPinggy 形态）据此自动重开隧道。
          send({
            type: 'tunnel',
            tunnelUrl: tunnelPairUrlOf(state.url, currentPairToken),
            tunnelProvider: state.provider,
            unexpectedlyClosed: true,
          })
          return
        }
        send({
          type: 'tunnel',
          tunnelUrl: tunnelPairUrlOf(state.url, currentPairToken),
          tunnelProvider: state.provider,
          ...(state.remainingTtlMs !== undefined
            ? { tunnelExpiresAt: Date.now() + state.remainingTtlMs }
            : {}),
        })
      }
      try {
        tunnelManager = new TunnelManager(createNodeTunnelDeps(), {
          localPort: pairPort,
          // bug be04ce95：dsh-desktop 已下载的 cloudflared 作种子（sha256 对 pin 清单校验
          // 一致才拷贝进产品自身缓存——非运行期引用，用户无 dsh 时纯下载链自洽）
          externalSeeds: officialCloudflaredSeedCandidates(),
          // 韧性状态机诊断行（死亡原因/重试失败/双链皆败撤面）→ harness.log 既有链
          diag: (line) => diag(line),
        })
        tunnelManager.onEvent(sendTunnelState)
        void tunnelManager
          .start()
          .then(() => diag(`[pair-diag] tunnel start ok（双链路任一建立成功）`))
          .catch((cause) => {
            diag(`[pair-diag] tunnel start 失败（双链路皆败 → 撤面）：${cause instanceof Error ? cause.message : String(cause)}`)
            sendTunnelState(undefined)
          })
      } catch (cause) {
        tunnelManager = undefined // 装配失败 → 隧道面缺席（boot 不受阻，UI 空态回退）
        diag(`[pair-diag] tunnel manager 装配失败：${cause instanceof Error ? cause.message : String(cause)}`)
      }
      tunnelStop = () => (tunnelManager?.stop() ?? Promise.resolve())
      // fix-17 ②：tab 切换重连缝——隧道离线（无活动句柄）即触发建立；在线 = 重推当前
      // 状态（读数刷新面）。start/stop/fallback 语义全在 TunnelManager，此处只装配触发。
      tunnelToggle = () => {
        if (tunnelManager === undefined) {
          diag(`[pair-diag] tunnel toggle 落空：管理器未装配`)
          return
        }
        if (tunnelManager.state === undefined) {
          void tunnelManager.start().then(sendTunnelState).catch(() => sendTunnelState(undefined))
          return
        }
        sendTunnelState(tunnelManager.state)
      }
      // fix-18：显式换线缝——TunnelManager.fallback（停旧链起新链；状态事件/回推经
      // onEvent + then 双面送达，UI 遮罩随 switching 收敛）
      tunnelFallback = () => {
        if (tunnelManager === undefined) return
        void tunnelManager.fallback().then(sendTunnelState).catch(() => sendTunnelState(undefined))
      }
      // fix-26：pair 消息 PIN 面统一构造（durable = PIN + 长效位、零 TTL；临时 = PIN + TTL——
      // UI hint 双态单源：长效无倒计时、临时实时秒倒计时）
      const sendPairState = (tokenGrant: { token: string; expiresAt: number }, pinGrantNow: { pin: string; expiresAt: number }): void => {
        send({
          type: 'pair',
          remotePairUrl: remotePairUrlOf(lanIpv4, pairPort, tokenGrant.token),
          remotePairExpiresAt: tokenGrant.expiresAt,
          remotePin: pinGrantNow.pin,
          ...(pinDurable ? { remotePinDurable: true } : { remotePinExpiresAt: pinGrantNow.expiresAt }),
        })
      }
      // fix-18 + fix-26：PIN 重置缝——pinIssuer.rotate 换新 6 位 + 配对 token 轮换 + 隧道
      // 重连（⑥走查：重置/取消长效 → 断开隧道并刷新二维码——QR/URL 全量换新）+ pair 消息
      // 全量回推（官方 POST /desktop/pin/reset 新 PIN 回推超集：长效机制下 QR 同步换新）。
      pinRotate = () => {
        const rotated = pinIssuer.rotate()
        const rotatedToken = issuer.rotate()
        currentPairToken = rotatedToken.token
        // fix-26 ⑥：断开隧道重连（停旧链起新链——隧道面经 onEvent/then 双面换新回推）
        if (tunnelManager !== undefined) {
          void tunnelManager
            .stop()
            .then(() => tunnelManager?.start())
            .then(sendTunnelState)
            .catch(() => sendTunnelState(undefined))
        }
        sendPairState(rotatedToken, rotated)
      }
      // fix-26：长效密码开关（consent 开 = 冻结当前 PIN + pair 回推长效面；关 = 回临时 PIN
      // + pinRotate（⑥：断开隧道重连 + QR 全量换新））
      pinConsentToggle = (consent) => {
        pinDurable = consent
        pinIssuer.setDurable(consent)
        if (consent) {
          sendPairState({ token: currentPairToken, expiresAt: issuer.current().expiresAt }, pinIssuer.current())
        } else {
          pinRotate()
        }
      }
      const rotationTimer = setInterval(() => {
        const rotated = issuer.rotate()
        currentPairToken = rotated.token
        // fix-17 ③：PIN 随 token 同拍轮换（桌面 PIN 卡读数换新——官方 :1199-1215 TTL 5min 语义；
        // fix-26：长效态 pinIssuer.rotate 零换签——PIN 面保持 durable 位不携 TTL）
        const rotatedPin = pinIssuer.rotate()
        sendPairState(rotated, rotatedPin)
        sendTunnelState(tunnelManager?.state) // 隧道在场 → 换签 URL + TTL 读数重推（旋转更新）
      }, PAIRING_TTL_MS)
      rotationTimer.unref?.() // 轮换器不阻进程退出（shutdown 面归 ProcessShutdown 既有链）
    } catch {
      remotePairUrl = undefined // /pair 缝注册失败 → 配对面降级缺席（UI 空态回退），boot 不受阻
    }
  }
  const remotePairExpiresAt = remotePairUrl !== undefined ? pairGrant.expiresAt : undefined
  const injections = ctx.webServer.collectIndexInjections()
  // mobile-remote-approval fix-2：官方审批桥 worker 侧（ctx.approval 在场才建中继——
  // 运行期存在性检查承担 fail-soft；缺席 = approval ready 位 false，main 侧转发器不接线，
  // forge:remote/approval 保持 fail-soft unavailable）。fail-open 语义（用户裁决
  // 2026-10-14）：approval/request waterfall 应答监听器在手机决策未命中时透传 next()
  // 放行桌面工作台 answerer——global 注册使其在任意 agent scope 的 waterfall 可达。
  try {
    const approval = ctx.approval
    if (approval !== undefined && typeof approval === 'object') {
      const relay = createApprovalRelay()
      ctx.on(
        'approval/request',
        (_req, next) => approvalWaterfallAnswer(relay, next),
        { global: true },
      )
      approvalRelay = relay
    }
  } catch {
    approvalRelay = undefined // 官方审批服务缺席/监听器注册失败 → 桥面降级不接线
  }
  const services: Partial<Record<BridgeServiceName, object>> = {
    forgeProjects: (servicesFace.get('forgeProjects') as object | undefined) ?? undefined,
    forgeKnowledge: (servicesFace.get('forgeKnowledge') as object | undefined) ?? undefined,
    // M2 四域（Interface 1–4；tasksHome 缺席时 core 不 provide——在场位 false，main 侧降级）
    forgeTasks: (servicesFace.get('forgeTasks') as object | undefined) ?? undefined,
    forgeFeatures: (servicesFace.get('forgeFeatures') as object | undefined) ?? undefined,
    forgeProposals: (servicesFace.get('forgeProposals') as object | undefined) ?? undefined,
    forgeDocs: (servicesFace.get('forgeDocs') as object | undefined) ?? undefined,
    // M3 3.8 设置域（settingsFile 缺席时 core 不 provide——独立缝降级，六服务形制不动）
    forgeSettings: (servicesFace.get('forgeSettings') as object | undefined) ?? undefined,
    // fix-bug bug 域（tasksHome 注入时 core provide——缺席 = bugs 面降级）
    forgeBugs: (servicesFace.get('forgeBugs') as object | undefined) ?? undefined,
    // fix-2 worktree RPC 域（gitWorktree 插件行在场时装配段 provide——缺席 = 通道未注册）
    forgeWorktree: worktreeRpcService ?? undefined,
    // fix-2 审批桥（官方 ctx.approval 在场时 provide 内存中继——缺席 = 审批转发面降级）
    approval: approvalRelay,
    // 1.107 连接密钥三件套读数/轮换（桌面读数即显——PSK 明文不经 manifest 快照，
    // 读数缝单源 = remote-psk.json；轮换 = rotatePsk 再生成，旧钥宽限期 ≤5min 只验不密）
    remotePsk: {
      read: () => {
        const shape = loadPskPersist(pskFile)
        if (shape === undefined) return { configured: false }
        return { configured: true, ...pskTrioOf(shape), pinConfigured: true, pinDurable: pinIssuer.isDurable() }
      },
      rotate: () => {
        const rotated = rotatePsk(pskFile, loadPskPersist(pskFile), Date.now())
        return { configured: true, ...pskTrioOf(rotated.shape), pinConfigured: true, pinDurable: pinIssuer.isDurable() }
      },
    },
  }
  // 已注册 tool 名清单（3.4 冒烟观测面）：官方 ToolRuntime.schemas() 全局视图投影 name。
  // 读取失败 = 观测降级（tools 缺席），boot 本体不受阻——断言面由冒烟承载。
  const toolNames = toolNamesOf(servicesFace)
  send({
    type: 'ready',
    url,
    injections,
    remoteHost, // fix-3：实际绑定 host（装配期读 remoteApproval.enabled 的结果——UI 判读单源）
    ...(remotePairUrl !== undefined
      ? {
          remotePairUrl,
          remotePairExpiresAt, // fix-6：/pair?token= 形状 + TTL 读数（全卡绑定 × 局域网 IPv4 在场才透传）
          remotePin: pinGrant.pin, // fix-17 ③：6 位 PIN + TTL 读数（互联网 tab PIN 卡单源）
          // fix-31 bug df86240d：PIN 面双态与 pair 载荷同源（pinDurable 自持久态回读）——
          // 长效位携 remotePinDurable、零假 TTL；临时面才携 remotePinExpiresAt。
          ...(pinDurable
            ? { remotePinDurable: true as const }
            : { remotePinExpiresAt: pinGrant.expiresAt }),
        }
      : {}), // fix-5：官方配对地址（单源透传）
    services: {
      forgeProjects: services.forgeProjects !== undefined,
      forgeKnowledge: services.forgeKnowledge !== undefined,
      forgeTasks: services.forgeTasks !== undefined,
      forgeFeatures: services.forgeFeatures !== undefined,
      forgeProposals: services.forgeProposals !== undefined,
      forgeDocs: services.forgeDocs !== undefined,
      forgeSettings: services.forgeSettings !== undefined,
      forgeBugs: services.forgeBugs !== undefined,
      forgeWorktree: worktreeRpcService !== undefined,
      approval: services.approval !== undefined,
      remotePsk: services.remotePsk !== undefined,
    },
    ...(toolNames !== undefined ? { tools: toolNames } : {}),
    // bug 2ffb0a82：knowledge 插件装载位（renderer 知识 UI 面门控单源——见上方 knowledgeRow 注记）
    knowledgePlugin: knowledgeRow,
  })
  shutdownTree = async () => {
    try {
      revokeWorktreeSendGuard?.()
    } catch {
      // 拦截撤销失败不阻关停链
    }
    try {
      await tunnelStop()
    } catch {
      // 隧道停机失败不阻 boot 关停链（进程退出由 ProcessShutdown 既有链承担）
    }
    await processShutdown.shutdown(0)
  }
  handleMessage = (message) => {
    if (message?.type === 'shutdown') {
      void processShutdown.shutdown(0)
      return
    }
    if (message?.type === 'tunnel-toggle') {
      // fix-17 ②：tab 重连缝消费（见 tunnelToggle 装配注释）
      tunnelToggle()
      return
    }
    if (message?.type === 'tunnel-fallback') {
      // fix-18：显式换线缝消费（见 tunnelFallback 装配注释）
      tunnelFallback()
      return
    }
    if (message?.type === 'pin-reset') {
      // fix-18：PIN 重置缝消费（见 pinRotate 装配注释——fix-26 起兼隧道重连 + token 轮换）
      pinRotate()
      return
    }
    if (message?.type === 'pin-consent') {
      // fix-26：长效密码开关缝消费（官方 POST /desktop/pin/consent {consent} 同语义——见
      // pinConsentToggle 装配注释：开 = durable 冻结；关 = 回临时 PIN + 隧道重连/QR 换新）。
      pinConsentToggle(message.consent)
      return
    }
    if (message?.type === 'rpc') {
      void dispatchRpc(services, message, diagAls).then(send) // ALS 复原 main↔bridge 显式携带的 trace_id
    }
  }
}

main().catch((error: unknown) => {
  send({ type: 'fatal', message: String((error as Error)?.stack ?? error) })
  process.exitCode = 1
})
