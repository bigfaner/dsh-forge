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
// mobile-remote-approval fix-2：ctx.approval 具名服务类型（disc-1 配方——type-only import
// 官方包 + 运行期存在性检查承担 fail-soft；禁 ctx.reflect.get 丢类型取法）
import type {} from '@deepseek-ai/dsh-user-approval'
import { dirname, join } from 'node:path'
import { spawn as nodeSpawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
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
  redactTokenQuery,
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
import { PAIRING_TTL_MS, createPairingIssuer, createPinIssuer } from './pairing.js'
import { loadPresetPatches } from '../profile/presets.js'

/** cordis ctx 的服务解析窄面（reflect.provide 的逆查询；真 Context.get 结构兼容） */
interface ServiceGetFace {
  get(name: string): unknown
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

// 消息处理器换芯位：ready 面世前静默丢弃（主侧约定不先发——ready 收到前无 rpc/shutdown），
// boot 完成后置换为真处理器；listen 常驻不拆（消息零丢失窗）。
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
 * 来源：sha256 对 pin 清单校验一致才拷贝进产品缓存；缺席环境（无 APPDATA/未装 dsh）=
 * 空候选，纯下载链自洽。
 */
export function officialCloudflaredSeedCandidates(): string[] {
  const roaming = process.env['APPDATA']
  if (roaming === undefined || roaming === '') return []
  const bin = `${roaming.replace(/[\\/]+$/, '')}\\dsh-desktop\\bin`
  const name = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared'
  return [`${bin}\\${name}`]
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
  const overlayPath = writeBootOverlay(join(dirname(options.stateDb), 'boot-overlay.yml'), {
    stateDb: options.stateDb,
    bindingsFile: options.bindingsFile,
    tasksHome: options.tasksHome, // 3.4 M2 派生根（缺席 = core 四域降级——P1 面零变化）
    settingsFile: options.settingsFile, // M3 3.8 设置域存储（缺席 = forgeSettings 服务降级缺席）
    knowledgeRow: existsSync(join(options.profileDir, 'node_modules', '@dsh-forge', 'knowledge', 'package.json')), // 知识库插件行注行门（dev 树在场才注——打包形态暂不含该插件）
    credentialsPath: options.credentialsPath, // fix-26 凭据桥（隔离态 undefined 不桥）
    remoteExpose, // fix-3 装配期绑定暴露缝（true = webserver 行覆写全卡绑定——重启生效）
    port: options.port, // fix-3 webserver 覆写行 port 字面量单源（boot 实参）
    ...(presetPatches !== undefined
      ? {
          presets: {
            ...presetPatches,
            coreSkillsDir: options.skillsDir, // customSkillDirs[core]（plugin-forge skills 同源）
            specSkillsDir: options.specSkillsDir, // customSkillDirs[spec]（缺席 = spec 技能面降级）
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
  const pinIssuer = createPinIssuer()
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
          console.log(`[pair-diag] /pair host=${JSON.stringify(req.headers.host ?? '')} tokenVerify=${tokenOk ? 'pass' : 'fail'}`)
          if (!tokenOk) {
            res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
            res.end('配对二维码已过期——请在桌面端重新扫码')
            return
          }
          // fix-7：握手成功 → 主侧抬 manifest remoteDeviceConnected（粘性位——UI「手机已
          // 连接」态卡单源；guard 路径外发，重复扫码重复发亦幂等）
          send({ type: 'pair-connected' })
          // 302 官方认证 URL：launch token 兑现 → BrowserAuth 铸会话 cookie → 重定向进
          // 产品受限移动视图（fix-10 bug 3620685f：`?forgeRemote=1` 分支——不得落完整
          // 工作台；官方 BrowserAuth 对既有查询参数透明，认证参数追加重写不丢分支位）。
          // fix-18 ⑤：补 Set-Cookie——官方 authorizeIndex 303 "./" 会剥掉查询串，分支位
          // 经 cookie 跨重定向存活（根因见 REMOTE_VIEW_COOKIE 注）。
          const target = ctx.connection.authenticatedUrl(`${origin}/?forgeRemote=1`)
          // fix-22 诊断日志面①：302 目标（token 脱敏）+ 签发 cookie 属性（不含敏感值）
          console.log(`[pair-diag] /pair ok → 302 ${redactTokenQuery(target)} set-cookie ${REMOTE_VIEW_COOKIE_DESC}`)
          res.writeHead(302, { location: target, 'set-cookie': REMOTE_VIEW_COOKIE })
          res.end()
        },
      })
      // fix-22 诊断日志面③：BrowserAuth 兑现链观测信箱——受限单页 web 入口（main.ts）落地
      // 判定经 POST 回传一行消毒文本（鉴权走官方 admit 缝：dsh 会话 cookie 不在场 = 401，
      // 零绕过认证语义；体长 2KB 上限 + sanitizeLogLine 消毒 → 宿主日志文件）。
      ctx.webServer.register({
        kind: 'exact',
        path: '/forge-remote-log',
        handler: (req, res) => {
          const admission = ctx.connection.admit({ headers: req.headers })
          if ('rejection' in admission) {
            res.writeHead(admission.rejection)
            res.end()
            return
          }
          const chunks: Buffer[] = []
          let total = 0
          req.on('data', (chunk: Buffer) => {
            total += chunk.length
            if (total <= 2048) chunks.push(chunk)
          })
          req.on('end', () => {
            console.log(`[pair-diag] web-entry ${sanitizeLogLine(Buffer.concat(chunks).toString('utf8'))}`)
            res.writeHead(204)
            res.end()
          })
        },
      })
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
            let pin = new URL(req.url ?? '/', origin).searchParams.get('pin') ?? ''
            if (pin === '') {
              try {
                const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
                const raw = (body as Record<string, unknown> | null)?.['pin']
                if (typeof raw === 'string') pin = raw
              } catch {
                // 畸形 body → pin 保持空串（走 verify false 面）
              }
            }
            const pinOk = pinIssuer.verify(pin)
            // fix-22 诊断日志面②：PIN 校验读数（不携 pin 值本体）
            console.log(`[pair-diag] /pair/verify host=${JSON.stringify(req.headers.host ?? '')} pinVerify=${pinOk ? 'pass' : 'fail'}`)
            if (!pinOk) {
              res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
              res.end('PIN 错误、已过期或尝试过于频繁——请在桌面端获取最新 PIN')
              return
            }
            send({ type: 'pair-connected' }) // fix-7 同语义：握手成功粘性位（幂等）
            // fix-10 bug 3620685f：PIN 认证成功同 /pair 语义——落地受限移动视图（不落完整工作台）
            // fix-18 ⑤：同 /pair 补 Set-Cookie（官方 303 "./" 剥查询串——分支位走 cookie）
            const target = ctx.connection.authenticatedUrl(`${origin}/?forgeRemote=1`)
            // fix-22 诊断日志面②：同 /pair——302 目标（脱敏）+ cookie 属性
            console.log(`[pair-diag] /pair/verify ok → 302 ${redactTokenQuery(target)} set-cookie ${REMOTE_VIEW_COOKIE_DESC}`)
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
        })
        tunnelManager.onEvent(sendTunnelState)
        void tunnelManager.start().catch(() => sendTunnelState(undefined)) // 双链路皆不可用 → 撤除面
      } catch {
        tunnelManager = undefined // 装配失败 → 隧道面缺席（boot 不受阻，UI 空态回退）
      }
      tunnelStop = () => (tunnelManager?.stop() ?? Promise.resolve())
      // fix-17 ②：tab 切换重连缝——隧道离线（无活动句柄）即触发建立；在线 = 重推当前
      // 状态（读数刷新面）。start/stop/fallback 语义全在 TunnelManager，此处只装配触发。
      tunnelToggle = () => {
        if (tunnelManager === undefined) return
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
      // fix-18：PIN 重置缝——pinIssuer.rotate 换新 6 位并经 pair 消息回推（配对 token 面
      // 保留现值——官方 POST /desktop/pin/reset 仅换 PIN 全量回推同语义）。
      pinRotate = () => {
        const rotated = pinIssuer.rotate()
        const grant = issuer.current()
        send({
          type: 'pair',
          remotePairUrl: remotePairUrlOf(lanIpv4, pairPort, currentPairToken),
          remotePairExpiresAt: grant.expiresAt,
          remotePin: rotated.pin,
          remotePinExpiresAt: rotated.expiresAt,
        })
      }
      const rotationTimer = setInterval(() => {
        const rotated = issuer.rotate()
        currentPairToken = rotated.token
        // fix-17 ③：PIN 随 token 同拍轮换（桌面 PIN 卡读数换新——官方 :1199-1215 TTL 5min 语义）
        const rotatedPin = pinIssuer.rotate()
        send({
          type: 'pair',
          remotePairUrl: remotePairUrlOf(lanIpv4, pairPort, rotated.token),
          remotePairExpiresAt: rotated.expiresAt,
          remotePin: rotatedPin.pin,
          remotePinExpiresAt: rotatedPin.expiresAt,
        })
        sendTunnelState(tunnelManager?.state) // 隧道在场 → 换签 URL + TTL 读数重推（旋转更新）
      }, PAIRING_TTL_MS)
      rotationTimer.unref?.() // 轮换器不阻进程退出（shutdown 面归 ProcessShutdown 既有链）
    } catch {
      remotePairUrl = undefined // /pair 缝注册失败 → 配对面降级缺席（UI 空态回退），boot 不受阻
    }
  }
  const remotePairExpiresAt = remotePairUrl !== undefined ? pairGrant.expiresAt : undefined
  const injections = ctx.webServer.collectIndexInjections()
  const servicesFace = ctx as unknown as ServiceGetFace
  // mobile-remote-approval fix-2：官方审批桥 worker 侧（ctx.approval 在场才建中继——
  // 运行期存在性检查承担 fail-soft；缺席 = approval ready 位 false，main 侧转发器不接线，
  // forge:remote/approval 保持 fail-soft unavailable）。fail-open 语义（用户裁决
  // 2026-10-14）：approval/request waterfall 应答监听器在手机决策未命中时透传 next()
  // 放行桌面工作台 answerer——global 注册使其在任意 agent scope 的 waterfall 可达。
  let approvalRelay: ApprovalRelay | undefined
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
    // fix-2 审批桥（官方 ctx.approval 在场时 provide 内存中继——缺席 = 审批转发面降级）
    approval: approvalRelay,
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
          remotePinExpiresAt: pinGrant.expiresAt,
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
      approval: services.approval !== undefined,
    },
    ...(toolNames !== undefined ? { tools: toolNames } : {}),
  })
  shutdownTree = async () => {
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
      // fix-18：PIN 重置缝消费（见 pinRotate 装配注释）
      pinRotate()
      return
    }
    if (message?.type === 'rpc') {
      void dispatchRpc(services, message).then(send)
    }
  }
}

main().catch((error: unknown) => {
  send({ type: 'fatal', message: String((error as Error)?.stack ?? error) })
  process.exitCode = 1
})
